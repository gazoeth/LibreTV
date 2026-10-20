'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { buildWatchUrl, cn } from '@/lib/utils';
import type { DoubanItem, SearchResultItem } from '@/lib/types';
import type { HomeCatalog } from '@/lib/film-types';
import { DoubanCard } from './video-card';
import { SmartImage } from './smart-image';
import { useDetailPrefetch } from './use-detail-prefetch';

const MOVIE_TAGS = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动画'];
const TV_TAGS = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 首页推荐区：数据源由设置决定（豆瓣热门 / Bangumi 新番放送 / 影视热榜），二选一展示 */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const recommendSource = useAppStore((s) => s.recommendSource);

  if (!doubanEnabled) return null;
  if (recommendSource === 'bangumi') return <BangumiView onPick={onPick} />;
  if (recommendSource === 'hot-list') return <HotListView onPick={onPick} />;
  return <DoubanView onPick={onPick} />;
}

/**
 * 豆瓣推荐：影视切换 + 标签筛选。
 * 一次性渲染全部条目：数据本就一次拉全（50 条），卡片图片又是 lazy 加载，
 * 视口外的图不会请求，因此不需要「加载更多」这类本地切片分页来打断浏览。
 */
function DoubanView({ onPick }: { onPick: (title: string) => void }) {
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [tag, setTag] = useState('热门');

  const query = useQuery({
    queryKey: ['douban', type, tag],
    queryFn: ({ signal }) => api.douban(type, tag, 0, 50, signal),
  });

  const tags = type === 'movie' ? MOVIE_TAGS : TV_TAGS;
  const items = query.data?.items ?? [];

  const switchType = (t: 'movie' | 'tv') => {
    if (t === type) return;
    setType(t);
    setTag('热门');
  };

  return (
    <section aria-label="影视推荐">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex bg-chip rounded-lg p-0.5">
            <TypeButton active={type === 'movie'} onClick={() => switchType('movie')}>
              电影
            </TypeButton>
            <TypeButton active={type === 'tv'} onClick={() => switchType('tv')}>
              剧集
            </TypeButton>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {tags.map((t) => (
          <button
            key={t}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs transition-colors',
              t === tag ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
            )}
            onClick={() => setTag(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {query.isError ? (
        <p className="text-center text-sm text-faint py-8">推荐内容加载失败，可稍后重试或在设置中关闭</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-faint py-8">该分类暂无推荐内容</p>
      ) : (
        <div className="zip-recommend-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Bangumi 每日放送：星期筛选，一次拉全量无分页 */
function BangumiView({ onPick }: { onPick: (title: string) => void }) {
  const [weekday, setWeekday] = useState<number | 'all'>('all');

  const query = useQuery({
    queryKey: ['bangumi-calendar'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
  });

  let items: DoubanItem[] = [];
  if (query.data) {
    items = weekday === 'all'
      ? query.data.days.flatMap((d) => d.items)
      : (query.data.days.find((d) => d.weekday === weekday)?.items ?? []);
  }

  return (
    <section aria-label="新番放送推荐">
      <div className="flex flex-wrap gap-1.5 mb-4">
        <ChipButton active={weekday === 'all'} onClick={() => setWeekday('all')}>
          全部
        </ChipButton>
        {WEEKDAYS.map((name, i) => (
          <ChipButton key={name} active={weekday === i + 1} onClick={() => setWeekday(i + 1)}>
            {name}
          </ChipButton>
        ))}
      </div>

      {query.isError ? (
        <p className="text-center text-sm text-faint py-8">推荐内容加载失败，可稍后重试或在设置中关闭</p>
      ) : query.isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="zip-recommend-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

const HOT_LISTS = [
  { id: 'home_western_series', label: '欧美剧' },
  { id: 'douban_movie_weekly', label: '电影周榜' },
  { id: 'douban_tv_chinese', label: '国产剧周榜' },
  { id: 'douban_tv_global', label: '海外剧周榜' },
  { id: 'douban_show_chinese', label: '国内综艺' },
  { id: 'douban_show_global', label: '海外综艺' },
  { id: 'baidu_teleplay', label: '百度热播剧' },
];

/** 首页榜单切换：欧美剧使用可播放片库，其余榜单由 60s API 提供。 */
function HotListView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(HOT_LISTS[0].id);
  const westernSeries = listId === 'home_western_series';

  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
    enabled: !westernSeries,
  });
  const westernQuery = useQuery<HomeCatalog>({
    queryKey: ['home-catalog', 'western-series'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/home-catalog?kind=western-series', { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '欧美剧推荐读取失败');
      return data as HomeCatalog;
    },
    enabled: westernSeries, staleTime: 120_000, retry: false,
  });

  const items = query.data?.items ?? [];
  const catalogItems = westernQuery.data?.list ?? [];
  const isError = westernSeries ? westernQuery.isError : query.isError;
  const isLoading = westernSeries ? westernQuery.isLoading : query.isLoading;

  return (
    <section aria-label="影视榜单推荐">
      <div className="flex flex-wrap gap-1.5 mb-4">
        {HOT_LISTS.map((l) => (
          <ChipButton key={l.id} active={listId === l.id} onClick={() => setListId(l.id)}>
            {l.label}
          </ChipButton>
        ))}
      </div>

      {isError ? (
        <div className="flex flex-wrap items-center justify-center gap-3 py-8 text-sm text-faint"><p>推荐内容加载失败。</p><button className="text-accent underline underline-offset-4" onClick={() => void (westernSeries ? westernQuery.refetch() : query.refetch())}>重新加载</button></div>
      ) : isLoading ? (
        <GridSkeleton />
      ) : westernSeries ? (
        catalogItems.length ? <div className="zip-recommend-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {catalogItems.map(item => <CatalogRecommendCard key={`${item.sourceKey}:${item.vodId}`} item={item} />)}
        </div> : <p className="text-center text-sm text-faint py-8">暂时没有可展示的欧美剧</p>
      ) : (
        <div className="zip-recommend-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {items.map((item) => (
            <DoubanCard key={item.id} item={item} onClick={() => onPick(item.title)} />
          ))}
        </div>
      )}
    </section>
  );
}

function CatalogRecommendCard({ item }: { item: SearchResultItem }) {
  const imageProxyMode = useAppStore(s => s.imageProxyMode);
  const customImageProxy = useAppStore(s => s.customImageProxy);
  const warmup = useDetailPrefetch(item);
  return <Link
    className="card cursor-pointer hover:scale-[1.03] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    href={buildWatchUrl({ sourceKey: item.sourceKey, sourceUrl: item.sourceUrl, vodId: item.vodId, title: item.name, index: 0 })}
    aria-label={`播放 ${item.name}`}
    {...warmup}
  >
    <div className="poster-frame bg-chip">
      <span className="absolute inset-0 flex items-center justify-center text-faint font-bold" aria-hidden="true">Free<span className="text-accent">DY</span></span>
      <SmartImage url={item.pic} mode={imageProxyMode} customProxy={customImageProxy} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
      {item.remarks && <span className="absolute right-1.5 bottom-1.5 tag bg-black/70 text-white">{item.remarks}</span>}
    </div>
    <div className="p-2">
      <div className="text-xs font-medium text-content truncate" title={item.name}>{item.name}</div>
      <small className="mt-1 block truncate text-faint">{[item.year, item.typeName].filter(Boolean).join(' · ')}</small>
    </div>
  </Link>;
}

function GridSkeleton() {
  return (
    <div className="zip-recommend-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i}>
          <div className="poster-frame rounded-lg bg-chip animate-pulse" />
          <div className="h-3 mt-2 rounded bg-chip animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn(
        'px-2.5 py-1 rounded-full text-xs transition-colors',
        active ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content hover:bg-hover'
      )}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TypeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn('px-3.5 py-1.5 rounded-md text-sm transition-colors', active ? 'bg-accent text-on-accent' : 'text-muted hover:text-content')}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
