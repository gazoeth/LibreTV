// 豆瓣热门电影电视剧推荐功能

// ── JustWatch 风格平台标签配置 ──────────────────────────────────────────────
// 映射：显示名 → TMDB watch_providers ID（台湾地区）
const PLATFORM_TAGS = {
    movie: [
        { label: '🔥 本周热门',  tag: '热门',    icon: '' },
        { label: '🆕 最新上映',  tag: '最新',    icon: '' },
        { label: '⭐ 高分推荐',  tag: '豆瓣高分', icon: '' },
        { label: '🎬 动作',      tag: '动作',    icon: '' },
        { label: '😄 喜剧',      tag: '喜剧',    icon: '' },
        { label: '💕 爱情',      tag: '爱情',    icon: '' },
        { label: '🚀 科幻',      tag: '科幻',    icon: '' },
        { label: '🔍 悬疑',      tag: '悬疑',    icon: '' },
        { label: '😱 恐怖',      tag: '恐怖',    icon: '' },
        { label: '🌏 华语',      tag: '华语',    icon: '' },
        { label: '🎭 欧美',      tag: '欧美',    icon: '' },
        { label: '🌸 日本',      tag: '日本',    icon: '' },
        { label: '🇰🇷 韩国',    tag: '韩国',    icon: '' },
    ],
    tv: [
        { label: '🔥 本周热门',  tag: '热门',    icon: '' },
        { label: '🆕 最新剧集',  tag: '最新',    icon: '' },
        { label: '🇺🇸 美剧',    tag: '美剧',    icon: '' },
        { label: '🇰🇷 韩剧',    tag: '韩剧',    icon: '' },
        { label: '🇨🇳 国产剧',  tag: '国产剧',  icon: '' },
        { label: '🇯🇵 日剧',    tag: '日剧',    icon: '' },
        { label: '🇬🇧 英剧',    tag: '英剧',    icon: '' },
        { label: '🇭🇰 港剧',    tag: '港剧',    icon: '' },
        { label: '🎌 动漫',      tag: '日本动画', icon: '' },
        { label: '📺 综艺',      tag: '综艺',    icon: '' },
        { label: '🎙️ 纪录片',   tag: '纪录片',  icon: '' },
    ]
};

// 兼容旧代码引用
let defaultMovieTags = PLATFORM_TAGS.movie.map(p => p.tag);
let defaultTvTags    = PLATFORM_TAGS.tv.map(p => p.tag);
let movieTags = [...defaultMovieTags];
let tvTags    = [...defaultTvTags];

function loadUserTags() {
    movieTags = [...defaultMovieTags];
    tvTags    = [...defaultTvTags];
}
function saveUserTags() {}

let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16; // 一次显示的项目数量

// 初始化豆瓣功能
function initDouban() {
    // 设置豆瓣开关的初始状态
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
        doubanToggle.checked = isEnabled;
        
        // 设置开关外观
        const toggleBg = doubanToggle.nextElementSibling;
        const toggleDot = toggleBg.nextElementSibling;
        if (isEnabled) {
            toggleBg.classList.add('bg-pink-600');
            toggleDot.classList.add('translate-x-6');
        }
        
        // 添加事件监听
        doubanToggle.addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            localStorage.setItem('doubanEnabled', isChecked);
            
            // 更新开关外观
            if (isChecked) {
                toggleBg.classList.add('bg-pink-600');
                toggleDot.classList.add('translate-x-6');
            } else {
                toggleBg.classList.remove('bg-pink-600');
                toggleDot.classList.remove('translate-x-6');
            }
            
            // 更新显示状态
            updateDoubanVisibility();
        });
        
        // 初始更新显示状态
        updateDoubanVisibility();

        // 滚动到页面顶部
        window.scrollTo(0, 0);
    }

    // 加载用户标签
    loadUserTags();

    // 渲染电影/电视剧切换
    renderDoubanMovieTvSwitch();
    
    // 渲染豆瓣标签
    renderDoubanTags();
    
    // 换一批按钮事件监听
    setupDoubanRefreshBtn();
    
    // 初始加载热门内容
    if (localStorage.getItem('doubanEnabled') === 'true') {
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }

    // 初始化热门榜单（与豆瓣同步）
    if (typeof initTrending === 'function') {
        initTrending();
    }
}

// 根据设置更新豆瓣区域的显示状态
function updateDoubanVisibility() {
    const doubanArea = document.getElementById('doubanArea');
    if (!doubanArea) return;
    
    const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
    const isSearching = document.getElementById('resultsArea') && 
        !document.getElementById('resultsArea').classList.contains('hidden');
    
    // 只有在启用且没有搜索结果显示时才显示豆瓣区域
    if (isEnabled && !isSearching) {
        doubanArea.classList.remove('hidden');
        // 如果豆瓣结果为空，重新加载
        if (document.getElementById('douban-results').children.length === 0) {
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    } else {
        doubanArea.classList.add('hidden');
    }

    // 同步更新热门榜单显示状态
    if (typeof updateTrendingVisibility === 'function') {
        updateTrendingVisibility();
    }
}

// 只填充搜索框，不执行搜索，让用户自主决定搜索时机
function fillSearchInput(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        
        // 聚焦搜索框，便于用户立即使用键盘操作
        input.focus();
        
        // 显示一个提示，告知用户点击搜索按钮进行搜索
        showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
    }
}

// 填充搜索框并执行搜索
function fillAndSearch(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        search(); // 使用已有的search函数执行搜索
        
        // 同时更新浏览器URL，使其反映当前的搜索状态
        try {
            // 使用URI编码确保特殊字符能够正确显示
            const encodedQuery = encodeURIComponent(safeTitle);
            // 使用HTML5 History API更新URL，不刷新页面
            window.history.pushState(
                { search: safeTitle }, 
                `搜索: ${safeTitle} - LibreTV`, 
                `/s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${safeTitle} - LibreTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }
    }
}

// 填充搜索框，确保豆瓣资源API被选中，然后执行搜索
async function fillAndSearchWithDouban(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    // 确保豆瓣资源API被选中
    if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
        // 在设置中勾选豆瓣资源API复选框
        const doubanCheckbox = document.querySelector('input[id="api_dbzy"]');
        if (doubanCheckbox) {
            doubanCheckbox.checked = true;
            
            // 触发updateSelectedAPIs函数以更新状态
            if (typeof updateSelectedAPIs === 'function') {
                updateSelectedAPIs();
            } else {
                // 如果函数不可用，则手动添加到selectedAPIs
                selectedAPIs.push('dbzy');
                localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
                
                // 更新选中API计数（如果有这个元素）
                const countEl = document.getElementById('selectedAPICount');
                if (countEl) {
                    countEl.textContent = selectedAPIs.length;
                }
            }
            
            showToast('已自动选择豆瓣资源API', 'info');
        }
    }
    
    // 填充搜索框并执行搜索
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        await search(); // 使用已有的search函数执行搜索
        
        // 更新浏览器URL，使其反映当前的搜索状态
        try {
            // 使用URI编码确保特殊字符能够正确显示
            const encodedQuery = encodeURIComponent(safeTitle);
            // 使用HTML5 History API更新URL，不刷新页面
            window.history.pushState(
                { search: safeTitle }, 
                `搜索: ${safeTitle} - LibreTV`, 
                `/s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${safeTitle} - LibreTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }

        if (window.innerWidth <= 768) {
          window.scrollTo({
              top: 0,
              behavior: 'smooth'
          });
        }
    }
}

// 渲染电影/电视剧切换器
function renderDoubanMovieTvSwitch() {
    // 获取切换按钮元素
    const movieToggle = document.getElementById('douban-movie-toggle');
    const tvToggle = document.getElementById('douban-tv-toggle');

    if (!movieToggle ||!tvToggle) return;

    movieToggle.addEventListener('click', function() {
        if (doubanMovieTvCurrentSwitch !== 'movie') {
            // 更新按钮样式
            movieToggle.classList.add('bg-rose-600', 'text-white');
            movieToggle.classList.remove('text-gray-400');
            
            tvToggle.classList.remove('bg-rose-600', 'text-white');
            tvToggle.classList.add('text-gray-400');
            
            doubanMovieTvCurrentSwitch = 'movie';
            doubanCurrentTag = '热门';

            // 重新加载豆瓣内容
            renderDoubanTags(movieTags);

            // 换一批按钮事件监听
            setupDoubanRefreshBtn();
            
            // 初始加载热门内容
            if (localStorage.getItem('doubanEnabled') === 'true') {
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
            }
        }
    });
    
    // 电视剧按钮点击事件
    tvToggle.addEventListener('click', function() {
        if (doubanMovieTvCurrentSwitch !== 'tv') {
            // 更新按钮样式
            tvToggle.classList.add('bg-rose-600', 'text-white');
            tvToggle.classList.remove('text-gray-400');
            
            movieToggle.classList.remove('bg-rose-600', 'text-white');
            movieToggle.classList.add('text-gray-400');
            
            doubanMovieTvCurrentSwitch = 'tv';
            doubanCurrentTag = '热门';

            // 重新加载豆瓣内容
            renderDoubanTags(tvTags);

            // 换一批按钮事件监听
            setupDoubanRefreshBtn();
            
            // 初始加载热门内容
            if (localStorage.getItem('doubanEnabled') === 'true') {
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
            }
        }
    });
}

// 渲染 JustWatch 风格平台/类型标签筛选器
function renderDoubanTags(tags) {
    const tagContainer = document.getElementById('douban-tags');
    if (!tagContainer) return;

    const platformList = doubanMovieTvCurrentSwitch === 'movie'
        ? PLATFORM_TAGS.movie
        : PLATFORM_TAGS.tv;

    tagContainer.innerHTML = '';

    platformList.forEach(platform => {
        const btn = document.createElement('button');
        const isActive = platform.tag === doubanCurrentTag;

        btn.className = `flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium
            transition-all duration-200 border whitespace-nowrap ${
            isActive
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-900/40'
                : 'bg-[#1a1a1a] text-gray-400 border-[#2a2a2a] hover:text-white hover:border-[#444]'
        }`;
        btn.textContent = platform.label;

        btn.onclick = () => {
            if (doubanCurrentTag !== platform.tag) {
                doubanCurrentTag = platform.tag;
                doubanPageStart  = 0;
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
                renderDoubanTags();
            }
        };
        tagContainer.appendChild(btn);
    });
}

// 设置换一批按钮事件
function setupDoubanRefreshBtn() {
    // 修复ID，使用正确的ID douban-refresh 而不是 douban-refresh-btn
    const btn = document.getElementById('douban-refresh');
    if (!btn) return;
    
    btn.onclick = function() {
        doubanPageStart += doubanPageSize;
        if (doubanPageStart > 9 * doubanPageSize) {
            doubanPageStart = 0;
        }
        
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    };
}

function fetchDoubanTags() {
    const movieTagsTarget = `https://movie.douban.com/j/search_tags?type=movie`
    fetchDoubanData(movieTagsTarget)
        .then(data => {
            movieTags = data.tags;
            if (doubanMovieTvCurrentSwitch === 'movie') {
                renderDoubanTags(movieTags);
            }
        })
        .catch(error => {
            console.error("获取豆瓣热门电影标签失败：", error);
        });
    const tvTagsTarget = `https://movie.douban.com/j/search_tags?type=tv`
    fetchDoubanData(tvTagsTarget)
       .then(data => {
            tvTags = data.tags;
            if (doubanMovieTvCurrentSwitch === 'tv') {
                renderDoubanTags(tvTags);
            }
        })
       .catch(error => {
            console.error("获取豆瓣热门电视剧标签失败：", error);
        });
}

// 渲染热门推荐内容
function renderRecommend(tag, pageLimit, pageStart) {
    const container = document.getElementById("douban-results");
    if (!container) return;

    const loadingOverlayHTML = `
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div class="flex items-center justify-center">
                <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin inline-block"></div>
                <span class="text-pink-500 ml-4">加载中...</span>
            </div>
        </div>
    `;

    container.classList.add("relative");
    container.insertAdjacentHTML('beforeend', loadingOverlayHTML);
    
    const target = `https://movie.douban.com/j/search_subjects?type=${doubanMovieTvCurrentSwitch}&tag=${tag}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;
    
    // 使用通用请求函数
    fetchDoubanData(target)
        .then(data => {
            renderDoubanCards(data, container);
        })
        .catch(error => {
            console.error("获取豆瓣数据失败：", error);
            container.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <div class="text-red-400">❌ 获取豆瓣数据失败，请稍后重试</div>
                    <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
                </div>
            `;
        });
}

// fetchDoubanData：豆瓣 API 已被封（403），改用 TMDB 数据源
// 将豆瓣 URL 映射为对应的 TMDB 请求，保持接口兼容
const TMDB_KEY_DB  = 'b91a299b0c1cccf59e8765f913a24da2';
const TMDB_BASE_DB = 'https://api.themoviedb.org/3';
const TMDB_IMG_DB  = 'https://image.tmdb.org/t/p/w300';

// 豆瓣标签 → TMDB genre_id 映射（中文标签 → TMDB 电影/剧集类型ID）
const DOUBAN_TAG_TO_TMDB_GENRE = {
    '热门': null, '最新': null, '经典': null, '豆瓣高分': null, '冷门佳片': null,
    '华语': null, '欧美': null, '韩国': null, '日本': null,
    '动作': 28, '喜剧': 35, '爱情': 10749, '科幻': 878,
    '悬疑': 9648, '恐怖': 27, '治愈': 18, '动画': 16,
    // TV
    '美剧': null, '英剧': null, '韩剧': null, '日剧': null,
    '国产剧': null, '港剧': null, '日本动画': 16, '综艺': 10764, '纪录片': 99,
};

// 豆瓣标签 → TMDB 语言/地区过滤
const DOUBAN_TAG_TO_REGION = {
    '华语': 'zh', '欧美': 'en', '韩国': 'ko', '日本': 'ja',
    '美剧': 'en', '英剧': 'en', '韩剧': 'ko', '日剧': 'ja', '港剧': 'zh',
};

async function fetchDoubanData(url) {
    // 解析豆瓣 URL 参数，映射为 TMDB 请求
    const urlObj   = new URL(url);
    const type     = urlObj.searchParams.get('type') || 'movie';   // movie | tv
    const tag      = urlObj.searchParams.get('tag')  || '热门';
    const limit    = parseInt(urlObj.searchParams.get('page_limit') || '16');
    const start    = parseInt(urlObj.searchParams.get('page_start') || '0');
    const page     = Math.floor(start / limit) + 1;
    const tmdbType = type === 'movie' ? 'movie' : 'tv';

    let tmdbUrl;
    const genreId  = DOUBAN_TAG_TO_TMDB_GENRE[tag];
    const langCode = DOUBAN_TAG_TO_REGION[tag];

    if (tag === '热门' || tag === '最新') {
        // 当周热门
        tmdbUrl = `${TMDB_BASE_DB}/trending/${tmdbType}/week?api_key=${TMDB_KEY_DB}&language=zh-CN&page=${page}`;
    } else if (tag === '经典' || tag === '豆瓣高分') {
        // 高评分
        tmdbUrl = `${TMDB_BASE_DB}/discover/${tmdbType}?api_key=${TMDB_KEY_DB}&language=zh-CN&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`;
    } else if (tag === '冷门佳片') {
        tmdbUrl = `${TMDB_BASE_DB}/discover/${tmdbType}?api_key=${TMDB_KEY_DB}&language=zh-CN&sort_by=vote_average.desc&vote_count.gte=100&vote_count.lte=999&page=${page}`;
    } else if (tag === '纪录片' || tag === '综艺' || tag === '日本动画') {
        tmdbUrl = `${TMDB_BASE_DB}/discover/${tmdbType}?api_key=${TMDB_KEY_DB}&language=zh-CN&with_genres=${genreId || ''}&page=${page}`;
    } else if (genreId) {
        // 有类型ID：按类型筛选
        const langParam = langCode ? `&with_original_language=${langCode}` : '';
        tmdbUrl = `${TMDB_BASE_DB}/discover/${tmdbType}?api_key=${TMDB_KEY_DB}&language=zh-CN&with_genres=${genreId}${langParam}&sort_by=popularity.desc&page=${page}`;
    } else if (langCode) {
        // 仅有语言，无类型
        tmdbUrl = `${TMDB_BASE_DB}/discover/${tmdbType}?api_key=${TMDB_KEY_DB}&language=zh-CN&with_original_language=${langCode}&sort_by=popularity.desc&page=${page}`;
    } else {
        // 兜底：热门
        tmdbUrl = `${TMDB_BASE_DB}/trending/${tmdbType}/week?api_key=${TMDB_KEY_DB}&language=zh-CN&page=${page}`;
    }

    try {
        const resp = await fetch(tmdbUrl, {
            signal: AbortSignal.timeout(8000),
            headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) throw new Error(`TMDB HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.results?.length) throw new Error('TMDB 无数据');

        // 转换为豆瓣格式（renderDoubanCards 期望 { subjects: [...] }）
        const subjects = data.results.slice(0, limit).map(item => ({
            title:  item.title || item.name || '未知',
            rate:   item.vote_average ? item.vote_average.toFixed(1) : '',
            cover:  item.poster_path ? `${TMDB_IMG_DB}${item.poster_path}` : '',
            url:    `https://www.themoviedb.org/${tmdbType}/${item.id}`,
            id:     item.id,
            _tmdb:  true,  // 标记为 TMDB 数据，封面无需代理
        }));
        return { subjects };
    } catch (err) {
        console.error('TMDB 请求失败，尝试代理:', err.message);
        // 代理兜底
        const authSuffix = window.ProxyAuth?.getAuthPrefix ? await window.ProxyAuth.getAuthPrefix() : '';
        const proxied    = PROXY_URL + encodeURIComponent(tmdbUrl) + authSuffix;
        const r2 = await fetch(proxied, { signal: AbortSignal.timeout(8000) });
        if (!r2.ok) throw new Error(`代理也失败: ${r2.status}`);
        const d2 = await r2.json();
        const subjects = (d2.results || []).slice(0, limit).map(item => ({
            title: item.title || item.name || '未知',
            rate:  item.vote_average ? item.vote_average.toFixed(1) : '',
            cover: item.poster_path ? `${TMDB_IMG_DB}${item.poster_path}` : '',
            url:   `https://www.themoviedb.org/${tmdbType}/${item.id}`,
            id:    item.id,
            _tmdb: true,
        }));
        return { subjects };
    }
}

// 抽取渲染豆瓣卡片的逻辑到单独函数
// 抽取渲染豆瓣卡片的逻辑到单独函数
// JustWatch 风格卡片渲染
async function renderDoubanCards(data, container) {
    const fragment = document.createDocumentFragment();

    if (!data.subjects || data.subjects.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'col-span-full text-center py-12 text-gray-500';
        emptyEl.innerHTML = '暂无数据，请选择其他分类';
        fragment.appendChild(emptyEl);
        container.innerHTML = '';
        container.appendChild(fragment);
        return;
    }

    // TMDB 图片直接引用，不走代理
    const authSuffix = (!data.subjects[0]?._tmdb && window.ProxyAuth?.getAuthPrefix)
        ? await window.ProxyAuth.getAuthPrefix()
        : '';

    data.subjects.forEach((item, idx) => {
        const safeTitle = (item.title || '').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const rate      = parseFloat(item.rate) || 0;
        const showRate  = rate > 0;

        // 封面：TMDB 直接引用，旧豆瓣走代理
        const imgSrc = item._tmdb
            ? (item.cover || '')
            : (item.cover ? PROXY_URL + encodeURIComponent(item.cover) + authSuffix : '');

        const card = document.createElement('div');
        card.className = 'douban-card group cursor-pointer';
        card.style.animationDelay = `${idx * 30}ms`;
        card.onclick = () => fillAndSearchWithDouban(item.title);

        card.innerHTML = `
            <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#181818] shadow-md
                         group-hover:shadow-xl group-hover:shadow-black/50
                         group-hover:scale-[1.04] transition-all duration-300">
                ${imgSrc ? `
                    <img src="${imgSrc}" alt="${safeTitle}"
                         class="w-full h-full object-cover"
                         loading="lazy"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="hidden w-full h-full items-center justify-center bg-gradient-to-br from-[#1e2535] to-[#0f0f0f] absolute inset-0">
                        <span class="text-2xl font-bold text-gray-700">${safeTitle[0]||'?'}</span>
                    </div>` :
                    `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1e2535] to-[#0f0f0f]">
                        <span class="text-2xl font-bold text-gray-700">${safeTitle[0]||'?'}</span>
                    </div>`
                }
                <!-- 评分徽章 -->
                ${showRate ? `
                <div class="absolute top-1.5 left-1.5 flex items-center gap-0.5
                             bg-black/70 backdrop-blur-sm text-yellow-400 text-[10px]
                             font-bold px-1.5 py-0.5 rounded-md leading-tight">
                    <svg class="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                    ${rate.toFixed(1)}
                </div>` : ''}
                <!-- 悬停搜索提示 -->
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100
                             transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-2">
                    <svg class="w-8 h-8 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <span class="text-white text-xs text-center font-medium leading-tight line-clamp-2">${safeTitle}</span>
                </div>
            </div>
            <!-- 标题 -->
            <div class="mt-1.5 px-0.5">
                <p class="text-[11px] text-gray-400 truncate group-hover:text-white transition-colors font-medium leading-snug">
                    ${safeTitle}
                </p>
            </div>`;

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}
     

// 重置到首页
function resetToHome() {
    resetSearchArea();
    updateDoubanVisibility();
}

// 加载豆瓣首页内容
document.addEventListener('DOMContentLoaded', initDouban);

// 显示标签管理模态框
function showTagManageModal() {
    // 确保模态框在页面上只有一个实例
    let modal = document.getElementById('tagManageModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    
    // 创建模态框元素
    modal = document.createElement('div');
    modal.id = 'tagManageModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-40';
    
    // 当前使用的标签类型和默认标签
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;
    const defaultTags = isMovie ? defaultMovieTags : defaultTvTags;
    
    // 模态框内容
    modal.innerHTML = `
        <div class="bg-[#191919] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
            <button id="closeTagModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">&times;</button>
            
            <h3 class="text-xl font-bold text-white mb-4">标签管理 (${isMovie ? '电影' : '电视剧'})</h3>
            
            <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="text-lg font-medium text-gray-300">标签列表</h4>
                    <button id="resetTagsBtn" class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">
                        恢复默认标签
                    </button>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4" id="tagsGrid">
                    ${currentTags.length ? currentTags.map(tag => {
                        // "热门"标签不能删除
                        const canDelete = tag !== '热门';
                        return `
                            <div class="bg-[#1a1a1a] text-gray-300 py-1.5 px-3 rounded text-sm font-medium flex justify-between items-center group">
                                <span>${tag}</span>
                                ${canDelete ? 
                                    `<button class="delete-tag-btn text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" 
                                        data-tag="${tag}">✕</button>` : 
                                    `<span class="text-gray-500 text-xs italic opacity-0 group-hover:opacity-100">必需</span>`
                                }
                            </div>
                        `;
                    }).join('') : 
                    `<div class="col-span-full text-center py-4 text-gray-500">无标签，请添加或恢复默认</div>`}
                </div>
            </div>
            
            <div class="border-t border-gray-700 pt-4">
                <h4 class="text-lg font-medium text-gray-300 mb-3">添加新标签</h4>
                <form id="addTagForm" class="flex items-center">
                    <input type="text" id="newTagInput" placeholder="输入标签名称..." 
                           class="flex-1 bg-[#222] text-white border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-pink-500">
                    <button type="submit" class="ml-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded">添加</button>
                </form>
                <p class="text-xs text-gray-500 mt-2">提示：标签名称不能为空，不能重复，不能包含特殊字符</p>
            </div>
        </div>
    `;
    
    // 添加模态框到页面
    document.body.appendChild(modal);
    
    // 焦点放在输入框上
    setTimeout(() => {
        document.getElementById('newTagInput').focus();
    }, 100);
    
    // 添加事件监听器 - 关闭按钮
    document.getElementById('closeTagModal').addEventListener('click', function() {
        document.body.removeChild(modal);
    });
    
    // 添加事件监听器 - 点击模态框外部关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // 添加事件监听器 - 恢复默认标签按钮
    document.getElementById('resetTagsBtn').addEventListener('click', function() {
        resetTagsToDefault();
        showTagManageModal(); // 重新加载模态框
    });
    
    // 添加事件监听器 - 删除标签按钮
    const deleteButtons = document.querySelectorAll('.delete-tag-btn');
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const tagToDelete = this.getAttribute('data-tag');
            deleteTag(tagToDelete);
            showTagManageModal(); // 重新加载模态框
        });
    });
    
    // 添加事件监听器 - 表单提交
    document.getElementById('addTagForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const input = document.getElementById('newTagInput');
        const newTag = input.value.trim();
        
        if (newTag) {
            addTag(newTag);
            input.value = '';
            showTagManageModal(); // 重新加载模态框
        }
    });
}

// 添加标签
function addTag(tag) {
    // 安全处理标签名，防止XSS
    const safeTag = tag
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    // 确定当前使用的是电影还是电视剧标签
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;
    
    // 检查是否已存在（忽略大小写）
    const exists = currentTags.some(
        existingTag => existingTag.toLowerCase() === safeTag.toLowerCase()
    );
    
    if (exists) {
        showToast('标签已存在', 'warning');
        return;
    }
    
    // 添加到对应的标签数组
    if (isMovie) {
        movieTags.push(safeTag);
    } else {
        tvTags.push(safeTag);
    }
    
    // 保存到本地存储
    saveUserTags();
    
    // 重新渲染标签
    renderDoubanTags();
    
    showToast('标签添加成功', 'success');
}

// 删除标签
function deleteTag(tag) {
    // 热门标签不能删除
    if (tag === '热门') {
        showToast('热门标签不能删除', 'warning');
        return;
    }
    
    // 确定当前使用的是电影还是电视剧标签
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;
    
    // 寻找标签索引
    const index = currentTags.indexOf(tag);
    
    // 如果找到标签，则删除
    if (index !== -1) {
        currentTags.splice(index, 1);
        
        // 保存到本地存储
        saveUserTags();
        
        // 如果当前选中的是被删除的标签，则重置为"热门"
        if (doubanCurrentTag === tag) {
            doubanCurrentTag = '热门';
            doubanPageStart = 0;
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
        
        // 重新渲染标签
        renderDoubanTags();
        
        showToast('标签删除成功', 'success');
    }
}

// 重置为默认标签
function resetTagsToDefault() {
    // 确定当前使用的是电影还是电视剧
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    
    // 重置为默认标签
    if (isMovie) {
        movieTags = [...defaultMovieTags];
    } else {
        tvTags = [...defaultTvTags];
    }
    
    // 设置当前标签为热门
    doubanCurrentTag = '热门';
    doubanPageStart = 0;
    
    // 保存到本地存储
    saveUserTags();
    
    // 重新渲染标签和内容
    renderDoubanTags();
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    
    showToast('已恢复默认标签', 'success');
}
