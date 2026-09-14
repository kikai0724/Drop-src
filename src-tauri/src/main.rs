
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use sysinfo::{Pid, System};
use tauri::Manager;
use tauri::Emitter;
use regex::Regex;
use reqwest;
use winapi::um::winnls::GetUserDefaultUILanguage;
use reqwest::header::{HeaderValue, CONTENT_LENGTH, RANGE};
use urlencoding;
use futures_util::StreamExt;
use serde::{Serialize, Deserialize};
use winapi::shared::minwindef::{FALSE, TRUE, BOOL, LPARAM};
use winapi::shared::windef::HWND;
use winapi::um::processthreadsapi::{CreateProcessW, ResumeThread, SuspendThread, TerminateProcess, CreateRemoteThread, OpenThread, OpenProcess, OpenProcessToken, GetCurrentProcess, PROCESS_INFORMATION, STARTUPINFOW};
use winapi::um::synchapi::WaitForSingleObject;
use winapi::um::memoryapi::{VirtualAllocEx, WriteProcessMemory};
use winapi::um::libloaderapi::{GetModuleHandleW, GetProcAddress};
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
use winapi::um::winbase::{CREATE_SUSPENDED, INFINITE};
use winapi::um::shellapi::ShellExecuteW;
use winapi::um::securitybaseapi::GetTokenInformation;
use winapi::um::winnt::{HANDLE, THREAD_SUSPEND_RESUME, MEM_COMMIT, MEM_RESERVE, PAGE_READWRITE, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation, PROCESS_SET_QUOTA, PROCESS_TERMINATE};
use winapi::um::jobapi2::{AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject};
use winapi::um::tlhelp32::{CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32};
use winapi::um::winuser::{EnumWindows, IsWindowVisible, GetWindowThreadProcessId};
use std::fs;
use std::path::PathBuf;
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::sync::Mutex;

mod discord_rpc;
use discord_rpc::{DiscordRpcState, discord_rpc_init, discord_rpc_set_activity, discord_rpc_clear_activity, discord_rpc_disconnect};
use std::collections::{HashMap, HashSet};
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct StoredToken {
    token: String,
    stored_at: u64,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct StoredCredentials {
    email: String,
    password: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct StoredRoleInfo {
    name: String,
    color: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct StoredUserProfile {
    username: String,
    #[serde(rename = "accountId")]
    account_id: String,
    email: String,
    #[serde(rename = "avatar_url")]
    avatar_url: String,
    #[serde(rename = "favoriteSkin", default)]
    favorite_skin: Option<String>,
    role: Option<StoredRoleInfo>,
    #[serde(default)]
    has_tester_role: bool,
    #[serde(default)]
    has_admin_role: bool,
    #[serde(default, rename = "roleId")]
    role_id: Option<String>,
    #[serde(default, rename = "discordId")]
    discord_id: Option<String>,
    #[serde(default, rename = "avatarHash")]
    avatar_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct LauncherSessionState {
    #[serde(default)]
    first_run_completed: bool,
    #[serde(default)]
    language: String,
    #[serde(default)]
    remember_me: bool,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    credentials: Option<StoredCredentials>,
    #[serde(default)]
    last_login_at: Option<String>,
    #[serde(default)]
    user_profile: Option<StoredUserProfile>,
    #[serde(default)]
    background_video_audio_enabled: bool,
}

#[derive(Debug, serde::Deserialize)]
struct DiscordRoleResponse {
    #[serde(rename = "accountId")]
    account_id: Option<String>,
    #[serde(rename = "discordId")]
    discord_id: Option<String>,
    #[serde(rename = "roleIds")]
    role_ids: Vec<String>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
struct ArenaPointsResponse {
    #[serde(rename = "accountId")]
    account_id: String,
    email: String,
    #[serde(rename = "arenaPoints")]
    arena_points: i32,
    #[serde(rename = "arenaHype")]
    arena_hype: i32,
    division: i32,
    message: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct RoleInfo {
    name: String,
    #[serde(deserialize_with = "color_to_hex_string")]
    color: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct UserInfo {
    username: String,
    #[serde(rename = "accountId")]
    account_id: String,
    email: String,
    password: String,
    #[serde(rename = "avatar_url")]
    avatar_url: String,
    #[serde(rename = "favoriteSkin")]
    favorite_skin: String,
    #[serde(rename = "MtxCurrency", default)]
    mtx_currency: String,
    #[serde(rename = "hype", default)]
    hype: String,
    role: RoleInfo,
    token_info: TokenInfo,
    #[serde(default, rename = "roleIds")]
    role_ids: Vec<String>,
    #[serde(default, rename = "roleBadge")]
    role_badge: Option<String>,
    #[serde(default)]
    has_tester_role: bool,
    #[serde(default)]
    has_admin_role: bool,
    #[serde(default, rename = "roleId")]
    role_id: Option<String>,
    #[serde(default, rename = "discordId")]
    discord_id: Option<String>,
    #[serde(default, rename = "avatarHash")]
    avatar_hash: Option<String>,
}

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

static FORTNITE_WINDOW_VISIBLE: AtomicBool = AtomicBool::new(false);
static WINDOW_TARGET_PID: AtomicU32 = AtomicU32::new(0);

unsafe extern "system" fn enum_visible_fortnite_windows(hwnd: HWND, _lparam: LPARAM) -> BOOL {
    let target_pid = WINDOW_TARGET_PID.load(Ordering::SeqCst);
    if target_pid == 0 {
        return TRUE;
    }

    let mut owner_pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut owner_pid);
    if owner_pid == target_pid && IsWindowVisible(hwnd) != 0 {
        FORTNITE_WINDOW_VISIBLE.store(true, Ordering::SeqCst);
        return FALSE;
    }

    TRUE
}

#[tauri::command]
async fn is_fortnite_window_visible() -> Result<bool, String> {
    let pid = CURRENT_GAME_PID.load(Ordering::SeqCst);
    if pid == 0 {
        return Ok(false);
    }

    FORTNITE_WINDOW_VISIBLE.store(false, Ordering::SeqCst);
    WINDOW_TARGET_PID.store(pid, Ordering::SeqCst);

    unsafe {
        let _ = EnumWindows(Some(enum_visible_fortnite_windows), 0);
    }

    Ok(FORTNITE_WINDOW_VISIBLE.load(Ordering::SeqCst))
}

fn forward_restore_to_existing_instance_if_needed() {
    let mut system = sysinfo::System::new_all();
    system.refresh_processes();
    let current_pid = std::process::id();

    for (pid, process) in system.processes() {
        if pid.as_u32() == current_pid {
            continue;
        }

        let name = process.name().to_lowercase();
        if name.contains("rift") || name.contains("rift.exe") || name.contains("drop") || name.contains("drop.exe") {
            let path = std::env::temp_dir().join("droplauncher_restore.txt");
            match File::create(&path) {
                Ok(mut f) => {
                    if let Err(e) = f.write_all(b"restore") {
                        println!("Failed to create restore signal: {}", e);
                    } else {
                        println!("Restoring existing hidden launcher via {:?}", path);
                    }
                }
                Err(e) => println!("Failed to create restore signal file: {}", e),
            }
            std::process::exit(0);
        }
    }
}

fn forward_deeplink_to_existing_instance_if_needed() {
    // If this process was started with a deep-link and another Drop.exe is already
    // running, write the deep-link URL to a temp file and exit so the existing
    // instance can pick it up and handle the login flow.
    let args: Vec<String> = std::env::args().collect();
    if args.len() <= 1 {
        return;
    }

    for arg in args.iter().skip(1) {
        if arg.to_lowercase().starts_with("droplauncher://") {
            // detect other running Drop process
            let mut system = sysinfo::System::new_all();
            system.refresh_processes();
            let current_pid = std::process::id();
            let mut found_existing = false;
            for (pid, process) in system.processes() {
                if pid.as_u32() == current_pid {
                    continue;
                }
                let name = process.name().to_lowercase();
                // Accept both legacy "Drop" and current "Rift" process names so
                // forwarded deep-links are handled by the already-running instance.
                if name.contains("rift") || name.contains("rift.exe") || name.contains("drop") || name.contains("drop.exe") {
                    found_existing = true;
                    break;
                }
            }

            if found_existing {
                let path = std::env::temp_dir().join("droplauncher_incoming.txt");
                match File::create(&path) {
                    Ok(mut f) => {
                        if let Err(e) = f.write_all(arg.as_bytes()) {
                            println!("Failed to forward deeplink to existing instance: {}", e);
                        } else {
                            println!("Forwarded deep link to existing instance via {:?}", path);
                        }
                    }
                    Err(e) => println!("Failed to create forward file: {}", e),
                }
                // exit so only the original instance remains
                std::process::exit(0);
            }
        }
    }
}

fn spawn_incoming_file_watcher(app_handle: tauri::AppHandle, window: tauri::WebviewWindow) {
    let incoming = std::env::temp_dir().join("droplauncher_incoming.txt");
    let restore = std::env::temp_dir().join("droplauncher_restore.txt");
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(300)).await;

            if restore.exists() {
                let _ = fs::remove_file(&restore);
                println!("Detected restored launcher request; showing hidden launcher window.");
                let _ = window.show();
                let _ = window.set_focus();
            }

            if incoming.exists() {
                match fs::read_to_string(&incoming) {
                    Ok(content) => {
                        let _ = fs::remove_file(&incoming);
                        let request = content.trim().to_string();
                        if !request.is_empty() {
                            println!("Detected incoming forwarded deep-link: {}", request);
                            // Reuse the same processing logic as the plugin handler by
                            // spawning an async task that mimics receiving the request.
                            let window_clone = window.clone();
                            let app_clone = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                let re = Regex::new(r"(?i)droplauncher://auth/?[?]launcherToken=(.+)").unwrap();
                                if let Some(captures) = re.captures(request.as_str()) {
                                    if let Some(result) = captures.get(1) {
                                        let token = urlencoding::decode(result.as_str())
                                            .unwrap_or_else(|_| result.as_str().to_string().into())
                                            .to_string();
                                        println!("Received forwarded launcher auth callback");

                                        if let Err(e) = store_token(&token, &app_clone) {
                                            println!("could not store auth token");
                                            println!("store_token error: {}", e);
                                        }

                                        window_clone.show().unwrap();
                                        window_clone.set_focus().unwrap();

                                        match decode_launcher_token(&token).await {
                                            Ok(user_info) => {
                                                if !user_info.has_tester_role && !user_info.has_admin_role {
                                                    window_clone.emit("login-error", "あなたはこのゲームをプレイする権限がありません。" ).unwrap();
                                                    return;
                                                }

                                                let _ = store_user_profile(&user_info);

                                                let payload = serde_json::json!({
                                                    "username": user_info.username,
                                                    "accountId": user_info.account_id,
                                                    "email": user_info.email,
                                                    "password": user_info.password,
                                                    "avatar_url": user_info.avatar_url,
                                                    "favoriteSkin": user_info.favorite_skin,
                                                    "mtxCurrency": user_info.mtx_currency,
                                                    "hype": user_info.hype,
                                                    "discordId": user_info.discord_id,
                                                    "avatarHash": user_info.avatar_hash,
                                                    "role": {
                                                        "name": user_info.role.name,
                                                        "color": user_info.role.color,
                                                        "badge": user_info.role_badge,
                                                        "hasTesterRole": user_info.has_tester_role,
                                                        "hasAdminRole": user_info.has_admin_role,
                                                        "roleId": user_info.role_id
                                                    },
                                                    "roleBadge": user_info.role_badge,
                                                    "hasTesterRole": user_info.has_tester_role,
                                                    "hasAdminRole": user_info.has_admin_role,
                                                    "roleId": user_info.role_id
                                                });

                                                window_clone.emit("login-success", payload).unwrap();
                                            }
                                            Err(e) => {
                                                println!("error decoding forwarded token: {}", e);
                                                window_clone.emit("login-error", "Token Authorization failed.").unwrap();
                                            }
                                        }
                                    }
                                } else if let Some(payload_value) = parse_login_payload_from_request(request.as_str()) {
                                    let payload = build_login_success_payload(&payload_value);
                                    println!("Parsed login payload from forwarded deep-link");
                                    window_clone.emit("login-success", payload).unwrap();
                                } else {
                                    window_clone.emit("login-error", "Login failed or unknown forwarded URL format").unwrap();
                                }
                            });
                        }
                    }
                    Err(e) => println!("Failed to read forwarded deeplink: {}", e),
                }
            }
        }
    });
}

struct DownloadCancel(Arc<AtomicBool>);

#[tauri::command]
fn clear_download_cancel(cancel: tauri::State<'_, DownloadCancel>) {
    cancel.0.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_download(cancel: tauri::State<'_, DownloadCancel>) {
    cancel.0.store(true, Ordering::SeqCst);
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
struct TokenInfo {
    expired: bool,
}

#[derive(Debug, Serialize)]
struct Event {
    id: i32,
    name: String,
    card_name: String,
    thumbnail: String,
    event_background: String,
    event_description: String,
    button_text: String,
    button_redirect_url: String,
    button_color: String,
    button_text_color: String,
    active: bool,
    audio_url: Option<String>,
    frame_text: String,
    #[serde(rename = "ButtonIco")]
    button_ico: Option<String>,
    #[serde(rename = "IcoColor")]
    ico_color: Option<String>,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    stage: String,
    percent: u8,
    message: String,
}

#[derive(Default)]
struct AppState {
    auth_code: Mutex<Option<String>>,
    login_data: Mutex<Option<UserInfo>>,
}

static CURRENT_GAME_PID: AtomicU32 = AtomicU32::new(0);
static LAUNCHER_PID: AtomicU32 = AtomicU32::new(0);
static GAME_JOB_HANDLES: Mutex<Vec<usize>> = Mutex::new(Vec::new());

fn attach_process_to_launcher_job(pid: u32) -> Result<(), String> {
    unsafe {
        let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if job.is_null() {
            return Err(format!("CreateJobObjectW failed: {}", io::Error::last_os_error()));
        }

        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &mut limits as *mut _ as *mut _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0 {
            CloseHandle(job);
            return Err(format!("SetInformationJobObject failed: {}", io::Error::last_os_error()));
        }

        let process = winapi::um::processthreadsapi::OpenProcess(
            PROCESS_SET_QUOTA | PROCESS_TERMINATE,
            FALSE,
            pid,
        );
        if process.is_null() {
            CloseHandle(job);
            return Err(format!("OpenProcess failed: {}", io::Error::last_os_error()));
        }

        let assigned = AssignProcessToJobObject(job, process) != 0;
        CloseHandle(process);
        if !assigned {
            CloseHandle(job);
            return Err(format!("AssignProcessToJobObject failed: {}", io::Error::last_os_error()));
        }

        GAME_JOB_HANDLES.lock().unwrap().push(job as usize);
        Ok(())
    }
}

fn close_game_job_handles() {
    let mut handles = GAME_JOB_HANDLES.lock().unwrap();
    for handle in handles.drain(..) {
        unsafe {
            CloseHandle(handle as HANDLE);
        }
    }
}

fn get_app_state() -> Arc<Mutex<AppState>> {
    Arc::new(Mutex::new(AppState::default()))
}

fn decode_base64_payload(input: &str) -> Option<String> {
    let sanitized = input.replace('-', "+").replace('_', "/");
    let padding = (4 - (sanitized.len() % 4)) % 4;
    let mut padded = sanitized;
    padded.push_str(&"=".repeat(padding));

    BASE64.decode(&padded).ok().and_then(|bytes| String::from_utf8(bytes).ok())
}

fn parse_token_payload(token: &str) -> Option<serde_json::Value> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(token) {
        return Some(value);
    }

    if let Ok(decoded) = urlencoding::decode(token) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&decoded) {
            return Some(value);
        }
    }

    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() == 3 {
        if let Some(payload) = decode_base64_payload(parts[1]) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
                return Some(value);
            }
        }
    }

    None
}

fn parse_login_payload_from_request(request: &str) -> Option<serde_json::Value> {
    fn parse_json_payload(value: serde_json::Value) -> Option<serde_json::Value> {
        fn object_has_login_keys(obj: &serde_json::Map<String, serde_json::Value>) -> bool {
            obj.contains_key("accountId")
                || obj.contains_key("account_id")
                || obj.contains_key("username")
                || obj.contains_key("userName")
                || obj.contains_key("email")
                || obj.contains_key("userEmail")
                || obj.contains_key("discordId")
                || obj.contains_key("discord_id")
                || obj.contains_key("password")
                || obj.contains_key("avatarIcon")
                || obj.contains_key("avatar_icon")
                || obj.contains_key("discordIconUrl")
                || obj.contains_key("avatarUrl")
                || obj.contains_key("avatar_url")
        }

        fn decode_json_string(value: &serde_json::Value) -> Option<serde_json::Value> {
            if let Some(s) = value.as_str() {
                let decoded = urlencoding::decode(s).ok()?.into_owned();
                serde_json::from_str::<serde_json::Value>(&decoded).ok()
            } else {
                None
            }
        }

        if let Some(obj) = value.as_object() {
            if object_has_login_keys(obj) {
                return Some(serde_json::Value::Object(obj.clone()));
            }

            for key in ["payload", "data", "user", "body", "result"] {
                if let Some(inner) = obj.get(key) {
                    if let Some(parsed) = decode_json_string(inner).or_else(|| inner.as_object().map(|_| inner.clone())) {
                        if let Some(inner_obj) = parsed.as_object() {
                            if object_has_login_keys(inner_obj) {
                                return Some(parsed);
                            }
                        }
                    }
                }
            }
        }

        None
    }

    fn parse_query_payload(query_pairs: &HashMap<String, String>) -> Option<serde_json::Value> {
        for key in ["payload", "data", "user", "body", "result"] {
            if let Some(value) = query_pairs.get(key) {
                let decoded = urlencoding::decode(value).ok()?.into_owned();
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&decoded) {
                    if let Some(parsed) = parse_json_payload(json_val) {
                        return Some(parsed);
                    }
                }
            }
        }
        None
    }

    fn has_login_query_keys(pairs: &HashMap<String, String>) -> bool {
        pairs.contains_key("accountId")
            || pairs.contains_key("account_id")
            || pairs.contains_key("username")
            || pairs.contains_key("userName")
            || pairs.contains_key("email")
            || pairs.contains_key("userEmail")
            || pairs.contains_key("discordId")
            || pairs.contains_key("discord_id")
            || pairs.contains_key("password")
            || pairs.contains_key("avatarIcon")
            || pairs.contains_key("avatar_icon")
            || pairs.contains_key("discordIconUrl")
            || pairs.contains_key("avatarUrl")
            || pairs.contains_key("avatar_url")
            || pairs.get("status").map(|s| s.as_str()) == Some("success")
    }

    let trimmed = request.trim();
    if trimmed.is_empty() {
        return None;
    }

    let decoded = urlencoding::decode(trimmed)
        .ok()
        .map(|s| s.into_owned())
        .unwrap_or_else(|| trimmed.to_string());

    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&decoded) {
        if let Some(parsed) = parse_json_payload(json_val) {
            return Some(parsed);
        }
    }

    let suffix = decoded
        .strip_prefix("droplauncher://auth")
        .or_else(|| decoded.strip_prefix("droplauncher://"))
        .unwrap_or(&decoded);

    let query_text = suffix.trim_start_matches('/').trim_start_matches('?').to_string();

    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&query_text) {
        if let Some(parsed) = parse_json_payload(json_val) {
            return Some(parsed);
        }
    }

    let mut pairs = serde_json::Map::new();
    for chunk in query_text.split('&') {
        if chunk.is_empty() {
            continue;
        }

        let (key, value) = match chunk.split_once('=') {
            Some((k, v)) => (k, v),
            None => (chunk, ""),
        };

        let decoded_key = urlencoding::decode(key)
            .ok()
            .map(|s| s.into_owned())
            .unwrap_or_else(|| key.to_string());
        let decoded_value = urlencoding::decode(value)
            .ok()
            .map(|s| s.into_owned())
            .unwrap_or_else(|| value.to_string());
        pairs.insert(decoded_key, serde_json::Value::String(decoded_value));
    }

    let query_pairs: HashMap<String, String> = pairs
        .iter()
        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
        .collect();

    if let Some(parsed) = parse_query_payload(&query_pairs) {
        return Some(parsed);
    }

    if has_login_query_keys(&query_pairs) {
        return Some(serde_json::Value::Object(pairs));
    }

    None
}

fn build_login_success_payload(source: &serde_json::Value) -> serde_json::Value {
    fn get_string_alias(source: &serde_json::Value, keys: &[&str]) -> Option<String> {
        for key in keys {
            if let Some(val) = source.get(*key) {
                if let Some(s) = val.as_str() {
                    if !s.trim().is_empty() {
                        return Some(s.to_string());
                    }
                }
            }
        }
        None
    }

    fn get_boolean_alias(source: &serde_json::Value, keys: &[&str]) -> bool {
        for key in keys {
            if let Some(val) = source.get(*key) {
                if let Some(b) = val.as_bool() {
                    return b;
                }
                if let Some(s) = val.as_str() {
                    if matches!(s.to_lowercase().as_str(), "true" | "1" | "yes") {
                        return true;
                    }
                }
            }
        }
        false
    }

    let username = get_string_alias(source, &["username", "userName", "name"]).unwrap_or_else(|| "Discord User".to_string());
    let account_id = get_string_alias(source, &["accountId", "account_id", "id"]).unwrap_or_else(|| "discord-user".to_string());
    let email = get_string_alias(source, &["email", "userEmail", "emailAddress", "email_address"]).unwrap_or_else(|| "discord@dropfn.com".to_string());
    let password = get_string_alias(source, &["password", "pass", "pwd"]).unwrap_or_else(|| "".to_string());

    let avatar_url = get_string_alias(source, &["discordIconUrl", "avatarIcon", "avatar_icon", "avatar_url", "avatarUrl", "avatar", "icon", "userIcon", "usericon", "profileImage", "profile_image", "imageUrl", "image_url"])
        .unwrap_or_else(|| String::new());
    let discord_id = get_string_alias(source, &["discordId", "discord_id"]);
    let avatar_hash = get_string_alias(source, &["avatarHash", "avatar_hash"]);

    let avatar_url = if avatar_url.is_empty() {
        if let (Some(did), Some(hash)) = (discord_id.as_deref(), avatar_hash.as_deref()) {
            format!("https://cdn.discordapp.com/avatars/{}/{}.png?size=1024", did, hash)
        } else if let Some(did) = discord_id.as_deref() {
            let fallback_index = match did.parse::<u64>() {
                Ok(value) => (value % 6).to_string(),
                Err(_) => "0".to_string(),
            };
            format!("https://cdn.discordapp.com/embed/avatars/{}.png", fallback_index)
        } else {
            String::new()
        }
    } else {
        avatar_url
    };

    let role_name = get_string_alias(source, &["role", "roleName", "role_name"])
        .or_else(|| source.get("role").and_then(|value| value.get("name")).and_then(|v| v.as_str().map(|s| s.to_string())))
        .unwrap_or_else(|| "User".to_string());
    let role_color = get_string_alias(source, &["roleColor", "role_color"])
        .or_else(|| source.get("role").and_then(|value| value.get("color")).and_then(|v| v.as_str().map(|s| s.to_string())))
        .unwrap_or_else(|| "#999999".to_string());
    let role_badge = get_string_alias(source, &["roleBadge", "role_badge"])
        .or_else(|| source.get("role").and_then(|value| value.get("badge")).and_then(|v| v.as_str().map(|s| s.to_string())));
    let has_tester_role = get_boolean_alias(source, &["hasTesterRole", "has_tester_role"])
        || source.get("role").and_then(|value| value.get("hasTesterRole")).and_then(|v| v.as_bool()).unwrap_or(false)
        || source.get("role").and_then(|value| value.get("has_tester_role")).and_then(|v| v.as_bool()).unwrap_or(false);
    let has_admin_role = get_boolean_alias(source, &["hasAdminRole", "has_admin_role"])
        || source.get("role").and_then(|value| value.get("hasAdminRole")).and_then(|v| v.as_bool()).unwrap_or(false)
        || source.get("role").and_then(|value| value.get("has_admin_role")).and_then(|v| v.as_bool()).unwrap_or(false);
    let role_id = get_string_alias(source, &["roleId", "role_id"])
        .or_else(|| source.get("role").and_then(|value| value.get("roleId")).and_then(|v| v.as_str().map(|s| s.to_string())))
        .or_else(|| source.get("role").and_then(|value| value.get("role_id")).and_then(|v| v.as_str().map(|s| s.to_string())));

    serde_json::json!({
        "username": username,
        "accountId": account_id,
        "email": email,
        "password": password,
        "avatar_url": avatar_url,
        "favoriteSkin": source.get("favoriteSkin").and_then(|v| v.as_str()).unwrap_or(""),
        "mtxCurrency": source.get("mtxCurrency").and_then(|v| v.as_str()).unwrap_or(""),
        "hype": source.get("hype").and_then(|v| v.as_str()).unwrap_or(""),
        "discordId": discord_id,
        "avatarHash": avatar_hash,
        "role": {
            "name": role_name,
            "color": role_color,
            "badge": role_badge,
            "hasTesterRole": has_tester_role,
            "hasAdminRole": has_admin_role,
            "roleId": role_id
        },
        "roleBadge": role_badge,
        "hasTesterRole": has_tester_role,
        "hasAdminRole": has_admin_role,
        "roleId": role_id
    })
}

async fn decode_launcher_token(token: &str) -> Result<UserInfo, Box<dyn std::error::Error>> {
    let payload = parse_token_payload(token).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "Failed to decode launcher token")
    })?;

    let role_value = payload.get("role").and_then(|value| value.as_object());
    let role_name = role_value
        .and_then(|role| role.get("name").and_then(|v| v.as_str()))
        .unwrap_or("User")
        .to_string();
    let role_color = role_value
        .and_then(|role| role.get("color").and_then(|v| v.as_str()))
        .unwrap_or("#999999")
        .to_string();

    let role_ids = payload
        .get("roleIds")
        .and_then(|value| value.as_array())
        .map(|values| {
            values.iter().filter_map(|value| value.as_str().map(|item| item.to_string())).collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let has_tester_role = role_ids.iter().any(|id| id == "1529489822044131448")
        || payload.get("hasTesterRole").and_then(|value| value.as_bool()).unwrap_or(false);
    let has_admin_role = role_ids.iter().any(|id| id == "1529805570671120444")
        || payload.get("hasAdminRole").and_then(|value| value.as_bool()).unwrap_or(false);

    let role_badge = if has_admin_role {
        Some("Admin".to_string())
    } else if has_tester_role {
        Some("Tester".to_string())
    } else {
        payload.get("roleBadge").and_then(|value| value.as_str()).map(|value| value.to_string())
    };

    let role_id = if has_admin_role {
        Some("1529805570671120444".to_string())
    } else if has_tester_role {
        Some("1529489822044131448".to_string())
    } else {
        payload.get("roleId").and_then(|value| value.as_str()).map(|value| value.to_string())
    };

    Ok(UserInfo {
        username: payload.get("username").and_then(|value| value.as_str()).unwrap_or("Discord User").to_string(),
        account_id: payload.get("accountId").and_then(|value| value.as_str()).unwrap_or("discord-user").to_string(),
        email: payload.get("email").and_then(|value| value.as_str()).unwrap_or("discord@dropfn.com").to_string(),
        password: payload.get("password").and_then(|value| value.as_str()).unwrap_or("").to_string(),
        avatar_url: payload.get("avatar_url").and_then(|value| value.as_str()).unwrap_or("").to_string(),
        favorite_skin: payload.get("favoriteSkin").and_then(|value| value.as_str()).unwrap_or("").to_string(),
        mtx_currency: payload.get("mtxCurrency").and_then(|value| value.as_str()).unwrap_or("").to_string(),
        hype: payload.get("hype").and_then(|value| value.as_str()).unwrap_or("").to_string(),
        role: RoleInfo {
            name: role_name,
            color: role_color,
        },
        token_info: TokenInfo { expired: false },
        role_ids,
        role_badge,
        has_tester_role,
        has_admin_role,
        role_id,
        discord_id: payload.get("discordId").and_then(|value| value.as_str()).map(|value| value.to_string()),
        avatar_hash: payload.get("avatarHash").and_then(|value| value.as_str()).map(|value| value.to_string()),
    })
}

#[tauri::command]
async fn fetch_events() -> Result<Vec<Event>, String> {
    // Return empty events list for now
    Ok(Vec::new())
}

fn get_launcher_storage_dir() -> Result<PathBuf, String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA is not available".to_string())?;
    Ok(Path::new(&local_app_data).join("Drop"))
}

fn launcher_state_path() -> Result<PathBuf, String> {
    Ok(drop_local_data_dir()?.join("launcher-state.json"))
}

fn read_launcher_session_state() -> Result<LauncherSessionState, String> {
    let path = launcher_state_path()?;
    if !path.exists() {
        return Ok(LauncherSessionState::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;

    if content.trim().is_empty() {
        return Ok(LauncherSessionState::default());
    }

    match serde_json::from_str::<LauncherSessionState>(&content) {
        Ok(state) => Ok(state),
        Err(_) => {
            let legacy = serde_json::from_str::<LauncherStartupState>(&content)
                .map(|legacy_state| LauncherSessionState {
                    first_run_completed: legacy_state.first_run_completed,
                    language: legacy_state.language,
                    ..Default::default()
                })
                .unwrap_or_default();
            Ok(legacy)
        }
    }
}

fn write_launcher_session_state(state: &LauncherSessionState) -> Result<(), String> {
    let path = launcher_state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create '{}': {}", parent.display(), e))?;
    }

    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize launcher session state: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write '{}': {}", path.display(), e))?;

    Ok(())
}

fn get_token_path(_app_handle: &tauri::AppHandle) -> PathBuf {
    launcher_state_path().unwrap_or_else(|_| std::env::temp_dir().join("launcher-state.json"))
}

fn store_token(token: &str, app_handle: &tauri::AppHandle) -> Result<(), String> {
    let mut state = read_launcher_session_state()?;
    state.token = Some(token.to_string());
    state.remember_me = true;
    state.last_login_at = Some(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string()));
    write_launcher_session_state(&state)?;

    let _ = app_handle;
    Ok(())
}

fn get_stored_token(_app_handle: &tauri::AppHandle) -> Option<String> {
    read_launcher_session_state().ok().and_then(|state| state.token)
}

#[tauri::command]
fn clear_stored_token(app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut state = read_launcher_session_state()?;
    state.token = None;
    state.remember_me = false;
    state.credentials = None;
    state.user_profile = None;
    state.last_login_at = None;
    write_launcher_session_state(&state)?;

    let _ = app_handle;
    Ok(())
}

#[tauri::command]
async fn check_stored_token(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let token_opt = get_stored_token(&app_handle);

    if let Some(token) = token_opt {
        match decode_launcher_token(&token).await {
            Ok(user_info) => {
                let _ = store_user_profile(&user_info);
                let token_info = serde_json::json!({ "expired": false });
                let user_json = serde_json::to_value(&user_info).unwrap_or(serde_json::json!(null));
                Ok(serde_json::json!({ "token": token, "token_info": token_info, "user": user_json }))
            }
            Err(_) => {
                Ok(serde_json::json!({ "token": token, "token_info": { "expired": true } }))
            }
        }
    } else {
        Ok(serde_json::json!({ "token": serde_json::Value::Null, "token_info": { "expired": true } }))
    }
}

fn get_credentials_path(_app_handle: &tauri::AppHandle) -> PathBuf {
    launcher_state_path().unwrap_or_else(|_| std::env::temp_dir().join("launcher-state.json"))
}

fn store_credentials(email: &str, password: &str, app_handle: &tauri::AppHandle) -> Result<(), String> {
    let mut state = read_launcher_session_state()?;
    state.credentials = Some(StoredCredentials {
        email: email.to_string(),
        password: password.to_string(),
    });
    state.remember_me = true;
    state.last_login_at = Some(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string()));
    write_launcher_session_state(&state)?;

    let _ = app_handle;
    Ok(())
}

fn store_user_profile(user_info: &UserInfo) -> Result<(), String> {
    let mut state = read_launcher_session_state()?;
    state.user_profile = Some(StoredUserProfile {
        username: user_info.username.clone(),
        account_id: user_info.account_id.clone(),
        email: user_info.email.clone(),
        avatar_url: user_info.avatar_url.clone(),
        favorite_skin: Some(user_info.favorite_skin.clone()),
        role: Some(StoredRoleInfo {
            name: user_info.role.name.clone(),
            color: user_info.role.color.clone(),
        }),
        has_tester_role: user_info.has_tester_role,
        has_admin_role: user_info.has_admin_role,
        role_id: user_info.role_id.clone(),
        discord_id: user_info.discord_id.clone(),
        avatar_hash: user_info.avatar_hash.clone(),
    });
    write_launcher_session_state(&state)?;
    Ok(())
}

fn get_stored_user_profile() -> Option<StoredUserProfile> {
    read_launcher_session_state().ok().and_then(|state| state.user_profile)
}

#[tauri::command]
async fn get_cached_user_profile() -> Option<StoredUserProfile> {
    get_stored_user_profile()
}

fn get_stored_credentials(_app_handle: &tauri::AppHandle) -> Option<StoredCredentials> {
    read_launcher_session_state().ok().and_then(|state| state.credentials)
}

#[tauri::command]
async fn check_stored_credentials(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let credentials = get_stored_credentials(&app_handle);
    Ok(serde_json::json!({
        "exists": credentials.is_some(),
        "email": credentials.as_ref().map(|c| c.email.clone()),
        "password": credentials.as_ref().map(|c| c.password.clone())
    }))
}

#[tauri::command]
fn save_credentials(email: String, password: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    store_credentials(&email, &password, &app_handle)
}

#[tauri::command]
fn clear_stored_credentials(app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut state = read_launcher_session_state()?;
    state.credentials = None;
    state.remember_me = state.token.is_some();
    if state.token.is_none() {
        state.remember_me = false;
    }
    write_launcher_session_state(&state)?;

    let _ = app_handle;
    Ok(())
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct VersionCheckResponse {
    #[serde(rename = "type")]
    update_type: String,
    message: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    download_url: Option<String>,
}

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

fn get_env_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn get_env_webhook_url(name: &str) -> Option<String> {
    get_env_value(name)
}

fn backend_base_url() -> String {
    get_env_value("DROP_BACKEND_URL")
        .or_else(|| Some("http://35.221.95.153:3551".to_string()))
        .unwrap_or_default()
}

fn compare_versions(a: &str, b: &str) -> i8 {
    let clean = |s: &str| {
        s.trim()
            .trim_start_matches('v')
            .split(|c: char| !c.is_ascii_digit() && c != '.')
            .next()
            .unwrap_or("")
            .to_string()
    };

    let a_parts: Vec<u64> = clean(a)
        .split('.')
        .filter_map(|part| part.parse().ok())
        .collect();
    let b_parts: Vec<u64> = clean(b)
        .split('.')
        .filter_map(|part| part.parse().ok())
        .collect();
    let len = a_parts.len().max(b_parts.len());

    for i in 0..len {
        let a_val = *a_parts.get(i).unwrap_or(&0);
        let b_val = *b_parts.get(i).unwrap_or(&0);
        if a_val > b_val {
            return 1;
        }
        if a_val < b_val {
            return -1;
        }
    }

    0
}

async fn fetch_remote_version(client: reqwest::Client, url: String) -> Result<String, String> {
    let response = client.get(&url).send().await.map_err(|e| {
        format!("Failed to fetch launcher version from {}: {}", url, e)
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch launcher version from {}: {}",
            url,
            response.status()
        ));
    }
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read launcher version from {}: {}", url, e))?;
    let version = text.trim();
    if version.is_empty() {
        return Err("Launcher version file was empty".to_string());
    }
    Ok(version.to_string())
}

#[tauri::command]
fn get_app_version() -> String {
    CURRENT_VERSION.to_string()
}

#[tauri::command]
async fn check_version() -> Result<VersionCheckResponse, String> {
    let version_url = "https://raw.githubusercontent.com/kikai0724/Launher/refs/heads/main/launcherversion";
    let fallback_url = "https://raw.githubusercontent.com/kikai0724/launcherv/main/launcherversion";
    let client = reqwest::Client::new();

    let remote_version = match fetch_remote_version(client.clone(), version_url.to_string()).await {
        Ok(v) => v,
        Err(_) => match fetch_remote_version(client.clone(), fallback_url.to_string()).await {
            Ok(v) => v,
            Err(err) => {
                println!("Failed to fetch launcher version from remote: {}", err);
                return Ok(VersionCheckResponse {
                    update_type: "ok".to_string(),
                    message: "Up to date".to_string(),
                    version: Some(CURRENT_VERSION.to_string()),
                    download_url: None,
                });
            }
        },
    };

    if compare_versions(&remote_version, CURRENT_VERSION) == 1 {
        return Ok(VersionCheckResponse {
            update_type: "update".to_string(),
            message: format!("Update available: {}", remote_version),
            version: Some(remote_version.clone()),
            download_url: Some(format!(
                "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Drop_{}_x64_en-US.msi",
                remote_version
            )),
        });
    }

    Ok(VersionCheckResponse {
        update_type: "ok".to_string(),
        message: "Up to date".to_string(),
        version: Some(CURRENT_VERSION.to_string()),
        download_url: None,
    })
}

async fn send_discord_notification(title: &str, description: &str, color: u32) -> Result<(), String> {
    let webhook_url = match get_env_webhook_url("DROP_DISCORD_WEBHOOK_URL") {
        Some(url) => url,
        None => return Ok(()),
    };

    let client = reqwest::Client::new();
    let embed = serde_json::json!({
        "embeds": [{
            "title": title,
            "description": description,
            "color": color
        }]
    });

    let response = client
        .post(webhook_url)
        .json(&embed)
        .send()
        .await
        .map_err(|e| format!("Failed to send Discord notification: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Discord webhook returned status: {}", response.status()));
    }

    Ok(())
}

#[tauri::command]
async fn send_feedback(feedback: String, username: Option<String>) -> Result<(), String> {
    let webhook_url = match get_env_webhook_url("DROP_DISCORD_FEEDBACK_WEBHOOK_URL") {
        Some(url) => url,
        None => return Ok(()),
    };

    let client = reqwest::Client::new();
    let author = username.unwrap_or_else(|| "Anonymous".to_string());
    let payload = serde_json::json!({
        "embeds": [{
            "title": "Launcher Feedback",
            "description": feedback,
            "color": 0x00AAFF,
            "fields": [
                {"name": "Author", "value": author, "inline": false},
                {"name": "Platform", "value": "Tauri Launcher", "inline": false}
            ]
        }]
    });

    let response = client
        .post(webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to send feedback webhook: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Discord feedback webhook returned status: {}", response.status()));
    }

    Ok(())
}

// Proxy requests to the configured backend to avoid CORS in the renderer.
#[tauri::command]
async fn backend_proxy(
    method: String,
    path: String,
    query: Option<String>,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let base = backend_base_url();
    if base.is_empty() {
        return Err("Backend URL is not configured. Set DROP_BACKEND_URL.".to_string());
    }
    let mut url = format!("{}{}", base, path);
    if let Some(q) = query {
        if !q.is_empty() {
            url = format!("{}?{}", url, q);
        }
    }

    let client = reqwest::Client::new();
    let response = match method.to_uppercase().as_str() {
        "GET" => client.get(&url).send().await.map_err(|e| e.to_string())?,
        "POST" => {
            if let Some(b) = body {
                client.post(&url).json(&b).send().await.map_err(|e| e.to_string())?
            } else {
                client.post(&url).send().await.map_err(|e| e.to_string())?
            }
        }
        _ => return Err("Unsupported method".to_string()),
    };

    let status = response.status();
    let txt = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Backend returned {}: {}", status.as_u16(), txt));
    }

    let mut parsed = match serde_json::from_str::<serde_json::Value>(&txt) {
        Ok(v) => v,
        Err(_) => return Ok(serde_json::json!({ "text": txt })),
    };

    if let Some(obj) = parsed.as_object_mut() {
        for key in [
            "avatarUrl",
            "avatar_url",
            "avatar",
            "avatarUrl",
            "avatarurl",
            "avatarURL",
            "userAvatar",
            "useravatar",
            "useravater",
            "userAvatarUrl",
            "useravatarurl",
            "useravaterurl",
            "profileImage",
            "profileImageUrl",
            "profile_image",
            "profile_image_url",
        ] {
            if let Some(avatar_value) = obj.remove(key) {
                obj.insert("avatar_url".to_string(), avatar_value);
                break;
            }
        }
    }

    Ok(parsed)
}

#[tauri::command]
async fn check_banned(email: String, password: String) -> Result<serde_json::Value, String> {
    let base = backend_base_url();
    if base.is_empty() {
        return Err("Backend URL is not configured. Set DROP_BACKEND_URL.".to_string());
    }
    let url = format!("{}/api/account/banned?email={}&password={}", base, urlencoding::encode(&email), urlencoding::encode(&password));

    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let txt = response.text().await.map_err(|e| e.to_string())?;

    let parsed = serde_json::from_str::<serde_json::Value>(&txt).ok();
    let is_banned = parsed
        .as_ref()
        .and_then(|v| v.get("banned").and_then(|x| x.as_bool()))
        .unwrap_or(false)
        || parsed
            .as_ref()
            .and_then(|v| v.get("isBanned").and_then(|x| x.as_bool()))
            .unwrap_or(false);

    if is_banned {
        let username = parsed.as_ref().map(extract_ban_response_username).unwrap_or_else(|| "unknown".to_string());
        let reason = parsed.as_ref().map(extract_ban_response_reason).unwrap_or_else(|| "No reason provided".to_string());

        let _ = send_discord_notification(
            "🚫 Account Banned",
            &format!("Username: {}\nReason: {}", username, reason),
            0xFF0000,
        ).await;
    }

    if !status.is_success() {
        if let Some(v) = parsed {
            return Ok(v);
        }
        return Err(format!("Backend returned {}: {}", status.as_u16(), txt));
    }

    match parsed {
        Some(v) => Ok(v),
        None => Ok(serde_json::json!({ "text": txt })),
    }
}

#[tauri::command]
async fn get_arena_points(email: String, password: String) -> Result<ArenaPointsResponse, String> {
    let base = backend_base_url();
    if base.is_empty() {
        return Err("Backend URL is not configured. Set DROP_BACKEND_URL.".to_string());
    }
    let url = format!("{}/account/api/public/getArenaPoints", base);

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "email": email,
        "password": password
    });

    let response = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let txt = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Backend returned {}: {}", status.as_u16(), txt));
    }

    let parsed: ArenaPointsResponse = serde_json::from_str(&txt)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(parsed)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInstallArgs {
    download_url: String,
    require_elevation: Option<bool>,
}

#[tauri::command]
async fn download_and_install_update(args: UpdateInstallArgs, app_handle: tauri::AppHandle) -> Result<(), String> {
    let download_url = args.download_url;
    let temp_dir = std::env::temp_dir();
    let file_name = match download_url.split('/').last() {
        Some(name) => name,
        None => return Err("Could not extract filename".to_string())
    };

    let download_path = temp_dir.join(file_name);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Try to get total size
    let total_size = match client.head(&download_url).send().await {
        Ok(resp) => resp.content_length().unwrap_or(0),
        Err(_) => 0,
    };

    let response = client.get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download update: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to download update, status: {}", response.status()));
    }

    let mut file = File::create(&download_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Failed to download update chunk: {}", e))?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write update file chunk: {}", e))?;

        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8
        } else {
            0
        };

        let _ = app_handle.emit(
            "download-progress",
            DownloadProgress {
                stage: "download".to_string(),
                percent,
                message: if total_size > 0 { format!("Downloading {}%", percent) } else { "Downloading...".to_string() },
            },
        );
    }

    // ensure file is flushed
    file.flush().map_err(|e| format!("Failed to flush update file: {}", e))?;

    let path_str = download_path.to_string_lossy().to_string();

    let batch_path = temp_dir.join("update.bat");

    let batch_content = format!(
        "@echo off\n\
         timeout /t 1 /nobreak >nul\n\
         start \"\" \"{}\"\n\
         (goto) 2>nul & del \"%~f0\"",
        path_str.replace("\\", "\\\\")
    );

    fs::write(&batch_path, batch_content)
        .map_err(|e| format!("Failed to create bat file: {}", e))?;

    let _child = std::process::Command::new("cmd")
        .args(["/C", batch_path.to_string_lossy().as_ref()])
        .spawn()
        .map_err(|e| format!("Failed to execute bat file: {}", e))?;

    let _ = std::process::Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["/C", "taskkill", "/F", "/IM", "Drop.exe", "/T"])
        .spawn();

    // Emit completed progress
    let _ = app_handle.emit(
        "download-progress",
        DownloadProgress {
            stage: "complete".to_string(),
            percent: 100,
            message: "Installer launched".to_string(),
        },
    );

    app_handle.exit(0);

    Ok(())
}

fn is_downloadable_asset(url: &str) -> bool {
    let normalized = url.trim_end_matches('/');
    let file_name = normalized.rsplit('/').next().unwrap_or("");
    normalized.contains("/12.41/") && file_name.contains('.')
}

fn get_download_manifest(version: &str) -> Result<Vec<String>, String> {
    match version {
        "12.41" => Ok(include_str!("../manifests/12.41.txt")
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect()),
        _ => Err(format!("Unsupported version: {}", version)),
    }
}

fn version_manifest_relative_path(url: &str, version: &str) -> Result<PathBuf, String> {
    let marker = format!("/{}/", version);
    let (_, relative) = url
        .split_once(&marker)
        .ok_or_else(|| format!("Invalid {} manifest URL: {}", version, url))?;
    Ok(PathBuf::from(relative.replace('/', "\\")))
}

fn is_expected_empty_version_file(url: &str) -> bool {
    url.ends_with("/FortniteGame/Content/PackagedReplays/placeholder.txt")
}

fn partial_download_path(destination: &Path) -> PathBuf {
    destination.with_extension(format!(
        "{}.download",
        destination
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
    ))
}

async fn download_file_resumable(
    client: &reqwest::Client,
    url: &str,
    destination: &Path,
    allow_empty: bool,
    cancel: Option<&AtomicBool>,
) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
    }

    let partial_path = partial_download_path(destination);
    if !partial_path.exists() && destination.exists() {
        let local_size = fs::metadata(destination)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        let head = client
            .head(url)
            .send()
            .await
            .map_err(|e| format!("Failed to check existing download {}: {}", url, e))?;
        if !head.status().is_success() {
            return Err(format!(
                "Failed to check existing download {}, status: {}",
                url,
                head.status()
            ));
        }
        if let Some(total_size) = head
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
        {
            if local_size == total_size {
                return Ok(());
            }
            if local_size > total_size {
                return Err(format!(
                    "Local file is larger than the remote file: {}",
                    destination.display()
                ));
            }
            if local_size > 0 {
                fs::rename(destination, &partial_path).map_err(|e| {
                    format!(
                        "Failed to preserve partial file '{}': {}",
                        destination.display(),
                        e
                    )
                })?;
            }
        }
    }
    let mut downloaded = fs::metadata(&partial_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    if downloaded > 0 {
        let head = client
            .head(url)
            .send()
            .await
            .map_err(|e| format!("Failed to check partial download {}: {}", url, e))?;
        if !head.status().is_success() {
            return Err(format!(
                "Failed to check partial download {}, status: {}",
                url,
                head.status()
            ));
        }
        if let Some(total_size) = head
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
        {
            if downloaded == total_size {
                if destination.exists() {
                    fs::remove_file(destination).map_err(|e| {
                        format!("Failed to replace file '{}': {}", destination.display(), e)
                    })?;
                }
                fs::rename(&partial_path, destination).map_err(|e| {
                    format!(
                        "Failed to finish partial download '{}': {}",
                        destination.display(),
                        e
                    )
                })?;
                return Ok(());
            }
            if downloaded > total_size {
                return Err(format!(
                    "Partial download is larger than the remote file: {}",
                    partial_path.display()
                ));
            }
        }
    }

    let mut request = client.get(url);
    if downloaded > 0 {
        request = request.header(
            RANGE,
            HeaderValue::from_str(&format!("bytes={}-", downloaded))
                .map_err(|e| format!("Failed to create download range: {}", e))?,
        );
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to download file {}: {}", url, e))?;

    if downloaded > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(format!(
            "Server did not accept resume for {}. Partial data was kept.",
            url
        ));
    }
    if downloaded == 0 && !response.status().is_success() {
        return Err(format!(
            "Failed to download file {}, status: {}",
            url,
            response.status()
        ));
    }

    let mut file = if downloaded > 0 {
        OpenOptions::new()
            .append(true)
            .open(&partial_path)
            .map_err(|e| format!("Failed to resume file '{}': {}", partial_path.display(), e))?
    } else {
        File::create(&partial_path)
            .map_err(|e| format!("Failed to create file '{}': {}", partial_path.display(), e))?
    };
    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        if cancel.map(|flag| flag.load(Ordering::SeqCst)).unwrap_or(false) {
            return Err("Download cancelled".to_string());
        }
        let chunk =
            chunk_result.map_err(|e| format!("Failed to download file {}: {}", url, e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write file '{}': {}", partial_path.display(), e))?;
        downloaded += chunk.len() as u64;
    }
    file.flush()
        .map_err(|e| format!("Failed to flush file '{}': {}", partial_path.display(), e))?;

    if downloaded == 0 && !allow_empty {
        return Err(format!("Downloaded file was empty: {}", url));
    }
    if destination.exists() {
        fs::remove_file(destination)
            .map_err(|e| format!("Failed to replace file '{}': {}", destination.display(), e))?;
    }
    fs::rename(&partial_path, destination).map_err(|e| {
        format!(
            "Failed to install downloaded file '{}': {}",
            destination.display(),
            e
        )
    })
}

async fn repair_missing_version_files(
    app_handle: &tauri::AppHandle,
    version: &str,
    install_path: &Path,
) -> Result<usize, String> {
    let assets: Vec<String> = get_download_manifest(version)?
        .into_iter()
        .filter(|url| is_downloadable_asset(url))
        .collect();

    app_handle
        .emit(
            "launch-file-check-progress",
            DownloadProgress {
                stage: "check".to_string(),
                percent: 0,
                message: "Checking game files...".to_string(),
            },
        )
        .map_err(|e| format!("Failed to emit file check progress: {}", e))?;

    let mut missing = Vec::new();
    for url in assets {
        let relative_path = version_manifest_relative_path(&url, version)?;
        let local_path = install_path.join(&relative_path);
        let is_valid = fs::metadata(&local_path)
            .map(|metadata| {
                metadata.is_file()
                    && (metadata.len() > 0 || is_expected_empty_version_file(&url))
            })
            .unwrap_or(false);
        if !is_valid {
            missing.push((url, local_path));
        }
    }

    if missing.is_empty() {
        app_handle
            .emit(
                "launch-file-check-progress",
                DownloadProgress {
                    stage: "complete".to_string(),
                    percent: 100,
                    message: "Game files are ready.".to_string(),
                },
            )
            .map_err(|e| format!("Failed to emit file check progress: {}", e))?;
        return Ok(0);
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 60 * 24))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let total = missing.len();

    for (index, (url, local_path)) in missing.iter().enumerate() {
        download_file_resumable(
            &client,
            url,
            local_path,
            is_expected_empty_version_file(url),
            None,
        )
        .await?;

        let percent = ((((index + 1) as f64) / total as f64) * 100.0) as u8;
        app_handle
            .emit(
                "launch-file-check-progress",
                DownloadProgress {
                    stage: "repair".to_string(),
                    percent,
                    message: format!("Downloading missing files {}/{}", index + 1, total),
                },
            )
            .map_err(|e| format!("Failed to emit file repair progress: {}", e))?;
    }

    Ok(total)
}

#[tauri::command]
async fn download_and_extract_version(
    app_handle: tauri::AppHandle,
    version: String,
    output_path: String,
    cancel: tauri::State<'_, DownloadCancel>,
) -> Result<(), String> {
    println!("download_and_extract_version called: version={}, output_path={}", version, output_path);
    cancel.0.store(false, Ordering::SeqCst);

    let _ = send_discord_notification(
        "⬇️ ダウンロード開始",
        &format!("バージョン: {}\n出力先: {}", version, output_path),
        0x9900FF,
    ).await;

    let manifest = get_download_manifest(&version)?;

    if !Path::new(&output_path).exists() {
        fs::create_dir_all(&output_path)
            .map_err(|e| format!("Failed to create output directory '{}': {}", output_path, e))?;
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 60 * 24))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let total_files = manifest.iter().filter(|url| is_downloadable_asset(url)).count().max(1);
    let mut completed_files = 0usize;

    for url in manifest {
        if cancel.0.load(Ordering::SeqCst) {
            return Err("Download cancelled".to_string());
        }

        let normalized_url = url.trim_end_matches('/').to_string();
        let is_asset = is_downloadable_asset(&normalized_url);

        if !is_asset {
            let local_path = Path::new(&output_path).join(normalized_url.trim_start_matches("https://pub-b3ee689799f143a7968146e63124b471.r2.dev/").trim_start_matches("http://"));
            if !local_path.exists() {
                fs::create_dir_all(&local_path)
                    .map_err(|e| format!("Failed to create directory '{}': {}", local_path.display(), e))?;
            }
            continue;
        }

        let relative_path = normalized_url
            .trim_start_matches("https://pub-b3ee689799f143a7968146e63124b471.r2.dev/")
            .trim_start_matches("http://")
            .to_string();
        let local_path = Path::new(&output_path).join(&relative_path);
        download_file_resumable(
            &client,
            &normalized_url,
            &local_path,
            is_expected_empty_version_file(&normalized_url),
            Some(cancel.0.as_ref()),
        )
        .await?;
        completed_files += 1;

        let percent = (((completed_files as f64) / total_files as f64) * 100.0).min(100.0) as u8;
        app_handle
            .emit(
                "download-progress",
                DownloadProgress {
                    stage: "download".to_string(),
                    percent,
                    message: format!("Downloading {}/{}", completed_files, total_files),
                },
            )
            .map_err(|e| format!("Failed to emit progress event: {}", e))?;
    }

    app_handle
        .emit(
            "download-progress",
            DownloadProgress {
                stage: "complete".to_string(),
                percent: 100,
                message: "Completed".to_string(),
            },
        )
        .map_err(|e| format!("Failed to emit progress event: {}", e))?;

    let _ = send_discord_notification(
        "✅ ダウンロード完了",
        &format!("バージョン: {}\nパス: {}", version, output_path),
        0x00FF00,
    ).await;

    Ok(())
}
#[derive(Serialize)]
struct VersionInfo {
    version: String,
    technical_version: String,
    splash_image: String,
}

#[tauri::command]
async fn detect_fortnite_version(path: String) -> Result<VersionInfo, String> {
    let exe_path = Path::new(&path).join("FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe");
    let splash_path = Path::new(&path).join("FortniteGame/Content/Splash/Splash.bmp");

    if !exe_path.exists() {
        return Err("FortniteClient-Win64-Shipping.exe Not Found!!".to_string());
    }

    if !splash_path.exists() {
        return Err("Splash.bmp Not found!!".to_string());
    }

    let mut file = File::open(&exe_path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    let image_data = tokio::fs::read(&splash_path)
        .await
        .map_err(|e| e.to_string())?;
    let base64_string = BASE64.encode(image_data);
    let splash_image = format!("data:image/bmp;base64,{}", base64_string);

    let pattern = "++Fortnite+Release-";
    let pattern_bytes: Vec<u16> = pattern.encode_utf16().collect();
    let pattern_raw: Vec<u8> = pattern_bytes.iter()
        .flat_map(|&x| x.to_le_bytes())
        .collect();

    let mut indices = Vec::new();
    for (i, window) in buffer.windows(pattern_raw.len()).enumerate() {
        if window == pattern_raw {
            indices.push(i);
        }
    }

    for &index in &indices {
        file.seek(SeekFrom::Start(index as u64)).map_err(|e| e.to_string())?;
        let mut version_buffer = vec![0u8; 200];
        file.read(&mut version_buffer).map_err(|e| e.to_string())?;

        let version_str = String::from_utf16_lossy(
            &version_buffer.chunks(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                .collect::<Vec<u16>>()
        );

        let re = Regex::new(r"\+\+Fortnite\+Release-(\d{1,2}\.\d{1,2}|Live|Next|Cert)-CL-(\d+)")
            .map_err(|e| e.to_string())?;

        if let Some(captures) = re.captures(&version_str) {
            let version_num = captures.get(1).map_or("Unknown", |m| m.as_str());
            let cl_num = captures.get(2).map_or("Unknown", |m| m.as_str());
            
           
            let version = format!("{} (CL-{})", version_num, cl_num);
            
       
            let technical_version = format!("{}.0-CL-{}", version_num, cl_num);

            return Ok(VersionInfo {
                version,
                technical_version,
                splash_image,
            });
        }
    }

    Err("Version not found".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredVersion {
    path: String,
    version: String,
    technical_version: String,
    splash_image: String,
}

#[derive(Debug, Serialize)]
struct Version {
    path: String,
    version: String,
    technical_version: String,
    splash_image: String,
    access_type: String,
    build_name: String,
}

struct VersionState(Mutex<HashMap<String, StoredVersion>>);

fn get_versions_file_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap()
        .join("versions.json")
}

fn load_versions(app_handle: &tauri::AppHandle) -> HashMap<String, StoredVersion> {
    let path = get_versions_file_path(app_handle);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(versions) = serde_json::from_str(&content) {
                return versions;
            }
        }
    }
    HashMap::new()
}

fn save_versions(versions: &HashMap<String, StoredVersion>, app_handle: &tauri::AppHandle) -> Result<(), String> {
    let path = get_versions_file_path(app_handle);
    
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let content = serde_json::to_string_pretty(versions)
        .map_err(|e| e.to_string())?;
    
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn add_version(
    path: String,
    state: tauri::State<'_, VersionState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Version>, String> {
    let version_info = detect_fortnite_version(path.clone()).await?;
    
    let _ = send_discord_notification(
        "📦 バージョン追加",
        &format!("パス: {}\nバージョン: {}", path, version_info.version),
        0x0099FF,
    ).await;

    {
        let mut versions = state.0.lock().unwrap();
        versions.insert(path.clone(), StoredVersion {
            path,
            version: version_info.version,
            technical_version: version_info.technical_version,
            splash_image: version_info.splash_image,
        });
        
        save_versions(&versions, &app_handle)?;
    } 


    get_versions_with_status(state).await
}

#[tauri::command]
async fn get_versions(
    state: tauri::State<'_, VersionState>,
) -> Result<Vec<StoredVersion>, String> {
    let versions = state.0.lock().unwrap();
    Ok(versions.values().cloned().collect())
}

#[tauri::command]
async fn remove_version(
    path: String,
    delete_files: bool,
    state: tauri::State<'_, VersionState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Version>, String> {

    {
        let mut versions = state.0.lock().unwrap();
        versions.remove(&path);
        save_versions(&versions, &app_handle)?;
    }

    let _ = send_discord_notification(
        "🗑️ バージョン削除",
        &format!("パス: {}\nファイル削除: {}", path, delete_files),
        0xFF6600,
    ).await;

    if delete_files {
        let path_obj = Path::new(&path);
        
        if let Some(parent) = path_obj.parent() {
            match fs::remove_dir_all(parent) {
                Ok(_) => (),
                Err(e) => {
                    println!("Failed to delete parent directory {}: {}", parent.display(), e);
                    return Err(format!("Failed to delete directory: {}", e));
                }
            }
        } else {
            return Err("Could not determine parent directory".to_string());
        }
    }

    get_versions_with_status(state).await
}

#[derive(Debug, Serialize, Deserialize)]
struct Build {
    build: String,
    name: String,
    #[serde(rename = "accessType")]
    access_type: String,
    season_number: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct BuildsResponse {
    builds: Vec<Build>,
}

#[derive(Debug, Serialize)]
struct VersionWithStatus {
    path: String,
    version: String,
    technical_version: String,
    splash_image: String,
    access_type: String,
    build_name: String,
}

#[tauri::command]
async fn fetch_builds() -> Result<BuildsResponse, String> {
    // Return empty builds list for now
    Ok(BuildsResponse { builds: Vec::new() })
}

#[tauri::command]
async fn get_versions_with_status(state: tauri::State<'_, VersionState>) -> Result<Vec<Version>, String> {

    let (stored_versions, builds) = tokio::join!(
        async {
            let versions = state.0.lock().unwrap();
            versions.values().cloned().collect::<Vec<StoredVersion>>()
        },
        fetch_builds()
    );

    let builds = builds?;
    
    let builds_map: HashMap<String, &Build> = builds.builds
        .iter()
        .map(|b| {
            let version = b.name.trim_start_matches("Fortnite ").to_string();
            (version, b)
        })
        .collect();

    let versions_with_status: Vec<Version> = stored_versions.into_iter().map(|v| {
        let version_number = v.version
            .split(" (CL-")
            .next()
            .unwrap_or(&v.version)
            .to_string();

        let matching_build = builds_map.get(&version_number);

        Version {
            path: v.path,
            version: v.version,
            technical_version: v.technical_version,
            splash_image: v.splash_image,
            access_type: matching_build
                .map(|b| b.access_type.clone())
                .unwrap_or_else(|| "unknown".to_string()),
            build_name: matching_build
                .map(|b| b.name.clone())
                .unwrap_or_else(|| format!("Fortnite {}", version_number)),
        }
    }).collect();

    Ok(versions_with_status)
}

fn get_windows_ui_culture() -> String {
    let lang_id = unsafe { GetUserDefaultUILanguage() as u16 };
    let primary = lang_id & 0x03FF;
    match primary {
        0x11 => "ja-JP".to_string(),
        0x12 => "ko-KR".to_string(),
        0x04 => "zh-CN".to_string(),
        _ => "en-US".to_string(),
    }
}

fn localized_status_for_ui_language(language: &str) -> String {
    match language {
        "ja-JP" => "ゲームを起動中..".to_string(),
        "ko-KR" => "게임 시작 중..".to_string(),
        "zh-CN" => "正在启动游戏..".to_string(),
        _ => "Launching game..".to_string(),
    }
}

fn localized_game_file_missing_message(language: &str) -> String {
    match language {
        "ja-JP" => "ゲームファイルが見つかりません".to_string(),
        "ko-KR" => "게임 파일을 찾을 수 없습니다".to_string(),
        "zh-CN" => "找不到游戏文件".to_string(),
        _ => "Game files not found".to_string(),
    }
}

fn localized_connection_failed_message(language: &str) -> String {
    match language {
        "ja-JP" => "接続に失敗しました".to_string(),
        "ko-KR" => "연결에 실패했습니다".to_string(),
        "zh-CN" => "连接失败".to_string(),
        _ => "Connection failed".to_string(),
    }
}



async fn open_launch_splash_window(app_handle: &tauri::AppHandle, title: &str, splash_image: &str) -> Result<(), String> {
    let ui_language = get_windows_ui_culture();
    let status_text = localized_status_for_ui_language(ui_language.as_str());
    let splash_path = format!(
        "launch-splash.html?title={}&lang={}&status={}",
        urlencoding::encode(title),
        urlencoding::encode(ui_language.as_str()),
        urlencoding::encode(status_text.as_str())
    );

    if let Some(existing) = app_handle.get_webview_window("launch-splash") {
        let _ = existing.show();
        let _ = existing.set_focus();
        let _ = existing.emit("splash:update", serde_json::json!({"title": title, "image": splash_image, "lang": ui_language, "status": status_text}));
        return Ok(());
    }

    let _ = tauri::WebviewWindow::builder(
        app_handle,
        "launch-splash",
        tauri::WebviewUrl::App(splash_path.into()),
    )
    .title("Drop")
    .inner_size(854.0, 480.0)
    .resizable(false)
    .center()
    .decorations(false)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn close_launch_splash(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("launch-splash") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

const DROP_MOD_FILES: [(&str, &str); 2] = [
    (
        "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/dropmod%20v37/z_pakchunk2026-WindowsDropClient-v37.sig",
        "z_pakchunk2026-WindowsDropClient-v37.sig",
    ),
    (
        "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/dropmod%20v37/z_pakchunk2026-WindowsDropClient-v37.pak",
        "z_pakchunk2026-WindowsDropClient-v37.pak",
    ),
];

async fn download_drop_mod(
    app_handle: &tauri::AppHandle,
    install_path: &Path,
) -> Result<(), String> {
    let paks_path = install_path.join("FortniteGame").join("Content").join("Paks");
    fs::create_dir_all(&paks_path)
        .map_err(|e| format!("Failed to create mod directory '{}': {}", paks_path.display(), e))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 60))
        .build()
        .map_err(|e| format!("Failed to create mod download client: {}", e))?;

    let total_files = DROP_MOD_FILES.len() as u32;

    for (index, (url, file_name)) in DROP_MOD_FILES.iter().enumerate() {
        let base_percent = ((index as u32 * 100) / total_files) as u8;

        app_handle
            .emit(
                "launch-file-check-progress",
                DownloadProgress {
                    stage: "mod".to_string(),
                    percent: base_percent,
                    message: format!("Downloading mod: {}", file_name),
                },
            )
            .map_err(|e| format!("Failed to emit mod download progress: {}", e))?;

        let response = client
            .get(*url)
            .send()
            .await
            .map_err(|e| format!("Failed to download mod '{}': {}", file_name, e))?;
        let total_size = response.content_length().unwrap_or(0) as u64;
        if !response.status().is_success() {
            return Err(format!(
                "Failed to download mod '{}', status: {}",
                file_name,
                response.status()
            ));
        }

        let destination = paks_path.join(file_name);
        if fs::metadata(&destination)
            .map(|metadata| metadata.is_file() && metadata.len() > 0)
            .unwrap_or(false)
        {
            let finished_percent = (((index as u32 + 1) * 100) / total_files) as u8;
            app_handle
                .emit(
                    "launch-file-check-progress",
                    DownloadProgress {
                        stage: "mod".to_string(),
                        percent: finished_percent,
                        message: format!("Mod already exists: {}", file_name),
                    },
                )
                .map_err(|e| format!("Failed to emit mod download progress: {}", e))?;
            continue;
        }

        let partial_destination = destination.with_extension(format!(
            "{}.download",
            destination.extension().and_then(|extension| extension.to_str()).unwrap_or("mod")
        ));
        let mut file = File::create(&partial_destination)
            .map_err(|e| format!("Failed to create mod '{}': {}", partial_destination.display(), e))?;
        let mut stream = response.bytes_stream();
        let mut downloaded = 0usize;
        let file_span = (100u32 / total_files).max(1);

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result
                .map_err(|e| format!("Failed to read mod '{}': {}", file_name, e))?;
            downloaded += chunk.len();
            file.write_all(&chunk)
                .map_err(|e| format!("Failed to save mod '{}': {}", partial_destination.display(), e))?;

            let current_file_percent = if total_size > 0 {
                ((downloaded as u64 * 100) / total_size).min(100) as u32
            } else {
                0
            };
            let combined_percent = base_percent as u32
                + ((current_file_percent * file_span) / 100);
            let percent = combined_percent.min(100) as u8;

            app_handle
                .emit(
                    "launch-file-check-progress",
                    DownloadProgress {
                        stage: "mod".to_string(),
                        percent,
                        message: format!("Downloading mod: {} ({}%)", file_name, percent),
                    },
                )
                .map_err(|e| format!("Failed to emit mod download progress: {}", e))?;
        }
        file.flush()
            .map_err(|e| format!("Failed to flush mod '{}': {}", partial_destination.display(), e))?;
        if downloaded == 0 {
            let _ = fs::remove_file(&partial_destination);
            return Err(format!("Downloaded mod '{}' was empty", file_name));
        }
        if destination.exists() {
            fs::remove_file(&destination)
                .map_err(|e| format!("Failed to replace mod '{}': {}", destination.display(), e))?;
        }
        fs::rename(&partial_destination, &destination)
            .map_err(|e| format!("Failed to install mod '{}': {}", destination.display(), e))?;

        let finished_percent = (((index as u32 + 1) * 100) / total_files) as u8;
        app_handle
            .emit(
                "launch-file-check-progress",
                DownloadProgress {
                    stage: "mod".to_string(),
                    percent: finished_percent,
                    message: format!("Mod downloaded: {}", file_name),
                },
            )
            .map_err(|e| format!("Failed to emit mod download progress: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn version_card_clicked(
    path: String,
    email: String,
    password: String,
    username: String,
    avatar_url: String,
    version: String,
    reset_on_release: bool,
    disable_pre_edits: bool,
    double_movement: bool,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    println!(
        "version_card_clicked called: path={} email={} user={} version={} reset_on_release={} disable_pre_edits={} double_movement={}",
        path, email, username, version, reset_on_release, disable_pre_edits, double_movement
    );

    let version_number = version.split(" (CL-").next().unwrap_or(&version);
    if version_number == "12.41" {
        repair_missing_version_files(&app_handle, version_number, Path::new(&path)).await?;
    }

    let ui_language = get_windows_ui_culture();
    app_handle
        .emit(
            "launch-file-check-progress",
            DownloadProgress {
                stage: "launch".to_string(),
                percent: 100,
                message: "Starting game...".to_string(),
            },
        )
        .map_err(|e| format!("Failed to emit launch progress: {}", e))?;

    launch_fn(
        &path,
        app_handle.clone(),
        email,
        password,
        false,
        version,
        reset_on_release,
        disable_pre_edits,
        double_movement,
    )
    .await
    .map(|_| ())
}

fn str_to_wide(path: &str) -> Vec<u16> {
    let mut wide_path: Vec<u16> = path.encode_utf16().collect();
    wide_path.push(0);
    wide_path
}

fn normalize_dll_name(module_name: &str) -> String {
    let trimmed = module_name.trim().trim_matches('"').to_ascii_lowercase();
    Path::new(&trimmed)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&trimmed)
        .to_ascii_lowercase()
}

fn is_windows_system_module(module_name: &str) -> bool {
    let trimmed = module_name.trim().trim_matches('"').to_ascii_lowercase();
    if trimmed.is_empty() {
        return false;
    }

    let system_prefixes = [
        r"c:\windows\system32\",
        r"c:\windows\syswow64\",
        r"c:\windows\winsxs\",
        r"c:\windows\servicing\",
        r"c:\windows\assembly\",
        r"c:\windows\system32\\",
        r"c:\windows\syswow64\\",
    ];

    let lower = trimmed.to_lowercase();
    let filename = Path::new(&trimmed)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&trimmed);
    let file_lower = filename.to_lowercase();

    system_prefixes.iter().any(|prefix| lower.starts_with(prefix))
        || lower.contains(r"\windows\system32\")
        || lower.contains(r"\windows\syswow64\")
        || lower.ends_with(".dll") && [
            "bcryptprimitives.dll",
            "bcp47mrm.dll",
            "clbcatq.dll",
            "comctl32.dll",
            "ieframe.dll",
            "iertutil.dll",
            "kernel.appcore.dll",
            "mlang.dll",
            "mrmcorer.dll",
            "netutils.dll",
            "profapi.dll",
            "propsys.dll",
            "secur32.dll",
            "srvcli.dll",
            "urlmon.dll",
            "uxtheme.dll",
            "windows.staterepositoryclient.dll",
            "windows.staterepositorycore.dll",
            "windows.staterepositoryps.dll",
            "windows.storage.dll",
            "windows.system.launcher.dll",
            "windows.ui.dll",
            "wininet.dll",
            "wintypes.dll",
        ].contains(&file_lower.as_str())
}

fn is_known_safe_module(module_name: &str, allowed_modules: &HashSet<String>) -> bool {
    let normalized = normalize_dll_name(module_name);
    if normalized.is_empty() {
        return false;
    }

    let safe_module_names: HashSet<&str> = [
        "libogg_64.dll",
        "libvorbis_64.dll",
        "libvorbisfile_64.dll",
        "messagebus.dll",
        "resourcepolicyclient.dll",
        "psapi.dll",
        "coremessaging.dll",
        "fwpuclnt.dll",
        "ortp_x64.dll",
        "rasadhlp.dll",
        "sensapi.dll",
        "vivoxsdk_x64.dll",
        "xaudio2_7.dll",
        "d3d9.dll",
        "d3d11.dll",
        "d3d12.dll",
        "d3d12core.dll",
        "dxgi.dll",
        "dinput8.dll",
        "xinput1_3.dll",
        "xinput1_4.dll",
        "xinput9_1_0.dll",
        "d3dcompiler_43.dll",
        "d3dcompiler_47.dll",
        "d3dx9_43.dll",
        "d3dx11_43.dll",
        "xaudio2_9.dll",
        "xaudio2_9redist.dll",
        "xapofx1_5.dll",
        "directxdatabasehelper.dll",
        "client.dll",
        "dpapi.dll",
        "ncryptsslp.dll",
        "schannel.dll",
        "xinput1_4.dll"
    ]
    .into_iter()
    .collect();

    allowed_modules.contains(&normalized)
        || safe_module_names.contains(normalized.as_str())
        || is_windows_system_module(&normalized)
}

fn find_unexpected_module_names(current_modules: &HashSet<String>, baseline_modules: &HashSet<String>, allowed_modules: &HashSet<String>) -> Vec<String> {
    current_modules
        .iter()
        .filter_map(|module| {
            let normalized = normalize_dll_name(module);
            if baseline_modules.contains(&normalized)
                || is_known_safe_module(&normalized, allowed_modules)
            {
                None
            } else {
                Some(normalized)
            }
        })
        .collect::<Vec<_>>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_version_comes_from_the_built_package() {
        assert_eq!(CURRENT_VERSION, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn path_based_tellurium_module_is_treated_as_allowed() {
        let allowed: HashSet<String> = ["tellurium.dll".to_string()].into_iter().collect();
        let mut current = HashSet::new();
        current.insert(r"C:\Users\example\AppData\Local\Drop\Tellurium.dll".to_string());

        let baseline = HashSet::new();
        let unexpected = find_unexpected_module_names(&current, &baseline, &allowed);

        assert!(unexpected.is_empty());
    }

    #[test]
    fn bin_modules_are_ignored() {
        let allowed: HashSet<String> = ["tellurium.dll".to_string()].into_iter().collect();
        let mut current = HashSet::new();
        current.insert("evil.bin".to_string());

        let baseline = HashSet::new();
        let unexpected = find_unexpected_module_names(&current, &baseline, &allowed);

        assert!(unexpected.is_empty());
    }

    #[test]
    fn unknown_module_is_still_reported() {
        let allowed: HashSet<String> = ["tellurium.dll".to_string()].into_iter().collect();
        let mut current = HashSet::new();
        current.insert("evil.dll".to_string());

        let baseline = HashSet::new();
        let unexpected = find_unexpected_module_names(&current, &baseline, &allowed);

        assert_eq!(unexpected, vec!["evil.dll".to_string()]);
    }

    #[test]
    fn windows_system_modules_are_ignored() {
        assert!(is_windows_system_module(r"C:\Windows\System32\user32.dll"));
        assert!(is_windows_system_module(r"C:\Windows\SysWOW64\comctl32.dll"));
    }

    #[test]
    fn non_system_modules_are_not_ignored() {
        assert!(!is_windows_system_module(r"C:\Program Files\Drop\Tellurium.dll"));
        assert!(!is_windows_system_module(r"C:\Games\MyMod\evil.dll"));
    }

    #[test]
    fn tellurium_is_stored_under_the_current_users_local_app_data() {
        assert_eq!(
            tellurium_storage_path_from(Path::new(r"C:\Users\example\AppData\Local")),
            PathBuf::from(r"C:\Users\example\AppData\Local\Drop\Tellurium.dll")
        );
    }

    #[test]
    fn known_steam_and_audio_dlls_are_treated_as_safe() {
        let allowed: HashSet<String> = HashSet::new();
        assert!(is_known_safe_module("libogg_64.dll", &allowed));
        assert!(is_known_safe_module("libvorbis_64.dll", &allowed));
        assert!(is_known_safe_module("libvorbisfile_64.dll", &allowed));
        assert!(is_known_safe_module("messagebus.dll", &allowed));
        assert!(is_known_safe_module("resourcepolicyclient.dll", &allowed));
        assert!(is_known_safe_module("psapi.dll", &allowed));
        assert!(is_known_safe_module("coremessaging.dll", &allowed));
        assert!(is_known_safe_module("fwpuclnt.dll", &allowed));
        assert!(is_known_safe_module("ortp_x64.dll", &allowed));
        assert!(is_known_safe_module("rasadhlp.dll", &allowed));
        assert!(is_known_safe_module("sensapi.dll", &allowed));
        assert!(is_known_safe_module("vivoxsdk_x64.dll", &allowed));
        assert!(is_known_safe_module("xaudio2_7.dll", &allowed));
        assert!(is_known_safe_module("d3d11.dll", &allowed));
        assert!(is_known_safe_module("dxgi.dll", &allowed));
        assert!(is_known_safe_module("d3dcompiler_47.dll", &allowed));
        assert!(is_known_safe_module("xinput1_3.dll", &allowed));
    }

    #[test]
    fn season_manifest_targets_direct_asset_urls_for_12_41() {
        let manifest = get_download_manifest("12.41").unwrap();
        assert_eq!(manifest.len(), 819);
        assert_eq!(
            manifest
                .iter()
                .filter(|entry| is_downloadable_asset(entry))
                .count(),
            750
        );
        assert!(manifest.iter().any(|entry| entry.ends_with("/12.41/Engine")));
        assert!(manifest.iter().any(|entry| entry.ends_with("/Engine/Binaries/ThirdParty/CEF3/Win64/chrome_elf.dll")));
        assert!(manifest.iter().any(|entry| entry.ends_with("/FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe")));
        assert!(manifest.iter().any(|entry| entry.ends_with("/FortniteGame/Content/Splash/Splash.bmp")));
    }

    #[test]
    fn directory_paths_are_not_treated_as_downloadable_files() {
        assert!(!is_downloadable_asset("https://example.com/12.41/Engine"));
        assert!(!is_downloadable_asset("https://example.com/12.41/FortniteGame/Content/Paks"));
        assert!(is_downloadable_asset("https://example.com/12.41/Engine/Binaries/ThirdParty/CEF3/Win64/chrome_elf.dll"));
        assert!(is_downloadable_asset("https://example.com/12.41/FortniteGame/Content/Paks/pakchunk0-WindowsClient.pak"));
    }

    #[test]
    fn packaged_replay_placeholder_is_an_expected_empty_file() {
        assert!(is_expected_empty_version_file(
            "https://example.com/12.41/FortniteGame/Content/PackagedReplays/placeholder.txt"
        ));
        assert!(!is_expected_empty_version_file(
            "https://example.com/12.41/FortniteGame/Content/Legal/FortniteThirdPartySoftware.txt"
        ));
    }
}

fn extract_ban_response_username(response: &serde_json::Value) -> String {
    response
        .get("username")
        .and_then(|x| x.as_str())
        .or_else(|| response.get("user").and_then(|u| u.get("username")).and_then(|x| x.as_str()))
        .or_else(|| response.get("userName").and_then(|x| x.as_str()))
        .unwrap_or("unknown")
        .to_string()
}

fn extract_ban_response_reason(response: &serde_json::Value) -> String {
    response
        .get("reason")
        .and_then(|x| x.as_str())
        .or_else(|| response.get("message").and_then(|x| x.as_str()))
        .unwrap_or("No reason provided")
        .to_string()
}

#[cfg(test)]
mod ban_response_tests {
    use super::*;

    #[test]
    fn extracts_username_from_ban_response() {
        let response = serde_json::json!({"username": "test-user", "reason": "cheat"});
        assert_eq!(extract_ban_response_username(&response), "test-user");
    }

    #[test]
    fn falls_back_to_unknown_when_username_missing() {
        let response = serde_json::json!({"reason": "cheat"});
        assert_eq!(extract_ban_response_username(&response), "unknown");
    }
}

async fn get_public_ip(client: &reqwest::Client) -> String {
    const IP_SERVICES: [&str; 3] = [
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://icanhazip.com",
    ];

    for url in IP_SERVICES {
        if let Ok(response) = client
            .get(url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            if response.status().is_success() {
                if let Ok(text) = response.text().await {
                    let ip = text.trim();
                    if !ip.is_empty() {
                        return ip.to_string();
                    }
                }
            }
        }
    }

    "unknown".to_string()
}

async fn report_unexpected_dlls(email: &str, password: &str, dll_names: &[String]) -> Result<(), String> {
    if dll_names.is_empty() {
        return Ok(());
    }

    let base = backend_base_url();
    if base.is_empty() {
        return Err("Backend URL is not configured. Set DROP_BACKEND_URL.".to_string());
    }
    let ban_url = format!(
        "{}/api/account/ban?email={}&password={}",
        base,
        urlencoding::encode(email),
        urlencoding::encode(password)
    );

    let client = reqwest::Client::new();
    let ban_response = client.get(&ban_url).send().await.map_err(|e| e.to_string())?;
    let ban_status = ban_response.status();
    let ban_txt = ban_response.text().await.map_err(|e| e.to_string())?;

    if !ban_status.is_success() {
        return Err(format!("Backend returned {}: {}", ban_status.as_u16(), ban_txt));
    }

    println!("Reported unexpected DLL injection to backend: {:?}", dll_names);
    Ok(())
}

fn remove_legacy_drop_mod_files_at_path(base: &Path) -> Result<(), String> {
    let paks_path = base.join("FortniteGame").join("Content").join("Paks");
    for file_name in [
        "z_pakchunk2026-WindowsDropClient-v36.sig",
        "z_pakchunk2026-WindowsDropClient-v36.pak",
    ] {
        let file_path = paks_path.join(file_name);
        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("Failed to remove {}: {}", file_path.display(), e))?;
            println!("Removed legacy DropClient file at startup: {}", file_path.display());
        }
    }
    Ok(())
}

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn kill() {
    let mut system = System::new_all();
    system.refresh_all();

    let processes = vec![
        "EpicGamesLauncher.exe",
        "FortniteLauncher.exe",
        "FortniteClient-Win64-Shipping_BE.exe",
        "FortniteClient-Win64-Shipping.exe",
        "EpicWebHelper.exe",
    ];

    for process in processes.iter() {
        let cmd = std::process::Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&["/C", "taskkill", "/F", "/IM", process])
            .spawn();

        if cmd.is_err() {
            return;
        }
    }

    std::thread::sleep(std::time::Duration::from_millis(10));
}

pub fn kill_epic() {
    let cmd = std::process::Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["/C", "taskkill /F /IM", "EpicGamesLauncher.exe"])
        .spawn();

    if cmd.is_err() {
        return;
    }

    std::thread::sleep(std::time::Duration::from_millis(10));
}

async fn download_file(url: &str, destination: &Path) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download DLL: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to download DLL, status: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Failed to read response bytes: {}", e))?;
    let mut file = std::fs::File::create(destination)
        .map_err(|e| format!("Failed to create file '{}': {}", destination.display(), e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file '{}': {}", destination.display(), e))?;
    Ok(())
}

fn should_prepare_anti_cheat_assets(path: &str, version: &str) -> bool {
    let version_number = version.split(" (CL-").next().unwrap_or(version);
    if version_number != "12.41" {
        return false;
    }

    let base = Path::new(path);
    base.join("Engine").exists() && base.join("FortniteGame").exists()
}

async fn prepare_anti_cheat_assets(install_path: &Path) -> Result<(), String> {
    let anti_cheat_root = install_path.to_path_buf();
    let easy_anti_cheat_root = install_path.join("EasyAntiCheat");

    for dir in [
        anti_cheat_root.as_path(),
        easy_anti_cheat_root.join("Localization").as_path(),
        easy_anti_cheat_root.join("Licenses").as_path(),
        easy_anti_cheat_root.join("Certificates").as_path(),
    ] {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory '{}': {}", dir.display(), e))?;
    }

    let files: [(String, &str); 28] = [
        (anti_cheat_root.join("Drop.exe").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/Drop.exe"),
        (easy_anti_cheat_root.join("SplashScreen.png").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/SplashScreen.png"),
        (easy_anti_cheat_root.join("EasyAntiCheat_EOS_Setup.exe").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/EasyAntiCheat_EOS_Setup.exe"),
        (easy_anti_cheat_root.join("Settings.json").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Settings.json"),
        (easy_anti_cheat_root.join("Localization").join("ar_sa.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/ar_sa.cfg"),
        (easy_anti_cheat_root.join("Localization").join("cs_cz.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/cs_cz.cfg"),
        (easy_anti_cheat_root.join("Localization").join("de_de.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/de_de.cfg"),
        (easy_anti_cheat_root.join("Localization").join("en_us.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/en_us.cfg"),
        (easy_anti_cheat_root.join("Localization").join("es_ar.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/es_ar.cfg"),
        (easy_anti_cheat_root.join("Localization").join("es_es.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/es_es.cfg"),
        (easy_anti_cheat_root.join("Localization").join("fr_fr.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/fr_fr.cfg"),
        (easy_anti_cheat_root.join("Localization").join("it_it.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/it_it.cfg"),
        (easy_anti_cheat_root.join("Localization").join("ja_ja.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/ja_ja.cfg"),
        (easy_anti_cheat_root.join("Localization").join("ko_kr.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/ko_kr.cfg"),
        (easy_anti_cheat_root.join("Localization").join("nl_nl.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/nl_nl.cfg"),
        (easy_anti_cheat_root.join("Localization").join("pl_pl.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/pl_pl.cfg"),
        (easy_anti_cheat_root.join("Localization").join("pt_br.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/pt_br.cfg"),
        (easy_anti_cheat_root.join("Localization").join("ru_ru.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/ru_ru.cfg"),
        (easy_anti_cheat_root.join("Localization").join("th_th.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/th_th.cfg"),
        (easy_anti_cheat_root.join("Localization").join("tr_tr.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/tr_tr.cfg"),
        (easy_anti_cheat_root.join("Localization").join("zh_cn.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/zh_cn.cfg"),
        (easy_anti_cheat_root.join("Localization").join("zh_tw.cfg").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Localization/zh_tw.cfg"),
        (easy_anti_cheat_root.join("Licenses").join("Apache-2.0.txt").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Licenses/Apache-2.0.txt"),
        (easy_anti_cheat_root.join("Licenses").join("Licenses.txt").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Licenses/Licenses.txt"),
        (easy_anti_cheat_root.join("Licenses").join("MIT.txt").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Licenses/MIT.txt"),
        (easy_anti_cheat_root.join("Certificates").join("runtime.conf").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Certificates/runtime.conf"),
        (easy_anti_cheat_root.join("Certificates").join("base.bin").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Certificates/base.bin"),
        (easy_anti_cheat_root.join("Certificates").join("base.cer").to_string_lossy().to_string(), "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/AntiCheat/EasyAntiCheat/Certificates/base.cer"),
    ];

    for (destination, url) in files {
        let destination_path = Path::new(&destination);
        if destination_path.exists() {
            continue;
        }

        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
        }
        download_file(url, destination_path).await
            .map_err(|e| format!("Failed to download '{}' from '{}': {}", destination_path.display(), url, e))?;
    }

    Ok(())
}

fn launch_drop_process(install_path: &Path) -> Result<u32, String> {
    let drop_exe = install_path.join("Drop.exe");
    let legacy_drop_exe = install_path.join("AntiCheat").join("Drop.exe");
    let chosen_drop_exe = if drop_exe.exists() {
        drop_exe
    } else if legacy_drop_exe.exists() {
        legacy_drop_exe
    } else {
        return Err(format!("Drop.exe not found at '{}' or '{}'.", drop_exe.display(), legacy_drop_exe.display()));
    };

    if !chosen_drop_exe.exists() {
        return Err(format!("Drop.exe not found at '{}'.", chosen_drop_exe.display()));
    }

    let current_dir = chosen_drop_exe.parent().ok_or_else(|| "Invalid Drop.exe directory".to_string())?;
    let child = std::process::Command::new(&chosen_drop_exe)
        .current_dir(current_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch Drop.exe: {}", e))?;

    let pid = child.id();
    println!("Launched Drop.exe with PID: {}", pid);
    Ok(pid)
}

fn terminate_process_by_pid(pid: u32) -> Result<(), String> {
    unsafe {
        let process = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
        if process.is_null() {
            return Err(format!("Failed to open process {}: {}", pid, io::Error::last_os_error()));
        }

        let terminated = TerminateProcess(process, 1);
        CloseHandle(process);
        if terminated == 0 {
            return Err(format!("Failed to terminate process {}: {}", pid, io::Error::last_os_error()));
        }
    }

    println!("Stopped process with PID: {}", pid);
    Ok(())
}

fn launch_drop_process_old(install_path: &Path) -> Result<u32, String> {
    let drop_exe = install_path.join("AntiCheat").join("Drop.exe");
    if !drop_exe.exists() {
        return Err(format!("Drop.exe not found at '{}'.", drop_exe.display()));
    }

    let current_dir = drop_exe.parent().ok_or_else(|| "Invalid Drop.exe directory".to_string())?;
    let child = std::process::Command::new(&drop_exe)
        .current_dir(current_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch Drop.exe: {}", e))?;

    let pid = child.id();
    println!("Launched Drop.exe with PID: {}", pid);
    Ok(pid)
}

fn tellurium_storage_path_from(local_app_data: &Path) -> PathBuf {
    local_app_data.join("Drop").join("Tellurium.dll")
}

fn drop_local_data_dir() -> Result<PathBuf, String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .ok_or_else(|| "LOCALAPPDATA is not available".to_string())?;
    Ok(Path::new(&local_app_data).join("Drop"))
}

fn tellurium_storage_path() -> Result<PathBuf, String> {
    Ok(drop_local_data_dir()?.join("Tellurium.dll"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherStartupState {
    first_run_completed: bool,
    language: String,
}

fn launcher_startup_state_path() -> Result<PathBuf, String> {
    Ok(drop_local_data_dir()?.join("launcher-state.json"))
}

#[tauri::command]
fn get_launcher_startup_state() -> Result<Option<LauncherStartupState>, String> {
    let path = launcher_startup_state_path()?;
    if !path.exists() {
        return Ok(None);
    }

    match read_launcher_session_state() {
        Ok(state) => {
            let startup_state = LauncherStartupState {
                first_run_completed: state.first_run_completed,
                language: state.language,
            };
            Ok(if startup_state.first_run_completed { Some(startup_state) } else { None })
        }
        Err(error) => {
            println!("Invalid launcher startup state at '{}': {}", path.display(), error);
            Ok(None)
        }
    }
}

#[tauri::command]
fn save_launcher_startup_state(language: String) -> Result<LauncherStartupState, String> {
    let language = language.to_ascii_lowercase();
    if !matches!(language.as_str(), "en" | "ja" | "es" | "zh") {
        return Err(format!("Unsupported launcher language: {}", language));
    }

    let mut state = read_launcher_session_state()?;
    state.first_run_completed = true;
    state.language = language;
    write_launcher_session_state(&state)?;

    Ok(LauncherStartupState {
        first_run_completed: true,
        language: state.language,
    })
}

#[tauri::command]
fn get_background_video_audio_preference() -> Result<bool, String> {
    let state = read_launcher_session_state()?;
    Ok(state.background_video_audio_enabled)
}

#[tauri::command]
fn save_background_video_audio_preference(enabled: bool) -> Result<bool, String> {
    let mut state = read_launcher_session_state()?;
    state.background_video_audio_enabled = enabled;
    write_launcher_session_state(&state)?;
    Ok(enabled)
}

async fn ensure_local_dll(destination: &Path, url: &str) -> Result<(), String> {
    if let Some(parent_dir) = destination.parent() {
        std::fs::create_dir_all(parent_dir)
            .map_err(|e| format!("Failed to create directory '{}': {}", parent_dir.display(), e))?;
    }

    if destination.exists() {
        std::fs::remove_file(destination)
            .map_err(|e| format!("Failed to remove existing DLL '{}': {}", destination.display(), e))?;
        println!("Refreshed Tellurium.dll at: {}", destination.display());
    }

    download_file(url, destination).await
}

#[tauri::command]
async fn ensure_game_files(
    _app_handle: tauri::AppHandle,
    _path: String,
    _cancel: tauri::State<'_, DownloadCancel>,
) -> Result<(), String> {
    Ok(())
}

async fn download_and_extract_zip(url: &str, output_path: &Path) -> Result<(), String> {
    let _ = (url, output_path);
    Err("Legacy zip extraction path is no longer used".to_string())
}


pub fn suspend_process(pid: u32) -> (u32, bool) {
    unsafe {
        let mut has_err = false;
        let mut count: u32 = 0;
        let mut te: THREADENTRY32 = std::mem::zeroed();
        te.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;

        let snapshot: HANDLE = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if snapshot.is_null() {
            return (0, true);
        }

        if Thread32First(snapshot, &mut te) == 1 {
            loop {
                if pid == te.th32OwnerProcessID {
                    let tid = te.th32ThreadID;
                    let thread: HANDLE = OpenThread(THREAD_SUSPEND_RESUME, FALSE, tid);
                    if !thread.is_null() {
                        let result = SuspendThread(thread);
                        has_err |= result == u32::MAX;
                        CloseHandle(thread);
                        count += 1;
                    }
                }

                if Thread32Next(snapshot, &mut te) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
        (count, has_err)
    }
}

pub fn is_process_suspended(pid: u32) -> bool {
    unsafe {
        let mut is_suspended = true;

        let te: &mut THREADENTRY32 = &mut std::mem::zeroed();
        (*te).dwSize = std::mem::size_of::<THREADENTRY32>() as u32;

        let snapshot: HANDLE = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);

        if Thread32First(snapshot, te) == 1 {
            loop {
                if pid == (*te).th32OwnerProcessID {
                    let tid = (*te).th32ThreadID;

                    let thread: HANDLE = OpenThread(THREAD_SUSPEND_RESUME, FALSE, tid);
                    let suspend_count = SuspendThread(thread) as i32;

                    if suspend_count == -1i32 {
                        is_suspended = false;
                    } else {
                        is_suspended &= suspend_count > 0;
                        let _ = ResumeThread(thread);
                    }

                    CloseHandle(thread);
                }

                if Thread32Next(snapshot, te) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
        is_suspended
    }
}

async fn inject_dll_into_process(pid: usize, dll_name: &str, dll_url: &str) -> Result<(), String> {
    use winapi::um::processthreadsapi::OpenProcess;
    use winapi::um::winnt::PROCESS_ALL_ACCESS;
    use std::ffi::CString;

    println!("DLLインジェクション開始: PID={}, DLL={}", pid, dll_name);

    // Download DLL to temp location
    let temp_dir = std::env::temp_dir();
    let dll_temp_path = temp_dir.join(dll_name);
    
    download_file(dll_url, &dll_temp_path)
        .await
        .map_err(|e| format!("DLLダウンロード失敗: {}", e))?;

    let dll_path_str = dll_temp_path.to_str()
        .ok_or_else(|| "無効なDLLパス".to_string())?;
    let dll_path_wide = str_to_wide(dll_path_str);

    unsafe {
        // Open process with full access
        let h_process = OpenProcess(
            PROCESS_ALL_ACCESS,
            FALSE,
            pid as u32,
        );

        if h_process.is_null() {
            return Err(format!("プロセス(PID={})のオープン失敗", pid));
        }

        // Allocate memory in target process for DLL path
        let dll_path_len = dll_path_wide.len() * 2;
        let remote_buffer = VirtualAllocEx(
            h_process,
            std::ptr::null_mut(),
            dll_path_len,
            MEM_COMMIT | MEM_RESERVE,
            PAGE_READWRITE,
        );

        if remote_buffer.is_null() {
            CloseHandle(h_process);
            return Err("リモートメモリ割り当て失敗".to_string());
        }

        // Write DLL path to remote process memory
        let mut bytes_written: usize = 0;
        let write_result = WriteProcessMemory(
            h_process,
            remote_buffer,
            dll_path_wide.as_ptr() as *const std::ffi::c_void,
            dll_path_len,
            &mut bytes_written,
        );

        if write_result == 0 {
            CloseHandle(h_process);
            return Err("メモリ書き込み失敗".to_string());
        }

        // Get LoadLibraryW address
        let kernel32_name = str_to_wide("kernel32.dll");
        let h_kernel32 = GetModuleHandleW(kernel32_name.as_ptr());
        
        if h_kernel32.is_null() {
            CloseHandle(h_process);
            return Err("kernel32.dllの読み込み失敗".to_string());
        }

        let load_library_name = CString::new("LoadLibraryW")
            .map_err(|_| "CString変換失敗".to_string())?;
        let load_library_addr = GetProcAddress(
            h_kernel32 as *mut _,
            load_library_name.as_ptr(),
        );

        if load_library_addr.is_null() {
            CloseHandle(h_process);
            return Err("LoadLibraryWのアドレス取得失敗".to_string());
        }

        // Create remote thread to call LoadLibraryW
        let mut thread_id: u32 = 0;
        let h_thread = CreateRemoteThread(
            h_process,
            std::ptr::null_mut(),
            0,
            std::mem::transmute(load_library_addr),
            remote_buffer,
            0,
            &mut thread_id,
        );

        if h_thread.is_null() {
            CloseHandle(h_process);
            return Err("リモートスレッド作成失敗".to_string());
        }

        // Wait for thread to complete (with timeout)
        WaitForSingleObject(h_thread, 5000); // 5 seconds timeout

        // Cleanup
        CloseHandle(h_thread);
        CloseHandle(h_process);
        
        // Clean up temp DLL file
        let _ = std::fs::remove_file(&dll_temp_path);

        println!("DLLインジェクション完了: {}", dll_name);
        Ok(())
    }
}

async fn inject_dll_from_path(pid: usize, dll_name: &str, dll_path: &Path) -> Result<(), String> {
    use winapi::um::processthreadsapi::OpenProcess;
    use winapi::um::winnt::PROCESS_ALL_ACCESS;
    use std::ffi::CString;

    println!("DLLインジェクション開始: PID={}, DLL={} from {:?}", pid, dll_name, dll_path);

    let dll_path_str = dll_path.to_str()
        .ok_or_else(|| "無効なDLLパス".to_string())?;
    let dll_path_wide = str_to_wide(dll_path_str);

    unsafe {
        let h_process = OpenProcess(
            PROCESS_ALL_ACCESS,
            FALSE,
            pid as u32,
        );

        if h_process.is_null() {
            return Err(format!("プロセス(PID={})のオープン失敗", pid));
        }

        let dll_path_len = dll_path_wide.len() * 2;
        let remote_buffer = VirtualAllocEx(
            h_process,
            std::ptr::null_mut(),
            dll_path_len,
            MEM_COMMIT | MEM_RESERVE,
            PAGE_READWRITE,
        );

        if remote_buffer.is_null() {
            CloseHandle(h_process);
            return Err("リモートメモリ割り当て失敗".to_string());
        }

        let mut bytes_written: usize = 0;
        let write_result = WriteProcessMemory(
            h_process,
            remote_buffer,
            dll_path_wide.as_ptr() as *const std::ffi::c_void,
            dll_path_len,
            &mut bytes_written,
        );

        if write_result == 0 {
            CloseHandle(h_process);
            return Err("メモリ書き込み失敗".to_string());
        }

        let kernel32_name = str_to_wide("kernel32.dll");
        let h_kernel32 = GetModuleHandleW(kernel32_name.as_ptr());

        if h_kernel32.is_null() {
            CloseHandle(h_process);
            return Err("kernel32.dllの読み込み失敗".to_string());
        }

        let load_library_name = CString::new("LoadLibraryW")
            .map_err(|_| "CString変換失敗".to_string())?;
        let load_library_addr = GetProcAddress(
            h_kernel32 as *mut _,
            load_library_name.as_ptr(),
        );

        if load_library_addr.is_null() {
            CloseHandle(h_process);
            return Err("LoadLibraryWのアドレス取得失敗".to_string());
        }

        let mut thread_id: u32 = 0;
        let h_thread = CreateRemoteThread(
            h_process,
            std::ptr::null_mut(),
            0,
            std::mem::transmute(load_library_addr),
            remote_buffer,
            0,
            &mut thread_id,
        );

        if h_thread.is_null() {
            CloseHandle(h_process);
            return Err("リモートスレッド作成失敗".to_string());
        }

        WaitForSingleObject(h_thread, 5000);

        CloseHandle(h_thread);
        CloseHandle(h_process);

        println!("DLLインジェクション完了: {}", dll_name);
        Ok(())
    }
}

async fn collect_process_module_names(pid: u32) -> Result<HashSet<String>, String> {
    use winapi::um::tlhelp32::{
        CreateToolhelp32Snapshot, Module32First, Module32Next, TH32CS_SNAPMODULE, MODULEENTRY32,
    };
    use winapi::um::handleapi::CloseHandle;

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, pid);
        if snapshot == winapi::um::handleapi::INVALID_HANDLE_VALUE {
            return Err(format!("Failed to snapshot modules for PID {}", pid));
        }

        let mut entry: MODULEENTRY32 = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<MODULEENTRY32>() as u32;
        let mut modules = HashSet::new();

        let first = Module32First(snapshot, &mut entry);
        if first != 0 {
            loop {
                let module_name = std::ffi::CStr::from_ptr(entry.szModule.as_ptr())
                    .to_string_lossy()
                    .into_owned();
                let normalized = normalize_dll_name(&module_name);
                if !normalized.is_empty() {
                    modules.insert(normalized);
                }
                if Module32Next(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
        Ok(modules)
    }
}

async fn detect_injected_dlls(pid: u32, baseline: &HashSet<String>, allowed_modules: &HashSet<String>) -> Vec<String> {
    match collect_process_module_names(pid).await {
        Ok(current) => {
            let mut detected = current
                .difference(baseline)
                .filter_map(|module| {
                    let normalized = normalize_dll_name(module);
                    if allowed_modules.contains(&normalized) {
                        None
                    } else {
                        Some(normalized)
                    }
                })
                .collect::<Vec<_>>();
            detected.sort();
            detected
        }
        Err(err) => {
            println!("Failed to collect module snapshot for PID {}: {}", pid, err);
            vec![]
        }
    }
}

fn is_fortnite_process(pid: u32) -> bool {
    let mut system = System::new();
    system.refresh_processes();
    system
        .process(Pid::from_u32(pid))
        .map(|process| process.name().eq_ignore_ascii_case("FortniteClient-Win64-Shipping.exe"))
        .unwrap_or(false)
}

async fn monitor_for_unexpected_dlls(pid: u32, email: String, password: String) {
    if !is_fortnite_process(pid) {
        println!("Skipping DLL monitoring for non-Fortnite PID {}", pid);
        return;
    }

    let allowed_modules: HashSet<String> = [
        "kernel32.dll".to_string(),
        "ntdll.dll".to_string(),
        "user32.dll".to_string(),
        "gdi32.dll".to_string(),
        "advapi32.dll".to_string(),
        "ole32.dll".to_string(),
        "combase.dll".to_string(),
        "shell32.dll".to_string(),
        "ws2_32.dll".to_string(),
        "winmm.dll".to_string(),
        "ucrtbase.dll".to_string(),
        "vcruntime140.dll".to_string(),
        "msvcp140.dll".to_string(),
        "msvcp140d.dll".to_string(),
        "fortniteclient-win64-shipping.exe".to_string(),
        "fortnite.exe".to_string(),
        "fortniteclient-win64-shipping_be.exe".to_string(),
        "tellurium.dll".to_string(),
        "tellurium64.dll".to_string(),
        "tellurium32.dll".to_string(),
        "drop.dll".to_string(),
        "dropclient.dll".to_string(),
        "eor.dll".to_string(),
        "ror.dll".to_string(),
        "dpe.dll".to_string(),
        "client.dll".to_string(),
        "apex_clothing_x64.dll".to_string(),
        "apex_legacy_x64.dll".to_string(),
        "apexframework_x64.dll".to_string(),
        "cryptbase.dll".to_string(),
        "cryptnet.dll".to_string(),
        "cryptsp.dll".to_string(),
        "dbghelp.dll".to_string(),
        "devobj.dll".to_string(),
        "dhcpcsvc.dll".to_string(),
        "dhcpcsvc6.dll".to_string(),
        "directxdatabasehelper.dll".to_string(),
        "dnsapi.dll".to_string(),
        "drvstore.dll".to_string(),
        "dsparse.dll".to_string(),
        "edputil.dll".to_string(),
        "explorerframe.dll".to_string(),
        "gameux.dll".to_string(),
        "gfesdk.dll".to_string(),
        "mf.dll".to_string(),
        "mfplat.dll".to_string(),
        "mfplay.dll".to_string(),
        "msctf.dll".to_string(),
        "mswsock.dll".to_string(),
        "napinsp.dll".to_string(),
        "nlansp_c.dll".to_string(),
        "nsi.dll".to_string(),
        "ntmarta.dll".to_string(),
        "nvapi64.dll".to_string(),
        "nvgpucomp64.dll".to_string(),
        "nvldumdx.dll".to_string(),
        "nvmemmapstoragex.dll".to_string(),
        "nvmessagebus.dll".to_string(),
        "nvppex.dll".to_string(),
        "nvspcap64.dll".to_string(),
        "nvwgf2umx.dll".to_string(),
        "physx3_x64.dll".to_string(),
        "physx3common_x64.dll".to_string(),
        "physx3cooking_x64.dll".to_string(),
        "pxfoundation_x64.dll".to_string(),
        "pxpvdsdk_x64.dll".to_string(),
        "rsaenh.dll".to_string(),
        "rtworkq.dll".to_string(),
        "textinputframework.dll".to_string(),
        "textshaping.dll".to_string(),
        "twinapi.appcore.dll".to_string(),
        "dataexchange.dll".to_string(),
        "dcomp.dll".to_string(),
        "microsoft.internal.warppal.dll".to_string(),
        "windowscodecs.dll".to_string(),
        "winrnr.dll".to_string(),
        "wldp.dll".to_string(),
        "wshbth.dll".to_string(),
        "cabinet.dll".to_string(),
        "coreprivacysettingsstore.dll".to_string(),
        "dui70.dll".to_string(),
        "igc1464.dll".to_string(),
        "igc64.dll".to_string(),
        "igd10iumd64.dll".to_string(),
        "igd10um64xe.dll".to_string(),
        "igdgmm64.dll".to_string(),
        "imecfm.dll".to_string(),
        "imetip.dll".to_string(),
        "imjkapi.dll".to_string(),
        "imjpapi.dll".to_string(),
        "imjppred.dll".to_string(),
        "imjptip.dll".to_string(),
        "intelcontrollib.dll".to_string(),
        "oleacc.dll".to_string(),
        "policymanager.dll".to_string(),
        "wer.dll".to_string(),
        "audioses.dll".to_string(),
        "avrt.dll".to_string(),
        "discord-rpc.dll".to_string(),
        "libogg_64.dll".to_string(),
        "libvorbis_64.dll".to_string(),
        "libvorbisfile_64.dll".to_string(),
        "messagebus.dll".to_string(),
        "resourcepolicyclient.dll".to_string(),
        "xaudio2_7.dll".to_string(),
        "mfperfhelper.dll".to_string(),
        "midimap.dll".to_string(),
        "mmdevapi.dll".to_string(),
        "msacm32.dll".to_string(),
        "msacm32.drv".to_string(),
        "msauddecmft.dll".to_string(),
        "msmpeg2vdec.dll".to_string(),
        "nvcloth_x64.dll".to_string(),
        "wdmaud.drv".to_string(),
        "wdmaud2.drv".to_string(),
        "coreuicomponents.dll".to_string(),
        "sg_com.dll".to_string(),
        "wsock32.dll".to_string(),
        "msiso.dll".to_string(),
        "physxupdateloader64.dll".to_string(),
        "appxdeploymentclient.dll".to_string(),
        "imesearchdll.dll".to_string(),
        "googleimejatip64.dll".to_string(),
        "nvapi64_impl.dll".to_string(),
        "gpapi.dll".to_string(),
        "sdk_legacy_led_x64.dll".to_string(),
        "vcruntime140_1.dll".to_string(),
        "winnsi.dll".to_string(),
        "ondemandconnroutehelper.dll".to_string(),
        "onecorecommonproxystub.dll".to_string(),
        "onecoreuapcommonproxystub.dll".to_string(),
        "d2d1.dll".to_string(),
        "d3d11.dll".to_string(),
        "d3d12.dll".to_string(),
        "d3d9.dll".to_string(),
        "d3dcompiler_43.dll".to_string(),
        "d3dcompiler_47.dll".to_string(),
        "dxgi.dll".to_string(),
        "dinput8.dll".to_string(),
        "xinput1_3.dll".to_string(),
        "xinput1_4.dll".to_string(),
        "xinput9_1_0.dll".to_string(),
        "dwrite.dll".to_string(),
        "openconsole.exe".to_string(),
        "usp10.dll".to_string(),
        "igd10umt64xe.dll".to_string(),
        "appresolver.dll".to_string(),
        "bcp47langs.dll".to_string(),
        "dxcore.dll".to_string(),
        "ksuser.dll".to_string(),
        "mdnsnsp.dll".to_string(),
        "msvcp110_win.dll".to_string(),
        "nlaapi.dll".to_string(),
        "pnrpnsp.dll".to_string(),
        "shcore.dll".to_string(),
        "shlwapi.dll".to_string(),
        "slc.dll".to_string(),
        "sppc.dll".to_string(),
        "sspicli.dll".to_string(),
        "userenv.dll".to_string(),
        "windows.ui.appdefaults.dll".to_string(),
        "igd10um64gen11.dll".to_string(),
        "ebehmoni.dll".to_string(),
        "gfsdk_aftermath_lib.x64.dll".to_string(),
        "webio.dll".to_string(),
        "igd10um64gen11.dll".to_string(),
        "eossdk-win64-shipping.dll".to_string(),
        "discordhook64.dll".to_string(),
        "windhawk.dll".to_string(),
        "bcp47mrm.dll".to_string(),
        "clbcatq.dll".to_string(),
        "comctl32.dll".to_string(),
        "coremessaging.dll".to_string(),
        "iertutil.dll".to_string(),
        "mlang.dll".to_string(),
        "mrmcorer.dll".to_string(),
        "netutils.dll".to_string(),
        "propsys.dll".to_string(),
        "srvcli.dll".to_string(),
        "urlmon.dll".to_string(),
        "windows.staterepositoryclient.dll".to_string(),
        "windows.staterepositorycore.dll".to_string(),
        "windows.staterepositoryps.dll".to_string(),
        "windows.system.launcher.dll".to_string(),
        "windows.ui.dll".to_string(),
        "wininet.dll".to_string(),
        "wintypes.dll".to_string(),
        "kernel.appcore.dll".to_string(),
        "_nvngx.dll".to_string(),
        "hid.dll".to_string(),
        "libscepad.dll".to_string(),
        "nvcuda64.dll".to_string(),
        "nvdxgdmal64.dll".to_string(),
        "nvngx.dll".to_string(),
        "nvngx_dlss.dll".to_string(),
        "nvtelemetryapi64.dll".to_string(),
        "nvtelemetrybridge64.dll".to_string(),
        "xaudio2_9.dll".to_string(),
        "xaudio2_9redist.dll".to_string(),
        "wtdccm.dll".to_string(),
        "uxtheme.dll".to_string(),
        "160_e658700.bin".to_string(),
        "nvobjectloader64.dll".to_string(),
        "secur32.dll".to_string(),
        "rasadhlp.dll".to_string(),
        "fwpuclnt.dll".to_string(),
        "applicationtargetedfeaturedatabase.dll".to_string(),
        "devrtl.dll".to_string(),
        "spinf.dll".to_string(),
        "graphics-hook64.dll".to_string(),
        "bcryptprimitives.dll".to_string(),
        "fwpuclnt.dll".to_string(),
        "profapi.dll".to_string(),
        "rasadhlp.dll".to_string(),
        "discord-rpc-original.dll".to_string(),
        "discord-rpc-hook.dll".to_string(),
        "windows.storage.dll".to_string(),
        "medal-hook64.dll".to_string(),
        "amdihk64.dll".to_string(),
        "atiadlxx.dll".to_string(),
        "aticfx64.dll".to_string(),
        "atidxx64.dll".to_string(),
        "atiuxp64.dll".to_string(),
        "amdxc64.dll".to_string(),
        "d3d12core.dll".to_string(),
        "amdihk64.dll".to_string(),
        "concrt140.dll".to_string(),
        "rzchromasdk64.dll".to_string(),
        "160_b9393fc.bin".to_string(),
        "inputhost.dll".to_string(),
        "windowmanagementapi.dll".to_string(),
        "game_detour_64.dll".to_string(),
        "d3dscache.dll".to_string(),
        "imebrokerps.dll".to_string(),
        "mtf.dll".to_string(),
        "duser.dll".to_string(),
        "ime_textinputhelpers.dll".to_string(),
        "imebrokerps.dll".to_string(),
        "imjplmp.dll".to_string(),
        "mscand20.dll".to_string(),
        "msimg32.dll".to_string(),
        "xmllite.dll".to_string(),
        "pdh.dll".to_string(),
        "psapi.dll".to_string(),
        "d3d9on12.dll".to_string(),
        "audiodevprops2.dll".to_string(),
        "asm.plugin.audiodevprops2.dll".to_string(),
        "productinfo.dll".to_string(),
        "mskeyprotect.dll".to_string(),
        "nvdiagclt64.dll".to_string(),
        "amdenc64.dll".to_string(),
        "amdxx64.dll".to_string(),
        "dxilconv.dll".to_string(),
        "deviceaccess.dll".to_string(),
        "owexplorer.dll".to_string(),
        "winsta.dll".to_string(),
        "controllib.dll".to_string(),
        "igdext64.dll".to_string(),
        "firefox.exe".to_string(),
        "freebl3.dll".to_string(),
        "gkcodecs.dll".to_string(),
        "ktmw32.dll".to_string(),
        "lgpllibs.dll".to_string(),
        "d3dx9_43.dll".to_string(),
        "d3dx11_43.dll".to_string(),
        "mozglue.dll".to_string(),
        "threadpoolwinrt.dll".to_string(),
        "nss3.dll".to_string(),
        "softokn3.dll".to_string(),
        "igdgmm2_64.dll".to_string(),
        "xul.dll".to_string(),
        "wtsapi32.dll".to_string(),
        "ieframe.dll".to_string(),
        "owe-client-x64.dll".to_string(),
        "d3d10warp.dll".to_string(),
        "d3d11on12.dll".to_string(),
        "zlib1.dll".to_string(),
        "osksupport.dll".to_string(),
        "dubblemoveclient.dll".to_string(),
        "d3d10warp.dll".to_string(),
        "sptip.dll".to_string(),
        "pcacli.dll".to_string(),
        "gdiplus.dll".to_string(),
        "gfnruntimesdk.dll".to_string(),
        "igdmd64.dll".to_string(),
        "igdmd64v32.dll".to_string(),
        "igdml64.dll".to_string(),
        "gep-loader.dll".to_string(),
        "gep_fortnite.dll".to_string(),
        "gepplugin64.dll".to_string(),
        "libowgameevents64.dll".to_string(),
        "nvwgf2umx_cfg.dll".to_string(),
        "owclient.dll".to_string(),
        "owutils.dll".to_string(),
        "ninput.dll".to_string(),
        "netapi32.dll".to_string(),
        "wkscli.dll".to_string(),
        "apphelp.dll".to_string(),
        "mozc_tip64.dll".to_string(),
        "medal-hook64-v2.dll".to_string(),
        "mozc_tip64.dll".to_string(),
        "windows.fileexplorer.common.dll".to_string(),
        "msasn1.dll".to_string(),
        "ntasn1.dll".to_string(),
        "cryptdll.dll".to_string(),
        "umpdc.dll".to_string(),
        "igd12dxva64.dll".to_string(),
        "blitz_fortnite.dll".to_string(),
        "nvd3dumx.dll".to_string(),
        "dark-menus_1.4.2_711339.dll".to_string(),
        "invisible-borders_1.0.0_548427.dll".to_string(),
        "tmumevt64.dll".to_string(),
        "tmmon64.dll".to_string(),
        "kwsui64.dll".to_string(),
        "aswhook.dll".to_string(),
        "logitechled.dll".to_string(),
        "msvcp120.dll".to_string(),
        "msvcr120.dll".to_string(),
        "rtsshooks64.dll".to_string(),
        "ow-graphics-hook64.dll".to_string(),
        "servicingcommon.dll".to_string(),
        "sfc_os.dll".to_string()
    ].into_iter().collect();

    let baseline = match collect_process_module_names(pid).await {
        Ok(modules) => modules,
        Err(err) => {
            println!("Failed to collect baseline modules: {}", err);
            return;
        }
    };

    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    if !is_fortnite_process(pid) {
        println!("Stopping DLL monitoring because PID {} is no longer Fortnite", pid);
        return;
    }
    let initial_detected = detect_injected_dlls(pid, &baseline, &allowed_modules).await;
    if !initial_detected.is_empty() {
        let _ = report_unexpected_dlls(&email, &password, &initial_detected).await;
        println!("Unexpected DLLs detected immediately after launch in PID {}: {:?}", pid, initial_detected);
        return;
    }

    let mut last_seen: HashSet<String> = baseline.clone();

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        if !is_fortnite_process(pid) {
            println!("Stopping DLL monitoring because PID {} is no longer Fortnite", pid);
            return;
        }
        let current = match collect_process_module_names(pid).await {
            Ok(modules) => modules,
            Err(_) => continue,
        };

        if current == last_seen {
            continue;
        }

        let unexpected = find_unexpected_module_names(&current, &last_seen, &allowed_modules);
        if !unexpected.is_empty() {
            let mut normalized = unexpected;
            normalized.sort();
            let _ = report_unexpected_dlls(&email, &password, &normalized).await;
            println!("Unexpected DLLs detected in PID {}: {:?}", pid, normalized);
            last_seen = current;
            break;
        }

        last_seen = current;
    }
}

#[tauri::command]
async fn dll_replace(path: &str, app_handle: AppHandle, version: &str, reset_on_release: bool, disable_pre_edits: bool) -> Result<bool, String> {
    println!("Experience function called for path: {}", path);

    let _window = app_handle.get_webview_window("main").unwrap();
    println!("Got main window.");

    println!("Killed any existing processes.");

    let path = PathBuf::from(path);
    println!("Converted path to PathBuf: {:?}", path);

    // External anti-cheat software handles any DLL filtering or protection.
    println!("DLL replacement disabled: using external anti-cheat software instead.");
    Ok(true)
}

fn launch_suspended_processes(base_path: &str) -> Result<(), String> {
    let base = std::path::PathBuf::from(base_path);
    let processes = vec![
        ("FortniteLauncher.exe", "FortniteLauncher.exe"),
        ("FortniteClient-Win64-Shipping_BE.exe", "FortniteClient-Win64-Shipping_BE.exe"),
    ];

    for (exe_name, _display_name) in processes {
        let exe_path = base
            .join("FortniteGame")
            .join("Binaries")
            .join("Win64")
            .join(exe_name);

        if !exe_path.exists() {
            println!("Warning: {} not found at {:?}", exe_name, exe_path);
            continue;
        }

        let exe_wide = str_to_wide(exe_path.to_str().ok_or_else(|| "Invalid exe path".to_string())?);
        let cwd = exe_path.parent().ok_or_else(|| "Invalid cwd".to_string())?;
        let cwd_wide = str_to_wide(cwd.to_str().ok_or_else(|| "Invalid cwd path".to_string())?);

        unsafe {
            let mut si: STARTUPINFOW = std::mem::zeroed();
            si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
            let mut pi: PROCESS_INFORMATION = std::mem::zeroed();

            let created = CreateProcessW(
                exe_wide.as_ptr() as *mut u16,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                FALSE,
                CREATE_SUSPENDED,
                std::ptr::null_mut(),
                cwd_wide.as_ptr(),
                &mut si,
                &mut pi,
            );

            if created == 0 {
                return Err(format!("Failed to launch {}: {}", exe_name, io::Error::last_os_error()));
            }

            println!("Launched {} in suspended state (PID: {})", exe_name, pi.dwProcessId);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
        }
    }

    Ok(())
}

pub async fn launch_fn(
    path: &str,
    app_handle: AppHandle,
    email: String,
    password: String,
    eor: bool,
    version: String,
    reset_on_release: bool,
    disable_pre_edits: bool,
    double_movement: bool,
) -> Result<bool, String> {
    let base = std::path::PathBuf::from(path);

    if should_prepare_anti_cheat_assets(path, version.as_str()) {
        println!("Preparing AntiCheat assets for 12.41 install at {}", base.display());
        prepare_anti_cheat_assets(&base).await?;

        let tellurium_path = tellurium_storage_path()?;
        let tellurium_url = "https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Tellurium.dll";
        ensure_local_dll(&tellurium_path, tellurium_url).await?;

        let drop_pid = launch_drop_process(&base)?;
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        let drop_injection = inject_dll_from_path(drop_pid as usize, "Tellurium.dll", &tellurium_path).await;
        match drop_injection {
            Ok(_) => {
                println!("Tellurium.dll injected into Drop.exe (PID: {})", drop_pid);
            }
            Err(e) => {
                println!("Failed to inject Tellurium.dll into Drop.exe: {}", e);
                let _ = terminate_process_by_pid(drop_pid);
                return Err(format!("Tellurium.dll injection failed; Drop.exe was stopped: {}", e));
            }
        }
    }

    // AntiCheat is responsible for starting the game flow, so the launcher should not spawn
    // FortniteClient-Win64-Shipping.exe directly.
    println!("AntiCheat launch flow is active; skipping direct FortniteClient launch.");

    let _ = send_discord_notification(
        "✅ AntiCheat 起動開始",
        &format!("バージョン: {}", version),
        0x00FF00,
    ).await;

    Ok(true)
}

fn launch_game_exe(base_path: &str, dll_path: &Path, args: &[&str]) -> Result<u32, String> {
    let exe_path = Path::new(base_path)
        .join("FortniteGame")
        .join("Binaries")
        .join("Win64")
        .join("FortniteClient-Win64-Shipping.exe");

    if !exe_path.exists() {
        return Err(format!("Fortnite exe not found: {}", exe_path.display()));
    }

    let exe_wide = str_to_wide(exe_path.to_str().ok_or_else(|| "Invalid exe path".to_string())?);
    let current_dir = exe_path.parent().ok_or_else(|| "Invalid current directory".to_string())?;
    let cwd_wide = str_to_wide(current_dir.to_str().ok_or_else(|| "Invalid exe directory".to_string())?);

    let mut command_line = format!("\"{}\"", exe_path.display());
    if !args.is_empty() {
        command_line.push(' ');
        command_line.push_str(&args.join(" "));
    }
    let mut command_line_wide = str_to_wide(&command_line);

    unsafe {
        let mut si: STARTUPINFOW = std::mem::zeroed();
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();

        let created = CreateProcessW(
            exe_wide.as_ptr() as *mut u16,
            command_line_wide.as_mut_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            FALSE,
            CREATE_SUSPENDED,
            std::ptr::null_mut(),
            cwd_wide.as_ptr(),
            &mut si,
            &mut pi,
        );

        if created == 0 {
            return Err(format!("CreateProcessW failed: {}", io::Error::last_os_error()));
        }

        if !dll_path.exists() {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("DLL not found: {}", dll_path.display()));
        }

        let dll_path_wide = str_to_wide(dll_path.to_str().ok_or_else(|| "Invalid dll path".to_string())?);
        let size = (dll_path_wide.len() * std::mem::size_of::<u16>()) as usize;
        let remote_mem = VirtualAllocEx(pi.hProcess, std::ptr::null_mut(), size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);

        if remote_mem.is_null() {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("VirtualAllocEx failed: {}", io::Error::last_os_error()));
        }

        let write_ok = WriteProcessMemory(
            pi.hProcess,
            remote_mem,
            dll_path_wide.as_ptr() as *const _,
            size,
            std::ptr::null_mut(),
        );

        if write_ok == 0 {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("WriteProcessMemory failed: {}", io::Error::last_os_error()));
        }

        let kernel32 = GetModuleHandleW(str_to_wide("kernel32.dll").as_ptr());
        if kernel32.is_null() {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("GetModuleHandleW failed: {}", io::Error::last_os_error()));
        }

        let load_library = GetProcAddress(kernel32, b"LoadLibraryW\0".as_ptr() as *const i8);
        if load_library.is_null() {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("GetProcAddress LoadLibraryW failed: {}", io::Error::last_os_error()));
        }

        let remote_thread = CreateRemoteThread(
            pi.hProcess,
            std::ptr::null_mut(),
            0,
            std::mem::transmute(load_library),
            remote_mem,
            0,
            std::ptr::null_mut(),
        );

        if remote_thread.is_null() {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("CreateRemoteThread failed: {}", io::Error::last_os_error()));
        }

        let wait_result = WaitForSingleObject(remote_thread, INFINITE);
        if wait_result == 0xFFFFFFFF {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(remote_thread);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("WaitForSingleObject failed: {}", io::Error::last_os_error()));
        }

        CloseHandle(remote_thread);

        if ResumeThread(pi.hThread) == u32::MAX {
            let _ = TerminateProcess(pi.hProcess, 1);
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
            return Err(format!("ResumeThread failed: {}", io::Error::last_os_error()));
        }

        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);

        let pid = pi.dwProcessId;
        CURRENT_GAME_PID.store(pid, Ordering::SeqCst);
        println!("Started Fortnite exe with injection: {} (pid={})", exe_path.display(), pid);
        Ok(pid)
    }
}


#[derive(Debug, serde::Deserialize, serde::Serialize)]
struct ServerStatus {
    #[serde(rename = "isServerReady")]
    is_server_ready: bool,
}

#[tauri::command]
async fn check_server_status() -> Result<ServerStatus, String> {
    // Minimal stub: assume server ready
    Ok(ServerStatus { is_server_ready: true })
}

#[tauri::command]
fn open_windows_security() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg("windowsdefender:")
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open Windows Security: {}", e))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows Security is only available on Windows".to_string())
    }
}

async fn check_discord_role(email: &str, password: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let base = backend_base_url();
    if base.is_empty() {
        return Err("Backend URL is not configured. Set DROP_BACKEND_URL.".to_string());
    }
    let url = format!("{}/api/launcher/discordrole", base);

    let response = client
        .get(url)
        .query(&[("email", email), ("password", password)])
        .send()
        .await
        .map_err(|e| format!("Discord role check request failed: {}", e))?;

    if !response.status().is_success() {
        let status_code = response.status().as_u16();
        let resp_text = response.text().await.unwrap_or_else(|_| "<failed to read response body>".to_string());
        return Err(format!("Discord role check failed: {} - {}", status_code, resp_text));
    }

    let role_data: DiscordRoleResponse = response.json().await.map_err(|e| format!("Failed to parse Discord role response: {}", e))?;
    let tester_role_id = "1529489822044131448";
    let admin_role_id = "1529805570671120444";
    let has_tester_role = role_data.role_ids.iter().any(|role_id| role_id == tester_role_id);
    let has_admin_role = role_data.role_ids.iter().any(|role_id| role_id == admin_role_id);

    if !has_tester_role && !has_admin_role {
        return Err("あなたはこのゲームをプレイする権限がありません。".to_string());
    }

    Ok(role_data.role_ids)
}

#[tauri::command]
async fn email_login(email: String, password: String, skip_role_check: Option<bool>, app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let role_ids = if skip_role_check.unwrap_or(false) {
        Vec::new()
    } else {
        check_discord_role(&email, &password).await?
    };

    let client = reqwest::Client::new();
    let base = backend_base_url();
    if base.is_empty() {
        return Err("Backend URL is not configured. Set DROP_BACKEND_URL.".to_string());
    }

    let normalized_base = base.trim_end_matches('/');
    let candidate_urls = vec![
        format!("{}/drop/server/api/v1/launcher/login", normalized_base),
        format!("{}/api/launcher/login", normalized_base),
    ];

    let mut last_error: Option<String> = None;

    for url in candidate_urls {
        let response = match client
            .get(&url)
            .query(&[("email", &email), ("password", &password)])
            .send()
            .await
        {
            Ok(response) => response,
            Err(e) => {
                last_error = Some(format!("request failed: {}", e));
                continue;
            }
        };

        let status = response.status();
        let status_code = status.as_u16();
        let resp_text = response.text().await.unwrap_or_else(|_| "<failed to read response body>".to_string());

        if status.is_success() {
            let mut json: serde_json::Value = serde_json::from_str(&resp_text)
                .map_err(|e| format!("Failed to parse login response: {} - {}", e, resp_text))?;

            let tester_role_id = "1529489822044131448";
            let admin_role_id = "1529805570671120444";
            let has_tester_role = role_ids.iter().any(|role_id| role_id == tester_role_id);
            let has_admin_role = role_ids.iter().any(|role_id| role_id == admin_role_id);

            let role_payload = serde_json::json!({
                "name": if has_admin_role { "Admin" } else if has_tester_role { "Tester" } else { "User" },
                "color": if has_admin_role { "#ef4444" } else if has_tester_role { "#8b5cf6" } else { "#999999" },
                "badge": if has_admin_role { serde_json::json!("Admin") } else if has_tester_role { serde_json::json!("Tester") } else { serde_json::Value::Null },
                "hasTesterRole": has_tester_role,
                "hasAdminRole": has_admin_role,
                "roleId": if has_admin_role { serde_json::json!(admin_role_id) } else if has_tester_role { serde_json::json!(tester_role_id) } else { serde_json::Value::Null }
            });
            json["role"] = role_payload;
            json["hasTesterRole"] = serde_json::json!(has_tester_role);
            json["hasAdminRole"] = serde_json::json!(has_admin_role);
            json["roleBadge"] = if has_admin_role { serde_json::json!("Admin") } else if has_tester_role { serde_json::json!("Tester") } else { serde_json::Value::Null };

            if let Some(token) = json.get("token").and_then(|t| t.as_str()) {
                let _ = store_token(token, &app_handle);
            }

            return Ok(json);
        }

        last_error = Some(format!("Login request failed: {} - {}", status_code, resp_text));

        if status_code == 404 {
            continue;
        }

        let error_msg = last_error.clone().unwrap_or_else(|| "Unknown login error".to_string());
        let _ = send_discord_notification(
            "❌ ログイン失敗",
            &format!("メール: {}\nエラー: {}", email, error_msg),
            0xFF0000,
        ).await;
        return Err(error_msg);
    }

    let error_msg = last_error.unwrap_or_else(|| "Login request failed: unknown error".to_string());
    let _ = send_discord_notification(
        "❌ ログイン失敗",
        &format!("メール: {}\nエラー: {}", email, error_msg),
        0xFF0000,
    ).await;
    Err(error_msg)
}

#[derive(Debug, Serialize, Deserialize)]
struct ServerStats {
    #[serde(rename = "server_count")]
    servers: i32,
    #[serde(rename = "player_count")]
    players: i32,
}

fn get_stats_file_path() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push("server_stats.json");
    path
}

#[tauri::command]
async fn fetch_server_stats() -> Result<ServerStats, String> {
    let client = reqwest::Client::new();
    let url = get_env_value("DROP_SERVER_STATS_URL").unwrap_or_default();
    if url.is_empty() {
        return Err("Server stats endpoint is not configured. Set DROP_SERVER_STATS_URL.".to_string());
    }
    
    match client.get(url).send().await {
        Ok(response) => {
            if !response.status().is_success() {
                return Err(format!("API returned error status: {}", response.status()));
            }
            
            match response.json::<ServerStats>().await {
                Ok(stats) => {
           
                    let stats_path = get_stats_file_path();
                    if let Ok(stats_json) = serde_json::to_string(&stats) {
                        let _ = std::fs::write(stats_path, stats_json);
                    }
                    Ok(stats)
                },
                Err(e) => Err(format!("Failed to parse server stats: {}", e))
            }
        },
        Err(e) => Err(format!("Could not fetch server stats: {}", e))
    }
}

#[tauri::command]
async fn fetch_drop_server_data() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = get_env_value("DROP_STATS_URL").unwrap_or_default();
    if url.is_empty() {
        return Err("Drop stats endpoint is not configured. Set DROP_STATS_URL.".to_string());
    }
    
    match client.get(url).send().await {
        Ok(response) => {
            if !response.status().is_success() {
                return Err(format!("API returned error status: {}", response.status()));
            }
            
            match response.json::<serde_json::Value>().await {
                Ok(data) => {
                    println!("Successfully fetched drop server data: {:?}", data);
                    Ok(data)
                },
                Err(e) => Err(format!("Failed to parse server data: {}", e))
            }
        },
        Err(e) => Err(format!("Could not fetch drop server data: {}", e))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ShopItem {
    id: i32,
    #[serde(rename = "cosmeticId")]
    cosmetic_id: String,
    name: String,
    price: i32,
    #[serde(rename = "featuredIcon")]
    featured_icon: String,
    icon: String,
    rarity: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ShopData {
    featured: Vec<ShopItem>,
    daily: Vec<ShopItem>,
    custom_sections: std::collections::HashMap<String, Vec<ShopItem>>,
    expiration: Option<String>,
}

fn get_shop_cache_path() -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push("shop_data.json");
    path
}

#[tauri::command]
async fn fetch_shop_items() -> Result<ShopData, String> {
    let client = reqwest::Client::new();
    let backend_shop_url = format!("{}/api/launcher/shop", backend_base_url());
    if backend_base_url().is_empty() {
        return Err("Backend URL is not configured. Set DROP_BACKEND_URL.".to_string());
    }

    match client.get(backend_shop_url).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<ShopData>().await {
                    Ok(shop) => return Ok(shop),
                    Err(e) => return Err(format!("Failed to parse shop data from backend: {}", e)),
                }
            } else {
                return Err(format!("Backend returned error status: {}", resp.status()));
            }
        }
        Err(e) => {
            return Err(format!("Failed to fetch shop from backend: {}", e));
        }
    }
}

async fn fetch_item_details(client: &reqwest::Client, id: &str) -> Result<(String, String), String> {
    let url = format!("https://fortnite-api.com/v2/cosmetics/br/{}", id);
    
    let response = match client.get(&url).send().await {
        Ok(resp) => resp,
        Err(e) => return Err(format!("Failed to fetch item details: {}", e)),
    };
    
    if !response.status().is_success() {
        return Err(format!("API returned error status: {}", response.status()));
    }
    
    let data: serde_json::Value = match response.json().await {
        Ok(data) => data,
        Err(e) => return Err(format!("Failed to parse item details: {}", e)),
    };
    
    let rarity = data.get("data")
        .and_then(|d| d.get("rarity"))
        .and_then(|r| r.get("value"))
        .and_then(|b| b.as_str())
        .unwrap_or("unknown");
    
    let name = data.get("data")
        .and_then(|d| d.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or(id);
    
    Ok((rarity.to_string(), name.to_string()))
}

fn kill_named_process(name: &str) -> bool {
    match std::process::Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .args(&["/C", "taskkill /F /IM", name])
        .status()
    {
        Ok(status) => status.success(),
        Err(_) => false,
    }
}

#[tauri::command]
async fn stop_game_process() -> Result<(), String> {
    let main_pid = CURRENT_GAME_PID.load(Ordering::SeqCst);
    let launcher_pid = LAUNCHER_PID.load(Ordering::SeqCst);

    let mut system = System::new();
    system.refresh_processes();

    let mut killed_any = false;

    if main_pid != 0 {
        if let Some(process) = system.process(Pid::from_u32(main_pid)) {
            if process.kill() {
                println!("Successfully terminated main game process with PID: {}", main_pid);
                killed_any = true;
            }
        }
        CURRENT_GAME_PID.store(0, Ordering::SeqCst);
    }
    close_game_job_handles();

    if launcher_pid != 0 {
        if let Some(process) = system.process(Pid::from_u32(launcher_pid)) {
            if process.kill() {
                println!("Successfully terminated launcher process with PID: {}", launcher_pid);
                killed_any = true;
            }
        }
        LAUNCHER_PID.store(0, Ordering::SeqCst);
    }

    let additional_processes = [
        "FortniteClient-Win64-Shipping_BE.exe",
        "FortniteClient-Win64-Shipping.exe",
        "FortniteLauncher.exe",
        "EpicGamesLauncher.exe",
    ];
    for process_name in additional_processes {
        if kill_named_process(process_name) {
            println!("Successfully terminated process: {}", process_name);
            killed_any = true;
        }
    }

    if killed_any {
        let _ = send_discord_notification(
            "🛑 ゲーム停止",
            &format!("メインPID: {}\nランチャーPID: {}", main_pid, launcher_pid),
            0xFFA500,
        ).await;
        Ok(())
    } else {
        Err("No game processes running".to_string())
    }
}

#[tauri::command]
async fn is_game_running() -> Result<bool, String> {
    let main_pid = CURRENT_GAME_PID.load(Ordering::SeqCst);
    let launcher_pid = LAUNCHER_PID.load(Ordering::SeqCst);

    if main_pid == 0 && launcher_pid == 0 {
        return Ok(false);
    }

    let mut system = System::new();
    system.refresh_processes();

    let mut any_running = false;

    if main_pid != 0 {
        if system.process(Pid::from_u32(main_pid)).is_some() {
            any_running = true;
        } else {
            CURRENT_GAME_PID.store(0, Ordering::SeqCst);
        }
    }

    if launcher_pid != 0 {
        if system.process(Pid::from_u32(launcher_pid)).is_some() {
            any_running = true;
        } else {
            LAUNCHER_PID.store(0, Ordering::SeqCst);
        }
    }

    Ok(any_running)
}

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
struct Session {
    started: bool,
    #[serde(rename = "ownerId")]
    owner_id: String,
    #[serde(rename = "publicPlayers")]
    public_players: Vec<String>,
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "sessionName")]
    session_name: String,
}

#[tauri::command]
async fn fetch_sessions() -> Result<Vec<Session>, String> {
    let client = reqwest::Client::new();
    let url = "ur_sessions_url";
    
    match client.get(url).send().await {
        Ok(response) => {
            if !response.status().is_success() {
                return Err(format!("API returned error status: {}", response.status()));
            }
            
            match response.json::<Vec<Session>>().await {
                Ok(sessions) => Ok(sessions),
                Err(e) => Err(format!("Failed to parse sessions: {}", e))
            }
        },
        Err(e) => Err(format!("Could not fetch sessions: {}", e))
    }
}

#[tauri::command]
async fn require_admin_for_login() -> Result<bool, String> {
    // Regular launcher use does not require administrator privileges.
    Ok(true)
}

#[cfg(target_os = "windows")]
unsafe fn is_elevated() -> bool {
    let mut token: HANDLE = std::ptr::null_mut();
    if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
        return false;
    }
    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut returned_size: u32 = 0;
    let result = GetTokenInformation(
        token,
        TokenElevation,
        &mut elevation as *mut _ as *mut _,
        std::mem::size_of::<TOKEN_ELEVATION>() as u32,
        &mut returned_size,
    );
    CloseHandle(token);
    result != 0 && elevation.TokenIsElevated != 0
}

#[cfg(target_os = "windows")]
fn relaunch_as_admin() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("実行ファイル取得エラー: {}", e))?;
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let args_str = args
        .iter()
        .map(|arg| {
            let s: String = arg.to_string_lossy().into_owned();
            if s.contains(' ') {
                format!("\"{}\"", s)
            } else {
                s
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    let exe_wide = str_to_wide(&exe_path.to_string_lossy());
    let verb_wide = str_to_wide("runas");
    let params_wide = if args_str.is_empty() {
        Vec::new()
    } else {
        str_to_wide(&args_str)
    };

    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb_wide.as_ptr(),
            exe_wide.as_ptr(),
            if params_wide.is_empty() {
                std::ptr::null()
            } else {
                params_wide.as_ptr()
            },
            std::ptr::null(),
            winapi::um::winuser::SW_SHOWNORMAL,
        )
    };

    if result as isize <= 32 {
        Err(format!("ShellExecuteW failed: {}", result as isize))
    } else {
        Ok(())
    }
}

fn main() {
    let versions_state = VersionState(Mutex::new(HashMap::new()));
    let discord_rpc_state = Arc::new(DiscordRpcState::new());

    let deep_link_enabled = std::panic::catch_unwind(|| {
        tauri_plugin_deep_link::prepare("Drop");
    })
    .map(|_| true)
    .unwrap_or_else(|_| {
        println!("Warning: deep link prepare failed, continuing without deep link support.");
        false
    });

    // If this process was invoked with a deep-link while another launcher is
    // already running, forward the deep-link to the existing instance and
    // exit so we keep a single active launcher process handling login.
    forward_deeplink_to_existing_instance_if_needed();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(versions_state)
        .manage(discord_rpc_state.clone())
        .manage(DownloadCancel(Arc::new(AtomicBool::new(false))))
        .setup(move |app| {
            let versions = load_versions(&app.handle());
            for version in versions.values() {
                if let Err(err) = remove_legacy_drop_mod_files_at_path(Path::new(&version.path)) {
                    println!("Failed to remove legacy DropClient files at startup for {}: {}", version.path, err);
                }
            }
            let state = app.state::<VersionState>();
            *state.0.lock().unwrap() = versions;
            
            let window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();
            // Start watcher to pick up forwarded deep-links from second instances
            spawn_incoming_file_watcher(app_handle.clone(), window.clone());
            let window_for_close = window.clone();

            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let main_pid = CURRENT_GAME_PID.load(Ordering::SeqCst);
                    let mut should_kill_launcher = false;

                    if main_pid == 0 {
                        should_kill_launcher = true;
                    } else {
                        let mut system = System::new();
                        system.refresh_processes();
                        if system.process(Pid::from_u32(main_pid)).is_none() {
                            should_kill_launcher = true;
                        }
                    }

                    api.prevent_close();
                    if should_kill_launcher {
                        let _ = std::process::Command::new("cmd")
                            .creation_flags(CREATE_NO_WINDOW)
                            .args(&["/C", "taskkill", "/F", "/IM", "Drop.exe", "/T"])
                            .spawn();
                    } else {
                        let _ = window_for_close.hide();
                    }
                }
            });
                
            let app_handle_monitor = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    let main_pid = CURRENT_GAME_PID.load(Ordering::SeqCst);
                    if main_pid == 0 {
                        continue;
                    }

                    let mut system = System::new();
                    system.refresh_processes();
                    if system.process(Pid::from_u32(main_pid)).is_none() {
                        println!("Detected Fortnite process exit, terminating launcher.");
                        let _ = std::process::Command::new("cmd")
                            .creation_flags(CREATE_NO_WINDOW)
                            .args(&["/C", "taskkill", "/F", "/IM", "Drop.exe", "/T"])
                            .spawn();
                        app_handle_monitor.exit(0);
                        break;
                    }
                }
            });
                
            if deep_link_enabled {
                if let Err(err) = tauri_plugin_deep_link::register("droplauncher", move |request| {
                    let re = Regex::new(r"(?i)droplauncher://auth/?[?]launcherToken=(.+)").unwrap();
                    
                    if let Some(captures) = re.captures(request.as_str()) {
                        if let Some(result) = captures.get(1) {
                            let token = urlencoding::decode(result.as_str())
                                .unwrap_or_else(|_| result.as_str().to_string().into())
                                .to_string();

                            if let Err(e) = store_token(&token, &app_handle) {
                                println!("could not store token: {}", e);
                            }
                            
                            let window_clone = window.clone();
                            
                            tauri::async_runtime::spawn(async move {
                                window_clone.show().unwrap();
                                window_clone.set_focus().unwrap();

                                match decode_launcher_token(&token).await {
                                    Ok(user_info) => {
                                        println!("Loaded authenticated user profile");

                                        if !user_info.has_tester_role && !user_info.has_admin_role {
                                            window_clone.emit("login-error", "あなたはこのゲームをプレイする権限がありません。" ).unwrap();
                                            return;
                                        }

                                        let payload = serde_json::json!({
                                            "username": user_info.username,
                                            "accountId": user_info.account_id,
                                            "email": user_info.email,
                                            "password": user_info.password,
                                            "avatar_url": user_info.avatar_url,
                                            "favoriteSkin": user_info.favorite_skin,
                                            "mtxCurrency": user_info.mtx_currency,
                                            "hype": user_info.hype,
                                            "discordId": user_info.discord_id,
                                            "avatarHash": user_info.avatar_hash,
                                            "role": {
                                                "name": user_info.role.name,
                                                "color": user_info.role.color,
                                                "badge": user_info.role_badge,
                                                "hasTesterRole": user_info.has_tester_role,
                                                "hasAdminRole": user_info.has_admin_role,
                                                "roleId": user_info.role_id
                                            },
                                            "roleBadge": user_info.role_badge,
                                            "hasTesterRole": user_info.has_tester_role,
                                            "hasAdminRole": user_info.has_admin_role,
                                            "roleId": user_info.role_id
                                        });
                                        
                                        window_clone.emit("login-success", payload).unwrap();
                                    },
                                    Err(e) => {
                                        println!("error decoding token: {}", e);
                                        window_clone.emit("login-error", "Token Authorization failed.").unwrap();
                                    }
                                }
                            });
                        }
                    } else if let Some(payload_value) = parse_login_payload_from_request(request.as_str()) {
                        let payload = build_login_success_payload(&payload_value);
                        println!("Parsed login payload from deep link");
                        window.emit("login-success", payload).unwrap();
                    } else {
                        println!("No matching regex found in request: {}", request);
                        println!("Expected format: droplauncher://auth?launcherToken=<token> or query/json payload");
                        window.emit("login-error", "Login failed or unknown forwarded URL format").unwrap();
                    }
                }) {
                    println!("Failed to register deep link handler: {}", err);
                }
            } else {
                println!("Deep link support disabled: not registering handler.");
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_events,
            email_login,
            check_stored_token,
            clear_stored_token,
            require_admin_for_login,
            check_stored_credentials,
            check_banned,
            save_credentials,
            clear_stored_credentials,
            check_version,
            backend_proxy,
            detect_fortnite_version,
            add_version,
            get_versions,
            remove_version,
            fetch_builds,
            get_versions_with_status,
            version_card_clicked,
            ensure_game_files,
            dll_replace,
            check_server_status,
            open_windows_security,
            fetch_server_stats,
            fetch_drop_server_data,
            get_app_version,
            download_and_install_update,
            clear_download_cancel,
            cancel_download,
            download_and_extract_version,
            fetch_shop_items,
            fetch_sessions,
            stop_game_process,
            is_game_running,
            is_fortnite_window_visible,
            discord_rpc_init,
            discord_rpc_set_activity,
            discord_rpc_clear_activity,
            discord_rpc_disconnect,
            send_feedback,
            close_launch_splash,
            get_launcher_startup_state,
            save_launcher_startup_state,
            get_background_video_audio_preference,
            save_background_video_audio_preference,
            get_cached_user_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn color_to_hex_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let color_int: i32 = serde::Deserialize::deserialize(deserializer)?;
    Ok(format!("#{:06X}", color_int as u32))
}
