/**
 * 订阅媒体查询变化，并兼容 iOS 13 及更早版本的 Safari。
 * 旧版 MediaQueryList 通过 addListener/removeListener 提供同等能力。
 */
export function subscribeMediaQueryChange(
  media: MediaQueryList,
  listener: () => void
): () => void {
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }

  media.addListener(listener);
  return () => media.removeListener(listener);
}
