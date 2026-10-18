'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Drawer } from './drawer';
import { SmartImage } from './smart-image';
import { EmptyState } from './states';
import { useToast } from './toast';
import { favoriteKey, MAX_FAVORITES, removeFavorite, useFavorites } from '@/lib/favorites';
import { buildWatchUrl } from '@/lib/utils';

export function FavoritesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const items = useFavorites();
  const [query, setQuery] = useState('');
  const { toast } = useToast();
  const visible = items.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Drawer open={open} onClose={onClose} title="我的收藏" width="max-w-lg" subheader={<div className="space-y-3"><p className="text-xs text-muted">仅保存在本机浏览器 · {items.length}/{MAX_FAVORITES} 部 · 超出上限移除最早收藏</p><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索收藏的影片…" aria-label="搜索收藏" className="w-full rounded-lg border border-line bg-chip px-3 py-2 text-sm text-content focus:outline-none focus:border-accent" /></div>}>
    {visible.length === 0 ? <EmptyState variant="plain" title={query ? '没有匹配的收藏' : '把想看的影片留在这里'} description={query ? '试试其他片名' : '在播放页点击收藏，下次可以直接打开。清理浏览器数据会删除收藏。'} /> : <div className="space-y-3">{visible.map(item => <article key={favoriteKey(item)} className="flex items-center gap-3 rounded-xl border border-line p-3">
      <Link href={buildWatchUrl({ sourceKey: item.sourceKey, vodId: item.vodId, title: item.name, sourceUrl: item.sourceUrl })} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-chip">{item.pic ? <SmartImage url={item.pic} mode="direct" alt={item.name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-faint">FreeDY</span>}</div>
        <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-content">{item.name}</h3><p className="mt-1 text-xs text-muted">{[item.year, item.typeName].filter(Boolean).join(' · ')}</p><p className="mt-2 text-xs text-faint">{item.sourceName} · 点击播放 ↗</p></div>
      </Link>
      <button className="min-h-11 shrink-0 rounded-lg px-3 text-xs text-muted hover:bg-hover hover:text-danger" aria-label={`移除收藏：${item.name}`} onClick={() => { if (!removeFavorite(item)) toast('浏览器无法保存更改，请检查存储设置', 'error'); }}>移除</button>
    </article>)}</div>}
  </Drawer>;
}
