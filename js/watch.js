// watch.js：极速重定向优化
window.onload = function() {
    const currentParams = new URLSearchParams(window.location.search);
    const playerUrlObj = new URL("player.html", window.location.origin);
    
    // 界面反馈
    const statusElement = document.getElementById('redirect-status');
    if (statusElement) statusElement.textContent = "正在进入播放器...";
    
    currentParams.forEach((value, key) => {
        playerUrlObj.searchParams.set(key, value);
    });
    
    const referrer = document.referrer;
    const backUrl = currentParams.get('back');
    let returnUrl = backUrl ? decodeURIComponent(backUrl) : (referrer || '/');
    
    playerUrlObj.searchParams.set('returnUrl', encodeURIComponent(returnUrl));
    localStorage.setItem('lastPageUrl', returnUrl);
    
    if (returnUrl.includes('/s=') || returnUrl.includes('?s=')) {
        localStorage.setItem('cameFromSearch', 'true');
        localStorage.setItem('searchPageUrl', returnUrl);
    }
    
    const finalPlayerUrl = playerUrlObj.toString();
    const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
    if (metaRefresh) metaRefresh.content = `0; url=${finalPlayerUrl}`;

    // 优化：从 2800ms 缩短至 300ms
    setTimeout(() => {
        window.location.replace(finalPlayerUrl);
    }, 300);
};
