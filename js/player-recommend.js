// player-recommend.js — 播放页右侧热门推荐
// 数据来源：TMDB 2025-2026 热门，走服务器代理（避免直连超时）

const PR_TMDB_KEY  = 'b91a299b0c1cccf59e8765f913a24da2';
const PR_TMDB_BASE = 'https://api.themoviedb.org/3';
const PR_TMDB_IMG  = 'https://image.tmdb.org/t/p/w185';
const PR_PER_PAGE  = 12;
const PR_CACHE_TTL = 60 * 60 * 1000; // 1小时

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

// ── 加载数据：电影 + 剧集并发，走代理 ───────────────────────────────────────
async function loadSideRecommend() {
    if (_prPool.length > 0 && (Date.now() - _prCacheTs) < PR_CACHE_TTL) {
        renderSideCards(_prPool.slice(0, PR_PER_PAGE));
        return;
    }

    try {
        const dateFilter = 'primary_release_date.gte=2025-01-01&primary_release_date.lte=2026-12-31';
        const tvFilter   = 'first_air_date.gte=2025-01-01&first_air_date.lte=2026-12-31';
        const common     = `api_key=${PR_TMDB_KEY}&language=zh-CN&sort_by=popularity.desc`;

        const movieUrl = `${PR_TMDB_BASE}/discover/movie?${common}&${dateFilter}&page=1`;
        const tvUrl    = `${PR_TMDB_BASE}/discover/tv?${common}&${tvFilter}&page=1`;

        const [movieProxied, tvProxied] = await Promise.all([
            _prProxyUrl(movieUrl),
            _prProxyUrl(tvUrl),
        ]);

        const [movieRes, tvRes] = await Promise.all([
            fetch(movieProxied, { signal: AbortSignal.timeout(10000) }),
            fetch(tvProxied,    { signal: AbortSignal.timeout(10000) }),
        ]);

        const [movieData, tvData] = await Promise.all([
            movieRes.ok ? movieRes.json() : { results: [] },
            tvRes.ok    ? tvRes.json()    : { results: [] },
        ]);

        const toItem = (item, type) => ({
            title:  item.title || item.name || '未知',
            year:   (item.release_date || item.first_air_date || '').slice(0, 4),
            poster: item.poster_path ? `${PR_TMDB_IMG}${item.poster_path}` : '',
            rating: item.vote_average ? parseFloat(item.vote_average).toFixed(1) : '',
            type,
        });

        // 电影剧集交错混排
        const movies = (movieData.results || []).map(i => toItem(i, 'movie'));
        const tvs    = (tvData.results    || []).map(i => toItem(i, 'tv'));
        const merged = [];
        const maxLen = Math.max(movies.length, tvs.length);
        for (let i = 0; i < maxLen; i++) {
            if (movies[i]) merged.push(movies[i]);
            if (tvs[i])    merged.push(tvs[i]);
        }

        _prPool    = merged;
        _prOffset  = 0;
        _prCacheTs = Date.now();

        renderSideCards(_prPool.slice(0, PR_PER_PAGE));
    } catch (e) {
        console.warn('侧栏推荐加载失败:', e.message);
        document.getElementById('sideRecommendList').innerHTML =
            '<p class="text-xs text-gray-600 text-center py-4">暂时无法加载推荐</p>';
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

    const frag = document.createDocumentFragment();
    items.forEach((item, idx) => {
        const safeTitle = item.title
            .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const showRating = item.rating && parseFloat(item.rating) > 0;
        const typeLabel  = item.type === 'tv' ? '剧' : '影';
        const typeColor  = item.type === 'tv' ? 'bg-blue-700' : 'bg-rose-700';

        const card = document.createElement('div');
        card.className = 'side-rec-card flex gap-3 cursor-pointer group';
        card.style.setProperty('--i', idx);
        card.onclick = () => {
            window.location.href = `/?s=${encodeURIComponent(item.title)}`;
        };

        card.innerHTML = `
            <div class="relative flex-shrink-0 w-14 h-20 rounded-md overflow-hidden
                         bg-[#1a1a1a] group-hover:scale-105 transition-transform duration-200 shadow-sm">
                ${item.poster
                    ? `<img src="${item.poster}" alt="${safeTitle}"
                             class="w-full h-full object-cover" loading="lazy"
                             onerror="this.style.display='none'">`
                    : `<div class="w-full h-full flex items-center justify-center text-lg font-bold text-gray-700">
                           ${item.title[0]||'?'}
                       </div>`
                }
                <span class="absolute bottom-0 left-0 right-0 text-[9px] text-center font-bold
                              text-white ${typeColor} py-0.5 leading-tight">${typeLabel}</span>
            </div>
            <div class="flex-1 min-w-0 py-0.5">
                <p class="text-xs font-medium text-gray-200 group-hover:text-white
                           transition-colors line-clamp-2 leading-snug mb-1">${safeTitle}</p>
                <div class="flex items-center gap-1.5 flex-wrap">
                    ${item.year ? `<span class="text-[10px] text-gray-500">${item.year}</span>` : ''}
                    ${showRating ? `
                    <span class="flex items-center gap-0.5 text-[10px] text-yellow-500 font-medium">
                        <svg class="w-2.5 h-2.5 fill-yellow-500" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                        </svg>
                        ${item.rating}
                    </span>` : ''}
                </div>
            </div>`;

        frag.appendChild(card);
    });

    list.innerHTML = '';
    list.appendChild(frag);
}
