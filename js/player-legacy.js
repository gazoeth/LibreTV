/**
 * player-legacy.js — Safari 12 / iOS 12 原生 HLS 播放器
 * NOTE: 旧版 Safari 无法解析 ArtPlayer/HLS.js 的现代语法，
 *       但 iOS Safari 原生支持 HLS，因此直接使用 <video> 播放。
 *       不使用可选链(?.)、空值合并(??)、AbortSignal.timeout 等 ES2020+ 特性。
 */
(function () {
    'use strict';

    // ── 全局状态 ──────────────────────────────────────────────
    var currentEpisodes = [];
    var currentEpisodeIndex = 0;
    var episodesReversed = false;
    var autoplayEnabled = true;
    var videoElement = null;
    var progressSaveTimer = null;
    var currentVideoTitle = '';
    var currentSourceCode = '';
    var PROGRESS_KEY = 'playbackProgress';

    // ── 工具函数 ──────────────────────────────────────────────
    function getUrlParam(name) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name) || '';
    }

    function getSourceCode() {
        return getUrlParam('source_code') || getUrlParam('source') || '';
    }

    function safeText(str) {
        if (!str) return '';
        return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── 进度保存 / 恢复 ──────────────────────────────────────
    function getProgressKey(url, title) {
        return (title || '') + '|' + (url || '');
    }

    function saveProgress() {
        if (!videoElement || !videoElement.currentTime) return;
        try {
            var allProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
            var key = getProgressKey(currentVideoTitle, currentSourceCode);
            allProgress[key] = {
                time: videoElement.currentTime,
                duration: videoElement.duration || 0,
                index: currentEpisodeIndex,
                ts: Date.now()
            };
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
        } catch (e) {
            // NOTE: 存储空间不足时静默失败
        }
    }

    function loadProgress() {
        try {
            var allProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
            var key = getProgressKey(currentVideoTitle, currentSourceCode);
            return allProgress[key] || null;
        } catch (e) {
            return null;
        }
    }

    function startProgressSave() {
        if (progressSaveTimer) clearInterval(progressSaveTimer);
        progressSaveTimer = setInterval(saveProgress, 5000);
    }

    // ── 密码验证检查（复用已有逻辑）──────────────────────────
    function isPasswordVerified() {
        if (typeof window.isPasswordVerified === 'function') {
            return window.isPasswordVerified();
        }
        // 如果密码功能未加载，默认通过
        var envPw = '';
        if (window.__ENV__ && window.__ENV__.PASSWORD) {
            envPw = window.__ENV__.PASSWORD;
        }
        if (!envPw || envPw === '{{PASSWORD}}' || envPw === '') return true;
        return localStorage.getItem('passwordVerified') === 'true';
    }

    // ── 创建原生播放器 ───────────────────────────────────────
    function createNativePlayer(videoUrl) {
        var playerDiv = document.getElementById('player');
        if (!playerDiv) return;

        // 清空占位内容
        playerDiv.innerHTML = '';
        playerDiv.className = 'legacy-player-wrapper';

        videoElement = document.createElement('video');
        videoElement.setAttribute('controls', '');
        videoElement.setAttribute('playsinline', '');
        videoElement.setAttribute('webkit-playsinline', '');
        videoElement.setAttribute('x-webkit-airplay', 'allow');
        videoElement.setAttribute('preload', 'auto');
        videoElement.setAttribute('autoplay', '');
        videoElement.className = 'legacy-video';
        videoElement.style.cssText = 'width:100%;height:100%;background:#000;display:block;';

        if (videoUrl) {
            videoElement.src = videoUrl;
        }

        playerDiv.appendChild(videoElement);

        // 事件绑定
        videoElement.addEventListener('loadedmetadata', function () {
            // 恢复上次播放进度
            var saved = loadProgress();
            var savedPos = parseInt(getUrlParam('position') || '0', 10);
            // NOTE: 优先使用 URL 参数中的进度，其次用 localStorage 记录的进度
            if (savedPos && savedPos > 5) {
                videoElement.currentTime = savedPos;
            } else if (saved && saved.index === currentEpisodeIndex &&
                       typeof saved.time === 'number' && saved.time > 5) {
                videoElement.currentTime = saved.time - 2; // 回退2秒防止跳帧
            }
        });

        videoElement.addEventListener('ended', function () {
            saveProgress();
            if (autoplayEnabled) {
                playNextEpisode();
            }
        });

        videoElement.addEventListener('error', function () {
            var errorDiv = document.getElementById('error');
            var errorMsg = document.getElementById('error-message');
            if (errorDiv) errorDiv.style.display = 'block';
            if (errorMsg) errorMsg.textContent = '视频加载失败，请尝试其他视频源';
        });

        videoElement.addEventListener('playing', function () {
            var errorDiv = document.getElementById('error');
            if (errorDiv) errorDiv.style.display = 'none';
        });

        startProgressSave();
    }

    // ── 切换视频源 ───────────────────────────────────────────
    function switchVideo(url) {
        if (!videoElement) {
            createNativePlayer(url);
        } else {
            saveProgress();
            videoElement.src = url;
            videoElement.load();
            videoElement.play();
        }
        // 隐藏加载提示
        var loadingEl = document.getElementById('player-loading');
        if (loadingEl) loadingEl.style.display = 'none';
        var loadingOverlay = document.querySelector('.player-loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    // ── 集数解析 ─────────────────────────────────────────────
    function parseEpisodes(episodesStr) {
        if (!episodesStr) return [];
        try {
            return JSON.parse(decodeURIComponent(episodesStr));
        } catch (e) {
            // FIXME: 部分旧格式使用 # 和 $ 分隔
            var result = [];
            var groups = episodesStr.split('#');
            for (var i = 0; i < groups.length; i++) {
                var parts = groups[i].split('$');
                if (parts.length >= 2) {
                    result.push({ name: parts[0], url: parts[1] });
                }
            }
            return result;
        }
    }

    // ── 渲染集数列表 ─────────────────────────────────────────
    function renderEpisodes() {
        var listEl = document.getElementById('episodesList');
        if (!listEl) return;

        var eps = episodesReversed ? currentEpisodes.slice().reverse() : currentEpisodes;
        var html = '';

        for (var i = 0; i < eps.length; i++) {
            var realIndex = episodesReversed ? (currentEpisodes.length - 1 - i) : i;
            var isActive = (realIndex === currentEpisodeIndex);
            var name = safeText(eps[i].name || ('第' + (realIndex + 1) + '集'));

            html += '<button class="legacy-ep-btn' + (isActive ? ' active' : '') + '"'
                + ' data-index="' + realIndex + '"'
                + ' style="'
                + 'display:inline-block;padding:6px 12px;margin:3px;'
                + 'border-radius:8px;border:1px solid rgba(255,255,255,0.12);'
                + 'background:' + (isActive ? 'rgba(229,9,20,0.85)' : 'rgba(255,255,255,0.06)') + ';'
                + 'color:' + (isActive ? '#fff' : '#c0c0d0') + ';'
                + 'font-size:13px;cursor:pointer;'
                + '">' + name + '</button>';
        }

        listEl.innerHTML = html;

        // 绑定点击事件
        var buttons = listEl.querySelectorAll('.legacy-ep-btn');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function () {
                var idx = parseInt(this.getAttribute('data-index'), 10);
                playEpisode(idx);
            });
        }

        // 更新集数信息
        var infoEl = document.getElementById('episodeInfo');
        if (infoEl) {
            infoEl.textContent = '第 ' + (currentEpisodeIndex + 1) + ' / ' + currentEpisodes.length + ' 集';
        }
    }

    // ── 播放指定集数 ─────────────────────────────────────────
    function playEpisode(index) {
        if (index < 0 || index >= currentEpisodes.length) return;
        currentEpisodeIndex = index;
        var ep = currentEpisodes[index];
        if (ep && ep.url) {
            switchVideo(ep.url);
        }
        renderEpisodes();

        // 更新标题
        var titleEl = document.getElementById('videoTitle');
        if (titleEl) {
            var epName = ep.name || ('第' + (index + 1) + '集');
            titleEl.textContent = currentVideoTitle + ' - ' + epName;
        }
    }

    // ── 上一集 / 下一集 ──────────────────────────────────────
    window.playPreviousEpisode = function () {
        if (currentEpisodeIndex > 0) {
            playEpisode(currentEpisodeIndex - 1);
        }
    };

    window.playNextEpisode = function () {
        if (currentEpisodeIndex < currentEpisodes.length - 1) {
            playEpisode(currentEpisodeIndex + 1);
        }
    };

    // ── 集数排序切换 ─────────────────────────────────────────
    window.toggleEpisodeOrder = function () {
        episodesReversed = !episodesReversed;
        var orderText = document.getElementById('orderText');
        if (orderText) {
            orderText.textContent = episodesReversed ? '正序排列' : '倒序排列';
        }
        renderEpisodes();
    };

    // ── 复制链接 ─────────────────────────────────────────────
    window.copyLinks = function () {
        if (!currentEpisodes[currentEpisodeIndex]) return;
        var url = currentEpisodes[currentEpisodeIndex].url;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url);
        } else {
            // HACK: 旧浏览器回退方案
            var ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        alert('链接已复制');
    };

    // ── 控制锁定（旧版简化实现）─────────────────────────────
    window.toggleControlsLock = function () {
        // NOTE: 原生 <video> 无需锁定控制，空实现
    };

    // ── 返回按钮 ─────────────────────────────────────────────
    window.goBack = function (event) {
        if (event) event.preventDefault();
        var returnUrl = getUrlParam('returnUrl');
        if (returnUrl) {
            window.location.href = decodeURIComponent(returnUrl);
            return;
        }
        var lastPage = localStorage.getItem('lastPageUrl');
        if (lastPage && lastPage !== window.location.href) {
            window.location.href = lastPage;
            return;
        }
        if (document.referrer) {
            window.location.href = document.referrer;
            return;
        }
        window.location.href = '/';
    };

    // ── 从 API 获取详情（兼容方式）──────────────────────────
    function fetchDetailLegacy(vodId, sourceCode, callback) {
        var apiUrl = '/api/detail?id=' + encodeURIComponent(vodId) + '&source=' + encodeURIComponent(sourceCode);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', apiUrl, true);
        xhr.timeout = 15000;
        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    callback(null, data);
                } catch (e) {
                    callback(e, null);
                }
            } else {
                callback(new Error('HTTP ' + xhr.status), null);
            }
        };
        xhr.onerror = function () { callback(new Error('Network error'), null); };
        xhr.ontimeout = function () { callback(new Error('Timeout'), null); };
        xhr.send();
    }

    // ── 换源模态框 ───────────────────────────────────────────
    window.closeModal = function () {
        var modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
    };

    // ── 主初始化 ─────────────────────────────────────────────
    function initLegacyPlayer() {
        // 强制隐藏密码验证弹窗（旧 Safari 下 Tailwind .hidden 不生效）
        var pwModal = document.getElementById('passwordModal');
        if (pwModal) {
            // 仅在不需要密码验证或已验证时隐藏
            if (isPasswordVerified()) {
                pwModal.style.display = 'none';
            }
        }

        // 隐藏侧栏推荐（旧版不加载推荐脚本）
        var sideRecommend = document.getElementById('sideRecommend');
        if (sideRecommend) sideRecommend.style.display = 'none';

        // 解析参数
        var videoUrl = getUrlParam('url');
        var title = getUrlParam('title');
        var sourceCode = getSourceCode();
        var indexStr = getUrlParam('index');
        var episodesStr = getUrlParam('episodes');
        var vodId = getUrlParam('id');

        currentVideoTitle = title || 'FreeDY 播放';
        currentSourceCode = sourceCode;
        currentEpisodeIndex = parseInt(indexStr || '0', 10);

        // 更新页面标题
        document.title = currentVideoTitle + ' - FreeDY';
        var titleEl = document.getElementById('videoTitle');
        if (titleEl) titleEl.textContent = currentVideoTitle;

        // 自动连播开关
        var autoToggle = document.getElementById('autoplayToggle');
        if (autoToggle) {
            autoToggle.checked = autoplayEnabled;
            autoToggle.addEventListener('change', function () {
                autoplayEnabled = this.checked;
            });
        }

        // 情况一：URL 中直接有 episodes 数据
        if (episodesStr) {
            currentEpisodes = parseEpisodes(episodesStr);
        }

        // 后备：从 localStorage 读取集数（与现代浏览器路径保持一致）
        if (!currentEpisodes || currentEpisodes.length === 0) {
            try {
                var stored = localStorage.getItem('currentEpisodes');
                if (stored) currentEpisodes = JSON.parse(stored);
            } catch (e) {
                // NOTE: 解析失败时继续尝试其他方式
            }
        }

        if (currentEpisodes && currentEpisodes.length > 0) {
            renderEpisodes();
            if (videoUrl) {
                switchVideo(videoUrl);
            } else {
                playEpisode(currentEpisodeIndex);
            }
            return;
        }

        // 情况二：有直接视频 URL
        if (videoUrl) {
            currentEpisodes = [{ name: currentVideoTitle, url: videoUrl }];
            createNativePlayer(videoUrl);
            renderEpisodes();
            return;
        }

        // 情况三：需要从 API 获取详情
        if (vodId && sourceCode) {
            var loadingTitle = document.getElementById('loading-title');
            if (loadingTitle) loadingTitle.textContent = '正在获取视频信息…';

            fetchDetailLegacy(vodId, sourceCode, function (err, data) {
                if (err || !data) {
                    var errorDiv = document.getElementById('error');
                    var errorMsg = document.getElementById('error-message');
                    if (errorDiv) errorDiv.style.display = 'flex';
                    if (errorMsg) errorMsg.textContent = '获取视频信息失败: ' + (err ? err.message : '未知错误');
                    return;
                }

                // 更新标题
                if (data.name) {
                    currentVideoTitle = data.name;
                    document.title = currentVideoTitle + ' - FreeDY';
                    if (titleEl) titleEl.textContent = currentVideoTitle;
                }

                // 解析集数
                if (data.episodes && data.episodes.length > 0) {
                    currentEpisodes = data.episodes;
                    renderEpisodes();
                    playEpisode(currentEpisodeIndex);
                } else if (data.url) {
                    currentEpisodes = [{ name: currentVideoTitle, url: data.url }];
                    switchVideo(data.url);
                    renderEpisodes();
                } else {
                    var errorDiv2 = document.getElementById('error');
                    var errorMsg2 = document.getElementById('error-message');
                    if (errorDiv2) errorDiv2.style.display = 'flex';
                    if (errorMsg2) errorMsg2.textContent = '未找到可播放的视频源';
                }
            });
            return;
        }

        // 无任何可用参数
        var errorDiv3 = document.getElementById('error');
        var errorMsg3 = document.getElementById('error-message');
        if (errorDiv3) errorDiv3.style.display = 'flex';
        if (errorMsg3) errorMsg3.textContent = '缺少视频播放参数';
    }

    // ── 启动 ─────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLegacyPlayer);
    } else {
        initLegacyPlayer();
    }

    // 页面卸载时保存进度
    window.addEventListener('beforeunload', saveProgress);
    window.addEventListener('pagehide', saveProgress);

})();
