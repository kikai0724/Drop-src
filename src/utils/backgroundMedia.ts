const VIDEO_EXTENSIONS = /\.(mp4|webm|og[gv]|mov|m4v)(?:$|[?#])/i;

export const isVideoBackground = (source: string | null | undefined): boolean => {
  if (!source) return false;
  return source.startsWith('data:video/')
    || source.startsWith('blob:')
    || VIDEO_EXTENSIONS.test(source);
};
