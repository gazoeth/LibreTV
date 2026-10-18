import { NextResponse } from 'next/server';
import { isPasswordConfigured, requiresPassword, sessionFromCookieHeader } from './auth';

/** 仅在部署者配置了访问密码时要求登录。 */
export function guardRequest(req: Request): NextResponse | null {
  if (!requiresPassword()) return null;
  if (!isPasswordConfigured()) return NextResponse.json({ error: '管理员尚未完成访问口令配置' }, { status: 503 });
  if (!sessionFromCookieHeader(req.headers.get('cookie'))) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
