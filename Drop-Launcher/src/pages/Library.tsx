import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import ImportVersionModal from '../components/ImportVersionModal';
import { FaPlay, FaTools, FaThLarge, FaList } from "react-icons/fa";
import { motion} from "framer-motion";
import "../styles/index.css";
import { useTheme } from '../contexts/ThemeContext';
import { discordRPC } from '../utils/discordRPC';
import t from '../utils/i18n';

interface VersionWithStatus {
  path: string;
  version: string;
  technical_version: string;
  splash_image: string;
  access_type: string;
  build_name: string;
  style?: React.CSSProperties;
}

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (deleteFiles: boolean) => void;
  version: VersionWithStatus;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ isOpen, onClose, onConfirm, version }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsAnimating(false);
      onClose();
      setDeleteFiles(false);
    }, 200);
  };

  const FolderIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="https://www.w3.org/2000/svg">
      <path 
        d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.89l-.82-1.22A2 2 0 008.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="text-white/40"
      />
    </svg>
  );
  
  return (
    <div className={`fixed inset-0 flex items-center justify-center ${isOpen ? '' : 'hidden'}`}>
      <div 
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200
          ${!isAnimating ? 'opacity-0' : isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={handleClose} 
      />
      
      <div 
        className={`bg-gradient-to-b from-[#141414] to-[#0a0a0a] rounded-2xl 
          border border-white/[0.08] p-6 w-[600px] relative z-10 
          shadow-2xl transition-all duration-200 
          ${!isAnimating ? 'opacity-0 scale-95' : 
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/15 to-purple-900/10 pointer-events-none rounded-2xl"></div>
        
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                className="text-red-500"
                strokeWidth="2"
              >
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-['Bricolage_Grotesque']">
                {t('deleteVersionTitle')}
              </h2>
              <p className="text-white/60 text-sm font-['Bricolage_Grotesque']">
                {t('deleteVersionConfirm')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/[0.02] rounded-xl p-4 mb-6">
          <div className="flex gap-4">
            <div className="w-[100px] h-[130px] rounded-lg overflow-hidden border border-white/[0.08]">
              <img 
                src={version.splash_image} 
                alt={version.version}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-white/90 font-['Bricolage_Grotesque'] font-semibold mb-1">
                  Fortnite Version:
                </h3>
                <p className="text-white/60 text-sm font-['Bricolage_Grotesque']">
                  {version.version}
                </p>
              </div>
              <div>
                <h3 className="text-white/90 font-['Bricolage_Grotesque'] font-semibold mb-1">
                  Build Path:
                </h3>
                <div className="flex items-center gap-2 bg-[#0f0f0f] p-2 rounded-lg border border-white/[0.08]">
                  <FolderIcon />
                  <p className="text-white/70 text-sm font-['Bricolage_Grotesque'] truncate">
                    {version.path}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] mb-6 cursor-pointer group transition-colors duration-200 hover:bg-white/[0.04]">
          <div className={`w-5 h-5 rounded-lg border transition-colors duration-200 flex items-center justify-center
            ${deleteFiles ? 'bg-red-500 border-red-500' : 'border-white/20 group-hover:border-white/40'}`}>
            {deleteFiles && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" 
                className="text-white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            )}
          </div>
          <input 
            type="checkbox" 
            className="hidden" 
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
          />
          <span className="text-white/90 text-sm font-['Bricolage_Grotesque']">
            {t('deleteFilesFromDisk')}
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-white/[0.08]
              text-white/70 hover:text-white transition-colors duration-200 font-['Bricolage_Grotesque']"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(deleteFiles);
              handleClose();
            }}
            className="px-4 py-2 bg-gradient-to-r from-red-600/80 to-red-500/80 hover:from-red-600/90 hover:to-red-500/90
              text-white border border-white/[0.08] rounded-lg transition-all duration-200 
              hover:scale-[1.02] active:scale-[0.98] font-['Bricolage_Grotesque']"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const StatusIndicator = ({ accessType }: { accessType: string }) => {
  switch (accessType.toLowerCase()) {
    case 'public':
      return (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-5 h-5 rounded-full flex items-center justify-center">
            <svg 
              viewBox="0 0 512 512" 
              className="text-green-600"
              fill="currentColor"
            >
              <path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8z"/>
              <path 
                d="M369 209L241 337l-64-64" 
                stroke="white" 
                strokeWidth="40" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>
          <span className="text-sm text-white font-bold font-['Bricolage_Grotesque']">Online</span>
        </div>
      );
    
    case 'developer':
      return (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center">
          <FaTools size={12} className="text-white" />
          </div>
          <span className="text-sm text-white font-bold font-['Bricolage_Grotesque']">Developer</span>
        </div>
      );
    
    case 'private':
      return (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-5 h-5 rounded-full bg-gray-500"/>
          <span className="text-sm text-white font-bold font-['Bricolage_Grotesque']">Offline</span>
        </div>
      );
    
    default:
      return (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-5 h-5 rounded-full bg-gray-500"/>
          <span className="text-sm text-white font-bold font-['Bricolage_Grotesque']">Drop</span>
        </div>
      );
  }
};

interface HomeProps {
  user: {
    username: string;
    avatar_url: string;
    accountId: string;
    email: string;
    password: string;
    favoriteSkin: string;
  };
}

export default function Library({ user }: HomeProps) {
  const { currentTheme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [versions, setVersions] = useState<VersionWithStatus[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [deleteModalVersion, setDeleteModalVersion] = useState<VersionWithStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadVersion, setDownloadVersion] = useState<'12.41'>('12.41');
  const [isDownloadingVersion, setIsDownloadingVersion] = useState(false);
  const [downloadCancelled, setDownloadCancelled] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [hasAnimated, setHasAnimated] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [prevViewMode, setPrevViewMode] = useState<'grid' | 'list'>('grid');
  const animatedCardsRef = useRef<Set<string>>(new Set());
  const animatedListCardsRef = useRef<Set<string>>(new Set());
  isLoading; // read ts so launcher builds


  useEffect(() => {
  animatedCardsRef.current = new Set();
  animatedListCardsRef.current = new Set();
}, [viewMode]);

 useEffect(() => {
    discordRPC.setLibraryActivity(user?.avatar_url, user?.username);
  }, [user?.avatar_url, user?.username]);


  useEffect(() => {
    const timer = setTimeout(() => setHasAnimated(true), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadVersions = async () => {
      setIsLoading(true);
      try {
        const loadedVersions = await invoke<VersionWithStatus[]>('get_versions_with_status');
        if (!controller.signal.aborted) setVersions(loadedVersions);
      } catch (error) {
        console.error('Failed to load versions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadVersions();
    return () => controller.abort();
  }, []);

  const handleAddVersion = async (version: VersionWithStatus) => {
    setVersions(prev => [...prev, version]);
  };

  const handleRemoveVersion = async (path: string, deleteFiles: boolean) => {
    try {
      const updatedVersions = await invoke<VersionWithStatus[]>('remove_version', { path, deleteFiles });
      setVersions(updatedVersions);
    } catch (error) {
      console.error('Failed to remove version:', error);
    }
  };

  const openExplorer = async (path: string) => {
    try {
      await open(path);
    } catch (error) {
      console.error('Failed to open explorer:', error);
    }
  };

  const handleDownloadVersion = async () => {
    console.log('handleDownloadVersion called', downloadVersion);
    setDownloadMessage('');
    setDownloadProgress(0);
    setDownloadStatus('Opening destination selector...');

    let selectedDir: string | string[] | null = null;
    try {
      selectedDir = await openDialog({
        directory: true,
        title: 'Select destination folder for downloaded version',
      });
    } catch (error) {
      console.error('Dialog open failed:', error);
      setDownloadMessage('Failed to open destination dialog.');
      setDownloadStatus('Dialog failed');
      return;
    }

    if (!selectedDir) {
      setDownloadMessage('Download cancelled.');
      setDownloadProgress(null);
      setDownloadStatus('');
      return;
    }

    console.log('Download destination selected:', selectedDir);

    const outputPath = typeof selectedDir === 'string'
      ? selectedDir
      : Array.isArray(selectedDir)
      ? selectedDir[0]
      : '';

    if (!outputPath) {
      setDownloadMessage('Download cancelled.');
      setDownloadProgress(null);
      setDownloadStatus('');
      return;
    }

    setDownloadCancelled(false);
    await invoke('clear_download_cancel');
    setIsDownloadingVersion(true);

    let unlisten: (() => void) | null = null;

    try {
      console.log('attaching download-progress listener');
      unlisten = await listen<{ stage: string; percent: number; message: string }>(
        'download-progress',
        (event) => {
          console.log('download-progress event received', event.payload);
          setDownloadProgress(event.payload.percent ?? 0);
          setDownloadStatus(event.payload.message ?? 'Downloading...');
        }
      );

      console.log('calling download_and_extract_version invoke');
      await invoke('download_and_extract_version', {
        version: downloadVersion,
        outputPath: outputPath,
      });
      console.log('download_and_extract_version invoke completed');
      setDownloadMessage(`Downloaded and extracted version ${downloadVersion}.`);
      setDownloadStatus('Completed');
    } catch (error) {
      console.error('Failed to download version:', error);
      const errorMessage = String(error);
      setDownloadMessage(errorMessage.includes('cancel') ? 'Download cancelled.' : errorMessage || 'Download failed.');
      setDownloadStatus(errorMessage.includes('cancel') ? 'Cancelled' : 'Failed');
    } finally {
      setIsDownloadingVersion(false);
      setDownloadCancelled(false);
      if (unlisten) {
        unlisten();
      }
    }
  };

  const handleCancelDownload = async () => {
    if (!isDownloadingVersion) return;
    setDownloadCancelled(true);
    setDownloadStatus('Cancelling...');
    try {
      await invoke('cancel_download');
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  const VersionCard = ({
  version,
  technical_version,
  splash_image,
  path,
  access_type,
  build_name,
  style,
  index,
}: VersionWithStatus & { index: number }) => {
  const navigate = useNavigate();
  const cardId = `${path}-${index}`;
  const hasAnimatedGrid = animatedCardsRef.current.has(cardId);
  const hasAnimatedList = animatedListCardsRef.current?.has(cardId);
  const isGrid = viewMode === 'grid';
  const isListEntering = prevViewMode === 'grid' && viewMode === 'list' && !hasAnimatedList;

  useEffect(() => {
    if (isGrid && !hasAnimatedGrid) {
      animatedCardsRef.current.add(cardId);
    }
    if (!isGrid && isListEntering) {
      animatedListCardsRef.current.add(cardId);
    }
  }, [cardId, isGrid, isListEntering, hasAnimatedGrid, hasAnimatedList]);

const handleCardClick = () => {
  const { email, password, username, avatar_url } = user;

  discordRPC.setPlayingActivity(version, user?.avatar_url, user?.username);

  navigate(`/version/${encodeURIComponent(path)}`, {
    state: {
      version: {
        version,
        technical_version,
        splash_image,
        path,
        access_type,
        build_name
      },
      user: {
        email,
        password,
        username,
        avatar_url
      },
      autoLaunch: false,
    }
  });
};

  const cardContent = (
    <div
      className={`group rounded-lg transform transition-all duration-300 ease-in-out
        ${!hasAnimatedGrid && isGrid ? 'opacity-0 animate-home' : 'opacity-100'}
        ${isGrid
          ? 'p-3 w-fit'
          : 'p-3 w-full max-w-4xl mx-auto flex items-center gap-3 bg-gradient-to-br from-indigo-800/20 to-purple-100/10 border border-white/[0.08]'}
      `}
      style={{
        ...style,
        ...(isGrid && !hasAnimatedGrid
          ? {
              animationDelay: `${Math.min(index * 0.05, 0.5)}s`,
              animationFillMode: 'forwards',
            }
          : {}),
      }}
    >
      <div
        className={`relative rounded-lg overflow-hidden cursor-pointer transition-all duration-300 ease-in-out
          ${isGrid ? 'h-[200px] w-[170px]' : 'h-[70px] w-[110px]'}
        `}
        onClick={handleCardClick}
      >
        <img src={splash_image} alt={`Version ${version}`} className="w-full h-full object-cover" />
        <div
          className="absolute inset-0 bg-black/30 opacity-100 transition-opacity duration-300 flex items-center justify-center"
          style={{
            '--tw-backdrop-blur': 'blur(24px)',
            backdropFilter: 'var(--tw-backdrop-blur)',
            WebkitBackdropFilter: 'var(--tw-backdrop-blur)',
          } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleCardClick();
            }}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:scale-105 hover:brightness-110"
          >
            <FaPlay size={14} className="text-white" />
            起動
          </button>
        </div>
        {isGrid && <StatusIndicator accessType={access_type} />}
      </div>

      <div className={`flex flex-col justify-between flex-1 transition-all duration-300 ease-in-out ${isGrid ? 'mt-3 ml-1' : 'px-2 py-1'}`}>
        <div className="flex items-center justify-between">
          <span className="text-base font-['Bricolage_Grotesque'] text-white font-bold">
            {build_name}
          </span>
          <div className="relative version-menu">
            <button className="p-1 rounded-md hover:bg-white/[0.05]" onClick={() => setActiveMenu(activeMenu === path ? null : path)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400 hover:text-white">
                <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
           {activeMenu === path && (
            <div className="absolute right-0 top-0 -translate-y-[calc(100%-4px)] w-40 rounded-lg bg-[#1a1a1a] border border-white/[0.08] shadow-lg z-50">
              <button onClick={() => { openExplorer(path); setActiveMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm text-white/90 hover:bg-white/[0.05] flex gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/40">
                  <path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.89l-.82-1.22A2 2 0 008.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z" />
                </svg>
                {t('openExplorer')}
              </button>
              <button onClick={() => { setDeleteModalVersion({ path, version, technical_version, splash_image, access_type, build_name }); setActiveMenu(null); }}
                className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-white/[0.05] flex gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {t('delete')}
              </button>
            </div>
          )}
          </div>
        </div>
        <span className="text-sm font-['Bricolage_Grotesque'] text-gray-400">{technical_version}</span>
      </div>
    </div>
  );

  return isGrid ? (
  cardContent
   ): (
  <motion.div
    initial={isListEntering ? { opacity: 0, y: 24 } : false}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8}}
    className={`${isListEntering ? 'animate-scale-fade' : ''}`}
  >
    {cardContent}
   </motion.div>
  );
  };






  const MemoizedVersionCard = React.memo(VersionCard);

  // wrap render in try/catch to surface runtime render errors in UI
  try {
    return (
      <div className="p-8 h-screen overflow-y-scroll scrollbar-hide relative" onClick={(e) => {
        if (activeMenu && !(e.target as HTMLElement).closest('.version-menu')) {
          setActiveMenu(null);
        }
      }}>
       <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>

        <div className="mt-8 flex items-center gap-4 mb-8">
          <h1 className={`text-4xl font-bold text-white font-['Bricolage_Grotesque'] ${!hasAnimated ? 'animate-home opacity-0' : 'opacity-100'}`}>{t('library')}</h1>
          <button onClick={() => setIsModalOpen(true)} className="w-10 h-10 text-white/90 border border-white/[0.08] rounded-xl flex items-center justify-center hover:brightness-110 transition-all duration-200" style={{ backgroundColor: currentTheme.colors.surface }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4V20M4 12H20" /></svg>
          </button>
         <div className="ml-39px flex gap-2 items-center">
  <button
      onClick={() => {
        setPrevViewMode(viewMode);
        setViewMode('grid');
      }}
      className={`p-2 rounded-lg flex items-center justify-center ${
        viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/60'
      } hover:bg-white/10`}
    >
      <FaThLarge size={16} />
    </button>
    <button
      onClick={() => {
        setPrevViewMode(viewMode);
        setViewMode('list');
      }}
      className={`p-2 rounded-lg flex items-center justify-center ${
        viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/60'
      } hover:bg-white/10`}
    >
      <FaList size={16} />
    </button>
          </div>
        </div>

     {viewMode === 'grid' ? (
    <div className="grid grid-cols-4 gap-5">
      {versions.map((version, index) => (
        <MemoizedVersionCard
          key={`${version.path}-${index}`}
          {...version}
          index={index}
          style={{
            animationDelay: `${Math.min(index * 0.05, 0.5)}s`,
            animationFillMode: 'forwards',
          }}
        />
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-4">
  {versions.map((version, index) => {
    const card = (
      <MemoizedVersionCard
        key={`${version.path}-${index}`}
        {...version}
        index={index}
      />
    );

    return prevViewMode === 'grid' ? (
      <motion.div key={`${version.path}-${index}`} layout transition={{ duration: 0.1, ease: 'easeInOut' }}>
        {card}
      </motion.div>
    ) : (
      <div key={`${version.path}-${index}`}>{card}</div>
    );
  })}

    </div>
  )}


        <div className="mt-12 p-6 rounded-3xl border border-white/[0.08] bg-white/5 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <label className="text-sm font-['Bricolage_Grotesque'] text-white/80">{t('selectVersion')}</label>
              <select
                value={downloadVersion}
                onChange={(e) => setDownloadVersion(e.target.value as '12.41')}
                className="rounded-full bg-[#111111] border border-white/[0.12] px-5 py-3 text-white focus:outline-none focus:border-white/40 transition-all duration-200"
              >
                <option value="12.41">12.41</option>
              </select>
            </div>

            <div className="flex gap-3 items-center">
              <button
                disabled={isDownloadingVersion}
                onClick={handleDownloadVersion}
                className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 text-white font-semibold hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloadingVersion ? t('downloading') : t('downloadExtract')}
              </button>
              {isDownloadingVersion && (
                <button
                  onClick={handleCancelDownload}
                  disabled={downloadCancelled}
                  className="rounded-full bg-red-600 px-6 py-3 text-white font-semibold hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadCancelled ? t('cancelling') : t('cancel')}
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-white/80">
            <p>Version 12.41 only supported.</p>
            <p>Zip contents are extracted directly without saving the full archive on disk.</p>
            {downloadProgress !== null && (
              <div className="space-y-2">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-white/90">{downloadStatus || `${downloadProgress}%`}</p>
              </div>
            )}
            {downloadMessage && <p className="text-white/90">{downloadMessage}</p>}
          </div>
        </div>

        <ImportVersionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onAddVersion={handleAddVersion}
        />

        {deleteModalVersion && (
          <DeleteModal
            isOpen={deleteModalVersion !== null}
            onClose={() => setDeleteModalVersion(null)}
            onConfirm={(deleteFiles) => {
              if (deleteModalVersion) {
                handleRemoveVersion(deleteModalVersion.path, deleteFiles);
              }
            }}
            version={deleteModalVersion}
          />
        )}
      </div>
    );
  } catch (renderErr) {
    console.error('Library render error:', renderErr);
    return (
      <div className="p-8 text-white">
        <h2 className="text-xl font-bold">{t('libraryRenderErrorTitle') || 'Library Error'}</h2>
        <pre className="mt-2 text-sm text-red-400">{String(renderErr)}</pre>
      </div>
    );
  }
}


