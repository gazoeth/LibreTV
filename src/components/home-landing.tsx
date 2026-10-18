'use client';

import type { FormEvent, RefObject } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { RecommendSection } from '@/components/douban-section';
import { SearchHistoryDropdown, useSearchHistory } from '@/components/search-history';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { ContinueWatching, RecentLibrary } from './home-library';
import { HistoryPanel } from './history-panel';
import { useState } from 'react';

type SearchHistoryState = ReturnType<typeof useSearchHistory>;

const QUICK_SEARCHES = ['星际穿越', '漫长的季节', '琅琊榜', '流浪地球', '甄嬛传', '繁花'];

/** 首页展示区：沿用 ZIP0 的暗色搜索首屏结构，搜索与推荐继续使用现有服务。 */
export function HomeLanding({
  input,
  onInputChange,
  inputRef,
  searchHistory,
  onSearch,
}: {
  input: string;
  onInputChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  searchHistory: SearchHistoryState;
  onSearch: (query: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const envSources = useAppStore((state) => state.envSources);
  const selectedKeys = useAppStore((state) => state.selectedKeys);
  const builtinSources = envSources.filter((source) => source.key.startsWith('builtin_'));
  const enabledSourceCount = builtinSources.filter((source) => selectedKeys.includes(source.key)).length;

  const pickSearch = (title: string) => {
    onInputChange(title);
    onSearch(title);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(input);
  };

  return (
    <>
      <section className="zip-hero" id="top">
        <div className="zip-hero-grid" aria-hidden="true" />
        <div className="zip-hero-glow zip-hero-glow-green" aria-hidden="true" />
        <div className="zip-hero-glow zip-hero-glow-amber" aria-hidden="true" />
        <div className="zip-width zip-hero-inner">
          <div className="zip-hero-copy">
            <p className="zip-eyebrow"><span className="zip-live-dot" /> ZERO WAIT. INSTANT PLAY.</p>
            <h1>在线影视搜索，<br /><span>找到就直接播放。</span></h1>
            <p className="zip-hero-description">
              一次搜索多个已配置的视频源。快速查找电影、电视剧、综艺和动漫，比较结果后选择来源播放。
            </p>

            <div ref={searchHistory.containerRef} className="zip-search-wrap">
              <form onSubmit={handleSubmit}>
                <div className={cn('zip-search-box', searchHistory.visible && 'zip-search-open')}>
                  <Icon name="search" className="zip-search-icon" />
                  <input
                    ref={inputRef}
                    value={input}
                    maxLength={100}
                    onChange={(event) => {
                      onInputChange(event.target.value);
                      searchHistory.resetActive();
                    }}
                    onFocus={searchHistory.onFocus}
                    onKeyDown={(event) => searchHistory.onKeyDown(event, pickSearch)}
                    role="combobox"
                    aria-label="搜索影片"
                    aria-expanded={searchHistory.visible}
                    aria-controls="home-search-history"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      searchHistory.visible && searchHistory.activeIndex >= 0
                        ? `home-search-history-${searchHistory.activeIndex}`
                        : undefined
                    }
                    placeholder="搜索电影、剧集、动漫…"
                  />
                  {input && (
                    <button
                      type="button"
                      className="zip-clear-search"
                      aria-label="清空搜索"
                      onClick={() => {
                        onInputChange('');
                        searchHistory.resetActive();
                        inputRef.current?.focus();
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  )}
                  <button className="zip-search-submit" type="submit"><Icon name="search" />搜索</button>
                </div>
              </form>
              {searchHistory.visible && (
                <SearchHistoryDropdown
                  id="home-search-history"
                  matches={searchHistory.matches}
                  activeIndex={searchHistory.activeIndex}
                  onPick={pickSearch}
                  onRemove={searchHistory.remove}
                  onClearAll={searchHistory.clearAll}
                />
              )}
            </div>

            <div className="zip-quick-searches">
              <span>试试这些片名</span>
              <div className="zip-chip-row">
                {QUICK_SEARCHES.map((title) => (
                  <button key={title} type="button" onClick={() => pickSearch(title)}>{title}</button>
                ))}
              </div>
            </div>
          </div>

          <aside className="zip-hero-aside" aria-label="FreeDY 功能介绍">
            <a className="zip-source-panel" href="#recommendations">
              <div className="zip-panel-kicker"><Icon name="search" /> SEARCH ACROSS SOURCES</div>
              <h2>一次搜索，<br />比较多个来源</h2>
              <p>搜索结果聚合展示，选择合适的片源继续观看。</p>
              <div className="zip-source-tiles" aria-hidden="true">
                <span><b>01</b><i>VIDEO</i></span>
                <span><b>02</b><i>VIDEO</i></span>
                <span><b>03</b><i>VIDEO</i></span>
              </div>
              <span className="zip-panel-link">浏览影片推荐 <Icon name="arrowRight" /></span>
              <span className="zip-panel-orbit" aria-hidden="true" />
            </a>
            <button className="zip-history-promo" type="button" onClick={() => setHistoryOpen(true)}>
              <span className="zip-history-icon"><Icon name="clock" /></span>
              <span><strong>本机观看历史</strong><small>通过顶部历史入口续播</small></span>
              <Icon name="arrowRight" className="zip-history-arrow" />
            </button>
          </aside>
        </div>
        <div className="zip-width zip-hero-footnote">
          <span>为发现好内容而设计</span><i /><span>SEARCH · CHOOSE · WATCH</span>
        </div>
      </section>

      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <div className="zip-main">
        <ContinueWatching />
        <section className="zip-section zip-width" id="recommendations">
          <div className="zip-section-heading">
            <div><p className="zip-eyebrow">FEATURED FOR YOU</p><h2>精选推荐</h2><p className="zip-section-subtitle">使用推荐标签切换榜单与内容分类</p></div>
            <a className="zip-text-link" href="#how-it-works">了解搜索方式 <Icon name="arrowRight" /></a>
          </div>
          <RecommendSection onPick={pickSearch} />
        </section>

        <RecentLibrary />

        <section className="zip-section zip-width zip-entry-section" id="watching-now">
          <div className="zip-section-heading">
            <div><p className="zip-eyebrow">EXPLORE FreeDY</p><h2>继续探索</h2></div>
          </div>
          <div className="fd-discover-grid" aria-label="内容探索入口">
            {[
              { name: '电影', type: 'movie', number: '01', description: '去往银幕之外' },
              { name: '电视剧', type: 'tv', number: '02', description: '走进一个好故事' },
              { name: '动漫', type: 'anime', number: '03', description: '想象没有边界' },
            ].map((category) => (
              <Link className="fd-discover-card" key={category.name} href={`/films?type=${category.type}`}>
                <span className="fd-discover-index">{category.number} / ON DEMAND</span>
                <strong>{category.name}</strong>
                <span className="fd-discover-description">{category.description}</span>
                <span className="fd-discover-action">浏览{category.name}片库<Icon name="arrowRight" /></span>
              </Link>
            ))}
            <Link className="fd-discover-card fd-discover-television" href="/tv">
              <span className="fd-discover-index"><span className="zip-live-dot" /> 04 / ON AIR</span>
              <strong>全球电视</strong>
              <span className="fd-discover-description">换个频道，看看世界</span>
              <span className="fd-discover-action">浏览电视与直播频道<Icon name="arrowRight" /></span>
            </Link>
          </div>
          <details className="fd-discover-sources">
            <summary>
              <span className="fd-discover-source-label"><span className="zip-live-dot" />内置点播源</span>
              <span className="fd-discover-source-count">{builtinSources.length ? `${builtinSources.length} 个来源 · ${enabledSourceCount} 个已选择` : '正在载入来源'}</span>
              <span className="fd-discover-source-expand">查看来源 <span aria-hidden="true">＋</span></span>
            </summary>
            <div className="fd-discover-source-content">
              <p>一次搜索比较多个来源。在顶部「设置 → 源管理 → 点播源」调整选择；以下为当前内置列表，选中状态不代表实时可用。</p>
              <ul>
                {builtinSources.map((source) => (
                  <li key={source.key}>
                    <span>{source.name}</span>
                    <small>{selectedKeys.includes(source.key) ? '已选择' : '未选择'}{source.enabledByDefault === false ? ' · 默认关闭' : ''}</small>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </section>

        <section className="zip-how-section" id="how-it-works">
          <div className="zip-width zip-how-inner">
            <div className="zip-how-intro">
              <p className="zip-eyebrow">THREE EASY STEPS</p>
              <h2>找到影片，<br /><span>只需三步。</span></h2>
              <p>从输入片名到选源播放，搜索与播放都由你掌控。</p>
            </div>
            <div className="zip-steps">
              <article><span>01</span><div><h3>输入片名</h3><p>用电影、剧集或动漫名称发起搜索。</p></div><b>⌕</b></article>
              <article><span>02</span><div><h3>比较来源</h3><p>查看聚合结果，展开同名条目比较来源。</p></div><b>↗</b></article>
              <article><span>03</span><div><h3>开始观看</h3><p>选择可用剧集播放，进度自动保存在本机。</p></div><b>▷</b></article>
            </div>
          </div>
        </section>

        <section className="zip-section zip-width zip-faq" id="faq">
          <div className="zip-section-heading"><div><p className="zip-eyebrow">COMMON QUESTIONS</p><h2>常见问题</h2></div><span className="zip-faq-count">FAQ · 03</span></div>
          <div className="zip-faq-list">
            <details open><summary>怎样获得更准确的搜索结果？<span /></summary><p>优先输入完整片名；同名作品较多时，可结合上映年份、地区或主演确认。</p></details>
            <details><summary>FreeDY 会存储视频文件吗？<span /></summary><p>FreeDY 不托管影片文件。播放地址来自内置或你添加的第三方数据源，来源内容的可用性与版权状态由对应服务方负责。</p></details>
            <details><summary>观看记录保存在哪里？<span /></summary><p>观看历史和续播进度保存在当前浏览器的本地数据库中，不会同步到其他设备。</p></details>
          </div>
        </section>

        <footer className="zip-footer">
          <div className="zip-width zip-footer-main">
            <div><a className="zip-footer-brand" href="#top">Free<span>DY</span></a><p>Zero Wait. Instant Play.<br />零等待，即刻播放。</p></div>
            <div className="zip-footer-links"><strong>探索</strong><a href="#recommendations">影片推荐</a><Link href="/tv">全球电视</Link><Link href="/about">关于 FreeDY</Link></div>
            <div className="zip-footer-note"><span className="zip-live-dot" /><p>FreeDY 内置点播 API 与国际公开频道，不托管视频文件。</p><small>请使用可信来源，并支持正版内容。</small></div>
          </div>
          <div className="zip-width zip-footer-bottom"><span>FreeDY 开源影视搜索工具</span><a href="#top">回到顶部 ↑</a></div>
        </footer>
      </div>
    </>
  );
}
