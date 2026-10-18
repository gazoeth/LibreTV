import type { SourceConfig } from './types';
import { BUILTIN_VOD_SOURCES } from './builtin-vod-sources';

/**
 * 项目内置的点播源，以及部署者通过 DEFAULT_SOURCES 环境变量追加的采集站。
 * 格式为 JSON 数组：[{"name":"源名","url":"https://.../api.php/provide/vod","detail":"https://...","isAdult":false}]
 * 环境配置解析失败时告警并忽略追加项，内置源仍然可用。
 */
export function getEnvSources(): SourceConfig[] {
  const raw = process.env.DEFAULT_SOURCES;
  if (!raw || !raw.trim()) return [...BUILTIN_VOD_SOURCES];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('必须是 JSON 数组');
    const list: SourceConfig[] = parsed.map((item, i) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`第 ${i + 1} 项不是对象`);
      }
      const { name, url, detail, isAdult, enabledByDefault } = item as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error(`第 ${i + 1} 项缺少 name`);
      }
      if (typeof url !== 'string' || !/^https?:\/\//.test(url.trim())) {
        throw new Error(`第 ${i + 1} 项的 url 必须以 http:// 或 https:// 开头`);
      }
      return {
        key: `env_${i}`,
        name: name.trim(),
        url: url.trim().replace(/\/+$/, ''),
        detail: typeof detail === 'string' && detail.trim() ? detail.trim() : undefined,
        isAdult: isAdult === true,
        enabledByDefault: enabledByDefault === false ? false : undefined,
      };
    });
    const seen = new Set<string>();
    return [...BUILTIN_VOD_SOURCES, ...list].filter((source) => {
      const normalizedUrl = source.url.replace(/\/+$/, '');
      if (seen.has(normalizedUrl)) return false;
      seen.add(normalizedUrl);
      return true;
    });
  } catch (err) {
    console.warn('[LibreTV] DEFAULT_SOURCES 解析失败，已忽略：', err instanceof Error ? err.message : err);
    return [...BUILTIN_VOD_SOURCES];
  }
}
