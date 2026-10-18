import snapshot from '@/data/tv-directory.json';
import type { TvDirectoryResponse, TvRegionResponse } from './tv-types';

const names = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
const overrides: Record<string, string> = { CN: '中国', HK: '香港', TW: '台湾', MO: '澳门' };
const priority = ['CN', 'HK', 'TW', 'MO', 'US', 'JP', 'GB', 'KR', 'FR', 'DE', 'CA', 'AU'];
const categories: Record<string, string> = { general: '综合', news: '新闻', entertainment: '娱乐', movies: '电影', series: '剧集', sports: '体育', music: '音乐', kids: '少儿', documentary: '纪录片', culture: '文化', education: '教育', business: '财经', religious: '宗教', lifestyle: '生活', science: '科学', travel: '旅行', weather: '天气', outdoor: '户外', animation: '动画', comedy: '喜剧', cooking: '美食', legislative: '政务', classic: '经典', shop: '购物' };
const counts = new Map<string, number>();
for (const channel of snapshot.channels) counts.set(channel.country, (counts.get(channel.country) || 0) + 1);
const regions = [...counts].map(([code, count]) => ({
  code, count, name: overrides[code] || names.of(code) || code,
  flag: String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0))),
})).sort((a, b) => {
  const x = priority.indexOf(a.code), y = priority.indexOf(b.code);
  return (x < 0 ? 100 : x) - (y < 0 ? 100 : y) || a.name.localeCompare(b.name, 'zh-CN');
});

export function getTvDirectory(): TvDirectoryResponse {
  return { regions, totalChannels: snapshot.channels.length, updatedAt: snapshot.updatedAt, source: snapshot.source };
}

export function getTvRegion(code: string): TvRegionResponse | undefined {
  const region = regions.find(r => r.code === code);
  if (!region) return undefined;
  return {
    region, updatedAt: snapshot.updatedAt,
    channels: snapshot.channels.filter(c => c.country === code).map(c => ({
      id: c.id, tvgId: c.id, name: c.name, url: c.url,
      group: categories[c.category] || '综合',
    })),
  };
}
