import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { SESSION_COOKIE, signSession } from '@/lib/auth';

/**
 * 聚合搜索接口单测：跨源聚合、同源去重、精确命中置顶、成人内容过滤、
 * 失败源不影响整体、SSRF 字面量拒绝。上游一律 mock fetch，无真实网络。
 */

function cmsList(items: Array<Record<string, unknown>>, pagecount = 1): string {
  return JSON.stringify({ code: 1, pagecount, list: items });
}

/** 按 URL 分发的上游 mock：cms-a 正常、cms-b 500、cms-c 与 a 有重叠条目 */
function mockUpstream(): void {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('cms-a.example')) {
      return new Response(
        cmsList([
          { vod_id: 1, vod_name: '测试剧', type_name: '国产剧' },
          { vod_id: 2, vod_name: '测试剧外传', type_name: '国产剧' },
          { vod_id: 3, vod_name: '福利速递', type_name: '福利视频' },
          // 同源同 vod_id 的重复条目：聚合时须按 sourceKey_vodId 去重
          { vod_id: 1, vod_name: '测试剧', type_name: '国产剧' },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url.includes('cms-b.example')) {
      return new Response('server error', { status: 500 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
}

function makeRequest(body: unknown, stream = false, signal?: AbortSignal): Request {
  const { token } = signSession();
  return new Request(`https://local.test/api/search${stream ? '?stream=1' : ''}`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      cookie: `${SESSION_COOKIE}=${token}`,
    },
    body: JSON.stringify(body),
  });
}

const SOURCES = [
  { key: 'a', name: '源A', url: 'https://cms-a.example.com/api.php' },
  { key: 'b', name: '源B', url: 'https://cms-b.example.com/api.php' },
];

beforeAll(() => {
  process.env.PASSWORD = 'test-password-123';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/search', () => {
  it('聚合多源结果：同源去重、成人内容过滤、失败源进 failures', async () => {
    mockUpstream();
    const res = await POST(makeRequest({ wd: '测试剧', sources: SOURCES, filterAdult: true }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      list: Array<{ sourceKey: string; vodId: string; name: string }>;
      failures: Array<{ sourceKey: string; error: string }>;
    };

    // 源A 的 4 条 → 去重后 2 条有效 + 成人条目被过滤
    const aItems = data.list.filter((i) => i.sourceKey === 'a');
    expect(aItems).toHaveLength(2);
    expect(aItems.map((i) => i.vodId).sort()).toEqual(['1', '2']);

    // 源B 500 → 记入 failures，不影响源A 的结果
    expect(data.failures).toHaveLength(1);
    expect(data.failures[0].sourceKey).toBe('b');
    expect(data.failures[0].error).toContain('500');
  });

  it('精确命中（忽略标点差异）排在最前', async () => {
    mockUpstream();
    const res = await POST(makeRequest({ wd: '测试剧', sources: [SOURCES[0]], filterAdult: true }));
    const data = (await res.json()) as { list: Array<{ name: string }> };
    expect(data.list[0]?.name).toBe('测试剧');
  });

  it('内网字面量地址在发起请求前被 SSRF 校验拒绝', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(
      makeRequest({
        wd: 'x',
        sources: [{ key: 'evil', name: '内网', url: 'http://192.168.1.100/api.php' }],
        filterAdult: false,
      })
    );
    const data = (await res.json()) as { failures: Array<{ sourceKey: string; error: string }> };
    expect(data.failures[0]?.sourceKey).toBe('evil');
    // 上游一次请求都不应发生
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stream=1 以 NDJSON 逐源推送并以 done 事件收尾', async () => {
    mockUpstream();
    // 用不同关键词避开同键短缓存（缓存命中时只推 done 事件，见 route.ts 缓存分支）
    const res = await POST(makeRequest({ wd: '流式检测关键词', sources: SOURCES, filterAdult: true }, true));
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { type: string; sourceKey?: string });
    const sources = lines.filter((l) => l.type === 'source');
    const done = lines.filter((l) => l.type === 'done');
    // 每个源恰好一条 source 事件（含失败的源B），最后一条是 done
    expect(sources.map((l) => l.sourceKey).sort()).toEqual(['a', 'b']);
    expect(done).toHaveLength(1);
    expect(lines[lines.length - 1].type).toBe('done');
  });

  it.each([
    { mode: '请求 signal 中止', stream: false },
    { mode: 'NDJSON 消费者取消', stream: true },
  ])('$mode 会取消上游，且不会缓存取消产生的失败结果', async ({ stream }) => {
    const wd = stream ? '消费者取消回归关键词' : '请求中止回归关键词';
    const requestController = new AbortController();
    let upstreamSignal: AbortSignal | null = null;
    let announceStarted!: () => void;
    let announceAborted!: () => void;
    const started = new Promise<void>((resolve) => { announceStarted = resolve; });
    const aborted = new Promise<void>((resolve) => { announceAborted = resolve; });
    const fetchSpy = vi.fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? null;
        announceStarted();
        return new Promise<Response>((_resolve, reject) => {
          const onAbort = () => {
            announceAborted();
            reject(upstreamSignal?.reason ?? new DOMException('已中止', 'AbortError'));
          };
          if (upstreamSignal?.aborted) onAbort();
          else upstreamSignal?.addEventListener('abort', onAbort, { once: true });
        });
      })
      .mockResolvedValueOnce(new Response(cmsList([{ vod_id: 801, vod_name: wd, type_name: '国产剧' }]), {
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchSpy);
    const body = { wd, sources: [SOURCES[0]], filterAdult: true };
    const firstResponse = POST(makeRequest(body, stream, requestController.signal));
    await started;

    if (stream) {
      const response = await firstResponse;
      expect(response.headers.get('Content-Type')).toContain('application/x-ndjson');
      await response.body!.cancel();
    } else {
      requestController.abort();
      await firstResponse;
    }
    await aborted;
    expect(upstreamSignal).not.toBeNull();
    expect(upstreamSignal).toHaveProperty('aborted', true);

    // 同一关键词和来源再次请求必须访问上游，不能命中取消时的空结果缓存。
    const nextResponse = await POST(makeRequest(body));
    const next = await nextResponse.json() as { list: Array<{ vodId: string; name: string }>; failures: unknown[] };
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(next.list).toEqual([expect.objectContaining({ vodId: '801', name: wd })]);
    expect(next.failures).toEqual([]);
  });

  it('未配置密码时允许访问；配置访问密码后要求有效会话', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const saved = process.env.PASSWORD;
    delete process.env.PASSWORD;
    try {
      const noPassword = await POST(makeRequest({ wd: 'x', sources: SOURCES }));
      expect(noPassword.status).toBe(200);
    } finally {
      process.env.PASSWORD = saved;
    }
    const noCookie = new Request('https://local.test/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wd: 'x', sources: SOURCES }),
    });
    const unauthorized = await POST(noCookie);
    expect(unauthorized.status).toBe(401);
  });
});
