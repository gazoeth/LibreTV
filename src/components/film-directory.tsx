'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Header } from './header';
import { DetailModal } from './detail-modal';
import { VideoCard } from './video-card';
import { useAuth } from './auth';
import { FILM_TYPES, isFilmType, type FilmCatalog } from '@/lib/film-types';
import type { SearchResultItem } from '@/lib/types';
import { buildWatchUrl } from '@/lib/utils';
import { ZIP0_LINE_KEYS } from '@/lib/builtin-vod-sources';
import { subscribeMediaQueryChange } from '@/lib/media-query';

export function FilmDirectory() {
  const params = useSearchParams(); const router = useRouter(); const { verified } = useAuth();
  const rawType = params.get('type') || 'movie'; const type = isFilmType(rawType) ? rawType : 'movie';
  const aggregated = !params.get('source');
  const [aggregateData, setAggregateData] = useState<FilmCatalog>();
  const [aggregateRevision, setAggregateRevision] = useState(0);
  const [aggregatePending, setAggregatePending] = useState(false);
  const [aggregateError, setAggregateError] = useState('');
  const [aggregateHasNext, setAggregateHasNext] = useState(false);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const current = FILM_TYPES.find(t => t.key === type)!;
  const [areaFilter, setAreaFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('source');
  const sourceKey = params.get('source') || '';
  const categoryKey = params.get('category') || '';
  useEffect(() => { setAreaFilter(''); setYearFilter(''); setSortOrder('source'); }, [type, page, sourceKey, categoryKey]);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 761px)');
    const sync = () => setFiltersOpen(media.matches);
    sync();
    return subscribeMediaQueryChange(media, sync);
  }, []);

  const [health, setHealth] = useState<Record<string, { state: 'checking' | 'ok' | 'empty' | 'error'; count?: number; ms?: number; category?: string }>>({});
  const [checking, setChecking] = useState(false);
  const healthController = useRef<AbortController | null>(null);
  useEffect(() => { healthController.current?.abort(); setHealth({}); setChecking(false); return () => healthController.current?.abort(); }, [type, aggregated, page]);
  const [opened, setOpened] = useState<SearchResultItem | null>(null);
  const query = new URLSearchParams({ type, page: String(page) });
  for (const name of ['source', 'category']) { const value = params.get(name); if (value) query.set(name, value); }
  const queryString = query.toString();
  const catalog = useQuery<FilmCatalog>({
    queryKey: ['film-catalog', queryString], enabled: verified && !aggregated, staleTime: 90_000, retry: false, placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => { const r = await fetch(`/api/catalog?${queryString}`, { signal }); const data = await r.json(); if (!r.ok) throw new Error(data.error || '读取片库失败'); return data; },
  });
  function navigate(values: Record<string, string | undefined>) {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    router.push(`/films?${next.toString()}`, { scroll: false });
  }
  useEffect(() => {
    if (!aggregated || !verified) return;
    const controller = new AbortController();
    setAggregatePending(true); setAggregateData(undefined); setAggregateError(''); setAggregateHasNext(false); setHealth({});
    const seen = new Set<string>();
    let current: FilmCatalog = { source: { key: 'aggregate', name: '聚合来源' }, sources: [], categories: [], category: '', type, page, pageCount: page, total: 0, list: [], ms: 0, warnings: [] };
    const started = performance.now();
    let completed = false;
    async function read() {
      try {
        const response = await fetch(`/api/catalog/aggregate?${new URLSearchParams({ type, page: String(page) })}`, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('暂时无法连接聚合目录');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (controller.signal.aborted) return;
          buffer += decoder.decode(chunk.value, { stream: !chunk.done });
          const lines = buffer.split('\n'); buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.event === 'start') {
              current = { ...current, sources: event.sources };
              setHealth(Object.fromEntries(current.sources.map(source => [source.key, { state: 'checking' as const }])));
            } else if (event.event === 'source') {
              const items = (event.list as SearchResultItem[]).filter(item => {
                const identity = `${item.name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()}:${item.year || 'unknown'}`;
                if (seen.has(identity)) return false; seen.add(identity); return true;
              });
              current = { ...current, list: [...current.list, ...items], warnings: [...current.warnings, ...(event.warnings || [])], ms: Math.round(performance.now() - started) };
              setHealth(previous => ({ ...previous, [event.key]: { state: event.state, count: event.list.length, ms: event.ms, category: event.category } }));
              if (event.pageCount > page) setAggregateHasNext(true);
            } else if (event.event === 'done') { completed = true; }
            setAggregateData(current);
          }
          if (chunk.done) break;
        }
      } catch (error) {
        if (!controller.signal.aborted) setAggregateError(error instanceof Error ? error.message : '聚合目录读取中断');
      } finally {
        if (!controller.signal.aborted) {
          setAggregatePending(false);
          if (!completed) {
            setAggregateError(previous => previous || '来源连接提前结束，未响应的来源已标记为中断');
            setHealth(previous => Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, value.state === 'checking' ? { state: 'error' as const, category: '读取中断' } : value])));
          }
        }
      }
    }
    void read(); return () => controller.abort();
  }, [aggregated, type, page, verified, aggregateRevision]);
  const data = aggregated ? aggregateData : catalog.data;
  const fetching = aggregated ? aggregatePending : catalog.isFetching;
  const loadedItems = data?.list || [];
  const readYear = (item: SearchResultItem) => /^\d{4}$/.test(item.year?.trim() || '') ? Number(item.year!.trim()) : null;
  const areas = [...new Set(loadedItems.map(item => item.area?.trim()).filter((area): area is string => !!area))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const years = [...new Set(loadedItems.map(readYear).filter((year): year is number => year !== null))].sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  const decades = [...new Set(years.map(year => Math.floor(year / 10) * 10))];
  const visibleItems = loadedItems.filter(item => {
    const area = item.area?.trim() || '__unknown'; const year = readYear(item);
    const matchesArea = !areaFilter || area === areaFilter;
    const matchesYear = !yearFilter || (yearFilter === '__unknown' ? year === null : yearFilter.startsWith('decade:') ? year !== null && Math.floor(year / 10) * 10 === Number(yearFilter.slice(7)) : year === Number(yearFilter));
    return matchesArea && matchesYear;
  });
  if (sortOrder === 'year') visibleItems.sort((a, b) => (readYear(b) ?? -1) - (readYear(a) ?? -1));
  const clearFilters = () => { setAreaFilter(''); setYearFilter(''); setSortOrder('source'); };
  async function checkSources() {
    if (!data || aggregated || data.type !== type || checking) return;
    healthController.current?.abort();
    const controller = new AbortController(); healthController.current = controller;
    setChecking(true); setHealth({});
    const queue = [...data.sources];
    // 限制并发，检查结果只代表当前分类目录的响应，不代表播放可用性。
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length && !controller.signal.aborted) {
        const source = queue.shift()!;
        setHealth(previous => ({ ...previous, [source.key]: { state: 'checking' } }));
        const started = performance.now();
        const timeout = AbortSignal.timeout(16_000);
        try {
          const response = await fetch(`/api/catalog?${new URLSearchParams({ type, source: source.key, page: '1' })}`, { signal: AbortSignal.any([controller.signal, timeout]) });
          const result: FilmCatalog = await response.json();
          if (!response.ok || result.source?.key !== source.key) throw new Error('来源未响应');
          if (!controller.signal.aborted) setHealth(previous => ({ ...previous, [source.key]: { state: result.list.length ? 'ok' : 'empty', count: result.list.length, ms: Math.round(performance.now() - started) } }));
        } catch {
          if (!controller.signal.aborted) setHealth(previous => ({ ...previous, [source.key]: { state: 'error' } }));
        }
      }
    }));
    if (!controller.signal.aborted) setChecking(false);
  }
  const healthValues = Object.values(health);

  return <div className="zip-home fd-films min-h-screen"><Header landing /><main className="fd-films-shell">
    <section className="fd-films-library" aria-labelledby="film-title"><nav className="fd-films-tabs" aria-label="影视分类">{FILM_TYPES.map(t => <Link key={t.key} href={`/films?type=${t.key}`} aria-current={type === t.key ? 'page' : undefined}>{t.name}</Link>)}</nav>
      <div className="fd-films-topbar"><div className="fd-films-heading"><div><p className="zip-eyebrow">CATEGORY LIBRARY</p><h1 id="film-title">{current.name}<span>{current.caption}</span></h1></div><Link href="/?focus=search">搜索片名 ↗</Link></div><form className="fd-films-search" onSubmit={e => { e.preventDefault(); if (search.trim()) router.push(`/?s=${encodeURIComponent(search.trim())}`); }}><label htmlFor="films-search">搜索所有影视来源</label><div><span aria-hidden="true">⌕</span><input id="films-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索电影、剧集、动漫…" type="search" maxLength={120} /><button disabled={!search.trim()} type="submit">搜索 <span aria-hidden="true">↗</span></button></div></form></div>
      <details className="fd-films-health"><summary><span><i aria-hidden="true">⌁</i> 来源健康状态</span><span>{healthValues.length ? `${healthValues.filter(h => h.state === 'ok').length} 个正常 · ${healthValues.filter(h => h.state === 'empty').length} 个无结果 · ${healthValues.filter(h => h.state === 'error').length} 个不可用` : '展开检测来源'} <b aria-hidden="true">＋</b></span></summary><div className="fd-films-health-intro"><p>{aggregated ? '聚合前 10 个启用来源的完整分类；未支持聚合的来源会明确显示回退子类。同名同年合并。' : '检测当前分类的目录响应；影片是否可播，请在播放页检测。'}</p><button onClick={checkSources} disabled={!data || aggregated || data.type !== type || checking}>{aggregated ? (aggregatePending ? '目录检测中…' : '随目录自动检测') : checking ? '正在逐条检测…' : healthValues.length ? '重新检测' : '检测所有来源'}</button></div><div className="fd-films-health-grid">{data?.sources.map(source => { const result = health[source.key]; return <button key={source.key} className={result ? `is-${result.state}` : ''} onClick={() => navigate({ source: source.key, category: undefined, page: '1' })} aria-pressed={data.source.key === source.key}><i aria-hidden="true">{result?.state === 'ok' ? '✓' : result?.state === 'error' ? '×' : '○'}</i><span><strong>{source.name}</strong><small>{result?.category && <>{result.category} · </>}{result?.state === 'checking' ? '检测中' : result?.state === 'error' ? '暂时不可用' : result ? `${result.count} 个结果` : '尚未检测'}</small></span>{result?.ms !== undefined && <em>{(result.ms / 1000).toFixed(1)}s</em>}</button>; })}</div></details>
      <div className="fd-films-controls"><label>内容来源<select value={params.get('source') || ''} onChange={e => navigate({ source: e.target.value, category: undefined, page: '1' })}><option value="">聚合来源 · 最多 10 条</option><optgroup label="常用点播来源">{ZIP0_LINE_KEYS.map((key, i) => { const source = data?.sources.find(s => s.key === key); return source ? <option key={key} value={key}>线路 {i + 1} · {source.name}</option> : null; })}</optgroup><optgroup label="其他点播来源">{data?.sources.filter(s => !ZIP0_LINE_KEYS.some(key => key === s.key)).map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</optgroup></select></label><label>细分类型<select value={params.get('category') || data?.category || ''} onChange={e => navigate({ category: e.target.value, source: data?.source.key, page: '1' })} disabled={!data || aggregated || fetching}>{aggregated && <option value="">选择单一来源后筛选</option>}{data?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{!aggregated && <button onClick={() => catalog.refetch()} disabled={fetching}>{fetching ? '正在读取…' : '刷新片库 ↻'}</button>}</div>
      {data && data.categories.length > 1 && <nav className="fd-films-subcategories" aria-label="细分类型">{data.categories.map(category => <button key={category.id} aria-pressed={String(data.category) === String(category.id)} disabled={fetching} onClick={() => navigate({ category: String(category.id), source: data.source.key, page: '1' })}>{category.name}</button>)}</nav>}
      <details className="fd-films-filter-disclosure" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}><summary><strong>地区、年份与排序</strong><span>筛选本页结果 <b aria-hidden="true">＋</b></span></summary><section className="fd-films-filters" aria-label="筛选本页影片"><div className="fd-films-filter-note"><span>仅筛选本页已加载结果</span><span>{visibleItems.length} 部符合 · 已加载 {loadedItems.length} 部</span></div><div className="fd-films-filter-row"><strong>地区</strong><div><button aria-pressed={!areaFilter} onClick={() => setAreaFilter('')}>全部地区</button>{areas.map(area => <button key={area} aria-pressed={areaFilter === area} onClick={() => setAreaFilter(area)}>{area}</button>)}<button aria-pressed={areaFilter === '__unknown'} onClick={() => setAreaFilter('__unknown')}>地区未知</button></div></div><div className="fd-films-filter-row"><strong>年份</strong><div><button aria-pressed={!yearFilter} onClick={() => setYearFilter('')}>全部年份</button>{years.filter(year => year >= currentYear - 1).map(year => <button key={year} aria-pressed={yearFilter === String(year)} onClick={() => setYearFilter(String(year))}>{year === currentYear ? `今年 · ${year}` : year === currentYear - 1 ? `去年 · ${year}` : year}</button>)}{decades.map(decade => <button key={decade} aria-pressed={yearFilter === `decade:${decade}`} onClick={() => setYearFilter(`decade:${decade}`)}>{decade} 年代</button>)}<button aria-pressed={yearFilter === '__unknown'} onClick={() => setYearFilter('__unknown')}>年份未知</button></div></div><div className="fd-films-filter-row"><strong>排序</strong><div><button aria-pressed={sortOrder === 'source'} onClick={() => setSortOrder('source')}>来源顺序</button><button aria-pressed={sortOrder === 'year'} onClick={() => setSortOrder('year')}>年份较新</button>{(areaFilter || yearFilter || sortOrder !== 'source') && <button className="fd-films-filter-clear" onClick={clearFilters}>清除筛选 ↻</button>}</div></div></section></details>
      <div className="fd-films-status" role="status"><span className={fetching ? 'fd-films-pending' : ''}><i />{!verified ? '请先完成访问验证' : fetching ? '正在读取来源分类与影片…' : data ? `${data.source.name} · ${data.list.length} 部影片 · ${(data.ms / 1000).toFixed(1)} 秒` : '等待目录'}</span>{data && <span>{aggregated ? `各来源第 ${page} 页 · 已去重 ${data.list.length} 部 · 不代表全站总量` : `第 ${data.page} / ${data.pageCount} 页 · 来源收录 ${data.total.toLocaleString()} 条`}</span>}</div>
      {(aggregated ? !!aggregateError && !data?.list.length : catalog.isError) ? <div className="fd-films-empty"><h3>这条来源暂时没有准备好</h3><p>{aggregated ? aggregateError : catalog.error?.message}</p><button onClick={() => aggregated ? setAggregateRevision(value => value + 1) : catalog.refetch()}>重新读取</button><button onClick={() => navigate({ source: aggregated ? data?.sources[0]?.key : undefined, category: undefined, page: '1' })}>{aggregated ? '浏览单一来源' : '切换聚合来源'}</button></div> : !data ? <div className="fd-films-grid" aria-label="正在加载影片">{Array.from({ length: 12 }, (_, i) => <div className="fd-films-skeleton" key={i} />)}</div> : <>
        {aggregated && aggregateError && <p className="fd-films-warning" role="status">部分结果已保留，连接中断：{aggregateError} <button onClick={() => setAggregateRevision(value => value + 1)}>重新连接</button></p>}
        {data.warnings.length > 0 && <details className="fd-films-warning"><summary>来源分类范围与连接情况</summary>{data.warnings.map(w => <p key={w}>{w}</p>)}</details>}
        {visibleItems.length ? <div className="fd-films-grid" aria-busy={!aggregated && fetching}>{visibleItems.map(item => <div className="fd-films-item" key={`${item.sourceKey}:${item.vodId}`}><VideoCard item={item} onClick={() => router.push(buildWatchUrl({ sourceKey: item.sourceKey, vodId: item.vodId, index: 0, title: item.name, sourceUrl: item.sourceUrl }))} /><button className="fd-films-select" onClick={() => setOpened(item)}>选集与详情 <span aria-hidden="true">↗</span></button></div>)}</div> : <div className="fd-films-empty">{(areaFilter || yearFilter) ? <><h3>本页暂时没有符合条件的影片</h3><p>筛选仅针对已加载内容，可清除条件或翻页继续浏览。</p><button onClick={clearFilters}>清除筛选</button></> : <><h3>{aggregated && aggregatePending ? "正在等待首批影片" : "这个分类暂时没有内容"}</h3><p>{aggregated && aggregatePending ? "可用来源的内容会陆续显示，无需等待全部检测完成。" : "可以切换细分类型或内容来源继续浏览。"}</p></>}</div>}
        <nav className="fd-films-pagination" aria-label="片库分页"><button disabled={page <= 1 || fetching} onClick={() => navigate({ page: String(page - 1) })}>← 上一页</button><span>{data.page} <small>{aggregated ? "各来源页码" : `/ ${data.pageCount}`}</small></span><button disabled={(aggregated ? !aggregateHasNext : page >= data.pageCount) || fetching} onClick={() => navigate({ page: String(page + 1) })}>下一页 →</button></nav>
      </>}
    </section><footer className="fd-films-footer"><Link href="/">Free<span>DY</span></Link><p>片库内容来自第三方公开点播接口，分类、更新与可用性由来源提供。<br />选择影片后，可在播放页检测和切换线路。</p><Link href="/tv">探索全球电视 ↗</Link></footer>
  </main><DetailModal item={opened} onClose={() => setOpened(null)} /></div>;
}
