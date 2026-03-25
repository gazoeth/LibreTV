// 页面加载后处理声明弹窗和URL搜索参数
document.addEventListener('DOMContentLoaded', function() {

    // ── 声明弹窗：用 try/catch 保护 localStorage，首次访问显示但可关闭 ──
    var disclaimerModal = document.getElementById('disclaimerModal');
    var acceptBtn = document.getElementById('acceptDisclaimerBtn');

    if (disclaimerModal && acceptBtn) {
        var hasSeen = false;
        try { hasSeen = !!localStorage.getItem('hasSeenDisclaimer'); } catch(e) { hasSeen = false; }

        if (!hasSeen) {
            // 直接用 style 显示，避免依赖 Tailwind hidden/flex
            disclaimerModal.style.display = 'flex';
            disclaimerModal.style.alignItems = 'center';
            disclaimerModal.style.justifyContent = 'center';
        }

        acceptBtn.addEventListener('click', function() {
            try { localStorage.setItem('hasSeenDisclaimer', 'true'); } catch(e) {}
            disclaimerModal.style.display = 'none';
        });
    }

    // ── URL 搜索参数处理 ──
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
        } catch(e) {}
    }

    if (keyword) {
        var input = document.getElementById('searchInput');
        if (input) {
            input.value = keyword;
            if (typeof toggleClearButton === 'function') toggleClearButton();
        }
        setTimeout(function() {
            if (typeof search === 'function') search();
            try {
                window.history.replaceState(
                    { search: keyword },
                    'YiWuTV - ' + keyword,
                    window.location.href
                );
            } catch(e) {}
        }, 300);
    }
});
