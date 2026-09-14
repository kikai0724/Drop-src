import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  url: string;
  cover?: string;
}

interface MusicPlayerProps {
  theme: 'icespice' | 'memories' | 'tamenntai' | 'cench' | 'kikai' | 'lnd' | 'ye' | 'yeezus' | 'morechaos' | 'unity' | 'teenagedream' | 'pinktape';
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({ theme }) => {
  const { currentTheme } = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isExpanded, setIsExpanded] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useEmbedPlayer, setUseEmbedPlayer] = useState(true);
  const [savedPlaybackState, setSavedPlaybackState] = useState({ time: 0, wasPlaying: false });
  const audioRef = useRef<HTMLAudioElement>(null);
  audioError;  // read ts so launcher builds
  currentTheme;  // read ts so launcher builds
  setUseEmbedPlayer;

  // yeahhh had to do ALLLL this manually bro
  const icespicePlaylist: Track[] = [
    {
      id: '1',
      title: 'Deli',
      artist: 'Ice Spice',
      album: 'Ice Spice',
      duration: '2:10',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Deli.mp3',
      cover: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/deli.png'
    },
    {
      id: '2',
      title: 'Big Guy',
      artist: 'Ice Spice',
      album: 'Ice Spice',
      duration: '2:34',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Big%20Guy.mp3',
      cover: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/deli.png'
    },
    {
      id: '3',
      title: 'Did It First',
      artist: 'Ice Spice',
      album: 'Ice Spice',
      duration: '2:01',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Did%20It%20First.mp3',
      cover: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/deli.png'
    },
    {
      id: '4',
      title: 'In Ha Mood',
      artist: 'Ice Spice',
      album: 'Ice Spice',
      duration: '2:12',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/In%20Ha%20Mood.mp3',
      cover: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/deli.png'
    },
    {
      id: '5',
      title: 'Oh Shhh....',
      artist: 'Ice Spice',
      album: 'Ice Spice',
      duration: '2:45',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Oh%20Shhh....mp3',
      cover: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/deli.png'
    }
  ];

  const tamenntaiPlaylist: Track[] = [
    {
      id: '1',
      title: '生きる偉人たちよ',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '4:02',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/01%20%E7%94%9F%E3%81%8D%E3%82%8B%E5%81%89%E4%BA%BA%E3%81%9F%E3%81%A1%E3%82%88.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '2',
      title: '夢喰',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '3:05',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/02%20%E5%A4%A2%E5%96%B0.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '3',
      title: 'Life goes on',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '2:49',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/03%20Life%20goes%20on.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '4',
      title: '自分自信',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '4:24',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/04%20%E8%87%AA%E5%88%86%E8%87%AA%E4%BF%A1.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '5',
      title: 'もう一度 (album ver.)',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '4:27',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/05%20%E3%82%82%E3%81%86%E4%B8%80%E5%BA%A6%20(album%20ver.).mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '6',
      title: '何も考えたくないです',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '3:43',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/06%20%E4%BD%95%E3%82%82%E8%80%83%E3%81%88%E3%81%9F%E3%81%8F%E3%81%AA%E3%81%84%E3%81%A7%E3%81%99.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '7',
      title: 'ワンダーランド',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '3:19',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/07%20%E3%83%AF%E3%83%B3%E3%83%80%E3%83%BC%E3%83%A9%E3%83%B3%E3%83%89.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '8',
      title: 'マーメイド(Broken)',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '3:31',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/08%20%E3%83%9E%E3%83%BC%E3%83%A1%E3%82%A4%E3%83%89.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '9',
      title: 'Cheers',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '3:50',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/09%20Cheers.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '10',
      title: '燦々たるや',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '3:45',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/%E7%87%A6%E3%80%85%E3%81%9F%E3%82%8B%E3%82%84.wav',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '11',
      title: '運命(Broken)',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '1:33',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/11%20%E9%81%8B%E5%91%BD.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    },
    {
      id: '12',
      title: '多面態',
      artist: 'Tani yuuki',
      album: '多面態',
      duration: '3:44',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/tamenntai/12%20%E5%A4%9A%E9%9D%A2%E6%85%8B.mp3',
      cover: 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
    }
  ];

  const memoriesPlaylist: Track[] = [
    {
      id: '1',
      title: '決別の唄',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:54',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/01%20%E6%B1%BA%E5%88%A5%E3%81%AE%E5%94%84.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '2',
      title: 'W/X/Y',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:38',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/02%20W%20_%20X%20_%20Y.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '3',
      title: 'おかえり',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '3:45',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/03%20%E3%81%8A%E3%81%8B%E3%81%88%E3%82%8A.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '4',
      title: 'Myra',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:14',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/04%20Myra.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '5',
      title: '非lie心',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:19',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/05%20%E9%9D%9Elie%E5%BF%83.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '6',
      title: 'Unreachable love song',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '3:40',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/06%20Unreachable%20love%20song.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '7',
      title: 'Night Butterfly',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '3:32',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/07%20Night%20Butterfly.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '8',
      title: '油性マジック',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '3:56',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/08%20%E6%B2%B9%E6%80%A7%E3%83%9E%E3%82%B8%E3%83%83%E3%82%AF.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '9',
      title: '百鬼夜行',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:38',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/09%20%E7%99%BE%E9%AC%BC%E5%A4%9C%E8%A1%8C.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '10',
      title: '曖昧ミーマイン',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:56',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/10%20%E6%9B%96%E6%98%A7%E3%83%9F%E3%83%BC%E3%83%9E%E3%82%A4%E3%83%B3.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '11',
      title: '愛言葉',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:46',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/11%20%E6%84%9B%E8%A8%80%E8%91%89.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '12',
      title: '記憶',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '4:40',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/12%20%E8%A8%98%E6%86%B6.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '13',
      title: 'We are free',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '3:19',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/13%20We%20are%20free.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    },
    {
      id: '14',
      title: 'Life is beautiful',
      artist: 'Tani yuuki',
      album: 'Memories',
      duration: '3:19',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/Memories/14%20Life%20is%20beautiful.mp3',
      cover: 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
    }
  ];

  const cenchPlaylist: Track[] = [
    {
      id: '1',
      title: 'BAND4BAND',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '2:31',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/BAND4BAND.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '2',
      title: 'BOOGA',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '1:50',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/BOOGA.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '3',
      title: 'Iceman Freestyle',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '3:05',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/CENTRAL%20CEE%20-%20ICEMAN%20FREESTYLE%20(MUSIC%20VIDEO).wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '4',
      title: 'SLAUGHTER',
      artist: 'Central Cee feat. J Hus',
      album: 'Central Cee',
      duration: '2:42',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/CENTRAL%20CEE%20-%20SLAUGHTER%20(FEAT.%20J%20HUS)%20(MUSIC%20VIDEO).wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '5',
      title: 'TEN',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '2:02',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/CENTRAL%20CEE%20-%20TEN%20FEAT.%20SKEPTA%20(LYRICS).wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '6',
      title: 'TOP FREESTYLE',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '3:04',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/CENTRAL%20CEE%20-%20TOP%20FREESTYLE%20(LYRICS).wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '7',
      title: 'TRUTH IN THE LIES',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '2:35',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/CENTRAL%20CEE%20-%20TRUTH%20IN%20THE%20LIES%20(FEAT.%20LIL%20DURK)%20(MUSIC%20VIDEO).wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '8',
      title: 'Loading',
      artist: 'Central Cee feat. Joey Bada$$',
      album: 'Central Cee',
      duration: '2:58',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/Central%20Cee%20-%20Loading%20%5BMusic%20Video%5D%20%EF%BD%9C%20GRM%20Daily.wav.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '9',
      title: 'Straight Back To It',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '3:22',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/Central%20Cee%20-%20Straight%20Back%20To%20It%20%5BMusic%20Video%5D%2023%20Out%20Now.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '10',
      title: 'UK RAP',
      artist: 'Central Cee feat. Travis Barker',
      album: 'Central Cee',
      duration: '3:18',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/Central%20Cee%20x%20Dave%20-%20UK%20RAP%20(Lyrics).wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '11',
      title: 'Doja',
      artist: 'Central Cee & Matt Ox',
      album: 'Central Cee',
      duration: '1:45',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/Doja.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '12',
      title: 'Overseas',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '3:46',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/Overseas.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    {
      id: '13',
      title: '6 For 6',
      artist: 'Central Cee feat. PnB Rock',
      album: 'Central Cee',
      duration: '2:37',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/central%20cee/Central%20Cee%20-%206%20For%206%20%5BMusic%20Video%5D.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    },
    { 
      id: '14',
      title: 'LIMITLESS',
      artist: 'Central Cee',
      album: 'Central Cee',
      duration: '3:21',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai2/CENTRAL%20CEE%20-%20LIMITLESS%20MUSIC%20VIDEO.wav',
      cover: 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
    }
  ];

  const kikaiPlaylist: Track[] = [
    {
      id: '1',
      title: 'ベテルギウス',
      artist: '優里',
      album: 'kikai_. Playlist',
      duration: '3:57',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/%E5%84%AA%E9%87%8C/%E3%83%99%E3%83%86%E3%83%AB%E3%82%AE%E3%82%A6%E3%82%B9.WAV',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '2',
      title: 'ドライフラワー',
      artist: '優里',
      album: 'kikai_. Playlist',
      duration: '4:47',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/%E5%84%AA%E9%87%8C/%E3%83%89%E3%83%A9%E3%82%A4%E3%83%95%E3%83%A9%E3%83%AF%E3%83%BC.WAV',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '3',
      title: 'Big Dawgs',
      artist: 'idk',
      album: 'kikai_. Playlist',
      duration: '3:10',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai/Big%20Dawgs.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '4',
      title: 'Going Bad',
      artist: 'idk',
      album: 'kikai_. Playlist',
      duration: '3:00',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai/Going%20Bad.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '5',
      title: 'Let Me Know (I Wonder Why Freestyle)',
      artist: 'Juice WRLD',
      album: 'kikai_. Playlist',
      duration: '3:35',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai/Let%20Me%20Know%20(I%20Wonder%20Why%20Freestyle).wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '6',
      title: 'No Pole',
      artist: 'idk',
      album: 'kikai_. Playlist',
      duration: '3:07',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai/No%20Pole.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '7',
      title: 'RAPSTER',
      artist: 'POLO G',
      album: 'kikai_. Playlist',
      duration: '2:45',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai/RAPSTAR.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '9',
      title: 'What You Saying',
      artist: 'idk',
      album: 'kikai_. Playlist',
      duration: '2:51',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai/What%20You%20Saying.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '8',
      title: 'Rockstar',
      artist: 'Lil Shock',
      album: 'kikai_. Playlist',
      duration: '2:11',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai2/Lil%20Shock%20-%20Rockstar%20Lyrics.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '10',
      title: '愛にできることはまだあるかい(Cover)',
      artist: 'Tani yuuki',
      album: 'kikai_. Playlist',
      duration: '3:12',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai2/%E5%BC%BE%E3%81%8D%E8%AA%9E%E3%82%8A%E6%84%9B%E3%81%AB%E3%81%A6%E3%81%8D%E3%82%8B%E3%81%93%E3%81%A8%E3%81%AF%E3%81%BE%E3%81%9F%E3%81%82%E3%82%8B%E3%81%8B%E3%81%84RADWIMPS%20cover.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    },
    {
      id: '11',
      title: '香水(Cover)',
      artist: 'Tani yuuki',
      album: 'kikai_. Playlist',
      duration: '1:23',
      url: 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/kikai2/%E5%BC%BE%E3%81%8D%E8%AA%9E%E3%82%8A%E9%A6%99%E6%B0%B4%E7%91%9B%E4%BA%BAcovered%20by%20TaniYuuki.wav',
      cover: 'https://i.imgur.com/8EmC6f8.png'
    }
  ];

  const lndPlaylist: Track[] = [
    {
      id: '1',
      title: 'Anxiety (Intro)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '1:37',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2001%20Anxiety%20%28Intro%29.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '2',
      title: 'Conversations',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:24',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2002%20Conversations.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '3',
      title: 'Titanic',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:19',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2003%20Titanic.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '4',
      title: 'Bad Energy',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:30',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2004%20Bad%20Energy%29.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '5',
      title: 'Righteous',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '4:23',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2005%20Righteous.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '6',
      title: 'Blood On My Jeans',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '2:59',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2006%20Blood%20On%20My%20Jeans.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '7',
      title: 'Tell Me U Luv Me (with Trippie Redd)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:25',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2007%20Tell%20Me%20U%20Luv%20Me.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '8',
      title: 'Hate The Other Side (ft. Marshmello, Polo G & The Kid LAROI)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:05',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2008%20Hate%20the%20Other%20Side.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '9',
      title: 'Get Through It (Interlude)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '0:49',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2009%20Get%20Through%20It%20%28Interlude%29.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '10',
      title: 'Life\'s A Mess (with Hasley)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:46',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2010%20Life%27s%20a%20Mess.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '11',
      title: 'Come & Go (with Marshmello)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:47',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2011%20Come%20%26%20Go.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '12',
      title: 'I Want It',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:17',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2012%20I%20Want%20It.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '13',
      title: 'Fighting Demons',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:42',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2013%20Fighting%20Demons.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '14',
      title: 'Wishing Well',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:37',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2014%20Wishing%20Well.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '15',
      title: 'Screw Juice',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:22',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2015%20Screw%20Juice.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '16',
      title: 'Up Up And Away',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '2:51',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2016%20Up%20Up%20and%20Away.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '17',
      title: 'The Man, The Myth, The Legend (Interlude)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '2:41',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2017%20The%20Man%2C%20The%20Myth%2C%20The%20Legend.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '18',
      title: 'Stay High',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:12',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2018%20Stay%20High.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '19',
      title: 'Can\'t Die',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '3:27',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2019%20Can%27t%20Die.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '20',
      title: 'Man Of The Year',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '2:41',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2020%20Man%20of%20the%20Year.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    },
    {
      id: '21',
      title: 'Juice WRLD Speaks From Heaven (Outro)',
      artist: 'Juice WRLD',
      album: 'Legends Never Die',
      duration: '0:59',
      url: 'https://archive.org/download/juice-wrld-legends-never-die/Legends%20Never%20Die%20%282020%29/Juice%20WRLD%20LND%2021%20Juice%20WRLD%20Speaks%20from%20Heaven.mp3',
      cover: 'https://wallpaperaccess.com/full/6302625.png'
    }
  ];

  const yePlaylist: Track[] = [
    {
      id: '1',
      title: 'I Thought About Killing You',
      artist: 'Kanye West',
      album: 'ye',
      duration: '7:04',
      url: 'https://archive.org/download/ihbbpia-cd-rip/01%20I%20Thought%20About%20Killing%20You.m4a',
      cover: 'https://wallpaperaccess.com/full/4198173.jpg'
    },
    {
      id: '2',
      title: 'Yikes',
      artist: 'Kanye West',
      album: 'ye',
      duration: '3:10',
      url: 'https://archive.org/download/ihbbpia-cd-rip/02%20Yikes.m4a',
      cover: 'https://wallpaperaccess.com/full/4198173.jpg'
    },
    {
      id: '3',
      title: 'All Mine',
      artist: 'Kanye West',
      album: 'ye',
      duration: '2:25',
      url: 'https://archive.org/download/ihbbpia-cd-rip/03%20All%20Mine.m4a',
      cover: 'https://wallpaperaccess.com/full/4198173.jpg'
    },
    {
      id: '4',
      title: 'Wouldn\'t Leave',
      artist: 'Kanye West',
      album: 'ye',
      duration: '3:20',
      url: 'https://archive.org/download/ihbbpia-cd-rip/04%20Wouldn%27t%20Leave.m4a',
      cover: 'https://wallpaperaccess.com/full/4198173.jpg'
    },
    {
      id: '5',
      title: 'No Mistakes',
      artist: 'Kanye West',
      album: 'ye',
      duration: '2:03',
      url: 'https://archive.org/download/ihbbpia-cd-rip/05%20No%20Mistakes.m4a',
      cover: 'https://wallpaperaccess.com/full/4198173.jpg'
    },
    {
      id: '6',
      title: 'Ghost Town',
      artist: 'Kanye West',
      album: 'ye',
      duration: '5:39',
      url: 'https://archive.org/download/ihbbpia-cd-rip/06%20Ghost%20Town.m4a',
      cover: 'https://wallpaperaccess.com/full/4198173.jpg'
    },
    {
      id: '7',
      title: 'Violent Crimes',
      artist: 'Kanye West',
      album: 'ye',
      duration: '3:17',
      url: 'https://archive.org/download/ihbbpia-cd-rip/07%20Violent%20Crimes.m4a',
      cover: 'https://wallpaperaccess.com/full/4198173.jpg'
    }
  ];

  const yeezusPlaylist: Track[] = [
    {
      id: '1',
      title: 'On Sight',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '2:35',
      url: 'https://archive.org/download/yeezus_202406/01.%20Kanye%20West%20-%20On%20Sight.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '2',
      title: 'Black Skinhead',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '3:08',
      url: 'https://archive.org/download/yeezus_202406/02.%20Kanye%20West%20-%20Black%20Skinhead.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '3',
      title: 'I Am A God',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '3:51',
      url: 'https://archive.org/download/yeezus_202406/03.%20Kanye%20West%20-%20I%20Am%20A%20God.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '4',
      title: 'New Slaves',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '4:16',
      url: 'https://archive.org/download/yeezus_202406/04.%20Kanye%20West%20-%20New%20Slaves.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '5',
      title: 'Hold My Liquor',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '5:27',
      url: 'https://archive.org/download/yeezus_202406/05.%20Kanye%20West%20-%20Hold%20My%20Liquor.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '6',
      title: 'I\'m In It',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '3:54',
      url: 'https://archive.org/download/yeezus_202406/06.%20Kanye%20West%20-%20I%27m%20In%20It.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '7',
      title: 'Blood On The Leaves',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '6:00',
      url: 'https://archive.org/download/yeezus_202406/07.%20Kanye%20West%20-%20Blood%20On%20The%20Leaves.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '8',
      title: 'Guilt Trip',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '4:03',
      url: 'https://archive.org/download/yeezus_202406/08.%20Kanye%20West%20-%20Guilt%20Trip.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '9',
      title: 'Send It Up',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '2:58',
      url: 'https://archive.org/download/yeezus_202406/09.%20Kanye%20West%20-%20Send%20It%20Up.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    },
    {
      id: '10',
      title: 'Bound 2',
      artist: 'Kanye West',
      album: 'Yeezus',
      duration: '3:49',
      url: 'https://archive.org/download/yeezus_202406/10.%20Kanye%20West%20-%20Bound%202.mp3',
      cover: 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
    }
  ];

  const moreChaosPlaylist: Track[] = [
    {
      id: '1',
      title: 'Lord Of Chaos',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '2:48',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/01%20Lord%20Of%20Chaos.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '2',
      title: 'Xposed',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '5:39',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/02%20Xposed.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '3',
      title: 'Money Spread',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '2:36',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/03%20Money%20Spread.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '4',
      title: 'Root Of All Evil',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '3:27',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/04%20Root%20Of%20All%20Evil.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '5',
      title: 'K-Hole',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:52',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/05%20K-Hole.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '6',
      title: 'Trap Jump',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '3:31',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/06%20Trap%20Jump.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '7',
      title: 'Blakk Rokkstar',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '5:31',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/07%20Blakk%20Rokkstar.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '8',
      title: 'LiveLeak',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:37',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/08%20LiveLeak.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '9',
      title: 'Diamonds',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '5:37',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/09%20Diamonds.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '10',
      title: 'Dismantled',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '3:37',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/10%20Dismantled.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '11',
      title: '200 Kash',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '2:25',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/11%20200%20Kash.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '12',
      title: 'Down2Earth',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '2:56',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/12%20Down2Earth.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '13',
      title: 'Confetti',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:32',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/13%20Confetti.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '14',
      title: 'Naked',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:01',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/14%20Naked.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '15',
      title: 'Kryptonite',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:05',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/15%20Kryptonite.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '16',
      title: 'Psycho',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '3:13',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/16%20Psycho.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '17',
      title: 'Inferno',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '3:23',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/17%20Inferno.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '18',
      title: 'Thx',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:09',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/18%20Thx.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '19',
      title: '2000',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '3:28',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/19%202000.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '20',
      title: 'Evolution',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:46',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/20%20Evolution.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '21',
      title: 'Ghoul',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '3:51',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/21%20Ghoul.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    },
    {
      id: '22',
      title: 'Off The Meter (feat. Destroy Lonely & Playboi Carti)',
      artist: 'Ken Carson',
      album: 'More Chaos',
      duration: '4:49',
      url: 'https://archive.org/download/more-chaos-24bit-flac-tidal-rip/22%20Off%20The%20Meter%20%28feat.%20Destroy%20Lonely%20%26%20Playboi%20Carti%29.mp3',
      cover: 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
    }
  ];

  const unityPlaylist: Track[] = [
    {
      id: '1',
      title: 'Why Not???',
      artist: 'Joost',
      album: 'Unity',
      duration: '2:49',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Why%20Not___.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '2',
      title: 'Luchtballon',
      artist: 'Joost',
      album: 'Unity',
      duration: '3:33',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Luchtballon.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '3',
      title: 'Gabberland',
      artist: 'Joost',
      album: 'Unity',
      duration: '2:56',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Gabberland.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '4',
      title: '1',
      artist: 'Joost & Scooter',
      album: 'Unity',
      duration: '3:12',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%201.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '5',
      title: 'United by Music',
      artist: 'Joost & Tommy Cash',
      album: 'Unity',
      duration: '3:07',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20United%20By%20Music.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '6',
      title: 'Discozwemmen',
      artist: 'Joost & Spinvis',
      album: 'Unity',
      duration: '3:28',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Discozwemmen.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '7',
      title: 'Friesenjung',
      artist: 'Ski Aggu, Joost & Otto Waalkes',
      album: 'Unity',
      duration: '3:24',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Friesenjung.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '8',
      title: 'Kunst und Musik',
      artist: 'Joost',
      album: 'Unity',
      duration: '3:41',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Kunst%20und%20Musik.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '9',
      title: 'Filthy Dog',
      artist: 'Joost',
      album: 'Unity',
      duration: '2:38',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Filthy%20Dog.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '10',
      title: 'We\'ll Meet Again',
      artist: 'Joost & Stuntje',
      album: 'Unity',
      duration: '4:02',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20We\'ll%20Meet%20Again.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '11',
      title: 'BOOM BOOM!!!!!',
      artist: 'Joost',
      album: 'Unity',
      duration: '2:45',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20BOOM%20BOOM!!!!!.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '12',
      title: 'Internetcafe 24/7',
      artist: 'Joost',
      album: 'Unity',
      duration: '3:15',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Internetcafe%2024_7.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '13',
      title: 'Epiphany of Love: The Origin',
      artist: 'Joost, jungle bobby & Aldo2Swag',
      album: 'Unity',
      duration: '4:15',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Epiphany%20of%20Love_%20The%20Origin.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '14',
      title: 'Europapa',
      artist: 'Joost',
      album: 'Unity',
      duration: '3:06',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Europapa.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '15',
      title: 'Europapa - Outro',
      artist: 'Joost',
      album: 'Unity',
      duration: '1:52',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Europapa%20-%20Outro.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    },
    {
      id: '16',
      title: 'Last Man Standing',
      artist: 'Joost',
      album: 'Unity',
      duration: '3:18',
      url: 'https://public-service-live.ol.privateuser.xyz/%5BSPOTDOWNLOADER.COM%5D%20Last%20Man%20Standing.mp3',
      cover: 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
    }
  ];

  const teenageDreamPlaylist: Track[] = [
    {
      id: '1',
      title: 'Teenage Dream',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '3:48',
      url: 'https://musify.club/track/dl/1083145/katy-perry-teenage-dream.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '2',
      title: 'Last Friday Night (T.G.I.F.)',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '3:50',
      url: 'https://musify.club/track/dl/1083146/katy-perry-last-friday-night-t-g-i-f.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '3',
      title: 'California Gurls (feat. Snoop Dogg)',
      artist: 'Katy Perry feat. Snoop Dogg',
      album: 'Teenage Dream',
      duration: '3:56',
      url: 'https://musify.club/track/dl/1083147/katy-perry-california-gurls-feat-snoop-dogg.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '4',
      title: 'Firework',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '3:48',
      url: 'https://archive.org/download/katy-perry-firework-/y2mate.com%20-%20Katy%20Perry%20-%20Firework%20%28Official%20Music%20Video%29_v144P.mp4',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '5',
      title: 'Peacock',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '3:52',
      url: 'https://musify.club/track/dl/1083149/katy-perry-peacock.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '6',
      title: 'Circle the Drain',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '4:32',
      url: 'https://musify.club/track/dl/1083150/katy-perry-circle-the-drain.mp3?token=tmj1czsaibc',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '7',
      title: 'The One That Got Away',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '3:47',
      url: 'https://jams.pics/download?data=TTZPYXl0NVdJTGlEVTQrK3hnakFEMFlnMWZ5QkZmQy9vZHNFb3FMSmhkcFhTVzZ6SDlWTTU0S2xPZTF0Yk5FeENZYjBIYkJ3STMrcDBzblFDRGR2MUp1UkpVa0gyTHl5amlRbEZCL3VmMGR3cm0waDE2cGFlREpOallraWw2MXlCWjJvY2hXcjk0T3hEWEVGcUlBTUhTQU80UkEyRDVSTU9iZFZHbUpmOVZMZ1VkaERzcXl4T1NMRjlSSm4xRFRTZEYwWmNyQmZiNFdpUWVacHVBZzV1VkwxMkl3Q3VBb2hpRDFQL3l1T001UG1WYnpSVFJERGNYS1l2WCt1MktuVXM1bTc4bG96YUsvM3FwbGFJd0ZFNEpiaXVBb1ZSZGxRRE5raUJtVzFUMjNUcGg5eGQ1VzVhOWFCYmQveUQ0bjhZMW90WHp1cnY5dVlIbXU5NzFnYnVVcjZxTCtYMkRLTm1PSE4zVFpud0NBZUdMQlVHNlRqYnN5TTZTcS8zenR0d2ZvUVYzazlscnJOVkh6WlJuckIxUFVnVXdUSGhwVk0rcWRFdDRxckE5ZXo5Y1c3RVAyelQ2SVBBSkE1Kzk1T3pRY0NkMTYxVEg0ZWo5Z1hvSkZnaHRyY3hwSk9waHFqYzVRQnFRTlUwREpLOW1UNG5DMHZ3MFE4c2hOYU56OC8',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '8',
      title: 'E.T. (feat. Kanye West)',
      artist: 'Katy Perry feat. Kanye West',
      album: 'Teenage Dream',
      duration: '3:51',
      url: 'https://www.soundboard.com/track/download/986913',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '9',
      title: 'Who Am I Living For?',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '4:08',
      url: 'https://musify.club/track/dl/1083153/katy-perry-who-am-i-living-for.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '10',
      title: 'Pearl',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '4:07',
      url: 'https://musify.club/track/dl/1083154/katy-perry-pearl.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '11',
      title: 'Hummingbird Heartbeat',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '3:32',
      url: 'https://musify.club/track/dl/1083155/katy-perry-hummingbird-heartbeat.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    },
    {
      id: '12',
      title: 'Not Like the Movies',
      artist: 'Katy Perry',
      album: 'Teenage Dream',
      duration: '4:01',
      url: 'https://musify.club/track/dl/1083156/katy-perry-not-like-the-movies.mp3',
      cover: 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
    }
  ];

  const pinkTapePlaylist: Track[] = [
    {
      id: '1',
      title: 'Flooded The Face',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:18',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/01-Flooded%20The%20Face.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '2',
      title: 'Suicide Doors',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '4:21',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/02-Suicide%20Doors.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '3',
      title: 'Aye (Ft. Travis Scott)',
      artist: 'Lil Uzi Vert feat. Travis Scott',
      album: 'Pink Tape',
      duration: '3:31',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/03-Aye%20%28Ft.%20Travis%20Scott%29.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '4',
      title: 'Crush Em',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '2:51',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/04-Crush%20Em.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '5',
      title: 'Amped',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '2:58',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/05-Amped.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '6',
      title: 'x2',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:59',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/06-x2.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '7',
      title: 'Died and Came Back',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:06',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/07-Died%20and%20Came%20Back.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '8',
      title: 'Spin Again',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '1:48',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/08-Spin%20Again.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '9',
      title: 'That Fiya',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '2:41',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/09-That%20Fiya.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '10',
      title: 'I Gotta',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '2:58',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/10-I%20Gotta.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '11',
      title: 'Endless Fashion (Ft. Nicki Minaj)',
      artist: 'Lil Uzi Vert feat. Nicki Minaj',
      album: 'Pink Tape',
      duration: '3:41',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/11-Endless%20Fashion%20%28Ft.%20Nicki%20Minaj%29.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '12',
      title: 'Mama, I\'m Sorry',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:36',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/12-Mama%2C%20I%E2%80%99m%20Sorry.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '13',
      title: 'All Alone',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:46',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/13-All%20Alone.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '14',
      title: 'Nakamura',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:23',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/14-Nakamura.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '15',
      title: 'Just Wanna Rock',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '2:11',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/15-Just%20Wanna%20Rock.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '16',
      title: 'Fire Alarm',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:11',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/16-Fire%20Alarm.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '17',
      title: 'CS',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:36',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/17-CS.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '18',
      title: 'Werewolf (Ft. Bring Me The Horizon)',
      artist: 'Lil Uzi Vert feat. Bring Me The Horizon',
      album: 'Pink Tape',
      duration: '4:04',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/18-Werewolf%20%28Ft.%20Bring%20Me%20The%20Horizon%29.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '19',
      title: 'Pluto to Mars',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '4:09',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/19-Pluto%20to%20Mars.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '20',
      title: 'Patience (Ft. Don Toliver)',
      artist: 'Lil Uzi Vert feat. Don Toliver',
      album: 'Pink Tape',
      duration: '4:24',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/20-Patience%20%28Ft.%20Don%20Toliver%29.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '21',
      title: 'Days Come and Go',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '4:21',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/21-Days%20Come%20and%20Go.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '22',
      title: 'Rehab',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '4:09',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/22-Rehab.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '23',
      title: 'The End (Ft. BABYMETAL)',
      artist: 'Lil Uzi Vert feat. BABYMETAL',
      album: 'Pink Tape',
      duration: '3:13',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/23-The%20End%20%28Ft.%20BABYMETAL%29.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '24',
      title: 'Zoom',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '2:53',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/24-Zoom.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '25',
      title: 'Of Course',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:33',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/25-Of%20Course.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    },
    {
      id: '26',
      title: 'Shardai',
      artist: 'Lil Uzi Vert',
      album: 'Pink Tape',
      duration: '3:26',
      url: 'https://archive.org/download/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/26-Shardai.mp3',
      cover: 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
    }
  ];

  useEffect(() => {
    const handlePlayTrackEvent = (e: Event) => {
      try {
        // event detail should be { track: Track }
        // @ts-ignore
        const detail = (e as CustomEvent).detail;
        if (detail && detail.track) {
          setCurrentTrack(detail.track);
          setIsPlaying(true);
          // attempt to play
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }, 50);
        }
      } catch (err) {
        console.error('failed to handle play track event', err);
      }
    };

    window.addEventListener('music-play-track', handlePlayTrackEvent as EventListener);
    return () => {
      window.removeEventListener('music-play-track', handlePlayTrackEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    let tracks;
    if (theme === 'icespice') {
      tracks = icespicePlaylist;
    } else if (theme === 'tamenntai') {
      tracks = tamenntaiPlaylist;
    } else if (theme === 'cench') {
      tracks = cenchPlaylist;
    } else if (theme === 'kikai') {
      tracks = kikaiPlaylist;
    } else if (theme === 'lnd') {
      tracks = lndPlaylist;
    } else if (theme === 'ye') {
      tracks = yePlaylist;
    } else if (theme === 'yeezus') {
      tracks = yeezusPlaylist;
    } else if (theme === 'morechaos') {
      tracks = moreChaosPlaylist;
    } else if (theme === 'unity') {
      tracks = unityPlaylist;
    } else if (theme === 'teenagedream') {
      tracks = teenageDreamPlaylist;
    } else if (theme === 'pinktape') {
      tracks = pinkTapePlaylist;
    } else {
      tracks = memoriesPlaylist;
    }

    setPlaylist(tracks);
    if (tracks.length > 0) {
      setCurrentTrack(tracks[0]);
      setTimeout(async () => {
        const audio = audioRef.current;
        if (audio) {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch (error) {
            console.log('Auto-play blocked by browser, user interaction required');
          }
        }
      }, 500);
    }
  }, [theme]);

  useEffect(() => {
    if (savedPlaybackState.wasPlaying && currentTrack && savedPlaybackState.time > 0) {
      const audio = audioRef.current;
      if (audio) {
        const restorePlayback = async () => {
          try {
            audio.currentTime = savedPlaybackState.time;
            if (savedPlaybackState.wasPlaying) {
              await audio.play();
              setIsPlaying(true);
            }
            setSavedPlaybackState({ time: 0, wasPlaying: false }); 
          } catch (error) {
            console.error('Failed to restore playback:', error);
          }
        };
        setTimeout(restorePlayback, 100);
      }
    }
  }, [useEmbedPlayer, currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const saveProgress = () => {
      if (isPlaying && audio.currentTime > 0) {
        setSavedPlaybackState(prev => ({
          ...prev,
          time: audio.currentTime
        }));
      }
    };

    const interval = setInterval(saveProgress, 1000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    const handleError = () => {
      setAudioError('Failed to load audio. Please retry later.');
      setIsLoading(false);
      setIsPlaying(false);
    };
    const handleLoadStart = () => {
      setIsLoading(true);
      setAudioError(null);
    };
    const handleCanPlay = () => {
      setIsLoading(false);
      setAudioError(null);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleNext);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleNext);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [currentTrack]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        setIsLoading(true);
        setAudioError(null);
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Playback failed:', error);
      setAudioError('Failed to play track. Check your internet connection.');
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  const handleNext = async () => {
    const currentIndex = playlist.findIndex(track => track.id === currentTrack?.id);
    const nextIndex = (currentIndex + 1) % playlist.length;
    const wasPlaying = isPlaying;

    setCurrentTrack(playlist[nextIndex]);

    if (wasPlaying) {
      setTimeout(async () => {
        const audio = audioRef.current;
        if (audio) {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch (error) {
            console.error('Auto-play failed:', error);
          }
        }
      }, 100);
    }
  };

  const handlePrevious = async () => {
    const currentIndex = playlist.findIndex(track => track.id === currentTrack?.id);
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    const wasPlaying = isPlaying;

    setCurrentTrack(playlist[prevIndex]);
    if (wasPlaying) {
      setTimeout(async () => {
        const audio = audioRef.current;
        if (audio) {
          try {
            await audio.play();
            setIsPlaying(true);
          } catch (error) {
            console.error('Auto-play failed:', error);
          }
        }
      }, 100);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) return null;

  const themeColors = theme === 'icespice'
    ? { primary: '#404040', secondary: '#2D2D2D', accent: '#1A1A1A' }
    : theme === 'cench'
    ? { primary: '#8B5CF6', secondary: '#EC4899', accent: '#F59E0B' }
    : theme === 'kikai'
    ? { primary: '#2563EB', secondary: '#F59E0B', accent: '#10B981' }
    : theme === 'lnd'
    ? { primary: '#8B5CF6', secondary: '#EC4899', accent: '#F59E0B' }
    : theme === 'ye'
    ? { primary: '#22C55E', secondary: '#16A34A', accent: '#15803D' }
    : theme === 'yeezus'
    ? { primary: '#DC2626', secondary: '#B91C1C', accent: '#991B1B' }
    : theme === 'morechaos'
    ? { primary: '#8B5CF6', secondary: '#EC4899', accent: '#1F1F1F' }
    : theme === 'unity'
    ? { primary: '#F59E0B', secondary: '#D97706', accent: '#B45309' }
    : theme === 'teenagedream'
    ? { primary: '#FF69B4', secondary: '#FF1493', accent: '#DA70D6' }
    : theme === 'pinktape'
    ? { primary: '#FF1493', secondary: '#FF69B4', accent: '#C71585' }
    : { primary: '#3A3A3A', secondary: '#5A5A5A', accent: '#7A7A7A' };



  return (
    <>
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onEnded={handleNext}
        onLoadStart={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
        onError={() => setAudioError('Failed to load track')}
        style={{ display: 'none' }}
      />
      {!isExpanded && (
        <div
          className="fixed bottom-6 right-16 w-24 h-24 cursor-pointer transition-all duration-300 hover:scale-110 z-50 group"
          onClick={() => setIsExpanded(true)}
        >
          <div className="relative w-full h-full">
            <div
              className={`absolute inset-0 rounded-full shadow-2xl overflow-hidden ${isPlaying ? 'animate-spin' : ''}`}
              style={{
                animationDuration: '3s',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                backgroundImage: currentTrack?.cover ? `url(${currentTrack.cover})` : 'linear-gradient(135deg, #374151, #1f2937)',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              <div className="absolute inset-0 rounded-full">
                <div className="absolute inset-2 rounded-full border border-black/20"></div>
                <div className="absolute inset-4 rounded-full border border-black/15"></div>
                <div className="absolute inset-6 rounded-full border border-black/10"></div>
                <div className="absolute inset-8 rounded-full border border-black/10"></div>
              </div>
              <div className="absolute inset-0 rounded-full bg-black/20"></div>
              <div className="absolute inset-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black border border-gray-600 shadow-inner"></div>
            </div>
          </div>
          {isPlaying && (
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{
                background: `radial-gradient(circle, ${themeColors.primary}40 0%, transparent 70%)`,
                filter: 'blur(8px)'
              }}
            ></div>
          )}

          <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black/90 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap max-w-48 backdrop-blur-sm">
            {currentTrack
              ? `♪ ${currentTrack.title} - ${currentTrack.artist}`
              : `${theme === 'icespice' ? 'Ice Spice' : theme === 'tamenntai' ? '多面態' : theme === 'cench' ? 'Central Cee' : theme === 'kikai' ? 'kikai' : theme === 'lnd' ? 'Legends Never Die' : theme === 'ye' ? 'ye' : theme === 'yeezus' ? 'Yeezus' : theme === 'morechaos' ? 'More Chaos' : theme === 'unity' ? 'Unity' : theme === 'teenagedream' ? 'Teenage Dream' : theme === 'pinktape' ? 'Pink Tape' : '17'} Album Player`
            }
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black/90"></div>
          </div>
        </div>
      )}

      {isExpanded && (
        <div
          className="fixed bottom-6 right-6 w-[600px] h-28 backdrop-blur-xl border border-white/10 rounded-2xl p-5 z-50 transition-all duration-300"
          style={{
            background: `linear-gradient(135deg, rgba(0,0,0,0.4), rgba(255,255,255,0.1))`,
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
          }}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center space-x-4 mb-2">
              <div className="w-14 h-14 rounded-lg overflow-hidden shadow-lg flex-shrink-0">
                <img
                  src={currentTrack?.cover
                    ? currentTrack.cover
                    : theme === 'icespice'
                    ? 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev/deli.png'
                    : theme === 'tamenntai'
                    ? 'https://www.thefirsttimes.jp/admin/wp-content/uploads/5000/02/20230221-st-214403.jpg'
                    : theme === 'ye'
                    ? 'https://wallpaperaccess.com/full/4198173.jpg'
                    : theme === 'yeezus'
                    ? 'https://image-cdn.hypb.st/https://hypebeast.com/wp-content/blogs.dir/4/files/2013/06/kanye-west-yeezus-official-album-artwork-0.jpg'
                    : theme === 'cench'
                    ? 'https://www.wecb.fm/wp-content/uploads/2024/11/Central-Cee-has-announced-Can39t-Rush-Greatness-his-first-album.jpg'
                    : theme === 'kikai'
                    ? 'https://i.imgur.com/oASthee.png'
                    : theme === 'lnd'
                    ? 'https://wallpaperaccess.com/full/6302625.png'
                    : theme === 'morechaos'
                    ? 'https://ia601900.us.archive.org/22/items/more-chaos-24bit-flac-tidal-rip/MORECHAOS.jpg'
                    : theme === 'unity'
                    ? 'https://e.snmc.io/i/600/s/d9735beaa64151e991082b17402a956e/13062960/joost-unity-Cover-Art.jpg'
                    : theme === 'teenagedream'
                    ? 'https://m.media-amazon.com/images/I/51jwXqA+w1L._UF1000,1000_QL80_.jpg'
                    : theme === 'pinktape'
                    ? 'https://ia904607.us.archive.org/15/items/lil-uzi-vert-pink-tape-2023-album/Pink%20Tape/a.jpg'
                    : 'https://images.genius.com/84ab5cb76648c8efd335df3b0b98d9ec.1000x1000x1.png'
                  }
                  alt="Album Cover"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-base font-semibold truncate mb-1">
                  {currentTrack ? currentTrack.title : 'No track playing'}
                </div>
                <div className="text-white/70 text-sm truncate">
                  {currentTrack
                    ? currentTrack.artist
                    : `${theme === 'icespice' ? 'Kanye West' : theme === 'tamenntai' || theme === 'kikai' || theme === 'lnd' ? 'Juice WRLD' : 'Tani yuuki'}`
                  }
                </div>
              </div>
              <div className="flex items-center space-x-2 mr-4">
                <button
                  onClick={handlePrevious}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                  </svg>
                </button>

                <button
                  onClick={togglePlay}
                  disabled={isLoading}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 hover:scale-105 shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${themeColors.primary}, ${themeColors.secondary})` }}
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : isPlaying ? (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                <button
                  onClick={handleNext}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                  </svg>
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
                <div className="w-20 h-1.5 bg-white/10 rounded-full relative">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${volume * 100}%`,
                      background: `linear-gradient(90deg, ${themeColors.primary}, ${themeColors.secondary})`
                    }}
                  ></div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <span className="text-xs text-white/60 w-8 text-right">{Math.round(volume * 100)}%</span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center">
              <div className="flex-1">
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${(currentTime / duration) * 100}%`,
                      background: `linear-gradient(90deg, ${themeColors.primary}, ${themeColors.secondary})`
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-white/60 mt-0.5">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MusicPlayer;

