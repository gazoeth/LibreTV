import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// 当前接口使用显式短期缓存，不创建额外收费的持久缓存资源。
export default defineCloudflareConfig();
