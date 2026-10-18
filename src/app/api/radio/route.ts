import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getRadioDirectory, radioRegions } from '@/lib/radio-directory';
export const runtime = 'nodejs';
export function GET(req: Request) {
 const guarded = guardRequest(req); if (guarded) return guarded;
 const country = new URL(req.url).searchParams.get('country');
 if (country !== null && !/^[A-Z]{2}$/.test(country)) return jsonError('地区代码格式不正确', 400);
 if (country && !radioRegions.some(r => r.code === country)) return jsonError('没有找到该地区', 404);
 return NextResponse.json(getRadioDirectory(country || undefined), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
