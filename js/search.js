// ─── 鉴权前缀缓存（模块级，避免每次请求都重新 await）────────────────────────
let _cachedAuthPrefix = null;
let _authPrefixFetching = null; // 防止并发重复请求

async function _getAuthPrefix() {
    if (_cachedAuthPrefix !== null) return _cachedAuthPrefix;
    if (_authPrefixFetching) return _authPrefixFetching; // 复用进行中的请求

    if (window.ProxyAuth?.getAuthPrefix) {
        _authPrefixFetching = window.ProxyAuth.getAuthPrefix().then(p => {
            _cachedAuthPrefix = p ?? '';
            _authPrefixFetching = null;
            return _cachedAuthPrefix;
        });
        return _authPrefixFetching;
    }
    _cachedAuthPrefix = '';
    return '';
}

// 失效缓存（ProxyAuth token 刷新时调用）
function _invalidateAuthCache() {
    _cachedAuthPrefix = null;
}

async function _buildSearchProxyUrl(rawUrl) {
    // 优先使用 getAuthPrefix（同步拼接），其次回退 addAuthToProxyUrl
    if (window.ProxyAuth?.getAuthPrefix) {
        const prefix = await _getAuthPrefix();
        return PROXY_URL + encodeURIComponent(rawUrl) + prefix;
    }
    if (window.ProxyAuth?.addAuthToProxyUrl) {
        return window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(rawUrl));
    }
    return PROXY_URL + encodeURIComponent(rawUrl);
}

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

        // 预取鉴权前缀（与后续请求并发；若已缓存则同步返回）
        const authPrefixPromise = _getAuthPrefix();

        const apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);

        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 10000); // 由15s收紧至10s

        // 等鉴权和第一页数据同时就绪
        const [, response] = await Promise.all([
            authPrefixPromise,
            (async () => {
                const proxiedUrl = await _buildSearchProxyUrl(apiUrl);
                return fetch(proxiedUrl, {
                    headers: API_CONFIG.search.headers,
                    signal: controller.signal
                });
            })()
        ]);

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

        // ── 追加分页（并发，复用已缓存鉴权前缀）────────────────────────────
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
                        const pr = await fetch(await _buildSearchProxyUrl(pageUrl), {
                            headers: API_CONFIG.search.headers,
                            signal: pc.signal
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
