import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { FILM_SOURCES, getFilmCatalog } from '@/lib/film-catalog';
import { isFilmType } from '@/lib/film-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const guarded = guardRequest(req); if (guarded) return guarded;
  const params = new URL(req.url).searchParams;
  const type = params.get('type') || 'movie';
  const source = params.get('source'); const category = params.get('category');
  const pageRaw = params.get('page') || '1'; const page = Number(pageRaw);
  if (!isFilmType(type) || !/^\d+$/.test(pageRaw) || !Number.isSafeInteger(page) || page < 1 || page > 10000) return jsonError('分类或页码不正确', 400);
  if (source && !FILM_SOURCES.some(s => s.key === source)) return jsonError('点播来源不存在', 400);
  if (category && !/^\d{1,10}$/.test(category)) return jsonError('子分类格式不正确', 400);
  try { return NextResponse.json(await getFilmCatalog(type, source, category, page, req.signal), { headers: { 'Cache-Control': 'private, max-age=60' } }); }
  catch (error) { return jsonError(error instanceof Error ? error.message : '分类目录暂时不可用', 502); }
}
