// trending.js — 热门影视清单模块
// 数据来源：TMDB API（通过代理）+ 本地精选兜底

const TMDB_BASE  = 'https://api.themoviedb.org/3';
const TMDB_IMG   = 'https://image.tmdb.org/t/p/w300';
// TMDB public endpoints don't require auth key for basic trending
const TMDB_KEY   = '3e4a3bbc5e9870f3da6752fd5e715f76'; // public demo key from TMDB docs

// 本地精选兜底数据（TMDB 不可用时显示）
const FALLBACK_TRENDING = {
    movie: [
        { title: '哪吒之魔童降世', year: '2024', poster: '', id: null },
        { title: '封神第二部', year: '2025', poster: '', id: null },
        { title: '功夫熊猫4', year: '2024', poster: '', id: null },
        { title: '异形：夺命舰', year: '2024', poster: '', id: null },
        { title: '沙丘：第二部', year: '2024', poster: '', id: null },
        { title: '死侍与金刚狼', year: '2024', poster: '', id: null },
        { title: '头脑特工队2', year: '2024', poster: '', id: null },
        { title: '哥斯拉大战金刚2', year: '2024', poster: '', id: null },
        { title: '变形金刚：投降', year: '2024', poster: '', id: null },
        { title: '疯狂的麦克斯：狂暴女神', year: '2024', poster: '', id: null },
    ],
    tv: [
        { title: '庆余年 第二季', year: '2024', poster: '', id: null },
        { title: '繁花', year: '2023', poster: '', id: null },
        { title: '黑袍纠察队 第四季', year: '2024', poster: '', id: null },
        { title: '权力的游戏：龙之家族 第二季', year: '2024', poster: '', id: null },
        { title: '神秘博士', year: '2024', poster: '', id: null },
        { title: '雪莲花特战队', year: '2024', poster: '', id: null },
        { title: '墨雨云间', year: '2024', poster: '', id: null },
        { title: '与凤行', year: '2024', poster: '', id: null },
        { title: '猎冰', year: '2024', poster: '', id: null },
        { title: '太平年', year: '2025', poster: '', id: null },
    ]
};

// 分类标签
const TRENDING_TABS = [
    { key: 'movie', label: '🎬 电影' },
    { key: 'tv',    label: '📺 剧集' },
];

let trendingCurrentTab  = 'movie';
let trendingCache       = {};  // { movie: [...], tv: [...] }
let trendingImgCache    = {};  // { title: proxyUrl }

// ── 初始化 ───────────────────────────────────────────────────────────────────
function initTrending() {
    const area = document.getElementById('trendingArea');
    if (!area) return;

    // 检查是否启用
    const enabled = localStorage.getItem('trendingEnabled') !== 'false'; // 默认开启
    if (!enabled) { area.classList.add('hidden'); return; }

    renderTrendingTabs();
    loadTrending(trendingCurrentTab);
}

// ── 标签切换 ─────────────────────────────────────────────────────────────────
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

// ── 数据加载 ─────────────────────────────────────────────────────────────────
async function loadTrending(type) {
    const grid = document.getElementById('trendingGrid');
    if (!grid) return;

    // 骨架屏
    grid.innerHTML = Array(10).fill(`
        <div class="animate-pulse">
            <div class="aspect-[2/3] rounded-lg bg-[#222]"></div>
            <div class="h-3 bg-[#222] rounded mt-2 w-3/4 mx-auto"></div>
        </div>`).join('');

    // 优先用缓存
    if (trendingCache[type]) {
        renderTrendingCards(trendingCache[type]);
        return;
    }

    try {
        const items = await fetchTMDBTrending(type);
        trendingCache[type] = items;
        renderTrendingCards(items);
    } catch (e) {
        console.warn('TMDB 获取失败，使用兜底数据', e);
        trendingCache[type] = FALLBACK_TRENDING[type];
        renderTrendingCards(FALLBACK_TRENDING[type]);
    }
}

async function fetchTMDBTrending(type) {
    // TMDB trending endpoint: /trending/{movie|tv}/week
    const url = `${TMDB_BASE}/trending/${type}/week?api_key=${TMDB_KEY}&language=zh-CN&page=1`;
    
    const authSuffix = window.ProxyAuth?.getAuthPrefix
        ? await window.ProxyAuth.getAuthPrefix()
        : '';
    const proxyUrl = PROXY_URL + encodeURIComponent(url) + authSuffix;

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 8000);

    const resp = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    if (!data.results?.length) throw new Error('无数据');

    return data.results.slice(0, 12).map(item => ({
        title:  item.title || item.name || '未知',
        year:   (item.release_date || item.first_air_date || '').slice(0, 4),
        poster: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : '',
        rating: item.vote_average ? item.vote_average.toFixed(1) : '',
        id:     item.id,
    }));
}

// ── 渲染卡片 ─────────────────────────────────────────────────────────────────
async function renderTrendingCards(items) {
    const grid = document.getElementById('trendingGrid');
    if (!grid) return;

    // 预取鉴权后缀（一次）
    const authSuffix = window.ProxyAuth?.getAuthPrefix
        ? await window.ProxyAuth.getAuthPrefix()
        : '';

    const fragment = document.createDocumentFragment();

    items.forEach((item, idx) => {
        const safeTitle = item.title
            .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // 封面：有 poster 则走代理，否则显示占位
        let imgSrc = '';
        if (item.poster) {
            if (trendingImgCache[item.title]) {
                imgSrc = trendingImgCache[item.title];
            } else {
                imgSrc = PROXY_URL + encodeURIComponent(item.poster) + authSuffix;
                trendingImgCache[item.title] = imgSrc;
            }
        }

        const card = document.createElement('div');
        card.className = 'trending-card group cursor-pointer';
        card.style.animationDelay = `${idx * 40}ms`;
        card.onclick = () => trendingSearch(item.title);
        card.innerHTML = `
            <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a1a] shadow-lg
                         group-hover:scale-105 group-hover:shadow-blue-900/30 group-hover:shadow-xl
                         transition-all duration-300">
                ${imgSrc
                    ? `<img src="${imgSrc}" alt="${safeTitle}"
                            class="w-full h-full object-cover"
                            loading="lazy"
                            onerror="this.parentElement.innerHTML=trendingPlaceholder('${safeTitle}')">`
                    : trendingPlaceholder(safeTitle)
                }
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent
                             opacity-0 group-hover:opacity-100 transition-opacity duration-300
                             flex items-end p-2">
                    <span class="text-white text-xs font-medium leading-tight line-clamp-2">${safeTitle}</span>
                </div>
                ${item.rating ? `
                <div class="absolute top-1.5 right-1.5 bg-black/70 text-yellow-400 text-[10px]
                             font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                    ★ ${item.rating}
                </div>` : ''}
                <div class="absolute inset-0 ring-2 ring-transparent group-hover:ring-blue-500/50
                             rounded-lg transition-all duration-300 pointer-events-none"></div>
            </div>
            <div class="mt-1.5 px-0.5">
                <p class="text-xs text-gray-300 truncate group-hover:text-white transition-colors leading-tight">
                    ${safeTitle}
                </p>
                ${item.year ? `<p class="text-[10px] text-gray-600 mt-0.5">${item.year}</p>` : ''}
            </div>`;
        fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
}

function trendingPlaceholder(title) {
    const firstChar = (title || '?')[0];
    return `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1e2a3a] to-[#111]">
        <span class="text-3xl font-bold text-gray-600">${firstChar}</span>
    </div>`;
}

// ── 点击搜索 ─────────────────────────────────────────────────────────────────
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

// ── 与豆瓣区域联动：搜索时隐藏，返回首页时重新显示 ──────────────────────────
function updateTrendingVisibility() {
    const area       = document.getElementById('trendingArea');
    const resultsArea = document.getElementById('resultsArea');
    if (!area) return;

    const enabled    = localStorage.getItem('trendingEnabled') !== 'false';
    const isSearching = resultsArea && !resultsArea.classList.contains('hidden');

    if (enabled && !isSearching) {
        area.classList.remove('hidden');
    } else {
        area.classList.add('hidden');
    }
}

// 页面加载
document.addEventListener('DOMContentLoaded', initTrending);
