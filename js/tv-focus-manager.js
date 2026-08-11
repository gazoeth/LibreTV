/**
 * FreeDY 统一焦点管理器
 * 为电视遥控器和键盘导航提供统一的焦点管理、空间导航和按键分发
 * 目标设备：小米电视盒、Android TV、夏普电视
 */
(function () {
    'use strict';

    // NOTE: 可导航元素的选择器列表
    var NAV_SELECTOR = [
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    // NOTE: TV 设备 User-Agent 关键词
    var TV_UA_KEYWORDS = [
        'SmartTV', 'SMART-TV', 'AndroidTV', 'Android TV',
        'Tizen', 'webOS', 'Web0S', 'BRAVIA', 'MIBOX', 'MiTV',
        'Sharp', 'Hisense', 'VIDAA', 'Roku', 'FireTV', 'AFT',
        'CrKey', 'AppleTV', 'tvOS', 'STB', 'NETTV', 'HbbTV'
    ];

    // NOTE: 方向键映射表（兼容旧版 keyCode）
    var DIRECTION_MAP = {
        ArrowLeft: 'left', ArrowRight: 'right',
        ArrowUp: 'up', ArrowDown: 'down'
    };
    var DIRECTION_KEYCODE_MAP = {
        37: 'left', 38: 'up', 39: 'right', 40: 'down'
    };

    // NOTE: 确认键列表
    var CONFIRM_KEYS = ['Enter', 'Select'];
    var CONFIRM_KEYCODES = [13, 23, 32, 66];

    // NOTE: 返回键列表
    var BACK_KEYS = ['Escape', 'BrowserBack', 'GoBack'];
    var BACK_KEYCODES = [27, 461, 10009, 4];

    /**
     * 判断元素是否可见且可导航
     * @param {Element} element - 目标元素
     * @returns {boolean}
     */
    function isNavigable(element) {
        if (!element || element.disabled) return false;
        if (element.closest('[aria-hidden="true"], [inert], .hidden')) return false;

        var style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;

        var rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    /**
     * 获取元素中心点坐标和边界
     * @param {Element} element
     * @returns {{ x: number, y: number, rect: DOMRect }}
     */
    function getCenter(element) {
        var rect = element.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            rect: rect
        };
    }

    /**
     * 改进的方向评分算法（含网格感知）
     * 分数越低表示越适合作为目标
     * @param {object} origin - 起点中心坐标（含 rect）
     * @param {Element} candidate - 候选元素
     * @param {string} direction - 方向 'left'|'right'|'up'|'down'
     * @returns {number} 评分，Infinity 表示不在目标方向
     */
    function getDirectionalScore(origin, candidate, direction) {
        var target = getCenter(candidate);
        var dx = target.x - origin.x;
        var dy = target.y - origin.y;
        var primary, secondary, overlap;

        if (direction === 'left') {
            if (dx >= -2) return Number.POSITIVE_INFINITY;
            primary = -dx;
            secondary = Math.abs(dy);
            // 垂直重叠度（网格感知：同行元素优先）
            overlap = Math.max(0,
                Math.min(origin.rect.bottom, target.rect.bottom) -
                Math.max(origin.rect.top, target.rect.top));
        } else if (direction === 'right') {
            if (dx <= 2) return Number.POSITIVE_INFINITY;
            primary = dx;
            secondary = Math.abs(dy);
            overlap = Math.max(0,
                Math.min(origin.rect.bottom, target.rect.bottom) -
                Math.max(origin.rect.top, target.rect.top));
        } else if (direction === 'up') {
            if (dy >= -2) return Number.POSITIVE_INFINITY;
            primary = -dy;
            secondary = Math.abs(dx);
            // 水平重叠度（网格感知：同列元素优先）
            overlap = Math.max(0,
                Math.min(origin.rect.right, target.rect.right) -
                Math.max(origin.rect.left, target.rect.left));
        } else { // down
            if (dy <= 2) return Number.POSITIVE_INFINITY;
            primary = dy;
            secondary = Math.abs(dx);
            overlap = Math.max(0,
                Math.min(origin.rect.right, target.rect.right) -
                Math.max(origin.rect.left, target.rect.left));
        }

        // NOTE: 评分公式：主方向距离 + 副方向距离×2.5 - 重叠加分×0.4
        // 重叠度越大（说明在同行/同列），得分越低，越优先
        return primary + secondary * 2.5 - Math.min(overlap, 150) * 0.4;
    }

    /**
     * TvFocusManager 统一焦点管理器
     */
    function TvFocusManager() {
        /** @type {boolean} 是否检测为 TV 设备 */
        this.isTvDevice = false;

        /** @type {boolean} 当前是否在方向键导航模式 */
        this.isActive = false;

        /** @type {Array<{element: Element, previousFocus: Element, options: object}>} 焦点栈 */
        this._scopeStack = [];

        /** @type {Map<string, {keys: Array, handler: Function, priority: number, scope: string}>} 按键处理器注册表 */
        this._keyHandlers = {};

        /** @type {number} 按键处理器 ID 计数器 */
        this._handlerId = 0;

        this._init();
    }

    /**
     * 初始化焦点管理器
     */
    TvFocusManager.prototype._init = function () {
        var self = this;

        // 检测 TV 设备
        this.isTvDevice = this._detectTvDevice();

        if (this.isTvDevice) {
            document.body.classList.add('tv-mode');
        }

        // 全局 keydown 监听（捕获阶段，优先处理）
        document.addEventListener('keydown', function (event) {
            self._handleKeyDown(event);
        }, true);

        // 鼠标/触摸操作时退出 TV 导航模式
        document.addEventListener('pointerdown', function () {
            if (self.isActive) {
                self.isActive = false;
                document.body.classList.remove('tv-navigation-active');
                // NOTE: 保留 player-tv-navigation-active 的兼容
                document.body.classList.remove('player-tv-navigation-active');
            }
        }, true);

        // 注册内置按键处理
        this._registerBuiltinHandlers();
    };

    /**
     * 检测当前设备是否为电视
     * @returns {boolean}
     */
    TvFocusManager.prototype._detectTvDevice = function () {
        // 检查 UA
        var ua = navigator.userAgent || '';
        for (var i = 0; i < TV_UA_KEYWORDS.length; i++) {
            if (ua.indexOf(TV_UA_KEYWORDS[i]) !== -1) return true;
        }

        // 检查媒体查询：无 hover + 粗指针（通常表示遥控器/触摸设备）
        // NOTE: 某些电视浏览器不支持 matchMedia，需要容错
        try {
            var noHover = window.matchMedia('(hover: none)').matches;
            var coarsePointer = window.matchMedia('(pointer: coarse)').matches;
            var largeScreen = window.matchMedia('(min-width: 1200px)').matches;
            if (noHover && coarsePointer && largeScreen) return true;
        } catch (e) {
            // matchMedia 不可用时忽略
        }

        return false;
    };

    /**
     * 注册内置的按键处理器
     */
    TvFocusManager.prototype._registerBuiltinHandlers = function () {
        var self = this;

        // 方向键导航（低优先级，可被其他处理器覆盖）
        this.registerKeyHandler('builtin-navigation', {
            match: function (event) {
                return !!(DIRECTION_MAP[event.key] || DIRECTION_KEYCODE_MAP[event.keyCode]);
            },
            handler: function (event) {
                var direction = DIRECTION_MAP[event.key] || DIRECTION_KEYCODE_MAP[event.keyCode];
                if (!direction) return false;

                // 文本输入框中左右键不拦截（允许光标移动）
                var tag = document.activeElement && document.activeElement.tagName;
                var isTextEntry = tag === 'INPUT' || tag === 'TEXTAREA';
                if (isTextEntry && (direction === 'left' || direction === 'right')) return false;

                // 激活 TV 导航模式
                if (!self.isActive) {
                    self.isActive = true;
                    document.body.classList.add('tv-navigation-active');
                }

                event.preventDefault();
                self.navigate(direction);
                return true;
            },
            priority: 10
        });

        // 确认键处理（低优先级）
        this.registerKeyHandler('builtin-confirm', {
            match: function (event) {
                if (event.altKey || event.ctrlKey || event.metaKey) return false;
                return CONFIRM_KEYS.indexOf(event.key) !== -1 ||
                    CONFIRM_KEYCODES.indexOf(event.keyCode) !== -1;
            },
            handler: function (event) {
                if (!self.isActive) return false;

                var active = document.activeElement;
                if (!active) return false;

                var tag = active.tagName;
                var inputType = tag === 'INPUT' ? (active.type || 'text').toLowerCase() : '';
                var isTextEntry = tag === 'TEXTAREA' ||
                    (tag === 'INPUT' && ['text', 'search', 'password', 'email', 'url', 'tel', 'number'].indexOf(inputType) !== -1);

                // 文本输入框上按确认键，触发自定义事件（TV 键盘可监听此事件）
                if (isTextEntry) {
                    var tvConfirmEvent = new CustomEvent('tv-confirm', { bubbles: true, cancelable: true });
                    var handled = !active.dispatchEvent(tvConfirmEvent);
                    if (handled) {
                        event.preventDefault();
                        return true;
                    }
                    return false;
                }

                // 按钮/链接/checkbox 等可交互元素
                var isClickable = active.matches('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"]');
                if (isClickable) {
                    event.preventDefault();
                    // NOTE: 特殊处理自定义 toggle 控件
                    if (active.id === 'autoplayControl') {
                        var toggle = document.getElementById('autoplayToggle');
                        if (toggle) {
                            toggle.checked = !toggle.checked;
                            toggle.dispatchEvent(new Event('change', { bubbles: true }));
                            active.setAttribute('aria-checked', toggle.checked ? 'true' : 'false');
                        }
                    } else {
                        active.click();
                    }
                    return true;
                }

                return false;
            },
            priority: 10
        });

        // 返回键处理（低优先级）
        this.registerKeyHandler('builtin-back', {
            match: function (event) {
                return BACK_KEYS.indexOf(event.key) !== -1 ||
                    BACK_KEYCODES.indexOf(event.keyCode) !== -1;
            },
            handler: function (event) {
                // 如果有打开的 scope，关闭最顶层的
                if (self._scopeStack.length > 0) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    var top = self._scopeStack[self._scopeStack.length - 1];
                    if (top.options && typeof top.options.onBack === 'function') {
                        top.options.onBack();
                    } else {
                        self.popScope();
                    }
                    return true;
                }
                return false;
            },
            priority: 10
        });
    };

    /**
     * 全局 keydown 事件处理：按优先级分发给注册的处理器
     * @param {KeyboardEvent} event
     */
    TvFocusManager.prototype._handleKeyDown = function (event) {
        // 收集所有匹配的处理器
        var matchedHandlers = [];
        var keys = Object.keys(this._keyHandlers);
        for (var i = 0; i < keys.length; i++) {
            var entry = this._keyHandlers[keys[i]];
            if (entry.match(event)) {
                matchedHandlers.push(entry);
            }
        }

        // 按优先级从高到低排序
        matchedHandlers.sort(function (a, b) {
            return (b.priority || 0) - (a.priority || 0);
        });

        // 依次调用，直到某个处理器返回 true
        for (var j = 0; j < matchedHandlers.length; j++) {
            if (matchedHandlers[j].handler(event) === true) {
                return;
            }
        }
    };

    /**
     * 注册按键处理器
     * @param {string} id - 处理器唯一标识
     * @param {object} config - 配置
     * @param {Function} config.match - 判断事件是否匹配的函数
     * @param {Function} config.handler - 处理函数，返回 true 表示已处理
     * @param {number} [config.priority=0] - 优先级（越高越先执行）
     */
    TvFocusManager.prototype.registerKeyHandler = function (id, config) {
        this._keyHandlers[id] = {
            match: config.match,
            handler: config.handler,
            priority: config.priority || 0
        };
    };

    /**
     * 移除按键处理器
     * @param {string} id - 处理器标识
     */
    TvFocusManager.prototype.unregisterKeyHandler = function (id) {
        delete this._keyHandlers[id];
    };

    /**
     * 推入焦点范围（弹窗打开时调用）
     * @param {Element} element - 焦点容器元素
     * @param {object} [options] - 配置选项
     * @param {Element} [options.defaultElement] - 默认聚焦的元素
     * @param {Function} [options.onBack] - 按返回键时的回调（不提供则默认 popScope）
     */
    TvFocusManager.prototype.pushScope = function (element, options) {
        if (!element) return;

        var opts = options || {};
        var previousFocus = document.activeElement;

        this._scopeStack.push({
            element: element,
            previousFocus: previousFocus,
            options: opts
        });

        // 聚焦到 scope 内的默认元素
        var defaultTarget = opts.defaultElement || this.getDefaultTarget(element);
        if (defaultTarget) {
            this.focusElement(defaultTarget);
        }
    };

    /**
     * 弹出焦点范围（弹窗关闭时调用）
     * @returns {Element|null} 恢复焦点到的元素
     */
    TvFocusManager.prototype.popScope = function () {
        if (this._scopeStack.length === 0) return null;

        var scope = this._scopeStack.pop();
        var restoreTarget = scope.previousFocus;

        // 如果原焦点元素仍然在 DOM 中且可见，恢复焦点
        if (restoreTarget && document.contains(restoreTarget) && isNavigable(restoreTarget)) {
            this.focusElement(restoreTarget);
        }

        return restoreTarget;
    };

    /**
     * 获取当前最顶层的焦点范围
     * @returns {Element} 当前焦点容器（无 scope 时返回 document.body）
     */
    TvFocusManager.prototype.getCurrentScope = function () {
        if (this._scopeStack.length > 0) {
            return this._scopeStack[this._scopeStack.length - 1].element;
        }
        return document.body;
    };

    /**
     * 获取指定范围内的所有可导航元素
     * @param {Element} [scope] - 范围容器，默认当前 scope
     * @returns {Array<Element>}
     */
    TvFocusManager.prototype.getFocusable = function (scope) {
        var container = scope || this.getCurrentScope();
        return Array.from(container.querySelectorAll(NAV_SELECTOR)).filter(isNavigable);
    };

    /**
     * 获取范围内的默认焦点目标
     * 优先级：[data-tv-default] > .close-btn/.modal-close > 第一个可导航元素
     * @param {Element} [scope] - 范围容器
     * @returns {Element|null}
     */
    TvFocusManager.prototype.getDefaultTarget = function (scope) {
        var container = scope || this.getCurrentScope();

        // 优先查找标记了 data-tv-default 的元素
        var preferred = container.querySelector('[data-tv-default]');
        if (preferred && isNavigable(preferred)) return preferred;

        // 其次查找关闭按钮
        var closeBtn = container.querySelector('.close-btn, .modal-close, [data-tv-close]');
        if (closeBtn && isNavigable(closeBtn)) return closeBtn;

        // 最后使用第一个可导航元素
        var candidates = this.getFocusable(container);
        return candidates.length > 0 ? candidates[0] : null;
    };

    /**
     * 聚焦元素并滚动到可见区域
     * @param {Element} element - 目标元素
     */
    TvFocusManager.prototype.focusElement = function (element) {
        if (!element) return;

        try {
            element.focus({ preventScroll: true });
        } catch (e) {
            element.focus();
        }

        try {
            element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } catch (e) {
            element.scrollIntoView(false);
        }
    };

    /**
     * 在当前焦点范围内按方向导航
     * @param {string} direction - 'up'|'down'|'left'|'right'
     */
    TvFocusManager.prototype.navigate = function (direction) {
        var scope = this.getCurrentScope();
        var candidates = this.getFocusable(scope);
        if (candidates.length === 0) return;

        var active = document.activeElement;

        // 如果当前没有焦点或焦点不在当前 scope 内，聚焦到默认目标
        if (!active || !isNavigable(active) || !scope.contains(active)) {
            var defaultTarget = this.getDefaultTarget(scope);
            if (defaultTarget) this.focusElement(defaultTarget);
            return;
        }

        var origin = getCenter(active);
        var bestCandidate = null;
        var bestScore = Number.POSITIVE_INFINITY;

        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            if (candidate === active) continue;

            var score = getDirectionalScore(origin, candidate, direction);
            if (score < bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }

        if (bestCandidate) {
            this.focusElement(bestCandidate);
        }
    };

    // 创建单例并暴露到全局
    var instance = new TvFocusManager();
    window.tvFocusManager = instance;

})();
