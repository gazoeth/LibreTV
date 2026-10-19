import type { SourceFailureKind } from './types';

/** 来源、平台和取消的故障归属在产生边界确定，UI 不靠状态文案推算。 */
export function searchFailureKind(error: unknown, signal?: AbortSignal): SourceFailureKind {
  const value = error as { failureKind?: SourceFailureKind; name?: string; message?: string; cause?: { message?: string } } | null;
  if (value?.failureKind) return value.failureKind;
  const text = `${value?.message || String(error)} ${value?.cause?.message || ''}`;
  if (/too many subrequests|平台子请求|worker.*(?:cpu|memory|resource|limit)/i.test(text)) return 'platform';
  if (signal?.aborted && signal.reason?.name !== 'TimeoutError') return 'interrupted';
  if (/DNS|ENOTFOUND|EAI_AGAIN|ENODATA/i.test(text)) return 'dns';
  return 'upstream';
}
