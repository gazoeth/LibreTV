import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

const savedPassword = process.env.PASSWORD;
afterEach(() => {
  if (savedPassword === undefined) delete process.env.PASSWORD;
  else process.env.PASSWORD = savedPassword;
});

describe('GET /api/status authentication state', () => {
  it('no password configured means no login is required', async () => {
    delete process.env.PASSWORD;
    const response = await GET(new Request('https://local.test/api/status'));
    await expect(response.json()).resolves.toMatchObject({ passwordRequired: false, verified: true });
  });

  it('configured password still requires an authenticated session', async () => {
    process.env.PASSWORD = 'test-password';
    const response = await GET(new Request('https://local.test/api/status'));
    await expect(response.json()).resolves.toMatchObject({ passwordRequired: true, verified: false });
  });
});
