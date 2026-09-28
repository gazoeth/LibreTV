(function () {
    // 兼容 globalThis
    if (typeof globalThis === 'undefined') {
        window.globalThis = window;
    }

    // 兼容 Promise.allSettled
    if (!Promise.allSettled) {
        Promise.allSettled = function (promises) {
            return Promise.all(Array.prototype.map.call(promises, function (promise) {
                return Promise.resolve(promise).then(function (value) {
                    return { status: 'fulfilled', value: value };
                }, function (reason) {
                    return { status: 'rejected', reason: reason };
                });
            }));
        };
    }

    // 兼容 Object.fromEntries
    if (!Object.fromEntries) {
        Object.fromEntries = function (entries) {
            if (!entries || !entries[Symbol.iterator]) {
                throw new TypeError('Object.fromEntries requires an iterable');
            }
            var obj = {};
            var iterator = entries[Symbol.iterator]();
            var next = iterator.next();
            while (!next.done) {
                var pair = next.value;
                if (Object(pair) !== pair) {
                    throw new TypeError('Iterator value ' + pair + ' is not an entry object');
                }
                obj[pair[0]] = pair[1];
                next = iterator.next();
            }
            return obj;
        };
    }

    // 兼容 String.prototype.replaceAll
    if (!String.prototype.replaceAll) {
        String.prototype.replaceAll = function (search, replacement) {
            if (search instanceof RegExp) {
                return this.replace(search, replacement);
            }
            return this.split(search).join(replacement);
        };
    }

    window.fetchWithLegacyTimeout = function (url, options, timeoutMs) {
        var requestOptions = options || {};
        var timeout = typeof timeoutMs === 'number' ? timeoutMs : 10000;

        if (typeof AbortController === 'undefined') {
            return Promise.race([
                fetch(url, requestOptions),
                new Promise(function (_, reject) {
                    setTimeout(function () {
                        reject(new Error('Request timeout'));
                    }, timeout);
                })
            ]);
        }

        var controller = new AbortController();
        var timeoutId = setTimeout(function () {
            controller.abort();
        }, timeout);
        var mergedOptions = {};

        Object.keys(requestOptions).forEach(function (key) {
            mergedOptions[key] = requestOptions[key];
        });
        mergedOptions.signal = controller.signal;

        return fetch(url, mergedOptions).then(function (response) {
            clearTimeout(timeoutId);
            return response;
        }, function (error) {
            clearTimeout(timeoutId);
            throw error;
        });
    };

    /**
     * 通用豆瓣/海报图片智能容灾加载器 (支持免VPN加速)
     * 多级降级策略：
     * 1. 优先使用 Weserv 高速公共CDN镜像 (直接在国内秒开，彻底解决防盗链与无VPN加载慢/403/418问题)
     * 2. 备用站点自带 /proxy/ 代理
     * 3. 兜底原始地址 (配合 referrerpolicy="no-referrer")
     * 4. 彻底失败展示质感文字占位海报
     */
    window.getDoubanImageUrl = function (originalUrl) {
        if (!originalUrl) return '';
        // 如果原本就是相对路径或 data: URI，直接返回
        if (originalUrl.indexOf('http') !== 0) return originalUrl;

        // 如果是豆瓣图片，默认采用国内最快且免VPN的公共CDN加速镜像 (去Referer并缓存)
        if (originalUrl.indexOf('doubanio.com') !== -1) {
            // 使用 wsrv.nl CDN 镜像加速
            var cleanUrl = originalUrl.replace(/^https?:\/\//i, '');
            return 'https://images.weserv.nl/?url=' + encodeURIComponent(cleanUrl) + '&w=360&output=webp&q=80';
        }

        return originalUrl;
    };

    /**
     * 图片加载失败时的多级重试处理器
     */
    window.handleImageFallback = function (imgEl, originalUrl) {
        if (!imgEl) return;
        var retryStep = parseInt(imgEl.getAttribute('data-retry-step') || '0', 10);
        var nextStep = retryStep + 1;
        imgEl.setAttribute('data-retry-step', nextStep.toString());

        if (nextStep === 1) {
            // 步骤1：尝试走站点的 /proxy/ 伪装代理
            var proxyBase = (typeof PROXY_URL !== 'undefined') ? PROXY_URL : '/proxy/';
            var authSuffix = (window.ProxyAuth && window.ProxyAuth.getAuthPrefixSync) ? window.ProxyAuth.getAuthPrefixSync() : '';
            imgEl.src = proxyBase + encodeURIComponent(originalUrl) + authSuffix;
        } else if (nextStep === 2) {
            // 步骤2：尝试直接原图 (加 no-referrer)
            imgEl.referrerPolicy = 'no-referrer';
            imgEl.src = originalUrl;
        } else {
            // 步骤3：全部失败，优雅隐藏图片并展示占位背景
            imgEl.onerror = null;
            imgEl.style.display = 'none';
            if (imgEl.nextElementSibling) {
                imgEl.nextElementSibling.style.display = 'flex';
            }
        }
    };
})();