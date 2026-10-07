/**
 * FreeDY 直播源注册表 —— 存储、增删改、订阅导入导出与偏好设置。
 *
 * 存储分层（与站点既有 localStorage 命名保持一致）：
 *   liveSources       用户可见的直播源列表（含首次播种的推荐源）
 *   liveSourcesSeeded 播种标记，避免用户删掉推荐源后被重新种回
 *   liveRecent        最近播放的频道地址（换台「最近」排序用）
 *   livePrefs         排序方式、可用性筛选、是否经代理拉流等偏好
 */
(function () {
    var SOURCES_KEY = 'liveSources';
    var SEEDED_KEY = 'liveSourcesSeeded';
    var RECENT_KEY = 'liveRecent';
    var PREFS_KEY = 'livePrefs';
    var MAX_RECENT = 24;

    /**
     * 推荐直播源：全部来自公开社区维护的 iptv-org 频道清单（M3U）。
     * 首次访问时播种，可随时停用或删除；站点不内置任何私有源。
     */
    var PRESET_SOURCES = [
        { key: 'preset_cn', name: 'iptv-org · 中国大陆', url: 'https://iptv-org.github.io/iptv/countries/cn.m3u', group: '推荐' },
        { key: 'preset_zho', name: 'iptv-org · 中文频道', url: 'https://iptv-org.github.io/iptv/languages/zho.m3u', group: '推荐' },
        { key: 'preset_hk', name: 'iptv-org · 中国香港', url: 'https://iptv-org.github.io/iptv/countries/hk.m3u', group: '推荐' }
    ];

    var DEFAULT_PREFS = {
        sortMode: 'default',
        aliveFilter: 'off',
        viaProxy: true,
        viewMode: 'list'
    };

    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            var parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn('[FreeDY 直播] 写入本地存储失败：', e && e.message);
            return false;
        }
    }

    /** 由任意字符串生成稳定短 id（djb2 变体，与站点其他模块同风格） */
    function stableId(input) {
        var h = 5381;
        for (var i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }

    function normalizeUrl(url) {
        return String(url == null ? '' : url).trim().replace(/\/+$/, '');
    }

    function isHttpUrl(url) {
        return /^https?:\/\//i.test(normalizeUrl(url));
    }

    /** 服务器通过 DEFAULT_LIVE_SOURCES 预置的源（格式与 Next 版一致） */
    function envSources() {
        var raw = window.__ENV__ && window.__ENV__.LIVE_SOURCES;
        if (!raw) return [];
        var parsed = raw;
        if (typeof raw === 'string') {
            try {
                parsed = JSON.parse(raw);
            } catch (e) {
                console.warn('[FreeDY 直播] DEFAULT_LIVE_SOURCES 解析失败，已忽略');
                return [];
            }
        }
        if (!Array.isArray(parsed)) return [];
        var out = [];
        parsed.forEach(function (item, index) {
            if (!item || typeof item !== 'object') return;
            var name = String(item.name || '').trim();
            var url = normalizeUrl(item.url);
            if (!name || !isHttpUrl(url)) return;
            out.push({
                key: 'env_' + index,
                name: name,
                url: url,
                epg: isHttpUrl(item.epg) ? normalizeUrl(item.epg) : '',
                group: '预置',
                builtin: true,
                enabled: true,
                envKey: 'env_' + index
            });
        });
        return out;
    }

    function normalizeSource(raw, fallbackKeyPrefix, index) {
        if (!raw || typeof raw !== 'object') return null;
        var url = normalizeUrl(raw.url);
        if (!isHttpUrl(url)) return null;
        var name = String(raw.name || '').trim() || url;
        return {
            key: String(raw.key || (fallbackKeyPrefix + stableId(name + url + index))),
            name: name,
            url: url,
            epg: isHttpUrl(raw.epg) ? normalizeUrl(raw.epg) : '',
            group: String(raw.group || ''),
            builtin: Boolean(raw.builtin) || String(raw.key || '').indexOf('preset_') === 0,
            enabled: raw.enabled !== false,
            envKey: String(raw.envKey || '')
        };
    }

    function list() {
        var stored = readJSON(SOURCES_KEY, null);
        if (!Array.isArray(stored)) return [];
        var out = [];
        stored.forEach(function (item, index) {
            var normalized = normalizeSource(item, 'src_', index);
            if (normalized) out.push(normalized);
        });
        return out;
    }

    function save(items) {
        return writeJSON(SOURCES_KEY, items);
    }

    /** 把预置源合并进列表：按地址去重，不改动用户已有的同名条目 */
    function mergePresets(items) {
        var seen = {};
        items.forEach(function (item) { seen[item.url] = true; });

        var next = items.slice();
        PRESET_SOURCES.forEach(function (preset) {
            if (seen[preset.url]) return;
            var entry = normalizeSource(preset, 'preset_', next.length);
            if (!entry) return;
            entry.builtin = true;
            entry.enabled = true;
            next.push(entry);
            seen[preset.url] = true;
        });

        envSources().forEach(function (envSource) {
            if (seen[envSource.url]) return;
            next.push(envSource);
            seen[envSource.url] = true;
        });

        return next;
    }

    /**
     * 首次访问播种推荐源；用户清空过列表后不再自动种回。
     * 服务器存在 DEFAULT_LIVE_SOURCES 时始终补齐（部署者意图优先）。
     */
    function ensureSeeded() {
        var items = list();
        var seeded = localStorage.getItem(SEEDED_KEY) === '1';
        var hasEnv = envSources().length > 0;

        if (!seeded) {
            items = mergePresets(items);
            localStorage.setItem(SEEDED_KEY, '1');
            save(items);
            return items;
        }
        if (hasEnv) {
            var before = items.length;
            items = mergePresets(items);
            if (items.length !== before) save(items);
        }
        return items;
    }
    function find(items, key) {
        for (var i = 0; i < items.length; i++) {
            if (items[i].key === key) return i;
        }
        return -1;
    }

    /**
     * 新增自定义直播源。地址重复时返回已有条目，避免同一订阅出现两次。
     */
    function add(input) {
        var candidate = normalizeSource(input || {}, 'src_', Date.now());
        if (!candidate) return { ok: false, reason: 'invalid-url' };

        var items = list();
        for (var i = 0; i < items.length; i++) {
            if (items[i].url === candidate.url) {
                return { ok: true, source: items[i], duplicate: true };
            }
        }
        candidate.builtin = false;
        candidate.enabled = true;
        items.push(candidate);
        save(items);
        return { ok: true, source: candidate, duplicate: false };
    }

    function update(key, patch) {
        var items = list();
        var index = find(items, key);
        if (index < 0) return { ok: false, reason: 'missing' };

        var current = items[index];
        var next = {
            key: current.key,
            name: patch && patch.name != null ? String(patch.name).trim() || current.name : current.name,
            url: patch && patch.url != null ? normalizeUrl(patch.url) : current.url,
            epg: patch && patch.epg != null ? normalizeUrl(patch.epg) : current.epg,
            group: patch && patch.group != null ? String(patch.group) : current.group,
            builtin: current.builtin,
            enabled: patch && patch.enabled != null ? Boolean(patch.enabled) : current.enabled,
            envKey: current.envKey
        };
        if (!isHttpUrl(next.url)) return { ok: false, reason: 'invalid-url' };
        if (!isHttpUrl(next.epg)) next.epg = '';

        items[index] = next;
        save(items);
        return { ok: true, source: next };
    }

    function remove(key) {
        var items = list();
        var index = find(items, key);
        if (index < 0) return { ok: false, reason: 'missing' };
        var removed = items.splice(index, 1)[0];
        save(items);
        return { ok: true, source: removed };
    }

    /** 调整顺序：direction 为 -1 上移、1 下移 */
    function move(key, direction) {
        var items = list();
        var index = find(items, key);
        if (index < 0) return { ok: false, reason: 'missing' };
        var target = index + (direction < 0 ? -1 : 1);
        if (target < 0 || target >= items.length) return { ok: false, reason: 'edge' };
        var tmp = items[index];
        items[index] = items[target];
        items[target] = tmp;
        save(items);
        return { ok: true };
    }

    function enabled() {
        return list().filter(function (item) { return item.enabled; });
    }

    function clearAll() {
        save([]);
        localStorage.setItem(SEEDED_KEY, '1');
    }

    function resetToPresets() {
        save(mergePresets([]));
        localStorage.setItem(SEEDED_KEY, '1');
        return list();
    }

    /* ── 最近播放 ───────────────────────────────────────────── */

    function recent() {
        var stored = readJSON(RECENT_KEY, []);
        if (!Array.isArray(stored)) return [];
        return stored.filter(function (item) { return typeof item === 'string'; }).slice(0, MAX_RECENT);
    }

    function pushRecent(url) {
        if (!url) return recent();
        var next = recent().filter(function (item) { return item !== url; });
        next.unshift(url);
        var trimmed = next.slice(0, MAX_RECENT);
        writeJSON(RECENT_KEY, trimmed);
        return trimmed;
    }

    function recentOrderMap() {
        var map = new Map();
        recent().forEach(function (url, index) { map.set(url, index); });
        return map;
    }

    /* ── 偏好 ───────────────────────────────────────────────── */

    function prefs() {
        var stored = readJSON(PREFS_KEY, {});
        var merged = {};
        Object.keys(DEFAULT_PREFS).forEach(function (key) {
            merged[key] = Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : DEFAULT_PREFS[key];
        });
        return merged;
    }

    function setPrefs(patch) {
        var next = prefs();
        Object.keys(patch || {}).forEach(function (key) { next[key] = patch[key]; });
        writeJSON(PREFS_KEY, next);
        return next;
    }

    /* ── 配置导入导出 ───────────────────────────────────────── */

    function exportPayload() {
        var items = list();
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            sources: items.map(function (item) {
                return { name: item.name, url: item.url, epg: item.epg || '', enabled: item.enabled !== false };
            })
        };
    }

    /** 兼容多种第三方订阅写法：数组 / {sources:[]} / {list:[]} / {lives:[]} */
    function importPayload(payload) {
        var candidates = null;
        if (Array.isArray(payload)) candidates = payload;
        else if (payload && typeof payload === 'object') {
            ['sources', 'list', 'lives', 'livesources', 'data'].some(function (field) {
                if (Array.isArray(payload[field])) { candidates = payload[field]; return true; }
                return false;
            });
        }
        if (!candidates) return { ok: false, reason: 'shape', added: 0 };

        var items = list();
        var known = {};
        items.forEach(function (item) { known[item.url] = true; });

        var added = 0;
        candidates.forEach(function (raw, index) {
            var entry = normalizeSource(raw, 'src_', index + items.length);
            if (!entry || known[entry.url]) return;
            entry.builtin = false;
            items.push(entry);
            known[entry.url] = true;
            added += 1;
        });

        if (added) save(items);
        return { ok: true, added: added, total: items.length };
    }

    window.LiveSources = {
        PRESETS: PRESET_SOURCES,
        list: list,
        enabled: enabled,
        add: add,
        update: update,
        remove: remove,
        move: move,
        find: function (key) {
            var items = list();
            var index = find(items, key);
            return index < 0 ? null : items[index];
        },
        ensureSeeded: ensureSeeded,
        clearAll: clearAll,
        resetToPresets: resetToPresets,
        recent: recent,
        pushRecent: pushRecent,
        recentOrderMap: recentOrderMap,
        prefs: prefs,
        setPrefs: setPrefs,
        exportPayload: exportPayload,
        importPayload: importPayload,
        isHttpUrl: isHttpUrl,
        stableId: stableId
    };
})();
