'use client';
import Link from 'next/link';
import { useAuth } from './auth';

/** 导航、服务说明及许可证，在各类页面保持一致。 */
export function SiteFooter() {
  const { version } = useAuth();
  return <footer className="fd-site-footer"><div className="fd-site-footer-top"><Link className="fd-brand-word" href="/">Free<span>DY</span></Link><nav aria-label="页尾导航"><Link href="/films">影视片库</Link><Link href="/tv">看电视</Link><Link href="/radio">听广播</Link><Link href="/about">服务说明</Link><Link href="/about#privacy">隐私与数据</Link><Link href="/about#rights">版权反馈</Link></nav></div><p>FreeDY 提供第三方内容的搜索与播放入口，不托管视频文件。请使用有权访问的内容，并支持正版。</p><small>FreeDY{version ? ` v${version}` : ''} · AGPL-3.0-or-later · Zero wait. Instant play.</small></footer>;
}
