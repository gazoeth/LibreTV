'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[role="button"],[tabindex]:not([tabindex="-1"])';

function isVisible(element: HTMLElement): boolean {
  if (element.closest('[aria-hidden="true"], [inert]')) return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) !== 0 &&
    element.getClientRects().length > 0
  );
}

function ownsDirectionalInput(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      'input,textarea,select,[contenteditable="true"],[role="slider"],input[type="range"],video,audio,[data-tv-native-keys]'
    )
  );
}

/** 给电视遥控器提供空间焦点移动；触屏、鼠标和桌面键盘行为保持浏览器默认。 */
export function TvExperience() {
  const pathname = usePathname();

  useEffect(() => {
    if (document.documentElement.dataset.fdTv !== 'true') return;

    let initialFocusObserver: MutationObserver | undefined;
    let initialFocusTimer: number | undefined;
    if (new URLSearchParams(window.location.search).get('focus') !== 'search') {
      const focusFeatured = () => {
        const initialTarget = pathname === '/watch'
          ? document.querySelector<HTMLElement>('[data-tv-player-surface]')
          : document.querySelector<HTMLElement>(
            '#recommendations button[aria-pressed="true"], #recommendations input:checked, #recommendations [role="checkbox"][aria-checked="true"], #recommendations button:not(:disabled), #recommendations a[href], #recent-updates .fd-home-poster'
          );
        if (!initialTarget) return false;
        initialTarget.focus({ preventScroll: true });
        return true;
      };
      if (!focusFeatured()) {
        initialFocusObserver = new MutationObserver(() => {
          if (focusFeatured()) initialFocusObserver?.disconnect();
        });
        initialFocusObserver.observe(document.body, { childList: true, subtree: true });
      }
      initialFocusTimer = window.setTimeout(focusFeatured, 120);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const deltaByKey: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const direction = deltaByKey[event.key];
      if (!direction || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;

      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inPlayer = Boolean(active?.closest('.artplayer,.art-video-player'));
      const onPlayerSurface = Boolean(active?.matches('[data-tv-player-surface]'));
      const isPlayerSlider = Boolean(active?.closest('[role="slider"],input[type="range"]'));
      const canLeavePlayerVertically = inPlayer && !isPlayerSlider && (event.key === 'ArrowUp' || event.key === 'ArrowDown');
      const horizontalSeek = onPlayerSurface && (event.key === 'ArrowLeft' || event.key === 'ArrowRight');
      if (active && ((ownsDirectionalInput(active) && !canLeavePlayerVertically) || horizontalSeek)) return;

      const candidates = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.matches(':disabled,[aria-disabled="true"]') && isVisible(element));
      if (candidates.length === 0) return;

      if (!active || active === document.body || active === document.documentElement) {
        event.preventDefault();
        event.stopPropagation();
        const firstTarget = (pathname === '/watch'
          ? document.querySelector<HTMLElement>('[data-tv-player-surface]')
          : document.querySelector<HTMLElement>(
            '#recommendations button[aria-pressed="true"], #recommendations input:checked, #recommendations [role="checkbox"][aria-checked="true"]'
          )) ?? candidates[0];
        firstTarget.focus({ preventScroll: true });
        firstTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        return;
      }

      const currentRect = active.getBoundingClientRect();
      const currentX = currentRect.left + currentRect.width / 2;
      const currentY = currentRect.top + currentRect.height / 2;
      const [dx, dy] = direction;
      let next: HTMLElement | undefined;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        if (candidate === active || candidate.contains(active)) continue;
        const rect = candidate.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const primary = dx ? (x - currentX) * dx : (y - currentY) * dy;
        if (primary <= 2) continue;
        const secondary = dx ? Math.abs(y - currentY) : Math.abs(x - currentX);
        const score = primary + secondary * 1.7 + secondary * secondary / Math.max(primary, 1) * 0.08;
        if (score < bestScore) {
          bestScore = score;
          next = candidate;
        }
      }

      event.preventDefault();
      event.stopPropagation();
      if (next) {
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      } else {
        window.scrollBy({
          top: dy * Math.max(220, Math.floor(window.innerHeight * 0.62)),
          left: dx * Math.max(220, Math.floor(window.innerWidth * 0.62)),
          behavior: 'smooth',
        });
      }
    };

    const syncSearchMode = () => {
      const searchMode = new URLSearchParams(window.location.search).get('focus') === 'search';
      if (searchMode) document.documentElement.setAttribute('data-fd-tv-search', 'true');
      else document.documentElement.removeAttribute('data-fd-tv-search');
    };

    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('popstate', syncSearchMode);
    return () => {
      initialFocusObserver?.disconnect();
      if (initialFocusTimer !== undefined) window.clearTimeout(initialFocusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('popstate', syncSearchMode);
    };
  }, [pathname]);

  return null;
}
