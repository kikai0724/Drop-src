import { useEffect, useState } from 'react';
import { IoClose } from "react-icons/io5";
import { IoIosLogOut } from "react-icons/io";
import { IoPersonCircle } from "react-icons/io5";
import { FaPalette, FaGlobe, FaCog } from "react-icons/fa";
import { useTheme } from '../contexts/ThemeContext';
import t from '../utils/i18n';
import { invoke } from '@tauri-apps/api/core';
import { app } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { getRoleTag } from '../utils/userHelpers';
import BackgroundMedia from './BackgroundMedia';
import { isVideoBackground } from '../utils/backgroundMedia';


const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// local helper in case module resolution for userHelpers fails in some environments
const getDisplayName = (user: { username?: string; accountId?: string; email?: string } | null | undefined) => {
  if (!user) return '';
  if (user.username && user.username.trim().length > 0) return user.username;
  if (user.accountId && user.accountId.trim().length > 0) return user.accountId;
  if (user.email) return user.email.split('@')[0];
  return '';
};

const getThemeAlbumCover = (themeId: string): string | null => {
  const albumCovers: Record<string, string> = {
    'icespice': 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/deli.png',
    'memories': 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png',
    'tamenntai': 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg',
    'cench': 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg',
    'kikai': 'https://i.imgur.com/oASthee.png',
    'lnd': 'https://wallpaperaccess.com/full/6302625.png',
    'ye': 'https://wallpaperaccess.com/full/4198173.jpg',
    'yeezus': 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg',
    'morechaos': 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg',
    'unity': 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg',
    'teenagedream': 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg',
    'pinktape': 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
  };

  return albumCovers[themeId] || null;
};

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onUpdateDisplayName: (displayName: string) => void;
  initialSection?: 'profile' | 'themes' | 'language' | 'other';
  user: {
    username: string;
    avatar_url: string;
    email: string;
    password?: string;
    accountId: string;
    role: {
      name: string;
      color: string;
      badge?: string | null;
      hasTesterRole?: boolean;
      hasAdminRole?: boolean;
      roleId?: string | null;
    };
  };
}

interface NavItemProps {
  icon?: React.ReactNode;
  text: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

const NavItem = ({ icon, text, isActive, onClick, className = '' }: NavItemProps) => (
  <button
    onClick={onClick}
    className={`flex items-center w-[94%] h-12 rounded-2xl transition-all duration-200 px-4
              font-['Bricolage_Grotesque'] hover:scale-[1.015]
              ${isActive ? 'bg-white/12 text-white shadow-[0_0_20px_rgba(255,255,255,0.06)] ring-1 ring-white/10' : 'text-white/65 hover:bg-white/5 hover:text-white'}
              ${className}`}
  >
    {icon && <span className="text-[1.1rem] opacity-90">{icon}</span>}
    <span className={`font-medium text-[14px] ${icon ? 'ml-3.5' : ''}`}>{text}</span>
  </button>
);

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, onLogout, onUpdateDisplayName, initialSection = 'profile', user }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'themes' | 'language' | 'other'>(initialSection);
  const [language, setLanguage] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('appLanguage') || 'en';
      return stored.slice(0, 2);
    } catch {
      return 'en';
    }
  });
  const { currentTheme, setTheme, availableThemes } = useTheme();
  const roleTag = getRoleTag(user);
  const [isKikaiMvEnabled, setIsKikaiMvEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kikaiMusicEnableMv') !== 'false';
    } catch {
      return true;
    }
  });
  const [isKikaiMvAutoPlay, setIsKikaiMvAutoPlay] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kikaiMusicAutoPlayMv') === 'true';
    } catch {
      return false;
    }
  });
  const [isKikaiMvBackground, setIsKikaiMvBackground] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kikaiMusicMvBackground') !== 'false';
    } catch {
      return true;
    }
  });
  const [isBackgroundVideoAudioEnabled, setIsBackgroundVideoAudioEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('playBackgroundVideoAudio');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [renderMode, setRenderMode] = useState<'gpu' | 'cpu'>(() => {
    try {
      return localStorage.getItem('kikaiMusicRenderMode') === 'cpu' ? 'cpu' : 'gpu';
    } catch {
      return 'gpu';
    }
  });

  const [displayNameEditing, setDisplayNameEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState(user.username || '');
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [displayNameStatus, setDisplayNameStatus] = useState<string | null>(null);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);

  const [isDoubleMovementEnabled, setIsDoubleMovementEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('doubleMovement') === 'true';
    } catch {
      return false;
    }
  });

  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string | null>(() => {
    try {
      return localStorage.getItem('kikaiMusicBackgroundImage');
    } catch {
      return null;
    }
  });

  const dispatchKikaiMusicSettingChange = (key: string, value: string) => {
    try {
      window.dispatchEvent(new CustomEvent('kikaiMusicSettingsChanged', {
        detail: { key, value }
      }));
    } catch {
      // ignore
    }
  };

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{ downloadUrl: string; remoteVersion: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updateStage, setUpdateStage] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);

  const sendFeedback = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      setFeedbackStatus(t('feedbackEmpty'));
      return;
    }

    setFeedbackSending(true);
    setFeedbackStatus(null);

    try {
      await invoke('send_feedback', {
        feedback: trimmed,
        username: user.username || 'Anonymous'
      });
      setFeedbackText('');
      setFeedbackStatus(t('feedbackSuccess'));
    } catch (err) {
      console.error('sendFeedback failed', err);
      setFeedbackStatus(`${t('feedbackFailed')}: ${String(err)}`);
    } finally {
      setFeedbackSending(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveSection(initialSection);
    }
  }, [isOpen, initialSection]);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setIsAnimating(false);
    setTimeout(onClose, 150);
  };

  const handleLogout = () => {
    handleClose();
    setTimeout(() => {
      onLogout();
    }, 150);
  };

  const resetDisplayNameForm = () => {
    setDisplayNameInput(user.username || '');
    setDisplayNameError(null);
    setDisplayNameStatus(null);
    setDisplayNameEditing(false);
  };

  const handleSaveDisplayName = async () => {
    const trimmed = displayNameInput.trim();
    setDisplayNameError(null);
    setDisplayNameStatus(null);

    if (trimmed.length < 3 || trimmed.length > 24) {
      setDisplayNameError('Display name must be between 3 and 24 characters.');
      return;
    }

    if (trimmed === user.username) {
      resetDisplayNameForm();
      return;
    }

    if (!user.email || !user.password) {
      setDisplayNameError('Unable to update display name without saved credentials.');
      return;
    }

    setDisplayNameSaving(true);
    try {
      await invoke('backend_proxy', {
        method: 'POST',
        path: '/account/api/public/changeDisplayName',
        query: null,
        body: {
          email: user.email,
          password: user.password,
          displayName: trimmed,
        },
      });

      onUpdateDisplayName(trimmed);
      setDisplayNameStatus('Display name updated successfully.');
      setDisplayNameEditing(false);
    } catch (err) {
      const message = typeof err === 'string' ? err : String(err);
      setDisplayNameError(message);
    } finally {
      setDisplayNameSaving(false);
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

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateAvailable(null);
    setUpdateMessage(null);
    try {
      const remoteVersion = await fetchLauncherVersion();
      if (!remoteVersion) {
        setUpdateMessage('Failed to fetch remote version');
        setCheckingUpdate(false);
        return;
      }

      let localVersion = '0.0.0';
      try {
        localVersion = await app.getVersion();
      } catch {}

      const remoteVersionTrimmed = remoteVersion.trim();
      const cmp = compareVersions(remoteVersionTrimmed, localVersion);
      if (cmp === 1) {
        setUpdateAvailable({ downloadUrl: `https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Drop_${remoteVersionTrimmed}_x64_en-US.msi`, remoteVersion: remoteVersionTrimmed });
        setUpdateMessage(`New version available: ${remoteVersionTrimmed}`);
      } else {
        setUpdateMessage('Already up to date');
      }
    } catch (err) {
      console.error('checkForUpdates failed', err);
      setUpdateMessage(`Update check failed: ${String(err)}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const startUpdateInstall = async () => {
    if (!updateAvailable) return;
    setIsUpdating(true);
    setUpdateProgress(0);
    setUpdateStage('download');
    try {
      let unlisten: (() => void) | null = null;
      try {
        unlisten = await listen<any>('download-progress', (event) => {
          const payload = event.payload as { stage: string; percent: number; message: string };
          setUpdateProgress(typeof payload.percent === 'number' ? payload.percent : null);
          setUpdateStage(payload.stage || null);
          setUpdateMessage(payload.message || null);
        });

        await invoke('download_and_install_update', { args: { downloadUrl: updateAvailable.downloadUrl, requireElevation: true } });
        setUpdateMessage('Installer launched');
      } finally {
        if (unlisten) unlisten();
      }
    } catch (err) {
      console.error('update/install failed', err);
      setUpdateMessage(`Installer failed: ${String(err)}`);
    } finally {
      setIsUpdating(false);
      setUpdateStage(null);
      setUpdateProgress(null);
    }
  };

  if (!isOpen) return null;

  const overlayClasses = `
    fixed top-[23px] inset-x-0 bottom-0 bg-slate-950/55 backdrop-blur-sm z-[998]
    transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]
    ${!isAnimating ? 'opacity-0' : isClosing ? 'opacity-0' : 'opacity-100'}
  `;

  const contentClasses = `
    fixed top-[23px] inset-x-0 bottom-0 z-[999]
    transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]
    ${!isAnimating ? 'opacity-0 scale-110' : isClosing ? 'opacity-0 scale-110' : 'opacity-100 scale-100'}
  `;

  return (
    <>
      <div className={overlayClasses} onClick={handleClose} />
      <div
        className={contentClasses}
        style={{ background: `linear-gradient(180deg, ${hexToRgba(currentTheme.colors.background, 0.96)}, ${hexToRgba(currentTheme.colors.background, 0.97)})` }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at top left, ${hexToRgba(currentTheme.colors.primary, 0.22)}, transparent 28%), radial-gradient(circle at bottom right, ${hexToRgba(currentTheme.colors.secondary, 0.18)}, transparent 30%)`
          }}
        ></div>
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <span className="text-sm font-medium text-white/60">{t('close')}</span>
          <button
            onClick={handleClose}
            className="p-2 text-white/60 hover:text-white transition-all duration-200 rounded-full border border-white/20 hover:border-white/40 hover:scale-[1.02] w-8 h-8 flex items-center justify-center bg-white/5 backdrop-blur-sm"
          >
            <IoClose size={20} />
          </button>
        </div>

        <div className="flex h-[calc(100vh-23px)] relative z-10">
          <div
            className="w-72 border-r p-4 flex flex-col backdrop-blur-xl"
            style={{
              borderColor: currentTheme.colors.border,
              background: `linear-gradient(180deg, ${hexToRgba(currentTheme.colors.sidebarSolid || '#111827', 0.8)}, ${hexToRgba(currentTheme.colors.sidebar || '#0f172a', 0.7)})`
            }}
          >
            <div className="mb-5 mt-2 px-2">
              <div className="text-[10px] uppercase tracking-[0.26em] text-white/40 font-semibold">Drop</div>
              <div className="mt-2 text-2xl font-black tracking-tight text-white font-['Bricolage_Grotesque']">Settings</div>
            </div>

            <div className="mb-4">
              <div className="text-white/40 text-[10px] font-semibold uppercase tracking-[0.22em] px-3 mb-2">
                {t('user')}
              </div>
              <NavItem
                icon={<IoPersonCircle size={22} />}
                text={t('profile')}
                isActive={activeSection === 'profile'}
                onClick={() => setActiveSection('profile')}
              />
            </div>

            <div className="mb-4">
              <div className="text-white/40 text-[10px] font-semibold uppercase tracking-[0.22em] px-3 mb-2">
                {t('appearance')}
              </div>
              <NavItem
                icon={<FaPalette size={20} />}
                text={t('themes')}
                isActive={activeSection === 'themes'}
                onClick={() => setActiveSection('themes')}
              />
              <div className="mt-2 space-y-1.5">
                <NavItem
                  icon={<FaGlobe size={18} />}
                  text={t('language')}
                  isActive={activeSection === 'language'}
                  onClick={() => setActiveSection('language')}
                />
                <NavItem
                  icon={<FaCog size={18} />}
                  text={t('otherSettings')}
                  isActive={activeSection === 'other'}
                  onClick={() => setActiveSection('other')}
                />
              </div>
            </div>

            <div className="mt-auto pb-2 pt-2 border-t border-white/10">
              <div className="px-2 py-4 text-center">
                <div className="text-white/55 text-[10px] uppercase tracking-[0.18em]">Launcher</div>
                <div className="mt-2 text-xs text-white/50">@kikai_.</div>
              </div>

              <NavItem
                icon={<IoIosLogOut size={20} />}
                text={t('logout')}
                isActive={false}
                onClick={handleLogout}
                className="text-white/60 hover:bg-red-500/10 hover:text-red-500"
              />
            </div>
          </div>

          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto mt-4 space-y-5">
              <div className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/50">Launcher panel</div>
                  <div className="mt-2 text-2xl font-black text-white font-['Bricolage_Grotesque']">Preferences</div>
                </div>
                <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70">
                  {activeSection}
                </div>
              </div>
              {activeSection === 'profile' && (
                <div
                  className="backdrop-blur-xl rounded-3xl p-8 border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
                  style={{
                    backgroundColor: hexToRgba(currentTheme.colors.surface, 0.42),
                    borderColor: currentTheme.colors.border
                  }}
                >
                  <div className="flex items-start gap-6">
                    <div className="relative group">
                      <img
                          src={user.avatar_url || 'https://i.imgur.com/BlTvkMc.png'}
                          alt={`${getDisplayName(user)}'s Avatar`}
                          className="w-14 h-14 rounded-full object-cover ring-2 ring-white/10
                                    group-hover:ring-white/20 transition-all duration-200"
                        />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {displayNameEditing ? (
                          <div className="flex flex-col w-full">
                            <input
                              value={displayNameInput}
                              onChange={(e) => setDisplayNameInput(e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-black/70 px-4 py-2 text-white outline-none focus:border-white/30"
                              placeholder="Enter new display name"
                              disabled={displayNameSaving}
                            />
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={handleSaveDisplayName}
                                disabled={displayNameSaving}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                onClick={resetDisplayNameForm}
                                disabled={displayNameSaving}
                                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h2
                              className="text-xl font-bold text-white font-['Bricolage_Grotesque'] cursor-pointer hover:text-blue-300"
                              onClick={() => setDisplayNameEditing(true)}
                            >
                              {getDisplayName(user)}
                            </h2>
                            <button
                              onClick={() => setDisplayNameEditing(true)}
                              className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.12em] text-white hover:bg-white/20"
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        {roleTag ? (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-semibold border"
                            style={{
                              backgroundColor: `${roleTag.color}22`,
                              borderColor: `${roleTag.color}55`,
                              color: roleTag.color,
                            }}
                          >
                            {roleTag.label}
                          </span>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${user.role?.color || '#999999'}15`,
                              color: user.role?.color || '#999999'
                            }}
                          >
                            {user.role?.name || 'User'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-white/40 font-mono text-xs">{user.accountId}</p>
                        <p className="text-white/40 font-mono text-xs">Email: {user.email ? user.email.replace(/(.{2}).*(@.*)/, '$1***$2') : 'Hidden'}</p>
                        <p className="text-white/40 font-mono text-xs">Password: {user.password ? '••••••••' : 'Hidden'}</p>
                      </div>
                      {displayNameError && (
                        <p className="mt-3 text-sm text-red-400">{displayNameError}</p>
                      )}
                      {displayNameStatus && (
                        <p className="mt-3 text-sm text-green-400">{displayNameStatus}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'themes' && (
                <div
                  className="backdrop-blur-xl rounded-3xl p-8 border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
                  style={{
                    backgroundColor: hexToRgba(currentTheme.colors.surface, 0.42),
                    borderColor: currentTheme.colors.border
                  }}
                >
                  <h2 className="text-2xl font-bold text-white font-['Bricolage_Grotesque'] mb-4">{t('themes')}</h2>
                  <p className="text-white/60 mb-12 font-['Bricolage_Grotesque'] text-center">
                    Choose the perfect theme to customize your launcher experience!
                  </p>

                  <div className="rounded-3xl border border-white/10 bg-black/20 p-6 max-h-96 overflow-y-auto scrollbar-custom">
                    <div className="flex flex-wrap gap-8 justify-center items-center py-6">
                      {availableThemes.map((theme) => (
                        <div
                          key={theme.id}
                          onClick={() => setTheme(theme.id)}
                          className="relative cursor-pointer transition-all duration-300 hover:scale-110 group flex flex-col items-center"
                        >
                          <div
                            className="w-20 h-20 rounded-full border-3 transition-all duration-300 relative shadow-lg hover:scale-105 cursor-pointer overflow-hidden"
                            style={{
                              borderColor: currentTheme.id === theme.id ? theme.colors.primary : 'transparent',
                              background: getThemeAlbumCover(theme.id) ? 'transparent' : `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`,
                              boxShadow: currentTheme.id === theme.id ? `0 0 20px ${hexToRgba(theme.colors.primary, 0.5)}` : '0 4px 15px rgba(0,0,0,0.2)'
                            }}
                          >
                            {getThemeAlbumCover(theme.id) && (
                              <img
                                src={getThemeAlbumCover(theme.id)!}
                                alt={theme.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {

                                  (e.target as HTMLElement).style.display = 'none';
                                  (e.target as HTMLElement).parentElement!.style.background = `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`;
                                }}
                              />
                            )}
                            {currentTheme.id === theme.id && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg">
                                  <span className="text-green-600 text-xs font-bold">✓</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 bg-black/90 text-white px-3 py-2 rounded-lg text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-[60] backdrop-blur-sm border border-white/20">
                            {theme.name}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black/90"></div>
                          </div>

                          <div
                            className="absolute top-4 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                            style={{
                              background: `radial-gradient(circle, ${hexToRgba(theme.colors.primary, 0.3)}, transparent)`,
                              filter: 'blur(20px)',
                              transform: 'scale(1.5)'
                            }}
                          ></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'language' && (
                <div
                  className="backdrop-blur-xl rounded-3xl p-8 border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
                  style={{
                    backgroundColor: hexToRgba(currentTheme.colors.surface, 0.42),
                    borderColor: currentTheme.colors.border
                  }}
                >
                  <h2 className="text-2xl font-bold text-white font-['Bricolage_Grotesque'] mb-4">{t('languageTitle')}</h2>
                  <p className="text-white/60 mb-4">{t('languageDescription')}</p>
                  <div className="max-w-sm">
                    <label className="block text-sm text-white/70 mb-2">{t('language')}</label>
                    <select
                      value={language}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLanguage(v);
                        try { localStorage.setItem('appLanguage', v); } catch {}
                        void invoke('save_launcher_startup_state', { language: v }).catch((error) => {
                          console.error('Failed to save launcher language:', error);
                        });
                        try { document.documentElement.lang = v; } catch {}
                        try { window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: v } })); } catch {}
                      }}
                      className="w-full p-2 rounded bg-black/60 text-white border border-white/10"
                    >
                      <option value="en">English</option>
                      <option value="ja">日本語</option>
                      <option value="es">Español</option>
                      <option value="zh">中文</option>
                    </select>
                  </div>
                </div>
              )}

              {activeSection === 'other' && (
                <div
                  className="backdrop-blur-xl rounded-3xl p-8 border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
                  style={{
                    backgroundColor: hexToRgba(currentTheme.colors.surface, 0.42),
                    borderColor: currentTheme.colors.border
                  }}
                >
                  <h2 className="text-2xl font-bold text-white font-['Bricolage_Grotesque'] mb-4">{t('otherSettings')}</h2>
                  <p className="text-white/60 mb-8">{t('otherSettingsDescription')}</p>

                  <div className="rounded-3xl border border-white/10 bg-black/25 p-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">{t('kikaiMusicSettings')}</h3>
                      <p className="text-white/60 text-sm mb-4">{t('kikaiMusicSettingsDescription')}</p>

                      <div className="space-y-4">
                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div>
                            <div className="text-white font-medium">{t('enableMvPlayback')}</div>
                            <div className="text-white/60 text-sm">{t('enableMvPlaybackDescription')}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isKikaiMvEnabled}
                            onChange={(e) => {
                              const value = e.target.checked;
                              setIsKikaiMvEnabled(value);
                              try { localStorage.setItem('kikaiMusicEnableMv', String(value)); } catch {}
                              dispatchKikaiMusicSettingChange('enableMv', String(value));
                            }}
                            className="h-5 w-5 rounded border border-white/20 bg-black/70"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div>
                            <div className="text-white font-medium">{t('autoPlayMv')}</div>
                            <div className="text-white/60 text-sm">{t('autoPlayMvDescription')}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isKikaiMvAutoPlay}
                            onChange={(e) => {
                              const value = e.target.checked;
                              setIsKikaiMvAutoPlay(value);
                              try { localStorage.setItem('kikaiMusicAutoPlayMv', String(value)); } catch {}
                              dispatchKikaiMusicSettingChange('autoPlayMv', String(value));
                            }}
                            className="h-5 w-5 rounded border border-white/20 bg-black/70"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div>
                            <div className="text-white font-medium">{t('mvBackground')}</div>
                            <div className="text-white/60 text-sm">{t('mvBackgroundDescription')}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isKikaiMvBackground}
                            onChange={(e) => {
                              const value = e.target.checked;
                              setIsKikaiMvBackground(value);
                              try { localStorage.setItem('kikaiMusicMvBackground', String(value)); } catch {}
                              dispatchKikaiMusicSettingChange('mvBackground', String(value));
                            }}
                            className="h-5 w-5 rounded border border-white/20 bg-black/70"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div>
                            <div className="text-white font-medium">{t('playBackgroundVideoAudio')}</div>
                            <div className="text-white/60 text-sm">{t('playBackgroundVideoAudioDescription')}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isBackgroundVideoAudioEnabled}
                            onChange={(e) => {
                              const value = e.target.checked;
                              setIsBackgroundVideoAudioEnabled(value);
                              try { localStorage.setItem('playBackgroundVideoAudio', String(value)); } catch {}
                              try {
                                void invoke('save_background_video_audio_preference', { enabled: value });
                              } catch {
                                // ignore native persistence failures
                              }
                              dispatchKikaiMusicSettingChange('playBackgroundVideoAudio', String(value));
                            }}
                            className="h-5 w-5 rounded border border-white/20 bg-black/70"
                          />
                        </label>

                        <label className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div>
                            <div className="text-white font-medium">{t('renderMode')}</div>
                            <div className="text-white/60 text-sm">{t('renderModeDescription')}</div>
                          </div>
                          <select
                            value={renderMode}
                            onChange={(e) => {
                              const value = e.target.value as 'gpu' | 'cpu';
                              setRenderMode(value);
                              try { localStorage.setItem('kikaiMusicRenderMode', value); } catch {}
                              dispatchKikaiMusicSettingChange('renderMode', value);
                            }}
                            className="w-full rounded-lg bg-black/70 border border-white/20 text-white p-3"
                          >
                            <option value="gpu">{t('renderModeGpu')}</option>
                            <option value="cpu">{t('renderModeCpu')}</option>
                          </select>
                        </label>

                        <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div>
                            <div className="text-white font-medium">{t('doubleMovement')}</div>
                            <div className="text-white/60 text-sm">{t('doubleMovementDescription')}</div>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isDoubleMovementEnabled}
                              onChange={(e) => {
                                const value = e.target.checked;
                                setIsDoubleMovementEnabled(value);
                                try { localStorage.setItem('doubleMovement', String(value)); } catch {}
                                dispatchKikaiMusicSettingChange('doubleMovement', String(value));
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-white/10 rounded-full peer-checked:bg-blue-600 peer-focus:ring-2 peer-focus:ring-blue-500 transition-colors" />
                            <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                          </label>
                        </label>

                        <label className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div>
                            <div className="text-white font-medium">{t('backgroundImage')}</div>
                            <div className="text-white/60 text-sm">{t('backgroundImageDescription')}</div>
                          </div>
                          <div className="flex items-center gap-4">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/ogg,video/quicktime,.m4v"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const result = reader.result as string;
                                  setBackgroundImagePreview(result);
                                };
                                reader.readAsDataURL(file);
                              }}
                              className="text-sm text-white/70"
                            />
                            <button
                              onClick={() => {
                                try { localStorage.setItem('kikaiMusicBackgroundImage', backgroundImagePreview || ''); } catch {}
                                dispatchKikaiMusicSettingChange('backgroundImage', backgroundImagePreview || '');
                              }}
                              className="px-3 py-1 rounded bg-white/10 text-white hover:bg-white/20"
                            >
                              {t('save')}
                            </button>
                            <button
                              onClick={() => {
                                setBackgroundImagePreview(null);
                                try { localStorage.removeItem('kikaiMusicBackgroundImage'); } catch {}
                                dispatchKikaiMusicSettingChange('backgroundImage', '');
                              }}
                              className="px-3 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            >
                              {t('clear')}
                            </button>
                          </div>
                          {backgroundImagePreview && (
                            <div className="mt-3 w-full h-40 rounded overflow-hidden border border-white/10 relative">
                              <BackgroundMedia source={backgroundImagePreview} />
                              {isVideoBackground(backgroundImagePreview) && (
                                <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-1 text-xs text-white/80">
                                  VIDEO
                                </span>
                              )}
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Update check UI */}
              {activeSection === 'other' && (
                <div className="mt-6">
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                    <h3 className="text-lg font-semibold text-white mb-2">アップデート</h3>
                    <p className="text-white/60 text-sm mb-3">アプリの新しいバージョンを手動で確認します。</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={checkForUpdates}
                        disabled={checkingUpdate || isUpdating}
                        className="px-3 py-2 rounded bg-white/10 text-white hover:bg-white/20"
                      >
                        {checkingUpdate ? t('checkingForUpdates') : t('checkForUpdates')}
                      </button>
                      {updateAvailable && (
                        <div className="ml-2 text-white/80">
                          {t('newVersion')}: {updateAvailable.remoteVersion}
                          <button
                            onClick={startUpdateInstall}
                            disabled={isUpdating}
                            className="ml-3 px-3 py-1 rounded bg-blue-600 text-white"
                          >{isUpdating ? t('downloadingUpdate') : t('installUpdate')}</button>
                        </div>
                      )}
                    </div>
                    {updateProgress !== null && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-sm text-white/60 mb-1">
                          <span>{updateStage === 'download' ? 'Downloading' : updateStage === 'extract' ? 'Extracting' : updateStage || 'Progress'}</span>
                          <span>{updateProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded">
                          <div className="h-2 bg-blue-500 rounded" style={{ width: `${updateProgress}%` }} />
                        </div>
                      </div>
                    )}
                    {updateMessage && (
                      <p className="mt-2 text-sm text-white/60">{updateMessage}</p>
                    )}
                    
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4">
                    <h3 className="text-lg font-semibold text-white mb-2">{t('feedbackTitle')}</h3>
                    <p className="text-white/60 text-sm mb-3">{t('feedbackDescription')}</p>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder={t('feedbackPlaceholder')}
                      className="w-full min-h-[120px] resize-none rounded-2xl border border-white/10 bg-black/70 p-4 text-white outline-none focus:border-blue-500"
                    />
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        onClick={sendFeedback}
                        disabled={feedbackSending}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {feedbackSending ? t('feedbackSending') : t('feedbackSend')}
                      </button>
                      {feedbackStatus && (
                        <p className="text-sm text-white/70">{feedbackStatus}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Settings;



















