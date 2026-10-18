'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DETAIL_STALE_TIME, detailQueryKey } from '@/lib/detail-query';
import { api, type LiveProbeResult } from '@/lib/client-api';
import type { SourceConfig, SearchResultItem, VideoDetail } from '@/lib/types';
import { buildWatchUrl, cn } from '@/lib/utils';
import { useAppStore, resolveSource } from '@/lib/store';
import { useToast } from './toast';
import { Icon } from './icon';
import { EmptyState, LoadingState } from './states';
import { useFocusTrap } from './use-focus-trap';

/**
 * 换源面板：逐源搜索 → 逐条展示剧集 → 有界并发探测媒体分片；健康源不等待慢源。
 * 切换时保留当前集数索引（旧版 switchToResource 逻辑的去 DOM 化重写）。
 */

interface Candidate {
  source: SourceConfig;
  result: SearchResultItem;
  ms?: number;
  ok?: boolean;
  episodes?: number;
  stage: 'loading' | 'probing' | 'done' | 'error';
  probe?: LiveProbeResult;
  error?: string;
}

export function SwitchSourceModal({
  currentTitle,
  currentSourceKey,
  currentVodId,
  currentIndex,
  onClose,
}: {
  currentTitle: string;
  currentSourceKey: string;
  currentVodId: string;
  currentIndex: number;
  onClose: () => void;
}) {
  const store = useAppStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [phase, setPhase] = useState<'searching' | 'testing' | 'done'>('searching');
  const [searched, setSearched] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // 打开时把焦点移入弹窗、Tab 圈闭在弹窗内、关闭后归还焦点
  useFocusTrap(true, panelRef);

  const sources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索/测速与 React key 撞车
    const seen = new Set<string>();
    return store.selectedKeys
      .map((key) => resolveSource(store, key))
      .filter((s): s is SourceConfig => {
        if (!s || seen.has(s.key) || (s.isAdult && store.yellowFilter)) return false;
        seen.add(s.key);
        return true;
      });
  }, [store]);

  useEffect(() => {
    // 弹窗打开期间锁定背景滚动；Esc 关闭（与其它弹窗一致）
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    // 关闭弹窗时中止在途请求：否则 N 个源的搜索 + N 个详情测速会继续占用网络与后端
    const controller = new AbortController();
    let cancelled = false;

    let active = 0;
    let searchFinished = false;
    const queue: Candidate[] = [];
    const accepted = new Set<string>();
    const settled = new Set<string>();
    setCandidates([]);
    setSearched(0);
    setPhase('searching');
    const update = (c: Candidate, patch: Partial<Candidate>) => {
      if (cancelled) return;
      setCandidates(prev => prev.map(row => row.source.key === c.source.key ? { ...row, ...patch } : row));
    };
    const check = async (c: Candidate) => {
      try {
        const start = performance.now();
        const key = detailQueryKey(c.result.vodId, c.source);
        const state = queryClient.getQueryState(key);
        let detail = state && Date.now() - state.dataUpdatedAt < DETAIL_STALE_TIME
          ? queryClient.getQueryData<VideoDetail>(key) : undefined;
        if (!detail) {
          detail = await api.detail(c.result.vodId, c.source, controller.signal);
          if (cancelled) return;
          queryClient.setQueryData(key, detail);
        }
        if (!detail.episodes.length) throw new Error('未找到剧集');
        const target = detail.episodes[Math.min(currentIndex, detail.episodes.length - 1)];
        update(c, { ok: true, episodes: detail.episodes.length, ms: Math.round(performance.now() - start), stage: 'probing' });
        // 使用已有的分片探测协议；详情接口快不代表媒体可以播放。
        const result = await api.liveProbe([target], controller.signal);
        update(c, { probe: result.results[0], stage: 'done' });
      } catch (err) {
        if (!controller.signal.aborted) update(c, { stage: 'error', error: err instanceof Error ? err.message : '检测失败' });
      }
    };
    const pump = () => {
      if (cancelled) return;
      while (active < 4 && queue.length) {
        const c = queue.shift()!;
        active++;
        void check(c).finally(() => { active--; pump(); });
      }
      if (searchFinished && active === 0 && queue.length === 0) setPhase('done');
    };
    const accept = (sourceKey: string, list: SearchResultItem[]) => {
      if (cancelled || accepted.has(sourceKey)) return;
      const source = sources.find(s => s.key === sourceKey);
      if (!source) return;
      const title = currentTitle.trim();
      const match = list.find(r => r.name.trim() === title) || list.find(r => {
        const name = r.name.trim();
        if (!name.startsWith(title)) return false;
        return /^(?:\s|[\[(（【])*(?:HD|BD|4K|1080P|720P|国语|粤语|中字|高清|完整版)(?:[\])）】\s]*)$/i.test(name.slice(title.length));
      });
      if (!match) return;
      accepted.add(sourceKey);
      const candidate: Candidate = { source, result: match, stage: 'loading' };
      setCandidates(prev => [...prev, candidate]);
      queue.push(candidate);
      pump();
    };
    const currentSource = sources.find(s => s.key === currentSourceKey);
    if (currentSource && queryClient.getQueryData(detailQueryKey(currentVodId, currentSource))) {
      accept(currentSource.key, [{ vodId: currentVodId, name: currentTitle, sourceKey: currentSource.key, sourceName: currentSource.name, sourceUrl: currentSource.url }]);
    }
    void api.search(currentTitle, sources, store.yellowFilter, {
      signal: controller.signal,
      onSource: outcome => {
        if (cancelled) return;
        settled.add(outcome.sourceKey);
        setSearched(settled.size);
        accept(outcome.sourceKey, outcome.list);
      },
    }).then(result => {
      if (cancelled) return;
      for (const source of sources) accept(source.key, result.list.filter(r => r.sourceKey === source.key));
      setSearched(sources.length);
    }).catch(err => {
      if (!cancelled && !controller.signal.aborted) toast(err instanceof Error ? err.message : '换源搜索失败', 'error');
    }).finally(() => {
      searchFinished = true;
      if (!cancelled) { setPhase('testing'); pump(); }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTitle, currentIndex, store.yellowFilter]);

  const sorted = [...candidates].sort((a, b) => {
    const aCurrent = a.source.key === currentSourceKey && String(a.result.vodId) === String(currentVodId);
    const bCurrent = b.source.key === currentSourceKey && String(b.result.vodId) === String(currentVodId);
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    // 检测过程中保持位置稳定，避免用户点击时目标卡片移动。
    if (phase !== 'done') return 0;
    const rank = (c: Candidate) => c.probe?.ok && c.probe.level === 'segment' ? 0 : c.ok ? 1 : 2;
    return rank(a) - rank(b) || (a.probe?.ms ?? 99_999) - (b.probe?.ms ?? 99_999);
  });

  const switchTo = (c: Candidate) => {
    if (!c.episodes) {
      toast('该源无可用播放资源', 'warning');
      return;
    }
    const targetIndex = currentIndex < c.episodes ? currentIndex : 0;
    onClose(); // 先关闭面板，避免路由参数变化后弹窗残留旧数据
    router.push(
      buildWatchUrl({
        sourceKey: c.source.key,
        vodId: c.result.vodId,
        index: targetIndex,
        title: c.result.name || currentTitle,
        sourceUrl: c.source.url,
        detail: c.source.detail,
      })
    );
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-black/80 py-10 px-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-surface-raised rounded-xl w-full max-w-3xl shadow-2xl p-5 animate-slide-up outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={`换源：${currentTitle}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-content truncate" title={currentTitle}>
              {currentTitle}
            </h2>
            <p className="text-xs text-faint">
              {phase === 'searching'
                ? `已搜索 ${searched}/${sources.length} 个来源，结果实时显示`
                : phase === 'testing'
                  ? `已搜索 ${searched}/${sources.length} 个来源，正在检测媒体线路…`
                  : `共 ${sorted.length} 个来源 · ${sorted.filter(c => c.probe?.ok && c.probe.level === 'segment').length} 个分片可达`}
            </p>
          </div>
          <button className="p-1.5 rounded-md text-muted hover:text-content hover:bg-hover" onClick={onClose} aria-label="关闭">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-[11px] text-faint mb-4 leading-relaxed" aria-live="polite">结果到达即可选择。分片可达为当前网络探测结果，详情耗时不等于视频加载速度。</p>
        {candidates.length === 0 && phase !== 'done' ? (
          <LoadingState label={phase === 'searching' ? '搜索各资源中...' : '测速中...'} />
        ) : sorted.length === 0 ? (
          <EmptyState variant="plain" title="其他点播源未找到同名资源" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="播放线路检测结果">
            {sorted.map(c => {
              const isCurrent = c.source.key === currentSourceKey && String(c.result.vodId) === String(currentVodId);
              const verified = c.probe?.ok && c.probe.level === 'segment';
              const label = c.stage === 'loading' ? '获取剧集中…' : c.stage === 'probing' ? '检测媒体分片…' : verified ? `分片可达 · ${c.probe?.ms ?? 0}ms` : c.probe?.ok ? '清单可达 · 未验证分片' : c.ok ? '检测未通过 · 可手动尝试' : c.error || '未找到剧集';
              return <button key={`${c.source.key}_${c.result.vodId}`} onClick={() => switchTo(c)} disabled={isCurrent || !c.episodes}
                className={cn('flex items-center gap-3 text-left border rounded-xl p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', isCurrent ? 'border-accent/50 bg-accent/5' : 'border-line bg-card hover:border-accent/60', !c.episodes && 'opacity-60 cursor-wait')}>
                <span className="shrink-0 rounded-lg p-2.5 bg-chip text-accent"><Icon name="link" className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0"><strong className="block text-sm font-medium truncate">{c.source.name}{isCurrent ? ' · 当前' : ''}</strong>
                  <span className={cn('block text-[11px] mt-1', verified ? 'text-success' : c.stage === 'probing' || c.stage === 'loading' ? 'text-accent' : 'text-muted')}>{label}</span>
                  <span className="block text-[10px] text-faint mt-1">{c.episodes ? `${c.episodes} 集 · 详情 ${c.ms ?? 0}ms` : '正在获取可选剧集'}</span>
                </span><span className="text-muted text-sm" aria-hidden="true">{isCurrent ? '✓' : '↗'}</span>
              </button>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
