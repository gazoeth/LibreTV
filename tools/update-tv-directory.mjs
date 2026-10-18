import fs from 'node:fs/promises';
import path from 'node:path';

// 从公开目录生成可复现的频道快照；频道收录不等于播放可用性验证。
const input = process.argv.indexOf('--input-dir');
const inputDir = input >= 0 ? process.argv[input + 1] : null;
async function load(name) {
  if (inputDir) return JSON.parse(await fs.readFile(path.join(inputDir, `${name}.json`), 'utf8'));
  const res = await fetch(`https://iptv-org.github.io/api/${name}.json`, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 25_000_000) throw new Error(`${name}: 目录超过大小限制`);
  return JSON.parse(text);
}
const [streams, channels] = await Promise.all(['streams', 'channels'].map(load));
if (!Array.isArray(streams) || !Array.isArray(channels) || channels.length < 1000) throw new Error('目录格式或覆盖范围异常，保留旧快照');
const metadata = new Map(channels.filter(c => typeof c.id === 'string' && typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 200 && c.is_nsfw === false && !c.closed && /^[A-Z]{2}$/.test(c.country)).map(c => [c.id, c]));
const candidates = new Map();
for (const stream of streams) {
  const channel = metadata.get(stream.channel);
  if (!channel || stream.user_agent || stream.referrer || typeof stream.url !== 'string' || stream.url.length > 4096) continue;
  let url;
  try { url = new URL(stream.url); } catch { continue; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !/\.(m3u8|flv)(?:[?#]|$)/i.test(url.href)) continue;
  let officialHost = '';
  try { officialHost = new URL(channel.website).hostname.replace(/^www\./, ''); } catch { /* 没有官方网站时不作域名优先判断 */ }
  const official = officialHost && (url.hostname === officialHost || url.hostname.endsWith(`.${officialHost}`));
  const score = (official ? 100000 : 0) + (url.protocol === 'https:' ? 10000 : 0) + (parseInt(stream.quality, 10) || 0);
  const baseName = ['CN', 'HK', 'TW', 'MO'].includes(channel.country) ? channel.alt_names?.find(n => typeof n === 'string' && /[\u3400-\u9fff]/.test(n)) || channel.name : channel.name;
  const feed = typeof stream.feed === 'string' && !/^(HD|SD|UHD|FHD|4K)$/i.test(stream.feed) ? stream.feed : '';
  const previous = candidates.get(channel.id);
  if (!previous || score > previous.score) candidates.set(channel.id, { score, channel: { id: channel.id, name: feed ? `${baseName} · ${feed}` : baseName, country: channel.country, category: channel.categories?.[0] || 'general', url: url.href } });
}
const data = [...candidates.values()].map(c => c.channel).sort((a, b) => a.country.localeCompare(b.country) || (a.id.startsWith('CCTV') ? 0 : a.id.startsWith('CGTN') ? 1 : 2) - (b.id.startsWith('CCTV') ? 0 : b.id.startsWith('CGTN') ? 1 : 2) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
if (data.length < 1000) throw new Error('有效条目过少，保留旧快照');
const snapshot = { updatedAt: new Date().toISOString(), source: 'https://github.com/iptv-org/iptv', channels: data };
const destination = path.resolve('src/data/tv-directory.json');
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(`${destination}.tmp`, JSON.stringify(snapshot));
await fs.rename(`${destination}.tmp`, destination);
console.log(JSON.stringify({ channels: data.length, regions: new Set(data.map(c => c.country)).size, updatedAt: snapshot.updatedAt }));
