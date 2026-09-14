import { useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { discordRPC } from '../utils/discordRPC';
import t from '../utils/i18n';

export default function LaunchVersion() {
  const location = useLocation();
  const version = location.state?.version;
  const user = location.state?.user;
  const autoLaunch = location.state?.autoLaunch;

  const [isAnimating, setIsAnimating] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchStatus, setLaunchStatus] = useState('');
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [showBannedBlock, setShowBannedBlock] = useState(false);
  const [bannedReason, setBannedReason] = useState<string | null>(null);
  const [gameMonitorInterval, setGameMonitorInterval] = useState<number | null>(null);
  const [splashWindow, setSplashWindow] = useState<WebviewWindow | Window | null>(null);
  const splashCloseTimerRef = useRef<number | null>(null);
  const launchTriggeredRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsAnimating(true));
    checkGameStatus();
  }, []);

  useEffect(() => {
    if (!version || !user || launchTriggeredRef.current) {
      return;
    }

    if (autoLaunch === true && !isLaunching && !isGameRunning) {
      launchTriggeredRef.current = true;
      const timer = setTimeout(() => {
        void handleLaunch();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoLaunch, isLaunching, isGameRunning, version, user]);

  const checkGameStatus = async () => {
    try {
      const isRunning = await invoke('is_game_running');
      if (isRunning) {
        setIsGameRunning(true);
        startGameMonitoring();
      }
    } catch (err) {
    }
  };

  if (!version) return <div className="text-white p-8">{t('versionNotFound') || 'Version not found. Contact Support.'}</div>;
  if (!user) return <div className="text-white p-8">{t('userNotFound') || 'User not found. Contact Support.'}</div>;

  const handleLaunch = async () => {
    // Check banned status via native command to ensure launcher blocks banned accounts
    try {
      const banJson = await invoke<any>('check_banned', { email: user.email, password: user.password });
      const isBanned = banJson?.banned === true || banJson?.isBanned === true;
      if (isBanned) {
        const reason = banJson.status || banJson.message || JSON.stringify(banJson);
        setBannedReason(String(reason));
        setShowBannedBlock(true);
        setTimeout(() => setShowBannedBlock(false), 3800);
        return;
      }
    } catch (err) {
      // If the check fails, allow launch to proceed but log for diagnostics
      console.debug('Banned check failed before launch:', err);
    }
    if (isGameRunning) {
      try {
        await invoke('stop_game_process');
        setIsGameRunning(false);
        stopGameMonitoring();
        await closeSplashWindow();
        discordRPC.setLauncherActivity(user?.avatar_url, user?.username);
      } catch (err) {
        console.error('Failed to stop game:', err);
      }
      return;
    }

    setIsLaunching(true);
    if (splashCloseTimerRef.current !== null) {
      window.clearTimeout(splashCloseTimerRef.current);
      splashCloseTimerRef.current = null;
    }
    
    discordRPC.setPlayingActivity(version.version, user?.avatar_url);

    try {
      setLaunchStatus('Initializing...');
      await new Promise(resolve => setTimeout(resolve, 500));

      setLaunchStatus('Checking game files...');

      const { email, password, username, avatar_url } = user;
      const resetOnRelease = localStorage.getItem('resetOnRelease') === 'true';
      const disablePreEdits = localStorage.getItem('disablePreEdits') === 'true';
      const doubleMovement = localStorage.getItem('doubleMovement') === 'true';

      const unlistenFileCheck = await listen<{ stage: string; percent: number; message: string }>(
        'launch-file-check-progress',
        (event) => {
          setLaunchStatus(event.payload.message || 'Checking game files...');
        }
      );
      try {
        await invoke('version_card_clicked', {
          path: version.path,
          email,
          password,
          username,
          avatarUrl: avatar_url,
          version: version.version,
          resetOnRelease,
          disablePreEdits,
          doubleMovement,
        });
      } finally {
        unlistenFileCheck();
      }

      setLaunchStatus('Successfully launched game!');
      await new Promise(resolve => setTimeout(resolve, 700));

      const maxWaitMs = 15000;
      const pollEveryMs = 250;
      const started = Date.now();
      let seenWindow = false;
      while (Date.now() - started < maxWaitMs) {
        try {
          const visible = await invoke<boolean>('is_fortnite_window_visible');
          if (visible) {
            seenWindow = true;
            break;
          }
        } catch (err) {
          console.warn('Fortnite window visibility probe failed:', err);
        }
        await new Promise(resolve => setTimeout(resolve, pollEveryMs));
      }

      if (!seenWindow) {
        console.warn('Fortnite window did not become visible in time; splash will fall back to the existing close timeout.');
      }

      await closeSplashWindow();
      try {
        const isRunning = await invoke('is_game_running');
        if (isRunning) {
          setIsGameRunning(true);
          startGameMonitoring();

          discordRPC.setPlayingActivity(version.version, user?.avatar_url);
        } else {
          throw new Error('process not detected');
        }
      } catch (verifyErr) {
        const message = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        setLaunchStatus(`Error: ${message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLaunchStatus(`Error: ${message}`);
      await closeSplashWindow();
    } finally {
      setIsLaunching(false);
    }
  };

  const startGameMonitoring = () => {
    if (gameMonitorInterval) {
      clearInterval(gameMonitorInterval);
    }

   const interval = window.setInterval(async () => {
    try {
    const isRunning = await invoke('is_game_running');
    if (!isRunning && isGameRunning) {
      setIsGameRunning(false);
      stopGameMonitoring();
    }
     } catch (err) {
    }
    }, 3000);

setGameMonitorInterval(interval);

  };

  const stopGameMonitoring = () => {
    if (gameMonitorInterval) {
      clearInterval(gameMonitorInterval);
      setGameMonitorInterval(null);
    }
  };

  useEffect(() => {
    return () => {
      stopGameMonitoring();
      void closeSplashWindow();
    };
  }, [gameMonitorInterval]);

  const closeSplashWindow = async () => {
    if (splashCloseTimerRef.current !== null) {
      window.clearTimeout(splashCloseTimerRef.current);
      splashCloseTimerRef.current = null;
    }

    const closeCandidate = async (win: any) => {
      try {
        if (!win) return;
        if (typeof win.close === 'function') {
          await win.close();
          return;
        }
        if (typeof win.close === 'object' && typeof win.close.call === 'function') {
          await win.close.call(win);
          return;
        }
      } catch (err) {
        console.warn('Failed closing candidate:', err);
      }
    };

    if (splashWindow) {
      await closeCandidate(splashWindow);
    }

    try {
      const fallback = WebviewWindow.getByLabel('launch-splash');
      if (fallback) {
        await closeCandidate(fallback);
      }
    } catch (err) {
      console.warn('Failed to close splash window by label fallback:', err);
    }

    try {
      await invoke('close_launch_splash');
    } catch (err) {
      console.warn('Failed to close splash window via native invoke:', err);
    }

    setSplashWindow(null);
  };

  // Render banned block modal
  const BannedBlockModal = () => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-sm p-6 rounded-2xl bg-gradient-to-br from-[#1b1220] to-[#241226] border border-white/[0.06] shadow-2xl z-10">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-red-600/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l9.54 16.51A1 1 0 0119.01 22H4.99a1 1 0 01-.82-1.53L13.71 3.86a1 1 0 011.58 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-1">{t('bannedTitle')}</h3>
            <p className="text-white/70 text-sm mb-3">{t('bannedMessage')}</p>
            {bannedReason && <div className="px-3 py-2 bg-white/6 rounded-md text-sm text-white/90 break-words mb-3">{bannedReason}</div>}
            <div className="flex gap-3 justify-end">
              <a href="https://discord.com/channels/1424710024823046169/1425848786780950618/1425849936104132698" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg bg-transparent border border-white/10 text-white/90 hover:bg-white/5 transition">
                {t('bannedContactSupport')}
              </a>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowBannedBlock(false)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-all duration-200 shadow-lg shadow-red-500/20"
              >
                {t('bannedClose')}
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`min-h-screen relative overflow-hidden transition-all duration-300 ease-out ${
        isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      }`}
      style={{ background: '#050b1d' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(120,119,198,0.28),transparent_45%),linear-gradient(180deg,#090f1f_0%,#0d1630_100%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-[760px] overflow-hidden rounded-[28px] border border-white/15 bg-[#10182b]/80 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          <div className="relative h-[260px] overflow-hidden sm:h-[340px]">
            <img
              src={version.splash_image}
              alt={version.version}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#10182b] via-[#10182b]/20 to-transparent" />
            <div className="absolute left-6 top-6 rounded-full border border-white/20 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/75 backdrop-blur-md">
              Drop Launcher
            </div>
          </div>

          <div className="px-6 pb-7 pt-2 sm:px-10 sm:pb-9">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-violet-300/80">
              Ready to launch
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {version.build_name || `Fortnite ${version.version}`}
            </h1>
            <p className="mt-2 text-sm text-white/50">
              {version.version} {version.technical_version ? `· ${version.technical_version}` : ''}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-white/60">
                {isLaunching ? (launchStatus || 'ゲームを起動中...') : 'このバージョンをプレイしますか？'}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  disabled={isLaunching}
                  className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/65 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  戻る
                </button>
                <motion.button
                  type="button"
                  onClick={() => void handleLaunch()}
                  disabled={isLaunching}
                  whileHover={{ scale: isLaunching ? 1 : 1.03 }}
                  whileTap={{ scale: isLaunching ? 1 : 0.97 }}
                  className="inline-flex min-w-[150px] items-center justify-center gap-2 rounded-xl bg-violet-500 px-6 py-3 text-sm font-bold text-white shadow-[0_8px_28px_rgba(139,92,246,0.4)] transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-70"
                >
                  {isLaunching ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      起動中...
                    </>
                  ) : (
                    <>
                      <span className="text-base">▶</span>
                      プレイする
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {showBannedBlock && <BannedBlockModal />}
    </div>
  );
}
