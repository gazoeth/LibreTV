'use client';

import { useAuth } from '@/components/auth';

/** 仅展示本地版本与许可证，不向上游仓库发起更新请求。 */
export function SiteFooter() {
  const { version } = useAuth();
  return <footer className="border-t border-line py-4"><p className="text-center text-xs text-faint">FreeDY{version ? ` v${version}` : ''} · AGPL-3.0-or-later</p></footer>;
}
