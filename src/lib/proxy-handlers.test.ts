import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithSafeRedirects } = vi.hoisted(() => ({ fetchWithSafeRedirects: vi.fn() }));

vi.mock('./fetch-utils', () => ({ fetchWithSafeRedirects }));
vi.mock('./ssrf', () => ({
  checkLiveUrlAllowed: vi.fn(),
  isBlockedByDNS: vi.fn(async () => false),
  isValidProxyUrl: vi.fn(() => true),
}));

import { handleProxyRequest } from './proxy-handlers';

describe('handleProxyRequest image referer', () => {
  beforeEach(() => {
    fetchWithSafeRedirects.mockReset();
    fetchWithSafeRedirects.mockImplementation(async (url: string) => ({
      res: new Response('image', { headers: { 'content-type': 'image/jpeg' } }),
      finalUrl: url,
    }));
  });

  it('uses the image host origin as referer for provider posters', async () => {
    const target = 'https://img.example.test/poster.jpg';
    await handleProxyRequest(new Request('https://site.test/api/proxy', {
      headers: { accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    }), target);

    expect(fetchWithSafeRedirects.mock.calls[0][1].headers.Referer).toBe('https://img.example.test/');
  });

  it('keeps the required Douban referer', async () => {
    const target = 'https://img3.doubanio.com/poster.jpg';
    await handleProxyRequest(new Request('https://site.test/api/proxy', {
      headers: { accept: 'image/*' },
    }), target);

    expect(fetchWithSafeRedirects.mock.calls[0][1].headers.Referer).toBe('https://movie.douban.com/');
  });
});
