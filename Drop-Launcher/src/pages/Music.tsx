import { useMemo, useRef, useState, useEffect } from 'react';
import BackgroundMedia from '../components/BackgroundMedia';
import { isVideoBackground } from '../utils/backgroundMedia';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  url: string;
  cover: string;
  mvUrl?: string;
}

export default function Music() {
  const pageRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMvPlaying, setIsMvPlaying] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFsControls, setShowFsControls] = useState(false);
  const [kikaiMvEnabled, setKikaiMvEnabled] = useState(true);
  const [kikaiMvAutoPlay, setKikaiMvAutoPlay] = useState(true);
  const [kikaiMvBackground, setKikaiMvBackground] = useState(true);
  const [renderMode, setRenderMode] = useState<'gpu' | 'cpu'>('gpu');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [youTubeVideoId, setYouTubeVideoId] = useState<string | null>(null);
  const [youTubeMvId, setYouTubeMvId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mvIframeRef = useRef<HTMLIFrameElement>(null);

  const getYouTubeVideoId = (url: string | undefined): string | null => {
    if (!url) return null;
    const idMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/))([A-Za-z0-9_-]{11})/);
    if (idMatch?.[1]) {
      return idMatch[1];
    }

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      if (hostname.includes('youtu.be')) {
        const id = parsed.pathname.slice(1).split(/[?&#]/)[0];
        return id || null;
      }

      if (hostname.includes('youtube.com')) {
        if (parsed.searchParams.has('v')) {
          return parsed.searchParams.get('v');
        }

        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'embed' || pathParts[0] === 'shorts' || pathParts[0] === 'v') {
          return pathParts[1] || null;
        }
      }
    } catch {
      return null;
    }

    return null;
  };

  const isYouTubeLink = (url: string | undefined) => !!getYouTubeVideoId(url);

  const postYouTubeCommand = (iframe: HTMLIFrameElement | null, command: string, args: any[] = []) => {
    if (!iframe?.contentWindow) return false;

    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args }), '*');
    return true;
  };

  const postYouTubeCommandWithRetry = (
    iframe: HTMLIFrameElement | null,
    command: string,
    args: any[] = [],
    attempts = 0
  ) => {
    postYouTubeCommand(iframe, command, args);
    if (attempts < 5) {
      window.setTimeout(() => postYouTubeCommandWithRetry(iframe, command, args, attempts + 1), 250);
    }
  };

  const postYouTubeCommandAll = (command: string, args: any[] = []) => {
    postYouTubeCommandWithRetry(iframeRef.current, command, args);
    postYouTubeCommandWithRetry(mvIframeRef.current, command, args);
  };

  const postYouTubePlayerCommand = (command: string, args: any[] = []) => {
    postYouTubeCommandWithRetry(iframeRef.current, command, args);
  };

  useEffect(() => {
    if (!currentTrack || !isYouTubeLink(currentTrack.url)) return;
    const volumePercent = Math.round(volume * 100);
    postYouTubePlayerCommand('setVolume', [volumePercent]);
    if (volumePercent === 0) {
      postYouTubePlayerCommand('mute');
    } else {
      postYouTubePlayerCommand('unMute');
    }
  }, [volume, currentTrack, youTubeVideoId]);

  useEffect(() => {
    if (!youTubeVideoId) return;
    if (isPlaying) {
      postYouTubeCommandAll('playVideo');
    } else {
      postYouTubeCommandAll('pauseVideo');
    }
  }, [isPlaying, youTubeVideoId]);

  const setVolumeLevel = (newVolume: number) => {
    const clamped = Math.min(1, Math.max(0, newVolume));
    setVolume(clamped);

    if (currentTrack && isYouTubeLink(currentTrack.url)) {
      const volumePercent = Math.round(clamped * 100);
      postYouTubePlayerCommand('setVolume', [volumePercent]);
      if (volumePercent === 0) {
        postYouTubePlayerCommand('mute');
      } else {
        postYouTubePlayerCommand('unMute');
      }
    } else {
      const audio = audioRef.current;
      if (audio) {
        audio.volume = clamped;
      }
    }
  };

  const playlist = useMemo<Track[]>(
    () => [
      {
        id: '1',
        title: 'Ten (feat. Skepta)',
        artist: 'Central Cee',
        album: 'KIKAI MUSIC',
        duration: '2:01',
        url: 'https://music.youtube.com/watch?v=9EwSyLYjq6A&si=74n9i6PCL9m59zk2',
        mvUrl: 'https://music.youtube.com/watch?v=9EwSyLYjq6A&si=74n9i6PCL9m59zk2',
        cover: 'https://i.ytimg.com/vi/9EwSyLYjq6A/hqdefault.jpg'
      },
      {
        id: '2',
        title: 'W / X / Y',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '4:34',
        url: 'https://youtu.be/mp2-w15SXms?si=IrmNg0_L-mMgiFQ4',
        mvUrl: 'https://youtu.be/mp2-w15SXms?si=IrmNg0_L-mMgiFQ4',
        cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
      },
      {
        id: '3',
        title: 'Rockstar',
        artist: 'Lil Shock',
        album: 'KIKAI MUSIC',
        duration: '2:11',
        url: 'https://music.youtube.com/watch?v=TgO_NEWdfFw&si=9URl9N2Jw_ArUOZE',
        mvUrl: 'https://music.youtube.com/watch?v=TgO_NEWdfFw&si=9URl9N2Jw_ArUOZE',
        cover: 'https://images.genius.com/51d761b9d0647a144fed244202564d42.1000x1000x1.png'
      },
      {
        id: '4',
        title: 'なんでもないや(Cover)',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '2:35',
        url: 'https://music.youtube.com/watch?v=3BivopRfae0&si=ZNe5BlqzQyBoTsss',
        mvUrl: 'https://music.youtube.com/watch?v=3BivopRfae0&si=ZNe5BlqzQyBoTsss',
        cover: 'https://i.ytimg.com/vi/3BivopRfae0/hqdefault.jpg'
      },
      {
        id: '5',
        title: '香水(Cover)',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '1:23',
        url: 'https://music.youtube.com/watch?v=YKS-u27GApE&si=LBNpzjZpHfo59HTe',
        mvUrl: 'https://music.youtube.com/watch?v=YKS-u27GApE&si=LBNpzjZpHfo59HTe',
        cover: 'https://i.ytimg.com/vi/YKS-u27GApE/hqdefault.jpg'
      },
      {
        id: '6',
        title: 'おかえり(弾き語り)',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '1:46',
        url: 'https://music.youtube.com/watch?v=1sC6fJ3UurI&si=Ufj4jc-hVCOSZG_m',
        mvUrl: 'https://music.youtube.com/watch?v=1sC6fJ3UurI&si=Ufj4jc-hVCOSZG_m',
        cover: 'https://i.ytimg.com/vi/1sC6fJ3UurI/hqdefault.jpg'
      },
      {
        id: '7',
        title: '愛にできることはまだあるかい(cover)',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '3:06',
        url: 'https://music.youtube.com/watch?v=TVXhhFvN3DI&si=SVXahUBYfmgNJqTk',
        mvUrl: 'https://music.youtube.com/watch?v=TVXhhFvN3DI&si=SVXahUBYfmgNJqTk',
        cover: 'https://i.ytimg.com/vi/TVXhhFvN3DI/hqdefault.jpg'
      },
      {
        id: '8',
        title: 'LIMITLES',
        artist: 'CENTRAL CEE',
        album: 'KIKAI MUSIC',
        duration: '3:22',
        url: 'https://music.youtube.com/watch?v=Ag2fJaNbw3Q&si=uFY0iiXOO3yNE1JN',
        mvUrl: 'https://music.youtube.com/watch?v=Ag2fJaNbw3Q&si=uFY0iiXOO3yNE1JN',
        cover: 'https://i.ytimg.com/vi/Ag2fJaNbw3Q/hqdefault.jpg'
      },
      {
        id: '9',
        title: 'Midnight Drip',
        artist: 'Central Cee, Ariana Grande ft. Dave, Lil Baby, Raye',
        album: 'KIKAI MUSIC',
        duration: '2:01',
        url: 'https://youtu.be/ibZmaDjPF2U?si=CgoXz8yQkKSZRrYi',
        mvUrl: 'https://youtu.be/ibZmaDjPF2U?si=CgoXz8yQkKSZRrYi',
        cover: 'https://i.ytimg.com/vi/ibZmaDjPF2U/hqdefault.jpg'
      },
      {
        id: '10',
        title: 'Mo Bamba',
        artist: 'Sheck Wes',
        album: 'KIKAI MUSIC',
        duration: '3:06',
        url: 'https://music.youtube.com/watch?v=VWoIpDVkOH0&si=gwUY_heZg2Noab6Q',
        mvUrl: 'https://music.youtube.com/watch?v=VWoIpDVkOH0&si=gwUY_heZg2Noab6Q',
        cover: 'https://i.ytimg.com/vi/VWoIpDVkOH0/hqdefault.jpg'
      },
      {
        id: '11',
        title: 'TRUTH IN THE LIES',
        artist: 'Central Cee,Lil Durk',
        album: 'KIKAI MUSIC',
        duration: '2:36',
        url: 'https://music.youtube.com/watch?v=BOBS4eEAAVs&si=AMES_HNfQAy_dM9P',
        mvUrl: 'https://music.youtube.com/watch?v=BOBS4eEAAVs&si=AMES_HNfQAy_dM9P',
        cover: 'https://i.ytimg.com/vi/BOBS4eEAAVs/hqdefault.jpg'
      },
      {
        id: '12',
        title: 'まちぼうけ',
        artist: 'ロクデナシ',
        album: 'KIKAI MUSIC',
        duration: '4:16',
        url: 'https://music.youtube.com/watch?v=FlVh_MuPueo&si=kesKMYVlzZENEMcp',
        mvUrl: 'https://music.youtube.com/watch?v=FlVh_MuPueo&si=kesKMYVlzZENEMcp',
        cover: 'https://i.ytimg.com/vi/FlVh_MuPueo/hqdefault.jpg'
      },
      {
        id: '13',
        title: 'No Pole',
        artist: 'ドン・トリヴァー',
        album: 'KIKAI MUSIC',
        duration: '3:08',
        url: 'https://music.youtube.com/watch?v=fCeiUX59_FM&si=9pqlM8zvBv5w9Hdf',
        mvUrl: 'https://music.youtube.com/watch?v=fCeiUX59_FM&si=9pqlM8zvBv5w9Hdf',
        cover: 'https://i.ytimg.com/vi/fCeiUX59_FM/hqdefault.jpg'
      },
      {
        id: '14',
        title: 'Day in the Life',
        artist: 'Central Cee',
        album: 'KIKAI MUSIC',
        duration: '3:09',
        url: 'https://music.youtube.com/watch?v=sq2JJf7jB00&si=zimcRxw7IM-9Tzko',
        mvUrl: 'https://music.youtube.com/watch?v=sq2JJf7jB00&si=zimcRxw7IM-9Tzko',
        cover: 'https://i.ytimg.com/vi/sq2JJf7jB00/hqdefault.jpg'
      },
      {
        id: '15',
        title: 'ビリミリオン',
        artist: '優里',
        album: 'KIKAI MUSIC',
        duration: '3:49',
        url: 'https://music.youtube.com/watch?v=vUsikBoa8i0&si=7cFFkWhNdLeVf9Kg',
        mvUrl: 'https://music.youtube.com/watch?v=vUsikBoa8i0&si=7cFFkWhNdLeVf9Kg',
        cover: 'https://i.ytimg.com/vi/vUsikBoa8i0/hqdefault.jpg'
      },
      {
        id: '16',
        title: '愛を伝えたいだとか',
        artist: 'あいみょん',
        album: 'KIKAI MUSIC',
        duration: '4:16',
        url: 'https://music.youtube.com/watch?v=9qRCARM_LfE&si=q8NTxa3rh9UYmqU-',
        mvUrl: 'https://music.youtube.com/watch?v=9qRCARM_LfE&si=q8NTxa3rh9UYmqU-',
        cover: 'https://i.ytimg.com/vi/9qRCARM_LfE/hqdefault.jpg'
      },
      {
        id: '17',
        title: 'Sourvivor',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '3:32',
        url: 'https://music.youtube.com/watch?v=St_shplUCZ0&si=U0WaU88tGCME9J9F',
        mvUrl: 'https://music.youtube.com/watch?v=St_shplUCZ0&si=U0WaU88tGCME9J9F',
        cover: 'https://i.ytimg.com/vi/St_shplUCZ0/hqdefault.jpg'
      },
      {
        id: '18',
        title: '吾輩は人である',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '4:31',
        url: 'https://music.youtube.com/watch?v=3PeqasSRf40&si=9joV7ybpqyeglSZ9',
        mvUrl: 'https://music.youtube.com/watch?v=3PeqasSRf40&si=9joV7ybpqyeglSZ9',
        cover: 'https://i.ytimg.com/vi/3PeqasSRf40/hqdefault.jpg'
      },
      {
        id: '19',
        title: 'Did It First',
        artist: 'Central Cee , Ice Spice',
        album: 'KIKAI MUSIC',
        duration: '2:07',
        url: 'https://music.youtube.com/watch?v=N2neoYs8niw&si=uzGYT6aEFVw5x7iz',
        mvUrl: 'https://music.youtube.com/watch?v=N2neoYs8niw&si=uzGYT6aEFVw5x7iz',
        cover: 'https://i.ytimg.com/vi/N2neoYs8niw/hqdefault.jpg'
      },
      {
        id: '20',
        title: 'がらくた',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '2:30',
        url: 'https://music.youtube.com/watch?v=EyNs01pyMV4&si=aziQNu4u2hfwTFdH',
        mvUrl: 'https://music.youtube.com/watch?v=EyNs01pyMV4&si=aziQNu4u2hfwTFdH',
        cover: 'https://i.ytimg.com/vi/EyNs01pyMV4/hqdefault.jpg'
      },
      {
        id: '21',
        title: 'ブレインロット (feat. Kasane Teto)',
        artist: '東京真中',
        album: 'KIKAI MUSIC',
        duration: '2:06',
        url: 'https://music.youtube.com/watch?v=UsjsYMo3O1Q&si=mRLO3M0UvbTk8kZ1',
        mvUrl: 'https://music.youtube.com/watch?v=UsjsYMo3O1Q&si=mRLO3M0UvbTk8kZ1',
        cover: 'https://i.ytimg.com/vi/UsjsYMo3O1Q/hqdefault.jpg'
      },
      {
        id: '22',
        title: 'ちいさな日々',
        artist: 'flumpool',
        album: 'KIKAI MUSIC',
        duration: '3:57',
        url: 'https://music.youtube.com/watch?v=XVDG299bB34&si=ZlrOG3e-BI6a5ORf',
        mvUrl: 'https://music.youtube.com/watch?v=XVDG299bB34&si=ZlrOG3e-BI6a5ORf',
        cover: 'https://i.ytimg.com/vi/XVDG299bB34/hqdefault.jpg'
      },
      {
        id: '23',
        title: 'Paint The Town Red',
        artist: 'Doja Cat',
        album: 'KIKAI MUSIC',
        duration: '3:57',
        url: 'https://music.youtube.com/watch?v=m4_9TFeMfJE&si=uJNJbOFSH5uZCgpG',
        mvUrl: 'https://music.youtube.com/watch?v=m4_9TFeMfJE&si=uJNJbOFSH5uZCgpG',
        cover: 'https://i.ytimg.com/vi/m4_9TFeMfJE/hqdefault.jpg'
      },
      {
        id: '24',
        title: 'ドライフラワー',
        artist: '優里',
        album: 'KIKAI MUSIC',
        duration: '4:48',
        url: 'https://music.youtube.com/watch?v=kzZ6KXDM1RI&si=j01A7yj8VRLcTELM',
        mvUrl: 'https://music.youtube.com/watch?v=kzZ6KXDM1RI&si=j01A7yj8VRLcTELM',
        cover: 'https://i.ytimg.com/vi/kzZ6KXDM1RI/hqdefault.jpg'
      },
      {
        id: '25',
        title: 'WAGWAN',
        artist: 'CENTRAL CEE',
        album: 'KIKAI MUSIC',
        duration: '3:04',
        url: 'https://music.youtube.com/watch?v=WqTO4uk1siU&si=9bgtXUVvzzG4z758',
        mvUrl: 'https://music.youtube.com/watch?v=WqTO4uk1siU&si=9bgtXUVvzzG4z758',
        cover: 'https://i.ytimg.com/vi/WqTO4uk1siU/hqdefault.jpg'
      },
      {
        id: '26',
        title: 'ICEMAN FREESTYLE',
        artist: 'CENTRAL CEE',
        album: 'KIKAI MUSIC',
        duration: '3:06',
        url: 'https://music.youtube.com/watch?v=OqYoYuoIiik&si=dryevAPjE3oe0XuS',
        mvUrl: 'https://music.youtube.com/watch?v=OqYoYuoIiik&si=dryevAPjE3oe0XuS',
        cover: 'https://i.ytimg.com/vi/OqYoYuoIiik/hqdefault.jpg'
      },
      {
        id: '27',
        title: 'Agora Hills',
        artist: 'Doja Cat',
        album: 'KIKAI MUSIC',
        duration: '5:11',
        url: 'https://music.youtube.com/watch?v=0c66ksfigtU&si=ojS-hiSX_VhKDtcO',
        mvUrl: 'https://music.youtube.com/watch?v=0c66ksfigtU&si=ojS-hiSX_VhKDtcO',
        cover: 'https://i.ytimg.com/vi/0c66ksfigtU/hqdefault.jpg'
      },
      {
        id: '28',
        title: 'Loading',
        artist: 'Central Cee',
        album: 'KIKAI MUSIC',
        duration: '2:59',
        url: 'https://music.youtube.com/watch?v=1Ok-i3uGXkM&si=yGsRvZYGy0bgAXQJ',
        mvUrl: 'https://music.youtube.com/watch?v=1Ok-i3uGXkM&si=yGsRvZYGy0bgAXQJ',
        cover: 'https://i.ytimg.com/vi/1Ok-i3uGXkM/hqdefault.jpg'
      },
      {
        id: '29',
        title: 'SLAUGHTER',
        artist: 'CENTRAL CEE, J Hus',
        album: 'KIKAI MUSIC',
        duration: '2:43',
        url: 'https://music.youtube.com/watch?v=-cgTFSrmrwQ&si=kVDxZQDA5siXGMKD',
        mvUrl: 'https://music.youtube.com/watch?v=-cgTFSrmrwQ&si=kVDxZQDA5siXGMKD',
        cover: 'https://i.ytimg.com/vi/-cgTFSrmrwQ/hqdefault.jpg'
      },
      {
        id: '30',
        title: '他人り事',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '3:43',
        url: 'https://music.youtube.com/watch?v=LICbBUNS3-I&si=tGS0KDzjhiFW89Yh',
        mvUrl: 'https://music.youtube.com/watch?v=LICbBUNS3-I&si=tGS0KDzjhiFW89Yh',
        cover: 'https://i.ytimg.com/vi/LICbBUNS3-I/hqdefault.jpg'
      },
      {
        id: '31',
        title: 'The Box',
        artist: 'Roddy Ricch',
        album: 'KIKAI MUSIC',
        duration: '3:43',
        url: 'https://music.youtube.com/watch?v=uLHqpjW3aDs&si=zQbtlsHTWBBGQq1X',
        mvUrl: 'https://music.youtube.com/watch?v=uLHqpjW3aDs&si=zQbtlsHTWBBGQq1X',
        cover: 'https://i.ytimg.com/vi/uLHqpjW3aDs/hqdefault.jpg'
      },
      {
        id: '32',
        title: '花占い',
        artist: 'Vaundy',
        album: 'KIKAI MUSIC',
        duration: '3:56',
        url: 'https://youtu.be/onhBN0qkUcE?si=ie7UarbnYGZ2xslX',
        mvUrl: 'https://youtu.be/onhBN0qkUcE?si=ie7UarbnYGZ2xslX',
        cover: 'https://i.ytimg.com/vi/onhBN0qkUcE/hqdefault.jpg'
      },
      {
        id: '33',
        title: 'だから僕は音楽を辞めた',
        artist: 'ヨルシカ',
        album: 'KIKAI MUSIC',
        duration: '4:06',
        url: 'https://youtu.be/KTZ-y85Erus?si=GY9UglH013nerIuK',
        mvUrl: 'https://youtu.be/KTZ-y85Erus?si=GY9UglH013nerIuK',
        cover: 'https://i.ytimg.com/vi/KTZ-y85Erus/hqdefault.jpg'
      },
      {
        id: '34',
        title: 'あぶく',
        artist: 'ヨルシカ',
        album: 'KIKAI MUSIC',
        duration: '3:54',
        url: 'https://youtu.be/OHAjc-ayhus?si=vO2sSu6rC1LvRMS9',
        mvUrl: 'https://youtu.be/OHAjc-ayhus?si=vO2sSu6rC1LvRMS9',
        cover: 'https://i.ytimg.com/vi/OHAjc-ayhus/hqdefault.jpg'
      },
      {
        id: '35',
        title: 'サマーライト',
        artist: '夏央',
        album: 'KIKAI MUSIC',
        duration: '4:38',
        url: 'https://youtu.be/k7y5Evemzw8?si=3hkZ3RMGhj0mxBrV',
        mvUrl: 'https://youtu.be/k7y5Evemzw8?si=3hkZ3RMGhj0mxBrV',
        cover: 'https://i.ytimg.com/vi/k7y5Evemzw8/hqdefault.jpg'
      },
      {
        id: '36',
        title: 'Galaxy Brain Meme',
        artist: 'idk dude',
        album: 'KIKAI MUSIC',
        duration: '0:32',
        url: 'https://youtu.be/CWExUQcTxB8?si=V8-TWb2r5JGxjbhY',
        mvUrl: 'https://youtu.be/CWExUQcTxB8?si=V8-TWb2r5JGxjbhY',
        cover: 'https://i.ytimg.com/vi/CWExUQcTxB8/hqdefault.jpg'
      },
      {
        id: '37',
        title: 'W/X/Y(Live ver.) 2021 "Memories"',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '4:48',
        url: 'https://youtu.be/DX4R3P4QLeg?si=WaADvTRrF2SmeS-Z',
        mvUrl: 'https://youtu.be/DX4R3P4QLeg?si=WaADvTRrF2SmeS-Z',
        cover: 'https://i.ytimg.com/vi/DX4R3P4QLeg/hqdefault.jpg'
      },
      {
        id: '38',
        title: '非lie心(Live ver.) 2021 "Memories"',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '4:21',
        url: 'https://youtu.be/KO6UVuO18KY?si=nT9D7dE4S-RT8SzR',
        mvUrl: 'https://youtu.be/KO6UVuO18KY?si=nT9D7dE4S-RT8SzR',
        cover: 'https://i.ytimg.com/vi/KO6UVuO18KY/hqdefault.jpg'
      },
      {
        id: '39',
        title: 'おかえり',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '3:46',
        url: 'https://youtu.be/0ZsP6MVjFIo?si=mPLdantMezpKasOC',
        mvUrl: 'https://youtu.be/0ZsP6MVjFIo?si=mPLdantMezpKasOC',
        cover: 'https://i.ytimg.com/vi/0ZsP6MVjFIo/hqdefault.jpg'
      },
      {
        id: '40',
        title: 'ベテルギウス',
        artist: '優里',
        album: 'KIKAI MUSIC',
        duration: '4:51',
        url: 'https://youtu.be/cbqvxDTLMps?si=tmkblXfF_ZExqL7k',
        mvUrl: 'https://youtu.be/cbqvxDTLMps?si=tmkblXfF_ZExqL7k',
        cover: 'https://i.ytimg.com/vi/cbqvxDTLMps/hqdefault.jpg'
      },
      {
        id: '41',
        title: 'ドライフラワー',
        artist: '優里',
        album: 'KIKAI MUSIC',
        duration: '4:51',
        url: 'https://youtu.be/kzZ6KXDM1RI?si=ftIX9FqG1Je4eKDe',
        mvUrl: 'https://youtu.be/kzZ6KXDM1RI?si=ftIX9FqG1Je4eKDe',
        cover: 'https://i.ytimg.com/vi/kzZ6KXDM1RI/hqdefault.jpg'
      },
      {
        id: '42',
        title: 'レオ',
        artist: '優里',
        album: 'KIKAI MUSIC',
        duration: '4:28',
        url: 'https://youtu.be/uxYLXaXtH9I?si=qwjqFGYq-jGT2pF0',
        mvUrl: 'https://youtu.be/uxYLXaXtH9I?si=qwjqFGYq-jGT2pF0',
        cover: 'https://i.ytimg.com/vi/uxYLXaXtH9I/hqdefault.jpg'
      },
      {
        id: '43',
        title: 'シャッター',
        artist: '優里',
        album: 'KIKAI MUSIC',
        duration: '4:29',
        url: 'https://youtu.be/EZ5RGA2UULE?si=sFUTJpLCJ4V21Fq2',
        mvUrl: 'https://youtu.be/EZ5RGA2UULE?si=sFUTJpLCJ4V21Fq2',
        cover: 'https://i.ytimg.com/vi/EZ5RGA2UULE/hqdefault.jpg'
      },
      {
        id: '44',
        title: '春泥棒',
        artist: 'ヨルシカ',
        album: 'KIKAI MUSIC',
        duration: '4:59',
        url: 'https://youtu.be/Sw1Flgub9s8?si=uiNIMj5s4AEGqUl5',
        mvUrl: 'https://youtu.be/Sw1Flgub9s8?si=uiNIMj5s4AEGqUl5',
        cover: 'https://i.ytimg.com/vi/Sw1Flgub9s8/hqdefault.jpg'
      },
      {
        id: '45',
        title: 'ただ君に晴れ',
        artist: 'ヨルシカ',
        album: 'KIKAI MUSIC',
        duration: '3:19',
        url: 'https://youtu.be/-VKIqrvVOpo?si=gUmqdJ84a4GnmjlC',
        mvUrl: 'https://youtu.be/-VKIqrvVOpo?si=gUmqdJ84a4GnmjlC',
        cover: 'https://i.ytimg.com/vi/-VKIqrvVOpo/hqdefault.jpg'
      },
      {
        id: '46',
        title: '晴る',
        artist: 'ヨルシカ',
        album: 'KIKAI MUSIC',
        duration: '4:36',
        url: 'https://youtu.be/CkvWJNt77mU?si=AvYFsI_beCaCmvkh',
        mvUrl: 'https://youtu.be/CkvWJNt77mU?si=AvYFsI_beCaCmvkh',
        cover: 'https://i.ytimg.com/vi/CkvWJNt77mU/hqdefault.jpg'
      },
      {
        id: '47',
        title: '忘れてください',
        artist: 'ヨルシカ',
        album: 'KIKAI MUSIC',
        duration: '4:36',
        url: 'https://youtu.be/J_DE2d1F9wU?si=0EfEceUNFEVS5Ild',
        mvUrl: 'https://youtu.be/J_DE2d1F9wU?si=0EfEceUNFEVS5Ild',
        cover: 'https://i.ytimg.com/vi/J_DE2d1F9wU/hqdefault.jpg'
      },
      {
        id: '48',
        title: '花に亡霊',
        artist: 'ヨルシカ',
        album: 'KIKAI MUSIC',
        duration: '4:02',
        url: 'https://youtu.be/9lVPAWLWtWc?si=Z8yHmcrBw4ydpINK',
        mvUrl: 'https://youtu.be/9lVPAWLWtWc?si=Z8yHmcrBw4ydpINK',
        cover: 'https://i.ytimg.com/vi/9lVPAWLWtWc/hqdefault.jpg'
      },
      {
        id: '49',
        title: '春を告げる',
        artist: 'yama',
        album: 'KIKAI MUSIC',
        duration: '4:02',
        url: 'https://youtu.be/DC6JppqHkaM?si=VFqeX7C0YTBVXQHL',
        mvUrl: 'https://youtu.be/DC6JppqHkaM?si=VFqeX7C0YTBVXQHL',
        cover: 'https://i.ytimg.com/vi/DC6JppqHkaM/hqdefault.jpg'
      },
      {
        id: '50',
        title: 'ヨワネハキ',
        artist: '和ぬか, asmi',
        album: 'KIKAI MUSIC',
        duration: '2:48',
        url: 'https://youtu.be/wUHBqw7N_Z4?si=urJn71LfcCk6_G2e',
        mvUrl: 'https://youtu.be/wUHBqw7N_Z4?si=urJn71LfcCk6_G2e',
        cover: 'https://i.ytimg.com/vi/wUHBqw7N_Z4/hqdefault.jpg'
      },
      {
        id: '51',
        title: 'もう一度',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '4:35',
        url: 'https://youtu.be/uP8CtPMAd5Q?si=iJT6UVuzPI65X2Xf',
        mvUrl: 'https://youtu.be/uP8CtPMAd5Q?si=iJT6UVuzPI65X2Xf',
        cover: 'https://i.ytimg.com/vi/uP8CtPMAd5Q/hqdefault.jpg'
      },
      {
        id: '52',
        title: 'マシュメロワンタイムイベント',
        artist: 'Epic, kikai_.',
        album: 'KIKAI MUSIC',
        duration: '10:24',
        url: 'https://youtu.be/54IPYDKu9dw?si=ix7q_6NNbk2oWLOu',
        mvUrl: 'https://youtu.be/54IPYDKu9dw?si=ix7q_6NNbk2oWLOu',
        cover: 'https://i.ytimg.com/vi/54IPYDKu9dw/hqdefault.jpg'
      },
      {
        id: '53',
        title: 'Remix FinalEvent',
        artist: 'Epic, kikai_.',
        album: 'KIKAI MUSIC',
        duration: '13:44',
        url: 'https://youtu.be/YSk_5AP8OOk?si=_2RhYVmgrNatuxX9',
        mvUrl: 'https://youtu.be/YSk_5AP8OOk?si=_2RhYVmgrNatuxX9',
        cover: 'https://i.ytimg.com/vi/YSk_5AP8OOk/hqdefault.jpg'
      },
      {
        id: '54',
        title: 'アイノウタ',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '3:11',
        url: 'https://music.youtube.com/watch?v=fZJ8m22M40g&si=p8osFSNX1WRlp8Zj',
        mvUrl: 'https://music.youtube.com/watch?v=fZJ8m22M40g&si=p8osFSNX1WRlp8Zj',
        cover: 'https://i.ytimg.com/vi/fZJ8m22M40g/hqdefault.jpg'
      },
      {
        id: '55',
        title: 'Oh Shh...',
        artist: 'Ice Spice , Travis Scott',
        album: 'KIKAI MUSIC',
        duration: '2:45',
        url: 'https://music.youtube.com/watch?v=9SuP4581LTA&si=b1xEbvnf4Rl9gPGL',
        mvUrl: 'https://music.youtube.com/watch?v=9SuP4581LTA&si=b1xEbvnf4Rl9gPGL',
        cover: 'https://i.ytimg.com/vi/9SuP4581LTA/hqdefault.jpg'
      },
      {
        id: '56',
        title: '桜のあと',
        artist: 'Tani Yuuki , cross-dominance',
        album: 'KIKAI MUSIC',
        duration: '3:59',
        url: 'https://music.youtube.com/watch?v=Xb8hDpV9Njc&si=ty8DiiNfS-Kh5j0M',
        mvUrl: 'https://music.youtube.com/watch?v=Xb8hDpV9Njc&si=ty8DiiNfS-Kh5j0M',
        cover: 'https://i.ytimg.com/vi/Xb8hDpV9Njc/hqdefault.jpg'
      },
      {
        id: '57',
        title: '好きだから。',
        artist: '「ユイカ」',
        album: 'KIKAI MUSIC',
        duration: '4:59',
        url: 'https://music.youtube.com/watch?v=eYAd4uDotF0&si=47RraELf0obDRmde',
        mvUrl: 'https://music.youtube.com/watch?v=eYAd4uDotF0&si=47RraELf0obDRmde',
        cover: 'https://i.ytimg.com/vi/eYAd4uDotF0/hqdefault.jpg'
      },
      {
        id: '58',
        title: 'ワライカタ',
        artist: '夜のひと笑い【Hanon×Kotoha ver.】',
        album: 'KIKAI MUSIC',
        duration: '3:37',
        url: 'https://music.youtube.com/watch?v=yKLJQl8tG6Q&si=1EnWT7d49o6jQlxO',
        mvUrl: 'https://music.youtube.com/watch?v=yKLJQl8tG6Q&si=1EnWT7d49o6jQlxO',
        cover: 'https://i.ytimg.com/vi/yKLJQl8tG6Q/hqdefault.jpg'
      },
      {
        id: '59',
        title: 'Life goes on(Live ver.)',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '2:49',
        url: 'https://music.youtube.com/watch?v=JjwA3aewiEI&si=Bna683LrZN6bdt4I',
        mvUrl: 'https://music.youtube.com/watch?v=JjwA3aewiEI&si=Bna683LrZN6bdt4I',
        cover: 'https://i.ytimg.com/vi/JjwA3aewiEI/hqdefault.jpg'
      },
      {
        id: '60',
        title: 'BAND4BAND',
        artist: 'Central Cee , リル・ベイビー',
        album: 'KIKAI MUSIC',
        duration: '2:32',
        url: 'https://music.youtube.com/watch?v=pDddlvCfTiw&si=BGqv2LxJ2hZE6nU2',
        mvUrl: 'https://music.youtube.com/watch?v=pDddlvCfTiw&si=BGqv2LxJ2hZE6nU2',
        cover: 'https://i.ytimg.com/vi/pDddlvCfTiw/hqdefault.jpg'
      },
      {
        id: '61',
        title: 'Feeling',
        artist: 'Juice wrld',
        album: 'KIKAI MUSIC',
        duration: '3:22',
        url: 'https://music.youtube.com/watch?v=9gHwgVRRCWg&si=D-LrlayRjBLoU8vo',
        mvUrl: 'https://music.youtube.com/watch?v=9gHwgVRRCWg&si=D-LrlayRjBLoU8vo',
        cover: 'https://i.ytimg.com/vi/9gHwgVRRCWg/hqdefault.jpg'
      },
      {
        id: '61',
        title: '君の知らない物語',
        artist: 'supercell',
        album: 'KIKAI MUSIC',
        duration: '5:56',
        url: 'https://music.youtube.com/watch?v=jpV5jeFlt_E&si=5Wdb3OL-rHJQ9L5N',
        mvUrl: 'https://music.youtube.com/watch?v=jpV5jeFlt_E&si=5Wdb3OL-rHJQ9L5N',
        cover: 'https://i.ytimg.com/vi/jpV5jeFlt_E/hqdefault.jpg'
      },
      {
        id: '62',
        title: 'ハルカ',
        artist: 'YOASOBI',
        album: 'KIKAI MUSIC',
        duration: '4:05',
        url: 'https://music.youtube.com/watch?v=vd3IlOjSUGQ&si=y_DpDYjIFYUU7Qy8',
        mvUrl: 'https://music.youtube.com/watch?v=vd3IlOjSUGQ&si=y_DpDYjIFYUU7Qy8',
        cover: 'https://i.ytimg.com/vi/vd3IlOjSUGQ/hqdefault.jpg'
      },
      {
        id: '63',
        title: 'Armed And Dangerous',
        artist: 'Juice wrld',
        album: 'KIKAI MUSIC',
        duration: '2:54',
        url: 'https://music.youtube.com/watch?v=bUfaMXQdun0&si=63wLxszvXKr5Tdto',
        mvUrl: 'https://music.youtube.com/watch?v=bUfaMXQdun0&si=63wLxszvXKr5Tdto',
        cover: 'https://i.ytimg.com/vi/bUfaMXQdun0/hqdefault.jpg'
      },
      {
        id: '64',
        title: 'Booga',
        artist: 'Central Cee',
        album: 'KIKAI MUSIC',
        duration: '1:51',
        url: 'https://music.youtube.com/watch?v=JmeUtPih4U8&si=GhGTmOiFYjX108hS',
        mvUrl: 'https://music.youtube.com/watch?v=JmeUtPih4U8&si=GhGTmOiFYjX108hS',
        cover: 'https://i.ytimg.com/vi/JmeUtPih4U8/hqdefault.jpg'
      },
      {
        id: '65',
        title: '(It Goes Like) Nanana',
        artist: 'Peggy Gou',
        album: 'KIKAI MUSIC',
        duration: '2:45',
        url: 'https://music.youtube.com/watch?v=sCz5y84dwuA&si=WZHs2r_Qp1KzVgEi',
        mvUrl: 'https://music.youtube.com/watch?v=sCz5y84dwuA&si=WZHs2r_Qp1KzVgEi',
        cover: 'https://i.ytimg.com/vi/sCz5y84dwuA/hqdefault.jpg'
      },
      {
        id: '66',
        title: 'Rift Tour featuring Ariana Grande (Full Event Video)',
        artist: 'Epic,Fortnite',
        album: 'KIKAI MUSIC',
        duration: '12:01',
        url: 'https://music.youtube.com/watch?v=gGYElBtjytU&si=PVRrvBTcRvPX3CfE',
        mvUrl: 'https://music.youtube.com/watch?v=gGYElBtjytU&si=PVRrvBTcRvPX3CfE',
        cover: 'https://i.ytimg.com/vi/gGYElBtjytU/hqdefault.jpg'
      },
      {
        id: '67',
        title: 'ファーストパーソン',
        artist: 'Epic,Fortnite,アンコモン',
        album: 'KIKAI MUSIC',
        duration: '2:55',
        url: 'https://fortnite.gg/img/items/15850/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/IGWyetN.png'
      },
      {
        id: '68',
        title: 'グウェンプールのマルチバース',
        artist: 'Epic,Fortnite,MARVELシリーズ',
        album: 'KIKAI MUSIC',
        duration: '2:58',
        url: 'https://fortnite.gg/img/items/14589/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/y9A3hKK.png'
      },
      {
        id: '69',
        title: 'Never Back Down',
        artist: 'Epic,Fortnite,アイコンシリーズ,Nick Eh 30',
        album: 'KIKAI MUSIC',
        duration: '2:49',
        url: 'https://youtu.be/ENGwmT3yldA?si=qJ0zfk1q-2miVVxq',
        mvUrl: 'https://youtu.be/ENGwmT3yldA?si=qJ0zfk1q-2miVVxq',
        cover: 'https://i.ytimg.com/vi/ENGwmT3yldA/hqdefault.jpg'
      },
      {
        id: '70',
        title: 'Rocket Racingのテーマ',
        artist: 'Epic,Fortnite,レア',
        album: 'KIKAI MUSIC',
        duration: '2:58',
        url: 'https://fortnite.gg/img/items/10896/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/rBTGvFE.png'
      },
      {
        id: '71',
        title: '再び原点へ',
        artist: 'Epic,Fortnite,レア',
        album: 'KIKAI MUSIC',
        duration: '2:09',
        url: 'https://fortnite.gg/img/items/10686/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/NHbqxNs.png'
      },
      {
        id: '72',
        title: 'ウェルカム・トゥ・ザ・スプリットショー',
        artist: 'Epic,Fortnite,レア',
        album: 'KIKAI MUSIC',
        duration: '2:55',
        url: 'https://fortnite.gg/img/items/10685/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/AEyQ8Vf.png'
      },
      {
        id: '73',
        title: '未来をつかめ',
        artist: 'Epic,Fortnite,レア',
        album: 'KIKAI MUSIC',
        duration: '3:00',
        url: 'https://fortnite.gg/img/items/9783/audio.mp3?2',
        mvUrl: '',
        cover: 'https://i.imgur.com/fx8DDB1.png'
      },
      {
        id: '74',
        title: 'セイ・イット・プラウド',
        artist: 'Epic,Fortnite,レア',
        album: 'KIKAI MUSIC',
        duration: '2:56',
        url: 'https://fortnite.gg/img/items/8278/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/2jToABX.png'
      },
      {
        id: '75',
        title: 'ハイステークスクラブ',
        artist: 'Epic,Fortnite,Crew Series',
        album: 'KIKAI MUSIC',
        duration: '3:40',
        url: 'https://fortnite.gg/img/items/8840/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/cow2ncr.png'
      },
      {
        id: '76',
        title: 'ベストバディ',
        artist: 'Epic,Fortnite,レア',
        album: 'KIKAI MUSIC',
        duration: '2:26',
        url: 'https://fortnite.gg/img/items/3326/audio.mp3?1',
        mvUrl: '',
        cover: 'https://i.imgur.com/zdm2pTF.png'
      },
      {
        id: '77',
        title: 'Miss The Rage',
        artist: 'トリッピー・レッド , プレイボーイ・カルティ',
        album: 'KIKAI MUSIC',
        duration: '3:58',
        url: 'https://music.youtube.com/watch?v=e9u0HmXLPmA&si=yfbyV2jEBKT3omJo',
        mvUrl: 'https://music.youtube.com/watch?v=e9u0HmXLPmA&si=yfbyV2jEBKT3omJo',
        cover: 'https://i.ytimg.com/vi/e9u0HmXLPmA/hqdefault.jpg'
      },
      {
        id: '78',
        title: 'スピカ',
        artist: 'ロクデナシ',
        album: 'KIKAI MUSIC',
        duration: '2:46',
        url: 'https://music.youtube.com/watch?v=Ol1o3dgPIbI&si=FPVpU3thxpTw5Ysp',
        mvUrl: 'https://music.youtube.com/watch?v=Ol1o3dgPIbI&si=FPVpU3thxpTw5Ysp',
        cover: 'https://i.ytimg.com/vi/Ol1o3dgPIbI/hqdefault.jpg'
      },
      {
        id: '79',
        title: '打上花火',
        artist: 'DAOKO , 米津玄師',
        album: 'KIKAI MUSIC',
        duration: '4:53',
        url: 'https://music.youtube.com/watch?v=-tKVN2mAKRI&si=HHCqRq8QAM7JKgEh',
        mvUrl: 'https://music.youtube.com/watch?v=-tKVN2mAKRI&si=HHCqRq8QAM7JKgEh',
        cover: 'https://i.ytimg.com/vi/-tKVN2mAKRI/hqdefault.jpg'
      },
      {
        id: '80',
        title: 'Travis Scott and Fortnite Present: Astronomical (Full Event Video)',
        artist: 'ロクデナシ',
        album: 'KIKAI MUSIC',
        duration: '8:58',
        url: 'https://music.youtube.com/watch?v=wYeFAlVC8qU&si=2vLkx6j4FR8KNAJk',
        mvUrl: 'https://music.youtube.com/watch?v=wYeFAlVC8qU&si=2vLkx6j4FR8KNAJk',
        cover: 'https://i.ytimg.com/vi/wYeFAlVC8qU/hqdefault.jpg'
      },
      {
        id: '81',
        title: 'Turn Up',
        artist: 'Rakai, PlaqueBoyMax & BunnaB',
        album: 'KIKAI MUSIC',
        duration: '2:33',
        url: 'https://youtu.be/4KA3tcMEpq8?si=MeAYgexziwD1a3Hv',
        mvUrl: 'https://youtu.be/4KA3tcMEpq8?si=MeAYgexziwD1a3Hv',
        cover: 'https://i.ytimg.com/vi/4KA3tcMEpq8/hqdefault.jpg'
      },
      {
        id: '82',
        title: '4 Raws Remix',
        artist: 'EsDeeKid ft. Timothée Chalamet',
        album: 'KIKAI MUSIC',
        duration: '1:38',
        url: 'https://youtu.be/57C13H0BnnU?si=pXwKuPXS5S3D2Jbo',
        mvUrl: 'https://youtu.be/57C13H0BnnU?si=pXwKuPXS5S3D2Jbo',
        cover: 'https://i.ytimg.com/vi/57C13H0BnnU/hqdefault.jpg'
      },
      {
        id: '83',
        title: '後悔史 Live ver. 2026 "日本武道館"',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '7:12',
        url: 'https://youtu.be/eLTPD35_hoM?si=Jcw5ZwA0xz2Evvat',
        mvUrl: 'https://youtu.be/eLTPD35_hoM?si=Jcw5ZwA0xz2Evvat',
        cover: 'https://i.ytimg.com/vi/eLTPD35_hoM/hqdefault.jpg'
      },
      {
        id: '84',
        title: 'ヨワネハキ feat. 和ぬか,asmi / MAISONdes',
        artist: 'Tani Yuuki, 小玉ひかり',
        album: 'KIKAI MUSIC',
        duration: '2:51',
        url: 'https://music.youtube.com/watch?v=9fEBTRCaJ50&si=Fko7nr-nI_91_Dus',
        mvUrl: 'https://music.youtube.com/watch?v=9fEBTRCaJ50&si=Fko7nr-nI_91_Dus',
        cover: 'https://i.ytimg.com/vi/9fEBTRCaJ50/hqdefault.jpg'
      },
      {
        id: '85',
        title: '夢灯籠',
        artist: 'RADWIMPS',
        album: 'KIKAI MUSIC',
        duration: '2:12',
        url: 'https://music.youtube.com/watch?v=S6kjwLlKXnk&si=RtbNwCD71NbUd88O',
        mvUrl: 'https://music.youtube.com/watch?v=S6kjwLlKXnk&si=RtbNwCD71NbUd88O',
        cover: 'https://i.ytimg.com/vi/S6kjwLlKXnk/hqdefault.jpg'
      },
      {
        id: '86',
        title: 'すずめ（feat. 十明）',
        artist: 'RADWIMPS',
        album: 'KIKAI MUSIC',
        duration: '3:57',
        url: 'https://music.youtube.com/watch?v=Xs0Lxif1u9E&si=w3dfB8dR0_Ks8ZaN',
        mvUrl: 'https://music.youtube.com/watch?v=Xs0Lxif1u9E&si=w3dfB8dR0_Ks8ZaN',
        cover: 'https://i.ytimg.com/vi/Xs0Lxif1u9E/hqdefault.jpg'
      },
      {
        id: '87',
        title: '愛にできることはまだあるかい',
        artist: 'RADWIMPS',
        album: 'KIKAI MUSIC',
        duration: '7:29',
        url: 'https://music.youtube.com/watch?v=EQ94zflNqn4&si=VW_gTgTxJUqB_QAd',
        mvUrl: 'https://music.youtube.com/watch?v=EQ94zflNqn4&si=VW_gTgTxJUqB_QAd',
        cover: 'https://i.ytimg.com/vi/EQ94zflNqn4/hqdefault.jpg'
      },
      {
        id: '88',
        title: '全然前世',
        artist: 'RADWIMPS',
        album: 'KIKAI MUSIC',
        duration: '4:53',
        url: 'https://music.youtube.com/watch?v=PDSkFeMVNFs&si=HuLkk-n6cKmlxwc-',
        mvUrl: 'https://music.youtube.com/watch?v=PDSkFeMVNFs&si=HuLkk-n6cKmlxwc-',
        cover: 'https://i.ytimg.com/vi/PDSkFeMVNFs/hqdefault.jpg'
      },
      {
        id: '89',
        title: 'Life is beautiful / Tani Yuuki - LIVE at 日本武道館 (Official Lyric Live Video)',
        artist: 'Tani Yuuki',
        album: 'KIKAI MUSIC',
        duration: '4:20',
        url: 'https://youtu.be/tSpIfmu0Mig?si=gqcmhfV3qOEHedfW',
        mvUrl: 'https://youtu.be/tSpIfmu0Mig?si=gqcmhfV3qOEHedfW',
        cover: 'https://i.ytimg.com/vi/tSpIfmu0Mig/hqdefault.jpg'
      },
      {
        id: '90',
        title: '【久我山栞の死様手帖】オープニングテーマ『レイカレイヘ』',
        artist: '風樹 , Laplacian',
        album: 'KIKAI MUSIC',
        duration: '4:20',
        url: 'https://music.youtube.com/watch?v=TCE0jEjAXKQ&si=Wl03waClrYPe-crO',
        mvUrl: 'https://music.youtube.com/watch?v=TCE0jEjAXKQ&si=Wl03waClrYPe-crO',
        cover: 'https://i.ytimg.com/vi/TCE0jEjAXKQ/hqdefault.jpg'
      }
    ],
    []
  );

  const filteredPlaylist = useMemo<Track[]>(() => {
    if (!searchQuery.trim()) return playlist;
    
    const query = searchQuery.toLowerCase().trim();
    return playlist.filter(track =>
      track.title.toLowerCase().includes(query) ||
      track.artist.toLowerCase().includes(query)
    );
  }, [playlist, searchQuery]);

  useEffect(() => {
    if (!currentTrack && playlist.length > 0) {
      setCurrentTrack(playlist[0]);
    }
  }, [currentTrack, playlist]);

  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio) return;

    const updateTime = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      if (video && isMvPlaying) {
        try {
          const drift = Math.abs(video.currentTime - time);
          if (drift > 0.25) {
            video.currentTime = time;
          }
        } catch {
          // Some browsers may not allow precise syncing on every update.
        }
      }
    };
    const updateDuration = () => setDuration(audio.duration);
    const endedHandler = () => {
      setIsPlaying(false);
      if (video) {
        video.pause();
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('ended', endedHandler);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('ended', endedHandler);
    };
  }, [currentTrack, isMvPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !youTubeVideoId) {
      audio.volume = volume;
    }
  }, [volume, youTubeVideoId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.loop = true;
    video.preload = 'auto';
      video.playbackRate = 2.05;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (renderMode === 'gpu') {
      video.style.willChange = 'opacity, transform';
      video.style.transform = 'translateZ(0)';
    } else {
      video.style.willChange = 'auto';
      video.style.transform = 'none';
      if (isMvPlaying) {
        video.pause();
        setIsMvPlaying(false);
      }
    }
  }, [renderMode, isMvPlaying]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ key: string; value: string }>;
      if (!customEvent?.detail) return;
      const { key, value } = customEvent.detail;

      if (key === 'renderMode') {
        setRenderMode(value === 'cpu' ? 'cpu' : 'gpu');
      }
      if (key === 'enableMv') {
        setKikaiMvEnabled(value !== 'false');
      }
      if (key === 'autoPlayMv') {
        setKikaiMvAutoPlay(value === 'true');
      }
      if (key === 'mvBackground') {
        setKikaiMvBackground(value !== 'false');
      }
      if (key === 'backgroundImage') {
        try {
          setBackgroundImage(value || null);
        } catch {
          setBackgroundImage(null);
        }
      }
    };

    window.addEventListener('kikaiMusicSettingsChanged', handleSettingsChanged);
    return () => {
      window.removeEventListener('kikaiMusicSettingsChanged', handleSettingsChanged);
    };
  }, []);

  useEffect(() => {
    try {
      const enabled = localStorage.getItem('kikaiMusicEnableMv');
      const autoPlay = localStorage.getItem('kikaiMusicAutoPlayMv');
      const background = localStorage.getItem('kikaiMusicMvBackground');
      const mode = localStorage.getItem('kikaiMusicRenderMode');

      setKikaiMvEnabled(enabled !== 'false');
      setKikaiMvAutoPlay(autoPlay === 'true');
      setKikaiMvBackground(background !== 'false');
      setRenderMode(mode === 'cpu' ? 'cpu' : 'gpu');
      const bg = localStorage.getItem('kikaiMusicBackgroundImage');
      setBackgroundImage(bg || null);
    } catch {
      setKikaiMvEnabled(true);
      setKikaiMvAutoPlay(true);
      setKikaiMvBackground(true);
      setRenderMode('gpu');
    }
  }, []);

  useEffect(() => {
    const onFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullScreenChange);
    };
  }, []);

  useEffect(() => {
    if (!isFullScreen) {
      setShowFsControls(false);
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
      return;
    }

    const target = pageRef.current ?? document;
    const handleMouseMove = () => {
      setShowFsControls(true);
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
      controlsTimerRef.current = window.setTimeout(() => {
        setShowFsControls(false);
        controlsTimerRef.current = null;
      }, 1200);
    };

    target.addEventListener('mousemove', handleMouseMove);
    return () => {
      target.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    };
  }, [isFullScreen]);

  const playTrack = async (track: Track) => {
    const audio = audioRef.current;
    const video = videoRef.current;
    const trackYouTubeId = getYouTubeVideoId(track.url);
    const mvYouTubeId = track.mvUrl ? getYouTubeVideoId(track.mvUrl) : null;
    const hasMv = !!track.mvUrl && kikaiMvEnabled && renderMode === 'gpu';

    setCurrentTrack(track);
    setYouTubeVideoId(trackYouTubeId);
    setYouTubeMvId(hasMv ? (mvYouTubeId || trackYouTubeId) : null);
    setIsMvPlaying(hasMv);
    setIsPlaying(true);

    if (trackYouTubeId) {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      return;
    }

    if (!audio) return;

    audio.src = track.url;
    audio.currentTime = 0;
    audio.load();

    if (video) {
      if (hasMv && track.mvUrl && !mvYouTubeId) {
        video.src = track.mvUrl;
        video.currentTime = 0;
        video.load();
      } else {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }

    try {
      await audio.play();
      if (video && hasMv && !mvYouTubeId && kikaiMvAutoPlay) {
        await video.play().catch(() => {
          // autoplay may be blocked until user interacts
        });
      }
    } catch {
      console.warn('Playback blocked until user interaction');
      setIsPlaying(false);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    const video = videoRef.current;
    const hasYouTubeTrack = currentTrack && isYouTubeLink(currentTrack.url);

    if (hasYouTubeTrack) {
      if (!youTubeVideoId) {
        const newId = getYouTubeVideoId(currentTrack!.url);
        setYouTubeVideoId(newId);
        setYouTubeMvId(currentTrack?.mvUrl ? getYouTubeVideoId(currentTrack.mvUrl) : null);
        setIsPlaying(true);
        return;
      }

      if (isPlaying) {
        postYouTubeCommandAll('stopVideo');
        setYouTubeVideoId(null);
        setYouTubeMvId(null);
        setIsPlaying(false);
      } else {
        postYouTubeCommandAll('playVideo');
        setIsPlaying(true);
      }
      return;
    }

    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      if (video) {
        video.pause();
      }
      setIsPlaying(false);
      return;
    }

    try {
      await audio.play();
      if (video && isMvPlaying) {
        await video.play().catch(() => {
          // autoplay blocked until interaction
        });
      }
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const toggleFullScreen = async () => {
    const page = pageRef.current;
    if (!page) return;

    if (!document.fullscreenElement) {
      await page.requestFullscreen().catch(() => {
        // Fullscreen request failed or blocked.
      });
    } else {
      await document.exitFullscreen().catch(() => {
        // Exit fullscreen failed.
      });
    }
  };

  const handleSelectTrack = (track: Track) => {
    if (track.id === currentTrack?.id) {
      void togglePlay();
    } else {
      void playTrack(track);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <div
      ref={pageRef}
      className="min-h-screen p-6 relative overflow-hidden isolate"
      style={backgroundImage && !isVideoBackground(backgroundImage) ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {backgroundImage && isVideoBackground(backgroundImage) && (
        <BackgroundMedia source={backgroundImage} className="-z-10" />
      )}
      <audio
        ref={audioRef}
        src={currentTrack && !isYouTubeLink(currentTrack.url) ? currentTrack.url : undefined}
      />
      {youTubeVideoId && (
        <iframe
          ref={iframeRef}
          className="pointer-events-none absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-0"
          src={`https://www.youtube.com/embed/${youTubeVideoId}?enablejsapi=1&autoplay=1&controls=1&rel=0&modestbranding=1&origin=${window.location.origin}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          title="YouTube audio player"
          onLoad={() => {
            const volumePercent = Math.round(volume * 100);
            postYouTubePlayerCommand('setVolume', [volumePercent]);
            if (volumePercent === 0) {
              postYouTubePlayerCommand('mute');
            } else {
              postYouTubePlayerCommand('unMute');
            }
            if (isPlaying) {
              postYouTubePlayerCommand('playVideo');
            }
          }}
        />
      )}
      {(!youTubeMvId || !isMvPlaying) && (
        <video
          ref={videoRef}
          className={`pointer-events-none absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isMvPlaying && kikaiMvBackground ? 'opacity-40' : 'opacity-0'}`}
          style={{
            willChange: renderMode === 'gpu' ? 'opacity, transform' : 'auto',
            transform: renderMode === 'gpu' ? 'translateZ(0)' : 'none'
          }}
          playsInline
          muted
          loop
          preload="auto"
        />
      )}
      {youTubeMvId && isMvPlaying && (
        <iframe
          ref={mvIframeRef}
          className="pointer-events-none absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-40"
          src={`https://www.youtube.com/embed/${youTubeMvId}?enablejsapi=1&autoplay=1&controls=0&loop=1&playlist=${youTubeMvId}&rel=0&modestbranding=1&mute=1&origin=${window.location.origin}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          title="YouTube background video"
          onLoad={() => {
            if (isPlaying) {
              postYouTubeCommandAll('playVideo');
            }
          }}
        />
      )}
      {isFullScreen && (
        <div className={`pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-6 transition-opacity duration-200 ${showFsControls ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={toggleFullScreen}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition hover:bg-black/80"
            aria-label="Exit fullscreen"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6H10M6 6V10" />
              <path d="M14 6H18M18 6V10" />
              <path d="M6 18H10M6 18V14" />
              <path d="M14 18H18M18 18V14" />
            </svg>
          </button>
        </div>
      )}
      <div className={`grid grid-cols-12 gap-6 relative ${isFullScreen ? 'hidden' : ''}`}>
        <main className={`col-span-10 col-start-2 z-10 bg-black/70 rounded-lg p-8 h-[86vh] overflow-hidden flex flex-col ${isFullScreen ? 'hidden' : ''}`}>
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-36 h-36 bg-gray-800 rounded overflow-hidden shadow-lg">
                <img src={currentTrack?.cover} alt="cover" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-white text-2xl font-bold">{currentTrack?.album || 'WAV Player'}</h3>
                <p className="text-white/70">KIKAI MUSIC</p>
              </div>
            </div>

            <div className="rounded-3xl bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-white font-semibold">{currentTrack?.title || 'No track selected'}</div>
                  <div className="text-white/60 text-sm">{currentTrack?.artist || 'None'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleFullScreen}
                    className="px-3 py-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                  >
                    {isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  </button>
                  <button
                    onClick={togglePlay}
                    className="px-4 py-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                  >
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                </div>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-200"
                  style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/50 mt-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-white/70 text-sm">Volume</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolumeLevel(Number(e.target.value))}
              className="w-full mt-2"
            />
          </div>

          <div className="mb-4">
            <label className="text-white/70 text-sm">Search</label>
            <input
              type="text"
              placeholder="Song name or artist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-white/40 transition"
            />
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-white/60 text-sm border-b border-white/10">
                  <th className="py-3 pl-2">#</th>
                  <th>Title</th>
                  <th className="text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlaylist.length > 0 ? (
                  filteredPlaylist.map((track) => (
                    <tr
                      key={track.id}
                      onClick={() => handleSelectTrack(track)}
                      className={`cursor-pointer transition-colors duration-150 ${track.id === currentTrack?.id ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-white/70'}`}
                    >
                      <td className="py-3 pl-2">{playlist.indexOf(track) + 1}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded overflow-hidden bg-gray-800">
                            <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <div className="font-medium text-white">{track.title}</div>
                            <div className="text-sm text-white/60">{track.artist}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right pr-4 text-white/60">{track.duration}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-white/50">
                      No tracks found matching "{searchQuery}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        
      </div>
    </div>
  );
}
