/**
 * FreeDY 手机端触控手势管理器
 * 支持滑动切集、底部面板拖拽关闭等手势
 */
(function () {
    'use strict';

    // 手势配置常量
    var SWIPE_THRESHOLD = 50;        // 滑动触发阈值（像素）
    var SWIPE_VELOCITY = 0.3;        // 最小滑动速度（px/ms）
    var DRAG_DISMISS_RATIO = 0.3;    // 拖拽关闭阈值（面板高度比例）

    /**
     * 初始化所有手势
     */
    function init() {
        initPanelDragDismiss();
        initPlayerSwipe();
    }

    /**
     * 底部面板（历史/设置）拖拽关闭手势
     * 在面板 header 区域向下拖拽超过阈值时关闭面板
     */
    function initPanelDragDismiss() {
        var panels = ['historyPanel', 'settingsPanel'];

        panels.forEach(function (panelId) {
            var panel = document.getElementById(panelId);
            if (!panel) return;

            var header = panel.querySelector('.panel-header');
            if (!header) return;

            var startY = 0;
            var currentY = 0;
            var isDragging = false;
            var panelHeight = 0;

            header.addEventListener('touchstart', function (event) {
                if (!panel.classList.contains('show')) return;
                var touch = event.touches[0];
                startY = touch.clientY;
                currentY = startY;
                isDragging = true;
                panelHeight = panel.offsetHeight;
                panel.style.transition = 'none';
            }, { passive: true });

            header.addEventListener('touchmove', function (event) {
                if (!isDragging) return;
                var touch = event.touches[0];
                currentY = touch.clientY;
                var deltaY = currentY - startY;

                // 只允许向下拖拽
                if (deltaY > 0) {
                    panel.style.transform = 'translateY(' + deltaY + 'px)';
                    // 减少背景遮罩透明度
                    var backdrop = document.getElementById('panelBackdrop');
                    if (backdrop) {
                        var progress = Math.min(deltaY / panelHeight, 1);
                        backdrop.style.opacity = String(1 - progress * 0.6);
                    }
                }
            }, { passive: true });

            header.addEventListener('touchend', function () {
                if (!isDragging) return;
                isDragging = false;
                var deltaY = currentY - startY;
                var shouldDismiss = deltaY > panelHeight * DRAG_DISMISS_RATIO;

                // 恢复过渡动画
                panel.style.transition = '';
                var backdrop = document.getElementById('panelBackdrop');
                if (backdrop) backdrop.style.opacity = '';

                if (shouldDismiss) {
                    // 关闭面板
                    panel.style.transform = '';
                    if (typeof window.closeAllPanels === 'function') {
                        window.closeAllPanels();
                    } else {
                        panel.classList.remove('show');
                    }
                } else {
                    // 回弹
                    panel.style.transform = '';
                }
            });
        });
    }

    /**
     * 播放器页面左右滑动切集手势
     * 在非视频区域左右滑动触发上/下一集
     */
    function initPlayerSwipe() {
        // 判断是否在播放器页面
        var isPlayerPage = !!document.querySelector('.player-header-fixed');
        if (!isPlayerPage) return;

        var mainArea = document.querySelector('main');
        if (!mainArea) return;

        var startX = 0;
        var startY = 0;
        var startTime = 0;

        mainArea.addEventListener('touchstart', function (event) {
            // NOTE: 排除视频播放器区域的触摸（播放器有自己的手势处理）
            var playerContainer = document.getElementById('playerContainer');
            if (playerContainer && playerContainer.contains(event.target)) return;

            var touch = event.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startTime = Date.now();
        }, { passive: true });

        mainArea.addEventListener('touchend', function (event) {
            var playerContainer = document.getElementById('playerContainer');
            if (playerContainer && playerContainer.contains(event.target)) return;

            var touch = event.changedTouches[0];
            var deltaX = touch.clientX - startX;
            var deltaY = touch.clientY - startY;
            var elapsed = Date.now() - startTime;

            // 确保是水平滑动（水平距离 > 垂直距离的 1.5 倍）
            if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
            if (Math.abs(deltaY) > Math.abs(deltaX) * 0.7) return;

            // 检查速度
            var velocity = Math.abs(deltaX) / elapsed;
            if (velocity < SWIPE_VELOCITY) return;

            // 左滑 = 下一集，右滑 = 上一集
            if (deltaX < 0) {
                if (typeof window.playNextEpisode === 'function') {
                    window.playNextEpisode();
                    showSwipeHint('下一集 →');
                }
            } else {
                if (typeof window.playPreviousEpisode === 'function') {
                    window.playPreviousEpisode();
                    showSwipeHint('← 上一集');
                }
            }
        }, { passive: true });
    }

    /**
     * 显示滑动提示（复用现有的 shortcut hint 机制）
     * @param {string} text - 提示文字
     */
    function showSwipeHint(text) {
        if (typeof window.showShortcutHint === 'function') {
            var direction = text.indexOf('→') !== -1 ? 'right' : 'left';
            window.showShortcutHint(text.replace(/[←→]/g, '').trim(), direction);
        } else {
            // 降级方案：使用 toast
            if (typeof window.showToast === 'function') {
                window.showToast(text, 'info');
            }
        }
    }

    // 暴露到全局
    window.touchGestures = { init: init };

    // 页面加载后初始化（仅触摸设备）
    document.addEventListener('DOMContentLoaded', function () {
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            init();
        }
    });

})();
