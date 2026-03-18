// ── search.js（优化版）────────────────────────────────────────────────────────
// 核心改进：
//  1. 预热鉴权前缀：复用 ProxyAuth.getAuthPrefix()，同一搜索只 await 一次
//  2. 超时从 15s 收紧至 10s，减少慢 API 的等待
//  3. 分页请求复用已缓存前缀，无额外 await
//  4. Promise.allSettled 保证单页失败不影响其他页

async function searchByAPIAndKeyWord(apiId, query) {
    try {
        let apiName, apiBaseUrl;

        if (apiId.startsWith('custom_')) {
            const customApi = getCustomApiInfo(apiId.replace('custom_', ''));
            if (!customApi) return [];
            apiBaseUrl = customApi.url;
            apiName    = customApi.name;
        } else {
            if (!API_SITES[apiId]) return [];
            apiBaseUrl = API_SITES[apiId].api;
            apiName    = API_SITES[apiId].name;
        }

        // ── 优化1：预取鉴权前缀（已缓存则同步，首次才 await 一次）──────────
        const authSuffix = window.ProxyAuth?.getAuthPrefix
            ? await window.ProxyAuth.getAuthPrefix()
            : null;

        // 构造代理 URL 的辅助函数（复用已拿到的 authSuffix）
        async function proxyUrl(rawUrl) {
            if (authSuffix !== null) {
                return PROXY_URL + encodeURIComponent(rawUrl) + authSuffix;
            }
            return window.ProxyAuth?.addAuthToProxyUrl
                ? await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(rawUrl))
                : PROXY_URL + encodeURIComponent(rawUrl);
        }

        // ── 第一页 ───────────────────────────────────────────────────────────
        const apiUrl     = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 10000); // 15s→10s

        const response = await fetch(await proxyUrl(apiUrl), {
            headers: API_CONFIG.search.headers,
            signal:  controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return [];

        const data = await response.json();
        if (!data?.list || !Array.isArray(data.list) || data.list.length === 0) return [];

        const customApiUrl = apiId.startsWith('custom_')
            ? getCustomApiInfo(apiId.replace('custom_', ''))?.url
            : undefined;

        const mapItem = item => ({
            ...item,
            source_name: apiName,
            source_code: apiId,
            ...(customApiUrl ? { api_url: customApiUrl } : {})
        });

        const results = data.list.map(mapItem);

        // ── 优化2：并发分页，复用 authSuffix ────────────────────────────────
        const pageCount    = data.pagecount || 1;
        const pagesToFetch = Math.min(pageCount - 1, (API_CONFIG.search.maxPages || 1) - 1);

        if (pagesToFetch > 0) {
            const pagePromises = Array.from({ length: pagesToFetch }, (_, i) => {
                const page    = i + 2;
                const pageUrl = apiBaseUrl + API_CONFIG.search.pagePath
                    .replace('{query}', encodeURIComponent(query))
                    .replace('{page}', page);

                return (async () => {
                    try {
                        const pc = new AbortController();
                        const pt = setTimeout(() => pc.abort(), 10000);
                        const pr = await fetch(await proxyUrl(pageUrl), {
                            headers: API_CONFIG.search.headers,
                            signal:  pc.signal
                        });
                        clearTimeout(pt);
                        if (!pr.ok) return [];
                        const pd = await pr.json();
                        return pd?.list ? pd.list.map(mapItem) : [];
                    } catch {
                        return [];
                    }
                })();
            });

            // allSettled：单页失败不中断其他页
            const settled = await Promise.allSettled(pagePromises);
            settled.forEach(r => {
                if (r.status === 'fulfilled' && r.value.length > 0) results.push(...r.value);
            });
        }

        return results;
    } catch (error) {
        console.warn(`API ${apiId} 搜索失败:`, error);
        return [];
    }
}
