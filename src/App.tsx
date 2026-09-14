import "./styles/App.css";
import LoginContainer from "./components/LoginContainer";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, createContext, Dispatch, SetStateAction } from "react";
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { motion } from "framer-motion";
import Friends from './pages/Friends';
import Library from './pages/Library';
import Layout from './components/Layout';
import Shop from './pages/Shop';
import Leaderboard from './pages/Leaderboard';
import Server from './pages/Server';
import Servers from './pages/Servers';
import LaunchVersion from "./pages/LaunchVersion";
import Music from './pages/Music';
import Home from './pages/Home';
import Stats from './pages/Stats';
import AdminPage from './pages/Admin';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import MusicPlayer from './components/MusicPlayer';
import BackgroundMedia from './components/BackgroundMedia';
import { initializeSecurity } from './utils/security';
import { discordRPC } from './utils/discordRPC';
import t from './utils/i18n';
 



export const ShopContext = createContext<{
  shopData: any | null;
  isLoading: boolean;
  error: string | null;
  timeUntilRefresh: string;
}>({
  shopData: null,
  isLoading: false,
  error: null,
  timeUntilRefresh: '',
});

interface LoginSuccessPayload {
  username: string;
  accountId: string;
  email: string;
  password: string;
  avatar_url: string;
  favoriteSkin: string;
  discordId?: string;
  avatarHash?: string;
  role: {
    name: string;
    color: string;
    badge?: string | null;
    hasTesterRole?: boolean;
    hasAdminRole?: boolean;
    roleId?: string | null;
  };
  roleBadge?: string | null;
  hasTesterRole?: boolean;
  hasAdminRole?: boolean;
  roleId?: string | null;
}

interface VersionCheckResponse {
  type: 'UPDATE' | 'NO_UPDATE';
  download_url?: string;
}

interface LauncherStartupState {
  firstRunCompleted: boolean;
  language: string;
}

interface Event {
  id: number;
  name: string;
  card_name: string;
  thumbnail: string;
  event_background: string;
  event_description: string;
  button_text: string;
  button_redirect_url: string;
  button_color: string;
  button_text_color: string;
  active: boolean;
  audio_url?: string;
  frame_text: string;
  ButtonIco?: string;
  IcoColor?: string;
}

//testing for when login doesnt work
const TESTING = false;
const FALLBACK_BACKEND_URL = 'http://35.221.95.153:3551';
const BACKEND_URL = (((import.meta as any).env?.VITE_BACKEND_URL as string) || FALLBACK_BACKEND_URL).trim();
const DISCORD_AUTH_URL = (((import.meta as any).env?.VITE_DISCORD_AUTH_URL as string) || `${FALLBACK_BACKEND_URL.replace(/\/+$/, '')}/drop/server/api/v1/discord/login`).trim();
const ALLOWED_ROLE_ID = '1529489822044131448';
const ADMIN_ROLE_ID = '1529805570671120444';

const getDiscordAvatarUrl = (discordId: string, avatarHash: string | null | undefined) => {
  const fallbackIndex = Math.abs(parseInt(discordId) % 6);
  if (avatarHash) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=1024`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
};

const normalizeAvatarUrl = (value: unknown) => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '';
};

const createDiscordAuthUrl = () => {
  const baseUrl = (DISCORD_AUTH_URL || `${BACKEND_URL.replace(/\/+$/, '')}/drop/server/api/v1/discord/login`).trim();
  if (!baseUrl) {
    throw new Error('Discord auth endpoint is not configured. Set VITE_DISCORD_AUTH_URL or DROP_BACKEND_URL.');
  }

  const state = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const returnUrl = 'droplauncher://auth';

  const authUrl = new URL(baseUrl);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('returnUrl', returnUrl);
  return authUrl.toString();
};

const normalizeRole = (input: any) => {
  const baseRole = input?.role || { name: 'User', color: '#999999' };
  const hasTesterRole = !!(
    input?.hasTesterRole ||
    input?.role?.hasTesterRole ||
    input?.roleBadge ||
    input?.role?.badge ||
    input?.roleId === ALLOWED_ROLE_ID ||
    input?.role?.roleId === ALLOWED_ROLE_ID
  );
  const hasAdminRole = !!(
    input?.hasAdminRole ||
    input?.role?.hasAdminRole ||
    input?.roleId === ADMIN_ROLE_ID ||
    input?.role?.roleId === ADMIN_ROLE_ID
  );

  const resolvedName = hasAdminRole ? 'Admin' : hasTesterRole ? 'Tester' : baseRole.name || 'User';
  const resolvedColor = hasAdminRole ? '#ef4444' : hasTesterRole ? '#8b5cf6' : baseRole.color || '#999999';
  const resolvedBadge = hasAdminRole ? 'Admin' : hasTesterRole ? 'Tester' : input?.roleBadge || input?.role?.badge || null;

  return {
    name: resolvedName,
    color: resolvedColor,
    badge: resolvedBadge,
    hasTesterRole,
    hasAdminRole,
    roleId: input?.roleId || input?.role?.roleId || (hasAdminRole ? ADMIN_ROLE_ID : hasTesterRole ? ALLOWED_ROLE_ID : null),
  };
};

const extractAvatarFromPayload = (payload: any): string => {
  if (typeof payload === 'string') {
    return normalizeAvatarUrl(payload);
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidateKeys = [
    'avatar_url',
    'avatarUrl',
    'avatar',
    'userAvatar',
    'useravatar',
    'useravater',
    'userAvatarUrl',
    'useravatarurl',
    'profileImage',
    'profile_image',
    'imageUrl',
    'image_url',
    'url',
  ];

  for (const key of candidateKeys) {
    const value = (payload as Record<string, unknown>)[key];
    const normalized = extractAvatarFromPayload(value);
    if (normalized) return normalized;
  }

  if (payload.success === true && typeof payload.data === 'object' && payload.data) {
    const nested = extractAvatarFromPayload(payload.data);
    if (nested) return nested;
  }

  if (payload.data) {
    const nested = extractAvatarFromPayload(payload.data);
    if (nested) return nested;
  }

  return '';
};

const resolveUserAvatarUrl = async (email?: string, password?: string, fallback?: any) => {
  const trimmedEmail = email?.trim();
  const trimmedPassword = password?.trim();
  if (!trimmedEmail || !trimmedPassword) {
    const directAvatar = extractAvatarFromPayload(fallback || {});
    if (directAvatar) return directAvatar;

    const discordAvatar = fallback?.discordId ? getDiscordAvatarUrl(fallback.discordId, fallback.avatarHash ?? null) : '';
    return discordAvatar;
  }

  const avatarPaths = ['/api/account/useravatar', '/api/account/useravater'];
  const query = `email=${encodeURIComponent(trimmedEmail)}&password=${encodeURIComponent(trimmedPassword)}`;

  for (const path of avatarPaths) {
    try {
      const response = await invoke<any>('backend_proxy', {
        method: 'GET',
        path,
        query,
      });
      const apiAvatar = extractAvatarFromPayload(response);
      if (apiAvatar) {
        console.debug(`resolved avatar from ${path}`, apiAvatar);
        return apiAvatar;
      }
    } catch (err) {
      console.warn(`backend_proxy failed for user avatar at ${path}`, err);
    }

    try {
      const url = `${BACKEND_URL}${path}?${query}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const directResponse = await res.json().catch(() => null);
        const apiAvatar = extractAvatarFromPayload(directResponse);
        if (apiAvatar) {
          console.debug(`resolved avatar from direct fetch ${path}`, apiAvatar);
          return apiAvatar;
        }
      }
    } catch (err) {
      console.warn(`direct user avatar fetch failed for ${path}`, err);
    }
  }

  const directAvatar = extractAvatarFromPayload(fallback || {});
  if (directAvatar) return directAvatar;

  const discordAvatar = fallback?.discordId ? getDiscordAvatarUrl(fallback.discordId, fallback.avatarHash ?? null) : '';
  return discordAvatar;
};

const mockUser: LoginSuccessPayload = {
  username: "kikai_.",
  accountId: "7082570",
  email: "test@dropfn.com",
  password: "test",
  avatar_url: "https://i.imgur.com/6ayl4nx.png",
  favoriteSkin: "cid_028_athena_commando_f",
  role: {
    name: "Developer",
    color: "#6366f1"
  }
};

export default function App() {
  const location = useLocation();
  const [loginStage, setLoginStage] = useState<'initial' | 'loading' | 'waiting' | 'error'>('initial');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<LoginSuccessPayload | null>(TESTING ? mockUser : null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<VersionCheckResponse | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showBannedWarning, setShowBannedWarning] = useState(false);
  const [showLanguageSelection, setShowLanguageSelection] = useState(false);
  const [isStartupStateReady, setIsStartupStateReady] = useState(false);

  const [pendingLogin, setPendingLogin] = useState<{ email: string; password: string } | null>(null);

  const [shopData, setShopData] = useState<any | null>(null);
  const [isShopLoading, setIsShopLoading] = useState(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('');
  const [shopExpiration, setShopExpiration] = useState<string | null>(null);
  const navigate = useNavigate();

  const calculateTimeUntilRefresh = () => {
    if (shopExpiration) {
      const now = new Date();
      const expirationTime = new Date(shopExpiration);

      if (expirationTime > now) {
        const diffMs = expirationTime.getTime() - now.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

        return `${diffHrs}:${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`;
      }
    }
    const now = new Date();
    const refreshTime = new Date();

    const easternDate = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const easternHour = easternDate.getHours();
    const easternMinute = easternDate.getMinutes();
    refreshTime.setUTCHours(
      now.getUTCHours() + (20 - easternHour),
      1 - easternMinute, 0, 0
    );

    if (now > refreshTime) {
      refreshTime.setDate(refreshTime.getDate() + 1);
    }

    const diffMs = refreshTime.getTime() - now.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

    return `${diffHrs}:${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`;
  };

  const fetchShopData = async (forceRefresh = false) => {
    try {
      setIsShopLoading(true);
      setShopError(null);

      if (!forceRefresh) {
        const cachedData = localStorage.getItem('shopData');
        const cacheTimestamp = localStorage.getItem('shopDataTimestamp');

        if (cachedData && cacheTimestamp) {
          const cachedExpiration = localStorage.getItem('shopExpiration');
          if (cachedExpiration) {
            const expirationTime = new Date(cachedExpiration);
            const now = new Date();

            if (now < expirationTime) {
              setShopData(JSON.parse(cachedData));
              setShopExpiration(cachedExpiration);
              setIsShopLoading(false);
              return;
            }
          } else {
            const cacheAge = Date.now() - parseInt(cacheTimestamp);
            const cacheValidDuration = 30 * 60 * 1000;

            if (cacheAge < cacheValidDuration) {
              setShopData(JSON.parse(cachedData));
              setIsShopLoading(false);
              return;
            }
          }
        }
      }
      console.log('Fetching fresh shop data');
      const data = await invoke<any>("fetch_shop_items");
      setShopData(data);
      if (data.expiration) {
        setShopExpiration(data.expiration);
        localStorage.setItem('shopExpiration', data.expiration);
      }

      localStorage.setItem('shopData', JSON.stringify(data));
      localStorage.setItem('shopDataTimestamp', Date.now().toString());

    } catch (err) {
      const cachedData = localStorage.getItem('shopData');
      if (cachedData) {
        setShopData(JSON.parse(cachedData));
      } else {
        setShopError("failed to load shop items");
      }
      console.error("could not fetch shop:", err);
    } finally {
      setIsShopLoading(false);
    }
  };
  
  useEffect(() => {
    initializeSecurity();

     (async () => {
    const initialized = await discordRPC.init();
    if (initialized) {
      await discordRPC.setLauncherActivity(user?.avatar_url, user?.username);
    }
  })();

    fetchShopData();


    setTimeUntilRefresh(calculateTimeUntilRefresh());
    const timer = setInterval(() => {
      setTimeUntilRefresh(calculateTimeUntilRefresh());
    }, 1000);
    
    const scheduleNextRefresh = () => {
      const now = new Date();
      const refreshTime = new Date();
      
      const easternDate = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const easternHour = easternDate.getHours();
      const easternMinute = easternDate.getMinutes();
      
      refreshTime.setUTCHours(
        now.getUTCHours() + (20 - easternHour),
        1 - easternMinute, 0, 0
      );

      if (now > refreshTime) {
        refreshTime.setDate(refreshTime.getDate() + 1);
      }
      
      const timeUntilRefresh = refreshTime.getTime() - now.getTime();
      
      setTimeout(() => {
        fetchShopData(true);
        scheduleNextRefresh();
      }, timeUntilRefresh);
    };
    
    scheduleNextRefresh();
    
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!shopExpiration) return;

    const now = new Date();
    const expirationTime = new Date(shopExpiration);

    if (now >= expirationTime) {
      console.log('Shop already expired, fetching new data...');
      fetchShopData(true);
      return;
    }

    const timeUntilExpiration = expirationTime.getTime() - now.getTime();

    console.log(`Shop will expire in ${Math.round(timeUntilExpiration / 1000 / 60)} minutes`);

    const expirationTimeout = setTimeout(() => {
      console.log('Shop expired, fetching new data...');
      fetchShopData(true);
    }, timeUntilExpiration);

    return () => clearTimeout(expirationTimeout);
  }, [shopExpiration]);

  const handleNavigation = (path: string) => {
    if (path === '/home') {
      setIsPreparing(true);
      setTimeout(() => {
        setIsPreparing(false);
      }, 2000);
    } else {
      setIsPreparing(false);
    }
    navigate(path);
  };

  const applyLanguagePreference = async (lang: string) => {
    try {
      await invoke<LauncherStartupState>('save_launcher_startup_state', { language: lang });
      localStorage.setItem('appLanguage', lang);
      document.documentElement.lang = lang;
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
      setShowLanguageSelection(false);
    } catch (error) {
      console.error('Failed to save first-launch language:', error);
    }
  };

  const fetchLauncherVersion = async () => {
    const primaryUrl = 'https://raw.githubusercontent.com/kikai0724/Launher/refs/heads/main/launcherversion';
    const fallbackUrl = 'https://raw.githubusercontent.com/kikai0724/launcherv/main/launcherversion';

    const tryFetch = async (url: string) => {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`Failed to fetch launcher version from ${url}: ${resp.status}`);
      }
      const txt = await resp.text();
      const version = txt.trim();
      if (!version) {
        throw new Error(`Launcher version file at ${url} was empty`);
      }
      return version;
    };

    try {
      return await tryFetch(primaryUrl);
    } catch (primaryErr) {
      console.warn('Primary launcher version fetch failed:', primaryErr);
    }

    try {
      return await tryFetch(fallbackUrl);
    } catch (fallbackErr) {
      console.warn('Fallback launcher version fetch failed:', fallbackErr);
    }

    return null;
  };

  const compareVersions = (a: string, b: string) => {
    const clean = (s: string) => s.trim().replace(/^v/, '').replace(/[^0-9.].*$/, '');
    const pa = clean(a).split('.').map(n => parseInt(n || '0'));
    const pb = clean(b).split('.').map(n => parseInt(n || '0'));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  };

  const checkRemoteUpdate = async () => {
    const remoteVersion = await fetchLauncherVersion();
    if (!remoteVersion) return null;

    let localVersion = '0.0.1';
    try {
      localVersion = await invoke<string>('get_app_version');
    } catch (err) {
      console.warn('could not get app version', err);
    }

    const remoteVersionTrimmed = remoteVersion.trim();
    console.debug('Local version:', localVersion, 'Remote version:', remoteVersionTrimmed);
    const cmp = compareVersions(remoteVersionTrimmed, localVersion);
    console.debug('Version compare result (remote vs local):', cmp);
    if (cmp === 1) {
      return {
        downloadUrl: `https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Drop_${remoteVersionTrimmed}_x64_en-US.msi`,
        remoteVersion: remoteVersionTrimmed,
      };
    }
    return null;
  };

  useEffect(() => {
    const loadStartupState = async () => {
      try {
        const state = await invoke<LauncherStartupState | null>('get_launcher_startup_state');
        if (state?.firstRunCompleted) {
          const language = state.language || 'en';
          localStorage.setItem('appLanguage', language);
          document.documentElement.lang = language;
          window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: language } }));
          setShowLanguageSelection(false);
        } else {
          setShowLanguageSelection(true);
        }
      } catch (error) {
        console.error('Failed to load launcher startup state:', error);
        setShowLanguageSelection(true);
      } finally {
        setIsStartupStateReady(true);
      }
    };
    void loadStartupState();
  }, []);

  useEffect(() => {
    const autoUpdateCheck = async () => {
      try {
        const update = await checkRemoteUpdate();
        if (update) {
          console.debug('Auto-update available, prompting user:', update.downloadUrl);
          setUpdateInfo({ type: 'UPDATE', download_url: update.downloadUrl });
          setShowUpdatePrompt(true);
        }
      } catch (err) {
        console.error('Auto update check failed', err);
      }
    };

    autoUpdateCheck();
  }, []);

  useEffect(() => {
    const checkStoredToken = async () => {
      try {
        const creds = await invoke<{ exists: boolean; email?: string; password?: string }>('check_stored_credentials').catch(() => ({ exists: false, email: undefined, password: undefined }));

        // First, try to get cached user profile for immediate display
        const cachedProfile = await invoke<any>('get_cached_user_profile').catch(() => null);
        if (cachedProfile) {
          console.debug('Loaded cached user profile:', cachedProfile.username);
          const avatarUrl = normalizeAvatarUrl(cachedProfile.avatar_url);
          const normalized = {
            username: cachedProfile.username,
            accountId: cachedProfile.account_id,
            email: cachedProfile.email || creds?.email || '',
            password: creds?.password || '',
            avatar_url: avatarUrl,
            favoriteSkin: cachedProfile.favorite_skin || '',
            mtxCurrency: '',
            hype: '',
            discordId: cachedProfile.discord_id,
            avatarHash: cachedProfile.avatar_hash,
            role: cachedProfile.role || { name: 'User', color: '#000000' },
            hasTesterRole: cachedProfile.has_tester_role,
            hasAdminRole: cachedProfile.has_admin_role,
            roleId: cachedProfile.role_id,
          } as LoginSuccessPayload;
          setUser(normalized);
          handleNavigation('/home');
        }

        // Then validate the token and refresh user info in background.
        // If there is no valid token but credentials still exist, automatically relogin.
        const tokenResult = await invoke<{ user?: LoginSuccessPayload; token_info: { expired: boolean } }>('check_stored_token');
        if (!tokenResult.token_info.expired && tokenResult.user) {
          const u = tokenResult.user as any;
          let avatarUrl = normalizeAvatarUrl(u.avatar_url || u.avatarUrl || u.avatar || u.profileImage || u.profile_image || u.imageUrl || u.image_url);
          try {
            if (creds && creds.exists && creds.email && creds.password) {
              const refreshedAvatarUrl = await resolveUserAvatarUrl(creds.email, creds.password, u);
              if (refreshedAvatarUrl) {
                avatarUrl = refreshedAvatarUrl;
              }
            }
          } catch (err) {
            console.warn('Could not refresh stored user avatar:', err);
          }

          const normalized = {
            ...u,
            email: creds?.email || u.email || '',
            password: creds?.password || u.password || '',
            avatar_url: avatarUrl,
            role: normalizeRole(u)
          } as LoginSuccessPayload;
          console.debug('checkStoredToken - updating user from token validation, avatar_url=', normalized.avatar_url);
          setUser(normalized);
          if (!cachedProfile) {
            handleNavigation('/home');
          }

          try {
            if (creds && creds.exists && creds.email && creds.password) {
              console.debug('Checking banned status on startup for', creds.email);
              try {
                const banJson = await invoke<any>('check_banned', { email: creds.email, password: creds.password });
                const isBanned = !!(banJson.banned || banJson.isBanned);
                if (isBanned) {
                  setShowBannedWarning(true);
                }
              } catch (err) {
                console.debug('Banned check failed on startup (native):', err);
              }
            }
          } catch (err) {
            console.warn('Could not retrieve stored credentials for banned check:', err);
          }
          return;
        }

        if (creds && creds.exists && creds.email && creds.password) {
          console.debug('No valid stored token; retrying login with saved credentials');
          try {
            await performLogin(creds.email, creds.password, true, true, true);
            return;
          } catch (err) {
            console.warn('Stored-credential auto-login failed:', err);
          }
        }

        setLoginStage('initial');
      } catch (error) {
        console.error('could not check stored token:', error);
        setLoginStage('initial');
      }
    };

    checkStoredToken();
  }, []);

  const handleConfirmUpdate = async () => {
    if (!updateInfo || !updateInfo.download_url) {
      setShowUpdatePrompt(false);
      if (pendingLogin) {
        await performLogin(pendingLogin.email, pendingLogin.password, true);
        setPendingLogin(null);
      } else {
        setLoginStage('initial');
      }
      return;
    }

    setShowUpdatePrompt(false);
    setIsDownloading(true);
    setDownloadProgress(0);
    const progressInterval = setInterval(() => {
      setDownloadProgress((prev) => Math.min(100, prev + 7));
    }, 100);

    try {
      await invoke('download_and_install_update', { args: { downloadUrl: updateInfo.download_url, requireElevation: true } });
    } catch (err) {
      console.error('Update/install failed', err);
    } finally {
      clearInterval(progressInterval);
      setDownloadProgress(100);
      setIsDownloading(false);
    }

    if (pendingLogin) {
      await performLogin(pendingLogin.email, pendingLogin.password, true);
      setPendingLogin(null);
    }
  };

  useEffect(() => {
    if (location.pathname !== '/home') {
      setIsPreparing(false);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      if (!TESTING) {
        await invoke('clear_stored_token');
        await invoke('clear_stored_credentials').catch(() => {
          // Ignore errors if credentials were not saved
        });
      }
      setUser(null);
      setIsPreparing(false);
      setLoginStage('initial');
      navigate('/login');
    } catch (error) {
      console.error('failed to clear token:', error);
    }
  };

  const performLogin = async (email: string, password: string, skipUpdateCheck = false, rememberMe = true, skipRoleCheck = false) => {
    if (!skipUpdateCheck) {
      const update = await checkRemoteUpdate();
      if (update) {
        setUpdateInfo({ type: 'UPDATE', download_url: update.downloadUrl });
        setPendingLogin({ email, password });
        setShowUpdatePrompt(true);
        return;
      }
    }

    setLoginStage('loading');
    try {
      const result = await invoke<any>('email_login', { email, password, skipRoleCheck });
      let userToSet: LoginSuccessPayload | null = null;
      if (result && result.user) {
        const u = result.user as any;
        userToSet = { ...u, email: email, avatar_url: normalizeAvatarUrl(u.avatar_url || u.avatarUrl || u.avatar || u.profileImage || u.profile_image || u.imageUrl || u.image_url), role: normalizeRole(u) } as LoginSuccessPayload;
      } else if (result && result.username) {
        const u = result as any;
        let avatarUrl = normalizeAvatarUrl(u.avatar_url || u.avatarUrl || u.avatar || u.profileImage || u.profile_image || u.imageUrl || u.image_url);
        if (u.discordId && u.avatarHash) {
          avatarUrl = getDiscordAvatarUrl(u.discordId, u.avatarHash);
        } else if (u.discordId) {
          avatarUrl = getDiscordAvatarUrl(u.discordId, null);
        }
        userToSet = { ...u, email: email, avatar_url: avatarUrl, discordId: u.discordId, avatarHash: u.avatarHash, role: normalizeRole(u) } as LoginSuccessPayload;
      } else if (result) {
        // Ensure we always have username, accountId from backend
        const u = result as any;
        userToSet = {
          ...u,
          username: u.username || u.accountId || email.split('@')[0],
          accountId: u.accountId || email,
          email: email,
          avatar_url: normalizeAvatarUrl(u.avatar_url || u.avatarUrl || u.avatar || u.profileImage || u.profile_image || u.imageUrl || u.image_url),
          password,
          favoriteSkin: u.favoriteSkin || '',
          role: normalizeRole(u)
        } as LoginSuccessPayload;
      } else {
        throw new Error('Invalid login response');
      }

      const resolvedAvatarUrl = await resolveUserAvatarUrl(email, password, userToSet as any);
      console.debug('performLogin - resolvedAvatarUrl=', resolvedAvatarUrl);
      if (resolvedAvatarUrl) {
        userToSet = { ...userToSet, avatar_url: resolvedAvatarUrl } as LoginSuccessPayload;
      }

      // Admin elevation is not required for regular launcher startup/login.
      // Check banned status from backend
      try {
        const banJson = await invoke<any>('check_banned', { email, password });
        const isBanned = !!(banJson.banned || banJson.isBanned);
        if (isBanned) {
          setShowBannedWarning(true);
        }
      } catch (err) {
        console.debug('Failed to check banned status (native):', err);
      }

      // Preserve the entered password on the local user object so Friends and other pages can use it.
      if (userToSet) {
        userToSet.password = password;
      }

      // Persist the session locally for automatic login on next startup.
      if (rememberMe) {
        try {
          await invoke('save_credentials', { email, password });
        } catch (err) {
          console.warn('Failed to save credentials:', err);
        }
      }

      console.debug('performLogin - final setUser avatar_url=', userToSet?.avatar_url);
      setUser(userToSet);
      setLoginStage('initial');
      handleNavigation('/home');
    } catch (error) {
      console.error('email login failed:', error);
      setErrorMessage(String(error));
      setLoginStage('error');
    }
  };

  const handleDiscordLogin = async () => {
    setErrorMessage(undefined);
    setLoginStage('loading');

    try {
      const authUrl = createDiscordAuthUrl();
      await openUrl(authUrl);
      setLoginStage('waiting');
    } catch (error) {
      console.error('Failed to open Discord auth URL:', error);
      setErrorMessage('Unable to open Discord authentication. Please try again.');
      setLoginStage('error');
    }
  };

  const handleCancel = () => {
    setErrorMessage(undefined);
    setLoginStage('initial');
  };

  useEffect(() => {
    if (!TESTING) {
      const unlisten = listen<LoginSuccessPayload>('login-success', (event) => {
        const userData = event.payload;
        const u = userData as any;
        void (async () => {
          const refreshedAvatarUrl = await resolveUserAvatarUrl(u.email, u.password, u);
          const finalAvatar = refreshedAvatarUrl || normalizeAvatarUrl(u.avatar_url || u.avatarUrl || u.avatar || u.profileImage || u.profile_image || u.imageUrl || u.image_url);
          console.debug('login-success event - setting user avatar_url=', finalAvatar);

          if (u?.email && u?.password) {
            try {
              await invoke('save_credentials', { email: u.email, password: u.password });
            } catch (err) {
              console.warn('Failed to persist credentials after Discord login:', err);
            }
          }

          const nextUser = { ...u, avatar_url: finalAvatar, role: normalizeRole(u) } as LoginSuccessPayload;
          setUser(nextUser);
          setLoginStage('initial');
          handleNavigation('/home');
        })();
      });

      const unlistenError = listen<string>('login-error', (event) => {
        console.error('Login failed:', event.payload);
        setErrorMessage(event.payload);
        setLoginStage('error');
      });

      return () => {
        unlisten.then(fn => fn());
        unlistenError.then(fn => fn());
      };
    }
  }, [navigate, location.pathname]);

  useEffect(() => {

    if (events.length > 0) return;
    
    setIsEventsLoading(true);
    const controller = new AbortController();
    
    invoke<Event[]>('fetch_events')
      .then(fetchedEvents => {
        if (!controller.signal.aborted) {
          console.log('Fetched events:', fetchedEvents);
          setEvents(fetchedEvents);
        }
      })
      .catch(err => {
        console.error('could not fetch events:', err);
        if (!controller.signal.aborted) {
          setEvents([
            {
              id: 1,
              name: "Servers Down",
              card_name: "Servers Down",
              thumbnail: "https://pbs.twimg.com/media/Gnb0JHgXIAAR2ap.jpg:large",
              event_background: "https://pbs.twimg.com/media/Gnb0JHgXIAAR2ap.jpg:large",
              event_description: "Ahh! Man! We werent able to connect to the servers! Check the status in the Drop Official Discord!",
              button_text: "Discord",
              button_redirect_url: "https://discord.gg/dropogfn",
              button_color: "7289DA",
              button_text_color: "#FFFFFF",
              frame_text: "Servers Down",
              active: true
            }
          ]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsEventsLoading(false);
        }
      });
      
    return () => controller.abort();
  }, []);

  if (!isStartupStateReady) {
    return <div className="min-h-screen bg-[#0f0f0f]" />;
  }

  return (
    <ThemeProvider>
      <AppContent
        user={user}
        setUser={setUser}
        isPreparing={isPreparing}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        shopData={shopData}
        isShopLoading={isShopLoading}
        shopError={shopError}
        timeUntilRefresh={timeUntilRefresh}
        events={events}
        isEventsLoading={isEventsLoading}
        handleLogout={handleLogout}
        handleDiscordLogin={handleDiscordLogin}
        handleCancel={handleCancel}
        loginStage={loginStage}
        errorMessage={errorMessage}
        showLanguageSelection={showLanguageSelection}
        onSelectLanguage={applyLanguagePreference}
      />
      {showUpdatePrompt && updateInfo && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 px-4">
          <div className="absolute inset-0" />
          <div className="relative p-8 rounded-3xl min-w-[320px] max-w-lg bg-[#111] z-70 border border-white/[0.08] shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-3">{t('updateAvailableTitle')}</h3>
            <p className="text-white/70 mb-5">{t('updateAvailableDescription')}</p>
            <div className="flex justify-end">
              <button onClick={handleConfirmUpdate} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition">
                {t('updateNow')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showBannedWarning && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex items-center justify-center"
          >
            <img
              src="/SidebarDrop.png"
              alt="Drop"
              className="w-[220px] md:w-[320px] object-contain drop-shadow-[0_0_35px_rgba(139,92,246,0.45)]"
            />
          </motion.div>
        </motion.div>
      )}
    </ThemeProvider>
  );
}

interface AppContentProps {
  user: any;
  setUser: Dispatch<SetStateAction<LoginSuccessPayload | null>>;
  isPreparing: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  shopData: any;
  isShopLoading: boolean;
  shopError: string | null;
  timeUntilRefresh: string;
  events: any[];
  isEventsLoading: boolean;
  handleLogout: () => void;
  handleDiscordLogin: () => Promise<void> | void;
  handleCancel: () => void;
  loginStage: 'initial' | 'loading' | 'waiting' | 'error';
  errorMessage?: string;
  showLanguageSelection?: boolean;
  onSelectLanguage?: (lang: string) => void;
}

const AppContent: React.FC<AppContentProps> = ({
  user,
  setUser,
  isPreparing,
  isDownloading,
  downloadProgress,
  shopData,
  isShopLoading,
  shopError,
  timeUntilRefresh,
  events,
  isEventsLoading,
  handleLogout,
  handleDiscordLogin,
  handleCancel,
  loginStage,
  errorMessage,
  showLanguageSelection = false,
  onSelectLanguage,
}) => {
  const { currentTheme } = useTheme();

  useEffect(() => {
    if (user) {
      discordRPC.setHome(user.avatar_url, user.username);
    }
  }, [user]);


  return (
    <ShopContext.Provider value={{
      shopData,
      isLoading: isShopLoading,
      error: shopError,
      timeUntilRefresh
    }}>
      <div className="min-h-screen relative overflow-hidden bg-[#0f0f0f]">
            {currentTheme.backgroundImage && (
              <BackgroundMedia
                source={currentTheme.backgroundImage}
                opacity={0.6}
              />
            )}
            {!currentTheme.backgroundImage && (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
            )}
            {currentTheme.backgroundImage && (
              <div className="absolute inset-0 pointer-events-none bg-black/20"></div>
            )}
        <Layout user={user} isPreparing={isPreparing} onLogout={handleLogout} onUpdateDisplayName={(displayName: string) => {
            setUser((prev: LoginSuccessPayload | null) => prev ? { ...prev, username: displayName } : prev);
          }}>
          {isDownloading && (
            <div className="fixed inset-0 bg-[#0f0f0f] flex items-center justify-center z-50">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
              <div className="p-6 rounded-md min-w-[260px] transition bg-[#222222]/20 backdrop-blur-md z-10 shadow-lg flex flex-col gap-5 border border-white/[0.08] animate-slide-bounce">
                <div className="flex flex-col items-center gap-5 preparing" style={{ opacity: 1 }}>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-9 w-9 animate-spin text-white/80"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-label="Loading"
                  >
                    <path d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                  <p className="text-white/70 text-[14px] font-medium tracking-wide font-['Bricolage_Grotesque']">Downloading update...</p>
                  <div className="w-full bg-white/10 h-1.5 rounded-sm mt-1">
                    <div
                      className="bg-white/80 h-1.5 rounded-sm transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {!isDownloading && (
            <>
              <div className="absolute inset-0 overflow-hidden">
                <div className="floating-square left-[10%] top-[20%]"></div>
                <div className="floating-square left-[60%] top-[50%]"></div>
                <div className="floating-square left-[80%] top-[15%]"></div>
                <div className="floating-square left-[30%] top-[70%]"></div>
              </div>
              <Routes>
                <Route path="/" element={<Navigate to={user ? "/home" : "/login"} replace />} />
                <Route
                  path="/login"
                  element={user ? <Navigate to="/home" replace /> : (
                    TESTING ? (
                      <div className="flex items-center justify-center min-h-screen">
                        <button
                          onClick={() => setUser(mockUser)}
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Login as Test User
                        </button>
                      </div>
                    ) : (
                      <LoginContainer
                          stage={loginStage}
                          onLogin={handleDiscordLogin}
                          onCancel={handleCancel}
                          errorMessage={errorMessage}
                          showLanguageSelection={showLanguageSelection}
                          onSelectLanguage={onSelectLanguage}
                        />
                    )
                  )}
                />
                <Route path="/home" element={user ? <Home user={user} isPreparing={isPreparing} events={events} isEventsLoading={isEventsLoading} /> : <Navigate to="/login" replace />} />
                <Route path="/library" element={user ? <Library user={user} /> : <Navigate to="/login" replace />} />
                <Route path="/shop" element={user ? <Shop user={user} />  : <Navigate to="/login" replace />} />
                <Route path="/stats" element={user ? <Stats user={user} /> : <Navigate to="/login" replace />} />
                <Route path="/music" element={user ? <Music /> : <Navigate to="/login" replace />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/server" element={<Server />} />
                <Route path="/friends" element={user ? <Friends user={user} /> : <Navigate to="/login" replace />} />
                <Route path="/servers" element={<Servers />} />
                <Route
                  path="/admin"
                  element={user && (user.role?.hasAdminRole || user.role?.roleId === ADMIN_ROLE_ID) ? <AdminPage user={user} /> : <Navigate to="/home" replace />}
                />
                <Route path="/version/:versionId" element={<LaunchVersion/>} />
              </Routes>
            </>
          )}
        </Layout>
        {(currentTheme.id === 'icespice' || currentTheme.id === 'memories' || currentTheme.id === 'tamenntai' || currentTheme.id === 'cench' || currentTheme.id === 'kikai' || currentTheme.id === 'lnd' || currentTheme.id === 'ye' || currentTheme.id === 'yeezus' || currentTheme.id === 'morechaos' || currentTheme.id === 'unity' || currentTheme.id === 'teenagedream' || currentTheme.id === 'pinktape') && (
          <MusicPlayer theme={
            currentTheme.id === 'icespice' ? 'icespice' :
            currentTheme.id === 'memories' ? 'memories' :
            currentTheme.id === 'tamenntai' ? 'tamenntai' :
            currentTheme.id === 'cench' ? 'cench' :
            currentTheme.id === 'kikai' ? 'kikai' :
            currentTheme.id === 'lnd' ? 'lnd' :
            currentTheme.id === 'ye' ? 'ye' :
            currentTheme.id === 'yeezus' ? 'yeezus' :
            currentTheme.id === 'morechaos' ? 'morechaos' :
            currentTheme.id === 'unity' ? 'unity' :
            currentTheme.id === 'teenagedream' ? 'teenagedream' :
            currentTheme.id === 'pinktape' ? 'pinktape' :
            'memories'
            
          } 
          />
        )}
      </div>
    </ShopContext.Provider>
  );
};
