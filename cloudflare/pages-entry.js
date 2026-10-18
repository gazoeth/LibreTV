// Pages 高级模式复用 Next.js 服务端；静态文件由 Pages 内建 ASSETS 提供。
import application from '../.open-next/worker.js';

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/_next/static/') || path.startsWith('/icons/') || path === '/favicon.ico') {
      return env.ASSETS.fetch(request);
    }
    return application.fetch(request, {
      ...env,
      CLOUDFLARE_WORKERS: '1',
      // 未迁入密码时保持拒绝访问，不因发布方式改变保护状态。
      REQUIRE_ACCESS_PASSWORD: '1',
    }, ctx);
  },
};
