import type { SearchResultItem } from './types';

export const FILM_TYPES = [
  { key: 'movie', name: '电影', caption: '一个故事，一段新世界。' },
  { key: 'short', name: '短剧', caption: '短小篇幅，也有精彩起伏。' },
  { key: 'tv', name: '电视剧', caption: '好故事，值得慢慢追。' },
  { key: 'variety', name: '综艺', caption: '把轻松时刻留给自己。' },
  { key: 'documentary', name: '纪录片', caption: '真实世界，比想象更辽阔。' },
  { key: 'anime', name: '动漫', caption: '跨入想象，发现另一种可能。' },
  { key: 'sports', name: '体育', caption: '重温赛场上的每个高光。' },
] as const;
export type FilmType = typeof FILM_TYPES[number]['key'];
export interface FilmCategory { id: string; name: string; parent: string }
export interface FilmCatalog {
  source: { key: string; name: string }; sources: { key: string; name: string }[];
  categories: { id: string; name: string }[]; category: string; type: FilmType;
  page: number; pageCount: number; total: number; list: SearchResultItem[];
  ms: number; warnings: string[];
}
export function isFilmType(value: string): value is FilmType { return FILM_TYPES.some(t => t.key === value); }
