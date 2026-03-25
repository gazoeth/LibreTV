// trending.js — 热门影视清单模块
// 数据来源：TMDB API 实时获取（自动更新）+ 本地精选兜底
// TMDB API: https://www.themoviedb.org/

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w300';
const TMDB_KEY  = 'b91a299b0c1cccf59e8765f913a24da2';

// 缓存时间：1小时（毫秒），确保数据自动更新
const TMDB_CACHE_TTL = 60 * 60 * 1000;

// 本地兜底数据（TMDB 请求失败时显示）
const FALLBACK_TRENDING = {
    movie: [
        { title: '哪吒之魔童闹海',     year: '2025', poster: '', rating: '9.2' },
        { title: '飞驰人生3',          year: '2026', poster: '', rating: '7.4' },
        { title: '疯狂动物城2',        year: '2025', poster: '', rating: '8.1' },
        { title: '镖人：风起大漠',      year: '2026', poster: '', rating: '7.5' },
        { title: '惊蛰无声',          year: '2026', poster: '', rating: '6.2' },
        { title: '熊出没·年年有熊',     year: '2026', poster: '', rating: '6.8' },
        { title: '阿凡达3',           year: '2025', poster: '', rating: '7.0' },
        { title: '匿杀',             year: '2026', poster: '', rating: '7.2' },
        { title: '封神第二部',         year: '2025', poster: '', rating: '7.8' },
        { title: '流浪地球3',          year: '2026', poster: '', rating: '' },
        { title: '星河入梦',          year: '2026', poster: '', rating: '6.9' },
        { title: '功夫熊猫4',          year: '2024', poster: '', rating: '7.5' },
    ],
    tv: [
        { title: '逐玉',       year: '2026', poster: '', rating: '' },
        { title: '太平年',     year: '2026', poster: '', rating: '' },
        { title: '好好的时光', year: '2026', poster: '', rating: '' },
        { title: '我的山与海', year: '2026', poster: '', rating: '' },
        { title: '小城大事',   year: '2026', poster: '', rating: '' },
        { title: '罚罪2',      year: '2025', poster: '', rating: '7.8' },
        { title: '猎影者',     year: '2026', poster: '', rating: '' },
        { title: '折腰',       year: '2026', poster: '', rating: '' },
        { title: '玫瑰丛生',   year: '2026', poster: '', rating: '' },
        { title: '念无双',     year: '2026', poster: '', rating: '7.5' },
        { title: '骄阳似我',   year: '2026', poster: '', rating: '' },
        { title: '生命树',     year: '2026', poster: '', rating: '' },
    ]
};

// 分类标签
const TRENDING_TABS = [
    { key: 'movie', label: '🎬 电影' },
    { key: 'tv',    label: '📺 剧集' },
];

let trendingCurrentTab = 'movie';
// 内存缓存：{ movie: { data: [...], ts: timestamp }, tv: {...} }
let trendingCache    = {};
let trendingImgCache = {};

// ── 初始化 ────────────────────────────────────────────────────────────────────
function initTrending() {
    const area = document.getElementById('trendingArea');
    if (!area) return;

    // 绑定设置面板中的 toggle 开关
    const toggle = document.getElementById('trendingToggle');
    if (toggle) {
        const isEnabled = localStorage.getItem('trendingEnabled') === 'true';
        toggle.checked = isEnabled;

        const toggleBg  = toggle.nextElementSibling;
        const toggleDot = toggleBg && toggleBg.nextElementSibling;
        if (isEnabled && toggleBg && toggleDot) {
            toggleBg.classList.add('bg-blue-600');
            toggleDot.classList.add('translate-x-6');
        }

        toggle.addEventListener('change', function(e) {
            const checked = e.target.checked;
            localStorage.setItem('trendingEnabled', checked ? 'true' : 'false');
            if (toggleBg && toggleDot) {
                if (checked) {
                    toggleBg.classList.add('bg-blue-600');
                    toggleDot.classList.add('translate-x-6');
                } else {
                    toggleBg.classList.remove('bg-blue-600');
                    toggleDot.classList.remove('translate-x-6');
                }
            }
            updateTrendingVisibility();
            updateHotRecommendArea();
        });
    }

    const enabled = localStorage.getItem('trendingEnabled') === 'true';
    if (!enabled) {
        area.style.display = 'none';
        return;
    }

    area.style.display = '';
    renderTrendingTabs();
    loadTrending(trendingCurrentTab);
}

// ── 控制外层容器显隐 ──────────────────────────────────────────────────────────
function updateHotRecommendArea() {
    const hotArea = document.getElementById('hotRecommendArea');
    if (!hotArea) return;
    const showDouban   = localStorage.getItem('doubanEnabled') === 'true';
    const showTrending = localStorage.getItem('trendingEnabled') === 'true';
    const resultsAreaEl = document.getElementById('resultsArea');
    const isSearching   = resultsAreaEl && !resultsAreaEl.classList.contains('hidden');
    if ((showDouban || showTrending) && !isSearching) {
        hotArea.style.display = '';
    } else {
        hotArea.style.display = 'none';
    }
}

// ── 标签切换 ──────────────────────────────────────────────────────────────────
function renderTrendingTabs() {
    const container = document.getElementById('trendingTabs');
    if (!container) return;
    container.innerHTML = '';
    TRENDING_TABS.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `trending-tab px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
            tab.key === trendingCurrentTab
                ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/40'
                : 'bg-[#1a1a1a] text-gray-400 border-[#333] hover:text-white hover:border-[#555]'
        }`;
        btn.textContent = tab.label;
        btn.onclick = () => switchTrendingTab(tab.key);
        container.appendChild(btn);
    });
}

function switchTrendingTab(key) {
    if (trendingCurrentTab === key) return;
    trendingCurrentTab = key;
    renderTrendingTabs();
    loadTrending(key);
}

// ── 数据加载（带 TTL 缓存，自动更新）─────────────────────────────────────────
async function loadTrending(type) {
    const grid = document.getElementById('trendingGrid');
    if (!grid) return;

    // 骨架屏
    grid.innerHTML = Array(12).fill(`
        <div class="animate-pulse">
            <div class="aspect-[2/3] rounded-lg bg-[#222]"></div>
            <div class="h-3 bg-[#222] rounded mt-2 w-3/4 mx-auto"></div>
        </div>`).join('');

    // 检查内存缓存是否有效（1小时内）
    const cached = trendingCache[type];
    if (cached && (Date.now() - cached.ts) < TMDB_CACHE_TTL) {
        renderTrendingCards(cached.data);
        return;
    }

    // 尝试从 TMDB 实时获取
    try {
        const items = await fetchTMDBTrending(type);
        trendingCache[type] = { data: items, ts: Date.now() };
        renderTrendingCards(items);
    } catch (e) {
        console.warn('TMDB 获取失败，使用兜底数据:', e.message);
        // 即使 TMDB 失败，也检查是否有过期缓存可用
        if (cached?.data) {
            renderTrendingCards(cached.data);
        } else {
            trendingCache[type] = { data: FALLBACK_TRENDING[type], ts: 0 }; // ts=0 确保下次重试
            renderTrendingCards(FALLBACK_TRENDING[type]);
        }
    }
}

// ── TMDB 实时数据获取 ─────────────────────────────────────────────────────────
async function fetchTMDBTrending(type) {
    // 使用 /trending/{type}/week 获取当周热门，语言优先中文
    const url = `${TMDB_BASE}/trending/${type}/week?api_key=${TMDB_KEY}&language=zh-CN`;

    // TMDB 直接请求（不走内部代理，避免代理超时影响体验）
    // 同时也尝试通过代理，以防直连被屏蔽
    let resp;
    try {
        // 先尝试直连 TMDB（速度更快）
        resp = await fetch(url, {
            signal: AbortSignal.timeout(6000),
            headers: { 'Accept': 'application/json' }
        });
    } catch {
        // 直连失败，走代理
        const authSuffix = window.ProxyAuth?.getAuthPrefix
            ? await window.ProxyAuth.getAuthPrefix()
            : '';
        const proxyUrl = PROXY_URL + encodeURIComponent(url) + authSuffix;
        resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.results?.length) throw new Error('无数据');

    return data.results.slice(0, 12).map(item => ({
        title:  item.title || item.name || '未知',
        year:   (item.release_date || item.first_air_date || '').slice(0, 4),
        // 封面直接使用 TMDB CDN URL（无需代理，图片CDN允许跨域）
        poster: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : '',
        rating: item.vote_average ? item.vote_average.toFixed(1) : '',
        id:     item.id,
    }));
}

// ── 渲染卡片 ──────────────────────────────────────────────────────────────────
function renderTrendingCards(items) {
    const grid = document.getElementById('trendingGrid');
    if (!grid) return;

    const fragment = document.createDocumentFragment();

    items.forEach((item, idx) => {
        const safeTitle = item.title
            .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // TMDB 图片 CDN 支持跨域，直接引用无需代理
        const imgSrc = item.poster || '';

        const showRating = item.rating && parseFloat(item.rating) > 0;

        const card = document.createElement('div');
        card.className = 'trending-card group cursor-pointer';
        card.style.animationDelay = `${idx * 35}ms`;
        card.onclick = () => trendingSearch(item.title);
        card.innerHTML = `
            <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a] shadow-lg
                         group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-blue-900/30
                         transition-all duration-300">
                ${imgSrc
                    ? `<img src="${imgSrc}" alt="${safeTitle}"
                            class="w-full h-full object-cover"
                            loading="lazy"
                            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                    : ''
                }
                <div class="w-full h-full ${imgSrc ? 'hidden' : 'flex'} items-center justify-center
                             bg-gradient-to-br from-[#1e2a3a] to-[#111] absolute inset-0">
                    <span class="text-3xl font-bold text-gray-600">${item.title[0] || '?'}</span>
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent
                             opacity-0 group-hover:opacity-100 transition-opacity duration-300
                             flex items-end p-2">
                    <span class="text-white text-xs font-medium leading-tight line-clamp-2">${safeTitle}</span>
                </div>
                ${showRating ? `
                <div class="absolute top-1.5 right-1.5 bg-black/75 text-yellow-400 text-[10px]
                             font-bold px-1.5 py-0.5 rounded-md backdrop-blur-sm leading-tight">
                    ★ ${item.rating}
                </div>` : ''}
                <div class="absolute inset-0 ring-2 ring-transparent group-hover:ring-blue-500/50
                             rounded-lg transition-all duration-300 pointer-events-none"></div>
            </div>
            <div class="mt-1.5 px-0.5">
                <p class="text-xs text-gray-300 truncate group-hover:text-white transition-colors leading-tight font-medium">
                    ${safeTitle}
                </p>
                ${item.year ? `<p class="text-[10px] text-gray-600 mt-0.5">${item.year}</p>` : ''}
            </div>`;
        fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── 点击搜索 ──────────────────────────────────────────────────────────────────
function trendingSearch(title) {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.value = title;
    if (typeof search === 'function') search();
    try {
        window.history.pushState({ search: title }, `搜索: ${title} - LibreTV`, `/s=${encodeURIComponent(title)}`);
        document.title = `搜索: ${title} - LibreTV`;
    } catch (e) {}
    if (window.innerWidth <= 768) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 可见性联动 ────────────────────────────────────────────────────────────────
function updateTrendingVisibility() {
    const area        = document.getElementById('trendingArea');
    const resultsArea = document.getElementById('resultsArea');
    if (!area) return;
    const enabled     = localStorage.getItem('trendingEnabled') === 'true';
    const isSearching = resultsArea && !resultsArea.classList.contains('hidden');
    if (enabled && !isSearching) {
        area.style.display = '';
        renderTrendingTabs();
        if (!trendingCache[trendingCurrentTab]) loadTrending(trendingCurrentTab);
    } else {
        area.style.display = 'none';
    }
    updateHotRecommendArea();
}

document.addEventListener('DOMContentLoaded', initTrending);
