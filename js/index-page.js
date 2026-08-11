// 首页热门中心、电视遥控导航和 URL 搜索参数处理
var HOT_RECOMMEND_SOURCE_KEY = 'hotRecommendSource';
var HOT_RECOMMEND_SOURCES = ['trending', 'douban'];

function isHotRecommendSourceEnabled(source) {
    var storageKey = source === 'trending' ? 'trendingEnabled' : 'doubanEnabled';
    try {
        return localStorage.getItem(storageKey) === 'true';
    } catch (error) {
        return true;
    }
}

function getStoredHotRecommendSource() {
    try {
        return localStorage.getItem(HOT_RECOMMEND_SOURCE_KEY) || 'trending';
    } catch (error) {
        return 'trending';
    }
}

function syncHotRecommendHub(preferredSource) {
    var hotArea = document.getElementById('hotRecommendArea');
    var hub = document.getElementById('hotRecommendHub');
    var resultsArea = document.getElementById('resultsArea');
    if (!hotArea || !hub) return;

    var enabledSources = HOT_RECOMMEND_SOURCES.filter(isHotRecommendSourceEnabled);
    var isSearching = resultsArea && !resultsArea.classList.contains('hidden');
    var shouldShow = enabledSources.length > 0 && !isSearching;

    hotArea.style.display = shouldShow ? '' : 'none';
    if (!shouldShow) {
        HOT_RECOMMEND_SOURCES.forEach(function (source) {
            var hiddenPanel = document.getElementById(source === 'trending' ? 'trendingArea' : 'doubanArea');
            if (hiddenPanel) {
                hiddenPanel.style.display = 'none';
                hiddenPanel.classList.remove('is-active');
                hiddenPanel.setAttribute('aria-hidden', 'true');
            }
        });
        return;
    }

    var requestedSource = preferredSource || getStoredHotRecommendSource();
    var activeSource = enabledSources.includes(requestedSource) ? requestedSource : enabledSources[0];
    hub.setAttribute('data-active-source', activeSource);

    HOT_RECOMMEND_SOURCES.forEach(function (source) {
        var panelId = source === 'trending' ? 'trendingArea' : 'doubanArea';
        var buttonId = source === 'trending' ? 'hotSourceTmdb' : 'hotSourceDouban';
        var panel = document.getElementById(panelId);
        var button = document.getElementById(buttonId);
        var enabled = enabledSources.includes(source);
        var active = enabled && source === activeSource;

        if (button) {
            button.hidden = !enabled;
            button.disabled = !enabled;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
            button.setAttribute('tabindex', active ? '0' : '-1');
        }

        if (panel) {
            panel.style.display = active ? '' : 'none';
            panel.classList.toggle('is-active', active);
            panel.classList.toggle('hidden', !active);
            panel.setAttribute('aria-hidden', active ? 'false' : 'true');
        }
    });

    try {
        localStorage.setItem(HOT_RECOMMEND_SOURCE_KEY, activeSource);
    } catch (error) {
        // Storage can be unavailable in privacy-focused television browsers.
    }
}

window.syncHotRecommendHub = syncHotRecommendHub;

function initHotRecommendHub() {
    var sourceButtons = document.querySelectorAll('[data-hot-source]');
    sourceButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            syncHotRecommendHub(button.getAttribute('data-hot-source'));
        });
    });

    syncHotRecommendHub();
}

var TV_NAV_SELECTOR = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

function isTvNavigable(element) {
    if (!element || element.disabled) return false;
    if (element.closest('[aria-hidden="true"], [inert], .hidden')) return false;

    var style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    var rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function getTvNavigationScope() {
    return document.querySelector('#settingsPanel.show, #historyPanel.show, .modal-overlay[aria-hidden="false"], .modal-overlay[style*="flex"]')
        || document;
}

function getTvCandidates(scope) {
    return Array.from(scope.querySelectorAll(TV_NAV_SELECTOR)).filter(isTvNavigable);
}

function getElementCenter(element) {
    var rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        rect: rect
    };
}

function getDirectionalScore(origin, candidate, direction) {
    var target = getElementCenter(candidate);
    var dx = target.x - origin.x;
    var dy = target.y - origin.y;
    var primary;
    var secondary;
    var overlap;

    if (direction === 'left') {
        if (dx >= -2) return Number.POSITIVE_INFINITY;
        primary = -dx;
        secondary = Math.abs(dy);
        overlap = Math.max(0, Math.min(origin.rect.bottom, target.rect.bottom)
            - Math.max(origin.rect.top, target.rect.top));
    } else if (direction === 'right') {
        if (dx <= 2) return Number.POSITIVE_INFINITY;
        primary = dx;
        secondary = Math.abs(dy);
        overlap = Math.max(0, Math.min(origin.rect.bottom, target.rect.bottom)
            - Math.max(origin.rect.top, target.rect.top));
    } else if (direction === 'up') {
        if (dy >= -2) return Number.POSITIVE_INFINITY;
        primary = -dy;
        secondary = Math.abs(dx);
        overlap = Math.max(0, Math.min(origin.rect.right, target.rect.right)
            - Math.max(origin.rect.left, target.rect.left));
    } else {
        if (dy <= 2) return Number.POSITIVE_INFINITY;
        primary = dy;
        secondary = Math.abs(dx);
        overlap = Math.max(0, Math.min(origin.rect.right, target.rect.right)
            - Math.max(origin.rect.left, target.rect.left));
    }

    return primary + secondary * 2.2 - Math.min(overlap, 120) * 0.35;
}

function focusTvElement(element) {
    if (!element) return;

    try {
        element.focus({ preventScroll: true });
    } catch (error) {
        element.focus();
    }

    try {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } catch (error) {
        element.scrollIntoView(false);
    }
}

function getDefaultTvTarget(scope, candidates) {
    var panelClose = scope !== document ? scope.querySelector('.close-btn, .modal-close') : null;
    if (panelClose && isTvNavigable(panelClose)) return panelClose;

    var preferred = scope.querySelector('[data-tv-default]');
    if (preferred && isTvNavigable(preferred)) return preferred;

    return candidates[0] || null;
}

function getSearchResultNavigationTarget(activeElement, direction) {
    var grid = document.getElementById('results');
    if (!grid || !activeElement || !grid.contains(activeElement)) return null;

    var cards = Array.from(grid.querySelectorAll('.result-card')).filter(isTvNavigable);
    if (!cards.length) return null;
    var origin = getElementCenter(activeElement);
    var sameAxis = cards.filter(function (candidate) {
        if (candidate === activeElement) return false;
        var target = getElementCenter(candidate);
        if (direction === 'left' || direction === 'right') {
            return Math.abs(target.y - origin.y) < Math.max(origin.rect.height, target.rect.height) * .55;
        }
        return Math.abs(target.x - origin.x) < Math.max(origin.rect.width, target.rect.width) * .7;
    });
    var pool = sameAxis.length ? sameAxis : cards;
    var best = null;
    var bestScore = Number.POSITIVE_INFINITY;
    pool.forEach(function (candidate) {
        var score = getDirectionalScore(origin, candidate, direction);
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    });
    return best;
}

function handleSearchResultDirection(event, direction) {
    var activeElement = document.activeElement;
    var target = getSearchResultNavigationTarget(activeElement, direction);
    if (!target) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    focusTvElement(target);
    return true;
}

function handleTvDirection(event) {
    var directionMap = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down'
    };
    var legacyDirectionMap = {
        37: 'left',
        38: 'up',
        39: 'right',
        40: 'down'
    };
    var direction = directionMap[event.key] || legacyDirectionMap[event.keyCode];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;

    if (handleSearchResultDirection(event, direction)) return;

    var activeElement = document.activeElement;
    var tagName = activeElement && activeElement.tagName;
    var isTextEntry = tagName === 'INPUT' || tagName === 'TEXTAREA';
    if (isTextEntry && (direction === 'left' || direction === 'right')) return;

    var scope = getTvNavigationScope();
    var candidates = getTvCandidates(scope);
    if (candidates.length === 0) return;

    document.body.classList.add('tv-navigation-active');

    if (!isTvNavigable(activeElement) || !scope.contains(activeElement)) {
        event.preventDefault();
        focusTvElement(getDefaultTvTarget(scope, candidates));
        return;
    }

    var origin = getElementCenter(activeElement);
    var bestCandidate = null;
    var bestScore = Number.POSITIVE_INFINITY;

    candidates.forEach(function (candidate) {
        if (candidate === activeElement) return;
        var score = getDirectionalScore(origin, candidate, direction);
        if (score < bestScore) {
            bestScore = score;
            bestCandidate = candidate;
        }
    });

    if (bestCandidate) {
        event.preventDefault();
        focusTvElement(bestCandidate);
    }
}

function initTvRemoteNavigation() {
    // NOTE: 优先使用统一焦点管理器（tv-focus-manager.js）
    // 若 tvFocusManager 已加载，只注册首页特有的 Back 键行为即可；
    // 方向键/确认键导航已由 tvFocusManager 内置处理器统一管理。
    if (window.tvFocusManager) {
        // 注册首页 Back 键：关闭搜索结果 / 关闭弹窗
        window.tvFocusManager.registerKeyHandler('homepage-back', {
            match: function (event) {
                return event.key === 'Escape'
                    || event.key === 'BrowserBack'
                    || event.key === 'GoBack'
                    || event.keyCode === 27
                    || event.keyCode === 461
                    || event.keyCode === 10009
                    || event.keyCode === 4;
            },
            handler: function (event) {
                // 有打开的弹窗时让 tvFocusManager 的内置处理器负责（scope stack 非空）
                if (window.tvFocusManager._scopeStack.length > 0) return false;

                var resultsArea = document.getElementById('resultsArea');
                if (resultsArea && !resultsArea.classList.contains('hidden')) {
                    event.preventDefault();
                    if (typeof resetToHome === 'function') resetToHome();
                    return true;
                }
                return false;
            },
            priority: 20  // 高于 tvFocusManager 内置处理器（priority 10）
        });

        // 注册首页确认键：搜索框上弹出虚拟键盘（由 tv-keyboard.js 监听 tv-confirm 事件处理）
        // 此处无需额外处理，tvFocusManager 内置确认键处理会触发 tv-confirm 事件

        return; // 剩余逻辑由 tvFocusManager 负责
    }

    // HACK: tvFocusManager 未加载时的降级实现（保持原有代码）
    document.addEventListener('keydown', function (event) {
        var isArrowKey = (event.key && event.key.indexOf('Arrow') === 0)
            || (event.keyCode >= 37 && event.keyCode <= 40);

        if (isArrowKey) {
            handleTvDirection(event);
            return;
        }

        var isConfirmKey = event.key === 'Enter'
            || event.key === ' '
            || event.key === 'Select'
            || event.keyCode === 13
            || event.keyCode === 23
            || event.keyCode === 32
            || event.keyCode === 66;

        var isBackKey = event.key === 'Escape'
            || event.key === 'BrowserBack'
            || event.key === 'GoBack'
            || event.keyCode === 27
            || event.keyCode === 461
            || event.keyCode === 10009;

        if (isBackKey) {
            var scope = getTvNavigationScope();
            var resultsArea = document.getElementById('resultsArea');
            var hasOpenOverlay = scope !== document;
            if (hasOpenOverlay) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (scope.id === 'modal' && typeof closeModal === 'function') {
                    closeModal();
                } else if (typeof window.closeAllPanels === 'function') {
                    window.closeAllPanels();
                }
                return;
            }
            if (resultsArea && !resultsArea.classList.contains('hidden')) {
                event.preventDefault();
                if (typeof resetToHome === 'function') resetToHome();
            }
            return;
        }

        if (!isConfirmKey) return;

        var activeElement = document.activeElement;
        var tagName = activeElement && activeElement.tagName;
        var inputType = tagName === 'INPUT' ? (activeElement.type || 'text').toLowerCase() : '';
        var isTextEntry = tagName === 'TEXTAREA'
            || (tagName === 'INPUT' && ['text', 'search', 'password', 'email', 'url', 'tel', 'number'].includes(inputType));
        var isConfirmTarget = activeElement
            && activeElement.matches('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"]');

        if (isConfirmTarget && !isTextEntry) {
            event.preventDefault();
            activeElement.click();
        }
    }, true);

    document.addEventListener('pointerdown', function () {
        document.body.classList.remove('tv-navigation-active');
    }, true);
}


// 页面加载后处理首页控件和 URL 搜索参数
document.addEventListener('DOMContentLoaded', function () {
    initHotRecommendHub();
    initTvRemoteNavigation();

    if (window.location.pathname.startsWith('/watch')) return;

    var path = window.location.pathname;
    var searchPrefix = '/s=';
    var keyword = '';

    if (path.startsWith(searchPrefix)) {
        keyword = decodeURIComponent(path.substring(searchPrefix.length));
    } else {
        try {
            var urlParams = new URLSearchParams(window.location.search);
            keyword = urlParams.get('s') || '';
        } catch (error) {
            keyword = '';
        }
    }

    if (keyword) {
        var input = document.getElementById('searchInput');
        if (input) {
            input.value = keyword;
            if (typeof toggleClearButton === 'function') toggleClearButton();
        }
        setTimeout(function () {
            if (typeof search === 'function') search();
            try {
                window.history.replaceState(
                    { search: keyword },
                    'FreeDY - ' + keyword,
                    window.location.href
                );
            } catch (error) {
                // Older television browsers may restrict history state changes.
            }
        }, 300);
    }
});
