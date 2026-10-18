import { Suspense } from 'react';
import type { Metadata } from 'next';
import { FilmDirectory } from '@/components/film-directory';
import '../films.css';
export const metadata: Metadata = { title: '影视片库 · FreeDY', description: '按电影、短剧、电视剧、综艺、纪录片、动漫和体育分类浏览点播内容，打开详情后选择剧集播放。' };
export default function FilmsPage() { return <Suspense fallback={<div className="fd-films-shell fd-films-loading">正在打开影视片库…</div>}><FilmDirectory /></Suspense>; }
