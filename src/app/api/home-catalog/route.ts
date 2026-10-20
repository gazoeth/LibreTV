import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getHomeCatalog } from '@/lib/film-catalog';
import { isHomeCatalogKind } from '@/lib/film-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 首页地域专题目录：按资源站公开分类与地区、年份元数据筛选。 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const kind = new URL(req.url).searchParams.get('kind') || '';
  if (!isHomeCatalogKind(kind)) return jsonError('首页专题类型不正确', 400);

  try {
    const catalog = await getHomeCatalog(kind, req.signal);
    return NextResponse.json(catalog, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '首页专题目录暂时不可用', 502);
  }
}
