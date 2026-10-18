import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RadioDirectory } from '@/components/radio-directory';
import '../radio.css';
export const metadata: Metadata = { title: '全球广播 · FreeDY', description: '按国家地区发现公开网络电台，收藏、最近收听和一键播放。' };
export default function RadioPage() { return <Suspense fallback={<div className="zip-home min-h-screen" role="status">正在载入广播目录…</div>}><RadioDirectory /></Suspense>; }
