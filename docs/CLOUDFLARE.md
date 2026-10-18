# FreeDY Cloudflare Pages 部署

## 当前生产路径

继续使用原 `gazoeth/LibreTV` 仓库和 `libretv` Pages 项目，生产分支 `main`。保留现有自定义域名；站点按运营者要求公开访问，不设 PASSWORD。

- 构建命令：`npm run build:pages`
- 输出目录：`.pages-output`
- 根目录：仓库根目录
- 生产运行配置：Cloudflare Pages 后台；`wrangler.pages.jsonc` 仅用于显式本地预览，不作为根目录自动配置

构建先通过 OpenNext 生成 Next.js 服务端，然后由 `tools/package-cloudflare-pages.mjs` 编译 Pages 高级模式 `_worker.js` 并复制静态资源。`cloudflare/pages-entry.js` 仅导出请求处理函数，静态 JS／图标走内建 ASSETS，其他页面及 API 交给 Next.js。原根目录旧 HTML 与 `/functions` 不参与此次输出。

这是项目自行实现的 Pages 打包适配，基于 Cloudflare 公开的高级模式协议；不宣称是 OpenNext 官方 Pages 适配器。当前无持久 ISR 缓存、Durable Objects、图片优化或服务自绑定需求；若新增这些能力，需重新验证 Pages 支持范围。

## 访问保护与回滚

站点按运营者要求公开访问；Pages 入口明确将 PASSWORD 置空并设置 REQUIRE_ACCESS_PASSWORD=0，因此无需登录。请勿新增根目录 wrangler.jsonc 接管后台环境配置。设置 `CLOUDFLARE_WORKERS=1` 选用 Workers 支持的 DNS 解析；公共出网限制继续启用。

当前生产部署可在 Pages 历史中回滚，原始旧版代码保存在 `backup/pre-freedy-20261018`。恢复旧版构建时需同时恢复其空构建命令和根目录发布配置。

## 本地复现

```sh
npm ci
npm run build:pages
npm run preview:pages
```

本地 smoke 核验使用临时口令，正式口令不进入聊天或测试文件。页面、真实 JS 资源、登录、广播、电视和魔都电视剧目录已在 Pages 本地运行环境检查，接口返回 200，魔都目录返回 20 条。

原 `npm run build`、Docker 和本地 Next.js 路径保持可用。另保留 `wrangler.worker.jsonc` 用于独立 Worker 打包，但原 Pages 项目发布不依赖 Workers Builds 或新建 Worker。

## 原因记录

旧 Pages 部署 `2220781` 日志显示 `No build command specified. Skipping build step.`，直接发布仓库根目录，因而看不到 `src/app` 中的新版。

## 官方资料

- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- https://opennext.js.org/cloudflare/get-started
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/
