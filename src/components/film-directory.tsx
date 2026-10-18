'use client';

import { useState } from 'react';
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

export function FilmDirectory() {
  const params = useSearchParams(); const router = useRouter(); const { verified } = useAuth();
  const rawType = params.get('type') || 'movie'; const type = isFilmType(rawType) ? rawType : 'movie';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const current = FILM_TYPES.find(t => t.key === type)!;
  const [opened, setOpened] = useState<SearchResultItem | null>(null);
  const query = new URLSearchParams({ type, page: String(page) });
  for (const name of ['source', 'category']) { const value = params.get(name); if (value) query.set(name, value); }
  const queryString = query.toString();
  const catalog = useQuery<FilmCatalog>({
    queryKey: ['film-catalog', queryString], enabled: verified, staleTime: 90_000, retry: false, placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => { const r = await fetch(`/api/catalog?${queryString}`, { signal }); const data = await r.json(); if (!r.ok) throw new Error(data.error || '读取片库失败'); return data; },
  });
  function navigate(values: Record<string, string | undefined>) {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    router.push(`/films?${next.toString()}`, { scroll: false });
  }
  const data = catalog.data;
  return <div className="zip-home fd-films min-h-screen"><Header landing /><main className="fd-films-shell">
    <section className="fd-films-hero"><div><p className="zip-eyebrow"><i /> THE SCREEN IS YOURS</p><h1>好故事，<br /><span>随时入场。</span></h1><p>从电影到剧集，按分类发现下一部想看的作品。<br />点击封面开始播放，也可以先选集、看详情。</p></div><div className="fd-films-ticket" aria-hidden="true"><span>FreeDY / CINEMA</span><strong>▶</strong><div>让日常暂停<br />让故事开始</div><small>CHOOSE · PLAY · ENJOY</small></div></section>
    <section className="fd-films-library" aria-labelledby="film-title"><nav className="fd-films-tabs" aria-label="影视分类">{FILM_TYPES.map(t => <Link key={t.key} href={`/films?type=${t.key}`} aria-current={type === t.key ? 'page' : undefined}>{t.name}</Link>)}</nav>
      <div className="fd-films-heading"><div><p className="zip-eyebrow">CATEGORY LIBRARY</p><h2 id="film-title">{current.name}<span>{current.caption}</span></h2></div><Link href="/?focus=search">搜索片名 ↗</Link></div>
      <div className="fd-films-controls"><label>内容来源<select value={params.get('source') || ''} onChange={e => navigate({ source: e.target.value, category: undefined, page: '1' })}><option value="">自动选择可用来源</option><optgroup label="参考站十条来源">{ZIP0_LINE_KEYS.map((key, i) => { const source = data?.sources.find(s => s.key === key); return source ? <option key={key} value={key}>线路 {i + 1} · {source.name}</option> : null; })}</optgroup><optgroup label="其他点播来源">{data?.sources.filter(s => !ZIP0_LINE_KEYS.some(key => key === s.key)).map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</optgroup></select></label><label>细分类型<select value={params.get('category') || data?.category || ''} onChange={e => navigate({ category: e.target.value, source: data?.source.key, page: '1' })} disabled={!data || catalog.isFetching}>{data?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button onClick={() => catalog.refetch()} disabled={catalog.isFetching}>{catalog.isFetching ? '正在读取…' : '刷新片库 ↻'}</button></div>
      <div className="fd-films-status" role="status"><span className={catalog.isFetching ? 'fd-films-pending' : ''}><i />{!verified ? '请先完成访问验证' : catalog.isFetching ? '正在读取来源分类与影片…' : data ? `${data.source.name} · ${data.list.length} 部影片 · ${(data.ms / 1000).toFixed(1)} 秒` : '等待目录'}</span>{data && <span>第 {data.page} / {data.pageCount} 页 · 来源收录 {data.total.toLocaleString()} 条</span>}</div>
      {catalog.isError ? <div className="fd-films-empty"><h3>这条来源暂时没有准备好</h3><p>{catalog.error.message}</p><button onClick={() => catalog.refetch()}>重新读取</button><button onClick={() => navigate({ source: undefined, category: undefined, page: '1' })}>自动选择来源</button></div> : !data ? <div className="fd-films-grid" aria-label="正在加载影片">{Array.from({ length: 12 }, (_, i) => <div className="fd-films-skeleton" key={i} />)}</div> : <>
        {data.warnings.length > 0 && <details className="fd-films-warning"><summary>已切换可用来源 · 查看连接情况</summary>{data.warnings.map(w => <p key={w}>{w}</p>)}</details>}
        {data.list.length ? <div className="fd-films-grid" aria-busy={catalog.isFetching}>{data.list.map(item => <div className="fd-films-item" key={`${item.sourceKey}:${item.vodId}`}><VideoCard item={item} onClick={() => router.push(buildWatchUrl({ sourceKey: item.sourceKey, vodId: item.vodId, index: 0, title: item.name, sourceUrl: item.sourceUrl }))} /><button className="fd-films-select" onClick={() => setOpened(item)}>选集与详情 <span aria-hidden="true">↗</span></button></div>)}</div> : <div className="fd-films-empty"><h3>这个分类暂时没有内容</h3><p>可以切换细分类型或内容来源继续浏览。</p></div>}
        <nav className="fd-films-pagination" aria-label="片库分页"><button disabled={page <= 1 || catalog.isFetching} onClick={() => navigate({ page: String(page - 1) })}>← 上一页</button><span>{data.page} <small>/ {data.pageCount}</small></span><button disabled={page >= data.pageCount || catalog.isFetching} onClick={() => navigate({ page: String(page + 1) })}>下一页 →</button></nav>
      </>}
    </section><footer className="fd-films-footer"><Link href="/">Free<span>DY</span></Link><p>片库内容来自第三方公开点播接口，分类、更新与可用性由来源提供。<br />选择影片后，可在播放页检测和切换线路。</p><Link href="/tv">探索全球电视 ↗</Link></footer>
  </main><DetailModal item={opened} onClose={() => setOpened(null)} /></div>;
}
