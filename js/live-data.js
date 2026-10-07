/**
 * FreeDY 直播数据层 — 纯函数，不依赖 DOM。
 *
 * 覆盖三件事：
 * 1. M3U / M3U8 订阅解析（兼容属性前置、属性后置与 #EXTGRP 三种写法）；
 * 2. 频道检索、可用性筛选与排序（与 Next 版 live-channel-filter 同一套判定口径）；
 * 3. XMLTV 节目单解析（含 gzip 之外的时区、跨窗口裁剪）。
 *
 * 约定：所有时间单位除特别标注外均为 epoch 毫秒。
 */
(function () {
    'use strict';

    /** 浏览器无法播放的协议直接丢弃，只保留 http(s) */
    function normalizeStreamUrl(raw, baseUrl) {
        if (!raw) return null;
        var value = String(raw).trim();
        if (!value) return null;
        try {
            var resolved = new URL(value, baseUrl || undefined);
            if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
            return resolved.href;
        } catch (error) {
            return null;
        }
    }

    /** 稳定的短 id（djb2 变体），用于无名频道与跨刷新保持一致 */
    function stableId(input) {
        var hash = 5381;
        var text = String(input);
        for (var i = 0; i < text.length; i++) {
            hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
        }
        return hash.toString(36);
    }

    /** URL 没有台名时的兜底名称：路径末段 → 主机名 */
    function nameFromUrl(url) {
        try {
            var parsed = new URL(url);
            var segments = parsed.pathname.split('/').filter(Boolean);
            var last = segments.length ? segments[segments.length - 1] : '';
            if (last) {
                var decoded = decodeURIComponent(last).replace(/\.(m3u8?|flv|ts|mp4)$/i, '');
                if (decoded) return decoded;
            }
            return parsed.hostname;
        } catch (error) {
            return '未命名频道';
        }
    }

    var ATTR_RE = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
    var ATTR_STRIP_RE = /[a-zA-Z0-9_-]+="[^"]*"/g;

    /**
     * 解析 M3U / M3U8 播放列表。
     * @param {string} content 订阅文本
     * @param {string} [baseUrl] 订阅自身地址，用于解析相对路径
     * @param {string} [sourceKey] 归属直播源，便于多源合并后回溯
     * @returns {Array} 频道数组
     */
    function parseM3u(content, baseUrl, sourceKey) {
        var channels = [];
        if (!content) return channels;

        var lines = String(content).split(/\r?\n/);
        var seen = Object.create(null);
        var ctx = null;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            var upper = line.toUpperCase();

            if (upper.indexOf('#EXTINF') === 0) {
                var attrs = {};
                ATTR_RE.lastIndex = 0;
                var match;
                while ((match = ATTR_RE.exec(line))) {
                    attrs[match[1].toLowerCase()] = match[2].trim();
                }
                // 去掉属性片段后，首个逗号之后即显示名
                var stripped = line.replace(ATTR_STRIP_RE, '').replace(/^#EXTINF\s*:\s*/i, '');
                var commaIndex = stripped.indexOf(',');
                var title = (commaIndex >= 0 ? stripped.slice(commaIndex + 1) : stripped)
                    .trim()
                    .replace(/^"+|"+$/g, '');
                ctx = { attrs: attrs, title: title, extGroup: '' };
                continue;
            }

            if (upper.indexOf('#EXTGRP:') === 0) {
                var group = line.slice('#EXTGRP:'.length).trim();
                if (ctx && group && !ctx.attrs['group-title']) ctx.extGroup = group;
                continue;
            }

            if (line.charAt(0) === '#') continue;

            var url = normalizeStreamUrl(line, baseUrl);
            var current = ctx;
            ctx = null;
            if (!url || seen[url]) continue;
            seen[url] = true;

            var channelAttrs = current ? current.attrs : {};
            var tvgId = channelAttrs['tvg-id'] || '';
            var logo = channelAttrs['tvg-logo'] ? normalizeStreamUrl(channelAttrs['tvg-logo'], baseUrl) : null;
            channels.push({
                id: tvgId || stableId(url),
                name: (current && current.title) || nameFromUrl(url),
                url: url,
                logo: logo,
                group: channelAttrs['group-title'] || (current ? current.extGroup : '') || '',
                tvgId: tvgId,
                rawName: channelAttrs['tvg-name'] || '',
                sourceKey: sourceKey || ''
            });
        }

        return channels;
    }

    /** 多源合并：按 url 去重，保留先出现的源（与源列表顺序一致） */
    function mergeChannels(sources) {
        var merged = [];
        var seen = Object.create(null);
        for (var i = 0; i < sources.length; i++) {
            var source = sources[i];
            var list = source.channels || [];
            for (var j = 0; j < list.length; j++) {
                var channel = list[j];
                if (seen[channel.url]) continue;
                seen[channel.url] = true;
                merged.push(channel);
            }
        }
        return merged;
    }

    /** 分组统计，按名称本地化排序；无名分组归入「其他」 */
    var UNGROUPED = '其他';

    function groupNames(channels) {
        var counts = Object.create(null);
        for (var i = 0; i < channels.length; i++) {
            var group = channels[i].group || UNGROUPED;
            counts[group] = (counts[group] || 0) + 1;
        }
        return Object.keys(counts)
            .map(function (name) { return { name: name, count: counts[name] }; })
            .sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
    }

    /* ── 检索 ─────────────────────────────────────────────────── */

    /** 台名的常见分隔符差异（CCTV-1 / cctv1 / CCTV_1）在搜索时忽略 */
    var SEPARATOR_RE = /[\s\-_./·|+()（）[\]【】]/g;

    function normalizeForSearch(input) {
        return String(input || '').toLowerCase().replace(SEPARATOR_RE, '');
    }

    function matchesKeyword(channel, normalizedKeyword) {
        if (!normalizedKeyword) return true;
        if (normalizeForSearch(channel.name).indexOf(normalizedKeyword) !== -1) return true;
        if (channel.tvgId && normalizeForSearch(channel.tvgId).indexOf(normalizedKeyword) !== -1) return true;
        if (channel.group && normalizeForSearch(channel.group).indexOf(normalizedKeyword) !== -1) return true;
        return false;
    }

    /* ── 可用性 ───────────────────────────────────────────────── */

    /** 分片可达但吞吐低于 1Mbps 的源基本必然卡顿，单独标为「限速」 */
    var SLOW_SOURCE_KBPS = 1000;

    function isSlowProbe(probe) {
        return Boolean(probe && probe.ok && probe.level === 'segment' && probe.kbps != null && probe.kbps < SLOW_SOURCE_KBPS);
    }

    /** 0 分片级达标 / 1 限速 / 2 弱验证 / 3 超时 / 4 失败 / 5 未测 */
    function probeRank(probe) {
        if (!probe) return 5;
        if (probe.ok) {
            if (probe.level !== 'segment') return 2;
            return isSlowProbe(probe) ? 1 : 0;
        }
        return probe.timedOut ? 3 : 4;
    }

    function matchesAlive(probe, mode) {
        if (mode === 'off') return true;
        if (!probe || !probe.ok) return false;
        if (mode === 'green') return probe.level === 'segment' && !isSlowProbe(probe);
        return true;
    }

    /** 排序：默认（源内原序）/ 名称 / 分组 / 可用性优先 / 最近观看 */
    function sortChannels(list, mode, ctx) {
        var out = list.slice();
        var options = ctx || {};
        if (mode === 'name') {
            out.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
        } else if (mode === 'group') {
            out.sort(function (a, b) {
                return (a.group || '').localeCompare(b.group || '', 'zh') || a.name.localeCompare(b.name, 'zh');
            });
        } else if (mode === 'probe') {
            var probeOf = options.probeOf || function () { return undefined; };
            out.sort(function (a, b) {
                var pa = probeOf(a.url);
                var pb = probeOf(b.url);
                var rank = probeRank(pa) - probeRank(pb);
                if (rank !== 0) return rank;
                if (pa && pb && pa.kbps != null && pb.kbps != null && pa.kbps !== pb.kbps) return pb.kbps - pa.kbps;
                var ma = pa && pa.ms != null ? pa.ms : Infinity;
                var mb = pb && pb.ms != null ? pb.ms : Infinity;
                return ma - mb;
            });
        } else if (mode === 'recent') {
            var order = options.recentOrder;
            if (order) {
                out.sort(function (a, b) {
                    var oa = order.has(a.url) ? order.get(a.url) : Infinity;
                    var ob = order.has(b.url) ? order.get(b.url) : Infinity;
                    return oa - ob;
                });
            }
        }
        return out;
    }

    /* ── XMLTV 节目单 ─────────────────────────────────────────── */

    var DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

    function decodeXmlText(value) {
        return String(value || '')
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    /** `YYYYMMDDHHmmss (±hhmm | Z)?` → epoch ms；无法解析返回 NaN */
    function parseXmltvTime(raw) {
        if (!raw) return NaN;
        var match = String(raw).trim().match(
            /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,3}))?(?:\s*([+-])(\d{2})(\d{2})|Z)?$/
        );
        if (!match) return NaN;
        var year = +match[1];
        var month = +match[2];
        var day = +match[3];
        var hour = +(match[4] || 0);
        var minute = +(match[5] || 0);
        var second = +(match[6] || 0);
        var fraction = match[7] ? +(match[7].padEnd(3, '0')) : 0;
        var utcMs = Date.UTC(year, month - 1, day, hour, minute, second, fraction);
        if (!match[8]) return utcMs; // 无时区按 UTC 处理
        var offsetMinutes = (+match[9]) * 60 + (+match[10]);
        var offsetMs = offsetMinutes * 60 * 1000 * (match[8] === '-' ? -1 : 1);
        return utcMs - offsetMs;
    }

    var PROGRAMME_RE = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
    var PROGRAMME_SELF_CLOSING_RE = /<programme\b([^>]*)\/>/gi;
    var TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
    var DESC_RE = /<desc[^>]*>([\s\S]*?)<\/desc>/i;
    var ATTR_RE_XML = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;

    function extractAttrs(attrText) {
        var attrs = {};
        ATTR_RE_XML.lastIndex = 0;
        var match;
        while ((match = ATTR_RE_XML.exec(attrText))) {
            attrs[match[1].toLowerCase()] = match[2];
        }
        return attrs;
    }

    /**
     * 解析 XMLTV 文本，只保留 [now, now + windowMs] 窗口内的节目。
     * 返回 { [channelId]: program[] }，每组按开播时间升序。
     */
    function parseXmltv(text, windowMs, now) {
        var result = {};
        if (!text) return result;
        var window = windowMs || DEFAULT_WINDOW_MS;
        var base = now || Date.now();
        var windowEnd = base + window;
        var entries = [];

        var match;
        PROGRAMME_RE.lastIndex = 0;
        while ((match = PROGRAMME_RE.exec(text))) {
            entries.push({ attrs: match[1], inner: match[2] });
        }
        PROGRAMME_SELF_CLOSING_RE.lastIndex = 0;
        while ((match = PROGRAMME_SELF_CLOSING_RE.exec(text))) {
            entries.push({ attrs: match[1], inner: '' });
        }

        for (var i = 0; i < entries.length; i++) {
            var attrs = extractAttrs(entries[i].attrs);
            var channelId = (attrs.channel || '').trim();
            if (!channelId) continue;
            var start = parseXmltvTime(attrs.start);
            var stop = parseXmltvTime(attrs.stop);
            if (!isFinite(start) || !isFinite(stop)) continue;
            if (stop <= base || start >= windowEnd) continue;

            var titleMatch = entries[i].inner.match(TITLE_RE);
            var title = titleMatch ? decodeXmlText(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';
            if (!title) continue;

            var descMatch = entries[i].inner.match(DESC_RE);
            var program = { channelId: channelId, start: start, stop: stop, title: title };
            if (descMatch) program.desc = decodeXmlText(descMatch[1]).replace(/\s+/g, ' ').trim();

            if (!result[channelId]) result[channelId] = [];
            result[channelId].push(program);
        }

        Object.keys(result).forEach(function (key) {
            result[key].sort(function (a, b) { return a.start - b.start; });
        });
        return result;
    }

    /** 当前与下一档节目（同一时刻有重叠时取最后一个命中者） */
    function currentAndNext(programs, at) {
        var now = at || Date.now();
        var current = null;
        var next = null;
        if (!programs || !programs.length) return { current: null, next: null };
        for (var i = 0; i < programs.length; i++) {
            var program = programs[i];
            if (program.start <= now && program.stop > now) {
                current = program;
                continue;
            }
            if (program.start > now) {
                next = program;
                break;
            }
        }
        return { current: current, next: next };
    }

    /* ── 展示格式化 ───────────────────────────────────────────── */

    function pad2(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function formatClock(ms) {
        var date = new Date(ms);
        return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    }

    function formatProgress(program, at) {
        if (!program) return 0;
        var now = at || Date.now();
        var total = program.stop - program.start;
        if (total <= 0) return 0;
        var ratio = (now - program.start) / total;
        if (ratio < 0) return 0;
        if (ratio > 1) return 1;
        return ratio;
    }

    /** 距下一档节目还有多久：<1 分钟显示「即将」，否则显示 n 分钟后 */
    function formatCountdown(program, at) {
        if (!program) return '';
        var now = at || Date.now();
        var remain = Math.max(0, program.start - now);
        var minutes = Math.round(remain / 60000);
        if (minutes <= 0) return '即将开始';
        if (minutes < 60) return minutes + ' 分钟后';
        return Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分后';
    }

    window.LiveData = {
        parseM3u: parseM3u,
        mergeChannels: mergeChannels,
        groupNames: groupNames,
        normalizeStreamUrl: normalizeStreamUrl,
        normalizeForSearch: normalizeForSearch,
        matchesKeyword: matchesKeyword,
        matchesAlive: matchesAlive,
        probeRank: probeRank,
        isSlowProbe: isSlowProbe,
        sortChannels: sortChannels,
        parseXmltv: parseXmltv,
        parseXmltvTime: parseXmltvTime,
        currentAndNext: currentAndNext,
        formatClock: formatClock,
        formatProgress: formatProgress,
        formatCountdown: formatCountdown,
        stableId: stableId,
        UNGROUPED: UNGROUPED
    };
})();
