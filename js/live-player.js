/**
 * FreeDY 直播播放层 —— 代理寻址、HLS 自适应加载器与频道测活。
 *
 * 为什么直播必须经站点代理：
 * - IPTV 源头极少下发 Access-Control-Allow-Origin，浏览器直连会被 CORS 拦截；
 * - 大量源头仍是 http://，在 https 页面下属于混合内容，必然被浏览器阻断；
 * - 部分源头校验 Referer/UA，只有服务端才能补齐。
 *
 * 因此清单与分片默认全部走同源 /proxy/。站点的三个服务端代理（Express /
 * Vercel / Netlify）本身也会改写 m3u8，这里对「已被服务端改写过的地址」
 * 只补鉴权、不再二次包裹，两种实现都能跑通。
 */
(function () {
    'use strict';

    var PROBE_TTL_MS = 30 * 60 * 1000;
    var PROBE_CACHE_KEY = 'liveProbes';
    var viaProxy = true;
    var loaderClass = null;
    var probeCache = null;

    function proxyBase() {
        return (typeof PROXY_URL !== 'undefined') ? PROXY_URL : '/proxy/';
    }

    function authSuffix() {
        if (window.ProxyAuth && typeof window.ProxyAuth.getAuthSuffix === 'function') {
            return window.ProxyAuth.getAuthSuffix() || '';
        }
        return '';
    }

    /** 预热鉴权哈希，避免首个请求因缺少 auth 参数被判 401 */
    function warmAuth() {
        if (window.ProxyAuth && typeof window.ProxyAuth.getAuthPrefix === 'function') {
            return window.ProxyAuth.getAuthPrefix().catch(function () { return ''; });
        }
        return Promise.resolve('');
    }

    /**
     * 精确判断「本站在服务端改写时生成的代理地址」：
     * 路径以 /proxy/ 开头，且其载荷解码后是 http(s) 地址。
     * 这样上游自身出现的 /proxy/ 路径不会被误判。
     */
    function isSiteProxyUrl(value) {
        if (!value) return false;
        var path = value;
        if (value.indexOf(location.origin) === 0) path = value.slice(location.origin.length);
        if (path.indexOf('/proxy/') !== 0) return false;
        var payload = path.slice('/proxy/'.length).split('?')[0];
        try {
            return /^https?:\/\//i.test(decodeURIComponent(payload));
        } catch (error) {
            return false;
        }
    }

    /** 相对地址按上游清单地址解析为绝对地址（已是站点代理地址则原样返回） */
    function resolveAgainst(rawUri, upstreamUrl) {
        if (!rawUri) return '';
        var value = String(rawUri).trim();
        if (!value) return '';
        if (isSiteProxyUrl(value)) return value;
        if (/^https?:\/\//i.test(value)) return value;
        try {
            return new URL(value, upstreamUrl).href;
        } catch (error) {
            return value;
        }
    }

    /** 原始地址 → 同源代理地址（带鉴权）；已在代理形态上则只补鉴权 */
    function toProxyUrl(rawUrl) {
        if (!rawUrl) return rawUrl;
        var auth = authSuffix();
        if (isSiteProxyUrl(rawUrl)) {
            var absolute = rawUrl.indexOf(location.origin) === 0 ? rawUrl : location.origin + rawUrl;
            return absolute.indexOf('auth=') === -1 ? absolute + auth : absolute;
        }
        if (!/^https?:\/\//i.test(rawUrl)) return rawUrl;
        return proxyBase() + encodeURIComponent(rawUrl) + auth;
    }

    /** 站点代理地址还原为上游真实地址（测活展示与去重用） */
    function toUpstreamUrl(url) {
        if (!url) return '';
        var path = url;
        if (url.indexOf(location.origin) === 0) path = url.slice(location.origin.length);
        if (path.indexOf('/proxy/') !== 0) return url;
        var payload = path.slice('/proxy/'.length).split('?')[0];
        try {
            var decoded = decodeURIComponent(payload);
            return /^https?:\/\//i.test(decoded) ? decoded : url;
        } catch (error) {
            return url;
        }
    }

    /**
     * 改写清单：把分片、子清单、KEY/MAP/MEDIA 的 URI 全部换成同源代理地址。
     * 改写后清单里不再有相对地址，因此 hls.js 无需再做基准地址推导。
     */
    function rewritePlaylist(text, upstreamUrl) {
        var lines = String(text).split(/\r?\n/);
        var output = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();
            if (!trimmed) {
                output.push(line);
                continue;
            }
            if (trimmed.charAt(0) === '#') {
                if (trimmed.indexOf('URI="') === -1) {
                    output.push(line);
                } else {
                    output.push(line.replace(/URI="([^"]*)"/g, function (match, uri) {
                        return 'URI="' + toProxyUrl(resolveAgainst(uri, upstreamUrl)) + '"';
                    }));
                }
                continue;
            }
            output.push(toProxyUrl(resolveAgainst(trimmed, upstreamUrl)));
        }
        return output.join('\n');
    }

    /**
     * 自定义 HLS 加载器：在默认加载器之上包一层代理寻址与清单改写。
     * 只拦截 manifest / level 两类文本请求，分片与密钥仅替换地址。
     */
    function getLoaderClass() {
        if (loaderClass) return loaderClass;
        var BaseLoader = window.Hls && window.Hls.DefaultConfig && window.Hls.DefaultConfig.loader;
        if (!BaseLoader) return null;

        var Loader = function (config) {
            BaseLoader.call(this, config);
            var baseLoad = this.load.bind(this);
            this.load = function (context, hlsConfig, callbacks) {
                if (!viaProxy) return baseLoad(context, hlsConfig, callbacks);
                var upstreamUrl = context.url;
                var requested = toProxyUrl(upstreamUrl);
                if (requested === upstreamUrl) return baseLoad(context, hlsConfig, callbacks);

                context.url = requested;
                var onSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function (response, stats, ctx, networkDetails) {
                    var isTextPlaylist = (ctx.type === 'manifest' || ctx.type === 'level');
                    if (isTextPlaylist && response && typeof response.data === 'string'
                        && response.data.indexOf('#EXTM3U') !== -1) {
                        try {
                            response.data = rewritePlaylist(response.data, upstreamUrl);
                        } catch (error) {
                            console.warn('[FreeDY 直播] 清单改写失败，按原始内容播放：', error && error.message);
                        }
                    }
                    return onSuccess(response, stats, ctx, networkDetails);
                };
                return baseLoad(context, hlsConfig, callbacks);
            };
        };

        if (BaseLoader.prototype) {
            Loader.prototype = Object.create(BaseLoader.prototype);
            Loader.prototype.constructor = Loader;
        }
        loaderClass = Loader;
        return loaderClass;
    }

    function hlsConfig() {
        var Loader = getLoadersSafe();
        return {
            debug: false,
            loader: Loader || (window.Hls && window.Hls.DefaultConfig ? window.Hls.DefaultConfig.loader : undefined),
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: 24,
            maxMaxBufferLength: 60,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            manifestLoadingMaxRetry: 2,
            manifestLoadingRetryDelay: 800,
            levelLoadingMaxRetry: 2,
            fragLoadingMaxRetry: 4,
            fragLoadingRetryDelay: 800,
            fragLoadingMaxRetryTimeout: 20000,
            startLevel: -1,
            abrEwmaDefaultEstimate: 800000
        };
    }

    function getLoadersSafe() {
        try {
            return getLoaderClass();
        } catch (error) {
            console.warn('[FreeDY 直播] 自定义加载器不可用，回退默认加载器');
            return null;
        }
    }

    /* ── 频道测活 ───────────────────────────────────────────── */

    function loadProbeCache() {
        if (probeCache) return probeCache;
        probeCache = {};
        try {
            var raw = localStorage.getItem(PROBE_CACHE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') probeCache = parsed;
            }
        } catch (error) {
            probeCache = {};
        }
        return probeCache;
    }

    function saveProbeCache() {
        try {
            localStorage.setItem(PROBE_CACHE_KEY, JSON.stringify(probeCache || {}));
        } catch (error) {
            /* 超出配额时静默降级为内存缓存 */
        }
    }

    function cachedProbe(url) {
        var cache = loadProbeCache();
        var entry = cache[url];
        if (!entry) return null;
        if (Date.now() - entry.at > PROBE_TTL_MS) {
            delete cache[url];
            return null;
        }
        return { ok: entry.ok, ms: entry.ms, level: entry.level, kbps: entry.kbps, timedOut: entry.timedOut };
    }

    function storeProbe(url, result) {
        var cache = loadProbeCache();
        cache[url] = {
            at: Date.now(), ok: result.ok, ms: result.ms,
            level: result.level, kbps: result.kbps || 0, timedOut: Boolean(result.timedOut)
        };
        var keys = Object.keys(cache);
        if (keys.length > 400) {
            keys.sort(function (a, b) { return cache[a].at - cache[b].at; });
            keys.slice(0, keys.length - 400).forEach(function (key) { delete cache[key]; });
        }
        saveProbeCache();
        return result;
    }

    /**
     * 频道可用性探测：清单可达 → 子清单可达 → 首个分片真实取到数据。
     * 只有第三个阶段通过才判定为「可流畅播放」级别（level === 'segment'），
     * 并据首个分片的字节数与耗时估算码率，用来识别「能连上但带宽不足」的源。
     */
    function probe(url, options) {
        var opts = options || {};
        var timeoutMs = opts.timeoutMs || 9000;
        var useCache = opts.useCache !== false;

        if (useCache) {
            var cached = cachedProbe(url);
            if (cached) return Promise.resolve(cached).then(function (value) {
                value.cached = true;
                return value;
            });
        }

        var timedOut = false;
        var started = Date.now();

        function fetchText(target, budget) {
            var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () {
                timedOut = true;
                if (controller) controller.abort();
            }, budget);
            return fetch(toProxyUrl(target), { signal: controller ? controller.signal : undefined })
                .then(function (response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.text();
                })
                .then(function (text) {
                    clearTimeout(timer);
                    return text;
                }, function (error) {
                    clearTimeout(timer);
                    throw error;
                });
        }

        function measureFirstSegment(playlistText, upstreamUrl) {
            var match = playlistText.match(/^\s*(?!#)(\S+)\s*$/m);
            if (!match) return Promise.resolve({ level: 'manifest' });
            var segmentUrl = resolveAgainst(match[1], upstreamUrl);
            var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () {
                timedOut = true;
                if (controller) controller.abort();
            }, timeoutMs);
            var bytes = 0;
            var segStart = Date.now();

            return fetch(toProxyUrl(segmentUrl), { signal: controller ? controller.signal : undefined })
                .then(function (response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    if (!response.body || typeof response.body.getReader !== 'function') {
                        clearTimeout(timer);
                        return { level: 'manifest' };
                    }
                    var reader = response.body.getReader();
                    return reader.read().then(function (chunk) {
                        bytes = chunk && chunk.value ? chunk.value.length : 0;
                        clearTimeout(timer);
                        try { reader.cancel(); } catch (error) { /* 流已结束 */ }
                        var elapsed = Math.max(Date.now() - segStart, 1);
                        var kbps = Math.round((bytes * 8) / (elapsed / 1000) / 1000);
                        return { level: 'segment', kbps: kbps };
                    });
                }, function (error) {
                    clearTimeout(timer);
                    throw error;
                });
        }

        return fetchText(url, timeoutMs).then(function (text) {
            if (text.indexOf('#EXTM3U') === -1) throw new Error('非 M3U 清单');
            var isMaster = text.indexOf('#EXT-X-STREAM-INF') !== -1;
            if (!isMaster) {
                return measureFirstSegment(text, url).then(function (outcome) {
                    return {
                        ok: true, ms: Date.now() - started,
                        level: outcome.level, kbps: outcome.kbps || 0
                    };
                });
            }
            var variant = text.match(/^\s*(?!#)(\S+\.m3u8\S*)\s*$/m) || text.match(/^\s*(?!#)(\S+)\s*$/m);
            if (!variant) return { ok: true, ms: Date.now() - started, level: 'manifest' };
            var variantUrl = resolveAgainst(variant[1], url);
            return fetchText(variantUrl, timeoutMs).then(function (variantText) {
                return measureFirstSegment(variantText, variantUrl).then(function (outcome) {
                    return {
                        ok: true, ms: Date.now() - started,
                        level: outcome.level, kbps: outcome.kbps || 0
                    };
                });
            });
        }).then(function (result) {
            return storeProbe(url, result);
        }, function (error) {
            var failed = {
                ok: false,
                ms: Date.now() - started,
                level: 'none',
                kbps: 0,
                timedOut: timedOut
            };
            if (window.console && console.warn) {
                console.warn('[FreeDY 直播] 频道探测失败：', error && error.message);
            }
            return storeProbe(url, failed);
        });
    }
    /* ── Artplayer 外壳 ─────────────────────────────────────── */

    var art = null;
    var currentHls = null;
    var containerEl = null;
    var hooks = {};
    var switchToken = 0;

    function report(phase, payload) {
        if (typeof hooks.onStatus === 'function') {
            try {
                hooks.onStatus(phase, payload || {});
            } catch (error) {
                console.warn('[FreeDY 直播] 状态回调异常：', error && error.message);
            }
        }
    }

    /** 直播流类型判定：只有 HLS 与渐进式文件可直接播放 */
    function canPlay(url) {
        var value = String(url || '').toLowerCase();
        if (/\.(mp4|m4v)(\?|#|$)/.test(value)) return { ok: true, kind: 'file' };
        if (/\.flv(\?|#|$)/.test(value)) return { ok: false, kind: 'flv' };
        if (/\.(ts|mkv|avi|rmvb|wmv)(\?|#|$)/.test(value)) return { ok: false, kind: 'other' };
        return { ok: true, kind: 'hls' };
    }

    function destroyHls() {
        if (!currentHls) return;
        try {
            currentHls.destroy();
        } catch (error) {
            /* 忽略重复销毁 */
        }
        currentHls = null;
    }

    function handleM3u8(video, url) {
        destroyHls();
        if (!window.Hls || !window.Hls.isSupported()) {
            report('error', { code: 'no-hls' });
            return;
        }
        var hls = new window.Hls(hlsConfig());
        currentHls = hls;
        var recovery = { network: 0, media: 0 };

        hls.on(window.Hls.Events.ERROR, function (event, data) {
            if (!data || !data.fatal) return;
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && recovery.network < 2) {
                recovery.network += 1;
                report('stalled', { code: 'network-retry', attempt: recovery.network });
                hls.startLoad();
                return;
            }
            if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && recovery.media < 2) {
                recovery.media += 1;
                report('stalled', { code: 'media-recover', attempt: recovery.media });
                hls.recoverMediaError();
                return;
            }
            report('error', {
                code: data.type === window.Hls.ErrorTypes.NETWORK_ERROR ? 'network' : 'media',
                details: data.details || ''
            });
        });

        hls.on(window.Hls.Events.LEVEL_SWITCHED, function () {
            report('level', stats());
        });

        hls.loadSource(url);
        hls.attachMedia(video);
    }

    function stats() {
        if (!currentHls || !currentHls.levels) return { levels: 0, height: 0, bitrate: 0 };
        var level = currentHls.levels[currentHls.currentLevel] || null;
        return {
            levels: currentHls.levels.length,
            height: level && level.height ? level.height : 0,
            bitrate: level && level.bitrate ? level.bitrate : 0
        };
    }

    function ensurePlayer(url) {
        if (art) return art;
        if (!window.Artplayer) {
            report('error', { code: 'no-artplayer' });
            return null;
        }
        art = new window.Artplayer({
            container: containerEl,
            url: url,
            type: 'm3u8',
            isLive: true,
            autoplay: true,
            muted: false,
            volume: 0.8,
            pip: true,
            screenshot: false,
            setting: true,
            playbackRate: false,
            aspectRatio: false,
            fullscreen: true,
            fullscreenWeb: true,
            miniProgressBar: true,
            mutex: true,
            backdrop: true,
            autoSize: false,
            autoMini: false,
            hotkey: false,
            playsInline: true,
            theme: '#e50914',
            lang: 'zh-cn',
            moreVideoAttr: { playsInline: true, preload: 'auto' },
            customType: { m3u8: handleM3u8 },
            controls: [
                {
                    name: 'prevChannel',
                    position: 'left',
                    index: 4,
                    html: '<span class="art-live-skip" title="上一台">‹</span>',
                    tooltip: '上一台',
                    click: function () { if (typeof hooks.onPrev === 'function') hooks.onPrev(); }
                },
                {
                    name: 'nextChannel',
                    position: 'left',
                    index: 5,
                    html: '<span class="art-live-skip" title="下一台">›</span>',
                    tooltip: '下一台',
                    click: function () { if (typeof hooks.onNext === 'function') hooks.onNext(); }
                }
            ]
        });

        art.on('ready', function () { report('ready', {}); });
        art.on('playing', function () { report('playing', stats()); });
        art.on('pause', function () { report('paused', {}); });
        art.on('video:waiting', function () { report('stalled', { code: 'buffering' }); });
        art.on('video:error', function () { report('error', { code: 'element' }); });
        art.on('destroy', destroyHls);

        return art;
    }

    /** play() 在部分浏览器返回 undefined，统一吞掉自动播放策略导致的拒绝 */
    function safePlay(player) {
        if (!player || typeof player.play !== 'function') return;
        var result = player.play();
        if (result && typeof result.catch === 'function') result.catch(function () { /* 交给用户点击 */ });
    }

    /**
     * 切换到指定频道。
     * @param {{url:string,name?:string}} channel
     * @param {{force?:boolean}} [options]
     */
    function playChannel(channel, options) {
        var target = typeof channel === 'string' ? { url: channel } : (channel || {});
        var url = String(target.url || '').trim();
        if (!url) return Promise.resolve({ ok: false, reason: 'empty-url' });
        if (!containerEl) return Promise.resolve({ ok: false, reason: 'no-container' });

        var playable = canPlay(url);
        if (!playable.ok) return Promise.resolve({ ok: false, reason: playable.kind });

        var token = ++switchToken;
        report('loading', { url: url, kind: playable.kind });

        // 首次建实例时已经带着 url，直接 play；已有实例才走 switchUrl 复用会话
        var fresh = !art;
        var player = ensurePlayer(url);
        if (!player) return Promise.resolve({ ok: false, reason: 'no-player' });

        player.title = target.name || '';
        player.type = playable.kind === 'file' ? 'mp4' : 'm3u8';
        player.isLive = playable.kind !== 'file';

        var request = (!fresh && player.switchUrl) ? player.switchUrl(url) : player.url;
        var settle = (request && typeof request.then === 'function') ? request : Promise.resolve(request);

        return settle.then(function () {
            if (token !== switchToken) return { ok: true, stale: true };
            if (playable.kind !== 'file') safePlay(player);
            return { ok: true };
        }, function (error) {
            if (token !== switchToken) return { ok: false, stale: true };
            // switchUrl 失败：重建播放器实例，避免残留旧的 HLS 状态
            try {
                player.destroy();
            } catch (destroyError) { /* 已销毁 */ }
            art = null;
            var rebuilt = ensurePlayer(url);
            if (!rebuilt) return { ok: false, reason: 'rebuild-failed' };
            rebuilt.title = target.name || '';
            report('reloading', { reason: error && error.message });
            return { ok: true, rebuilt: true };
        });
    }

    function install(container, callbacks) {
        containerEl = typeof container === 'string' ? document.querySelector(container) : container;
        hooks = callbacks || {};
        return containerEl;
    }

    function setProxy(enabled) {
        var next = enabled !== false;
        if (next === viaProxy) return viaProxy;
        viaProxy = next;
        return viaProxy;
    }

    function getProxy() {
        return viaProxy;
    }

    function togglePlay() {
        if (!art) return;
        if (art.playing) art.pause();
        else safePlay(art);
    }

    function setVolume(value) {
        if (art) art.volume = Math.max(0, Math.min(1, Number(value) || 0));
    }

    function isPlaying() {
        return Boolean(art && art.playing);
    }

    function destroy() {
        destroyHls();
        if (art) {
            try {
                art.destroy();
            } catch (error) { /* 忽略 */ }
            art = null;
        }
        switchToken += 1;
    }

    window.LivePlayer = {
        install: install,
        playChannel: playChannel,
        canPlay: canPlay,
        setProxy: setProxy,
        getProxy: getProxy,
        warmAuth: warmAuth,
        toProxyUrl: toProxyUrl,
        toUpstreamUrl: toUpstreamUrl,
        rewritePlaylist: rewritePlaylist,
        togglePlay: togglePlay,
        setVolume: setVolume,
        isPlaying: isPlaying,
        stats: stats,
        probe: probe,
        cachedProbe: cachedProbe,
        getPlayer: function () { return art; },
        destroy: destroy
    };
})();
