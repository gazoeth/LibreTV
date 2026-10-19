/** 保留源地址自带的鉴权及筛选参数，按键覆盖本次 CMS 请求参数。 */
export function buildCmsUrl(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.href;
}
