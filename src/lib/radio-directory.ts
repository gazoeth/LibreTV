import snapshot from '@/data/radio-directory.json';
export interface RadioStation { id: string; name: string; url: string; country: string; tags: string; codec: string }
export interface RadioRegion { code: string; name: string; count: number }
const names = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
const preferred = ['CN', 'HK', 'TW', 'MO'];
const stations: RadioStation[] = snapshot.stations;
export const radioRegions: RadioRegion[] = [...new Set(stations.map(s => s.country))].map(code => ({ code, name: names.of(code) || code, count: stations.filter(s => s.country === code).length })).sort((a, b) => {
 const ai = preferred.indexOf(a.code), bi = preferred.indexOf(b.code);
 return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name, 'zh-CN');
});
export function getRadioDirectory(country?: string) { return { updatedAt: snapshot.updatedAt, source: snapshot.source, total: stations.length, regions: radioRegions, stations: country ? stations.filter(s => s.country === country) : [] }; }
