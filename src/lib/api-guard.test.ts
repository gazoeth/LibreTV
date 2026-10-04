import { afterEach, describe, expect, it } from 'vitest';
import { signSession, SESSION_COOKIE } from './auth';
import { guardRequest } from './api-guard';

const savedPassword = process.env.PASSWORD;
afterEach(() => {
  if (savedPassword === undefined) delete process.env.PASSWORD;
  else process.env.PASSWORD = savedPassword;
});

describe('guardRequest', () => {
  it('未配置访问密码时允许请求', () => {
    delete process.env.PASSWORD;
    expect(guardRequest(new Request('https://local.test/api/search'))).toBeNull();
  });

  it('配置访问密码后仍要求有效会话', () => {
    process.env.PASSWORD = 'test-password';
    expect(guardRequest(new Request('https://local.test/api/search'))?.status).toBe(401);
    const { token } = signSession();
    expect(guardRequest(new Request('https://local.test/api/search', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    }))).toBeNull();
  });
});
