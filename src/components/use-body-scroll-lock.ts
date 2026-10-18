'use client';
import { useEffect } from 'react';

const owners = new Set<symbol>();
let originalOverflow = '';

/** 多个抽屉交接或叠加时，最后一个关闭的浮层才恢复背景滚动。 */
export function acquireBodyScrollLock() {
  const owner = Symbol('scroll-lock');
  if (owners.size === 0) originalOverflow = document.body.style.overflow;
  owners.add(owner);
  document.body.style.overflow = 'hidden';
  return () => {
    if (!owners.delete(owner)) return;
    if (owners.size === 0) document.body.style.overflow = originalOverflow;
  };
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireBodyScrollLock();
  }, [active]);
}
