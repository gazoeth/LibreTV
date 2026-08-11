/**
 * FreeDY TV 虚拟键盘
 * 为电视遥控器提供 QWERTY 布局的屏幕键盘
 * 通过 tvFocusManager 的焦点栈管理实现焦点陷阱
 */
(function () {
    'use strict';

    // QWERTY 键盘布局定义
    var KEYBOARD_ROWS = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
        ['LANG', 'SPACE', 'CLEAR', 'SEARCH']
    ];

    // 最近搜索历史最大保存数
    var MAX_HISTORY = 8;

    /**
     * TV 虚拟键盘组件
     */
    function TvKeyboard() {
        /** @type {HTMLElement|null} 遮罩层容器 */
        this.overlay = null;
        /** @type {HTMLInputElement|null} 关联的输入框 */
        this.targetInput = null;
        /** @type {string} 当前输入文本 */
        this.inputText = '';
        /** @type {boolean} 键盘是否打开 */
        this.isOpen = false;
        /** @type {Function|null} 搜索回调 */
        this.onSearch = null;
    }

    /**
     * 打开虚拟键盘
     * @param {HTMLInputElement} inputElement - 关联的输入框
     * @param {object} [options] - 配置选项
     * @param {Function} [options.onSearch] - 搜索回调函数
     */
    TvKeyboard.prototype.open = function (inputElement, options) {
        if (this.isOpen) return;

        var opts = options || {};
        this.targetInput = inputElement;
        this.inputText = inputElement ? inputElement.value : '';
        this.onSearch = opts.onSearch || null;
        this.isOpen = true;

        this._render();
        this._show();
    };

    /**
     * 关闭虚拟键盘
     */
    TvKeyboard.prototype.close = function () {
        if (!this.isOpen) return;
        this.isOpen = false;

        // 同步输入内容到目标输入框
        if (this.targetInput) {
            this.targetInput.value = this.inputText;
            // 触发 input 事件以更新 UI（如清空按钮显示）
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        this._hide();
    };

    /**
     * 渲染键盘 DOM
     */
    TvKeyboard.prototype._render = function () {
        var self = this;
        var overlay = document.getElementById('tvKeyboardOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'tvKeyboardOverlay';
            overlay.className = 'tv-keyboard-overlay';
            document.body.appendChild(overlay);
        }
        this.overlay = overlay;

        var html = '<div class="tv-keyboard-panel">';

        // 输入显示区
        html += '<div class="tv-keyboard-input-area">';
        html += '  <div class="tv-keyboard-input-display' + (this.inputText ? '' : ' empty') + '" id="tvKbDisplay">';
        html += this.inputText || '搜索电影、电视剧、动漫…';
        html += '<span class="tv-keyboard-cursor"></span>';
        html += '  </div>';
        html += '  <button type="button" class="tv-keyboard-action-btn" data-action="clear">清空</button>';
        html += '  <button type="button" class="tv-keyboard-action-btn primary" data-action="search">搜索</button>';
        html += '</div>';

        // 键盘行
        html += '<div class="tv-keyboard-rows">';
        for (var r = 0; r < KEYBOARD_ROWS.length; r++) {
            html += '<div class="tv-keyboard-row">';
            var row = KEYBOARD_ROWS[r];
            for (var k = 0; k < row.length; k++) {
                var key = row[k];
                var label = key;
                var extraClass = '';
                var dataKey = key;

                if (key === 'BACKSPACE') {
                    label = '← 退格';
                    extraClass = ' key-backspace';
                } else if (key === 'SPACE') {
                    label = '空格';
                    extraClass = ' key-space';
                } else if (key === 'LANG') {
                    label = '中/EN';
                    extraClass = ' key-wide';
                } else if (key === 'SEARCH') {
                    label = '搜索';
                    extraClass = ' key-search';
                } else if (key === 'CLEAR') {
                    label = '清空';
                    extraClass = ' key-wide';
                }

                html += '<button type="button" class="tv-keyboard-key' + extraClass + '" data-key="' + dataKey + '">' + label + '</button>';
            }
            html += '</div>';
        }
        html += '</div>';

        // 搜索历史区
        var history = this._getSearchHistory();
        if (history.length > 0) {
            html += '<div class="tv-keyboard-history">';
            html += '  <span class="tv-keyboard-history-label">最近搜索</span>';
            for (var h = 0; h < history.length; h++) {
                html += '<button type="button" class="tv-keyboard-history-tag" data-history="' +
                    this._escapeHtml(history[h]) + '">' + this._escapeHtml(history[h]) + '</button>';
            }
            html += '</div>';
        }

        html += '</div>';
        overlay.innerHTML = html;

        // 绑定事件
        overlay.addEventListener('click', function (event) {
            var target = event.target.closest('[data-key], [data-action], [data-history]');
            if (!target) return;

            if (target.dataset.key) {
                self._handleKey(target.dataset.key);
            } else if (target.dataset.action) {
                self._handleAction(target.dataset.action);
            } else if (target.dataset.history) {
                self.inputText = target.dataset.history;
                self._updateDisplay();
                self._doSearch();
            }
        });
    };

    /**
     * 显示键盘
     */
    TvKeyboard.prototype._show = function () {
        if (!this.overlay) return;
        this.overlay.style.display = 'flex';
        this.overlay.setAttribute('aria-hidden', 'false');

        // 使用焦点管理器推入 scope
        if (window.tvFocusManager) {
            window.tvFocusManager.pushScope(this.overlay, {
                onBack: this.close.bind(this)
            });
        }

        // 聚焦到第一个字母键
        var firstKey = this.overlay.querySelector('.tv-keyboard-key[data-key="Q"]');
        if (firstKey && window.tvFocusManager) {
            window.tvFocusManager.focusElement(firstKey);
        }
    };

    /**
     * 隐藏键盘
     */
    TvKeyboard.prototype._hide = function () {
        if (!this.overlay) return;
        this.overlay.style.display = 'none';
        this.overlay.setAttribute('aria-hidden', 'true');

        // 弹出焦点管理器 scope
        if (window.tvFocusManager) {
            window.tvFocusManager.popScope();
        }
    };

    /**
     * 处理按键输入
     * @param {string} key - 按键值
     */
    TvKeyboard.prototype._handleKey = function (key) {
        if (key === 'BACKSPACE') {
            this.inputText = this.inputText.slice(0, -1);
        } else if (key === 'SPACE') {
            this.inputText += ' ';
        } else if (key === 'CLEAR') {
            this.inputText = '';
        } else if (key === 'SEARCH') {
            this._doSearch();
            return;
        } else if (key === 'LANG') {
            // TODO: 中英切换暂不实现，后续迭代
            return;
        } else {
            this.inputText += key.toLowerCase();
        }

        this._updateDisplay();
    };

    /**
     * 处理操作按钮
     * @param {string} action - 'clear' | 'search'
     */
    TvKeyboard.prototype._handleAction = function (action) {
        if (action === 'clear') {
            this.inputText = '';
            this._updateDisplay();
        } else if (action === 'search') {
            this._doSearch();
        }
    };

    /**
     * 执行搜索
     */
    TvKeyboard.prototype._doSearch = function () {
        if (!this.inputText.trim()) return;

        // 同步到输入框
        if (this.targetInput) {
            this.targetInput.value = this.inputText;
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 保存搜索历史
        this._saveSearchHistory(this.inputText.trim());

        // 关闭键盘
        this.close();

        // 触发搜索
        if (this.onSearch) {
            this.onSearch(this.inputText.trim());
        } else if (typeof window.search === 'function') {
            window.search();
        }
    };

    /**
     * 更新输入显示区
     */
    TvKeyboard.prototype._updateDisplay = function () {
        var display = document.getElementById('tvKbDisplay');
        if (!display) return;

        if (this.inputText) {
            display.classList.remove('empty');
            display.innerHTML = this._escapeHtml(this.inputText) + '<span class="tv-keyboard-cursor"></span>';
        } else {
            display.classList.add('empty');
            display.innerHTML = '搜索电影、电视剧、动漫…<span class="tv-keyboard-cursor"></span>';
        }
    };

    /**
     * 获取搜索历史
     * @returns {Array<string>}
     */
    TvKeyboard.prototype._getSearchHistory = function () {
        try {
            return JSON.parse(localStorage.getItem('recentSearches') || '[]').slice(0, MAX_HISTORY);
        } catch (e) {
            return [];
        }
    };

    /**
     * 保存搜索历史
     * @param {string} keyword - 搜索关键词
     */
    TvKeyboard.prototype._saveSearchHistory = function (keyword) {
        try {
            var history = this._getSearchHistory();
            // 去重
            history = history.filter(function (item) { return item !== keyword; });
            history.unshift(keyword);
            if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
            localStorage.setItem('recentSearches', JSON.stringify(history));
        } catch (e) {
            // 存储不可用时忽略
        }
    };

    /**
     * HTML 转义
     * @param {string} str
     * @returns {string}
     */
    TvKeyboard.prototype._escapeHtml = function (str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    };

    // 创建单例并暴露
    var instance = new TvKeyboard();
    window.tvKeyboard = instance;

    // 监听搜索框的 tv-confirm 事件（由焦点管理器在确认键时触发）
    document.addEventListener('DOMContentLoaded', function () {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('tv-confirm', function (event) {
                // 仅 TV 模式下打开虚拟键盘
                if (window.tvFocusManager && window.tvFocusManager.isTvDevice) {
                    event.preventDefault();
                    instance.open(searchInput, {
                        onSearch: function () {
                            if (typeof window.search === 'function') window.search();
                        }
                    });
                }
            });
        }
    });

})();
