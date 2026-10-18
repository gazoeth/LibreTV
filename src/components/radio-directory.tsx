'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RegionFlag } from './region-flag';
import { useQuery } from '@tanstack/react-query';
import { Header } from './header';
import { useAuth } from './auth';
import type { RadioRegion, RadioStation } from '@/lib/radio-directory';

type Directory = { updatedAt: string; source: string; total: number; regions: RadioRegion[]; stations: RadioStation[] };
type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
const COMMON = new Set(['CN', 'HK', 'TW', 'US', 'GB', 'JP', 'FR', 'DE', 'CA', 'AU']);
function flag(code: string) { return String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0))); }
function saved(key: string): RadioStation[] { try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.url === 'string' && s.url.startsWith('https://')).slice(0, 60) : []; } catch { return []; } }

export function RadioDirectory() {
 const { verified } = useAuth();
 const searchParams = useSearchParams();
 const router = useRouter();
 const countryParam = searchParams.get('country');
 const country = countryParam && /^[A-Z]{2}$/.test(countryParam) ? countryParam : '';
 const [query, setQuery] = useState('');
 const [common, setCommon] = useState(false);
 const [view, setView] = useState<'region' | 'favorites' | 'recent'>('region');
 const [favorites, setFavorites] = useState<RadioStation[]>([]);
 const [recent, setRecent] = useState<RadioStation[]>([]);
 const [station, setStation] = useState<RadioStation | null>(null);
 const [phase, setPhase] = useState<Phase>('idle');
 const [volume, setVolume] = useState(.8);
 const [attempt, setAttempt] = useState(0);
 const audio = useRef<HTMLAudioElement>(null);
 const wantsPlayback = useRef(false);
 const directory = useQuery<Directory>({ queryKey: ['radio', country], enabled: verified, staleTime: 300000, queryFn: async ({ signal }) => { const response = await fetch(`/api/radio${country ? `?country=${country}` : ''}`, { signal }); if (!response.ok) throw new Error(response.status === 401 ? '请先登录后查看广播目录' : '电台目录加载失败'); return response.json(); } });
 useEffect(() => { setFavorites(saved('freedy:radio:favorites')); setRecent(saved('freedy:radio:recent')); }, []);
 useEffect(() => { setView('region'); setQuery(''); }, [country]);
 useEffect(() => {
  const element = audio.current;
  if (!element || !station) return;
  let cancelled = false; let dispose: (() => void) | undefined;
  const ownsAudio = () => !cancelled && audio.current === element;
  const syncPaused = () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; };
  const onPlaying = () => {
   if (!ownsAudio()) return;
   if (!wantsPlayback.current) { element.pause(); return; }
   setPhase('playing');
   setRecent(previous => { const next = [station, ...previous.filter(s => s.id !== station.id)].slice(0, 30); try { localStorage.setItem('freedy:radio:recent', JSON.stringify(next)); } catch {} return next; });
   if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  };
  const onPause = () => { if (!ownsAudio()) return; setPhase(p => p === 'error' ? p : 'paused'); syncPaused(); };
  const onWaiting = () => { if (ownsAudio() && wantsPlayback.current) setPhase('loading'); };
  const onError = () => { if (ownsAudio() && wantsPlayback.current) { setPhase('error'); syncPaused(); } };
  element.addEventListener('playing', onPlaying);
  element.addEventListener('pause', onPause);
  element.addEventListener('waiting', onWaiting);
  element.addEventListener('error', onError);
  wantsPlayback.current = true;
  setPhase('loading');
  const timeout = window.setTimeout(() => { if (ownsAudio() && wantsPlayback.current && element.readyState < 3) { element.pause(); setPhase('error'); syncPaused(); } }, 18000);
  const play = () => { if (ownsAudio() && wantsPlayback.current) void element.play().catch(() => { if (ownsAudio() && wantsPlayback.current) { setPhase('error'); syncPaused(); } }); };
  if (/\.m3u8(?:[?#]|$)/i.test(station.url) && !element.canPlayType('application/vnd.apple.mpegurl')) {
   void import('hls.js').then(({ default: Hls }) => {
    if (cancelled) return;
    if (!Hls.isSupported()) { setPhase('error'); return; }
    const hls = new Hls({ maxBufferLength: 15, manifestLoadingTimeOut: 12000 });
    dispose = () => hls.destroy();
    hls.on(Hls.Events.MANIFEST_PARSED, play);
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal && !cancelled) { setPhase('error'); element.pause(); hls.destroy(); } });
    hls.loadSource(station.url); hls.attachMedia(element);
   }).catch(() => { if (!cancelled) setPhase('error'); });
  } else { element.src = station.url; play(); }
  if ('mediaSession' in navigator) {
   navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: 'FreeDY · 全球广播' });
   navigator.mediaSession.setActionHandler('play', () => { wantsPlayback.current = true; play(); });
   navigator.mediaSession.setActionHandler('pause', () => { wantsPlayback.current = false; element.pause(); setPhase('paused'); syncPaused(); });
  }
  return () => { cancelled = true; element.removeEventListener('playing', onPlaying); element.removeEventListener('pause', onPause); element.removeEventListener('waiting', onWaiting); element.removeEventListener('error', onError); clearTimeout(timeout); dispose?.(); element.pause(); element.removeAttribute('src'); element.load(); if ('mediaSession' in navigator) { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; navigator.mediaSession.setActionHandler('play', null); navigator.mediaSession.setActionHandler('pause', null); } };
 }, [station, attempt]);
 useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume, station, attempt]);
 function select(s: RadioStation) { if (station?.id === s.id) { setAttempt(n => n + 1); } else setStation(s); }
 function toggleFavorite(s: RadioStation) { setFavorites(previous => { const next = previous.some(item => item.id === s.id) ? previous.filter(item => item.id !== s.id) : [s, ...previous].slice(0, 60); try { localStorage.setItem('freedy:radio:favorites', JSON.stringify(next)); } catch {} return next; }); }
 function changeCountry(code: string) { setQuery(''); setView('region'); const params = new URLSearchParams(searchParams.toString()); if (code) params.set('country', code); else params.delete('country'); router.push(`/radio${params.size ? `?${params}` : ''}`, { scroll: false }); }
 const regions = (directory.data?.regions || []).filter(r => (!common || COMMON.has(r.code)) && `${r.name} ${r.code}`.toLowerCase().includes(query.toLowerCase()));
 const stations = useMemo(() => (view === 'favorites' ? favorites : view === 'recent' ? recent : directory.data?.stations || []).filter(s => `${s.name} ${s.tags}`.toLowerCase().includes(query.toLowerCase())), [directory.data, favorites, recent, view, query]);
 const countryName = directory.data?.regions.find(r => r.code === country)?.name || country;
 const listing = !!country || view !== 'region';
 return <div className="zip-home fd-radio-page min-h-screen"><Header landing /><main className="fd-radio-shell">
  <section className="fd-radio-hero"><div><p className="zip-eyebrow"><span className="zip-live-dot" /> SOUND WITHOUT BORDERS</p><h1>调到此刻。<br /><span>听见世界。</span></h1><p>熟悉的声音，陌生城市的频率。<br />从一个地区出发，找到陪伴你的电台。</p><a href="#radio-directory" className="fd-radio-primary">探索广播 <span>↘</span></a></div><div className={`fd-radio-art ${phase === 'playing' ? 'is-playing' : ''}`} aria-hidden="true"><div className="fd-radio-disc"><span>D</span></div><div className="fd-radio-wave">{Array.from({ length: 19 }, (_, i) => <i key={i} style={{ height: `${14 + (Math.sin(i * 1.8) + 1) * 24}px`, animationDelay: `${i * 70}ms` }} />)}</div><small>FREEDY · GLOBAL FREQUENCIES</small></div></section>
  <div className="fd-radio-metrics"><span><strong>{directory.data?.regions.length ?? '—'}</strong>国家 / 地区</span><span><strong>{directory.data?.total.toLocaleString() ?? '—'}</strong>收录电台</span><p>公开目录快照 · 点击后开始收听</p></div>
  <section id="radio-directory" className="fd-radio-directory"><div className="fd-radio-heading"><div><p className="zip-eyebrow">GLOBAL RADIO</p><h2>{view === 'favorites' ? '我的收藏' : view === 'recent' ? '最近收听' : country ? `${countryName}的声音` : '下一站，听哪里？'}</h2></div><label className="fd-radio-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={listing ? '搜索电台名称或类型' : '搜索国家或地区'} aria-label={listing ? '搜索电台' : '搜索地区'} /></label></div>
  <div className="fd-radio-toolbar"><div><button aria-pressed={view === 'region'} onClick={() => { setView('region'); setQuery(''); }}>地区目录</button><button aria-pressed={view === 'favorites'} onClick={() => { setView('favorites'); setQuery(''); }}>收藏 {favorites.length || ''}</button><button aria-pressed={view === 'recent'} onClick={() => { setView('recent'); setQuery(''); }}>最近收听</button></div>{country && <select value={country} aria-label="切换电台地区" onChange={e => changeCountry(e.target.value)}><option value="">全部地区</option>{directory.data?.regions.map(r => <option value={r.code} key={r.code}>{r.name} · {r.count}</option>)}</select>}{!listing && <button aria-pressed={common} onClick={() => setCommon(s => !s)}>常用地区</button>}</div>
  {directory.isPending && <div className="fd-radio-empty" role="status">正在载入公开电台目录…</div>}
  {directory.isError && <div className="fd-radio-empty" role="alert">{directory.error.message}<button onClick={() => void directory.refetch()}>重新加载</button></div>}
  {!directory.isPending && !directory.isError && (!listing ? <div className="fd-radio-regions">{regions.map(r => <button key={r.code} onClick={() => changeCountry(r.code)}><span className="fd-radio-flag"><RegionFlag code={r.code} emoji={flag(r.code)} /></span><span><strong>{r.name}</strong><small>{r.count} 个收录电台</small></span><i aria-hidden="true">↗</i></button>)}</div> : <div className="fd-radio-stations">{stations.map(s => <article key={s.id} className={station?.id === s.id ? 'is-active' : ''}><button className="fd-radio-tune" onClick={() => select(s)} aria-label={`收听 ${s.name}`}><span className="fd-radio-station-symbol" aria-hidden="true">{station?.id === s.id && phase === 'playing' ? '▥' : '▶'}</span><span><strong>{s.name}</strong><small>{s.codec || '音频'} · {s.tags.split(',').slice(0, 3).join(' / ') || '网络广播'}</small></span></button><button className="fd-radio-heart" aria-label={`${favorites.some(f => f.id === s.id) ? '取消收藏' : '收藏'} ${s.name}`} aria-pressed={favorites.some(f => f.id === s.id)} onClick={() => toggleFavorite(s)}>{favorites.some(f => f.id === s.id) ? '♥' : '♡'}</button></article>)}</div>)}
  {!directory.isPending && !directory.isError && (listing ? stations : regions).length === 0 && <div className="fd-radio-empty">{view === 'favorites' ? '点击电台旁的爱心，收藏喜欢的声音。' : view === 'recent' ? '成功播放过的电台会保存在这里。' : '没有匹配结果，换个关键词试试。'}</div>}
  <p className="fd-radio-disclosure">电台数据来自 <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">Radio Browser</a>。收录时目录标记检测正常，仅保留 HTTPS；不代表当前网络全部可播。收藏和最近收听仅保存在本机浏览器。目录日期 {directory.data?.updatedAt.slice(0, 10) || '—'}。</p></section>
 </main><div className="fd-radio-player" aria-label="广播播放器"><div className="fd-radio-player-inner"><span className="fd-radio-player-mark" aria-hidden="true">◉</span><div className="fd-radio-now"><strong>{station?.name || '找一个频率，留一点时间给自己。'}</strong><span role="status" aria-live="polite">{phase === 'idle' ? '选择电台后开始播放' : phase === 'loading' ? '正在连接电台…' : phase === 'playing' ? '正在直播 · LIVE' : phase === 'paused' ? '已暂停' : '连接失败，可能受电台服务或网络限制'}</span></div><button className="fd-radio-play" disabled={!station} aria-label={phase === 'playing' || phase === 'loading' ? '暂停' : phase === 'error' ? '重试连接' : '播放'} onClick={() => { if (phase === 'playing' || phase === 'loading') { wantsPlayback.current = false; audio.current?.pause(); setPhase('paused'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; } else if (phase === 'error') setAttempt(n => n + 1); else { wantsPlayback.current = true; void audio.current?.play().catch(() => setPhase('error')); } }}>{phase === 'playing' || phase === 'loading' ? 'Ⅱ' : phase === 'error' ? '↻' : '▶'}</button><label className="fd-radio-volume"><span>音量</span><input type="range" min="0" max="1" step=".01" value={volume} aria-label="广播音量" onChange={e => setVolume(Number(e.target.value))} /></label></div></div><audio key={`${station?.id || 'idle'}:${attempt}`} ref={audio} preload="none" /></div>;
}
