const selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '[]');
const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]'); // 存储自定义API列表

// 改进返回功能
function goBack(event) {
    // 防止默认链接行为
    if (event) event.preventDefault();
    
    // 1. 优先检查URL参数中的returnUrl
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    if (returnUrl) {
        // 如果URL中有returnUrl参数，优先使用
        window.location.href = decodeURIComponent(returnUrl);
        return;
    }
    
    // 2. 检查localStorage中保存的lastPageUrl
    const lastPageUrl = localStorage.getItem('lastPageUrl');
    if (lastPageUrl && lastPageUrl !== window.location.href) {
        window.location.href = lastPageUrl;
        return;
    }
    
    // 3. 检查是否是从搜索页面进入的播放器
    const referrer = document.referrer;
    
    // 检查 referrer 是否包含搜索参数
    if (referrer && (referrer.includes('/s=') || referrer.includes('?s='))) {
        // 如果是从搜索页面来的，返回到搜索页面
        window.location.href = referrer;
        return;
    }
    
    // 4. 如果是在iframe中打开的，尝试关闭iframe
    if (window.self !== window.top) {
        try {
            // 尝试调用父窗口的关闭播放器函数
            window.parent.closeVideoPlayer && window.parent.closeVideoPlayer();
            return;
        } catch (e) {
            console.error('调用父窗口closeVideoPlayer失败:', e);
        }
    }
    
    // 5. 无法确定上一页，则返回首页
    if (!referrer || referrer === '') {
        window.location.href = '/';
        return;
    }
    
    // 6. 以上都不满足，使用默认行为：返回上一页
    window.history.back();
}

// 页面加载时保存当前URL到localStorage，作为返回目标
window.addEventListener('load', function () {
    // 保存前一页面URL
    if (document.referrer && document.referrer !== window.location.href) {
        localStorage.setItem('lastPageUrl', document.referrer);
    }

    // 提取当前URL中的重要参数，以便在需要时能够恢复当前页面
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');
    const sourceCode = getCurrentSourceCode(urlParams);

    if (videoId && sourceCode) {
        // 保存当前播放状态，以便其他页面可以返回
        localStorage.setItem('currentPlayingId', videoId);
        localStorage.setItem('currentPlayingSource', sourceCode);
    }
});


// =================================
// ============== PLAYER ==========
// =================================
// 全局变量
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let art = null; // 用于 ArtPlayer 实例
let currentHls = null; // 跟踪当前HLS实例
let currentEpisodes = [];
let episodesReversed = false;
let autoplayEnabled = true; // 默认开启自动连播
let videoHasEnded = false; // 跟踪视频是否已经自然结束
let userClickedPosition = null; // 记录用户点击的位置
let shortcutHintTimeout = null; // 用于控制快捷键提示显示时间
let adFilteringEnabled = true; // 默认开启广告过滤
let progressSaveInterval = null; // 定期保存进度的计时器
let currentVideoUrl = ''; // 记录当前实际的视频URL
let resourceSwitchInProgress = false;
let resourceModalKeydownHandler = null;
let resourceModalPreviousFocus = null;
const VISUAL_CLEAN_STORAGE_KEY = 'visualCleanRules.v1';
const VISUAL_CLEAN_MODES = [
    { key: 'off', label: '关闭', className: '' },
    { key: 'bottom-right', label: '右下角遮罩', className: 'clean-mask-bottom-right' },
    { key: 'bottom-left', label: '左下角遮罩', className: 'clean-mask-bottom-left' },
    { key: 'top-right', label: '右上角遮罩', className: 'clean-mask-top-right' },
    { key: 'top-left', label: '左上角遮罩', className: 'clean-mask-top-left' },
    { key: 'crop-bottom', label: '底部跑马灯', className: 'clean-crop-bottom' },
    { key: 'crop-top', label: '顶部跑马灯', className: 'clean-crop-top' },
    { key: 'crop-bottom-right', label: '底部+右下角', className: 'clean-crop-bottom-right' }
];
let currentVisualCleanMode = 'off';
const isWebkit = (typeof window.webkitConvertPointFromNodeToPage === 'function')
Artplayer.FULLSCREEN_WEB_IN_BODY = true;

function getCurrentSourceCode(params = new URLSearchParams(window.location.search)) {
    return params.get('source_code') || params.get('source') || '';
}

function readVisualCleanRules() {
    try {
        const parsed = JSON.parse(localStorage.getItem(VISUAL_CLEAN_STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function getVisualCleanModeForSource(sourceKey = getCurrentSourceCode()) {
    const savedMode = readVisualCleanRules()[sourceKey] || 'off';
    return VISUAL_CLEAN_MODES.some(mode => mode.key === savedMode) ? savedMode : 'off';
}

function saveVisualCleanModeForSource(sourceKey, modeKey) {
    if (!sourceKey) return;
    try {
        const rules = readVisualCleanRules();
        if (modeKey === 'off') delete rules[sourceKey];
        else rules[sourceKey] = modeKey;
        localStorage.setItem(VISUAL_CLEAN_STORAGE_KEY, JSON.stringify(rules));
    } catch (error) {}
}

function applyVisualCleanMode(modeKey, options = {}) {
    const container = document.getElementById('playerContainer');
    const button = document.getElementById('visualCleanButton');
    const text = document.getElementById('visualCleanText');
    if (!container) return;

    const selectedMode = VISUAL_CLEAN_MODES.find(mode => mode.key === modeKey) || VISUAL_CLEAN_MODES[0];
    VISUAL_CLEAN_MODES.forEach(mode => {
        if (mode.className) container.classList.remove(mode.className);
    });
    if (selectedMode.className) container.classList.add(selectedMode.className);
    currentVisualCleanMode = selectedMode.key;

    if (text) text.textContent = `画面净化：${selectedMode.label}`;
    if (button) {
        button.classList.toggle('is-active', selectedMode.key !== 'off');
        button.setAttribute('aria-label', `画面净化：${selectedMode.label}`);
        button.setAttribute('aria-pressed', selectedMode.key !== 'off' ? 'true' : 'false');
    }

    const sourceKey = getCurrentSourceCode();
    if (options.persist !== false) saveVisualCleanModeForSource(sourceKey, selectedMode.key);
    if (options.notify) showToast(`画面净化：${selectedMode.label}`, selectedMode.key === 'off' ? 'info' : 'success');
}

function cycleVisualCleanMode() {
    const currentIndex = Math.max(0, VISUAL_CLEAN_MODES.findIndex(mode => mode.key === currentVisualCleanMode));
    const nextMode = VISUAL_CLEAN_MODES[(currentIndex + 1) % VISUAL_CLEAN_MODES.length];
    applyVisualCleanMode(nextMode.key, { persist: true, notify: true });
}

function restoreVisualCleanModeForCurrentSource() {
    applyVisualCleanMode(getVisualCleanModeForSource(), { persist: false });
}

// 页面加载
document.addEventListener('DOMContentLoaded', function () {
    // 先检查用户是否已通过密码验证
    if (!isPasswordVerified()) {
        // 隐藏加载提示
        document.getElementById('player-loading').style.display = 'none';
        return;
    }

    initializePageContent();
});

// 监听密码验证成功事件
document.addEventListener('passwordVerified', () => {
    document.getElementById('player-loading').style.display = 'block';

    initializePageContent();
});

// 初始化页面内容
function initializePageContent() {

    // 解析URL参数
    const urlParams = new URLSearchParams(window.location.search);
    let videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = getCurrentSourceCode(urlParams);
    let index = parseInt(urlParams.get('index') || '0');
    const episodesList = urlParams.get('episodes'); // 从URL获取集数信息
    const savedPosition = parseInt(urlParams.get('position') || '0'); // 获取保存的播放位置
    // 解决历史记录问题：检查URL是否是player.html开头的链接
    // 如果是，说明这是历史记录重定向，需要解析真实的视频URL
    if (videoUrl && videoUrl.includes('player.html')) {
        try {
            // 尝试从嵌套URL中提取真实的视频链接
            const nestedUrlParams = new URLSearchParams(videoUrl.split('?')[1]);
            // 从嵌套参数中获取真实视频URL
            const nestedVideoUrl = nestedUrlParams.get('url');
            // 检查嵌套URL是否包含播放位置信息
            const nestedPosition = nestedUrlParams.get('position');
            const nestedIndex = nestedUrlParams.get('index');
            const nestedTitle = nestedUrlParams.get('title');

            if (nestedVideoUrl) {
                videoUrl = nestedVideoUrl;

                // 更新当前URL参数
                const url = new URL(window.location.href);
                if (!urlParams.has('position') && nestedPosition) {
                    url.searchParams.set('position', nestedPosition);
                }
                if (!urlParams.has('index') && nestedIndex) {
                    url.searchParams.set('index', nestedIndex);
                }
                if (!urlParams.has('title') && nestedTitle) {
                    url.searchParams.set('title', nestedTitle);
                }
                // 替换当前URL
                window.history.replaceState({}, '', url);
            } else {
                showError('历史记录链接无效，请返回首页重新访问');
            }
        } catch (e) {
        }
    }

    // 保存当前视频URL
    currentVideoUrl = videoUrl || '';

    // 从localStorage获取数据
    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '未知视频';
    currentEpisodeIndex = index;

    // 设置自动连播开关状态
    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false'; // 默认为true
    document.getElementById('autoplayToggle').checked = autoplayEnabled;

    // 获取广告过滤设置
    adFilteringEnabled = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false'; // 默认为true

    // 监听自动连播开关变化
    document.getElementById('autoplayToggle').addEventListener('change', function (e) {
        autoplayEnabled = e.target.checked;
        localStorage.setItem('autoplayEnabled', autoplayEnabled);
    });

    // 优先使用URL传递的集数信息，否则从localStorage获取
    try {
        if (episodesList) {
            // 如果URL中有集数数据，优先使用它
            currentEpisodes = JSON.parse(decodeURIComponent(episodesList));

        } else {
            // 否则从localStorage获取
            currentEpisodes = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');

        }

        // 检查集数索引是否有效，如果无效则调整为0
        if (index < 0 || (currentEpisodes.length > 0 && index >= currentEpisodes.length)) {
            // 如果索引太大，则使用最大有效索引
            if (index >= currentEpisodes.length && currentEpisodes.length > 0) {
                index = currentEpisodes.length - 1;
            } else {
                index = 0;
            }

            // 更新URL以反映修正后的索引
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index);
            window.history.replaceState({}, '', newUrl);
        }

        // 更新当前索引为验证过的值
        currentEpisodeIndex = index;

        episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch (e) {
        currentEpisodes = [];
        currentEpisodeIndex = 0;
        episodesReversed = false;
    }

    // 设置页面标题
    document.title = currentVideoTitle + ' - FreeDY 播放器';
    document.getElementById('videoTitle').textContent = currentVideoTitle;

    // 初始化播放器
    if (videoUrl) {
        initPlayer(videoUrl);
    } else {
        showError('无效的视频链接');
    }

    // 渲染源信息并恢复该资源站的画面净化规则
    renderResourceInfoBar();
    restoreVisualCleanModeForCurrentSource();

    // 更新集数信息
    updateEpisodeInfo();

    // 渲染集数列表
    renderEpisodes();

    // 更新按钮状态
    updateButtonStates();

    // 更新排序按钮状态
    updateOrderButton();

    // 添加对进度条的监听，确保点击准确跳转
    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000);

    // 添加键盘快捷键事件监听
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // 添加页面离开事件监听，保存播放位置
    window.addEventListener('beforeunload', saveCurrentProgress);

    // 新增：页面隐藏（切后台/切标签）时也保存
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
        }
    });

    // 视频暂停时也保存
    const waitForVideo = setInterval(() => {
        if (art && art.video) {
            art.video.addEventListener('pause', saveCurrentProgress);

            // 新增：播放进度变化时节流保存
            let lastSave = 0;
            art.video.addEventListener('timeupdate', function() {
                const now = Date.now();
                if (now - lastSave > 5000) { // 每5秒最多保存一次
                    saveCurrentProgress();
                    lastSave = now;
                }
            });

            clearInterval(waitForVideo);
        }
    }, 200);
}

// 处理键盘快捷键
function handleKeyboardShortcuts(e) {
    // 忽略输入框中的按键事件
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Alt + 左箭头 = 上一集
    if (e.altKey && e.key === 'ArrowLeft') {
        if (currentEpisodeIndex > 0) {
            playPreviousEpisode();
            showShortcutHint('上一集', 'left');
            e.preventDefault();
        }
    }

    // Alt + 右箭头 = 下一集
    if (e.altKey && e.key === 'ArrowRight') {
        if (currentEpisodeIndex < currentEpisodes.length - 1) {
            playNextEpisode();
            showShortcutHint('下一集', 'right');
            e.preventDefault();
        }
    }

    // 左箭头 = 快退
    if (!e.altKey && e.key === 'ArrowLeft') {
        if (art && art.currentTime > 5) {
            art.currentTime -= 5;
            showShortcutHint('快退', 'left');
            e.preventDefault();
        }
    }

    // 右箭头 = 快进
    if (!e.altKey && e.key === 'ArrowRight') {
        if (art && art.currentTime < art.duration - 5) {
            art.currentTime += 5;
            showShortcutHint('快进', 'right');
            e.preventDefault();
        }
    }

    // 上箭头 = 音量+
    if (e.key === 'ArrowUp') {
        if (art && art.volume < 1) {
            art.volume += 0.1;
            showShortcutHint('音量+', 'up');
            e.preventDefault();
        }
    }

    // 下箭头 = 音量-
    if (e.key === 'ArrowDown') {
        if (art && art.volume > 0) {
            art.volume -= 0.1;
            showShortcutHint('音量-', 'down');
            e.preventDefault();
        }
    }

    // 空格 = 播放/暂停
    if (e.key === ' ') {
        if (art) {
            art.toggle();
            showShortcutHint('播放/暂停', 'play');
            e.preventDefault();
        }
    }

    // f 键 = 切换全屏
    if (e.key === 'f' || e.key === 'F') {
        if (art) {
            art.fullscreen = !art.fullscreen;
            showShortcutHint('切换全屏', 'fullscreen');
            e.preventDefault();
        }
    }
}

// 显示快捷键提示
function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcutHint');
    const textElement = document.getElementById('shortcutText');
    const iconElement = document.getElementById('shortcutIcon');

    // 清除之前的超时
    if (shortcutHintTimeout) {
        clearTimeout(shortcutHintTimeout);
    }

    // 设置文本和图标方向
    textElement.textContent = text;

    if (direction === 'left') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>';
    } else if (direction === 'right') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
    }  else if (direction === 'up') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>';
    } else if (direction === 'down') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>';
    } else if (direction === 'fullscreen') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>';
    } else if (direction === 'play') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"></path>';
    }

    // 显示提示
    hintElement.classList.add('show');

    // 两秒后隐藏
    shortcutHintTimeout = setTimeout(() => {
        hintElement.classList.remove('show');
    }, 2000);
}

// 初始化播放器
function initPlayer(videoUrl) {
    if (!videoUrl) {
        return
    }

    // 销毁旧实例
    if (art) {
        art.destroy();
        art = null;
    }

    // 配置HLS.js选项
    const hlsConfig = {
        debug: false,
        loader: adFilteringEnabled ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6,
        fragLoadingMaxRetryTimeout: 64000,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        startLevel: -1,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true,
        appendErrorMaxRetry: 5,  // 增加尝试次数
        liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    // Create new ArtPlayer instance
    art = new Artplayer({
        container: '#player',
        url: videoUrl,
        type: 'm3u8',
        title: videoTitle,
        volume: 0.8,
        isLive: false,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: true,
        screenshot: true,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: false,
        airplay: true,
        hotkey: false,
        theme: '#23ade5',
        lang: navigator.language.toLowerCase(),
        moreVideoAttr: {
            crossOrigin: 'anonymous',
        },
        customType: {
            m3u8: function (video, url) {
                // 清理之前的HLS实例
                if (currentHls && currentHls.destroy) {
                    try {
                        currentHls.destroy();
                    } catch (e) {
                    }
                }

                // 创建新的HLS实例
                const hls = new Hls(hlsConfig);
                currentHls = hls;

                // 跟踪是否已经显示错误
                let errorDisplayed = false;
                // 跟踪是否有错误发生
                let errorCount = 0;
                // 跟踪视频是否开始播放
                let playbackStarted = false;
                // 跟踪视频是否出现bufferAppendError
                let bufferAppendErrorCount = 0;

                // 监听视频播放事件
                video.addEventListener('playing', function () {
                    playbackStarted = true;
                    document.getElementById('player-loading').style.display = 'none';
                    document.getElementById('error').style.display = 'none';
                });

                // 监听视频进度事件
                video.addEventListener('timeupdate', function () {
                    if (video.currentTime > 1) {
                        // 视频进度超过1秒，隐藏错误（如果存在）
                        document.getElementById('error').style.display = 'none';
                    }
                });

                hls.loadSource(url);
                hls.attachMedia(video);

                // enable airplay, from https://github.com/video-dev/hls.js/issues/5989
                // 检查是否已存在source元素，如果存在则更新，不存在则创建
                let sourceElement = video.querySelector('source');
                if (sourceElement) {
                    // 更新现有source元素的URL
                    sourceElement.src = url;
                } else {
                    // 创建新的source元素
                    sourceElement = document.createElement('source');
                    sourceElement.src = url;
                    video.appendChild(sourceElement);
                }
                video.disableRemotePlayback = false;

                hls.on(Hls.Events.MANIFEST_PARSED, function () {
                    video.play().catch(e => {
                    });
                });

                hls.on(Hls.Events.ERROR, function (event, data) {
                    // 增加错误计数
                    errorCount++;

                    // 处理bufferAppendError
                    if (data.details === 'bufferAppendError') {
                        bufferAppendErrorCount++;
                        // 如果视频已经开始播放，则忽略这个错误
                        if (playbackStarted) {
                            return;
                        }

                        // 如果出现多次bufferAppendError但视频未播放，尝试恢复
                        if (bufferAppendErrorCount >= 3) {
                            hls.recoverMediaError();
                        }
                    }

                    // 如果是致命错误，且视频未播放
                    if (data.fatal && !playbackStarted) {
                        // 尝试恢复错误
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls.recoverMediaError();
                                break;
                            default:
                                // 仅在多次恢复尝试后显示错误
                                if (errorCount > 3 && !errorDisplayed) {
                                    errorDisplayed = true;
                                    showError('视频加载失败，可能是格式不兼容或源不可用');
                                }
                                break;
                        }
                    }
                });

                // 监听分段加载事件
                hls.on(Hls.Events.FRAG_LOADED, function () {
                    document.getElementById('player-loading').style.display = 'none';
                });

                // 监听级别加载事件
                hls.on(Hls.Events.LEVEL_LOADED, function () {
                    document.getElementById('player-loading').style.display = 'none';
                });
            }
        }
    });

    // artplayer 没有 'fullscreenWeb:enter', 'fullscreenWeb:exit' 等事件
    // 所以原控制栏隐藏代码并没有起作用
    // 实际起作用的是 artplayer 默认行为，它支持自动隐藏工具栏
    // 但有一个 bug： 在副屏全屏时，鼠标移出副屏后不会自动隐藏工具栏
    // 下面进一并重构和修复：
    let hideTimer;

    // 隐藏控制栏
    function hideControls() {
        if (art && art.controls) {
            art.controls.show = false;
        }
    }

    // 重置计时器，计时器超时时间与 artplayer 保持一致
    function resetHideTimer() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            hideControls();
        }, Artplayer.CONTROL_HIDE_TIME);
    }

    // 处理鼠标离开浏览器窗口
    function handleMouseOut(e) {
        if (e && !e.relatedTarget) {
            resetHideTimer();
        }
    }

    // 全屏状态切换时注册/移除 mouseout 事件，监听鼠标移出屏幕事件
    // 从而对播放器状态栏进行隐藏倒计时
    function handleFullScreen(isFullScreen, isWeb) {
        if (isFullScreen) {
            document.addEventListener('mouseout', handleMouseOut);
        } else {
            document.removeEventListener('mouseout', handleMouseOut);
            // 退出全屏时清理计时器
            clearTimeout(hideTimer);
        }

        if (!isWeb) {
            if (window.screen.orientation && window.screen.orientation.lock) {
                window.screen.orientation.lock('landscape')
                    .then(() => {
                    })
                    .catch((error) => {
                    });
            }
        }
    }

    // 播放器加载完成后初始隐藏工具栏
    art.on('ready', () => {
        hideControls();
    });

    // 全屏 Web 模式处理
    art.on('fullscreenWeb', function (isFullScreen) {
        handleFullScreen(isFullScreen, true);
    });

    // 全屏模式处理
    art.on('fullscreen', function (isFullScreen) {
        handleFullScreen(isFullScreen, false);
    });

    art.on('video:loadedmetadata', function() {
        document.getElementById('player-loading').style.display = 'none';
        videoHasEnded = false; // 视频加载时重置结束标志
        // 优先使用URL传递的position参数
        const urlParams = new URLSearchParams(window.location.search);
        const savedPosition = parseInt(urlParams.get('position') || '0');

        if (savedPosition > 10 && savedPosition < art.duration - 2) {
            // 如果URL中有有效的播放位置参数，直接使用它
            art.currentTime = savedPosition;
            showPositionRestoreHint(savedPosition);
        } else {
            // 否则尝试从本地存储恢复播放进度
            try {
                const progressKey = 'videoProgress_' + getVideoId();
                const progressStr = localStorage.getItem(progressKey);
                if (progressStr && art.duration > 0) {
                    const progress = JSON.parse(progressStr);
                    if (
                        progress &&
                        typeof progress.position === 'number' &&
                        progress.position > 10 &&
                        progress.position < art.duration - 2
                    ) {
                        art.currentTime = progress.position;
                        showPositionRestoreHint(progress.position);
                    }
                }
            } catch (e) {
            }
        }

        // 设置进度条点击监听
        setupProgressBarPreciseClicks();

        // 视频加载成功后，在稍微延迟后将其添加到观看历史
        setTimeout(saveToHistory, 3000);

        // 启动定期保存播放进度
        startProgressSaveInterval();
    })

    // 错误处理
    art.on('video:error', function (error) {
        // 如果正在切换视频，忽略错误
        if (window.isSwitchingVideo) {
            return;
        }

        // 隐藏所有加载指示器
        const loadingElements = document.querySelectorAll('#player-loading, .player-loading-container');
        loadingElements.forEach(el => {
            if (el) el.style.display = 'none';
        });

        showError('视频播放失败: ' + (error.message || '未知错误'));
    });

    // 添加移动端长按三倍速播放功能
    setupLongPressSpeedControl();

    // 视频播放结束事件
    art.on('video:ended', function () {
        videoHasEnded = true;

        clearVideoProgress();

        // 如果自动播放下一集开启，且确实有下一集
        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            // 稍长延迟以确保所有事件处理完成
            setTimeout(() => {
                // 确认不是因为用户拖拽导致的假结束事件
                playNextEpisode();
                videoHasEnded = false; // 重置标志
            }, 1000);
        } else {
            art.fullscreen = false;
        }
    });

    // 添加双击全屏支持
    art.on('video:playing', () => {
        // 绑定双击事件到视频容器
        if (art.video) {
            art.video.addEventListener('dblclick', () => {
                art.fullscreen = !art.fullscreen;
                art.play();
            });
        }
    });

    // 10秒后如果仍在加载，但不立即显示错误
    setTimeout(function () {
        // 如果视频已经播放开始，则不显示错误
        if (art && art.video && art.video.currentTime > 0) {
            return;
        }

        const loadingElement = document.getElementById('player-loading');
        if (loadingElement && loadingElement.style.display !== 'none') {
            loadingElement.innerHTML = `
                <div class="loading-spinner"></div>
                <div>视频加载时间较长，请耐心等待...</div>
                <div style="font-size: 12px; color: #aaa; margin-top: 10px;">如长时间无响应，请尝试其他视频源</div>
            `;
        }
    }, 10000);
}

// 自定义 M3U8 Loader。当前采用无损兼容策略，不修改播放清单。
class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
        const load = this.load.bind(this);
        this.load = function (context, config, callbacks) {
            if (context.type === 'manifest' || context.type === 'level') {
                const onSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function (response, stats, context) {
                    if (response.data && typeof response.data === 'string') {
                        response.data = filterAdsFromM3U8(response.data);
                    }
                    return onSuccess(response, stats, context);
                };
            }
            load(context, config, callbacks);
        };
    }
}

const HLS_AD_MARKER_PATTERN = /(?:^|[\/_\-.])(ad|ads|advert|advertise|advertisement|commercial|promo|preroll|midroll|postroll)(?:[\/_\-.]|$)/i;
const HLS_AD_CLASS_PATTERN = /CLASS=["']?(?:com\.)?(?:apple\.hls\.)?(?:interstitial|ad|ads|advertisement)/i;

function isExplicitHlsAdMarker(line) {
    const normalized = String(line || '').trim();
    if (!normalized) return false;
    return HLS_AD_CLASS_PATTERN.test(normalized)
        || /^#EXT-X-CUE-OUT(?::|$)/i.test(normalized)
        || /^#EXT-OATCLS-SCTE35:/i.test(normalized)
        || /^#EXT-X-ASSET:/i.test(normalized);
}

function isExplicitHlsAdUri(uri) {
    if (!uri || uri.startsWith('#')) return false;
    try {
        const parsed = new URL(uri, window.location.href);
        return HLS_AD_MARKER_PATTERN.test(parsed.pathname)
            || Array.from(parsed.searchParams.keys()).some(key => /^(?:ad|ads|advert|commercial)$/i.test(key));
    } catch (error) {
        return HLS_AD_MARKER_PATTERN.test(uri.split('?')[0]);
    }
}

function isHlsAdBreakEnd(line) {
    const normalized = String(line || '').trim();
    return /^#EXT-X-CUE-IN(?::|$)/i.test(normalized)
        || (/^#EXT-X-DATERANGE:/i.test(normalized) && /END-DATE=/i.test(normalized));
}

// 安全分片过滤：仅删除具有明确广告信号的媒体分片。
// 不按时长猜测，不删除 #EXT-X-DISCONTINUITY、密钥、映射、音轨或播放线路标签。
function filterAdsFromM3U8(m3u8Content) {
    if (typeof m3u8Content !== 'string' || !m3u8Content.includes('#EXTM3U')) {
        return typeof m3u8Content === 'string' ? m3u8Content : '';
    }

    const sourceLines = m3u8Content.split(/\r?\n/);
    const output = [];
    let pendingSegmentTags = [];
    let insideExplicitAdBreak = false;
    let removedSegments = 0;

    const flushPending = () => {
        if (pendingSegmentTags.length) {
            output.push(...pendingSegmentTags);
            pendingSegmentTags = [];
        }
    };

    sourceLines.forEach((line, lineIndex) => {
        const trimmed = line.trim();

        if (isExplicitHlsAdMarker(trimmed)) {
            // 只有能找到明确结束标记时才进入广告段，防止残缺 CUE-OUT 误删后续全部正片。
            const hasMatchingEnd = sourceLines
                .slice(lineIndex + 1)
                .some(candidate => isHlsAdBreakEnd(candidate));
            if (hasMatchingEnd && (/^#EXT-X-CUE-OUT(?::|$)/i.test(trimmed) || /^#EXT-OATCLS-SCTE35:/i.test(trimmed))) {
                insideExplicitAdBreak = true;
                pendingSegmentTags = [];
            } else {
                output.push(line);
            }
            return;
        }

        if (isHlsAdBreakEnd(trimmed)) {
            insideExplicitAdBreak = false;
            pendingSegmentTags = [];
            return;
        }

        if (/^#EXTINF:/i.test(trimmed) || /^#EXT-X-BYTERANGE:/i.test(trimmed) || /^#EXT-X-PROGRAM-DATE-TIME:/i.test(trimmed)) {
            pendingSegmentTags.push(line);
            return;
        }

        if (trimmed && !trimmed.startsWith('#')) {
            const removeSegment = insideExplicitAdBreak || isExplicitHlsAdUri(trimmed);
            if (removeSegment) {
                removedSegments++;
                pendingSegmentTags = [];
                return;
            }
            flushPending();
            output.push(line);
            return;
        }

        // 结构性标签始终保留。仅在广告段内忽略分片级元数据。
        if (!insideExplicitAdBreak || /^#EXT-X-DISCONTINUITY/i.test(trimmed)) {
            flushPending();
            output.push(line);
        }
    });

    flushPending();
    if (removedSegments > 0) {
        console.info(`HLS 分片广告过滤：移除 ${removedSegments} 个明确广告分片`);
    }
    return output.join('\n');
}


// 显示错误
function showError(message) {
    // 在视频已经播放的情况下不显示错误
    if (art && art.video && art.video.currentTime > 1) {
        return;
    }
    const loadingEl = document.getElementById('player-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'flex';
    const errorMsgEl = document.getElementById('error-message');
    if (errorMsgEl) errorMsgEl.textContent = message;
}

// 更新集数信息
function updateEpisodeInfo() {
    if (currentEpisodes.length > 0) {
        document.getElementById('episodeInfo').textContent = `第 ${currentEpisodeIndex + 1}/${currentEpisodes.length} 集`;
    } else {
        document.getElementById('episodeInfo').textContent = '无集数信息';
    }
}

// 更新按钮状态
function updateButtonStates() {
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');

    // 处理上一集按钮
    if (currentEpisodeIndex > 0) {
        prevButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        prevButton.removeAttribute('disabled');
    } else {
        prevButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        prevButton.setAttribute('disabled', '');
    }

    // 处理下一集按钮
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        nextButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        nextButton.removeAttribute('disabled');
    } else {
        nextButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        nextButton.setAttribute('disabled', '');
    }
}

// 渲染集数按钮
function renderEpisodes() {
    const episodesList = document.getElementById('episodesList');
    if (!episodesList) return;

    if (!currentEpisodes || currentEpisodes.length === 0) {
        episodesList.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">没有可用的集数</div>';
        return;
    }

    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    let html = '';

    episodes.forEach((episode, index) => {
        // 根据倒序状态计算真实的剧集索引
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        const isActive = realIndex === currentEpisodeIndex;

        html += `
            <button id="episode-${realIndex}" 
                    onclick="playEpisode(${realIndex})" 
                    class="px-4 py-2 ${isActive ? 'episode-active' : '!bg-[#222] hover:!bg-[#333] hover:!shadow-none'} !border ${isActive ? '!border-blue-500' : '!border-[#333]'} rounded-lg transition-colors text-center episode-btn">
                ${realIndex + 1}
            </button>
        `;
    });

    episodesList.innerHTML = html;
}

// 播放指定集数
function playEpisode(index) {
    // 确保index在有效范围内
    if (index < 0 || index >= currentEpisodes.length) {
        return;
    }

    // 保存当前播放进度（如果正在播放）
    if (art && art.video && !art.video.paused && !videoHasEnded) {
        saveCurrentProgress();
    }

    // 清除进度保存计时器
    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
        progressSaveInterval = null;
    }

    // 首先隐藏之前可能显示的错误
    document.getElementById('error').style.display = 'none';
    // 显示加载指示器
    document.getElementById('player-loading').style.display = 'flex';
    document.getElementById('player-loading').innerHTML = `
        <div class="loading-spinner"></div>
        <div>正在加载视频...</div>
    `;

    // 获取 sourceCode
    const urlParams2 = new URLSearchParams(window.location.search);
    const sourceCode = getCurrentSourceCode(urlParams2);

    // 准备切换剧集的URL
    const url = currentEpisodes[index];

    // 更新当前剧集索引
    currentEpisodeIndex = index;
    currentVideoUrl = url;
    videoHasEnded = false; // 重置视频结束标志

    clearVideoProgress();

    // 更新URL参数（不刷新页面）
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('index', index);
    currentUrl.searchParams.set('url', url);
    currentUrl.searchParams.delete('position');
    window.history.replaceState({}, '', currentUrl.toString());

    if (isWebkit) {
        initPlayer(url);
    } else {
        art.switch = url;
    }

    // 更新UI
    updateEpisodeInfo();
    updateButtonStates();
    renderEpisodes();

    // 重置用户点击位置记录
    userClickedPosition = null;

    // 三秒后保存到历史记录
    setTimeout(() => saveToHistory(), 3000);
}

// 播放上一集
function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    }
}

// 播放下一集
function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    }
}

// 复制播放链接
function copyLinks() {
    // 尝试从URL中获取参数
    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || '';
    if (linkUrl !== '') {
        navigator.clipboard.writeText(linkUrl).then(() => {
            showToast('播放链接已复制', 'success');
        }).catch(err => {
            showToast('复制失败，请检查浏览器权限', 'error');
        });
    }
}

// 切换集数排序
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;

    // 保存到localStorage
    localStorage.setItem('episodesReversed', episodesReversed);

    // 重新渲染集数列表
    renderEpisodes();

    // 更新排序按钮
    updateOrderButton();
}

// 更新排序按钮状态
function updateOrderButton() {
    const orderText = document.getElementById('orderText');
    const orderIcon = document.getElementById('orderIcon');

    if (orderText && orderIcon) {
        orderText.textContent = episodesReversed ? '正序排列' : '倒序排列';
        orderIcon.style.transform = episodesReversed ? 'rotate(180deg)' : '';
    }
}

// 设置进度条准确点击处理
function setupProgressBarPreciseClicks() {
    // 查找DPlayer的进度条元素
    const progressBar = document.querySelector('.dplayer-bar-wrap');
    if (!progressBar || !art || !art.video) return;

    // 移除可能存在的旧事件监听器
    progressBar.removeEventListener('mousedown', handleProgressBarClick);

    // 添加新的事件监听器
    progressBar.addEventListener('mousedown', handleProgressBarClick);

    // 在移动端也添加触摸事件支持
    progressBar.removeEventListener('touchstart', handleProgressBarTouch);
    progressBar.addEventListener('touchstart', handleProgressBarTouch);

    // 处理进度条点击
    function handleProgressBarClick(e) {
        if (!art || !art.video) return;

        // 计算点击位置相对于进度条的比例
        const rect = e.currentTarget.getBoundingClientRect();
        const percentage = (e.clientX - rect.left) / rect.width;

        // 计算点击位置对应的视频时间
        const duration = art.video.duration;
        let clickTime = percentage * duration;

        // 处理视频接近结尾的情况
        if (duration - clickTime < 1) {
            // 如果点击位置非常接近结尾，稍微往前移一点
            clickTime = Math.min(clickTime, duration - 1.5);

        }

        // 记录用户点击的位置
        userClickedPosition = clickTime;

        // 阻止默认事件传播，避免DPlayer内部逻辑将视频跳至末尾
        e.stopPropagation();

        // 直接设置视频时间
        art.seek(clickTime);
    }

    // 处理移动端触摸事件
    function handleProgressBarTouch(e) {
        if (!art || !art.video || !e.touches[0]) return;

        const touch = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        const percentage = (touch.clientX - rect.left) / rect.width;

        const duration = art.video.duration;
        let clickTime = percentage * duration;

        // 处理视频接近结尾的情况
        if (duration - clickTime < 1) {
            clickTime = Math.min(clickTime, duration - 1.5);
        }

        // 记录用户点击的位置
        userClickedPosition = clickTime;

        e.stopPropagation();
        art.seek(clickTime);
    }
}

// 在播放器初始化后添加视频到历史记录
function saveToHistory() {
    // 确保 currentEpisodes 非空且有当前视频URL
    if (!currentEpisodes || currentEpisodes.length === 0 || !currentVideoUrl) {
        return;
    }

    // 尝试从URL中获取参数
    const urlParams = new URLSearchParams(window.location.search);
    const sourceCode = getCurrentSourceCode(urlParams);
    let sourceName = urlParams.get('source') || '';
    if (!sourceName && sourceCode) {
        sourceName = sourceCode;
    }
    const id_from_params = urlParams.get('id'); // Get video ID from player URL (passed as 'id')

    // 获取当前播放进度
    let currentPosition = 0;
    let videoDuration = 0;

    if (art && art.video) {
        currentPosition = art.video.currentTime;
        videoDuration = art.video.duration;
    }

    // Define a show identifier: Prioritize sourceName_id, fallback to first episode URL or current video URL
    let show_identifier_for_video_info;
    if (sourceName && id_from_params) {
        show_identifier_for_video_info = `${sourceName}_${id_from_params}`;
    } else {
        show_identifier_for_video_info = (currentEpisodes && currentEpisodes.length > 0) ? currentEpisodes[0] : currentVideoUrl;
    }

    // 构建要保存的视频信息对象
    const videoInfo = {
        title: currentVideoTitle,
        directVideoUrl: currentVideoUrl, // Current episode's direct URL
        url: `player.html?url=${encodeURIComponent(currentVideoUrl)}&title=${encodeURIComponent(currentVideoTitle)}&source=${encodeURIComponent(sourceName)}&source_code=${encodeURIComponent(sourceCode)}&id=${encodeURIComponent(id_from_params || '')}&index=${currentEpisodeIndex}&position=${Math.floor(currentPosition || 0)}`,
        episodeIndex: currentEpisodeIndex,
        sourceName: sourceName,
        vod_id: id_from_params || '', // Store the ID from params as vod_id in history item
        sourceCode: sourceCode,
        showIdentifier: show_identifier_for_video_info, // Identifier for the show/series
        timestamp: Date.now(),
        playbackPosition: currentPosition,
        duration: videoDuration,
        episodes: currentEpisodes && currentEpisodes.length > 0 ? [...currentEpisodes] : []
    };
    
    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');

        // 检查是否已经存在相同的系列记录 (基于标题、来源和 showIdentifier)
        const existingIndex = history.findIndex(item => 
            item.title === videoInfo.title && 
            item.sourceName === videoInfo.sourceName && 
            item.showIdentifier === videoInfo.showIdentifier
        );

        if (existingIndex !== -1) {
            // 存在则更新现有记录的当前集数、时间戳、播放进度和URL等
            const existingItem = history[existingIndex];
            existingItem.episodeIndex = videoInfo.episodeIndex;
            existingItem.timestamp = videoInfo.timestamp;
            existingItem.sourceName = videoInfo.sourceName; // Should be consistent, but update just in case
            existingItem.sourceCode = videoInfo.sourceCode;
            existingItem.vod_id = videoInfo.vod_id;
            
            // Update URLs to reflect the current episode being watched
            existingItem.directVideoUrl = videoInfo.directVideoUrl; // Current episode's direct URL
            existingItem.url = videoInfo.url; // Player link for the current episode

            // 更新播放进度信息
            existingItem.playbackPosition = videoInfo.playbackPosition > 10 ? videoInfo.playbackPosition : (existingItem.playbackPosition || 0);
            existingItem.duration = videoInfo.duration || existingItem.duration;
            
            // 更新集数列表（如果新的集数列表与存储的不同，例如集数增加了）
            if (videoInfo.episodes && videoInfo.episodes.length > 0) {
                if (!existingItem.episodes || 
                    !Array.isArray(existingItem.episodes) || 
                    existingItem.episodes.length !== videoInfo.episodes.length || 
                    !videoInfo.episodes.every((ep, i) => ep === existingItem.episodes[i])) { // Basic check for content change
                    existingItem.episodes = [...videoInfo.episodes]; // Deep copy
                }
            }
            
            // 移到最前面
            const updatedItem = history.splice(existingIndex, 1)[0];
            history.unshift(updatedItem);
        } else {
            // 添加新记录到最前面
            history.unshift(videoInfo);
        }

        // 限制历史记录数量为50条
        if (history.length > 50) history.splice(50);

        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) {
    }
}

// 显示恢复位置提示
function showPositionRestoreHint(position) {
    if (!position || position < 10) return;

    // 创建提示元素
    const hint = document.createElement('div');
    hint.className = 'position-restore-hint';
    hint.innerHTML = `
        <div class="hint-content">
            已从 ${formatTime(position)} 继续播放
        </div>
    `;

    // 添加到播放器容器
    const playerContainer = document.querySelector('.player-container'); // Ensure this selector is correct
    if (playerContainer) { // Check if playerContainer exists
        playerContainer.appendChild(hint);
    } else {
        return; // Exit if container not found
    }

    // 显示提示
    setTimeout(() => {
        hint.classList.add('show');

        // 3秒后隐藏
        setTimeout(() => {
            hint.classList.remove('show');
            setTimeout(() => hint.remove(), 300);
        }, 3000);
    }, 100);
}

// 格式化时间为 mm:ss 格式
function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 开始定期保存播放进度
function startProgressSaveInterval() {
    // 清除可能存在的旧计时器
    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
    }

    // 每30秒保存一次播放进度
    progressSaveInterval = setInterval(saveCurrentProgress, 30000);
}

// 保存当前播放进度
function saveCurrentProgress() {
    if (!art || !art.video) return;
    const currentTime = art.video.currentTime;
    const duration = art.video.duration;
    if (!duration || currentTime < 1) return;

    // 在localStorage中保存进度
    const progressKey = `videoProgress_${getVideoId()}`;
    const progressData = {
        position: currentTime,
        duration: duration,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(progressKey, JSON.stringify(progressData));
        // --- 新增：同步更新 viewingHistory 中的进度 ---
        try {
            const historyRaw = localStorage.getItem('viewingHistory');
            if (historyRaw) {
                const history = JSON.parse(historyRaw);
                // 用 title + 集数索引唯一标识
                const idx = history.findIndex(item =>
                    item.title === currentVideoTitle &&
                    (item.episodeIndex === undefined || item.episodeIndex === currentEpisodeIndex)
                );
                if (idx !== -1) {
                    // 只在进度有明显变化时才更新，减少写入
                    if (
                        Math.abs((history[idx].playbackPosition || 0) - currentTime) > 2 ||
                        Math.abs((history[idx].duration || 0) - duration) > 2
                    ) {
                        history[idx].playbackPosition = currentTime;
                        history[idx].duration = duration;
                        history[idx].timestamp = Date.now();
                        localStorage.setItem('viewingHistory', JSON.stringify(history));
                    }
                }
            }
        } catch (e) {
        }
    } catch (e) {
    }
}

// 设置移动端长按三倍速播放功能
function setupLongPressSpeedControl() {
    if (!art || !art.video) return;

    const playerElement = document.getElementById('player');
    let longPressTimer = null;
    let originalPlaybackRate = 1.0;
    let isLongPress = false;

    // 显示快速提示
    function showSpeedHint(speed) {
        showShortcutHint(`${speed}倍速`, 'right');
    }

    // 禁用右键
    playerElement.oncontextmenu = () => {
        // 检测是否为移动设备
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // 只在移动设备上禁用右键
        if (isMobile) {
            const dplayerMenu = document.querySelector(".dplayer-menu");
            const dplayerMask = document.querySelector(".dplayer-mask");
            if (dplayerMenu) dplayerMenu.style.display = "none";
            if (dplayerMask) dplayerMask.style.display = "none";
            return false;
        }
        return true; // 在桌面设备上允许右键菜单
    };

    // 触摸开始事件
    playerElement.addEventListener('touchstart', function (e) {
        // 检查视频是否正在播放，如果没有播放则不触发长按功能
        if (art.video.paused) {
            return; // 视频暂停时不触发长按功能
        }

        // 保存原始播放速度
        originalPlaybackRate = art.video.playbackRate;

        // 设置长按计时器
        longPressTimer = setTimeout(() => {
            // 再次检查视频是否仍在播放
            if (art.video.paused) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                return;
            }

            // 长按超过500ms，设置为3倍速
            art.video.playbackRate = 3.0;
            isLongPress = true;
            showSpeedHint(3.0);

            // 只在确认为长按时阻止默认行为
            e.preventDefault();
        }, 500);
    }, { passive: false });

    // 触摸结束事件
    playerElement.addEventListener('touchend', function (e) {
        // 清除长按计时器
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 如果是长按状态，恢复原始播放速度
        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
            showSpeedHint(originalPlaybackRate);

            // 阻止长按后的点击事件
            e.preventDefault();
        }
        // 如果不是长按，则允许正常的点击事件（暂停/播放）
    });

    // 触摸取消事件
    playerElement.addEventListener('touchcancel', function () {
        // 清除长按计时器
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 如果是长按状态，恢复原始播放速度
        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }
    });

    // 触摸移动事件 - 防止在长按时触发页面滚动
    playerElement.addEventListener('touchmove', function (e) {
        if (isLongPress) {
            e.preventDefault();
        }
    }, { passive: false });

    // 视频暂停时取消长按状态
    art.video.addEventListener('pause', function () {
        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });
}

// 清除视频进度记录
function clearVideoProgress() {
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
    } catch (e) {
    }
}

// 获取视频唯一标识
function getVideoId() {
    // 使用视频标题和集数索引作为唯一标识
    // If currentVideoUrl is available and more unique, prefer it. Otherwise, fallback.
    if (currentVideoUrl) {
        return `${encodeURIComponent(currentVideoUrl)}`;
    }
    return `${encodeURIComponent(currentVideoTitle)}_${currentEpisodeIndex}`;
}

let controlsLocked = false;
function toggleControlsLock() {
    const container = document.getElementById('playerContainer');
    controlsLocked = !controlsLocked;
    container.classList.toggle('controls-locked', controlsLocked);
    const icon = document.getElementById('lockIcon');
    // 切换图标：锁 / 解锁
    icon.innerHTML = controlsLocked
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M12 15v2m0-8V7a4 4 0 00-8 0v2m8 0H4v8h16v-8H6v-6z\"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M15 11V7a3 3 0 00-6 0v4m-3 4h12v6H6v-6z\"/>';
}

// 支持在iframe中关闭播放器
function closeEmbeddedPlayer() {
    try {
        if (window.self !== window.top) {
            // 如果在iframe中，尝试调用父窗口的关闭方法
            if (window.parent && typeof window.parent.closeVideoPlayer === 'function') {
                window.parent.closeVideoPlayer();
                return true;
            }
        }
    } catch (e) {
        console.error('尝试关闭嵌入式播放器失败:', e);
    }
    return false;
}

function escapeResourceText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getResourceDisplayName(sourceKey) {
    if (sourceKey && API_SITES[sourceKey]) {
        return API_SITES[sourceKey].name;
    }

    if (sourceKey && sourceKey.startsWith('custom_')) {
        const customIndex = parseInt(sourceKey.replace('custom_', ''), 10);
        return customAPIs[customIndex]?.name || '自定义资源';
    }

    return sourceKey || '未知资源';
}

function closeResourceModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.style.display = '';
    modal.setAttribute('aria-hidden', 'true');

    if (resourceModalKeydownHandler) {
        document.removeEventListener('keydown', resourceModalKeydownHandler, true);
        resourceModalKeydownHandler = null;
    }

    if (modalContent && !resourceSwitchInProgress) {
        modalContent.innerHTML = '';
    }

    if (resourceModalPreviousFocus && document.contains(resourceModalPreviousFocus)) {
        resourceModalPreviousFocus.focus({ preventScroll: true });
    }
    resourceModalPreviousFocus = null;
}

function renderResourceInfoBar() {
    const container = document.getElementById('resourceInfoBarContainer');
    if (!container) {
        console.error('找不到资源信息卡片容器');
        return;
    }

    const currentSource = getCurrentSourceCode(new URLSearchParams(window.location.search));
    const resourceName = getResourceDisplayName(currentSource);
    const recommendedSource = window.getDefaultRecommendedSource
        ? window.getDefaultRecommendedSource()
        : '';
    const isDefaultRecommended = currentSource && currentSource === recommendedSource;
    const regionLabel = window.getSourceRegionLabel
        ? window.getSourceRegionLabel(currentSource)
        : '普通线路';
    const cachedSpeed = window.getCachedSourceSpeed
        ? window.getCachedSourceSpeed(currentSource)
        : null;
    const speedLabel = cachedSpeed === null ? '未测速' : `${Math.round(cachedSpeed)}ms`;

    container.innerHTML = `
      <div class="resource-info-bar-left flex">
        <div class="resource-info-primary">
          <span class="resource-info-name">${escapeResourceText(resourceName)}</span>
          ${isDefaultRecommended ? '<span class="resource-info-recommended">默认推荐</span>' : ''}
        </div>
        <div class="resource-info-meta">
          <span>${currentEpisodes.length} 集</span>
          <span>${escapeResourceText(regionLabel)}</span>
          <span>${escapeResourceText(speedLabel)}</span>
        </div>
      </div>
      <button type="button" class="resource-switch-btn flex" id="switchResourceBtn" onclick="showSwitchResourceModal()" aria-haspopup="dialog">
        <span class="resource-switch-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        切换资源
      </button>
    `;
}

// 测试视频源速率的函数
async function testVideoSourceSpeed(sourceKey, vodId) {
    try {
        const startTime = performance.now();
        
        // 构建API参数
        let apiParams = '';
        if (sourceKey.startsWith('custom_')) {
            const customIndex = sourceKey.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) {
                return { speed: -1, error: 'API配置无效' };
            }
            if (customApi.detail) {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&customDetail=' + encodeURIComponent(customApi.detail) + '&source=custom';
            } else {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&source=custom';
            }
        } else {
            apiParams = '&source=' + sourceKey;
        }
        
        // 添加时间戳防止缓存
        const timestamp = new Date().getTime();
        const cacheBuster = `&_t=${timestamp}`;
        
        // 获取视频详情
        const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}${cacheBuster}`, {
            method: 'GET',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            return { speed: -1, error: '获取失败' };
        }
        
        const data = await response.json();
        
        if (!data.episodes || data.episodes.length === 0) {
            return { speed: -1, error: '无播放源' };
        }
        
        // 测试第一个播放链接的响应速度
        const firstEpisodeUrl = data.episodes[0];
        if (!firstEpisodeUrl) {
            return { speed: -1, error: '链接无效' };
        }
        
        // 测试视频链接响应时间
        const videoTestStart = performance.now();
        try {
            const videoResponse = await fetch(firstEpisodeUrl, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000) // 5秒超时
            });
            
            const videoTestEnd = performance.now();
            const totalTime = videoTestEnd - startTime;
            
            // 返回总响应时间（毫秒）
            return { 
                speed: Math.round(totalTime),
                episodes: data.episodes.length,
                error: null 
            };
        } catch (videoError) {
            // 如果视频链接测试失败，只返回API响应时间
            const apiTime = performance.now() - startTime;
            return { 
                speed: Math.round(apiTime),
                episodes: data.episodes.length,
                error: null,
                note: 'API响应' 
            };
        }
        
    } catch (error) {
        return { 
            speed: -1, 
            error: error.name === 'AbortError' ? '超时' : '测试失败' 
        };
    }
}

// 格式化速度显示
function formatSpeedDisplay(speedResult) {
    if (speedResult.speed === -1) {
        return `<span class="speed-indicator error">❌ ${speedResult.error}</span>`;
    }
    
    const speed = speedResult.speed;
    let className = 'speed-indicator good';
    let icon = '🟢';
    
    if (speed > 2000) {
        className = 'speed-indicator poor';
        icon = '🔴';
    } else if (speed > 1000) {
        className = 'speed-indicator medium';
        icon = '🟡';
    }
    
    const note = speedResult.note ? ` (${speedResult.note})` : '';
    return `<span class="${className}">${icon} ${speed}ms${note}</span>`;
}

// ── 资源卡片占位图 ──────────────────────────────────────────────────────────
const _FALLBACK_IMG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48cGF0aCBkPSJNMjEgMTV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9IjE3IDggMTIgMyA3IDgiPjwvcG9seWxpbmU+PHBhdGggZD0iTTEyIDN2MTIiPjwvcGF0aD48L3N2Zz4=";

// 流式资源切换弹窗（优化版）：搜到即显卡片，速测完即更新徽章
async function showSwitchResourceModal() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentSourceCode = getCurrentSourceCode(urlParams);
    const currentVideoId = urlParams.get('id');
    const playbackRegion = window.getUserPlaybackRegion
        ? window.getUserPlaybackRegion()
        : { region: 'overseas', recommendationLabel: '海外优先' };

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    if (resourceSwitchInProgress) {
        showToast('正在切换资源，请稍候', 'warning');
        return;
    }

    resourceModalPreviousFocus = document.activeElement;
    modalTitle.innerHTML = `<span class="break-words">${escapeResourceText(currentVideoTitle)}</span><span class="resource-modal-title-sub">选择可用线路</span>`;
    modal.classList.remove('hidden');
    modal.style.display = '';
    modal.setAttribute('aria-hidden', 'false');

    const defaultRecommendedSource = window.getDefaultRecommendedSource
        ? window.getDefaultRecommendedSource()
        : '';
    const candidateSourceKeys = Array.from(new Set([
        defaultRecommendedSource,
        currentSourceCode,
        ...selectedAPIs
    ].filter(Boolean)));
    const orderedSourceKeys = window.getPreferredSourceOrder
        ? window.getPreferredSourceOrder(candidateSourceKeys)
        : candidateSourceKeys;
    const resourceOptions = orderedSourceKeys.map(curr => {
        if (API_SITES[curr]) {
            return { key: curr, name: API_SITES[curr].name };
        }
        if (!curr.startsWith('custom_')) return null;
        const idx = parseInt(curr.replace('custom_', ''), 10);
        if (!customAPIs[idx]) return null;
        return { key: curr, name: customAPIs[idx].name || '自定义资源' };
    }).filter(Boolean);
    const nameMap = Object.fromEntries(resourceOptions.map(option => [option.key, option.name]));
    const availableResults = new Map();
    const speedSnapshot = {};
    resourceOptions.forEach(option => {
        const cachedSpeed = window.getCachedSourceSpeed ? window.getCachedSourceSpeed(option.key) : null;
        if (cachedSpeed !== null) {
            speedSnapshot[option.key] = cachedSpeed;
        }
    });

    modalContent.innerHTML = `
        <div class="resource-grid-note">
            ${playbackRegion.region === 'mainland'
                ? '当前按大陆网络优先推荐线路，测速完成后会继续刷新顺序。'
                : '当前按海外网络优先推荐线路，测速完成后会继续刷新顺序。'}
        </div>
        <div id="resource-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4"></div>
    `;
    const grid = document.getElementById('resource-grid');
    let resourceModalHasFocusedCard = false;

    function getFocusableResourceCards() {
        return Array.from(grid.querySelectorAll('.resource-source-card:not(:disabled)'));
    }

    function focusPreferredResourceCard() {
        if (resourceModalHasFocusedCard || !modal || modal.classList.contains('hidden')) return;
        const cards = getFocusableResourceCards();
        if (!cards.length) return;

        const recommendedKey = getRecommendedSourceKeyForGrid();
        const preferredCard = cards.find(card => card.dataset.sourceKey === recommendedKey) || cards[0];
        preferredCard.focus({ preventScroll: true });
        preferredCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        resourceModalHasFocusedCard = true;
    }

    function moveResourceFocus(direction) {
        const cards = getFocusableResourceCards();
        if (!cards.length) return;

        const activeCard = document.activeElement?.classList?.contains('resource-source-card')
            ? document.activeElement
            : cards[0];
        const currentRect = activeCard.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCard = null;
        let bestScore = Infinity;
        cards.forEach(card => {
            if (card === activeCard) return;
            const rect = card.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            const dx = center.x - currentCenter.x;
            const dy = center.y - currentCenter.y;
            const validDirection = (direction === 'left' && dx < -4)
                || (direction === 'right' && dx > 4)
                || (direction === 'up' && dy < -4)
                || (direction === 'down' && dy > 4);
            if (!validDirection) return;

            const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
            const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
            const score = primary + secondary * 2.5;
            if (score < bestScore) {
                bestScore = score;
                bestCard = card;
            }
        });

        if (bestCard) {
            bestCard.focus({ preventScroll: true });
            bestCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    resourceModalKeydownHandler = function (event) {
        if (modal.classList.contains('hidden')) return;

        const directionMap = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'up',
            ArrowDown: 'down'
        };
        const direction = directionMap[event.key];
        if (direction) {
            event.preventDefault();
            event.stopImmediatePropagation();
            moveResourceFocus(direction);
            return;
        }

        const isConfirmKey = event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 23;
        if (isConfirmKey && document.activeElement?.classList?.contains('resource-source-card')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            document.activeElement.click();
            return;
        }

        const isBackKey = event.key === 'Escape'
            || event.key === 'BrowserBack'
            || event.keyCode === 27
            || event.keyCode === 461
            || event.keyCode === 10009;
        if (isBackKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!resourceSwitchInProgress) closeResourceModal();
        }
    };
    document.addEventListener('keydown', resourceModalKeydownHandler, true);

    function getOrderedGridKeys() {
        const availableKeys = Array.from(availableResults.keys());
        return window.getPreferredSourceOrder
            ? window.getPreferredSourceOrder(availableKeys, { speedMap: speedSnapshot })
            : availableKeys;
    }

    function syncCardOrder() {
        getOrderedGridKeys().forEach(sourceKey => {
            const card = document.getElementById(`rcard-${sourceKey}`);
            if (card) {
                grid.appendChild(card);
            }
        });
    }

    function getRecommendedSourceKeyForGrid() {
        const availableKeys = Array.from(availableResults.keys());
        return window.getRecommendedSourceKey
            ? window.getRecommendedSourceKey(availableKeys, { speedMap: speedSnapshot })
            : (availableKeys[0] || '');
    }

    function upsertCard(sourceKey, result, speedResult) {
        const existingState = availableResults.get(sourceKey) || {};
        const nextSpeedResult = speedResult || existingState.speedResult || null;
        availableResults.set(sourceKey, {
            result,
            speedResult: nextSpeedResult
        });

        if (nextSpeedResult && nextSpeedResult.speed >= 0) {
            speedSnapshot[sourceKey] = nextSpeedResult.speed;
        }

        const isCurrent = String(sourceKey) === String(currentSourceCode)
            && String(result.vod_id) === String(currentVideoId);
        const sourceName = nameMap[sourceKey] || '未知资源';
        const sourceRegionLabel = window.getSourceRegionLabel
            ? window.getSourceRegionLabel(sourceKey)
            : '普通线路';
        const defaultRecommendedSource = window.getDefaultRecommendedSource
            ? window.getDefaultRecommendedSource()
            : '';
        const isDefaultRecommended = sourceKey === defaultRecommendedSource;
        const isRecommended = getRecommendedSourceKeyForGrid() === sourceKey;
        const episodeCount = nextSpeedResult?.episodes || result.episodes?.length || 0;
        const speedText = nextSpeedResult
            ? formatSpeedDisplay(nextSpeedResult)
            : '<span class="speed-indicator resource-speed-pending">测速中</span>';

        let card = document.getElementById(`rcard-${sourceKey}`);
        if (!card) {
            card = document.createElement('button');
            card.type = 'button';
            card.id = `rcard-${sourceKey}`;
            grid.appendChild(card);
        }

        card.className = `resource-source-card${isCurrent ? ' current' : ''}${isDefaultRecommended ? ' default-recommended' : ''}`;
        card.disabled = isCurrent || resourceSwitchInProgress;
        card.dataset.sourceKey = sourceKey;
        card.dataset.vodId = result.vod_id;
        card.setAttribute('aria-label', `${sourceName}，${sourceRegionLabel}${episodeCount ? `，${episodeCount}集` : ''}${isCurrent ? '，当前播放' : ''}${isDefaultRecommended ? '，默认推荐' : ''}`);
        card.onclick = isCurrent ? null : (() => switchToResource(sourceKey, result.vod_id, card));
        card.innerHTML = `
            <div class="resource-source-poster">
                <img src="${escapeResourceText(result.vod_pic || _FALLBACK_IMG)}" alt="${escapeResourceText(result.vod_name)}"
                     onerror="this.src='${_FALLBACK_IMG}'">
                <div class="resource-source-badges">
                    ${isDefaultRecommended ? '<span class="resource-recommend-badge default">默认推荐</span>' : (isRecommended ? '<span class="resource-recommend-badge">推荐</span>' : '')}
                    ${isCurrent ? '<span class="resource-current-badge">当前播放</span>' : ''}
                </div>
                <div class="resource-speed-badge">${speedText}</div>
                <div class="resource-switching-state" aria-hidden="true"><span class="resource-switching-spinner"></span><span>正在切换</span></div>
            </div>
            <div class="resource-source-copy">
                <strong title="${escapeResourceText(result.vod_name)}">${escapeResourceText(result.vod_name)}</strong>
                <span title="${escapeResourceText(sourceName)}">${escapeResourceText(sourceName)}</span>
                <div class="resource-source-meta">
                    <span class="resource-region-tag">${escapeResourceText(sourceRegionLabel)}</span>
                    <span>${episodeCount ? `${episodeCount}集` : '集数待确认'}</span>
                </div>
            </div>`;

        syncCardOrder();
    }

    async function testSpeedFast(sourceKey, vodId) {
        if (window.testSourceConnectionSpeed) {
            const speedResult = await window.testSourceConnectionSpeed(sourceKey, vodId);
            if (!speedResult || speedResult.speed < 0) {
                return {
                    speed: -1,
                    error: speedResult?.error === 'timeout' ? '超时' : '测试失败'
                };
            }
            return {
                speed: speedResult.speed,
                episodes: speedResult.episodes,
                error: null,
                note: speedResult.cached ? '缓存' : ''
            };
        }

        try {
            const startAt = performance.now();
            const apiParams = sourceKey.startsWith('custom_')
                ? (() => {
                    const customApi = getCustomApiInfo(sourceKey.replace('custom_', ''));
                    if (!customApi) return null;
                    return customApi.detail
                        ? `&customApi=${encodeURIComponent(customApi.url)}&customDetail=${encodeURIComponent(customApi.detail)}&source=custom`
                        : `&customApi=${encodeURIComponent(customApi.url)}&source=custom`;
                })()
                : `&source=${sourceKey}`;
            if (apiParams === null) {
                return { speed: -1, error: 'API配置无效' };
            }

            const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}`, {
                signal: AbortSignal.timeout(6000)
            });
            if (!response.ok) {
                return { speed: -1, error: '获取失败' };
            }

            const detail = await response.json();
            if (!detail.episodes?.length) {
                return { speed: -1, error: '无播放源' };
            }

            const measuredSpeed = Math.round(performance.now() - startAt);
            if (window.updateSourceSpeedCache) {
                window.updateSourceSpeedCache(sourceKey, measuredSpeed, {
                    measurement: 'detail',
                    vodId,
                    episodes: detail.episodes.length
                });
            }

            return {
                speed: measuredSpeed,
                episodes: detail.episodes.length,
                error: null
            };
        } catch (error) {
            return {
                speed: -1,
                error: error.name === 'TimeoutError' || error.name === 'AbortError' ? '超时' : '测试失败'
            };
        }
    }

    let foundAny = false;
    await Promise.all(resourceOptions.map(async option => {
        try {
            const queryResult = await searchByAPIAndKeyWord(option.key, currentVideoTitle);
            if (!Array.isArray(queryResult) || !queryResult.length) return;

            let result = queryResult[0];
            const normalizedTitle = String(currentVideoTitle || '').replace(/[\s·：:()（）\-]/g, '').toLowerCase();
            let bestScore = -1;
            queryResult.forEach(currentResult => {
                const resultTitle = String(currentResult.vod_name || '').replace(/[\s·：:()（）\-]/g, '').toLowerCase();
                let score = 0;
                if (resultTitle === normalizedTitle) score = 100;
                else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) score = 60;
                if (score > bestScore) {
                    bestScore = score;
                    result = currentResult;
                }
            });

            foundAny = true;
            upsertCard(option.key, result, null);
            testSpeedFast(option.key, result.vod_id)
                .then(speedResult => upsertCard(option.key, result, speedResult))
                .catch(() => {});
        } catch (error) {
            console.warn(`资源 ${option.key} 搜索失败:`, error.message);
        }
    }));

    if (!foundAny) {
        modalContent.innerHTML = '<div class="resource-empty-state">未找到匹配资源，请返回后继续使用当前线路。</div>';
    } else {
        focusPreferredResourceCard();
    }
}

function waitForPlayerReady(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const video = art?.video;
        if (!video) {
            reject(new Error('播放器尚未就绪'));
            return;
        }

        if (video.readyState >= 2 && !video.error) {
            resolve();
            return;
        }

        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            video.removeEventListener('loadeddata', handleReady);
            video.removeEventListener('canplay', handleReady);
            video.removeEventListener('playing', handleReady);
            video.removeEventListener('error', handleError);
        };
        const handleReady = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };
        const handleError = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('目标线路无法播放'));
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('目标线路加载超时'));
        }, timeoutMs);

        video.addEventListener('loadeddata', handleReady, { once: true });
        video.addEventListener('canplay', handleReady, { once: true });
        video.addEventListener('playing', handleReady, { once: true });
        video.addEventListener('error', handleError, { once: true });
    });
}

async function loadResourceIntoPlayer(videoUrl, restorePosition = 0) {
    window.isSwitchingVideo = true;

    if (isWebkit || !art) {
        initPlayer(videoUrl);
        await waitForPlayerReady();
    } else if (typeof art.switchUrl === 'function') {
        // switchUrl 返回 Promise，只有目标地址达到可播放状态才会 resolve。
        await Promise.race([
            art.switchUrl(videoUrl),
            new Promise((_, reject) => setTimeout(() => reject(new Error('目标线路加载超时')), 15000))
        ]);
    } else {
        art.switch = videoUrl;
        await waitForPlayerReady();
    }

    if (restorePosition > 0 && art?.duration > restorePosition + 2) {
        art.currentTime = restorePosition;
    }
    if (art?.play) {
        await art.play().catch(() => {});
    }
}

function setResourceCardsSwitching(activeCard, isSwitching) {
    document.querySelectorAll('.resource-source-card').forEach(card => {
        card.disabled = isSwitching || card.classList.contains('current');
        card.classList.toggle('is-switching', isSwitching && card === activeCard);
        card.setAttribute('aria-busy', isSwitching && card === activeCard ? 'true' : 'false');
    });
}

// 原地切换资源：目标线路确认可播放后才提交状态，失败时自动恢复旧线路。
async function switchToResource(sourceKey, vodId, activeCard = null) {
    if (resourceSwitchInProgress) {
        showToast('正在切换资源，请勿重复操作', 'warning');
        return;
    }

    const sourceName = getResourceDisplayName(sourceKey);
    const snapshot = {
        episodes: [...currentEpisodes],
        episodeIndex: currentEpisodeIndex,
        videoUrl: currentVideoUrl,
        pageUrl: window.location.href,
        position: art?.video?.currentTime || 0,
        wasPaused: art?.video?.paused ?? false
    };

    let targetLoadStarted = false;
    resourceSwitchInProgress = true;
    setResourceCardsSwitching(activeCard, true);
    showLoading(`正在切换到 ${sourceName}...`);
    showToast(`正在切换到 ${sourceName}`, 'warning');

    try {
        let apiParams = '';
        if (sourceKey.startsWith('custom_')) {
            const customApi = getCustomApiInfo(sourceKey.replace('custom_', ''));
            if (!customApi) throw new Error('自定义API配置无效');
            apiParams = customApi.detail
                ? `&customApi=${encodeURIComponent(customApi.url)}&customDetail=${encodeURIComponent(customApi.detail)}&source=custom`
                : `&customApi=${encodeURIComponent(customApi.url)}&source=custom`;
        } else {
            apiParams = `&source=${encodeURIComponent(sourceKey)}`;
        }

        const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}`, {
            signal: AbortSignal.timeout(10000),
            cache: 'no-cache'
        });
        if (!response.ok) {
            throw new Error(`详情接口返回 ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data.episodes) || data.episodes.length === 0) {
            throw new Error('该线路没有可用播放地址');
        }

        const targetIndex = Math.min(snapshot.episodeIndex, data.episodes.length - 1);
        const targetUrl = data.episodes[targetIndex];
        if (!targetUrl || typeof targetUrl !== 'string') {
            throw new Error('目标播放地址无效');
        }

        targetLoadStarted = true;
        await loadResourceIntoPlayer(targetUrl, snapshot.position);

        // 目标线路已可播放，此时才原子提交应用状态。
        currentEpisodes = data.episodes;
        currentEpisodeIndex = targetIndex;
        currentVideoUrl = targetUrl;

        const newUrl = new URL(snapshot.pageUrl);
        newUrl.searchParams.set('id', vodId);
        newUrl.searchParams.set('source', sourceKey);
        newUrl.searchParams.set('source_code', sourceKey);
        newUrl.searchParams.set('url', targetUrl);
        newUrl.searchParams.set('index', targetIndex);
        if (snapshot.position > 0) {
            newUrl.searchParams.set('position', Math.floor(snapshot.position));
        } else {
            newUrl.searchParams.delete('position');
        }
        window.history.replaceState({}, '', newUrl.toString());

        try {
            localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
            localStorage.setItem('currentEpisodeIndex', String(targetIndex));
            localStorage.setItem('currentSourceCode', sourceKey);
            localStorage.setItem('currentPlayingId', String(vodId));
            localStorage.setItem('currentPlayingSource', sourceKey);
        } catch (error) {}

        // 用户主动选源时优先恢复播放，只有原播放器明确处于暂停状态且已有播放进度才保持暂停。
        if (snapshot.wasPaused && snapshot.position > 1 && art?.pause) {
            art.pause();
        }

        updateEpisodeInfo();
        updateButtonStates();
        renderEpisodes();
        renderResourceInfoBar();
        restoreVisualCleanModeForCurrentSource();
        closeResourceModal();
        showToast(`已切换到 ${sourceName}`, 'success');
    } catch (error) {
        console.error('切换资源失败:', error);

        // 若目标流已经替换进播放器，恢复旧流、旧集数、旧 URL 和原播放位置。
        currentEpisodes = snapshot.episodes;
        currentEpisodeIndex = snapshot.episodeIndex;
        currentVideoUrl = snapshot.videoUrl;
        window.history.replaceState({}, '', snapshot.pageUrl);

        if (targetLoadStarted && snapshot.videoUrl) {
            try {
                await loadResourceIntoPlayer(snapshot.videoUrl, snapshot.position);
                if (snapshot.wasPaused && art?.pause) art.pause();
            } catch (rollbackError) {
                console.error('恢复原播放源失败:', rollbackError);
            }
        }

        updateEpisodeInfo();
        updateButtonStates();
        renderEpisodes();
        renderResourceInfoBar();
        restoreVisualCleanModeForCurrentSource();
        showToast(`切换到 ${sourceName} 失败，已保留原播放源`, 'error');
    } finally {
        window.isSwitchingVideo = false;
        resourceSwitchInProgress = false;
        setResourceCardsSwitching(null, false);
        hideLoading();
        if (!document.getElementById('modal')?.classList.contains('hidden')) {
            activeCard?.focus({ preventScroll: true });
        }
    }
}
