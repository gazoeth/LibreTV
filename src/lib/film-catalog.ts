import { BUILTIN_VOD_SOURCES } from './builtin-vod-sources';
import { cmsRequestHeaders, parseSearchList } from './cms-parser';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import type { FilmCategory, FilmCatalog, FilmType } from './film-types';
import type { SourceConfig } from './types';

export const FILM_SOURCES = BUILTIN_VOD_SOURCES.filter(s => s.enabledByDefault !== false && !s.isAdult);
const matches: Record<FilmType, RegExp> = {
  movie: /^(电影片?|4K电影|Netflix电影)$/i, short: /短剧|爽剧/, tv: /^(连续剧|电视剧)$/, variety: /^综艺片?$/,
  documentary: /纪录|记录/, anime: /^动漫片?$/, sports: /体育/,
};
const blocked = /伦理|三级|两性|写真|擦边/;
async function readJson(source: SourceConfig, params: Record<string, string>, signal?: AbortSignal) {
  const url = new URL(source.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchUpstream(url.href, { timeoutMs: 6500, signal, headers: cmsRequestHeaders() });
  if (!response.ok) throw new Error(`接口响应 ${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') throw new Error('接口未返回有效目录');
  return data as Record<string, unknown>;
}
async function categories(source: SourceConfig, signal?: AbortSignal): Promise<FilmCategory[]> {
  const cached = getCache<FilmCategory[]>(`film-class:${source.key}`);
  if (cached) return cached;
  const data = await readJson(source, { ac: 'list' }, signal);
  if (!Array.isArray(data.class)) throw new Error('该来源没有提供分类目录');
  const list = data.class.flatMap((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return [];
    const v = raw as Record<string, unknown>;
    const id = String(v.type_id ?? ''); const name = String(v.type_name ?? '');
    return /^\d+$/.test(id) && name && !blocked.test(name) ? [{ id, name, parent: String(v.type_pid ?? '') }] : [];
  });
  setCache(`film-class:${source.key}`, list, 30 * 60_000);
  return list;
}
/** 分类关系只在服务端解释；前端不会自行猜测资源站的分类编号。 */
export async function getFilmCatalog(type: FilmType, sourceKey: string | null, category: string | null, page: number, signal?: AbortSignal): Promise<FilmCatalog> {
  const started = Date.now(); const warnings: string[] = [];
  const selected = sourceKey ? FILM_SOURCES.find(s => s.key === sourceKey) : undefined;
  if (sourceKey && !selected) throw new Error('点播来源不存在');
  const candidates = selected ? [selected] : ['builtin_ruyi', 'builtin_zuid', 'builtin_ffzy'].map(k => FILM_SOURCES.find(s => s.key === k)!).filter(Boolean);
  for (const source of candidates) {
    try {
      const classes = await categories(source, signal);
      const roots = classes.filter(c => matches[type].test(c.name));
      if (!roots.length) throw new Error('该来源暂未提供此分类');
      const ids = new Set(roots.map(c => c.id));
      // 部分接口的父分类不会聚合子类，优先显示真实叶分类，避免空片库。
      const children = classes.filter(c => ids.has(c.parent));
      const options = children.length ? children : roots;
      const chosen = category ? options.find(c => c.id === category) : options[0];
      if (!chosen) throw new Error('该子分类不属于当前类型');
      const cacheKey = `film-list:${source.key}:${chosen.id}:${page}`;
      let data = getCache<Record<string, unknown>>(cacheKey);
      if (!data) { data = await readJson(source, { ac: 'detail', t: chosen.id, pg: String(page) }, signal); setCache(cacheKey, data, 90_000); }
      const list = parseSearchList(data, source).filter(item => item.vodId && item.name && !blocked.test(item.typeName || ''));
      return { source: { key: source.key, name: source.name }, sources: FILM_SOURCES.map(s => ({ key: s.key, name: s.name })), categories: options.map(c => ({ id: c.id, name: c.name })), category: chosen.id, type,
        page, pageCount: Math.max(1, Number(data.pagecount) || 1), total: Math.max(0, Number(data.total) || 0), list, ms: Date.now() - started, warnings };
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`${source.name}：${error instanceof Error ? error.message : '读取失败'}`);
    }
  }
  throw new Error(warnings.join('；') || '暂时无法读取分类目录');
}
