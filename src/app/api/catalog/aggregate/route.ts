import { guardRequest, jsonError } from '@/lib/api-guard';
import { FILM_SOURCES, getFilmCatalog } from '@/lib/film-catalog';
import { isFilmType } from '@/lib/film-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 每条事件保留独立来源的范围，聚合视图不推算跨源总数或总页数。 */
export async function GET(request: Request) {
  const guarded = guardRequest(request); if (guarded) return guarded;
  const params = new URL(request.url).searchParams;
  const type = params.get('type') || 'movie'; const rawPage = params.get('page') || '1';
  const page = Number(rawPage);
  if (!isFilmType(type) || !/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1 || page > 10000) return jsonError('分类或页码不正确', 400);
  const sources = FILM_SOURCES.slice(0, 10);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener('abort', onAbort, { once: true });
  if (request.signal.aborted) controller.abort();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(output) {
      const send = (value: unknown) => { if (!controller.signal.aborted) output.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); };
      try {
        send({ event: 'start', sources: sources.map(source => ({ key: source.key, name: source.name })), type, page });
        const queue = [...sources];
        await Promise.all(Array.from({ length: 3 }, async () => {
          while (queue.length && !controller.signal.aborted) {
            const source = queue.shift()!; const started = Date.now();
            try {
              const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
              const catalog = await getFilmCatalog(type, source.key, null, page, signal);
              send({ event: 'source', key: source.key, state: catalog.list.length ? 'ok' : 'empty', list: catalog.list, ms: Date.now() - started, pageCount: catalog.pageCount, warnings: catalog.warnings, category: catalog.categories.find(category => category.id === catalog.category)?.name || '' });
            } catch {
              send({ event: 'source', key: source.key, state: 'error', list: [], ms: Date.now() - started });
            }
          }
        }));
        send({ event: 'done' });
      } finally {
        request.signal.removeEventListener('abort', onAbort);
        try { output.close(); } catch { /* 客户端可能已取消读取。 */ }
      }
    },
    cancel() { controller.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
