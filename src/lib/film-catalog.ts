import { BUILTIN_VOD_SOURCES } from './builtin-vod-sources';
import { cmsRequestHeaders, parseSearchList } from './cms-parser';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import { FILM_TYPES, type FilmCategory, type FilmCatalog, type FilmType, type HomeCatalog, type HomeCatalogKind } from './film-types';
import type { SearchResultItem, SourceConfig } from './types';

export const FILM_SOURCES = BUILTIN_VOD_SOURCES.filter(s => s.enabledByDefault !== false && !s.isAdult);
const matches: Record<FilmType, RegExp> = {
  movie: /^(电影片?|4K电影|Netflix电影)$/i, short: /短剧|爽剧/, tv: /^(连续剧|电视剧)$/, variety: /^综艺片?$/,
  documentary: /纪录|记录/, anime: /^动漫片?$/, sports: /体育/,
};
const blocked = /伦理|三级|两性|写真|擦边/;
const WESTERN_AREAS = /美国|加拿大|英国|爱尔兰|法国|德国|意大利|西班牙|葡萄牙|瑞典|挪威|丹麦|芬兰|荷兰|比利时|瑞士|奥地利|澳大利亚|澳洲|新西兰|波兰|捷克|希腊|冰岛|卢森堡|united states|\busa\b|\buk\b|united kingdom|canada|france|germany|italy|spain|portugal|sweden|norway|denmark|finland|netherlands|belgium|switzerland|austria|australia|new zealand/i;

function getCategoryTree(classes: FilmCategory[], type: FilmType) {
  const roots = classes.filter(c => matches[type].test(c.name));
  const rootIds = new Set(roots.map(c => c.id));
  const children = classes.filter(c => rootIds.has(c.parent));
  const options = [...roots, ...children.filter(c => !rootIds.has(c.id))];
  return { roots, children, options, rootIds };
}
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
      const { roots, children, options, rootIds: ids } = getCategoryTree(classes, type);
      if (!roots.length) throw new Error('该来源暂未提供此分类');
      // 分类范围由此处统一解释，默认先读取父分类，显式子分类选择始终保留。
      let chosen = category ? options.find(c => c.id === category) : roots[0];
      if (!chosen) throw new Error('该子分类不属于当前类型');
      async function readCategory(id: string, requestedPage = page) {
        const cacheKey = `film-list:${source.key}:${id}:${requestedPage}`;
        let result = getCache<Record<string, unknown>>(cacheKey);
        if (!result) { result = await readJson(source, { ac: 'detail', t: id, pg: String(requestedPage) }, signal); setCache(cacheKey, result, 90_000); }
        return result;
      }
      let data = await readCategory(chosen.id);
      let list = parseSearchList(data, source).filter(item => item.vodId && item.name && !blocked.test(item.typeName || ''));
      // 用父分类首页判断是否支持聚合，避免将后续页为空误判，也确保翻页范围一致。
      const rootFirstPage = !category && page > 1 && children.length ? await readCategory(roots[0].id, 1) : null;
      const rootIsEmpty = rootFirstPage ? !parseSearchList(rootFirstPage, source).some(item => item.vodId && item.name && !blocked.test(item.typeName || '')) : !list.length;
      if (!category && rootIsEmpty && children.length) {
        chosen = children[0];
        data = await readCategory(chosen.id);
        list = parseSearchList(data, source).filter(item => item.vodId && item.name && !blocked.test(item.typeName || ''));
        warnings.push(`${source.name}：全部${FILM_TYPES.find(item => item.key === type)?.name || '分类'}未返回内容，当前仅显示「${chosen.name}」，不代表完整分类。`);
      }
      return { source: { key: source.key, name: source.name }, sources: FILM_SOURCES.map(s => ({ key: s.key, name: s.name })), categories: options.map(c => ({ id: c.id, name: ids.has(c.id) && children.length ? `全部${c.name}` : c.name })), category: chosen.id, type,
        page, pageCount: Math.max(1, Number(data.pagecount) || 1), total: Math.max(0, Number(data.total) || 0), list, ms: Date.now() - started, warnings };
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`${source.name}：${error instanceof Error ? error.message : '读取失败'}`);
    }
  }
  throw new Error(warnings.join('；') || '暂时无法读取分类目录');
}

function validYear(item: { year?: string }): number {
  const value = item.year?.trim() || '';
  return /^\d{4}$/.test(value) ? Number(value) : 0;
}

function belongsToWesternMovie(item: { area?: string }): boolean {
  return WESTERN_AREAS.test(item.area?.trim() || '');
}

function eastAsianRegion(item: { area?: string }): 'japan' | 'korea' | undefined {
  const area = item.area || '';
  if (/日本|japan/i.test(area)) return 'japan';
  if (/韩国|korea/i.test(area)) return 'korea';
  return undefined;
}

function byNewestYear(items: SearchResultItem[]): SearchResultItem[] {
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => validYear(b.item) - validYear(a.item) || a.index - b.index)
    .map(entry => entry.item);
}

function interleave(items: SearchResultItem[][], limit = 12): SearchResultItem[] {
  const result: SearchResultItem[] = [];
  const ordered = items.map(byNewestYear);
  for (let index = 0; result.length < limit && ordered.some(group => index < group.length); index++) {
    for (const group of ordered) {
      if (group[index] && result.length < limit) result.push(group[index]);
    }
  }
  return result;
}

async function readHomeCategories(
  targets: { sourceKey: string; type: FilmType; selected: FilmCategory[]; pages: number[] }[],
  signal?: AbortSignal
) {
  const results = await Promise.allSettled(targets.flatMap(target => target.selected.flatMap(category => target.pages.map(page => getFilmCatalog(target.type, target.sourceKey, category.id, page, signal)))));
  return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
}

/** 首页专题目录：在服务端按资源站的分类和地区元数据筛选，限制来源数与分页数。 */
export async function getHomeCatalog(kind: HomeCatalogKind, signal?: AbortSignal): Promise<HomeCatalog> {
  const cacheKey = `home-catalog:${kind}`;
  const cached = getCache<HomeCatalog>(cacheKey);
  if (cached) return cached;

  const started = Date.now();
  const warnings: string[] = [];
  const sourceKey = kind === 'western-movies' || kind === 'variety-2026-jpkr' ? 'builtin_dyttzy' : 'builtin_jisu';
  let type: FilmType = 'movie';
  let classes: FilmCategory[];
  let selected: FilmCategory[] = [];
  let pages = [1];
  const additionalTargets: { sourceKey: string; type: FilmType; selected: FilmCategory[]; pages: number[] }[] = [];

  const source = FILM_SOURCES.find(item => item.key === sourceKey);
  if (!source) throw new Error('首页专题来源未配置');
  try {
    classes = await categories(source, signal);
  } catch (error) {
    throw new Error(`${source.name}：${error instanceof Error ? error.message : '读取分类失败'}`);
  }

  if (kind === 'western-movies') {
    type = 'movie';
    const { children } = getCategoryTree(classes, type);
    const genres = [/动作/, /喜剧/, /爱情/, /科幻/, /恐怖/, /剧情/];
    selected = genres.flatMap(genre => {
      const category = children.find(item => genre.test(item.name));
      return category ? [category] : [];
    });
    if (!selected.length) throw new Error(`${source.name}：没有可筛选的电影分类`);
  } else if (kind === 'variety-2026-jpkr') {
    type = 'variety';
    const { children } = getCategoryTree(classes, type);
    selected = children.filter(item => /日韩综艺|日韩综艺片/.test(item.name));
    pages = [1, 2, 3];
    if (!selected.length) throw new Error(`${source.name}：没有日韩综艺分类`);
    const alternateSource = FILM_SOURCES.find(item => item.key === 'builtin_ikun');
    if (alternateSource) {
      try {
        const alternateClasses = await categories(alternateSource, signal);
        const alternateCategories = getCategoryTree(alternateClasses, type).children.filter(item => /日韩综艺|日韩综艺片/.test(item.name));
        if (alternateCategories.length) additionalTargets.push({ sourceKey: alternateSource.key, type, selected: alternateCategories, pages });
      } catch {
        warnings.push(`${alternateSource.name}：暂时无法读取分类，已继续使用其他来源。`);
      }
    }
  } else {
    const regionSource = FILM_SOURCES.find(item => item.key === sourceKey);
    if (!regionSource) throw new Error('分类来源未配置');
    try {
      classes = await categories(regionSource, signal);
    } catch (error) {
      throw new Error(`${regionSource.name}：${error instanceof Error ? error.message : '读取分类失败'}`);
    }
    if (kind === 'western-series') {
      type = 'tv';
      const { children } = getCategoryTree(classes, type);
      selected = children.filter(item => /欧美剧|欧美连续剧/.test(item.name));
    } else if (kind === 'east-asian-series') {
      type = 'tv';
      const { children } = getCategoryTree(classes, type);
      selected = children.filter(item => /^(韩剧|韩国剧|日剧|日本剧)$/.test(item.name));
    } else if (kind === 'japanese-anime') {
      type = 'anime';
      const { children } = getCategoryTree(classes, type);
      selected = children.filter(item => /^日本动漫$/.test(item.name));
    } else {
      type = 'anime';
      const { children } = getCategoryTree(classes, type);
      selected = children.filter(item => /^(国产动漫|中国动漫|大陆动漫)$/.test(item.name));
    }
    if (!selected.length) throw new Error(`${regionSource.name}：没有符合条件的分类`);
  }

  const targets = [{ sourceKey, type, selected, pages }, ...additionalTargets];
  const catalogs = await readHomeCategories(targets, signal);
  if (signal?.aborted) throw signal.reason || new Error('请求已取消');
  if (!catalogs.length) throw new Error('专题来源暂时无法读取');
  const requestedCount = targets.reduce((count, target) => count + target.selected.length * target.pages.length, 0);
  if (catalogs.length < requestedCount) warnings.push(`${requestedCount - catalogs.length} 个分类页暂时不可用，已保留其余结果。`);

  const seen = new Set<string>();
  const accepts = (item: SearchResultItem) => {
    if (!item.vodId || !item.name || blocked.test(item.typeName || '')) return false;
    const identity = kind === 'variety-2026-jpkr'
      ? `${item.name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()}:${item.year || 'unknown'}`
      : `${item.sourceKey}:${item.vodId}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    if (kind === 'western-movies') return belongsToWesternMovie(item);
    if (kind === 'western-series') return WESTERN_AREAS.test(item.area || '') || /欧美剧/.test(item.typeName || '');
    if (kind === 'east-asian-series') return !!eastAsianRegion(item);
    if (kind === 'variety-2026-jpkr') return validYear(item) === 2026 && !!eastAsianRegion(item);
    // 已按资源站「国产／中国／大陆动漫」子分类请求；这里不强制要求单条数据重复填写地区字段。
    if (kind === 'chinese-anime') return true;
    return /日本动漫/.test(item.typeName || '') || /日本|japan/i.test(item.area || '');
  };
  const groupedItems = catalogs.map(catalog => catalog.list.filter(accepts));
  let list: SearchResultItem[];
  if (kind === 'east-asian-series') {
    // 日韩剧各有独立分类，轮流展示，避免首屏被单一地区占满。
    list = interleave(groupedItems);
  } else if (kind === 'variety-2026-jpkr') {
    // 日韩综艺的来源排序常以韩国节目为主；将日本节目也编入首屏。
    list = interleave(['japan', 'korea'].map(region => groupedItems.flat().filter(item => eastAsianRegion(item) === region)));
  } else {
    // 多分类拼接后以年份稳定排序，避免不同子分类的目录顺序互相打乱。
    list = byNewestYear(groupedItems.flat()).slice(0, 12);
  }

  const sources = [...new Map(catalogs.map(catalog => [catalog.source.key, catalog.source])).values()];
  const result = { kind, sources, list, ms: Date.now() - started, warnings } satisfies HomeCatalog;
  setCache(cacheKey, result, 90_000);
  return result;
}
