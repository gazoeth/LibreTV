# FreeDY Cloudflare 部署

## 为什么 Pages 显示旧页面

2026-10-18 的 Pages `libretv` 生产部署拉取了 `2220781`，但日志显示 `No build command specified. Skipping build step.`，直接发布根目录旧 HTML 与 `/functions`。新版位于 `src/app`，需要 Next.js 服务端运行环境，发布仓库根目录不会发布新版。

## 新版构建

保留 Next.js 15，使用 OpenNext Cloudflare 适配器，部署至 Workers：

- 安装：`npm ci`
- 构建：`npm run build:cloudflare`
- 部署：`npx opennextjs-cloudflare deploy`
- 本地 Workers 预览：`npm run preview:cloudflare`
- 生产分支：`main`，根目录：仓库根目录。
- Worker 名称：`freedy`，构建入口 `.open-next/worker.js`，资源目录 `.open-next/assets`。

`npm run build`、`npm run dev` 及原有 Docker 部署继续使用 Next.js 原路径。

环境变量和口令必须配置在 Cloudflare，不提交 `.env`、`.dev.vars` 或令牌。`CLOUDFLARE_WORKERS=1` 用于选择 Workers 支持的 DNS 解析方法；`global_fetch_strictly_public` 约束公共出网。鉴权 Cookie、来源和访问口令等配置应从旧项目按需迁入，不能把密码写进公开构建配置。新部署不得因迁移而取消既有访问保护。

## 上线步骤

先在 Worker 预览域名核对首页、影视、电视、广播、关于、搜索与来源接口，再为 `dy.dayiwu.com` 切换路由。保留旧 Pages 部署用于回滚。构建成功、Worker 发布成功和正式域名验证通过是三个独立状态。

## 参考

- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://opennext.js.org/cloudflare/get-started
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/

## 本次适配验证

提交 `20d8eb4`：OpenNext 生产构建及类型／lint 检查完成；Wrangler 打包约 8,643 KiB，gzip 约 1,816 KiB。workerd 本地运行首页、关于、影视及广播目录返回 200，魔都电视剧目录返回 20 条。验证内容接口时仅在本地命令覆盖 `REQUIRE_ACCESS_PASSWORD=0`；正式配置保持 `REQUIRE_ACCESS_PASSWORD=1`，未设置 `PASSWORD` 时目录接口返回 503，状态返回 `verified=false`。

旧 Pages 项目配置了 PASSWORD。正式 Worker 必须先由运营者配置 PASSWORD 密钥再切换域名；不要把密码发到聊天、构建脚本或公开仓库。构建表单会自动创建包含多类账户资源编辑权限的 API 令牌，创建此令牌前须明确确认权限范围；不将代码推送或本地构建成功当作已经上线。
