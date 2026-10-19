import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { cmsRequestHeaders, filterAdultResults, filterRelevantResults, normalizeTitle, parseSearchList } from '@/lib/cms-parser';
import { buildCmsUrl } from '@/lib/cms-request';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { searchFailureKind } from '@/lib/search-errors';
import type { SearchResponse, SearchStreamEvent, SourceConfig, SourceSearchOutcome } from '@/lib/types';

export const runtime = 'nodejs';
const SEARCH_CACHE_TTL = 60_000;
const SEARCH_MAX_PAGES = Math.min(50, Math.max(1, Number.parseInt(process.env.SEARCH_MAX_PAGES || '5', 10) || 5));
const SOURCE_TIMEOUT = Math.min(60_000, Math.max(3000, Number.parseInt(process.env.SEARCH_SOURCE_TIMEOUT_MS || '10000', 10) || 10000));

function cacheKey(wd: string, sources: SourceConfig[], filterAdult: boolean) {
  return `search:v2:${JSON.stringify([wd, filterAdult, sources.map(source => [source.key, source.name, source.url, source.isAdult || false]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))])}`;
}

function relevant(list: SourceSearchOutcome['list'], wd: string, adult: boolean) {
  const seen = new Set<string>();
  return filterRelevantResults(filterAdultResults(list, adult), wd).filter(item => {
    const key = JSON.stringify([item.sourceKey, item.vodId]);
    if (!item.vodId || !item.name || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function searchSource(source: SourceConfig, wd: string, filterAdult: boolean, signal: AbortSignal, progress?: (outcome: SourceSearchOutcome) => void): Promise<SourceSearchOutcome> {
  const started = Date.now();
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  let list: SourceSearchOutcome['list'] = [];
  const finish = (patch: Partial<SourceSearchOutcome> = {}): SourceSearchOutcome => ({ sourceKey: source.key, ok: true, list: relevant(list, wd, filterAdult), ms: Date.now() - started, ...patch });
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SourceSearchOutcome>(resolve => {
    deadlineTimer = setTimeout(() => {
      controller.abort(new DOMException('源搜索超时', 'TimeoutError'));
      resolve(finish({ ok: list.length > 0, timedOut: true, error: '来源请求超时', failureKind: 'upstream', partial: list.length > 0 }));
    }, SOURCE_TIMEOUT);
  });
  async function fetchPage(page: number) {
    let lastProtocolError: unknown;
    for (const ac of ['detail', 'videolist']) {
      const response = await fetchUpstream(buildCmsUrl(source.url, { ac, wd, pg: page }), { timeoutMs: 8000, signal: combined, headers: cmsRequestHeaders() });
      if (!response.ok) {
        if (ac === 'detail' && [400, 404, 405, 422].includes(response.status)) { lastProtocolError = new Error(`HTTP ${response.status}`); continue; }
        throw new Error(`HTTP ${response.status}`);
      }
      try {
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('list' in data)) throw new Error('来源未返回影视列表');
        return { data, items: parseSearchList(data, source) };
      } catch (error) {
        if (combined.aborted) throw error;
        lastProtocolError = error;
      }
    }
    throw lastProtocolError instanceof Error ? lastProtocolError : new Error('来源未返回有效 JSON 影视列表');
  }
  const run = async () => {
    try {
      const first = await fetchPage(1);
      list = first.items;
      const rawPages = Number.parseInt(String((first.data as { pagecount?: unknown }).pagecount || 1), 10);
      // 每个 Worker 只负责一个来源，分页顺序读取；Cloudflare 保留子请求余量。
      const pages = Math.min(Number.isFinite(rawPages) ? Math.max(1, rawPages) : 1, SEARCH_MAX_PAGES, process.env.CLOUDFLARE_WORKERS === '1' ? 5 : 50);
      if (pages > 1) progress?.(finish({ partial: true }));
      for (let page = 2; page <= pages; page++) {
        if (combined.aborted) throw combined.reason;
        try { list.push(...(await fetchPage(page)).items); }
        catch (error) {
          if (combined.aborted || searchFailureKind(error) === 'platform') throw error;
          return finish({ partial: true, error: '部分分页读取失败，已保留先到结果' });
        }
        if (page < pages) progress?.(finish({ partial: true }));
      }
      return finish({ partial: rawPages > pages });
    } catch (error) {
      const kind = searchFailureKind(error, signal);
      return finish({ ok: list.length > 0, partial: list.length > 0, failureKind: kind, timedOut: controller.signal.aborted || (error instanceof Error && error.name === 'TimeoutError'), error: kind === 'platform' ? '平台请求预算不足，请重试此来源' : error instanceof Error ? error.message : '来源请求失败' });
    }
  };
  try { return await Promise.race([run(), deadline]); }
  finally { if (deadlineTimer) clearTimeout(deadlineTimer); }
}

function aggregate(outcomes: SourceSearchOutcome[], wd: string, filterAdult: boolean): SearchResponse {
  const exact = normalizeTitle(wd);
  const list = relevant(outcomes.flatMap(outcome => outcome.list), wd, filterAdult);
  list.sort((a, b) => {
    const match = Number(normalizeTitle(b.name) === exact) - Number(normalizeTitle(a.name) === exact);
    return match || a.name.localeCompare(b.name, 'zh-CN') || a.sourceName.localeCompare(b.sourceName, 'zh-CN');
  });
  return { list, outcomes, failures: outcomes.filter(outcome => !outcome.ok).map(outcome => ({ sourceKey: outcome.sourceKey, error: outcome.error || '请求失败', timedOut: outcome.timedOut, failureKind: outcome.failureKind })) };
}

export async function POST(request: Request) {
  const guarded = guardRequest(request); if (guarded) return guarded;
  let body: Record<string, unknown>;
  try { const value: unknown = await request.json(); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown>; }
  catch { return NextResponse.json({ error: '请求格式错误' }, { status: 400 }); }
  const wd = typeof body.wd === 'string' ? body.wd.trim() : '';
  if (!wd || wd.length > 100 || !Array.isArray(body.sources) || !body.sources.length || body.sources.length > 50) return NextResponse.json({ error: '搜索关键词或来源配置无效' }, { status: 400 });
  const sources: SourceConfig[] = [];
  const keys = new Set<string>();
  for (const raw of body.sources) {
    if (!raw || typeof raw !== 'object' || typeof raw.key !== 'string' || !raw.key || raw.key.length > 200 || typeof raw.name !== 'string' || raw.name.length > 200 || typeof raw.url !== 'string' || raw.url.length > 4000 || !/^https?:\/\//.test(raw.url)) return NextResponse.json({ error: '来源配置格式不正确' }, { status: 400 });
    if (!keys.has(raw.key)) { keys.add(raw.key); sources.push({ key: raw.key, name: raw.name, url: raw.url, isAdult: raw.isAdult === true }); }
  }
  // 浏览器逐源调度，避免一次 Worker 承担所有 DNS、分页和重定向子请求。
  if (process.env.CLOUDFLARE_WORKERS === '1' && sources.length > 1) return NextResponse.json({ error: '请刷新页面，按来源独立搜索后重试', code: 'SOURCE_BATCH_REQUIRED' }, { status: 400 });
  const filterAdult = body.filterAdult !== false;
  const key = cacheKey(wd, sources, filterAdult);
  const cached = getCache<SearchResponse>(key);
  const streaming = new URL(request.url).searchParams.get('stream') === '1';
  if (cached && !streaming) return NextResponse.json(cached);
  const consumer = new AbortController();
  const signal = AbortSignal.any([request.signal, consumer.signal]);
  async function execute(emit?: (event: SearchStreamEvent) => void) {
    if (cached) {
      for (const outcome of cached.outcomes || []) emit?.({ type: 'source', ...outcome });
      return cached;
    }
    const outcomes: SourceSearchOutcome[] = [];
    const queue = [...sources];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && !signal.aborted) {
        const source = queue.shift()!;
        const outcome = await searchSource(source, wd, filterAdult, signal, value => { if (!signal.aborted) emit?.({ type: 'source', ...value }); });
        if (signal.aborted) break;
        outcomes.push(outcome); emit?.({ type: 'source', ...outcome });
      }
    }));
    const payload = aggregate(outcomes, wd, filterAdult);
    // 平台错误、超时和截断结果不写短缓存，允许立即恢复重试。
    if (!signal.aborted && outcomes.length === sources.length && outcomes.every(outcome => outcome.ok && !outcome.partial)) setCache(key, payload, SEARCH_CACHE_TTL);
    return payload;
  }
  if (!streaming) return NextResponse.json(await execute());
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(output) {
      let closed = false;
      const send = (event: SearchStreamEvent) => {
        if (closed || signal.aborted) return;
        try { output.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); }
        catch { closed = true; consumer.abort(); }
      };
      try { const payload = await execute(send); send({ type: 'done', list: payload.list, failures: payload.failures }); }
      catch (error) { if (!signal.aborted) output.error(error); }
      finally { closed = true; try { output.close(); } catch { /* 客户端可能已经取消读取。 */ } }
    },
    cancel() { consumer.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
