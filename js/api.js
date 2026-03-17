// ─── 与 search.js 共享的鉴权缓存辅助（若两文件合并加载可去重）────────────────
// 依赖 search.js 中已定义的 _getAuthPrefix / _buildSearchProxyUrl
// 若 api.js 独立使用，则在此处提供同名实现（幂等，不会重复声明）
if (typeof _getAuthPrefix === 'undefined') {
    var _cachedAuthPrefix = null;
    var _authPrefixFetching = null;
    var _getAuthPrefix = async function() {
        if (_cachedAuthPrefix !== null) return _cachedAuthPrefix;
        if (_authPrefixFetching) return _authPrefixFetching;
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
    };
}

async function _buildProxyUrl(rawUrl) {
    if (window.ProxyAuth?.getAuthPrefix) {
        return PROXY_URL + encodeURIComponent(rawUrl) + (await _getAuthPrefix());
    }
    if (window.ProxyAuth?.addAuthToProxyUrl) {
        return window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(rawUrl));
    }
    return PROXY_URL + encodeURIComponent(rawUrl);
}

// ─── 改进的 API 请求处理函数 ───────────────────────────────────────────────────
async function handleApiRequest(url) {
    const customApi    = url.searchParams.get('customApi')    || '';
    const customDetail = url.searchParams.get('customDetail') || '';
    const source       = url.searchParams.get('source')       || 'heimuer';

    try {
        // ── /api/search ───────────────────────────────────────────────────────
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) throw new Error('缺少搜索参数');
            if (source === 'custom' && !customApi) throw new Error('使用自定义API时必须提供API地址');
            if (!API_SITES[source] && source !== 'custom') throw new Error('无效的API来源');

            const apiUrl = customApi
                ? `${customApi}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`
                : `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;

            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(await _buildProxyUrl(apiUrl), {
                    headers: API_CONFIG.search.headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`API请求失败: ${response.status}`);

                const data = await response.json();
                if (!data || !Array.isArray(data.list)) throw new Error('API返回的数据格式无效');

                const sourceName = source === 'custom' ? '自定义源' : API_SITES[source].name;
                data.list.forEach(item => {
                    item.source_name = sourceName;
                    item.source_code = source;
                    if (source === 'custom') item.api_url = customApi;
                });

                return JSON.stringify({ code: 200, list: data.list });
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        }

        // ── /api/detail ───────────────────────────────────────────────────────
        if (url.pathname === '/api/detail') {
            const id         = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer';
            if (!id) throw new Error('缺少视频ID参数');
            if (!/^[\w-]+$/.test(id)) throw new Error('无效的视频ID格式');

            if (sourceCode !== 'custom' && API_SITES[sourceCode]?.detail) {
                return await handleSpecialSourceDetail(id, sourceCode);
            }
            if (sourceCode === 'custom' && (customDetail || url.searchParams.get('useDetail') === 'true')) {
                return await handleCustomApiSpecialDetail(id, customDetail || customApi);
            }

            const detailUrl = customApi
                ? `${customApi}${API_CONFIG.detail.path}${id}`
                : `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${id}`;

            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(await _buildProxyUrl(detailUrl), {
                    headers: API_CONFIG.detail.headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`详情请求失败: ${response.status}`);

                const data = await response.json();
                if (!data?.list?.length) throw new Error('获取到的详情内容无效');

                const videoDetail = data.list[0];
                let episodes = [];
                if (videoDetail.vod_play_url) {
                    const src = videoDetail.vod_play_url.split('$$$')[0];
                    episodes = src.split('#').map(ep => {
                        const parts = ep.split('$');
                        return parts.length > 1 ? parts[1] : '';
                    }).filter(u => u.startsWith('http://') || u.startsWith('https://'));
                }

                return JSON.stringify({
                    code: 200,
                    episodes,
                    detailUrl,
                    videoInfo: {
                        title:       videoDetail.vod_name,
                        cover:       videoDetail.vod_pic,
                        desc:        videoDetail.vod_content,
                        source_name: sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name,
                        source_code: sourceCode
                    }
                });
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        }

        throw new Error('未知的API路径');
    } catch (error) {
        return JSON.stringify({ code: 400, msg: error.message || '失败', list: [], episodes: [] });
    }
}

// ─── 聚合搜索：全并发 + 鉴权缓存 ─────────────────────────────────────────────
async function handleAggregatedSearch(searchQuery) {
    const availableSources = Object.keys(API_SITES).filter(k => k !== 'aggregated' && k !== 'custom');
    if (availableSources.length === 0) throw new Error('没有可用的API源');

    // 预取一次鉴权前缀（已缓存则同步）
    await _getAuthPrefix();

    const searchPromises = availableSources.map(async source => {
        try {
            const apiUrl     = `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 6000);

            const response = await fetch(await _buildProxyUrl(apiUrl), {
                headers: API_CONFIG.search.headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) return [];

            const data = await response.json();
            return (data?.list || []).map(item => ({
                ...item,
                source_name: API_SITES[source].name,
                source_code: source
            }));
        } catch {
            return [];
        }
    });

    const resultsArray = await Promise.all(searchPromises);

    const seen          = new Set();
    const uniqueResults = [];
    for (const item of resultsArray.flat()) {
        if (!item) continue;
        const key = `${item.source_code}_${item.vod_id}`;
        if (!seen.has(key)) { seen.add(key); uniqueResults.push(item); }
    }

    return JSON.stringify({ code: 200, list: uniqueResults });
}

// ─── 拦截 fetch ───────────────────────────────────────────────────────────────
(function () {
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
        const url = typeof input === 'string'
            ? new URL(input, window.location.origin)
            : new URL(input.url);
        if (url.pathname.startsWith('/api/')) {
            const data = await handleApiRequest(url);
            return new Response(data, { headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch.apply(this, arguments);
    };
})();
