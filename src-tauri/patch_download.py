from pathlib import Path

path = Path('src/main.rs')
text = path.read_text(encoding='utf-8')
lines = text.splitlines(True)
start = 256
end = 520
new_code = '''async fn download_and_extract_version(
    app_handle: tauri::AppHandle,
    version: String,
    output_path: String,
    cancel: tauri::State<'_, DownloadCancel>,
) -> Result<(), String> {
    cancel.0.store(false, Ordering::SeqCst);

    let download_url = match version.as_str() {
        "12.41" => "",
        _ => return Err("Unsupported version".to_string()),
    };

    if !Path::new(&output_path).exists() {
        fs::create_dir_all(&output_path)
            .map_err(|e| format!("Failed to create output directory '{}': {}", output_path, e))?;
    }

    let client = reqwest::Client::new();
    let mut temp_zip_path = std::env::temp_dir();
    temp_zip_path.push(format!("drop_download_{}.zip", version.replace('.', "_")));

    let existing_size = if temp_zip_path.exists() {
        fs::metadata(&temp_zip_path)
            .map_err(|e| format!("Failed to stat temp zip file: {}", e))?
            .len()
    } else {
        0
    };

    let total_size = match client.head(download_url).send().await {
        Ok(resp) => resp.content_length().unwrap_or(0),
        Err(_) => 0,
    };

    app_handle
        .emit(
            "download-progress",
            DownloadProgress {
                stage: "download".to_string(),
                percent: if existing_size > 0 {
                    if total_size > 0 {
                        ((existing_size as f64 / total_size as f64) * 100.0).min(100.0) as u8
                    } else {
                        0
                    }
                } else {
                    0
                },
                message: if existing_size > 0 {
                    "Resuming download...".to_string()
                } else {
                    "Starting download...".to_string()
                },
            },
        )
        .map_err(|e| format!("Failed to emit progress event: {}", e))?;

    let mut request = client.get(download_url);
    if existing_size > 0 {
        if let Ok(range_value) = HeaderValue::from_str(&format!("bytes={}-", existing_size)) {
            request = request.header(reqwest::header::RANGE, range_value);
        }
    }

    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Failed to download version {}: {}", version, e))?;

    let status = response.status();
    let mut downloaded = existing_size;
    let mut temp_zip_file = if existing_size > 0 {
        match status {
            reqwest::StatusCode::PARTIAL_CONTENT => std::fs::OpenOptions::new()
                .append(true)
                .open(&temp_zip_path)
                .map_err(|e| format!("Failed to open temp zip for appending: {}", e))?,
            reqwest::StatusCode::OK => {
                downloaded = 0;
                File::create(&temp_zip_path)
                    .map_err(|e| format!("Failed to create temporary zip file: {}", e))?
            }
            reqwest::StatusCode::RANGE_NOT_SATISFIABLE => {
                let _ = fs::remove_file(&temp_zip_path);
                downloaded = 0;
                let retry_response = client
                    .get(download_url)
                    .send()
                    .await
                    .map_err(|e| format!("Failed to download version {}: {}", version, e))?;
                if !retry_response.status().is_success() {
                    return Err(format!(
                        "Failed to download version {}, status: {}",
                        version,
                        retry_response.status()
                    ));
                }
                response = retry_response;
                File::create(&temp_zip_path)
                    .map_err(|e| format!("Failed to create temporary zip file: {}", e))?
            }
            _ => {
                return Err(format!("Failed to resume download {}, status: {}", version, status));
            }
        }
    } else {
        if !status.is_success() {
            return Err(format!("Failed to download version {}, status: {}", version, status));
        }
        File::create(&temp_zip_path)
            .map_err(|e| format!("Failed to create temporary zip file: {}", e))?
    };

    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        if cancel.0.load(Ordering::SeqCst) {
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Failed to download version {}: {}", version, e))?;
        downloaded += chunk.len() as u64;
        temp_zip_file
            .write_all(&chunk)
            .map_err(|e| format!("Failed to write temp zip chunk: {}", e))?;

        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8
        } else {
            0
        };

        app_handle
            .emit(
                "download-progress",
                DownloadProgress {
                    stage: "download".to_string(),
                    percent,
                    message: if total_size > 0 {
                        format!("Downloading {}%", percent)
                    } else {
                        "Downloading...".to_string()
                    },
                },
            )
            .map_err(|e| format!("Failed to emit progress event: {}", e))?;
    }

    temp_zip_file
        .flush()
        .map_err(|e| format!("Failed to flush temporary zip file: {}", e))?;
    drop(temp_zip_file);

    let temp_zip_file = File::open(&temp_zip_path)
        .map_err(|e| format!("Failed to open temporary zip file: {}", e))?;
    let mut archive = ZipArchive::new(temp_zip_file)
        .map_err(|e| format!("Failed to open zip archive: {}", e))?;

    let total_files = archive.len().max(1);
    for i in 0..archive.len() {
        if cancel.0.load(Ordering::SeqCst) {
            return Err("Download cancelled".to_string());
        }

        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        let outpath = Path::new(&output_path).join(file.mangled_name());

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory '{}': {}", outpath.display(), e))?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
        }

        let mut outfile = File::create(&outpath)
            .map_err(|e| format!("Failed to create file '{}': {}", outpath.display(), e))?;
        io::copy(&mut file, &mut outfile)
            .map_err(|e| format!("Failed to extract file '{}': {}", outpath.display(), e))?;

        let percent = (((i + 1) as f64 / total_files as f64) * 100.0).min(100.0) as u8;
        app_handle
            .emit(
                "download-progress",
                DownloadProgress {
                    stage: "extract".to_string(),
                    percent,
                    message: format!("Extracting {}/{}", i + 1, total_files),
                },
            )
            .map_err(|e| format!("Failed to emit progress event: {}", e))?;
    }

    if let Err(e) = fs::remove_file(&temp_zip_path) {
        println!("Warning: failed to remove temp zip file: {}", e));
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

    Ok(())
}
'''.splitlines(True)
lines[start:end] = new_code
path.write_text(''.join(lines), encoding='utf-8')
print('patched')
