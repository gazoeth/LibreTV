'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Header } from './header';
import { Icon } from './icon';
import { api } from '@/lib/client-api';
import { useAuth } from './auth';
import { useAppStore } from '@/lib/store';
import { RegionFlag } from './region-flag';

const COMMON = new Set(['CN', 'HK', 'TW', 'MO', 'US', 'JP', 'GB', 'KR', 'FR', 'DE', 'CA', 'AU']);

export function TvDirectory() {
  const { verified } = useAuth();
  const [query, setQuery] = useState('');
  const [commonOnly, setCommonOnly] = useState(false);
  const recent = useAppStore(s => s.liveRecent);
  const directory = useQuery({ queryKey: ['tv-directory'], queryFn: api.tvDirectory, enabled: verified, staleTime: 300_000 });
  const regions = useMemo(() => (directory.data?.regions || []).filter(r =>
    (!commonOnly || COMMON.has(r.code)) && `${r.name} ${r.code}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [directory.data, query, commonOnly]);

  return (
    <div className="zip-home fd-tv-page min-h-screen">
      <Header landing />
      <main className="fd-tv-shell">
        <section className="fd-tv-hero" aria-labelledby="tv-title">
          <div>
            <p className="zip-eyebrow"><span className="zip-live-dot" /> A WINDOW TO THE WORLD</p>
            <h1 id="tv-title">世界，<br /><span>正在直播。</span></h1>
            <p className="fd-tv-description">从熟悉的频道，到远方的日常。<br />选一个地区，打开你的全球电视视野。</p>
            <div className="fd-tv-hero-actions"><a href="#regions" className="fd-tv-primary">探索电视台 <span aria-hidden="true">↘</span></a><Link href="/live">我的直播源 <span aria-hidden="true">↗</span></Link></div>
          </div>
          <div className="fd-tv-orbit" aria-hidden="true"><div className="fd-tv-orbit-ring" /><div className="fd-tv-globe">◎</div><span className="fd-tv-orbit-label">ON AIR · AROUND THE WORLD</span><span className="fd-tv-orbit-chip">LIVE SIGNAL <i /></span></div>
        </section>

        <div className="fd-tv-metrics" aria-live="polite"><span><strong>{directory.data?.regions.length.toLocaleString() ?? '—'}</strong>国家 / 地区</span><span><strong>{directory.data?.totalChannels.toLocaleString() ?? '—'}</strong>收录频道</span><p>公开频道目录 <span>·</span> 选择地区，即刻进入频道列表</p></div>

        {recent.length > 0 && <section className="fd-tv-recent" aria-label="最近观看的频道"><span>继续观看</span>{recent.slice(0, 6).map(c => {
          const params = new URLSearchParams({ url: c.url, name: c.name });
          if (c.tvgId) params.set('tvgId', c.tvgId);
          return <Link key={c.url} href={`/live?${params}`}><span className="zip-live-dot" />{c.name}<span aria-hidden="true">↗</span></Link>;
        })}</section>}

        <nav className="fd-broadcast-shortcuts" aria-label="电视地区快捷入口"><span>快速进入</span>{(directory.data?.regions || []).filter(r => COMMON.has(r.code)).slice(0, 8).map(r => <Link href={`/live?country=${r.code}`} key={r.code}><RegionFlag code={r.code} emoji={r.flag} /><span>{r.name}</span><small>{r.count}</small></Link>)}</nav>
        <section id="regions" className="fd-tv-directory" aria-labelledby="regions-title">
          <div className="fd-tv-section-head"><div><p className="zip-eyebrow">GLOBAL DIRECTORY</p><h2 id="regions-title">下一站，看哪里？</h2></div><label className="fd-tv-search"><Icon name="search" className="w-4 h-4" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索地区或代码，如中国 / CN" aria-label="搜索国家或地区" /></label></div>
          <div className="fd-tv-filter"><div role="group" aria-label="地区筛选"><button aria-pressed={!commonOnly} onClick={() => setCommonOnly(false)}>全部地区</button><button aria-pressed={commonOnly} onClick={() => setCommonOnly(true)}>常用地区</button></div><span>{regions.length} 个地区</span></div>
          {directory.isPending && <div className="fd-tv-region-grid" aria-label="正在加载地区目录" role="status" aria-busy="true">{Array.from({ length: 12 }, (_, i) => <div className="fd-tv-region fd-tv-skeleton" key={i} />)}</div>}
          {directory.isError && <div className="fd-tv-empty" role="alert"><h3>暂时无法加载电视目录</h3><p>{directory.error.message}</p><button onClick={() => void directory.refetch()}>重新加载</button></div>}
          {directory.data && <div className="fd-tv-region-grid">{regions.map((r, i) => <Link className="fd-tv-region" key={r.code} href={`/live?country=${r.code}`} style={{ '--region-delay': `${Math.min(i, 12) * 20}ms` } as React.CSSProperties}><span className="fd-tv-flag" aria-hidden="true"><RegionFlag code={r.code} emoji={r.flag} /></span><span className="fd-tv-region-info"><strong>{r.name}</strong><small>{r.count.toLocaleString()} 个频道</small></span><span className="fd-tv-region-arrow" aria-hidden="true">↗</span></Link>)}</div>}
          {directory.data && regions.length === 0 && <div className="fd-tv-empty"><h3>没有找到这个地区</h3><p>试试中文名称或两位地区代码。</p><button onClick={() => { setQuery(''); setCommonOnly(false); }}>显示全部地区</button></div>}
        </section>
        <footer className="fd-tv-footer"><Link href="/">Free<span>DY</span></Link><p>频道目录来自 <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noopener noreferrer">iptv-org</a> · 更新于 {directory.data ? new Date(directory.data.updatedAt).toLocaleDateString('zh-CN') : '—'}<br />频道收录不代表当前可播放；部分频道有地区限制，可在观看页测活。</p><a href="#tv-title">回到顶部 ↑</a></footer>
      </main>
    </div>
  );
}
