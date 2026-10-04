import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from './auth';

/** 仅在部署者配置了访问密码时要求登录。 */
export function guardRequest(req: Request): NextResponse | null {
  if (!isPasswordConfigured()) return null;
  if (!sessionFromCookieHeader(req.headers.get('cookie'))) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
