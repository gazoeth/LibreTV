// 豆瓣热门电影电视剧推荐功能
// NOTE: 使用真实豆瓣 API（通过代理），非 TMDB 替代

// 豆瓣标签列表 - 修改为默认标签
let defaultMovieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '日综', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
let defaultTvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];

// 用户标签列表 - 存储用户实际使用的标签（包含保留的系统标签和用户添加的自定义标签）
let movieTags = [];
let tvTags = [];

// 加载用户标签
function loadUserTags() {
    try {
        const savedMovieTags = localStorage.getItem('userMovieTags');
        const savedTvTags = localStorage.getItem('userTvTags');

        if (savedMovieTags) {
            movieTags = JSON.parse(savedMovieTags);
        } else {
            movieTags = [...defaultMovieTags];
        }

        if (savedTvTags) {
            tvTags = JSON.parse(savedTvTags);
        } else {
            tvTags = [...defaultTvTags];
        }
    } catch (e) {
        console.error('加载标签失败：', e);
        movieTags = [...defaultMovieTags];
        tvTags = [...defaultTvTags];
    }
}

// 保存用户标签
function saveUserTags() {
    try {
        localStorage.setItem('userMovieTags', JSON.stringify(movieTags));
        localStorage.setItem('userTvTags', JSON.stringify(tvTags));
    } catch (e) {
        console.error('保存标签失败：', e);
        showToast('保存标签失败', 'error');
    }
}

let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16;

// 初始化豆瓣功能
function initDouban() {
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
        doubanToggle.checked = isEnabled;

        const toggleBg = doubanToggle.nextElementSibling;
        const toggleDot = toggleBg.nextElementSibling;
        if (isEnabled) {
            toggleBg.classList.add('bg-pink-600');
            toggleDot.classList.add('translate-x-6');
        }

        doubanToggle.addEventListener('change', function (e) {
            const isChecked = e.target.checked;
            localStorage.setItem('doubanEnabled', isChecked);

            if (isChecked) {
                toggleBg.classList.add('bg-pink-600');
                toggleDot.classList.add('translate-x-6');
            } else {
                toggleBg.classList.remove('bg-pink-600');
                toggleDot.classList.remove('translate-x-6');
            }

            updateDoubanVisibility();
        });

        updateDoubanVisibility();
        window.scrollTo(0, 0);
    }

    loadUserTags();
    renderDoubanMovieTvSwitch();
    renderDoubanTags();
    setupDoubanRefreshBtn();

    if (localStorage.getItem('doubanEnabled') === 'true') {
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
}

// 根据设置更新豆瓣区域的显示状态
function updateDoubanVisibility() {
    const doubanArea = document.getElementById('doubanArea');
    if (!doubanArea) return;

    const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
    const resultsEl = document.getElementById('resultsArea');
    const isSearching = resultsEl && !resultsEl.classList.contains('hidden');

    if (isEnabled && !isSearching) {
        doubanArea.style.display = '';
        doubanArea.classList.remove('hidden');
        if (document.getElementById('douban-results').children.length === 0) {
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    } else {
        doubanArea.style.display = 'none';
        doubanArea.classList.add('hidden');
    }

    // 联动外层热门推荐容器
    if (typeof updateHotRecommendArea === 'function') updateHotRecommendArea();
}

// 只填充搜索框，不执行搜索
function fillSearchInput(title) {
    if (!title) return;
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        input.focus();
        showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
    }
}

// 填充搜索框并执行搜索
function fillAndSearch(title) {
    if (!title) return;
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        search();
        try {
            const encodedQuery = encodeURIComponent(safeTitle);
            window.history.pushState({ search: safeTitle }, `搜索: ${safeTitle} - YiWuTV`, `/s=${encodedQuery}`);
            document.title = `搜索: ${safeTitle} - YiWuTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }
    }
}

// 填充搜索框，确保豆瓣资源API被选中，然后执行搜索
async function fillAndSearchWithDouban(title) {
    if (!title) return;
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // 确保豆瓣资源API被选中
    if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
        const doubanCheckbox = document.querySelector('input[id="api_dbzy"]');
        if (doubanCheckbox) {
            doubanCheckbox.checked = true;
            if (typeof updateSelectedAPIs === 'function') {
                updateSelectedAPIs();
            } else {
                selectedAPIs.push('dbzy');
                localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
                const countEl = document.getElementById('selectedAPICount');
                if (countEl) countEl.textContent = selectedAPIs.length;
            }
            showToast('已自动选择豆瓣资源API', 'info');
        }
    }

    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        await search();
        try {
            const encodedQuery = encodeURIComponent(safeTitle);
            window.history.pushState({ search: safeTitle }, `搜索: ${safeTitle} - YiWuTV`, `/s=${encodedQuery}`);
            document.title = `搜索: ${safeTitle} - YiWuTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }
        if (window.innerWidth <= 768) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}

// 渲染电影/电视剧切换器
function renderDoubanMovieTvSwitch() {
    const movieToggle = document.getElementById('douban-movie-toggle');
    const tvToggle = document.getElementById('douban-tv-toggle');
    if (!movieToggle || !tvToggle) return;

    movieToggle.addEventListener('click', function () {
        if (doubanMovieTvCurrentSwitch !== 'movie') {
            movieToggle.classList.add('bg-rose-600', 'text-white');
            movieToggle.classList.remove('text-gray-400');
            tvToggle.classList.remove('bg-rose-600', 'text-white');
            tvToggle.classList.add('text-gray-400');
            doubanMovieTvCurrentSwitch = 'movie';
            doubanCurrentTag = '热门';
            renderDoubanTags(movieTags);
            setupDoubanRefreshBtn();
            if (localStorage.getItem('doubanEnabled') === 'true') {
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
            }
        }
    });

    tvToggle.addEventListener('click', function () {
        if (doubanMovieTvCurrentSwitch !== 'tv') {
            tvToggle.classList.add('bg-rose-600', 'text-white');
            tvToggle.classList.remove('text-gray-400');
            movieToggle.classList.remove('bg-rose-600', 'text-white');
            movieToggle.classList.add('text-gray-400');
            doubanMovieTvCurrentSwitch = 'tv';
            doubanCurrentTag = '热门';
            renderDoubanTags(tvTags);
            setupDoubanRefreshBtn();
            if (localStorage.getItem('doubanEnabled') === 'true') {
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
            }
        }
    });
}

// 渲染豆瓣标签选择器
function renderDoubanTags(tags) {
    const tagContainer = document.getElementById('douban-tags');
    if (!tagContainer) return;

    const currentTags = doubanMovieTvCurrentSwitch === 'movie' ? movieTags : tvTags;
    tagContainer.innerHTML = '';

    // 标签管理按钮
    const manageBtn = document.createElement('button');
    manageBtn.className = `flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium
        transition-all duration-200 border whitespace-nowrap
        bg-[#1a1a1a] text-gray-400 border-[#2a2a2a] hover:text-white hover:border-[#444]`;
    manageBtn.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>管理';
    manageBtn.onclick = () => showTagManageModal();
    tagContainer.appendChild(manageBtn);

    // 所有标签
    currentTags.forEach(tag => {
        const btn = document.createElement('button');
        const isActive = tag === doubanCurrentTag;
        btn.className = `flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium
            transition-all duration-200 border whitespace-nowrap ${isActive
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-900/40'
                : 'bg-[#1a1a1a] text-gray-400 border-[#2a2a2a] hover:text-white hover:border-[#444]'
            }`;
        btn.textContent = tag;
        btn.onclick = () => {
            if (doubanCurrentTag !== tag) {
                doubanCurrentTag = tag;
                doubanPageStart = 0;
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
                renderDoubanTags();
            }
        };
        tagContainer.appendChild(btn);
    });
}

// 设置换一批按钮事件
function setupDoubanRefreshBtn() {
    const btn = document.getElementById('douban-refresh');
    if (!btn) return;
    btn.onclick = function () {
        doubanPageStart += doubanPageSize;
        if (doubanPageStart > 9 * doubanPageSize) doubanPageStart = 0;
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    };
}

function fetchDoubanTags() {
    const movieTagsTarget = `https://movie.douban.com/j/search_tags?type=movie`;
    fetchDoubanData(movieTagsTarget)
        .then(data => {
            movieTags = data.tags;
            if (doubanMovieTvCurrentSwitch === 'movie') renderDoubanTags(movieTags);
        })
        .catch(error => console.error("获取豆瓣热门电影标签失败：", error));

    const tvTagsTarget = `https://movie.douban.com/j/search_tags?type=tv`;
    fetchDoubanData(tvTagsTarget)
        .then(data => {
            tvTags = data.tags;
            if (doubanMovieTvCurrentSwitch === 'tv') renderDoubanTags(tvTags);
        })
        .catch(error => console.error("获取豆瓣热门电视剧标签失败：", error));
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

    fetchDoubanData(target)
        .then(data => renderDoubanCards(data, container))
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

/**
 * 豆瓣 API 数据请求（通过代理访问真实豆瓣接口）
 * NOTE: 豆瓣图片有 Referrer 限制，需要 referrerpolicy="no-referrer"
 */
async function fetchDoubanData(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const fetchOptions = {
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://movie.douban.com/',
            'Accept': 'application/json, text/plain, */*',
        }
    };

    try {
        // 通过代理访问豆瓣 API
        const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl
            ? await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(url))
            : PROXY_URL + encodeURIComponent(url);

        const response = await fetch(proxiedUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error("豆瓣 API 请求失败（直接代理）：", err);

        // 备用方案：allorigins 代理
        const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        try {
            const fallbackResponse = await fetch(fallbackUrl);
            if (!fallbackResponse.ok) throw new Error(`备用API请求失败! 状态: ${fallbackResponse.status}`);
            const data = await fallbackResponse.json();
            if (data && data.contents) {
                return JSON.parse(data.contents);
            }
            throw new Error("无法获取有效数据");
        } catch (fallbackErr) {
            console.error("豆瓣 API 备用请求也失败：", fallbackErr);
            throw fallbackErr;
        }
    }
}

/**
 * 渲染豆瓣卡片 - 海报风格（与搜索卡片视觉一致）
 * HACK: 豆瓣图片需要 referrerpolicy="no-referrer" 绕过防盗链
 */
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

    data.subjects.forEach((item, idx) => {
        const safeTitle = (item.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const rate = parseFloat(item.rate) || 0;
        const showRate = rate > 0;

        // 豆瓣图片：直接引用 + no-referrer，失败后用项目自带的 /proxy/ 兜底（适用于 Cloudflare Pages 部署）
        const originalCoverUrl = item.cover || '';
        const proxiedCoverUrl = originalCoverUrl ? `${PROXY_URL}${encodeURIComponent(originalCoverUrl)}` : '';

        const card = document.createElement('div');
        card.className = 'douban-card group cursor-pointer';
        card.style.animationDelay = `${idx * 30}ms`;
        card.onclick = () => fillAndSearchWithDouban(item.title);

        card.innerHTML = `
            <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#181818] shadow-md
                         group-hover:shadow-xl group-hover:shadow-black/50
                         group-hover:scale-[1.04] transition-all duration-300">
                ${originalCoverUrl ? `
                    <img src="${originalCoverUrl}" alt="${safeTitle}"
                         class="w-full h-full object-cover"
                         loading="lazy"
                         referrerpolicy="no-referrer"
                         onerror="this.onerror=function(){this.style.display='none';this.nextElementSibling.style.display='flex'};this.src='${proxiedCoverUrl}';">
                    <div class="hidden w-full h-full items-center justify-center bg-gradient-to-br from-[#1e2535] to-[#0f0f0f] absolute inset-0">
                        <span class="text-2xl font-bold text-gray-700">${safeTitle[0] || '?'}</span>
                    </div>` :
                `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1e2535] to-[#0f0f0f]">
                        <span class="text-2xl font-bold text-gray-700">${safeTitle[0] || '?'}</span>
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
                <!-- 豆瓣链接 -->
                <div class="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5
                            opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看"
                       onclick="event.stopPropagation();" class="text-[10px] text-gray-300 hover:text-white no-underline">
                        🔗 豆瓣
                    </a>
                </div>
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
    let modal = document.getElementById('tagManageModal');
    if (modal) document.body.removeChild(modal);

    modal = document.createElement('div');
    modal.id = 'tagManageModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-40';

    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;
    const defaultTags = isMovie ? defaultMovieTags : defaultTvTags;

    modal.innerHTML = `
        <div class="bg-[#191919] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
            <button id="closeTagModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">&times;</button>
            <h3 class="text-xl font-bold text-white mb-4">标签管理 (${isMovie ? '电影' : '电视剧'})</h3>
            <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="text-lg font-medium text-gray-300">标签列表</h4>
                    <button id="resetTagsBtn" class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">恢复默认标签</button>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4" id="tagsGrid">
                    ${currentTags.length ? currentTags.map(tag => {
        const canDelete = tag !== '热门';
        return `
                            <div class="bg-[#1a1a1a] text-gray-300 py-1.5 px-3 rounded text-sm font-medium flex justify-between items-center group">
                                <span>${tag}</span>
                                ${canDelete
                ? `<button class="delete-tag-btn text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" data-tag="${tag}">✕</button>`
                : `<span class="text-gray-500 text-xs italic opacity-0 group-hover:opacity-100">必需</span>`
            }
                            </div>`;
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

    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('newTagInput').focus(), 100);

    document.getElementById('closeTagModal').addEventListener('click', () => document.body.removeChild(modal));
    modal.addEventListener('click', e => { if (e.target === modal) document.body.removeChild(modal); });
    document.getElementById('resetTagsBtn').addEventListener('click', () => { resetTagsToDefault(); showTagManageModal(); });

    document.querySelectorAll('.delete-tag-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            deleteTag(this.getAttribute('data-tag'));
            showTagManageModal();
        });
    });

    document.getElementById('addTagForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const input = document.getElementById('newTagInput');
        const newTag = input.value.trim();
        if (newTag) { addTag(newTag); input.value = ''; showTagManageModal(); }
    });
}

// 添加标签
function addTag(tag) {
    const safeTag = tag.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;

    if (currentTags.some(t => t.toLowerCase() === safeTag.toLowerCase())) {
        showToast('标签已存在', 'warning');
        return;
    }

    if (isMovie) { movieTags.push(safeTag); } else { tvTags.push(safeTag); }
    saveUserTags();
    renderDoubanTags();
    showToast('标签添加成功', 'success');
}

// 删除标签
function deleteTag(tag) {
    if (tag === '热门') { showToast('热门标签不能删除', 'warning'); return; }

    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;
    const index = currentTags.indexOf(tag);

    if (index !== -1) {
        currentTags.splice(index, 1);
        saveUserTags();
        if (doubanCurrentTag === tag) {
            doubanCurrentTag = '热门';
            doubanPageStart = 0;
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
        renderDoubanTags();
        showToast('标签删除成功', 'success');
    }
}

// 重置为默认标签
function resetTagsToDefault() {
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    if (isMovie) { movieTags = [...defaultMovieTags]; } else { tvTags = [...defaultTvTags]; }
    doubanCurrentTag = '热门';
    doubanPageStart = 0;
    saveUserTags();
    renderDoubanTags();
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    showToast('已恢复默认标签', 'success');
}
