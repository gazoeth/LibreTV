/**
 * FreeDY 直播页控制器 —— 把 live.html 的 DOM 接到三个纯模块上。
 *
 * 职责边界（本文件只做「状态 → DOM」与「用户意图 → 模块调用」）：
 *   LiveData    解析、检索、排序、EPG 计算
 *   LiveSources 源列表、最近播放、偏好持久化
 *   LivePlayer  HLS / Artplayer、代理改写、频道测活
 *
 * 单一状态源是下面的 state；所有渲染都由 render* 从 state 推导，
 * 不在事件处理器里零散改 DOM，保证换台、筛选、测速三者不会互相打架。
 */
(function () {
    'use strict';

    var RENDER_BATCH = 80;          // 列表首屏与增量追加条数
    var PROBE_LIMIT = 400;          // 单次测速上限：整张万级清单一次打满会拖垮电视盒
    var PROBE_CONCURRENCY = 5;
    var PLAYLIST_TIMEOUT_MS = 15000;
    var EPG_TIMEOUT_MS = 30000;
    var EPG_TICK_MS = 30000;
    var EPG_TTL_MS = 2 * 60 * 60 * 1000;
    var EPG_WINDOW_MS = 12 * 60 * 60 * 1000;

    var SORT_OPTIONS = [
        { value: 'default', label: '默认' },
        { value: 'probe', label: '可用性' },
        { value: 'name', label: '名称' },
        { value: 'group', label: '分组' },
        { value: 'recent', label: '最近观看' }
    ];

    var FILTER_OPTIONS = [
        { value: 'off', label: '全部' },
        { value: 'all', label: '仅可用' },
        { value: 'green', label: '流畅优先' }
    ];

    /** 探测等级 → 列表徽标文案与配色档位 */
    var BADGE = {
        fast: { label: '流畅', tone: 'ok' },
        slow: { label: '限速', tone: 'slow' },
        weak: { label: '弱验证', tone: 'weak' },
        bad: { label: '不可用', tone: 'bad' },
        unknown: { label: '未测', tone: 'unknown' }
    };

    var state = {
        channels: [],
        groups: [],
        activeGroup: '',
        keyword: '',
        sortMode: 'default',
        aliveFilter: 'off',
        view: [],
        rendered: 0,
        current: null,
        failedSources: 0,
        sourceTotal: 0,
        editingKey: '',
        epgUrl: '',
        epgPrograms: [],
        loading: true,
        probing: false
    };

    var el = {};
    var epgCache = {};
    var epgTimer = null;
    var probeCacheRef = {};
    var lastChannel = null;

    /* ── 基础工具 ───────────────────────────────────────────── */

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toast(message, tone) {
        if (!el.toast) return;
        el.toast.textContent = message;
        el.toast.setAttribute('data-tone', tone || 'info');
        el.toast.hidden = false;
        el.toast.classList.add('is-visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function () {
            el.toast.classList.remove('is-visible');
            setTimeout(function () { el.toast.hidden = true; }, 240);
        }, 2600);
    }

    /** 台名首字兜底：无台标时用文字占位，避免列表出现一排破图 */
    function initialOf(channel) {
        var text = String(channel.name || '').trim();
        if (!text) return '·';
        var ascii = text.match(/[A-Za-z0-9]/);
        return (ascii ? ascii[0] : text.charAt(0)).toUpperCase();
    }

    /* ── 网络 ───────────────────────────────────────────────── */

    /**
     * 经站点代理拉取文本。订阅清单与节目单都在第三方域上，
     * 直连必然撞 CORS，统一走 LivePlayer 的代理改写（含鉴权后缀）。
     */
    function fetchText(url, timeoutMs) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs);
        var target = window.LivePlayer ? window.LivePlayer.toProxyUrl(url) : url;
        return fetch(target, { signal: controller ? controller.signal : undefined, credentials: 'omit' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.arrayBuffer();
            })
            .then(function (buffer) {
                clearTimeout(timer);
                return buffer;
            }, function (error) {
                clearTimeout(timer);
                throw error;
            });
    }

    /**
     * XMLTV 订阅普遍以 .gz 分发，fetch 不会为这种「文件级 gzip」解压，
     * 因此按 1f 8b 魔数判断后交给 DecompressionStream 还原。
     */
    function decodeMaybeGzip(buffer) {
        var bytes = new Uint8Array(buffer);
        var gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
        if (!gzipped || typeof DecompressionStream === 'undefined') {
            return Promise.resolve(new TextDecoder('utf-8').decode(bytes));
        }
        var stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).arrayBuffer().then(function (plain) {
            return new TextDecoder('utf-8').decode(plain);
        });
    }

    function fetchTextDecoded(url, timeoutMs) {
        return fetchText(url, timeoutMs).then(decodeMaybeGzip);
    }

    function fetchPlaylist(source) {
        return fetchTextDecoded(source.url, PLAYLIST_TIMEOUT_MS).then(function (text) {
            return window.LiveData.parseM3u(text, source.url, source.key);
        });
    }

    /* ── 播放区状态 ─────────────────────────────────────────── */

    function setStatus(tone, text) {
        if (!el.status) return;
        el.status.setAttribute('data-state', tone);
        el.statusText.textContent = text;
    }

    function setOverlay(tone, message, hint, actionLabel) {
        if (!el.stageOverlay) return;
        el.stageOverlay.setAttribute('data-state', tone);
        if (message != null) el.stageMessage.textContent = message;
        if (hint != null) el.stageHint.textContent = hint;
        if (actionLabel) {
            el.stageAction.textContent = actionLabel;
            el.stageAction.hidden = false;
        } else {
            el.stageAction.hidden = true;
        }
    }

    function renderQuality(stats) {
        if (!el.quality) return;
        var bitrate = stats && stats.bitrate ? (stats.bitrate / 1000000) : 0;
        var height = stats && stats.height ? stats.height : 0;
        if (!height && !bitrate) {
            el.quality.hidden = true;
            el.quality.textContent = '';
            return;
        }
        var parts = [];
        if (height) parts.push(height >= 2000 ? '4K' : height + 'P');
        if (bitrate) parts.push(bitrate.toFixed(1) + ' Mbps');
        el.quality.textContent = parts.join(' · ');
        el.quality.hidden = false;
    }

    function handleStatus(phase, payload) {
        if (phase === 'loading') {
            setStatus('loading', '连接中');
            setOverlay('loading', '正在连接频道…', '首次连接需要与上游握手，请稍候', '');
        } else if (phase === 'reloading') {
            setStatus('loading', '重连中');
            setOverlay('loading', '正在重建播放会话…', '', '');
        } else if (phase === 'ready') {
            setStatus('loading', '缓冲中');
            setOverlay('loading', '正在缓冲…', '', '');
        } else if (phase === 'stalled') {
            setStatus('loading', '缓冲中');
            setOverlay('loading', '网络波动，正在自动恢复…', '', '');
        } else if (phase === 'playing') {
            setStatus('live', '直播中');
            setOverlay('playing', '', '', '');
            renderQuality(payload);
        } else if (phase === 'paused') {
            setStatus('paused', '已暂停');
        } else if (phase === 'level') {
            renderQuality(payload);
        } else if (phase === 'error') {
            setStatus('error', '播放失败');
            setOverlay(
                'error',
                '无法播放该频道',
                payload && payload.code === 'no-hls'
                    ? '当前浏览器缺少 HLS 支持，请升级浏览器后重试'
                    : '源站可能已下线或限制了本地区访问，换一个频道或稍后再试',
                '重新加载'
            );
        }
    }

    /* ── 列表渲染 ───────────────────────────────────────────── */

    function badgeFor(channel) {
        var probe = window.LivePlayer.cachedProbe(channel.url);
        if (!probe) return BADGE.unknown;
        if (!probe.ok) return BADGE.bad;
        if (probe.level !== 'segment') return BADGE.weak;
        return window.LiveData.isSlowProbe(probe) ? BADGE.slow : BADGE.fast;
    }

    function channelNode(channel, index) {
        var badge = badgeFor(channel);
        var node = document.createElement('button');
        node.type = 'button';
        node.className = 'live-item';
        node.setAttribute('role', 'option');
        node.setAttribute('aria-selected', 'false');
        node.setAttribute('data-url', channel.url);
        node.setAttribute('data-index', String(index));
        node.setAttribute('aria-label', channel.name + (channel.group ? '，' + channel.group : ''));

        var logo = channel.logo
            ? '<img src="' + escapeHtml(channel.logo) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
            : '<span class="live-item-initial">' + escapeHtml(initialOf(channel)) + '</span>';

        node.innerHTML =
            '<span class="live-item-logo" aria-hidden="true">' + logo + '</span>' +
            '<span class="live-item-body">' +
            '<span class="live-item-name">' + escapeHtml(channel.name) + '</span>' +
            '<span class="live-item-sub">' + escapeHtml(channel.group || window.LiveData.UNGROUPED) +
            (channel.tvgId ? ' · ' + escapeHtml(channel.tvgId) : '') + '</span>' +
            '</span>' +
            '<span class="live-item-badge" data-tone="' + badge.tone + '">' + badge.label + '</span>';

        var img = node.querySelector('img');
        if (img) {
            img.addEventListener('error', function () {
                img.parentNode.innerHTML = '<span class="live-item-initial">' + escapeHtml(initialOf(channel)) + '</span>';
            }, { once: true });
        }

        node.addEventListener('click', function () { selectChannel(channel, index); });
        node.addEventListener('focus', function () { maybeExtend(index); });
        return node;
    }

    function currentUrl() {
        return state.current ? state.current.url : '';
    }

    function markSelection() {
        var url = currentUrl();
        var nodes = el.list.querySelectorAll('.live-item');
        for (var i = 0; i < nodes.length; i++) {
            var selected = nodes[i].getAttribute('data-url') === url;
            nodes[i].setAttribute('aria-selected', selected ? 'true' : 'false');
            nodes[i].classList.toggle('is-active', selected);
        }
    }

    function renderList() {
        if (!el.list) return;
        var total = state.view.length;
        state.rendered = 0;
        el.list.innerHTML = '';

        if (!total) {
            el.listEmpty.hidden = false;
            el.listEmpty.textContent = state.keyword || state.activeGroup
                ? '没有匹配的频道，试试放宽筛选条件'
                : '暂无频道，请在「直播源」中添加订阅地址';
            if (el.listCount) el.listCount.textContent = '0 个频道';
            if (el.listSummary) el.listSummary.textContent = '没有可显示的频道';
            return;
        }

        el.listEmpty.hidden = true;
        appendBatch();
        markSelection();

        if (el.listSummary) {
            el.listSummary.textContent = '共 ' + total + ' 个频道，当前第 1 个';
        }
        updateListCount();
    }

    function appendBatch() {
        var end = Math.min(state.rendered + RENDER_BATCH, state.view.length);
        if (end <= state.rendered) return;
        var fragment = document.createDocumentFragment();
        for (var i = state.rendered; i < end; i++) {
            fragment.appendChild(channelNode(state.view[i], i));
        }
        el.list.appendChild(fragment);
        state.rendered = end;
    }

    /** 焦点走到已渲染尾部时续铺，保证遥控器方向键不会「撞墙」 */
    function maybeExtend(index) {
        if (index >= state.rendered - 4) appendBatch();
    }

    function updateListCount() {
        if (!el.listCount) return;
        var shown = Math.min(state.rendered, state.view.length);
        el.listCount.textContent = shown < state.view.length
            ? '显示 ' + shown + ' / ' + state.view.length + ' 个频道'
            : state.view.length + ' 个频道';
    }

    /* ── 筛选与排序 ─────────────────────────────────────────── */

    function applyFilters() {
        var keyword = window.LiveData.normalizeForSearch(state.keyword);
        var list = state.channels.filter(function (channel) {
            if (state.activeGroup && (channel.group || window.LiveData.UNGROUPED) !== state.activeGroup) return false;
            if (!window.LiveData.matchesKeyword(channel, keyword)) return false;
            if (state.aliveFilter !== 'off' && !window.LiveData.matchesAlive(window.LivePlayer.cachedProbe(channel.url), state.aliveFilter)) {
                return false;
            }
            return true;
        });

        state.view = window.LiveData.sortChannels(list, state.sortMode, {
            probeOf: function (url) { return window.LivePlayer.cachedProbe(url); },
            recentOrder: window.LiveSources.recentOrderMap()
        });

        renderList();
    }

    function renderChips() {
        if (!el.groupChips) return;
        var all = state.channels.length;
        var html = '<button type="button" class="live-chip" role="tab" data-group="" aria-selected="' +
            (state.activeGroup ? 'false' : 'true') + '">全部<span class="live-chip-count">' + all + '</span></button>';

        state.groups.forEach(function (group) {
            var selected = state.activeGroup === group.name;
            html += '<button type="button" class="live-chip" role="tab" data-group="' + escapeHtml(group.name) +
                '" aria-selected="' + (selected ? 'true' : 'false') + '">' + escapeHtml(group.name) +
                '<span class="live-chip-count">' + group.count + '</span></button>';
        });

        el.groupChips.innerHTML = html;
    }

    function renderMenus() {
        var sortLabel = SORT_OPTIONS.filter(function (item) { return item.value === state.sortMode; })[0];
        var filterLabel = FILTER_OPTIONS.filter(function (item) { return item.value === state.aliveFilter; })[0];
        if (el.sortValue) el.sortValue.textContent = sortLabel ? sortLabel.label : '默认';
        if (el.filterValue) el.filterValue.textContent = filterLabel ? filterLabel.label : '全部';

        if (el.sortMenu) {
            el.sortMenu.innerHTML = SORT_OPTIONS.map(function (item) {
                return '<button type="button" class="live-menu-item" role="menuitemradio" data-sort="' + item.value +
                    '" aria-checked="' + (item.value === state.sortMode) + '">' + item.label + '</button>';
            }).join('');
        }
        if (el.filterMenu) {
            el.filterMenu.innerHTML = FILTER_OPTIONS.map(function (item) {
                return '<button type="button" class="live-menu-item" role="menuitemradio" data-filter="' + item.value +
                    '" aria-checked="' + (item.value === state.aliveFilter) + '">' + item.label + '</button>';
            }).join('');
        }
    }

    /* ── 选台 ───────────────────────────────────────────────── */

    function renderNow() {
        var channel = state.current;
        if (!channel) {
            el.nowName.textContent = '尚未选择频道';
            el.nowMeta.textContent = '从右侧列表挑选一个频道，或用遥控器方向键浏览';
            if (el.quality) el.quality.hidden = true;
            setOverlay('idle', '选择一个频道开始观看', '左侧列表可按分组浏览，支持搜索与测速', '');
            setStatus('idle', '待机');
            return;
        }
        el.nowName.textContent = channel.name;
        var meta = [channel.group || window.LiveData.UNGROUPED];
        if (channel.tvgId) meta.push(channel.tvgId);
        var source = window.LiveSources.find(channel.sourceKey);
        if (source) meta.push(source.name);
        el.nowMeta.textContent = meta.join(' · ');
    }

    function selectChannel(channel, index) {
        if (!channel) return;
        var playable = window.LivePlayer.canPlay(channel.url);
        if (!playable.ok) {
            toast(playable.kind === 'flv'
                ? '该频道是 FLV 流，浏览器无法直接播放'
                : '该频道格式不受支持（' + playable.kind + '）', 'warn');
            return;
        }

        if (state.current && state.current.url !== channel.url) lastChannel = state.current;
        state.current = channel;
        window.LiveSources.pushRecent(channel.url);
        markSelection();
        renderNow();
        loadEpgFor(channel);

        if (typeof index === 'number' && index >= state.rendered - 4) appendBatch();

        window.LivePlayer.playChannel({ url: channel.url, name: channel.name }).then(function (result) {
            if (result && result.ok === false && !result.stale) {
                setStatus('error', '播放失败');
                setOverlay('error', '无法播放该频道', '源站可能已下线或限制了本地区访问', '重新加载');
            }
        });
    }

    /** 沿当前筛选顺序换台，保持「看到什么就切什么」 */
    function step(delta) {
        if (!state.view.length) return;
        var index = -1;
        for (var i = 0; i < state.view.length; i++) {
            if (state.current && state.view[i].url === state.current.url) { index = i; break; }
        }
        var next = index < 0
            ? 0
            : (index + delta + state.view.length) % state.view.length;
        selectChannel(state.view[next], next);
    }

    /* ── 节目单 ─────────────────────────────────────────────── */

    function epgUrlFor(channel) {
        var source = window.LiveSources.find(channel.sourceKey);
        return source && source.epg ? source.epg : '';
    }

    function loadEpgFor(channel) {
        clearInterval(epgTimer);
        state.epgPrograms = [];
        var url = channel ? epgUrlFor(channel) : '';
        var channelId = channel ? (channel.tvgId || channel.id) : '';

        if (!url || !channelId) {
            renderEpg();
            return;
        }
        state.epgUrl = url;

        var cached = epgCache[url];
        if (cached && Date.now() - cached.at < EPG_TTL_MS) {
            state.epgPrograms = cached.map[channelId] || [];
            renderEpg();
            startEpgTicker();
            return;
        }

        el.epgTrack.innerHTML = '';
        el.epgNow.textContent = '正在获取节目单…';

        fetchTextDecoded(url, EPG_TIMEOUT_MS).then(function (text) {
            var map = window.LiveData.parseXmltv(text, EPG_WINDOW_MS, Date.now());
            epgCache[url] = { at: Date.now(), map: map };
            if (state.epgUrl !== url) return;
            state.epgPrograms = map[channelId] || [];
            renderEpg();
            startEpgTicker();
        }, function () {
            if (state.epgUrl !== url) return;
            state.epgPrograms = [];
            renderEpg('节目单拉取失败');
        });
    }

    function startEpgTicker() {
        clearInterval(epgTimer);
        if (!state.epgPrograms.length) return;
        epgTimer = setInterval(renderEpg, EPG_TICK_MS);
    }

    function renderEpg(override) {
        if (!el.epgTrack) return;
        if (override) {
            el.epgNow.textContent = override;
            el.epgTrack.innerHTML = '';
            return;
        }
        var programs = state.epgPrograms;
        if (!programs.length) {
            el.epgNow.textContent = state.epgUrl ? '当前频道未提供节目单' : '当前频道未提供 EPG';
            el.epgTrack.innerHTML = '';
            return;
        }

        var now = Date.now();
        var pair = window.LiveData.currentAndNext(programs, now);
        if (pair.current) {
            el.epgNow.textContent = '正在播出 · ' + pair.current.title;
        } else if (pair.next) {
            el.epgNow.textContent = '下一档 · ' + pair.next.title + '（' + window.LiveData.formatCountdown(pair.next, now) + '）';
        } else {
            el.epgNow.textContent = '今日节目已结束';
        }

        var html = '';
        for (var i = 0; i < programs.length; i++) {
            var program = programs[i];
            var live = program.start <= now && program.stop > now;
            html += '<li class="live-epg-item"' + (live ? ' data-live="1"' : '') + '>' +
                '<span class="live-epg-time">' + window.LiveData.formatClock(program.start) +
                ' – ' + window.LiveData.formatClock(program.stop) + '</span>' +
                '<span class="live-epg-title" title="' + escapeHtml(program.title) + '">' +
                escapeHtml(program.title) + '</span>' +
                (live ? '<span class="live-epg-progress"><span style="width:' +
                    window.LiveData.formatProgress(program, now) + '%"></span></span>' : '') +
                '</li>';
        }
        el.epgTrack.innerHTML = html;
    }

    /* ── 直播源抽屉 ─────────────────────────────────────────── */

    function sourceRow(source) {
        var item = document.createElement('li');
        item.className = 'live-source-item';
        item.setAttribute('data-key', source.key);
        item.innerHTML =
            '<label class="live-source-switch">' +
            '<input type="checkbox"' + (source.enabled ? ' checked' : '') + ' aria-label="启用 ' + escapeHtml(source.name) + '">' +
            '<span aria-hidden="true"></span>' +
            '</label>' +
            '<span class="live-source-body">' +
            '<span class="live-source-name">' + escapeHtml(source.name) +
            (source.builtin ? '<span class="live-source-tag">推荐</span>' : '') + '</span>' +
            '<span class="live-source-url" title="' + escapeHtml(source.url) + '">' + escapeHtml(source.url) + '</span>' +
            (source.epg ? '<span class="live-source-url" title="' + escapeHtml(source.epg) + '">EPG · ' +
                escapeHtml(source.epg) + '</span>' : '') +
            '</span>' +
            '<span class="live-source-actions">' +
            '<button type="button" class="live-icon-btn" data-act="up" aria-label="上移">↑</button>' +
            '<button type="button" class="live-icon-btn" data-act="down" aria-label="下移">↓</button>' +
            '<button type="button" class="live-icon-btn" data-act="edit" aria-label="编辑">改</button>' +
            '<button type="button" class="live-icon-btn live-icon-danger" data-act="remove" aria-label="删除">×</button>' +
            '</span>';

        item.querySelector('input').addEventListener('change', function (event) {
            window.LiveSources.update(source.key, { enabled: event.target.checked });
            refreshSources(true);
        });

        item.querySelector('.live-source-actions').addEventListener('click', function (event) {
            var button = event.target.closest('button[data-act]');
            if (!button) return;
            var act = button.getAttribute('data-act');
            if (act === 'up' || act === 'down') {
                window.LiveSources.move(source.key, act === 'up' ? -1 : 1);
                refreshSources(true);
            } else if (act === 'edit') {
                beginEdit(source);
            } else if (act === 'remove') {
                window.LiveSources.remove(source.key);
                toast('已删除「' + source.name + '」');
                refreshSources(true);
            }
        });

        return item;
    }

    function refreshSources(reloadAfter) {
        var items = window.LiveSources.list();
        var enabled = items.filter(function (item) { return item.enabled; });

        if (el.sourceTotal) el.sourceTotal.textContent = String(items.length);
        if (el.sourceCount) el.sourceCount.textContent = String(enabled.length);
        if (el.sourceList) {
            el.sourceList.innerHTML = '';
            if (!items.length) {
                var empty = document.createElement('li');
                empty.className = 'live-source-empty';
                empty.textContent = '还没有直播源，填入 M3U 订阅地址即可添加';
                el.sourceList.appendChild(empty);
            } else {
                var fragment = document.createDocumentFragment();
                items.forEach(function (item) { fragment.appendChild(sourceRow(item)); });
                el.sourceList.appendChild(fragment);
            }
        }
        if (el.sourceToggleAll) {
            var allOn = items.length > 0 && items.every(function (item) { return item.enabled; });
            el.sourceToggleAll.textContent = allOn ? '全部停用' : '全部启用';
        }
        if (reloadAfter) reload();
        else renderTopbarMeta();
    }

    function beginEdit(source) {
        state.editingKey = source.key;
        el.sourceName.value = source.name;
        el.sourceUrl.value = source.url;
        el.sourceEpg.value = source.epg || '';
        el.sourceSubmit.textContent = '保存修改';
        el.sourceCancel.hidden = false;
        el.sourceError.hidden = true;
        el.sourceName.focus();
    }

    function endEdit() {
        state.editingKey = '';
        el.sourceForm.reset();
        el.sourceSubmit.textContent = '添加直播源';
        el.sourceCancel.hidden = true;
        el.sourceError.hidden = true;
    }

    function submitSource(event) {
        event.preventDefault();
        var name = el.sourceName.value.trim();
        var url = el.sourceUrl.value.trim();
        var epg = el.sourceEpg.value.trim();

        if (!window.LiveSources.isHttpUrl(url)) {
            el.sourceError.textContent = '请填写以 http:// 或 https:// 开头的订阅地址';
            el.sourceError.hidden = false;
            el.sourceUrl.focus();
            return;
        }

        var result = state.editingKey
            ? window.LiveSources.update(state.editingKey, { name: name, url: url, epg: epg })
            : window.LiveSources.add({ name: name, url: url, epg: epg });

        if (!result || result.ok === false) {
            el.sourceError.textContent = result && result.reason === 'duplicate'
                ? '该订阅地址已存在'
                : '地址无效，请检查后重试';
            el.sourceError.hidden = false;
            return;
        }

        toast(result.duplicate
            ? '该订阅已存在，已为你保留原条目'
            : (state.editingKey ? '已保存修改' : '已添加直播源'));
        endEdit();
        refreshSources(true);
    }

    function openDrawer() {
        el.drawer.hidden = false;
        el.drawerBackdrop.hidden = false;
        el.drawer.setAttribute('aria-hidden', 'false');
        el.manageButton.setAttribute('aria-expanded', 'true');
        document.body.classList.add('live-drawer-open');
        if (window.tvFocusManager) window.tvFocusManager.pushScope(el.drawer, { onBack: closeDrawer });
        var first = el.drawer.querySelector('input, button');
        if (first) first.focus();
    }

    function closeDrawer() {
        el.drawer.hidden = true;
        el.drawerBackdrop.hidden = true;
        el.drawer.setAttribute('aria-hidden', 'true');
        el.manageButton.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('live-drawer-open');
        if (window.tvFocusManager) window.tvFocusManager.popScope();
        el.manageButton.focus();
    }

    /* ── 拉取与装配 ─────────────────────────────────────────── */

    function renderTopbarMeta() {
        if (!el.topbarMeta) return;
        if (state.loading) {
            el.topbarMeta.textContent = '正在准备直播源…';
            return;
        }
        var parts = [state.channels.length.toLocaleString('zh-CN') + ' 个频道'];
        parts.push(state.sourceTotal + ' 个源');
        if (state.failedSources) parts.push(state.failedSources + ' 个拉取失败');
        el.topbarMeta.textContent = parts.join(' · ');
    }

    function reload() {
        var sources = window.LiveSources.enabled();
        state.sourceTotal = window.LiveSources.list().length;
        state.loading = true;
        state.failedSources = 0;
        renderTopbarMeta();
        setOverlay('loading', '正在加载直播源…', '首次加载需要拉取订阅清单', '');
        setStatus('loading', '加载中');

        if (!sources.length) {
            state.channels = [];
            state.groups = [];
            state.view = [];
            state.loading = false;
            renderTopbarMeta();
            renderChips();
            renderList();
            setStatus('idle', '待机');
            setOverlay('idle', '还没有可用的直播源', '打开右上角「直播源」添加 M3U 订阅地址', '');
            return;
        }

        Promise.all(sources.map(function (source) {
            return fetchPlaylist(source).then(function (channels) {
                return { key: source.key, channels: channels };
            }, function () {
                state.failedSources += 1;
                return { key: source.key, channels: [] };
            });
        })).then(function (results) {
            state.channels = window.LiveData.mergeChannels(results);
            state.groups = window.LiveData.groupNames(state.channels);
            state.loading = false;
            state.current = null;

            var names = state.groups.map(function (group) { return group.name; });
            if (state.activeGroup && names.indexOf(state.activeGroup) === -1) state.activeGroup = '';

            renderTopbarMeta();
            renderChips();
            applyFilters();
            renderNow();

            if (!state.channels.length) {
                setStatus('idle', '待机');
                setOverlay('error', '订阅清单里没有可用频道',
                    '可能是订阅已失效，或其中的地址格式不受支持', '');
            } else {
                setStatus('idle', '待机');
                setOverlay('idle', '选择一个频道开始观看', '左侧列表可按分组浏览，支持搜索与测速', '');
            }
        });
    }

    /* ── 测速 ───────────────────────────────────────────────── */

    function paintBadge(url) {
        var badge = BADGE.unknown;
        var probe = window.LivePlayer.cachedProbe(url);
        if (probe) {
            if (!probe.ok) badge = BADGE.bad;
            else if (probe.level !== 'segment') badge = BADGE.weak;
            else badge = window.LiveData.isSlowProbe(probe) ? BADGE.slow : BADGE.fast;
        }
        var node = el.list.querySelector('.live-item[data-url="' + cssEscape(url) + '"] .live-item-badge');
        if (!node) return;
        node.setAttribute('data-tone', badge.tone);
        node.textContent = badge.label;
    }

    /** data-url 里可能含引号/反斜杠，属性选择器需要转义 */
    function cssEscape(value) {
        return String(value).replace(/(["\\])/g, '\\$1');
    }

    function runProbe() {
        if (state.probing) return;
        var targets = state.view.slice(0, PROBE_LIMIT);
        if (!targets.length) {
            toast('没有可测速的频道');
            return;
        }
        state.probing = true;
        el.probeButton.classList.add('is-busy');
        var done = 0;
        toast('开始测速：' + targets.length + ' 个频道' + (state.view.length > PROBE_LIMIT ? '（已截断）' : ''));

        var cursor = 0;
        function worker() {
            if (cursor >= targets.length) return Promise.resolve();
            var channel = targets[cursor++];
            return window.LivePlayer.probe(channel.url).then(function () {
                done += 1;
                paintBadge(channel.url);
                if (done % 20 === 0) {
                    toast('测速中… ' + done + ' / ' + targets.length);
                }
            }).then(worker);
        }

        var workers = [];
        for (var i = 0; i < PROBE_CONCURRENCY; i++) workers.push(worker());

        Promise.all(workers).then(function () {
            state.probing = false;
            el.probeButton.classList.remove('is-busy');
            toast('测速完成：' + done + ' 个频道');
            if (state.sortMode === 'probe' || state.aliveFilter !== 'off') applyFilters();
        });
    }

    /* ── 事件绑定 ───────────────────────────────────────────── */

    function bindMenus() {
        function wire(button, menu) {
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                var open = menu.hidden;
                closeMenus();
                menu.hidden = !open;
                button.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }
        wire(el.sortButton, el.sortMenu);
        wire(el.filterButton, el.filterMenu);

        el.sortMenu.addEventListener('click', function (event) {
            var item = event.target.closest('[data-sort]');
            if (!item) return;
            state.sortMode = item.getAttribute('data-sort');
            window.LiveSources.setPrefs({ sortMode: state.sortMode });
            closeMenus();
            renderMenus();
            applyFilters();
        });

        el.filterMenu.addEventListener('click', function (event) {
            var item = event.target.closest('[data-filter]');
            if (!item) return;
            state.aliveFilter = item.getAttribute('data-filter');
            window.LiveSources.setPrefs({ aliveFilter: state.aliveFilter });
            closeMenus();
            renderMenus();
            applyFilters();
        });

        document.addEventListener('click', closeMenus);
    }

    function closeMenus() {
        [el.sortMenu, el.filterMenu].forEach(function (menu) {
            if (menu) menu.hidden = true;
        });
        [el.sortButton, el.filterButton].forEach(function (button) {
            if (button) button.setAttribute('aria-expanded', 'false');
        });
    }

    function bindList() {
        el.groupChips.addEventListener('click', function (event) {
            var chip = event.target.closest('.live-chip');
            if (!chip) return;
            state.activeGroup = chip.getAttribute('data-group') || '';
            renderChips();
            applyFilters();
            if (state.view.length) el.list.scrollTop = 0;
        });

        var sentinel = el.listSentinel;
        if (sentinel && typeof IntersectionObserver !== 'undefined') {
            var observer = new IntersectionObserver(function (entries) {
                if (entries[0].isIntersecting) {
                    var before = state.rendered;
                    appendBatch();
                    if (state.rendered !== before) {
                        markSelection();
                        updateListCount();
                    }
                }
            }, { root: el.listParent || null, rootMargin: '320px' });
            observer.observe(sentinel);
        }

        el.searchInput.addEventListener('input', function () {
            state.keyword = el.searchInput.value;
            el.searchClear.hidden = !state.keyword;
            clearTimeout(bindList._debounce);
            bindList._debounce = setTimeout(applyFilters, 120);
        });

        el.searchClear.addEventListener('click', function () {
            el.searchInput.value = '';
            state.keyword = '';
            el.searchClear.hidden = true;
            applyFilters();
            el.searchInput.focus();
        });
    }

    function bindPlayerControls() {
        el.prevButton.addEventListener('click', function () { step(-1); });
        el.nextButton.addEventListener('click', function () { step(1); });
        el.refreshButton.addEventListener('click', function () { reload(); });

        el.stageAction.addEventListener('click', function () {
            if (state.current) selectChannel(state.current);
            else setOverlay('idle', '选择一个频道开始观看', '左侧列表可按分组浏览，支持搜索与测速', '');
        });

        el.copyButton.addEventListener('click', function () {
            if (!state.current) return;
            copyText(state.current.url).then(function (ok) {
                var previous = el.copyLabel.textContent;
                el.copyLabel.textContent = ok ? '已复制' : '复制失败';
                toast(ok ? '已复制频道地址' : '复制失败，请手动选择地址', ok ? 'info' : 'warn');
                setTimeout(function () { el.copyLabel.textContent = previous; }, 1600);
            });
        });

        el.probeButton.addEventListener('click', runProbe);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
        }
        return Promise.resolve(legacyCopy(text));
    }

    function legacyCopy(text) {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
        document.body.removeChild(area);
        return ok;
    }

    function bindDrawer() {
        el.manageButton.addEventListener('click', openDrawer);
        el.drawerClose.addEventListener('click', closeDrawer);
        el.drawerBackdrop.addEventListener('click', closeDrawer);
        el.sourceForm.addEventListener('submit', submitSource);
        el.sourceCancel.addEventListener('click', endEdit);

        el.sourceToggleAll.addEventListener('click', function () {
            var items = window.LiveSources.list();
            var allOn = items.length > 0 && items.every(function (item) { return item.enabled; });
            items.forEach(function (item) { window.LiveSources.update(item.key, { enabled: !allOn }); });
            refreshSources(true);
        });

        el.sourceExport.addEventListener('click', function () {
            var blob = new Blob([JSON.stringify(window.LiveSources.exportPayload(), null, 2)], { type: 'application/json' });
            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'freedy-live-sources.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
            toast('已导出直播源配置');
        });

        el.sourceImport.addEventListener('click', function () { el.sourceFile.click(); });

        el.sourceFile.addEventListener('change', function () {
            var file = el.sourceFile.files && el.sourceFile.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                var payload;
                try {
                    payload = JSON.parse(String(reader.result));
                } catch (error) {
                    toast('文件不是有效的 JSON', 'warn');
                    return;
                }
                var result = window.LiveSources.importPayload(payload);
                el.sourceFile.value = '';
                if (!result.ok) {
                    toast('无法识别的配置文件结构', 'warn');
                    return;
                }
                toast(result.added ? '导入成功：新增 ' + result.added + ' 个直播源' : '没有新的直播源可导入');
                refreshSources(true);
            };
            reader.readAsText(file);
        });

        el.sourceReset.addEventListener('click', function () {
            window.LiveSources.resetToPresets();
            toast('已恢复推荐直播源');
            endEdit();
            refreshSources(true);
        });
    }

    function bindKeys() {
        document.addEventListener('keydown', function (event) {
            var tag = event.target && event.target.tagName;
            var typing = tag === 'INPUT' || tag === 'TEXTAREA';
            if (typing) return;

            if (event.key === 'PageUp') {
                event.preventDefault();
                step(-1);
            } else if (event.key === 'PageDown') {
                event.preventDefault();
                step(1);
            } else if (event.key === 'Backspace' && lastChannel) {
                event.preventDefault();
                var back = lastChannel;
                lastChannel = null;
                selectChannel(back);
            }
        });
    }

    function bindTvSearch() {
        if (!el.searchInput || !window.tvKeyboard) return;
        el.searchInput.addEventListener('tv-confirm', function (event) {
            if (!window.tvFocusManager || !window.tvFocusManager.isTvDevice) return;
            event.preventDefault();
            window.tvKeyboard.open(el.searchInput, {
                onSearch: function () {
                    state.keyword = el.searchInput.value;
                    el.searchClear.hidden = !state.keyword;
                    applyFilters();
                }
            });
        });
    }

    /* ── 启动 ───────────────────────────────────────────────── */

    function cacheDom() {
        el = {
            topbarMeta: $('liveTopbarMeta'),
            refreshButton: $('liveRefreshButton'),
            manageButton: $('liveManageButton'),
            sourceCount: $('liveSourceCount'),
            stageOverlay: $('liveStageOverlay'),
            stageMessage: $('liveStageMessage'),
            stageHint: $('liveStageHint'),
            stageAction: $('liveStageAction'),
            status: $('liveStatus'),
            statusText: $('liveStatusText'),
            nowName: $('liveNowName'),
            nowMeta: $('liveNowMeta'),
            quality: $('liveQuality'),
            prevButton: $('livePrevButton'),
            nextButton: $('liveNextButton'),
            copyButton: $('liveCopyButton'),
            copyLabel: $('liveCopyLabel'),
            epgNow: $('liveEpgNow'),
            epgTrack: $('liveEpgTrack'),
            searchInput: $('liveSearchInput'),
            searchClear: $('liveSearchClear'),
            sortButton: $('liveSortButton'),
            sortValue: $('liveSortValue'),
            sortMenu: $('liveSortMenu'),
            filterButton: $('liveFilterButton'),
            filterValue: $('liveFilterValue'),
            filterMenu: $('liveFilterMenu'),
            probeButton: $('liveProbeButton'),
            groupChips: $('liveGroupChips'),
            list: $('liveList'),
            listParent: $('liveList'),
            listSummary: $('liveListSummary'),
            listEmpty: $('liveListEmpty'),
            listSentinel: $('liveListSentinel'),
            listCount: $('liveListCount'),
            drawer: $('liveDrawer'),
            drawerBackdrop: $('liveDrawerBackdrop'),
            drawerClose: $('liveDrawerClose'),
            sourceForm: $('liveSourceForm'),
            sourceName: $('liveSourceName'),
            sourceUrl: $('liveSourceUrl'),
            sourceEpg: $('liveSourceEpg'),
            sourceSubmit: $('liveSourceSubmit'),
            sourceCancel: $('liveSourceCancel'),
            sourceError: $('liveSourceError'),
            sourceList: $('liveSourceList'),
            sourceTotal: $('liveSourceTotal'),
            sourceToggleAll: $('liveSourceToggleAll'),
            sourceImport: $('liveSourceImport'),
            sourceExport: $('liveSourceExport'),
            sourceReset: $('liveSourceReset'),
            sourceFile: $('liveSourceFile'),
            toast: $('liveToast')
        };
    }

    function boot() {
        if (!window.LiveData || !window.LiveSources || !window.LivePlayer) {
            if (window.console) console.error('[FreeDY 直播] 依赖模块未加载，页面无法初始化');
            return;
        }
        cacheDom();

        var prefs = window.LiveSources.prefs();
        state.sortMode = prefs.sortMode || 'default';
        state.aliveFilter = prefs.aliveFilter || 'off';
        window.LivePlayer.setProxy(prefs.viaProxy !== false);
        window.LivePlayer.warmAuth();

        window.LivePlayer.install(el.list ? document.getElementById('livePlayerBox') : '#livePlayerBox', {
            onStatus: handleStatus,
            onPrev: function () { step(-1); },
            onNext: function () { step(1); }
        });

        renderMenus();
        bindMenus();
        bindList();
        bindPlayerControls();
        bindDrawer();
        bindKeys();
        bindTvSearch();
        bindOpenMenusGuard();

        window.LiveSources.ensureSeeded();
        refreshSources(false);
        reload();
        renderNow();
    }

    function bindOpenMenusGuard() {
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') closeMenus();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
