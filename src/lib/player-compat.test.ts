import { describe, expect, it } from 'vitest';
import { getHlsPlaybackEngine } from './player-compat';

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
});
