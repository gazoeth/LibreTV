'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { DETAIL_STALE_TIME, detailQueryKey } from '@/lib/detail-query';
import { resolveSource, useAppStore } from '@/lib/store';
import type { SearchResultItem } from '@/lib/types';

let inFlight = 0;

/** 用户停留或键盘聚焦时才预热，限制并发，避免扫描卡片打满上游。 */
export function useDetailPrefetch(item: SearchResultItem) {
  const client = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  const warm = () => {
    cancel();
    if (inFlight >= 2) return;
    const store = useAppStore.getState();
    if (item.isAdult && store.yellowFilter) return;
    const source = resolveSource(store, item.sourceKey, { url: item.sourceUrl, name: item.sourceName });
    if (!source) return;
    const key = detailQueryKey(item.vodId, source);
    if (client.getQueryState(key)?.fetchStatus === 'fetching') return;
    inFlight++;
    void client.prefetchQuery({ queryKey: key, queryFn: ({ signal }) => api.detail(item.vodId, source, signal), staleTime: DETAIL_STALE_TIME, retry: false }).finally(() => { inFlight--; });
  };
  return {
    onPointerEnter: () => { cancel(); timer.current = setTimeout(warm, 150); },
    onPointerLeave: cancel,
    onFocus: warm,
    onBlur: cancel,
  };
}
