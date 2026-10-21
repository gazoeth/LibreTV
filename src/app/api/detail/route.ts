import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { cmsRequestHeaders, parseDetail, parseDetailPageHtml } from '@/lib/cms-parser';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { buildCmsUrl } from '@/lib/cms-request';
import type { SourceConfig, VideoDetail } from '@/lib/types';

export const runtime = 'nodejs';

/** 详情结果短缓存：换源测速/多人观看同一影片时避免重复打上游 */
const DETAIL_CACHE_TTL = 60 * 1000;

function parseSource(raw: string | null): SourceConfig | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as SourceConfig;
    if (!obj || !/^https?:\/\//.test(obj.url || '')) return null;
    return obj;
  } catch {
    return null;
  }
}

/** 视频详情：标准详情协议优先，仅在协议不兼容时尝试旧协议。 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  const source = parseSource(url.searchParams.get('source'));
  const baseUrl = (url.searchParams.get('baseUrl') || '').trim(); // 可选：详情页根地址

  if (!id || !/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: '无效的视频ID' }, { status: 400 });
  }
  if (!source) {
    return NextResponse.json({ error: '无效的点播源配置' }, { status: 400 });
  }

  try {
    // 命中 60s 缓存直接返回（仅缓存成功拿到剧集的结果）
    const detailRootForCache = (source.detail || baseUrl || '').replace(/\/+$/, '');
    const cacheKey = `detail:${source.url}|${detailRootForCache}|${id}`;
    const cached = getCache<VideoDetail>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    let resolved: VideoDetail | null = null;
    const failures: { stage: string; reason: string; status?: number }[] = [];
    const assertActive = () => req.signal.throwIfAborted();

    // 安全请求工具拥有首跳及逐跳校验，避免重复 DNS 查询占用子请求预算。
    for (const action of ['detail', 'videolist']) {
      assertActive();
      const api = buildCmsUrl(source.url, { ac: action, ids: id });
      const res = await fetchUpstream(api, { timeoutMs: 10000, signal: req.signal, headers: cmsRequestHeaders() });
      if (!res.ok) {
        failures.push({ stage: action, reason: `上游返回 HTTP ${res.status}`, status: res.status });
        // 鉴权、限流及服务器故障不属于协议不兼容，重复请求只会加重故障。
        if (![400, 404, 405, 422].includes(res.status)) break;
        continue;
      }
      try {
        const detail = parseDetail(await res.json(), source);
        assertActive();
        if (detail.episodes.length > 0) { resolved = detail; break; }
        failures.push({ stage: action, reason: '详情没有可播放剧集' });
      } catch (err) {
        assertActive();
        failures.push({ stage: action, reason: err instanceof Error ? err.message : '详情格式无效' });
      }
    }

    // 2) 详情页 HTML 提取（detail 地址优先，否则用 API 地址推导）
    const detailRoot = (source.detail || baseUrl || '').replace(/\/+$/, '');
    if (!resolved && detailRoot && /^https?:\/\//.test(detailRoot)) {
      const detailUrl = `${detailRoot}/index.php/vod/detail/id/${id}.html`;
      const detailRes = await fetchUpstream(detailUrl, {
        timeoutMs: 10000,
        signal: req.signal,
        headers: { 'User-Agent': cmsRequestHeaders()['User-Agent'] },
      });
      if (detailRes.ok) {
        const html = await detailRes.text();
        assertActive();
        resolved = parseDetailPageHtml(html, source);
      } else failures.push({ stage: 'html', reason: `详情页返回 HTTP ${detailRes.status}`, status: detailRes.status });
    }

    if (!resolved || resolved.episodes.length === 0) {
      return NextResponse.json({ error: failures[failures.length - 1]?.reason || '未找到播放资源', attempts: failures }, { status: 404 });
    }
    assertActive();
    setCache(cacheKey, resolved, DETAIL_CACHE_TTL);
    return NextResponse.json(resolved);
  } catch (err) {
    if (req.signal.aborted) return NextResponse.json({ error: '请求已取消' }, { status: 499 });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '获取详情失败' },
      { status: 502 }
    );
  }
}
