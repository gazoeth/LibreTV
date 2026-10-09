export type HlsPlaybackEngine = 'hls.js' | 'native' | 'unsupported';

export function getHlsPlaybackEngine(hlsSupported: boolean, nativeMimeSupport: string): HlsPlaybackEngine {
  if (hlsSupported) return 'hls.js';
  return nativeMimeSupport ? 'native' : 'unsupported';
}
