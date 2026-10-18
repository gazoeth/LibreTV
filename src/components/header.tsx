'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { Icon } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { cn } from '@/lib/utils';
import { FILM_TYPES } from '@/lib/film-types';

/** 顶部导航：Logo、搜索框（首页外）、历史、设置 */
export function Header({ showSearch = false, landing = false }: { showSearch?: boolean; landing?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  // 与首页搜索框共用同一套「最近搜索」下拉逻辑
  const searchHistory = useSearchHistory(query);

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    // 顶栏搜索一并写入最近搜索（此前只有首页会记录）
    searchHistory.record(q);
  };

  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  return (
    <>
      <header className={cn('sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line', landing && 'zip-header')}>
        <div className={cn('max-w-6xl mx-auto px-4 h-14 flex items-center gap-3', landing && 'zip-nav-shell')}>
          <Link href="/" aria-label="FreeDY 首页" className={cn('flex items-center shrink-0', landing && 'zip-header-brand')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/freedy-mark.svg?v=2" alt="FreeDY D 标志" className={cn('w-7 h-7', landing && 'zip-header-logo')} />
            {landing && <span className="zip-wordmark">Free<span>DY</span></span>}
          </Link>

          {showSearch && (
            <form
              className="flex-1 max-w-xl hidden sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(query);
              }}
            >
              <div ref={searchHistory.containerRef} className="relative">
                <input
                  className={cn(
                    'input w-full h-9',
                    // 展开时：上圆角与外框沿用聚焦样式，底边改为内部分隔线，与下拉拼成同一面板
                    searchHistory.visible &&
                      'rounded-b-none border-accent border-b-line bg-surface-raised focus-visible:ring-0'
                  )}
                  aria-label="搜索影片"
                  placeholder="搜索影片..."
                  value={query}
                  maxLength={100}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    searchHistory.resetActive();
                  }}
                  onFocus={searchHistory.onFocus}
                  onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                  role="combobox"
                  aria-expanded={searchHistory.visible}
                  aria-controls="header-search-history"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchHistory.visible && searchHistory.activeIndex >= 0
                      ? `header-search-history-${searchHistory.activeIndex}`
                      : undefined
                  }
                />
                {searchHistory.visible && (
                  <SearchHistoryDropdown
                    id="header-search-history"
                    matches={searchHistory.matches}
                    activeIndex={searchHistory.activeIndex}
                    onPick={pickHistory}
                    onRemove={searchHistory.remove}
                    onClearAll={searchHistory.clearAll}
                  />
                )}
              </div>
            </form>
          )}

          <div className="flex-1 sm:hidden" />

          <nav className={cn('flex items-center gap-1 ml-auto', landing && 'zip-header-nav')}>
            {landing && <HeaderLink href={pathname === '/' ? '#top' : '/#top'} active={pathname === '/'} landing>首页</HeaderLink>}
            <FilmMenu active={pathname === '/films'} landing={landing} />
            <HeaderLink href="/tv" active={pathname === '/live' || pathname === '/tv'} landing={landing}>
              看电视
            </HeaderLink>
            <HeaderLink href="/radio" active={pathname === '/radio'} landing={landing}>听广播</HeaderLink>
            <HeaderLink href="/about" active={pathname === '/about'} landing={landing}>
              关于
            </HeaderLink>
            <ThemeToggle />
            <IconButton label="观看历史" onClick={() => setHistoryOpen(true)}>
              <Icon name="clock" />
            </IconButton>
            <IconButton label="下载管理" onClick={requestShowDownloadManager}>
              <Icon name="download" />
            </IconButton>
            <IconButton label="设置" onClick={() => setSettingsOpen(true)}>
              <Icon name="gear" />
            </IconButton>
          </nav>
        </div>
      </header>

      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

function FilmMenu({ active, landing }: { active: boolean; landing: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="fd-film-nav" ref={root}>
    <button ref={trigger} className={cn('fd-film-trigger', landing && 'zip-header-link', active && 'is-active')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>影视 <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></button>
    {open && <div className="fd-film-menu" id={id}><p>EXPLORE CINEMA</p><nav aria-label="影视分类导航">{FILM_TYPES.map(type => <Link key={type.key} href={`/films?type=${type.key}`} onClick={() => setOpen(false)}>{type.name}<span aria-hidden="true">↗</span></Link>)}</nav><small>找到下一部想看的好故事。</small></div>}
  </div>;
}

function HeaderLink({ href, active, landing = false, children }: { href: string; active: boolean; landing?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-2.5 py-1.5 rounded-md text-sm transition-colors',
        active ? 'text-content bg-hover' : 'text-muted hover:text-content',
        landing && 'zip-header-link',
        landing && active && 'is-active'
      )}
    >
      {children}
    </Link>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
