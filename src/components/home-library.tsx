'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { buildWatchUrl } from '@/lib/utils';
import type { FilmCatalog, FilmType, HomeCatalog, HomeCatalogKind } from '@/lib/film-types';
import type { SearchResultItem } from '@/lib/types';
import { SmartImage } from './smart-image';
import { useAppStore } from '@/lib/store';
import { useDetailPrefetch } from './use-detail-prefetch';

/** 仅在接近视口时请求目录，避免首页同时扫描所有来源。 */
function useNearby() {
  const ref = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: '240px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, nearby };
}

function Poster({ item }: { item: SearchResultItem }) {
  const warmup = useDetailPrefetch(item);
  const mode = useAppStore(s => s.imageProxyMode);
  const customProxy = useAppStore(s => s.customImageProxy);
  return <Link className="fd-home-poster" href={buildWatchUrl({ sourceKey: item.sourceKey, vodId: item.vodId, sourceUrl: item.sourceUrl, title: item.name, index: 0 })} {...warmup}>
    <div className="fd-home-poster-image"><span className="fd-poster-fallback" aria-hidden="true">F<span>DY</span></span><SmartImage url={item.pic} mode={mode} customProxy={customProxy} alt={item.name} /><span className="fd-poster-play" aria-hidden="true">▷</span>{item.remarks && <span className="fd-poster-remark">{item.remarks}</span>}</div>
    <strong>{item.name}</strong><small>{[item.year, item.typeName].filter(Boolean).join(' · ') || item.sourceName}</small>
  </Link>;
}

function RecentRow({ type, title, english, homeFeed }: { type: FilmType; title: string; english: string; homeFeed?: HomeCatalogKind }) {
  const { ref, nearby } = useNearby();
  const query = useQuery<FilmCatalog | HomeCatalog>({
    queryKey: ['home-catalog', homeFeed || type],
    queryFn: async ({ signal }) => {
      const url = homeFeed ? `/api/home-catalog?kind=${homeFeed}` : `/api/catalog?type=${type}`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('暂时无法读取近期更新');
      return response.json() as Promise<FilmCatalog | HomeCatalog>;
    },
    enabled: nearby, staleTime: 120_000, retry: false,
  });
  return <section ref={ref} className="fd-recent-row" aria-label={`近期${title}`}>
    <div className="fd-row-heading"><div><p className="zip-eyebrow">{english}</p><h3>{title}</h3></div><Link href={`/films?type=${type}`}>{homeFeed ? '进入全片库' : '查看全部'} <span aria-hidden="true">↗</span></Link></div>
    {query.isError ? <div className="fd-row-message"><p>这个分类暂时没有响应。</p><button onClick={() => void query.refetch()}>重新加载</button><Link href={`/films?type=${type}`}>进入全片库 ↗</Link></div> : query.data ? <>
      {query.data.list.length ? <div className="fd-home-poster-grid">{query.data.list.slice(0, 12).map(item => <Poster key={`${item.sourceKey}:${item.vodId}`} item={item} />)}</div> : <div className="fd-row-message"><p>暂时没有符合地区和年份条件的内容。</p><Link href={`/films?type=${type}`}>浏览完整分类 ↗</Link></div>}
      <p className="fd-row-provenance">{homeFeed ? `来自${query.data.sources.map(source => source.name).join('、') || '已配置来源'} · 按地区与年份信息筛选` : `来自${(query.data as FilmCatalog).source.name} · 按该来源返回顺序展示`}</p>
    </> : <div className="fd-home-poster-grid" aria-label="正在载入目录" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="fd-poster-skeleton"><div /><span /></div>)}</div>}
  </section>;
}

export function RecentLibrary() {
  const rows: { type: FilmType; title: string; english: string; homeFeed?: HomeCatalogKind }[] = [
    { type: 'movie', title: '欧美电影', english: 'WESTERN FILMS', homeFeed: 'western-movies' },
    { type: 'tv', title: '日韩剧', english: 'JAPANESE & KOREAN SERIES', homeFeed: 'east-asian-series' },
    { type: 'short', title: '短剧', english: 'RECENT SHORTS' },
    { type: 'variety', title: '2026日韩综艺', english: '2026 JAPANESE & KOREAN SHOWS', homeFeed: 'variety-2026-jpkr' },
    { type: 'anime', title: '日漫', english: 'JAPANESE ANIME', homeFeed: 'japanese-anime' },
  ];
  return <section className="zip-width fd-recent-library" id="recent-updates"><div className="zip-section-heading"><div><p className="zip-eyebrow">LATEST UPDATES</p><h2>近期更新</h2><p className="zip-section-subtitle">从片库直接出发，选中封面即可播放。</p></div><Link className="zip-text-link" href="/films">进入影视片库 ↗</Link></div>{rows.map(row => <RecentRow key={row.type} {...row} />)}</section>;
}

export function ContinueWatching() {
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().limit(6).toArray(), []);
  if (!history?.length) return null;
  return <section className="zip-width fd-continue-section"><div className="fd-row-heading"><div><p className="zip-eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>继续观看</h2></div><small>仅保存在此浏览器</small></div><div className="fd-continue-grid">{history.map(item => <Link key={item.id} href={buildWatchUrl({ sourceKey: item.sourceKey, sourceUrl: item.sourceUrl, vodId: item.vodId, title: item.title, index: item.episodeIndex })}><span className="fd-continue-play" aria-hidden="true">▷</span><div><strong>{item.title}</strong><small>第 {item.episodeIndex + 1} 集{item.duration > 0 ? ` · 已观看 ${Math.min(100, Math.round(item.playbackPosition / item.duration * 100))}%` : ''}</small></div><span aria-hidden="true">↗</span></Link>)}</div></section>;
}
