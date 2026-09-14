import { useState, useEffect } from 'react';
import { IoIosInformationCircleOutline } from "react-icons/io";
import { invoke } from '@tauri-apps/api/core';
import t from '../utils/i18n';

interface ServerStatus {
  isServerReady: boolean;
}

interface LoginContainerProps {
  stage: 'initial' | 'loading' | 'waiting' | 'error';
  onLogin: () => Promise<void> | void;
  onCancel: () => void;
  errorMessage?: string;
  showLanguageSelection?: boolean;
  onSelectLanguage?: (lang: string) => void;
}

const UpdateCheckStage = () => (
  <div className="fixed inset-0 flex items-center justify-center z-50">
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
    <div className="p-6 rounded-xl min-w-[260px] transition bg-[#222222]/20 backdrop-blur-md z-10 shadow-lg flex flex-col gap-5 border border-white/[0.08] animate-slide-bounce">
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
        <p className="text-white/70 text-[16px] font-medium tracking-wide font-['Bricolage_Grotesque']">Checking for updates!</p>
      </div>
    </div>
  </div>
);

const ServerOfflineStage = () => (
  <div className="fixed inset-0 flex items-center justify-center z-50">
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
    <div className="p-6 rounded-xl min-w-[280px] transition bg-[#222222]/20 backdrop-blur-md z-10 shadow-lg flex flex-col gap-5 border border-white/[0.08] animate-slide-bounce">
      <div className="flex flex-col items-center gap-5" style={{ opacity: 1 }}>
        <IoIosInformationCircleOutline className="text-white" size={48} />
        <p className="text-white/70 text-[16px] font-medium tracking-wide font-['Bricolage_Grotesque']">Servers Offline!</p>
      </div>
    </div>
  </div>
);



const ErrorStage = ({ onCancel, errorMessage = "Unknown error occurred" }: { onCancel: () => void; errorMessage?: string }) => (
  <div className="w-full transition-opacity duration-500 opacity-100">
    <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset]">
      <p className="text-sm font-semibold text-red-200">{errorMessage}</p>
      <p className="mt-1 text-sm text-red-200/80">Please try again or contact support if the issue persists.</p>
    </div>

    <button
      onClick={onCancel}
      className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-white/15"
    >
      CANCEL
    </button>
  </div>
);

const DownloadContentStage = ({ progress }: { progress: number }) => (
  <div className="fixed inset-0 bg-[#0f0f0f] flex items-center justify-center z-50">
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
    <div className="p-6 rounded-xl min-w-[280px] bg-[#222222]/20 backdrop-blur-md shadow-lg w-[280px] border border-white/[0.08] animate-slide-bounce">
      <div className="flex flex-col items-center gap-4 preparing" style={{ opacity: 1 }}>
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
        <p className="text-white/70 text-[16px] font-medium tracking-wide font-['Bricolage_Grotesque']">Downloading Content...</p>
        <div className="w-full bg-white/10 rounded-full h-2 mt-1">
          <div 
            className="bg-white/80 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p className="text-white/50 text-[14px] font-['Bricolage_Grotesque']">{progress}%</p>
      </div>
    </div>
  </div>
);

const LanguageSelectionStage = ({ onSelectLanguage }: { onSelectLanguage?: (lang: string) => void }) => {
  const options = [
    { value: 'en', label: 'English', detail: 'English' },
    { value: 'ja', label: '日本語', detail: 'Japanese' },
    { value: 'es', label: 'Español', detail: 'Spanish' },
    { value: 'zh', label: '中文', detail: 'Chinese' },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
      <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#222222]/50 p-8 shadow-[0_0_40px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-300">First Launch</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{t('languageSelectionTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            {t('languageSelectionDescription')}
          </p>
        </div>
        <div className="grid gap-3">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelectLanguage?.(option.value)}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-white transition-all duration-200 hover:bg-white/15"
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-sm text-white/60">{option.detail}</span>
            </button>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-white/45">{t('languageSelectionHint')}</p>
      </div>
    </div>
  );
};

export default function LoginContainer({ stage, onLogin, onCancel, errorMessage, showLanguageSelection = false, onSelectLanguage }: LoginContainerProps) {
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [downloadProgress] = useState(0);
  const [isDownloading] = useState(false);
  const [isServerOnline, setIsServerOnline] = useState(true);
  const [isServerStatusChecked, setIsServerStatusChecked] = useState(false);

  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const serverStatus = await invoke<ServerStatus>('check_server_status');
        setIsServerOnline(serverStatus.isServerReady === true);
        setIsServerStatusChecked(true);

        setIsCheckingUpdates(false);
        setTimeout(() => setShowContent(true), 100);
      } catch (error) {
        console.error('server status check failed:', error);
        setIsServerOnline(false);
        setIsServerStatusChecked(true);
        setIsCheckingUpdates(false);
        setTimeout(() => setShowContent(true), 100);
      }
    };

    checkServerStatus();
  }, []);

  if (showLanguageSelection) {
    return <LanguageSelectionStage onSelectLanguage={onSelectLanguage} />;
  }

  if (isServerStatusChecked && !isServerOnline) {
    return <ServerOfflineStage />;
  }

  if (isDownloading) {
    return <DownloadContentStage progress={downloadProgress} />;
  }

  if (isCheckingUpdates) {
    return <UpdateCheckStage />;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
      <div className="floating-square" style={{ top: '10%', left: '15%', animationDelay: '0s' }}></div>
      <div className="floating-square" style={{ top: '60%', left: '80%', animationDelay: '5s' }}></div>
      <div className="floating-square" style={{ top: '30%', left: '70%', animationDelay: '10s' }}></div>
      <div className="floating-square" style={{ top: '80%', left: '20%', animationDelay: '15s' }}></div>
      <div className="floating-square" style={{ top: '20%', left: '50%', animationDelay: '20s' }}></div>

      {showContent && (
        <>
          <div className="login-panel animate-slide-bounce bg-[#222222]/40 backdrop-blur-md border border-white/[0.08] relative z-10">
            {stage === 'initial' && (
              <div className="flex flex-col items-center w-full">
                <div className="mb-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.6em] text-violet-300/80">Drop // Enter the Arena</p>
                  <h1 className="mt-3 text-white text-6xl font-black mb-2 font-['Bricolage_Grotesque'] tracking-[-0.08em] drop-shadow-[0_0_28px_rgba(167,139,250,0.4)]">
                    Drop
                  </h1>
                </div>
                <p className="text-white/70 text-center mb-6 text-base leading-relaxed max-w-md font-['Bricolage_Grotesque']">
                  Sign in with Discord and jump straight into the Drop experience.
                </p>
                <div className="w-full max-w-md">
                  <button
                    type="button"
                    onClick={() => void onLogin()}
                    className="w-full rounded-2xl bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 px-4 py-3.5 font-bold text-white shadow-[0_0_30px_rgba(99,102,241,0.35)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_35px_rgba(34,211,238,0.25)]"
                  >
                    Continue with Discord
                  </button>
                  <p className="mt-4 text-center text-sm text-white/50">
                    Secure auth opens directly in the Drop launcher.
                  </p>
                </div>
              </div>
            )}
            {(stage === 'loading' || stage === 'waiting') && (
              <div className="flex flex-col items-center w-full">
                <div className="mb-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.6em] text-violet-300/80">Drop // Syncing</p>
                  <h1 className="mt-3 text-white text-6xl font-black mb-2 font-['Bricolage_Grotesque'] tracking-[-0.08em] drop-shadow-[0_0_28px_rgba(167,139,250,0.4)]">
                    Drop
                  </h1>
                </div>
                <p className="text-white/70 text-center mb-8 text-base leading-relaxed max-w-md font-['Bricolage_Grotesque']">
                  Authenticating your session…
                </p>
                <button
                  className="w-full py-3.5 bg-gradient-to-r from-violet-500/80 to-cyan-500/80
                         transition-all duration-200 rounded-2xl
                         text-white font-bold text-base
                         hover:scale-[1.01] active:scale-[0.99]
                         shadow-[0_0_25px_rgba(167,139,250,0.25)] flex items-center justify-between
                         disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  disabled
                >
                  {stage === 'waiting' ? (
                    <>
                      <span className="ml-4">Waiting for callback</span>
                      <svg
                        className="animate-spin w-4 h-4 mr-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </>
                  ) : (
                    <span className="mx-auto">Authenticating</span>
                  )}
                </button>
              </div>
            )}
            {stage === 'error' && <ErrorStage onCancel={onCancel} errorMessage={errorMessage} />}
          </div>
        </>
      )}
    </div>
  );
}
