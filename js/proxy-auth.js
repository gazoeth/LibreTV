/**
 * 代理请求鉴权模块（优化版）
 * 核心改进：
 * 1. 增加 getAuthPrefix() —— 返回已拼好的 "&auth=...&t=..." 后缀字符串，
 *    让调用方可以同步拼接 URL，彻底消除每次请求都要 await 的开销。
 * 2. 鉴权哈希一旦获取便永久缓存（内存 + localStorage），后续调用同步返回。
 * 3. 时间戳仍每次刷新（防重放），但哈希计算只做一次。
 */

let cachedPasswordHash = null;
let _hashInitPromise   = null; // 预热 Promise，防止并发重复触发

async function getPasswordHash() {
    if (cachedPasswordHash) return cachedPasswordHash;

    const storedHash = localStorage.getItem('proxyAuthHash');
    if (storedHash) { cachedPasswordHash = storedHash; return storedHash; }

    const passwordVerified   = localStorage.getItem('passwordVerified');
    const storedPasswordHash = localStorage.getItem('passwordHash');
    if (passwordVerified === 'true' && storedPasswordHash) {
        localStorage.setItem('proxyAuthHash', storedPasswordHash);
        cachedPasswordHash = storedPasswordHash;
        return storedPasswordHash;
    }

    const userPassword = localStorage.getItem('userPassword');
    if (userPassword) {
        try {
            const hash = await sha256(userPassword);
            localStorage.setItem('proxyAuthHash', hash);
            cachedPasswordHash = hash;
            return hash;
        } catch (e) { console.error('生成密码哈希失败:', e); }
    }

    if (window.__ENV__?.PASSWORD) {
        cachedPasswordHash = window.__ENV__.PASSWORD;
        return cachedPasswordHash;
    }
    return null;
}

/** 页面加载时立即预热，后续所有请求直接使用缓存 */
function warmupAuth() {
    if (_hashInitPromise) return _hashInitPromise;
    _hashInitPromise = getPasswordHash().catch(() => null);
    return _hashInitPromise;
}

/**
 * 【新增】同步返回鉴权后缀（需已预热）
 * 适合高频并发：直接字符串拼接，无需 await
 */
function getAuthSuffix() {
    if (!cachedPasswordHash) return '';
    // 代理 URL 是路径形式（/proxy/...），不含 ?，所以用 ? 而非 &
    return `?auth=${encodeURIComponent(cachedPasswordHash)}&t=${Date.now()}`;
}

/**
 * 【新增】异步返回鉴权后缀（兼容未预热场景）
 * 已缓存时同步解析，未缓存时等待一次异步获取
 */
async function getAuthPrefix() {
    if (!cachedPasswordHash) await warmupAuth();
    return getAuthSuffix();
}

/** 为 URL 添加鉴权参数（保持向后兼容） */
async function addAuthToProxyUrl(url) {
    try {
        const hash = await getPasswordHash();
        if (!hash) { console.warn('无法获取密码哈希，代理请求可能失败'); return url; }
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}auth=${encodeURIComponent(hash)}&t=${Date.now()}`;
    } catch (e) { console.error('添加代理鉴权失败:', e); return url; }
}

function validateProxyAuth(authHash, serverPasswordHash, timestamp) {
    if (!authHash || !serverPasswordHash || authHash !== serverPasswordHash) return false;
    if (timestamp && (Date.now() - parseInt(timestamp)) > 10 * 60 * 1000) {
        console.warn('代理请求时间戳过期'); return false;
    }
    return true;
}

function clearAuthCache() {
    cachedPasswordHash = null;
    _hashInitPromise   = null;
    localStorage.removeItem('proxyAuthHash');
}

window.addEventListener('storage', (e) => {
    if (e.key === 'userPassword' || (window.PASSWORD_CONFIG && e.key === window.PASSWORD_CONFIG.localStorageKey)) {
        clearAuthCache();
        warmupAuth();
    }
});

// 页面加载时立即预热
warmupAuth();

window.ProxyAuth = {
    addAuthToProxyUrl,
    validateProxyAuth,
    clearAuthCache,
    getPasswordHash,
    getAuthPrefix,  // 新增
    getAuthSuffix,  // 新增
};
