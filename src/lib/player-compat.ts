export type HlsPlaybackEngine = 'hls.js' | 'native' | 'unsupported';

export function getHlsPlaybackEngine(hlsSupported: boolean, nativeMimeSupport: string, preferNative = false): HlsPlaybackEngine {
  if (preferNative && nativeMimeSupport) return 'native';
  if (hlsSupported) return 'hls.js';
  return nativeMimeSupport ? 'native' : 'unsupported';
}

/** iPadOS 桌面标识仍由触控点数识别，其他设备保留原有引擎选择。 */
export function prefersNativeHls(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}
