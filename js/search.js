const SOURCE_SPEED_CACHE_KEY = 'sourceSpeedCache.v1';
const SOURCE_SPEED_CACHE_TTL = 24 * 60 * 60 * 1000;

function getNowMs() {
    return Date.now();
}

function normalizeSpeedValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return null;
    }
    return Math.round(numeric);
}

function loadSourceSpeedCache() {
    try {
        const raw = localStorage.getItem(SOURCE_SPEED_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        const now = getNowMs();
        const cache = {};

        Object.entries(parsed).forEach(([sourceKey, entry]) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }

            const speed = normalizeSpeedValue(entry.speed);
            const updatedAt = Number(entry.updatedAt);
            if (speed === null || !Number.isFinite(updatedAt)) {
                return;
            }

            if (now - updatedAt > SOURCE_SPEED_CACHE_TTL) {
                return;
            }

            cache[sourceKey] = {
                speed,
                updatedAt,
                measurement: entry.measurement || 'unknown',
                vodId: typeof entry.vodId === 'string' ? entry.vodId : '',
                episodes: Number.isFinite(Number(entry.episodes)) ? Number(entry.episodes) : null
            };
        });

        return cache;
    } catch (error) {
        console.warn('Failed to read source speed cache:', error);
        return {};
    }
}

function getSourceSpeedCache() {
    if (!window.__sourceSpeedCache) {
        window.__sourceSpeedCache = loadSourceSpeedCache();
    }
    return window.__sourceSpeedCache;
}

function persistSourceSpeedCache() {
    try {
        localStorage.setItem(SOURCE_SPEED_CACHE_KEY, JSON.stringify(getSourceSpeedCache()));
    } catch (error) {
        console.warn('Failed to persist source speed cache:', error);
    }
}

function getSourceSpeedCacheEntry(sourceKey) {
    if (!sourceKey) {
        return null;
    }

    const entry = getSourceSpeedCache()[sourceKey];
    if (!entry) {
        return null;
    }

    const speed = normalizeSpeedValue(entry.speed);
    if (speed === null) {
        return null;
    }

    return {
        ...entry,
        speed
    };
}

function getCachedSourceSpeed(sourceKey) {
    const entry = getSourceSpeedCacheEntry(sourceKey);
    return entry ? entry.speed : null;
}

function updateSourceSpeedCache(sourceKey, speed, options = {}) {
    const normalizedSpeed = normalizeSpeedValue(speed);
    if (!sourceKey || normalizedSpeed === null) {
        return null;
    }

    const cache = getSourceSpeedCache();
    const existing = cache[sourceKey] || null;
    const incomingMeasurement = options.measurement || existing?.measurement || 'unknown';
    const incomingIsDetail = incomingMeasurement === 'detail';
    const existingIsDetail = existing?.measurement === 'detail';

    let nextSpeed = normalizedSpeed;

    if (existing && normalizeSpeedValue(existing.speed) !== null) {
        if (existingIsDetail && !incomingIsDetail) {
            nextSpeed = existing.speed;
        } else if (incomingIsDetail && !existingIsDetail) {
            nextSpeed = Math.round(existing.speed * 0.35 + normalizedSpeed * 0.65);
        } else {
            nextSpeed = Math.round(existing.speed * 0.4 + normalizedSpeed * 0.6);
        }
    }

    cache[sourceKey] = {
        speed: nextSpeed,
        updatedAt: getNowMs(),
        measurement: incomingMeasurement,
        vodId: typeof options.vodId === 'string' ? options.vodId : existing?.vodId || '',
        episodes: Number.isFinite(Number(options.episodes)) ? Number(options.episodes) : existing?.episodes || null
    };

    persistSourceSpeedCache();
    return cache[sourceKey];
}

function normalizeGeoEnvValue(value) {
    if (typeof value !== 'string') {
        return '';
    }

    const normalizedValue = value.trim();
    return normalizedValue && !/^\{\{.+\}\}$/.test(normalizedValue)
        ? normalizedValue
        : '';
}

function getRuntimeTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (error) {
        return '';
    }
}

function inferRegionFromBrowser() {
    const timezone = getRuntimeTimezone();
    const browserLanguages = Array.from(new Set([
        navigator.language,
        ...(Array.isArray(navigator.languages) ? navigator.languages : [])
    ].filter(Boolean).map(language => String(language).toLowerCase())));
    const looksMainland = timezone === 'Asia/Shanghai'
        || timezone === 'Asia/Urumqi'
        || browserLanguages.some(language => language === 'zh-cn' || language.startsWith('zh-hans'));

    return {
        region: looksMainland ? 'mainland' : 'overseas',
        label: looksMainland ? '中国大陆' : '海外',
        timezone,
        languages: browserLanguages,
        detection: 'browser',
        source: 'browser'
    };
}

function getUserPlaybackRegion() {
    if (window.__userPlaybackRegion) {
        return window.__userPlaybackRegion;
    }

    const countryCode = normalizeGeoEnvValue(window.__ENV__?.GEO_COUNTRY).toUpperCase();
    const regionCode = normalizeGeoEnvValue(window.__ENV__?.GEO_REGION).toUpperCase();
    const geoSource = normalizeGeoEnvValue(window.__ENV__?.GEO_SOURCE);
    const fallback = inferRegionFromBrowser();
    const region = countryCode === 'CN'
        ? 'mainland'
        : countryCode
            ? 'overseas'
            : fallback.region;
    const label = countryCode === 'CN'
        ? '中国大陆'
        : countryCode
            ? `${countryCode} / 海外`
            : fallback.label;

    window.__userPlaybackRegion = {
        countryCode,
        regionCode,
        region,
        label,
        detection: countryCode ? 'ip' : fallback.detection,
        source: geoSource || (countryCode ? 'ip' : fallback.source),
        timezone: fallback.timezone,
        languages: fallback.languages,
        recommendationLabel: region === 'mainland' ? '大陆优先' : '海外优先'
    };

    return window.__userPlaybackRegion;
}

function getSourceRegionSupport(sourceKey) {
    if (String(sourceKey).startsWith('custom_')) {
        return 'custom';
    }

    return API_SITES[sourceKey]?.regionSupport === 'overseas'
        ? 'overseas'
        : 'mainland';
}

function getSourceRegionLabel(sourceKey) {
    const regionSupport = getSourceRegionSupport(sourceKey);
    if (regionSupport === 'overseas') {
        return '支持国外播放';
    }
    if (regionSupport === 'custom') {
        return '自定义资源';
    }
    return '大陆优先';
}

function getSourcePriority(sourceKey, playbackRegion = getUserPlaybackRegion().region) {
    const regionSupport = getSourceRegionSupport(sourceKey);

    if (playbackRegion === 'overseas') {
        if (regionSupport === 'overseas') {
            return 0;
        }
        if (regionSupport === 'custom') {
            return 1;
        }
        return 2;
    }

    if (regionSupport === 'mainland') {
        return 0;
    }
    if (regionSupport === 'custom') {
        return 1;
    }
    return 2;
}

function getCachedSourceSpeedFromOptions(sourceKey, speedMap) {
    if (speedMap instanceof Map) {
        return normalizeSpeedValue(speedMap.get(sourceKey));
    }
    if (speedMap && typeof speedMap === 'object') {
        return normalizeSpeedValue(speedMap[sourceKey]);
    }
    return getCachedSourceSpeed(sourceKey);
}

function getPreferredSourceOrder(sourceKeys, options = {}) {
    const uniqueSourceKeys = Array.from(new Set((Array.isArray(sourceKeys) ? sourceKeys : []).filter(Boolean)));
    const sourceOrderMap = new Map(uniqueSourceKeys.map((sourceKey, index) => [sourceKey, index]));
    const playbackRegion = options.playbackRegion || getUserPlaybackRegion().region;
    const speedMap = options.speedMap || null;
    const allowSpeedSort = options.allowSpeedSort !== false;

    return uniqueSourceKeys.sort((left, right) => {
        const leftPriority = getSourcePriority(left, playbackRegion);
        const rightPriority = getSourcePriority(right, playbackRegion);
        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }

        if (allowSpeedSort) {
            const leftSpeed = getCachedSourceSpeedFromOptions(left, speedMap);
            const rightSpeed = getCachedSourceSpeedFromOptions(right, speedMap);
            if (leftSpeed !== null && rightSpeed !== null && leftSpeed !== rightSpeed) {
                return leftSpeed - rightSpeed;
            }
            if (leftSpeed !== null && rightSpeed === null) {
                return -1;
            }
            if (leftSpeed === null && rightSpeed !== null) {
                return 1;
            }
        }

        return (sourceOrderMap.get(left) ?? 0) - (sourceOrderMap.get(right) ?? 0);
    });
}

function getRecommendedSourceKey(sourceKeys, options = {}) {
    return getPreferredSourceOrder(sourceKeys, options)[0] || '';
}
function getItemSourceSpeedScore(item) {
    if (!item || typeof item !== 'object') {
        return Number.POSITIVE_INFINITY;
    }

    const directSpeed = normalizeSpeedValue(item.__sourceSpeedScore);
    if (directSpeed !== null) {
        return directSpeed;
    }

    const cachedSpeed = getCachedSourceSpeed(item.source_code);
    if (cachedSpeed !== null) {
        return cachedSpeed;
    }

    const searchLatency = normalizeSpeedValue(item.__searchResponseTime);
    if (searchLatency !== null) {
        return searchLatency;
    }

    return Number.POSITIVE_INFINITY;
}

function formatSourceSpeedText(item) {
    const explicitSpeed = normalizeSpeedValue(item?.__sourceSpeedScore);
    const searchSpeed = normalizeSpeedValue(item?.__searchResponseTime);
    const cacheEntry = item?.source_code ? getSourceSpeedCacheEntry(item.source_code) : null;
    const displaySpeed = explicitSpeed ?? cacheEntry?.speed ?? searchSpeed;

    if (displaySpeed === null) {
        return {
            className: 'pending',
            text: '测速中'
        };
    }

    if (item?.__speedTestFailed) {
        return {
            className: 'error',
            text: '测速失败'
        };
    }

    let className = 'good';
    if (displaySpeed > 2000) {
        className = 'poor';
    } else if (displaySpeed > 1000) {
        className = 'medium';
    }

    const suffix = item?.__speedSource === 'search' && !cacheEntry?.measurement
        ? ' 估算'
        : '';

    return {
        className,
        text: `${displaySpeed}ms${suffix}`
    };
}

function sortSearchResultsBySpeed(items) {
    return [...items].sort((left, right) => {
        const leftGroup = Number.isFinite(left?.__groupIndex) ? left.__groupIndex : Number.MAX_SAFE_INTEGER;
        const rightGroup = Number.isFinite(right?.__groupIndex) ? right.__groupIndex : Number.MAX_SAFE_INTEGER;
        if (leftGroup !== rightGroup) {
            return leftGroup - rightGroup;
        }

        const leftSpeed = getItemSourceSpeedScore(left);
        const rightSpeed = getItemSourceSpeedScore(right);
        if (leftSpeed !== rightSpeed) {
            return leftSpeed - rightSpeed;
        }

        const leftArrival = Number.isFinite(left?.__arrivalIndex) ? left.__arrivalIndex : Number.MAX_SAFE_INTEGER;
        const rightArrival = Number.isFinite(right?.__arrivalIndex) ? right.__arrivalIndex : Number.MAX_SAFE_INTEGER;
        if (leftArrival !== rightArrival) {
            return leftArrival - rightArrival;
        }

        return 0;
    });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildDetailApiParams(sourceKey) {
    if (String(sourceKey).startsWith('custom_')) {
        const customApi = getCustomApiInfo(String(sourceKey).replace('custom_', ''));
        if (!customApi) {
            return null;
        }

        return customApi.detail
            ? `&customApi=${encodeURIComponent(customApi.url)}&customDetail=${encodeURIComponent(customApi.detail)}&source=custom`
            : `&customApi=${encodeURIComponent(customApi.url)}&source=custom`;
    }

    return `&source=${encodeURIComponent(sourceKey)}`;
}

async function testSourceConnectionSpeed(sourceKey, vodId, options = {}) {
    const { force = false } = options;
    const cacheEntry = getSourceSpeedCacheEntry(sourceKey);

    if (!force && cacheEntry && cacheEntry.measurement === 'detail') {
        return {
            speed: cacheEntry.speed,
            episodes: cacheEntry.episodes,
            error: null,
            cached: true
        };
    }

    if (!vodId) {
        return { speed: -1, error: 'missing-vod-id', cached: false };
    }

    const apiParams = buildDetailApiParams(sourceKey);
    if (apiParams === null) {
        return { speed: -1, error: 'invalid-source-config', cached: false };
    }

    try {
        const startedAt = performance.now();
        const response = await fetchWithTimeout(
            `/api/detail?id=${encodeURIComponent(vodId)}${apiParams}`,
            {},
            6000
        );

        if (!response.ok) {
            return { speed: -1, error: 'detail-request-failed', cached: false };
        }

        const detail = await response.json();
        if (!Array.isArray(detail.episodes) || detail.episodes.length === 0) {
            return { speed: -1, error: 'no-playable-episodes', cached: false };
        }

        const firstEpisodeUrl = detail.episodes[0];
        if (firstEpisodeUrl && /^https?:\/\//i.test(firstEpisodeUrl)) {
            try {
                await fetchWithTimeout(firstEpisodeUrl, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-cache'
                }, 3000);
            } catch (error) {
                // Best-effort probe only.
            }
        }

        const speed = Math.max(1, Math.round(performance.now() - startedAt));
        updateSourceSpeedCache(sourceKey, speed, {
            measurement: 'detail',
            vodId,
            episodes: detail.episodes.length
        });

        return {
            speed,
            episodes: detail.episodes.length,
            error: null,
            cached: false
        };
    } catch (error) {
        return {
            speed: -1,
            error: error?.name === 'AbortError' ? 'timeout' : 'speed-test-failed',
            cached: false
        };
    }
}

window.getSourceSpeedCacheEntry = getSourceSpeedCacheEntry;
window.getCachedSourceSpeed = getCachedSourceSpeed;
window.updateSourceSpeedCache = updateSourceSpeedCache;
window.getItemSourceSpeedScore = getItemSourceSpeedScore;
window.formatSourceSpeedText = formatSourceSpeedText;
window.sortSearchResultsBySpeed = sortSearchResultsBySpeed;
window.testSourceConnectionSpeed = testSourceConnectionSpeed;
window.getUserPlaybackRegion = getUserPlaybackRegion;
window.getSourceRegionSupport = getSourceRegionSupport;
window.getSourceRegionLabel = getSourceRegionLabel;
window.getPreferredSourceOrder = getPreferredSourceOrder;
window.getRecommendedSourceKey = getRecommendedSourceKey;

async function searchByAPIAndKeyWord(apiId, query) {
    try {
        let apiName;
        let apiBaseUrl;

        if (apiId.startsWith('custom_')) {
            const customApi = getCustomApiInfo(apiId.replace('custom_', ''));
            if (!customApi) {
                return [];
            }
            apiBaseUrl = customApi.url;
            apiName = customApi.name;
        } else {
            if (!API_SITES[apiId]) {
                return [];
            }
            apiBaseUrl = API_SITES[apiId].api;
            apiName = API_SITES[apiId].name;
        }

        const authSuffix = window.ProxyAuth?.getAuthPrefix
            ? await window.ProxyAuth.getAuthPrefix()
            : null;

        async function proxyUrl(rawUrl) {
            if (authSuffix !== null) {
                return PROXY_URL + encodeURIComponent(rawUrl) + authSuffix;
            }

            return window.ProxyAuth?.addAuthToProxyUrl
                ? await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(rawUrl))
                : PROXY_URL + encodeURIComponent(rawUrl);
        }

        const apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
        const searchStartedAt = performance.now();
        const response = await fetchWithTimeout(
            await proxyUrl(apiUrl),
            { headers: API_CONFIG.search.headers },
            10000
        );

        const searchLatency = Math.max(1, Math.round(performance.now() - searchStartedAt));
        updateSourceSpeedCache(apiId, searchLatency, { measurement: 'search' });

        if (!response.ok) {
            return [];
        }

        const text = await response.text();
        if (!text || !text.trimStart().startsWith('{')) {
            return [];
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (error) {
            return [];
        }

        if (!data?.list || !Array.isArray(data.list) || data.list.length === 0) {
            return [];
        }

        const customApiUrl = apiId.startsWith('custom_')
            ? getCustomApiInfo(apiId.replace('custom_', ''))?.url
            : undefined;

        const cacheEntry = getSourceSpeedCacheEntry(apiId);
        const speedScore = cacheEntry?.speed ?? searchLatency;
        const speedSource = cacheEntry?.measurement || 'search';

        const mapItem = (item) => ({
            ...item,
            source_name: apiName,
            source_code: apiId,
            ...(customApiUrl ? { api_url: customApiUrl } : {}),
            __searchResponseTime: searchLatency,
            __sourceSpeedScore: speedScore,
            __speedSource: speedSource
        });

        const results = data.list.map(mapItem);

        const pageCount = data.pagecount || 1;
        const pagesToFetch = Math.min(pageCount - 1, (API_CONFIG.search.maxPages || 1) - 1);

        if (pagesToFetch > 0) {
            const pagePromises = Array.from({ length: pagesToFetch }, (_, index) => {
                const page = index + 2;
                const pageUrl = apiBaseUrl + API_CONFIG.search.pagePath
                    .replace('{query}', encodeURIComponent(query))
                    .replace('{page}', page);

                return (async () => {
                    try {
                        const pageResponse = await fetchWithTimeout(
                            await proxyUrl(pageUrl),
                            { headers: API_CONFIG.search.headers },
                            10000
                        );
                        if (!pageResponse.ok) {
                            return [];
                        }

                        const pageText = await pageResponse.text();
                        if (!pageText || !pageText.trimStart().startsWith('{')) {
                            return [];
                        }

                        let pageData;
                        try {
                            pageData = JSON.parse(pageText);
                        } catch (error) {
                            return [];
                        }

                        return pageData?.list ? pageData.list.map(mapItem) : [];
                    } catch (error) {
                        return [];
                    }
                })();
            });

            const settled = await Promise.allSettled(pagePromises);
            settled.forEach((result) => {
                if (result.status === 'fulfilled' && result.value.length > 0) {
                    results.push(...result.value);
                }
            });
        }

        return results;
    } catch (error) {
        console.warn(`API ${apiId} search failed:`, error);
        return [];
    }
}
