// functions/proxy/[[path]].js

const MEDIA_FILE_EXTENSIONS = [
    '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.f4v', '.m4v', '.3gp', '.3g2', '.ts', '.mts', '.m2ts',
    '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.alac', '.aiff', '.opus',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg', '.avif', '.heic'
];
const MEDIA_CONTENT_TYPES = ['video/', 'audio/', 'image/'];

export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);

    // --- 鉴权 ---
    async function validateAuth(request, env) {
        const url = new URL(request.url);
        const authHash = url.searchParams.get('auth');
        const timestamp = url.searchParams.get('t');
        
        const serverPassword = env.PASSWORD;
        if (!serverPassword) return false;
        
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(serverPassword);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const serverPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            if (!authHash || authHash !== serverPasswordHash) return false;
        } catch (error) { return false; }
        
        if (timestamp && (Date.now() - parseInt(timestamp) > 10 * 60 * 1000)) return false;
        return true;
    }

    if (!(await validateAuth(request, env))) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
        });
    }

    const DEBUG_ENABLED = (env.DEBUG === 'true');
    const CACHE_TTL = parseInt(env.CACHE_TTL || '86400');
    const MAX_RECURSION = parseInt(env.MAX_RECURSION || '5');
    
    let USER_AGENTS = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'];
    try { if (env.USER_AGENTS_JSON) USER_AGENTS = JSON.parse(env.USER_AGENTS_JSON); } catch (e) {}

    function logDebug(message) { if (DEBUG_ENABLED) console.log(`[Proxy Func] ${message}`); }

    function getTargetUrlFromPath(pathname) {
        const encodedUrl = pathname.replace(/^\/proxy\//, '');
        if (!encodedUrl) return null;
        try {
            let decodedUrl = decodeURIComponent(encodedUrl);
            return decodedUrl.match(/^https?:\/\//i) ? decodedUrl : null;
        } catch (e) { return null; }
    }

    function createResponse(body, status = 200, headers = {}) {
        const responseHeaders = new Headers(headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        responseHeaders.set("Access-Control-Allow-Headers", "*");
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
        return new Response(body, { status, headers: responseHeaders });
    }

    function createM3u8Response(content) {
        return createResponse(content, 200, {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": `public, max-age=${CACHE_TTL}`
        });
    }

    function getBaseUrl(urlStr) {
        try {
            const parsedUrl = new URL(urlStr);
            if (!parsedUrl.pathname || parsedUrl.pathname === '/') return `${parsedUrl.origin}/`;
            const pathParts = parsedUrl.pathname.split('/'); pathParts.pop();
            return `${parsedUrl.origin}${pathParts.join('/')}/`;
        } catch (e) {
            const lastSlashIndex = urlStr.lastIndexOf('/');
            return lastSlashIndex > urlStr.indexOf('://') + 2 ? urlStr.substring(0, lastSlashIndex + 1) : urlStr + '/';
        }
    }

    function resolveUrl(baseUrl, relativeUrl) {
        if (relativeUrl.match(/^https?:\/\//i)) return relativeUrl;
        try { return new URL(relativeUrl, baseUrl).toString(); } catch (e) { return relativeUrl; }
    }

    function rewriteUrlToProxy(targetUrl) { return `/proxy/${encodeURIComponent(targetUrl)}`; }

    function isM3u8Content(contentType, url) {
        if (contentType && (contentType.includes('mpegurl') || contentType.includes('application/x-mpegurl'))) return true;
        if (url && (url.includes('.m3u8') || url.includes('.m3u8?'))) return true;
        return false;
    }

    // [核心修复] 单纯拉取目标对象，不提前读取内容为文本
    async function fetchTarget(targetUrl) {
        const headers = new Headers({
            'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
            'Accept': '*/*',
            'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9,en;q=0.8',
        });
        
        // 豆瓣图片防盗链专属伪装
        if (targetUrl.includes('doubanio.com')) {
            headers.set('Referer', 'https://movie.douban.com/');
        } else {
            headers.set('Referer', request.headers.get('Referer') || new URL(targetUrl).origin);
        }

        return await fetch(targetUrl, { headers, redirect: 'follow' });
    }

    // ---- M3U8 处理逻辑 ----
    function processKeyLine(line, baseUrl) { return line.replace(/URI="([^"]+)"/, (m, uri) => `URI="${rewriteUrlToProxy(resolveUrl(baseUrl, uri))}"`); }
    function processMapLine(line, baseUrl) { return line.replace(/URI="([^"]+)"/, (m, uri) => `URI="${rewriteUrlToProxy(resolveUrl(baseUrl, uri))}"`); }

    function processMediaPlaylist(url, content) {
        const baseUrl = getBaseUrl(url);
        const lines = content.split('\n');
        const output = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line && i === lines.length - 1) { output.push(line); continue; }
            if (!line) continue;
            if (line.startsWith('#EXT-X-KEY')) { output.push(processKeyLine(line, baseUrl)); continue; }
            if (line.startsWith('#EXT-X-MAP')) { output.push(processMapLine(line, baseUrl)); continue; }
            if (line.startsWith('#EXTINF')) { output.push(line); continue; }
            if (!line.startsWith('#')) { output.push(rewriteUrlToProxy(resolveUrl(baseUrl, line))); continue; }
            output.push(line);
        }
        return output.join('\n');
    }

    async function processMasterPlaylist(url, content, recursionDepth, env) {
        if (recursionDepth > MAX_RECURSION) throw new Error("递归过深");
        const baseUrl = getBaseUrl(url);
        const lines = content.split('\n');
        let highestBandwidth = -1, bestVariantUrl = '';

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                const currentBandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
                let variantUriLine = '';
                for (let j = i + 1; j < lines.length; j++) {
                    const line = lines[j].trim();
                    if (line && !line.startsWith('#')) { variantUriLine = line; i = j; break; }
                }
                if (variantUriLine && currentBandwidth >= highestBandwidth) {
                    highestBandwidth = currentBandwidth;
                    bestVariantUrl = resolveUrl(baseUrl, variantUriLine);
                }
            }
        }
        if (!bestVariantUrl) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line && !line.startsWith('#') && (line.includes('.m3u8'))) { bestVariantUrl = resolveUrl(baseUrl, line); break; }
            }
        }
        if (!bestVariantUrl) return processMediaPlaylist(url, content);

        const targetRes = await fetchTarget(bestVariantUrl);
        const variantContent = await targetRes.text();
        return await processM3u8Content(bestVariantUrl, variantContent, recursionDepth + 1, env);
    }

    async function processM3u8Content(targetUrl, content, recursionDepth = 0, env) {
        if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
            return await processMasterPlaylist(targetUrl, content, recursionDepth, env);
        }
        return processMediaPlaylist(targetUrl, content);
    }

    // --- 主入口流程 ---
    try {
        const targetUrl = getTargetUrlFromPath(url.pathname);
        if (!targetUrl) return createResponse("无效的代理请求", 400);

        let kvNamespace = null;
        try { kvNamespace = env.LIBRETV_PROXY_KV; } catch (e) {}

        const cacheKey = `proxy_raw:${targetUrl}`;

        // 仅在明确是 M3U8 文本时才使用 KV 缓存
        if (kvNamespace) {
            try {
                const cachedDataJson = await kvNamespace.get(cacheKey);
                if (cachedDataJson) {
                    const cachedData = JSON.parse(cachedDataJson);
                    return createM3u8Response(await processM3u8Content(targetUrl, cachedData.body, 0, env));
                }
            } catch (e) {}
        }

        const response = await fetchTarget(targetUrl);
        if (!response.ok) return createResponse(`请求失败 ${response.status}`, response.status);

        const contentType = response.headers.get('Content-Type') || '';
        const isM3U8 = isM3u8Content(contentType, targetUrl);

        // [核心修复] 如果是图片/视频等二进制流，直接返回 Body，不转换 text()，不存 KV
        if (!isM3U8) {
            const finalHeaders = new Headers(response.headers);
            finalHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
            finalHeaders.set("Access-Control-Allow-Origin", "*");
            finalHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
            finalHeaders.set("Access-Control-Allow-Headers", "*");
            // 剔除会引发 HTTP2 Protocol Error 的头
            finalHeaders.delete('content-encoding');
            finalHeaders.delete('content-length');

            return new Response(response.body, { status: response.status, headers: finalHeaders });
        }

        // 如果是 M3U8 文本
        const content = await response.text();
        
        // 只有纯文本（如 M3U8）才写入 KV 缓存
        if (kvNamespace) {
            try {
                const cacheValue = { body: content, headers: JSON.stringify({'content-type': contentType}) };
                waitUntil(kvNamespace.put(cacheKey, JSON.stringify(cacheValue), { expirationTtl: CACHE_TTL }));
            } catch (e) {}
        }

        const processedM3u8 = await processM3u8Content(targetUrl, content, 0, env);
        return createM3u8Response(processedM3u8);

    } catch (error) {
        logDebug(`处理代理请求时发生错误: ${error.message}`);
        return createResponse(`代理处理错误: ${error.message}`, 500);
    }
}

export async function onOptions(context) {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        },
    });
}
