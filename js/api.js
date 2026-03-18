// 改进的API请求处理函数
async function handleApiRequest(url) {
    const customApi = url.searchParams.get('customApi') || '';
    const customDetail = url.searchParams.get('customDetail') || '';
    const source = url.searchParams.get('source') || 'heimuer';
    
    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) throw new Error('缺少搜索参数');
            if (source === 'custom' && !customApi) throw new Error('使用自定义API时必须提供API地址');
            if (!API_SITES[source] && source !== 'custom') throw new Error('无效的API来源');
            
            const apiUrl = customApi
                ? `${customApi}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`
                : `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
                const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                    await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(apiUrl)) :
                    PROXY_URL + encodeURIComponent(apiUrl);
                    
                const response = await fetch(proxiedUrl, {
                    headers: API_CONFIG.search.headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
                
                const data = await response.json();
                if (!data || !Array.isArray(data.list)) throw new Error('API返回的数据格式无效');
                
                data.list.forEach(item => {
                    item.source_name = source === 'custom' ? '自定义源' : API_SITES[source].name;
                    item.source_code = source;
                    if (source === 'custom') item.api_url = customApi;
                });
                
                return JSON.stringify({ code: 200, list: data.list || [] });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                throw fetchError;
            }
        }

        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
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
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
                const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                    await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(detailUrl)) :
                    PROXY_URL + encodeURIComponent(detailUrl);
                    
                const response = await fetch(proxiedUrl, {
                    headers: API_CONFIG.detail.headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`详情请求失败: ${response.status}`);
                
                const data = await response.json();
                if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) throw new Error('获取到的详情内容无效');
                
                const videoDetail = data.list[0];
                let episodes = [];
                if (videoDetail.vod_play_url) {
                    const playSources = videoDetail.vod_play_url.split('$$$');
                    if (playSources.length > 0) {
                        episodes = playSources[0].split('#').map(ep => {
                            const parts = ep.split('$');
                            return parts.length > 1 ? parts[1] : '';
                        }).filter(u => u && (u.startsWith('http://') || u.startsWith('https://')));
                    }
                }
                
                return JSON.stringify({
                    code: 200,
                    episodes: episodes,
                    detailUrl: detailUrl,
                    videoInfo: {
                        title: videoDetail.vod_name,
                        cover: videoDetail.vod_pic,
                        desc: videoDetail.vod_content,
                        source_name: sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name,
                        source_code: sourceCode
                    }
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                throw fetchError;
            }
        }
        throw new Error('未知的API路径');
    } catch (error) {
        return JSON.stringify({ code: 400, msg: error.message || '失败', list: [], episodes: [] });
    }
}

// 优化后的聚合搜索：预取鉴权参数，减少循环内的 await
async function handleAggregatedSearch(searchQuery) {
    const availableSources = Object.keys(API_SITES).filter(key => key !== 'aggregated' && key !== 'custom');
    if (availableSources.length === 0) throw new Error('没有可用的API源');
    
    // 预取鉴权前缀，提升并发效率
    const authPrefix = window.ProxyAuth?.getAuthPrefix ? await window.ProxyAuth.getAuthPrefix() : "";
    
    const searchPromises = availableSources.map(async (source) => {
        try {
            const apiUrl = `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000); // 软超时缩短至 6s
            
            const proxiedUrl = PROXY_URL + encodeURIComponent(apiUrl) + authPrefix;
            
            const response = await fetch(proxiedUrl, { headers: API_CONFIG.search.headers, signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) return [];
            const txt = await response.text();
            if (!txt || !txt.trimStart().startsWith('{')) return [];
            let data; try { data = JSON.parse(txt); } catch { return []; }
            return (data?.list || []).map(item => ({ ...item, source_name: API_SITES[source].name, source_code: source }));
        } catch (error) {
            return [];
        }
    });
    
    const resultsArray = await Promise.all(searchPromises);
    let allResults = resultsArray.flat().filter(item => item);
    
    const uniqueResults = [];
    const seen = new Set();
    allResults.forEach(item => {
        const key = `${item.source_code}_${item.vod_id}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueResults.push(item);
        }
    });
    
    return JSON.stringify({ code: 200, list: uniqueResults });
}

// 拦截 fetch
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
        const url = typeof input === 'string' ? new URL(input, window.location.origin) : new URL(input.url);
        if (url.pathname.startsWith('/api/')) {
            const data = await handleApiRequest(url);
            return new Response(data, { headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch.apply(this, arguments);
    };
})();
