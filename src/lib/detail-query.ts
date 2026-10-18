import type { SourceConfig } from './types';

/** 卡片预热、详情弹窗、播放页和换源共用一份详情缓存。 */
export const DETAIL_STALE_TIME = 5 * 60_000;
export const detailQueryKey = (id: string, source?: SourceConfig | null) =>
  ['detail', source?.key || '', id, source?.url || '', source?.detail || ''] as const;
