import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from "framer-motion";
import { FaShoppingBag } from 'react-icons/fa';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTheme } from '../contexts/ThemeContext';
import {discordRPC} from '../utils/discordRPC';
import t from '../utils/i18n';

interface ServerStats {
  player_count: number;
  server_count: number;
}

// Shop item definitions removed as shop UI logic was removed.


interface HomeProps {
  user: {
    username: string;
    accountId: string;
    email: string;
    avatar_url: string;
    password: string;
    favoriteSkin: string;
    mtxCurrency?: string;
    hype?: string;
  };
  isPreparing: boolean;
  events: Event[];
  isEventsLoading: boolean;
}

interface Event {
  id: number;
  name: string;
  card_name?: string;
  cardName?: string;
  thumbnail?: string;
  Thumbnail?: string;
  event_background?: string;
  eventBackground?: string;
  event_description?: string;
  eventDescription?: string;
  button_text?: string;
  ButtonText?: string;
  button_redirect_url?: string;
  ButtonRedirectURL?: string;
  button_color?: string;
  ButtonColor?: string;
  button_text_color?: string;
  ButtonTextColor?: string;
  active: boolean;
  audio_url?: string;
  audioUrl?: string;
  frame_text?: string;
  frameText?: string;
  ButtonIco?: string;
  IcoColor?: string;
}

interface NewsItem {
  id: string;
  title: string;
  description: string;
  content: string;
  date: string;
  category: 'update' | 'announcement' | 'event';
  image?: string;
  'description-en'?: string;
  'description-jp'?: string;
}




// const Card = ({ children }: { children: React.ReactNode }) => (
//   <div 
//     className="rounded-xl p-6 transition-all duration-200 hover:scale-[1.02]"
//     style={{
//       background: 'var(--bg-overlay)',
//       border: '1px solid var(--border-color)'
//     }}
//   >
//     {children}
//   </div>
// );

const getTimeBasedGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return t('goodMorning');
  if (hour >= 12 && hour < 17) return t('goodAfternoon');
  if (hour >= 17 && hour < 21) return t('goodEvening');
  return t('goodNight');
};

const getCategoryColor = (category: string): string => {
  switch (category) {
    case 'update':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'announcement':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'event':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    default:
      return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  }
};

const getCategoryLabel = (category: string): string => {
  switch (category) {
    case 'update':
      return t('categoryUpdate');
    case 'announcement':
      return t('categoryAnnouncement');
    case 'event':
      return t('categoryEvent');
    default:
      return category;
  }
};

const copyTextToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('navigator.clipboard failed:', err);
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (fallbackError) {
      console.error('Fallback clipboard failed:', fallbackError);
      return false;
    }
  }
};

const getPreferredNewsLanguage = () => {
  const storedLanguage = localStorage.getItem('appLanguage') || document.documentElement.lang || 'en';
  return storedLanguage.slice(0, 2).toLowerCase();
};

const getLocalizedNewsField = (item: NewsItem, field: 'description' | 'content') => {
  const language = getPreferredNewsLanguage();

  if (field === 'description') {
    if (language === 'ja') {
      return item['description-jp'] || item.description || item['description-en'] || '';
    }

    return item['description-en'] || item.description || item['description-jp'] || '';
  }

  return item.content || item['description-en'] || item['description-jp'] || item.description || '';
};

const normalizeNewsItems = (items: NewsItem[]): NewsItem[] => {
  return items.map((item) => ({
    ...item,
    title: item.title || 'Untitled',
    description: getLocalizedNewsField(item, 'description'),
    content: getLocalizedNewsField(item, 'content'),
  }));
};

const shareNews = async (item: NewsItem, platform: 'twitter' | 'discord' | 'copy') => {
  const text = `[${getCategoryLabel(item.category)}] ${item.title}\n${item.description}`;
  const encodedText = encodeURIComponent(text);
  
  switch (platform) {
    case 'twitter':
      await openUrl(`https://twitter.com/intent/tweet?text=${encodedText}`);
      break;
    case 'discord': {
      const success = await copyTextToClipboard(text);
      if (success) {
        alert(t('discordTextCopied'));
      } else {
        alert(t('copyFailedClipboard'));
      }
      break;
    }
    case 'copy': {
      const success = await copyTextToClipboard(text);
      if (success) {
        alert(t('copied'));
      } else {
        alert(t('copyFailedClipboard'));
      }
      break;
    }
  }
};

export default function Home({ user, isPreparing, events, isEventsLoading }: HomeProps) {
  const { currentTheme } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    const savedMuteState = localStorage.getItem('audioMuted');
    return savedMuteState ? JSON.parse(savedMuteState) : false;
  });
  const [isVideoMuted, setIsVideoMuted] = useState<boolean>(() => {
    try {
      const savedAudioPreference = localStorage.getItem('playBackgroundVideoAudio');
      if (savedAudioPreference !== null) {
        return savedAudioPreference !== 'true';
      }
    } catch {
      // ignore localStorage access issues and fall back to the persisted launcher state below
    }

    try {
      const savedVideoMuteState = localStorage.getItem('videoMuted');
      if (savedVideoMuteState !== null) {
        return JSON.parse(savedVideoMuteState);
      }
    } catch {
      // ignore
    }

    return false;
  });
  const [news] = useState<Event[]>([]);
  const [showContent, setShowContent] = useState(false);
  const [showTrailer, setShowTrailer] = useState(true);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [progress, setProgress] = useState(0);
  const [trailerVolume, setTrailerVolume] = useState<number>(() => {
    const v = localStorage.getItem('trailerVolume');
    return v ? parseFloat(v) : 0.7;
  });
  const [trailerMuted, setTrailerMuted] = useState<boolean>(() => {
    const m = localStorage.getItem('trailerMuted');
    return m ? JSON.parse(m) : false;
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [serverStats, setServerStats] = useState<ServerStats>(() => {
    const savedStats = localStorage.getItem('serverStats');
    return savedStats 
      ? JSON.parse(savedStats) 
      : { player_count: 0, server_count: 0 };
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const eventVideoRef = useRef<HTMLVideoElement | null>(null);
  const [showVBucks, setShowVBucks] = useState(true);
  const [languageTrigger, setLanguageTrigger] = useState(0);
  const [purchaseModalItem, setPurchaseModalItem] = useState<any>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // News関連の状態
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [selectedNewsCategory, setSelectedNewsCategory] = useState<'all' | 'update' | 'announcement' | 'event'>('all');
  const [selectedNewsDetail, setSelectedNewsDetail] = useState<NewsItem | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  showVBucks; // read ts so launcher builds  //wow
  serverStats;  // read ts so launcher builds  //wow
  isEventsLoading; // read ts so launcher builds  //wow
  setIsMuted; // read ts so launcher builds //wow
  languageTrigger; // read ts so launcher builds //wow

  useEffect(() => {
    discordRPC.setHome(user?.avatar_url, user?.username);
  }, [user?.avatar_url, user?.username]);

  // ニュース記事の初期化
  useEffect(() => {
    let isMounted = true;

    const loadNews = async () => {
      const sampleNews: NewsItem[] = [
        {
          id: '1',
          title: 'Drop is Live now!',
          description: 'Drop is now live! Join the community and explore the new features. https://discord.gg/Kt36rNuWub',
          'description-en': 'Drop is now live! Join the community and explore the new features. https://discord.gg/Kt36rNuWub',
          'description-jp': 'Dropがついに正式リリースされました!!Discordサーバーでプレイできます！ https://discord.gg/Kt36rNuWub',
          content: 'Drop is officially live! We are excited to welcome you to our new platform. Explore the features, join the community, and enjoy the experience! https://discord.gg/Kt36rNuWub',
          date: '2026-09-11',
          category: 'announcement',
          image: 'https://i.imgur.com/XkQLYFQ.png'
        }
      ];

      try {
        const response = await fetch('https://raw.githubusercontent.com/kikai0724/Launher/refs/heads/main/news', {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch news: ${response.status}`);
        }

        const payload = await response.json();
        const remoteNews = Array.isArray(payload) ? payload : Array.isArray(payload?.news) ? payload.news : [];

        const normalizedNews = normalizeNewsItems(remoteNews.length > 0 ? remoteNews : sampleNews);

        if (isMounted) {
          setNewsItems(normalizedNews);
        }
      } catch (error) {
        console.error('Failed to fetch remote news:', error);

        if (isMounted) {
          setNewsItems(normalizeNewsItems(sampleNews));
        }
      } finally {
        if (isMounted) {
          setNewsLoading(false);
        }
      }
    };

    void loadNews();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleLanguageChange = () => {
      setLanguageTrigger(prev => prev + 1);
    };
    const handleVideoAudioSettingChange = (event: globalThis.Event) => {
      const customEvent = event as unknown as CustomEvent<{ key?: string; value?: string }>;
      if (customEvent.detail?.key === 'playBackgroundVideoAudio') {
        const shouldPlay = customEvent.detail.value === 'true';
        setIsVideoMuted(!shouldPlay);
        localStorage.setItem('videoMuted', JSON.stringify(!shouldPlay));
      }
    };
    window.addEventListener('languageChanged', handleLanguageChange);
    window.addEventListener('kikaiMusicSettingsChanged', handleVideoAudioSettingChange as EventListener);
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChange);
      window.removeEventListener('kikaiMusicSettingsChanged', handleVideoAudioSettingChange as EventListener);
    };
  }, []);

  useEffect(() => {
    setNewsItems((prevItems) => normalizeNewsItems(prevItems));
  }, [languageTrigger]);

  useEffect(() => {
    const restoreAudioPreference = async () => {
      try {
        const enabled = await invoke<boolean>('get_background_video_audio_preference');
        const nextEnabled = typeof enabled === 'boolean' ? enabled : true;
        localStorage.setItem('playBackgroundVideoAudio', String(nextEnabled));
        localStorage.setItem('videoMuted', JSON.stringify(!nextEnabled));
        setIsVideoMuted(!nextEnabled);
      } catch {
        localStorage.setItem('playBackgroundVideoAudio', 'true');
        localStorage.setItem('videoMuted', 'false');
        setIsVideoMuted(false);
      }
    };

    void restoreAudioPreference();
  }, []);

  const isVideoFile = (url: string | undefined) => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  const toggleVideoMute = () => {
    const nextMuted = !isVideoMuted;
    const nextEnabled = !nextMuted;

    setIsVideoMuted(nextMuted);
    localStorage.setItem('videoMuted', JSON.stringify(nextMuted));
    localStorage.setItem('playBackgroundVideoAudio', String(nextEnabled));

    try {
      void invoke('save_background_video_audio_preference', { enabled: nextEnabled });
    } catch {
      // ignore persistence failures and keep the local fallback
    }

    if (eventVideoRef.current) {
      eventVideoRef.current.muted = nextMuted;
      eventVideoRef.current.volume = nextMuted ? 0 : 0.5;
    }
  };

  const trailerId = `trailer-seen-s2-${user.accountId}`;

  useEffect(() => {
    const hasSeenTrailer = localStorage.getItem(trailerId);
    if (hasSeenTrailer) {
      setShowTrailer(false);
    }
  }, [user.accountId]);

  useEffect(() => {
    if (!isPreparing && !showTrailer) {
      setShowContent(true);
    } else {
      setShowContent(false);
    }
  }, [isPreparing, showTrailer]);

  useEffect(() => {
    const skipButtonTimer = setTimeout(() => {
      if (showTrailer) {
        setShowSkipButton(true);
      }
    }, 10000);

    return () => clearTimeout(skipButtonTimer);
  }, [showTrailer]);

  const handleSkipTrailer = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setShowTrailer(false);
    localStorage.setItem(trailerId, 'true');
  };

  const handleTrailerEnded = () => {
    setShowTrailer(false);
    localStorage.setItem(trailerId, 'true');
  };

  useEffect(() => {
    if (showTrailer && videoRef.current) {
      const el = videoRef.current;
      el.muted = trailerMuted;
      el.volume = trailerMuted ? 0 : trailerVolume;
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Trailer autoplay failed:', err);
        });
      }
    }
  }, [showTrailer, trailerMuted, trailerVolume]);

  useEffect(() => {
    if (events.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % events.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [events.length]);



  useEffect(() => {
    if (showContent && events[currentSlide]?.audio_url && audioRef.current) {
      audioRef.current.src = events[currentSlide].audio_url;
      audioRef.current.volume = 0.1;
      if (!isMuted) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(console.error);
        }
      }
    }
  }, [showContent, events, currentSlide]);

  useEffect(() => {
    if (showContent && events[currentSlide]?.event_background && isVideoFile(events[currentSlide].event_background) && eventVideoRef.current) {
      eventVideoRef.current.src = events[currentSlide].event_background;
      eventVideoRef.current.muted = isVideoMuted;
      eventVideoRef.current.loop = true;
      eventVideoRef.current.volume = isVideoMuted ? 0 : 0.5;

      const playPromise = eventVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(console.error);
      }
    }
  }, [showContent, events, currentSlide, isVideoMuted]);

  useEffect(() => {
    if (showContent && events[currentSlide]?.audio_url && audioRef.current) {
      audioRef.current.src = events[currentSlide].audio_url;
      audioRef.current.volume = 0.1;
      if (!isMuted) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(console.error);
        }
      }
    }
  }, [currentSlide, events, isMuted]);
    useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          const next = (selectedIndex + 1) % news.length;
          setSelectedIndex(next);
          return 0;
        }
        return prev + 1;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [selectedIndex, news.length]);

  

  // event button handler removed (no event buttons present)

  useEffect(() => {
    const fetchServerStats = async () => {
      try {
        const stats = await invoke<ServerStats>('fetch_server_stats');
        setServerStats(stats);

        localStorage.setItem('serverStats', JSON.stringify(stats));
      } catch (error) {
        console.error('Failed to fetch server stats:', error);
      }
    };

    const fetchOnlineUsers = async () => {
      try {
        const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';
        const response = await fetch(backendUrl ? `${backendUrl}/api/online-users` : '/api/online-users', { cache: 'no-store' });
        const data = await response.json();
        if (data?.success && typeof data.onlineUsers === 'number') {
          setOnlineUsers(data.onlineUsers);
        }
      } catch (error) {
        console.error('Failed to fetch online users:', error);
      }
    };

    fetchServerStats();
    fetchOnlineUsers();

    const unlistenLoginSuccess = listen('login-success', () => {
      fetchServerStats();
      fetchOnlineUsers();
    });

    const interval = setInterval(() => {
      fetchServerStats();
      fetchOnlineUsers();
    }, 5000);
    
    return () => {
      clearInterval(interval);
      unlistenLoginSuccess.then(unlisten => unlisten());
    };
  }, []);

  // アップデート確認とDiscord通知
  const handleCheckUpdate = async () => {
    try {
      const versions = await invoke<Array<{
        path: string;
        version: string;
        technical_version: string;
        splash_image: string;
      }>>('get_versions');

      if (versions && versions.length > 0) {
        const latestVersion = versions[0];
        const currentVersion = localStorage.getItem('currentLauncherVersion') || '0.0.0';
        
        if (latestVersion.version !== currentVersion) {
          // 新しいバージョンが見つかった
          localStorage.setItem('currentLauncherVersion', latestVersion.version);
          
          // Discord通知を送信（オプション）
          alert(`A new version, ${latestVersion.version}, is available!`);
        } else {
          alert('You are using the latest version.');
        }
      }
    } catch (error) {
      console.error('Failed to check updates:', error);
      alert('Failed to check for updates. Please try again later.');
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setShowVBucks(prev => !prev);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Outfit card interactions removed.

  const handlePurchase = async (item: any) => {
    const vbucks = parseInt(String(user.mtxCurrency || "0"));
    if (vbucks < item.price) {
      alert(t('insufficientFunds') || "V-Bucksが不足しています");
      return;
    }

    setIsPurchasing(true);
    try {
      const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';
      const response = await fetch(backendUrl ? `${backendUrl}/api/launcher/purchase` : '/api/launcher/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password,
          accountId: user.accountId,
          itemId: item.cosmeticId,
          itemName: item.name,
          price: item.price
        })
      });

      if (response.ok) {
        alert(t('purchaseSuccess') || "購入しました！");
        setPurchaseModalItem(null);
        // Backend から新しいユーザーデータを取得するか、ここで残高を更新
      } else {
        alert(t('purchaseFailed') || "購入に失敗しました");
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert(t('error') || "エラーが発生しました");
    } finally {
      setIsPurchasing(false);
    }
  };

  // outfit carousel logic removed
return (
  <>
    {isPreparing && (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
        <div className="p-8 rounded-2xl min-w-[320px] max-w-[420px] transition bg-[#222222]/25 backdrop-blur-md z-10 shadow-2xl flex flex-col gap-6 border border-white/[0.08] animate-slide-bounce">
          <div className="flex flex-col items-center gap-5 preparing text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-lg shadow-black/30 animate-fade-in">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="text-2xl font-semibold text-white">{user?.username?.[0] || 'U'}</div>
              )}
            </div>
            <div className="space-y-2 animate-fade-in">
              <p className="text-white/70 text-[14px] font-medium tracking-[0.25em] uppercase">
                Preparing Launcher!
              </p>
              <p className="text-white text-[24px] font-semibold leading-tight">
                {user?.username ? `${user.username}.` : 'Hello!'}
              </p>
              <p className="text-white/75 text-[16px]">
                Welcome to Drop!
              </p>
            </div>
            <div className="flex items-center gap-3 text-white/60 animate-fade-in">
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 24 24"
                className="animate-spin"
                height="24"
                width="24"
              >
                <path d="M12 22c5.421 0 10-4.579 10-10h-2c0 4.337-3.663 8-8 8s-8-3.663-8-8c0-4.336 3.663-8 8-8V2C6.579 2 2 6.58 2 12c0 5.421 4.579 10 10 10z" />
              </svg>
              <span className="text-sm">Preparing to launch...</span>
            </div>
          </div>
        </div>
      </div>
    )}

    {!isPreparing && showTrailer && (
      <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center px-4 py-6 animate-fade-in">
        <div className="relative w-full h-full max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex items-center justify-center">
          <video
            ref={videoRef}
            src="https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropRelease!!.mp4"
            className="max-w-full max-h-full min-w-[640px] min-h-[360px] rounded-3xl shadow-2xl object-cover"
            autoPlay
            muted={trailerMuted}
            playsInline
            onEnded={handleTrailerEnded}
          />

          {/* Controls */}
          <div className="absolute bottom-6 left-1/2 z-60 w-[min(760px,calc(100%-2rem))] -translate-x-1/2 flex flex-wrap items-center gap-3 bg-black/40 backdrop-blur-sm px-4 py-3 rounded-3xl border border-white/10">
            <button
              onClick={() => {
                const next = !trailerMuted;
                setTrailerMuted(next);
                localStorage.setItem('trailerMuted', JSON.stringify(next));
                  if (videoRef.current) {
                    videoRef.current.muted = next;
                    videoRef.current.volume = next ? 0 : trailerVolume;
                  }
                }}
                className="p-2 rounded-full bg-white/10 hover:bg-white/15 text-white transition-all duration-200"
              >
                {trailerMuted ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 9v6h4l3 3V6l-3 3H9z"/></svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 9v6h4l3 3V6l-3 3H9z"/></svg>
                )}
              </button>

              <input
                aria-label="volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={trailerMuted ? 0 : trailerVolume}
                onChange={(e) => {
                  const v = parseFloat(e.currentTarget.value);
                  setTrailerVolume(v);
                  const muted = v === 0;
                  setTrailerMuted(muted);
                  localStorage.setItem('trailerVolume', String(v));
                  localStorage.setItem('trailerMuted', JSON.stringify(muted));
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = muted;
                  }
                }}
                className="flex-1 h-2 rounded-full bg-white/20 accent-white"
              />

              <button
                onClick={() => {
                  const el = videoRef.current as HTMLVideoElement | null;
                  if (!el) return;
                  if (el.requestFullscreen) {
                    el.requestFullscreen().catch(() => {});
                  } else if ((el as any).webkitRequestFullscreen) {
                    (el as any).webkitRequestFullscreen();
                  }
                }}
                className="p-2 rounded-md bg-white/5 hover:bg-white/10 text-white"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9v12h12"/><path d="M21 15V3H9"/></svg>
              </button>

            {showSkipButton && (
              <button
                onClick={handleSkipTrailer}
                className="ml-2 bg-white text-black font-medium px-4 py-2 rounded-2xl shadow-sm hover:bg-white/90 transition-all duration-200"
              >
                {t('skip')}
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {showContent && (
      <div className="p-4 pt-12 relative text-white min-h-screen overflow-y-auto scrollbar-hide">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/10 pointer-events-none"></div>
        <div className="flex items-center justify-between mb-6 animate-fade-slide-up">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shadow-md">
              <img
                src="https://i.imgur.com/BlTvkMc.png"
                alt="fav"
                className="object-cover w-full h-full scale-110"
              />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl font-['Bricolage_Grotesque']">
                {getTimeBasedGreeting()} {user.username}!
              </h1>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 animate-fade-slide-up-delay-1">
          <div className="flex flex-col gap-4">
            <div className="group relative h-[340px] overflow-hidden rounded-2xl shadow-lg animate-fade-slide-up-delay-2" style={{ backgroundColor: `${currentTheme.colors.surface}` }}>
             <AnimatePresence mode="wait">

               <motion.div
        key={events[currentSlide]?.id ?? 'fallback'}
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -60 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
        className="absolute inset-0"
      >
        {events[currentSlide] ? (
          isVideoFile(events[currentSlide].event_background) ? (
            <video
              ref={eventVideoRef}
              src={events[currentSlide].event_background}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted={isVideoMuted}
              playsInline
            />
          ) : (
            <img
              src={events[currentSlide].event_background}
              alt={events[currentSlide].name}
              className="w-full h-full object-cover"
            />
          )
        ) : (
          // Fallback: show a trailer video in the empty area
          <video
            ref={eventVideoRef}
            src="https://pub-b3ee689799f143a7968146e63124b471.r2.dev/DropRelease!!.mp4"
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted={isVideoMuted}
            playsInline
            controls={false}
          />
        )}

        {events[currentSlide] && isVideoFile(events[currentSlide].event_background) && (
          <button
            type="button"
            aria-label={isVideoMuted ? 'Unmute video' : 'Mute video'}
            onClick={toggleVideoMute}
            className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-black/45 p-2 text-white/80 opacity-0 shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-black/60 hover:text-white group-hover:opacity-100"
          >
            {isVideoMuted ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
                <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M11 5L6 9H3v6h3l5 4V5z" />
                <path d="M15.5 12c1.1-1.1 1.1-2.9 0-4M17.8 14.3a6 6 0 000-8.6M20 16.7a9.9 9.9 0 000-14.1" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-6 flex flex-col justify-end">
          <h1 className="text-2xl font-bold mb-2">{events[currentSlide]?.name ?? ''}</h1>
          <p className="uppercase text-sm font-semibold text-white/90 tracking-wider mb-2">
            {events[currentSlide]?.frame_text ?? ''}
          </p>
          <p className="text-white/80 line-clamp-2 max-w-2xl text-sm">{events[currentSlide]?.event_description ?? ''}</p>
            </div>
           </motion.div>
           </AnimatePresence>
            </div>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto max-h-[440px] pr-1 animate-fade-slide-up-delay-4 scrollbar-hide">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/80 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  <span>Online</span>
                </div>
                <span className="text-2xl font-black tracking-tight text-white">{onlineUsers}</span>
              </div>
            </div>

            {events.map((event, index) => (
              <div
                key={event.id}
                onClick={() => {
                  setCurrentSlide(index);
                  setProgress(0);
                }}
                className={`relative cursor-pointer rounded-xl overflow-hidden h-28 flex items-end p-4 border ${
                  index === currentSlide ? 'border-[#2f46ff]' : 'border-transparent'
                } transition-all duration-300 group`}
                style={{ backgroundColor: currentTheme.colors.surface }}
              >
                <img
                  src={event.event_background}
                  alt={event.name}
                  className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:scale-105 transition-transform duration-300"
                />
                <div className="relative z-10">
                  <h2 className="font-bold uppercase text-white/100">{event.name}</h2>
                  <p className="text-xs uppercase text-white/60">{event.frame_text}</p>
                </div>
                {index === currentSlide && (
                  <div
                    className="absolute top-0 left-0 h-full bg-white/10 z-0 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ニュースセクション */}
        <div className="mt-8 animate-fade-slide-up">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">News & Updates</h2>
              <p className="text-white/60 text-sm">Latest News and Updates</p>
            </div>
            <button
              onClick={handleCheckUpdate}
              className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Check for updates
            </button>
          </div>

          {/* カテゴリーフィルター */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setSelectedNewsCategory('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedNewsCategory === 'all'
                  ? 'bg-white/20 text-white border border-white/40'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedNewsCategory('update')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedNewsCategory === 'update'
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              update
            </button>
            <button
              onClick={() => setSelectedNewsCategory('announcement')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedNewsCategory === 'announcement'
                  ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              announcement
            </button>
            <button
              onClick={() => setSelectedNewsCategory('event')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedNewsCategory === 'event'
                  ? 'bg-pink-500/30 text-pink-300 border border-pink-500/50'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              Event
            </button>
          </div>

          {/* ニュース記事 */}
          {newsLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/40"></div>
            </div>
          )}

          {!newsLoading && (selectedNewsCategory === 'all' ? newsItems : newsItems.filter(item => item.category === selectedNewsCategory)).length === 0 && (
            <div className="text-center py-12">
              <p className="text-white/50 text-lg">No articles in this category</p>
            </div>
          )}

          {!newsLoading && (
            <div className="space-y-3">
              {(selectedNewsCategory === 'all' ? newsItems : newsItems.filter(item => item.category === selectedNewsCategory)).map(item => (
                <div
                  key={item.id}
                  className="group rounded-xl border border-white/10 bg-gradient-to-r from-white/5 to-white/[0.02] backdrop-blur-sm hover:border-white/20 hover:from-white/10 hover:to-white/5 transition-all duration-300 overflow-hidden cursor-pointer"
                  onClick={() => setSelectedNewsDetail(item)}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                            getCategoryColor(item.category)
                          }`}>
                            {getCategoryLabel(item.category)}
                          </span>
                          <span className="text-white/40 text-sm">{item.date}</span>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1 group-hover:text-white transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-white/70 text-sm">{item.description}</p>
                      </div>
                      {item.image && (
                        <div className="w-24 h-20 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        </div>
    )}

    {/* ニュース詳細モーダル */}
    {selectedNewsDetail && (
      <motion.div 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedNewsDetail(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
        <motion.div 
          className="relative max-w-2xl w-full max-h-[80vh] bg-gradient-to-b from-[#1a1a2e] to-[#16213e] z-10 border border-white/20 shadow-2xl rounded-2xl overflow-y-auto scrollbar-hide"
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
        >
          {selectedNewsDetail.image && (
            <div className="w-full h-64 overflow-hidden">
              <img
                src={selectedNewsDetail.image}
                alt={selectedNewsDetail.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          <div className="p-8">
            <div className="flex items-center justify-between mb-4">
              <span className={`px-4 py-1 rounded-full text-sm font-semibold border ${
                getCategoryColor(selectedNewsDetail.category)
              }`}>
                {getCategoryLabel(selectedNewsDetail.category)}
              </span>
              <span className="text-white/60 text-sm">{selectedNewsDetail.date}</span>
            </div>

            <h2 className="text-3xl font-bold text-white mb-3">{selectedNewsDetail.title}</h2>
            <p className="text-white/80 text-lg mb-6">{selectedNewsDetail.description}</p>
            
            <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-6">
              <p className="text-white/90 leading-relaxed whitespace-pre-wrap">{selectedNewsDetail.content}</p>
            </div>

            {/* シェアボタン */}
            <div className="flex gap-3 flex-wrap mb-6">
              <button
                onClick={() => shareNews(selectedNewsDetail, 'twitter')}
                className="px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 font-medium transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2s9 5 20 5a9.5 9.5 0 00-9-5.5c4.75 2.25 7-7 7-7a10.6 10.6 0 01-9-5.5z" />
                </svg>
                Share on Twitter
              </button>
              <button
                onClick={() => shareNews(selectedNewsDetail, 'discord')}
                className="px-4 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 font-medium transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.493c-1.53-.742-3.247-1.29-5.085-1.539a.75.75 0 00-.834.371c-.22.383-.468.867-.64 1.259a15.494 15.494 0 00-4.636-.733c-1.628 0-3.228.25-4.77.735-.172-.405-.419-.876-.64-1.259a.75.75 0 00-.833-.37c-1.838.25-3.555.797-5.085 1.54a.75.75 0 00-.123.12C1.395 9.7.951 14.56 1.625 19.306a.75.75 0 00.584.583c1.585.55 3.118 1.001 4.59 1.223a.75.75 0 00.813-.275 12.14 12.14 0 001.885-2.936.75.75 0 00-.212-.95.75.75 0 00-.95.212 10.7 10.7 0 01-1.705 2.467 9.127 9.127 0 01-3.19-1.232c.134-1.064.403-2.113.807-3.123a.75.75 0 00-.579-1.085 13.852 13.852 0 00-5.014-.109.75.75 0 10.205 1.478 12.26 12.26 0 014.44.105.75.75 0 00.816-.485 10.416 10.416 0 00.34-1.102 9.468 9.468 0 00-4.047 3.092.75.75 0 10.956 1.098 8.05 8.05 0 013.41-2.56 8.893 8.893 0 01.726 2.507.75.75 0 00.747.657h.016a.75.75 0 00.747-.657 10.17 10.17 0 01.757-2.286 13.04 13.04 0 011.78 2.38.75.75 0 00.959.283 12.45 12.45 0 003.741-2.03 8.21 8.21 0 01-2.07 3.178.75.75 0 00.24 1.131 16.77 16.77 0 003.205 1.255 8.98 8.98 0 004.297.06.75.75 0 10-.38-1.425 7.59 7.59 0 01-3.236-.083.75.75 0 00-.905.56 10.63 10.63 0 01-1.374 2.93 12.23 12.23 0 003.793-2.033 8.58 8.58 0 01-3.84 1.02.75.75 0 00-.114 1.49 10.516 10.516 0 004.48-.842 9.97 9.97 0 01-2.63 1.773.75.75 0 00.84 1.254 11.24 11.24 0 002.94-1.987 13.2 13.2 0 004.853 1.474.75.75 0 10.24-1.48 10.95 10.95 0 01-4.173-1.08 11.03 11.03 0 002.867-1.653.75.75 0 00-.67-1.291 8.74 8.74 0 01-3.055 1.74 9.348 9.348 0 001.106-3.051.75.75 0 00-.807-.786 9.683 9.683 0 01-2.141 2.904 13.024 13.024 0 01-.15-4.19.75.75 0 00-1.113-.65 14.91 14.91 0 00-2.682 2.542 8.626 8.626 0 01-.933-1.776 12.33 12.33 0 00-1.63-2.458zm-11.804 6.995a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm7 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
                Share on Discord
              </button>
              <button
                onClick={() => shareNews(selectedNewsDetail, 'copy')}
                className="px-4 py-2 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 border border-gray-500/30 font-medium transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
            </div>

            <button
              onClick={() => setSelectedNewsDetail(null)}
              className="w-full px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-all duration-200"
            >
              閉じる
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
      {purchaseModalItem && (
      <motion.div 
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setPurchaseModalItem(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
        <motion.div 
          className="relative p-6 rounded-2xl min-w-[400px] bg-gradient-to-b from-[#1a1a2e] to-[#16213e] z-10 border border-yellow-500/30 shadow-2xl"
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
        >
          <h3 className="text-2xl font-bold text-white mb-4">購入確認</h3>
          <div className="flex gap-4 mb-6">
            <img 
              src={(purchaseModalItem.featuredIcon || purchaseModalItem.icon) ?? ''} 
              alt={purchaseModalItem?.name ?? ''}
              className="w-20 h-20 rounded-lg object-cover"
            />
            <div>
              <p className="text-white font-bold text-lg">{purchaseModalItem?.name ?? ''}</p>
              <p className="text-white/70 text-sm mb-3">このアイテムを購入しますか？</p>
              <div className="flex items-center gap-2">
                <img src="https://image.fnbr.co/price/icon_vbucks.png" className="w-5 h-5" alt="V-Bucks" />
                <p className="text-yellow-400 font-bold text-lg">{(purchaseModalItem?.price ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-black/30 rounded-lg p-3 mb-6 border border-white/10">
            <p className="text-white/70 text-sm mb-2">Current V-Bucks</p>
            <div className="flex items-center gap-2">
              <img src="https://image.fnbr.co/price/icon_vbucks.png" className="w-5 h-5" alt="V-Bucks" />
              <p className="text-white font-bold">{user.mtxCurrency || "0"}</p>
            </div>
            {parseInt(String(user.mtxCurrency || "0")) < (purchaseModalItem?.price ?? 0) && (
              <p className="text-red-400 text-sm mt-2">V-Bucks is insufficient</p>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setPurchaseModalItem(null)}
              className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-all duration-200"
              disabled={isPurchasing}
            >
              Cancel
            </button>
            <button
              onClick={() => purchaseModalItem && handlePurchase(purchaseModalItem)}
              disabled={isPurchasing || parseInt(String(user.mtxCurrency || "0")) < (purchaseModalItem?.price ?? 0)}
              className="px-6 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold transition-all duration-200 flex items-center gap-2"
            >
              {isPurchasing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Purchasing...
                </>
              ) : (
                <>
                  <FaShoppingBag className="w-4 h-4" />
                  Purchase
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </>
);
};