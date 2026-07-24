(function () {
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
})();