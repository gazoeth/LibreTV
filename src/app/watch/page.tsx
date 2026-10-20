'use client';

import './watch.css';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { DETAIL_STALE_TIME, detailQueryKey } from '@/lib/detail-query';
// 播放器（artplayer + hls.js）按需加载：拆出独立 chunk，不占首屏 First Load JS
const PlayerShell = dynamic(() => import('@/components/player-shell').then((m) => m.PlayerShell), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  ),
});
import { EmptyState, LoadingState, Spinner } from '@/components/states';
import { SwitchSourceModal } from '@/components/switch-source';
import type { PlayerRemoteControls } from '@/components/player-shell';
import { enqueueDownload } from '@/components/download-manager';
import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth';
import { resolveSource, useAppStore } from '@/lib/store';
import {
  clearProgress,
  progressKeyOf,
  saveProgress,
  updateHistoryProgress,
  upsertHistory,
  db,
} from '@/lib/db';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { addFavorite, favoriteKey, removeFavorite, useFavorites } from '@/lib/favorites';
import { useToast } from '@/components/toast';
import type { SearchResultItem } from '@/lib/types';

/**
 * 播放页（唯一入口，替代旧版 watch.html → player.html 跳转链）。
 * 状态全部由 URL 驱动：/watch?source=xx&id=..&index=..&title=..
 * 集数列表由服务端详情接口获取；进度与历史走 IndexedDB。
 */
export default function WatchPage() {
  return (
    <Suspense>
      <WatchContent />
    </Suspense>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const store = useAppStore();
  const { verified } = useAuth();
  const favorites = useFavorites();
  const { toast } = useToast();

  const sourceKey = searchParams.get('source') || '';
  const vodId = searchParams.get('id') || '';
  const directUrl = searchParams.get('url') || '';
  const titleParam = searchParams.get('title') || '';
  const indexParam = parseInt(searchParams.get('index') || '0', 10) || 0;

  const [reversed, setReversed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [remoteControls, setRemoteControls] = useState<PlayerRemoteControls | null>(null);

  const source = resolveSource(store, sourceKey, {
    url: searchParams.get('sourceUrl') || undefined,
    detail: searchParams.get('detail') || undefined,
  });

  // 详情查询：无 id（纯直连链接分享）时跳过
  const detailQuery = useQuery({
    queryKey: detailQueryKey(vodId, source),
    queryFn: ({ signal }) => api.detail(vodId, source!, signal),
    enabled: Boolean(source && vodId && verified),
    staleTime: DETAIL_STALE_TIME,
  });

  const episodes = useMemo(() => detailQuery.data?.episodes ?? [], [detailQuery.data]);
  const videoTitle = titleParam || detailQuery.data?.videoInfo?.title || '未知视频';
  const favoriteItem: SearchResultItem = { sourceKey, vodId, name: videoTitle, sourceName: source?.name || sourceKey, sourceUrl: source?.url, pic: detailQuery.data?.videoInfo?.cover, year: detailQuery.data?.videoInfo?.year, typeName: detailQuery.data?.videoInfo?.typeName };
  const isFavorite = favorites.some(item => favoriteKey(item) === favoriteKey(favoriteItem));
  const toggleFavorite = () => {
    const saved = isFavorite ? removeFavorite(favoriteItem) : addFavorite(favoriteItem);
    if (!saved) toast('无法保存收藏，请检查浏览器存储设置', 'error');
    else toast(isFavorite ? '已取消收藏' : '已加入本机收藏', 'success');
  };

  // 当前播放地址：优先取剧集列表中的当前集，其次直连 URL 参数
  const currentUrl = useMemo(() => {
    if (episodes.length > 0) {
      const idx = Math.min(Math.max(indexParam, 0), episodes.length - 1);
      return episodes[idx] || directUrl;
    }
    return directUrl;
  }, [episodes, indexParam, directUrl]);

  const currentIndex = useMemo(() => {
    if (episodes.length > 0) return Math.min(Math.max(indexParam, 0), episodes.length - 1);
    return indexParam;
  }, [episodes, indexParam]);

  const goEpisode = useCallback(
    (index: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('index', String(index));
      sp.set('url', episodes[index] || directUrl);
      sp.delete('position');
      router.replace(`/watch?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams, episodes, directUrl]
  );

  // 进度恢复优先级：URL position 参数 > IndexedDB 记录
  const getRestorePosition = useCallback(async () => {
    const urlPos = parseInt(searchParams.get('position') || '0', 10) || 0;
    if (urlPos > 0) return urlPos;
    if (!vodId) return 0;
    const entry = await db.progress.get(progressKeyOf(sourceKey, vodId, currentIndex));
    return entry?.position ?? 0;
  }, [searchParams, sourceKey, vodId, currentIndex]);

  // 写入观看历史（进入页面即记录，进度后续增量更新）
  useEffect(() => {
    if (!verified || !sourceKey || !currentUrl) return;
    const timer = setTimeout(() => {
      upsertHistory({
        sourceKey,
        sourceUrl: source?.url,
        vodId: vodId || currentUrl,
        title: videoTitle,
        pic: detailQuery.data?.videoInfo?.cover,
        episodeIndex: currentIndex,
        totalEpisodes: episodes.length,
        playbackPosition: 0,
        duration: 0,
        timestamp: Date.now(),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, sourceKey, vodId, currentIndex, videoTitle, currentUrl]);

  // 播放中与暂停时的进度落盘逻辑一致，共用同一回调
  const handleProgress = useCallback(
    (position: number, duration: number) => {
      if (vodId) {
        saveProgress(sourceKey, vodId, currentIndex, position, duration).catch(() => {});
        updateHistoryProgress(sourceKey, vodId || currentUrl, position, duration).catch(() => {});
      }
    },
    [sourceKey, vodId, currentIndex, currentUrl]
  );

  // 自动连播的 800ms 延迟切集要在卸载时取消，避免离开页面后跳转
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
  }, [sourceKey, vodId, currentIndex]);

  const handleEnded = useCallback(() => {
    if (vodId) clearProgress(sourceKey, vodId, currentIndex).catch(() => {});
    if (store.autoplayNext && currentIndex < episodes.length - 1) {
      autoNextTimer.current = setTimeout(() => goEpisode(currentIndex + 1), 800);
    }
  }, [store.autoplayNext, currentIndex, episodes.length, goEpisode, sourceKey, vodId]);

  // Alt+←/→ 集数切换快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goEpisode(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < episodes.length - 1) {
        e.preventDefault();
        goEpisode(currentIndex + 1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentIndex, episodes.length, goEpisode]);

  const orderedEpisodes = reversed ? [...episodes].map((_, i) => episodes.length - 1 - i) : episodes.map((_, i) => i);

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-faint text-sm">等待访问验证...</p>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-content font-medium mb-2">点播源不存在</h1>
          <p className="text-sm text-muted mb-4">
            该视频来自点播源「{sourceKey}」，但它可能已被删除。请在设置中重新添加后重试。
          </p>
          <Link href="/" className="btn-primary">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="zip-home fd-watch min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="fd-watch-header max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <BackButton />
          <HomeButton />
          <div className="min-w-0">
            <h1 className="text-sm font-medium text-content truncate">{videoTitle}</h1>
            <p className="fd-watch-subtitle text-xs text-faint">
              <span className="fd-watch-source-name">{source.name}</span>
              {episodes.length > 0 && <span className="fd-watch-episode-position">第 {currentIndex + 1} / {episodes.length} 集</span>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {vodId && <button className="fd-watch-header-favorite fd-watch-favorite btn-ghost btn-sm" aria-pressed={isFavorite} onClick={toggleFavorite}>{isFavorite ? '★ 已收藏' : '☆ 收藏'}</button>}
            <button
              className="fd-watch-download btn-ghost btn-sm"
              onClick={() => {
                if (!currentUrl) return;
                enqueueDownload({
                  url: currentUrl,
                  // 多集才带集数后缀；单集影片（含电影）文件名就是纯标题
                  title: `${videoTitle}${episodes.length > 1 ? ` 第${currentIndex + 1}集` : ''}`,
                  format: 'MP4',
                });
                // 「已加入下载队列」由 DownloadManager 在真正入队后提示：
                // 这里先提示的话，用户随后取消保存位置会出现「已加入→已取消」的矛盾
              }}
            >
              下载本集
            </button>
            <button className="fd-watch-switch-source btn-ghost btn-sm" onClick={() => setSwitchOpen(true)}>
              切换线路
            </button>
          </div>
        </div>
      </header>

      <main className="fd-watch-main flex-1 max-w-7xl w-full mx-auto px-4 py-4">
        <div className="fd-watch-grid grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div>
            <div
              className="video-frame bg-black rounded-lg overflow-hidden"
              data-tv-player-surface
              tabIndex={0}
              role="group"
              aria-label={`${videoTitle} 播放画面`}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                remoteControls?.togglePlayback();
              }}
            >
              <div className="absolute inset-0">
                {currentUrl ? (
                  <PlayerShell
                    key={retryKey}
                    url={currentUrl}
                    title={videoTitle}
                    adFilter={store.adFilter}
                    autoplayNext={store.autoplayNext}
                    episodeKey={`${sourceKey}:${vodId}:${currentIndex}`}
                    nextUrl={currentIndex + 1 < episodes.length ? episodes[currentIndex + 1] : undefined}
                    nextEpisodeKey={currentIndex + 1 < episodes.length ? `${sourceKey}:${vodId}:${currentIndex + 1}` : undefined}
                    getRestorePosition={getRestorePosition}
                    onTimeUpdate={handleProgress}
                    onPause={handleProgress}
                    onEnded={handleEnded}
                    onRequestSwitchSource={() => setSwitchOpen(true)}
                    onRegisterRemoteControls={setRemoteControls}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {detailQuery.isLoading ? (
                      <Spinner size="lg" />
                    ) : (
                      <div className="flex flex-col items-center gap-4 p-5 text-center"><p className="text-faint text-sm">
                        {detailQuery.isError ? '视频加载失败，请尝试其他资源' : '无可用播放地址'}
                      </p><div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => void detailQuery.refetch()}>重新获取</button><button className="btn-primary btn-sm" onClick={() => setSwitchOpen(true)}>检测其他线路</button></div></div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 操作栏 */}
            <div className="fd-watch-actions flex flex-wrap items-center gap-2 mt-3">
              <div className="fd-watch-standard-actions flex flex-wrap items-center gap-2">
                <button className="fd-watch-share btn-ghost btn-sm" onClick={async () => { const ok = await copyToClipboard(window.location.href); toast(ok ? '播放链接已复制' : '复制失败，请从地址栏复制链接', ok ? 'success' : 'error'); }}>分享链接 ↗</button>
                {vodId && <button className="fd-watch-favorite btn-ghost btn-sm" aria-pressed={isFavorite} onClick={toggleFavorite}>{isFavorite ? '★ 已收藏' : '☆ 收藏影片'}</button>}
                <button
                  className="btn-ghost btn-sm fd-watch-prev-episode"
                  disabled={currentIndex <= 0}
                  onClick={() => goEpisode(currentIndex - 1)}
                >
                  上一集
                </button>
                <button
                  className="btn-ghost btn-sm fd-watch-next-episode"
                  disabled={episodes.length === 0 || currentIndex >= episodes.length - 1}
                  onClick={() => goEpisode(currentIndex + 1)}
                >
                  下一集
                </button>
                <label className="fd-watch-autoplay flex items-center gap-1.5 text-xs text-muted ml-auto cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-[#2563eb]"
                    checked={store.autoplayNext}
                    onChange={(e) => store.updateSettings({ autoplayNext: e.target.checked })}
                  />
                  自动连播
                </label>
              </div>
              <div className="fd-tv-player-controls" role="group" aria-label="电视播放控制">
                <button className="btn-ghost" onClick={() => remoteControls?.seekBy(-10)} disabled={!remoteControls} aria-label="快退 10 秒">−10 秒</button>
                <button className="btn-primary" onClick={() => remoteControls?.togglePlayback()} disabled={!remoteControls} aria-label="播放或暂停">播放 / 暂停</button>
                <button className="btn-ghost" onClick={() => remoteControls?.seekBy(10)} disabled={!remoteControls} aria-label="快进 10 秒">+10 秒</button>
                <button className="btn-ghost" onClick={() => remoteControls?.toggleFullscreen()} disabled={!remoteControls} aria-label="切换全屏">全屏</button>
              </div>
            </div>
          </div>

          {/* 剧集与线路共用侧栏，展开线路时保留同一检测实例。 */}
          <div className="fd-watch-sidebar">
          <aside className="fd-watch-episodes bg-surface-raised rounded-lg p-3 h-fit">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h2 className="text-sm font-semibold text-content">
                剧集列表{episodes.length > 0 && `（${episodes.length}）`}
              </h2>
              {/* 排列开关紧贴它所作用的列表：放在这里才看得出它管的是这一栏的顺序 */}
              {episodes.length > 1 && (
                <button
                  className="btn-ghost btn-sm shrink-0"
                  onClick={() => setReversed((v) => !v)}
                  aria-label={reversed ? '切换为正序排列' : '切换为倒序排列'}
                  title="调整剧集列表的排列顺序"
                >
                  <Icon
                    name="arrowDown"
                    className={cn('w-3.5 h-3.5 transition-transform', reversed && 'rotate-180')}
                  />
                  {reversed ? '正序排列' : '倒序排列'}
                </button>
              )}
            </div>
            {episodes.length === 0 ? (
              detailQuery.isLoading ? (
                <LoadingState />
              ) : (
                <EmptyState variant="plain" title={detailQuery.isError ? '获取剧集失败' : '暂无剧集信息'} />
              )
            ) : (
              <div className="fd-episode-grid grid grid-cols-5 lg:grid-cols-4 gap-1.5 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
                {orderedEpisodes.map((realIndex) => (
                  <EpisodeButton
                    key={realIndex}
                    index={realIndex}
                    active={realIndex === currentIndex}
                    onClick={() => goEpisode(realIndex)}
                  />
                ))}
              </div>
            )}
            <p className="hidden md:block text-[10px] text-faint mt-3 leading-relaxed">
              快捷键：空格 播放/暂停 · ←/→ 快退/快进 5s · ↑/↓ 音量 · F 全屏 · Alt+←/→ 切换集数
            </p>
          </aside>
          <SwitchSourceModal
            inline={!switchOpen}
            currentTitle={videoTitle}
            currentSourceKey={sourceKey}
            currentVodId={vodId}
            currentIndex={currentIndex}
            onRetryCurrent={() => setRetryKey(v => v + 1)}
            onClose={() => setSwitchOpen(false)}
          />
          </div>
        </div>
        {detailQuery.data?.videoInfo && <section className="fd-watch-info" aria-label="影片信息">
          <p className="fd-watch-eyebrow">ABOUT THE FILM / 影片信息</p>
          <h2>{videoTitle}</h2>
          <p className="fd-watch-meta">{[detailQuery.data.videoInfo.year, detailQuery.data.videoInfo.area, detailQuery.data.videoInfo.typeName, detailQuery.data.videoInfo.remarks].filter(Boolean).join(' · ') || '来源未提供影片分类'}</p>
          <div className="fd-watch-credits">
            {detailQuery.data.videoInfo.director && <p><span>导演</span>{plainText(detailQuery.data.videoInfo.director)}</p>}
            {detailQuery.data.videoInfo.actor && <p><span>主演</span>{plainText(detailQuery.data.videoInfo.actor)}</p>}
          </div>
          <p className="fd-watch-description">{plainText(detailQuery.data.videoInfo.desc || '') || '该来源暂未提供影片简介。'}</p>
          <p className="text-xs text-faint mt-5">影片资料由当前来源提供。</p>
        </section>}

      </main>


    </div>
  );
}

/** 集数按钮：激活时自动滚动进可视区（长剧列表） */
function EpisodeButton({ index, active, onClick }: { index: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <button
      ref={ref}
      className={cn('btn btn-sm !px-1', active ? 'episode-active' : 'btn-ghost')}
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      aria-label={`第 ${index + 1} 集${active ? '，正在播放' : ''}`}
    >
      {index + 1}
    </button>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <button
      className="p-2 -ml-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/');
      }}
      aria-label="返回"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

/** 首页按钮：直达首页，避免从外链进入时逐级 back */
function HomeButton() {
  return (
    <Link
      href="/"
      className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      aria-label="回首页"
      title="回首页"
    >
      <Icon name="home" className="w-5 h-5" />
    </Link>
  );
}

/** 上游简介仅作为文字显示，不执行其标签或脚本。 */
function plainText(value: string) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
