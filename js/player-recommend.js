// player-recommend.js — 播放页右侧热门推荐
// 数据来源：TMDB 2025-2026 热门，走服务器代理（避免直连超时）

const PR_TMDB_KEY  = 'b91a299b0c1cccf59e8765f913a24da2';
const PR_TMDB_BASE = 'https://api.themoviedb.org/3';
const PR_TMDB_IMG  = 'https://image.tmdb.org/t/p/w300';
const PR_PER_PAGE  = 12;
const PR_CACHE_TTL = 60 * 60 * 1000; // 1小时
const PR_CACHE_KEY = 'playerTmdbRecommendCache';

// 网络不可用、代理未配置或 TMDB 暂时失败时，至少保持推荐栏可用。
const PR_FALLBACK_ITEMS = [
    { title: '哪吒之魔童闹海', year: '2025', poster: '', rating: '8.5', type: 'movie' },
    { title: '疯狂动物城2', year: '2025', poster: '', rating: '8.1', type: 'movie' },
    { title: '鬼灭之刃：无限城篇', year: '2025', poster: '', rating: '8.2', type: 'movie' },
    { title: '藏海传', year: '2025', poster: '', rating: '7.6', type: 'tv' },
    { title: '折腰', year: '2025', poster: '', rating: '7.5', type: 'tv' },
    { title: '生命树', year: '2026', poster: '', rating: '', type: 'tv' },
    { title: '阿凡达3', year: '2025', poster: '', rating: '7.0', type: 'movie' },
    { title: '罚罪2', year: '2025', poster: '', rating: '7.8', type: 'tv' },
    { title: '挽救计划', year: '2026', poster: '', rating: '8.6', type: 'movie' },
    { title: '骄阳似我', year: '2026', poster: '', rating: '', type: 'tv' },
    { title: '玩具总动员5', year: '2026', poster: '', rating: '7.4', type: 'movie' },
    { title: '太平年', year: '2026', poster: '', rating: '', type: 'tv' },
];

let _prPool    = [];
let _prOffset  = 0;
let _prCacheTs = 0;

// ── 初始化 ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const aside = document.getElementById('sideRecommend');
    if (!aside) return;

    loadSideRecommend();

    document.getElementById('sideRecommendRefresh')?.addEventListener('click', () => {
        if (_prPool.length === 0) return;
        _prOffset = (_prOffset + PR_PER_PAGE) % _prPool.length;
        renderSideCards(_prPool.slice(_prOffset, _prOffset + PR_PER_PAGE));
    });
});

// ── 构造代理 URL（复用已有鉴权）────────────────────────────────────────────
async function _prProxyUrl(rawUrl) {
    const authSuffix = window.ProxyAuth?.getAuthPrefix
        ? await window.ProxyAuth.getAuthPrefix()
        : (window.ProxyAuth?.getAuthSuffix ? window.ProxyAuth.getAuthSuffix() : '');
    return (typeof PROXY_URL !== 'undefined' ? PROXY_URL : '/proxy/')
        + encodeURIComponent(rawUrl) + authSuffix;
}

function _prFetchWithTimeout(url, timeoutMs) {
    if (window.fetchWithLegacyTimeout) {
        return window.fetchWithLegacyTimeout(url, {
            headers: { Accept: 'application/json' },
        }, timeoutMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
    }).finally(() => clearTimeout(timer));
}

async function _prFetchTmdb(rawUrl) {
    let directError = null;
    try {
        const directResponse = await _prFetchWithTimeout(rawUrl, 6000);
        if (directResponse.ok) return directResponse.json();
        directError = new Error(`TMDB HTTP ${directResponse.status}`);
    } catch (error) {
        directError = error;
    }

    try {
        const proxyUrl = await _prProxyUrl(rawUrl);
        const proxyResponse = await _prFetchWithTimeout(proxyUrl, 8000);
        if (!proxyResponse.ok) throw new Error(`代理 HTTP ${proxyResponse.status}`);
        return proxyResponse.json();
    } catch (proxyError) {
        throw new Error(`${directError?.message || 'TMDB直连失败'}；${proxyError.message}`);
    }
}

function _prReadCache(allowExpired = false) {
    try {
        const cached = JSON.parse(localStorage.getItem(PR_CACHE_KEY) || 'null');
        if (!cached || !Array.isArray(cached.items) || !cached.items.length) return null;
        if (!allowExpired && Date.now() - cached.ts >= PR_CACHE_TTL) return null;
        return cached;
    } catch (error) {
        return null;
    }
}

function _prSaveCache(items) {
    try {
        localStorage.setItem(PR_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
    } catch (error) {}
}

function _prUseItems(items, timestamp = Date.now()) {
    _prPool = items;
    _prOffset = 0;
    _prCacheTs = timestamp;
    renderSideCards(_prPool.slice(0, PR_PER_PAGE));
}

// ── 加载数据：直连 TMDB 优先，代理备用，缓存与本地数据兜底 ──────────────────
async function loadSideRecommend() {
    if (_prPool.length > 0 && (Date.now() - _prCacheTs) < PR_CACHE_TTL) {
        renderSideCards(_prPool.slice(0, PR_PER_PAGE));
        return;
    }

    const freshCache = _prReadCache(false);
    if (freshCache) {
        _prUseItems(freshCache.items, freshCache.ts);
        return;
    }

    try {
        const dateFilter = 'primary_release_date.gte=2025-01-01&primary_release_date.lte=2026-12-31';
        const tvFilter   = 'first_air_date.gte=2025-01-01&first_air_date.lte=2026-12-31';
        const common     = `api_key=${PR_TMDB_KEY}&language=zh-CN&sort_by=popularity.desc`;
        const movieUrl = `${PR_TMDB_BASE}/discover/movie?${common}&${dateFilter}&page=1`;
        const tvUrl    = `${PR_TMDB_BASE}/discover/tv?${common}&${tvFilter}&page=1`;

        const [movieResult, tvResult] = await Promise.allSettled([
            _prFetchTmdb(movieUrl),
            _prFetchTmdb(tvUrl),
        ]);
        const movieData = movieResult.status === 'fulfilled' ? movieResult.value : { results: [] };
        const tvData = tvResult.status === 'fulfilled' ? tvResult.value : { results: [] };

        const toItem = (item, type) => ({
            title:  item.title || item.name || '未知',
            year:   (item.release_date || item.first_air_date || '').slice(0, 4),
            poster: item.poster_path ? `${PR_TMDB_IMG}${item.poster_path}` : '',
            rating: item.vote_average ? parseFloat(item.vote_average).toFixed(1) : '',
            type,
        });
        const movies = Array.isArray(movieData.results) ? movieData.results.map(i => toItem(i, 'movie')) : [];
        const tvs = Array.isArray(tvData.results) ? tvData.results.map(i => toItem(i, 'tv')) : [];
        const merged = [];
        const maxLen = Math.max(movies.length, tvs.length);
        for (let i = 0; i < maxLen; i++) {
            if (movies[i]) merged.push(movies[i]);
            if (tvs[i]) merged.push(tvs[i]);
        }

        if (!merged.length) {
            const errors = [movieResult, tvResult]
                .filter(result => result.status === 'rejected')
                .map(result => result.reason?.message)
                .filter(Boolean);
            throw new Error(errors.join('；') || 'TMDB 未返回推荐数据');
        }

        _prSaveCache(merged);
        _prUseItems(merged);
    } catch (error) {
        console.warn('侧栏推荐加载失败，使用缓存或本地推荐:', error.message);
        const expiredCache = _prReadCache(true);
        _prUseItems(expiredCache?.items?.length ? expiredCache.items : PR_FALLBACK_ITEMS, expiredCache?.ts || 0);
    }
}

// ── 渲染卡片 ──────────────────────────────────────────────────────────────────
function renderSideCards(items) {
    const list = document.getElementById('sideRecommendList');
    if (!list) return;

    if (!items.length) {
        list.innerHTML = '<p class="text-xs text-gray-600 text-center py-4">暂无数据</p>';
        return;
    }

    list.style.gap = '12px';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    const frag = document.createDocumentFragment();
    items.forEach((item, idx) => {
        const safeTitle = item.title
            .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const showRating = item.rating && parseFloat(item.rating) > 0;
        const typeLabel  = item.type === 'tv' ? '剧' : '影';
        const typeColor  = item.type === 'tv' ? 'bg-blue-700' : 'bg-rose-700';

        const card = document.createElement('div');
        card.className = 'side-rec-card cursor-pointer group';
        card.style.setProperty('--i', idx);
        card.onclick = () => {
            window.location.href = `/?s=${encodeURIComponent(item.title)}`;
        };

        card.innerHTML = `
            <div class="flex gap-2.5 items-start">
                <!-- 封面 -->
                <div class="relative flex-shrink-0 rounded-md overflow-hidden bg-[#1a1a1a]
                             shadow-md group-hover:shadow-lg transition-shadow duration-200"
                     style="width:64px;height:88px">
                    ${item.poster
                        ? `<img src="${item.poster}" alt="${safeTitle}"
                                 class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                 loading="lazy" onerror="this.style.display='none'">`
                        : `<div class="w-full h-full flex items-center justify-center text-xl font-bold text-gray-600">
                               ${item.title[0]||'?'}
                           </div>`
                    }
                    <span class="absolute bottom-0 left-0 right-0 text-[10px] text-center font-bold
                                  text-white ${typeColor} py-0.5">${typeLabel}</span>
                </div>
                <!-- 信息 -->
                <div class="flex-1 min-w-0 pt-0.5">
                    <p class="text-[13px] font-medium text-gray-200 group-hover:text-white
                               transition-colors line-clamp-3 leading-snug mb-1.5">${safeTitle}</p>
                    <div class="flex items-center gap-2">
                        ${item.year ? `<span class="text-xs text-gray-500">${item.year}</span>` : ''}
                        ${showRating ? `
                        <span class="flex items-center gap-0.5 text-xs text-yellow-400 font-semibold">
                            <svg class="w-3 h-3 fill-yellow-400" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                            </svg>
                            ${item.rating}
                        </span>` : ''}
                    </div>
                </div>
            </div>`;

        frag.appendChild(card);
    });

    list.innerHTML = '';
    list.appendChild(frag);
}
