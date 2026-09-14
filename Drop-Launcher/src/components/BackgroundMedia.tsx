import { isVideoBackground } from '../utils/backgroundMedia';

interface BackgroundMediaProps {
  source: string;
  className?: string;
  opacity?: number;
}

export default function BackgroundMedia({
  source,
  className = '',
  opacity = 1,
}: BackgroundMediaProps) {
  const sharedClassName = `absolute inset-0 h-full w-full object-cover object-center pointer-events-none ${className}`;

  if (isVideoBackground(source)) {
    // Allow user to control whether background video audio should play.
    const playAudio = typeof window !== 'undefined' &&
      (localStorage.getItem('playBackgroundVideoAudio') === 'true');

    return (
      <video
        className={sharedClassName}
        src={source}
        style={{ opacity }}
        autoPlay
        muted={!playAudio}
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      className={sharedClassName}
      src={source}
      style={{ opacity }}
      alt=""
      aria-hidden="true"
    />
  );
}
