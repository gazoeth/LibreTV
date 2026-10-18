import type { Metadata } from 'next';
import { TvDirectory } from '@/components/tv-directory';

export const metadata: Metadata = { title: '全球电视', description: '按国家与地区浏览公开电视直播频道，搜索频道、收藏和继续观看。' };

export default function TvPage() { return <TvDirectory />; }
