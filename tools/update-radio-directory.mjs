/** 更新公开电台目录：只保留目录最近检测正常且使用 HTTPS 的条目，不代表本机实播验证。 */
import { writeFile } from 'node:fs/promises';
const base = 'https://de1.api.radio-browser.info/json/stations/search';
const requests = ['limit=1500', 'countrycode=CN&limit=180', 'countrycode=TW&limit=80', 'countrycode=HK&limit=50'];
const rows = [];
for (const query of requests) {
  const response = await fetch(`${base}?${query}&hidebroken=true&order=votes&reverse=true&is_https=true`, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'FreeDY-radio-directory/1.0' } });
  if (!response.ok) throw new Error(`目录请求失败 ${response.status}`);
  rows.push(...await response.json());
}
const stations = [...new Map(rows.filter(s => s.lastcheckok === 1 && /^https:\/\//i.test(s.url_resolved) && /^[A-Z]{2}$/.test(s.countrycode)).map(s => [s.stationuuid, { id: s.stationuuid, name: s.name.trim(), url: s.url_resolved, country: s.countrycode, tags: s.tags, codec: s.codec }])).values()];
await writeFile(new URL('../src/data/radio-directory.json', import.meta.url), JSON.stringify({ updatedAt: new Date().toISOString(), source: 'https://www.radio-browser.info/', stations }));
console.log(`已更新 ${stations.length} 个电台`);
