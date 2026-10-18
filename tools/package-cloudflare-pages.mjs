import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// 只清理可再生的构建目录，源文件与现有线上部署不受影响。
const output = '.pages-output';
const bundle = '.pages-bundle';
await rm(output, { recursive: true, force: true });
await rm(bundle, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'wrangler.pages-build.jsonc', '--dry-run', '--outdir', bundle], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
await cp('.open-next/assets', output, { recursive: true });
await cp(`${bundle}/pages-entry.js`, `${output}/_worker.js`);
await writeFile(`${output}/_routes.json`, JSON.stringify({ version: 1, include: ['/*'], exclude: ['/_next/static/*', '/icons/*', '/favicon.ico'] }, null, 2));
console.log(`Pages 高级模式产物已生成：${output}`);
