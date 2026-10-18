import type { LiveSourceConfig } from './types';
import { BUILTIN_LIVE_SOURCE_URL } from './builtin-live';

const BUILTIN_LIVE_SOURCES: LiveSourceConfig[] = [
  { key: 'builtin_public_channels', name: 'FreeDY 国际公开频道', url: BUILTIN_LIVE_SOURCE_URL },
];

/**
 * 始终返回内置国际公开频道，并追加部署者通过 DEFAULT_LIVE_SOURCES 配置的 M3U 订阅。
 * 环境变量格式为 JSON 数组：[{"name":"源名","url":"https://.../list.m3u","epg":"https://.../epg.xml.gz"}]。
 * 环境配置解析失败时告警并忽略该配置，不影响内置频道。模式与 env-sources.ts 对齐。
 */
export function getEnvLiveSources(): LiveSourceConfig[] {
  const raw = process.env.DEFAULT_LIVE_SOURCES;
  if (!raw || !raw.trim()) return BUILTIN_LIVE_SOURCES;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('必须是 JSON 数组');
    const list: LiveSourceConfig[] = parsed.map((item, i) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`第 ${i + 1} 项不是对象`);
      }
      const { name, url, epg } = item as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`第 ${i + 1} 项缺少 name`);
      }
      if (typeof url !== 'string' || !/^https?:\/\//.test(url.trim())) {
        throw new Error(`第 ${i + 1} 项的 url 必须以 http:// 或 https:// 开头`);
      }
      return {
        key: `envlive_${i}`,
        name: name.trim(),
        url: url.trim().replace(/\/+$/, ''),
        epg: typeof epg === 'string' && epg.trim() ? epg.trim() : undefined,
      };
    });
    return [...BUILTIN_LIVE_SOURCES, ...list];
  } catch (err) {
    console.warn('[LibreTV] DEFAULT_LIVE_SOURCES 解析失败，已忽略：', err instanceof Error ? err.message : err);
    return BUILTIN_LIVE_SOURCES;
  }
}
