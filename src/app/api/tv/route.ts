import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getTvDirectory, getTvRegion } from '@/lib/tv-directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const country = new URL(req.url).searchParams.get('country');
  if (country !== null && !/^[A-Z]{2}$/.test(country)) return jsonError('地区代码格式不正确', 400);
  const data = country ? getTvRegion(country) : getTvDirectory();
  if (!data) return jsonError('没有找到该地区', 404);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
