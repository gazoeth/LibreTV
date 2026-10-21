import { describe, expect, it } from 'vitest';
import { getHlsPlaybackEngine, prefersNativeHls } from './player-compat';

describe('getHlsPlaybackEngine', () => {
  it('uses hls.js when MediaSource is available', () => {
    expect(getHlsPlaybackEngine(true, '')).toBe('hls.js');
  });

  it('falls back to the browser native HLS engine', () => {
    expect(getHlsPlaybackEngine(false, 'maybe')).toBe('native');
  });

  it('rejects browsers without either HLS engine', () => {
    expect(getHlsPlaybackEngine(false, '')).toBe('unsupported');
  });

  it('prefers native HLS on Apple mobile devices even with MSE available', () => {
    expect(getHlsPlaybackEngine(true, 'maybe', true)).toBe('native');
    expect(getHlsPlaybackEngine(true, '', true)).toBe('hls.js');
    expect(prefersNativeHls('Mozilla/5.0 (iPad; CPU OS 12_5_8 like Mac OS X)')).toBe(true);
    expect(prefersNativeHls('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5)).toBe(true);
    expect(prefersNativeHls('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0)).toBe(false);
  });
});
