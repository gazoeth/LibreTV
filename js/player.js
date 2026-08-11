const selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '[]');
const customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]'); // 瀛樺偍鑷畾涔堿PI鍒楄〃

// 鏀硅繘杩斿洖鍔熻兘
function goBack(event) {
    // 闃叉榛樿閾炬帴琛屼负
    if (event) event.preventDefault();
    
    // 1. 浼樺厛妫€鏌RL鍙傛暟涓殑returnUrl
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    if (returnUrl) {
        // 濡傛灉URL涓湁returnUrl鍙傛暟锛屼紭鍏堜娇鐢?        window.location.href = decodeURIComponent(returnUrl);
        return;
    }
    
    // 2. 妫€鏌ocalStorage涓繚瀛樼殑lastPageUrl
    const lastPageUrl = localStorage.getItem('lastPageUrl');
    if (lastPageUrl && lastPageUrl !== window.location.href) {
        window.location.href = lastPageUrl;
        return;
    }
    
    // 3. 妫€鏌ユ槸鍚︽槸浠庢悳绱㈤〉闈㈣繘鍏ョ殑鎾斁鍣?    const referrer = document.referrer;
    
    // 妫€鏌?referrer 鏄惁鍖呭惈鎼滅储鍙傛暟
    if (referrer && (referrer.includes('/s=') || referrer.includes('?s='))) {
        // 濡傛灉鏄粠鎼滅储椤甸潰鏉ョ殑锛岃繑鍥炲埌鎼滅储椤甸潰
        window.location.href = referrer;
        return;
    }
    
    // 4. 濡傛灉鏄湪iframe涓墦寮€鐨勶紝灏濊瘯鍏抽棴iframe
    if (window.self !== window.top) {
        try {
            // 灏濊瘯璋冪敤鐖剁獥鍙ｇ殑鍏抽棴鎾斁鍣ㄥ嚱鏁?            window.parent.closeVideoPlayer && window.parent.closeVideoPlayer();
            return;
        } catch (e) {
            console.error('璋冪敤鐖剁獥鍙loseVideoPlayer澶辫触:', e);
        }
    }
    
    // 5. 鏃犳硶纭畾涓婁竴椤碉紝鍒欒繑鍥為椤?    if (!referrer || referrer === '') {
        window.location.href = '/';
        return;
    }
    
    // 6. 浠ヤ笂閮戒笉婊¤冻锛屼娇鐢ㄩ粯璁よ涓猴細杩斿洖涓婁竴椤?    window.history.back();
}

// 椤甸潰鍔犺浇鏃朵繚瀛樺綋鍓峌RL鍒發ocalStorage锛屼綔涓鸿繑鍥炵洰鏍?window.addEventListener('load', function () {
    // 淇濆瓨鍓嶄竴椤甸潰URL
    if (document.referrer && document.referrer !== window.location.href) {
        localStorage.setItem('lastPageUrl', document.referrer);
    }

    // 鎻愬彇褰撳墠URL涓殑閲嶈鍙傛暟锛屼互渚垮湪闇€瑕佹椂鑳藉鎭㈠褰撳墠椤甸潰
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');
    const sourceCode = getCurrentSourceCode(urlParams);

    if (videoId && sourceCode) {
        // 淇濆瓨褰撳墠鎾斁鐘舵€侊紝浠ヤ究鍏朵粬椤甸潰鍙互杩斿洖
        localStorage.setItem('currentPlayingId', videoId);
        localStorage.setItem('currentPlayingSource', sourceCode);
    }

    // NOTE: TV 妯″紡涓嬫樉绀洪仴鎺у櫒褰╄壊鎸夐敭鎻愮ず鏉?    if (window.tvFocusManager && window.tvFocusManager.isTvDevice) {
        var colorHints = document.getElementById('tvColorHints');
        if (colorHints) colorHints.style.display = 'flex';
    }
});



// =================================
// ============== PLAYER ==========
// =================================
// 鍏ㄥ眬鍙橀噺
let currentVideoTitle = '';
let currentEpisodeIndex = 0;
let art = null; // 鐢ㄤ簬 ArtPlayer 瀹炰緥
let currentHls = null; // 璺熻釜褰撳墠HLS瀹炰緥
let currentEpisodes = [];
let episodesReversed = false;
let autoplayEnabled = true; // 榛樿寮€鍚嚜鍔ㄨ繛鎾?let videoHasEnded = false; // 璺熻釜瑙嗛鏄惁宸茬粡鑷劧缁撴潫
let userClickedPosition = null; // 璁板綍鐢ㄦ埛鐐瑰嚮鐨勪綅缃?let shortcutHintTimeout = null; // 鐢ㄤ簬鎺у埗蹇嵎閿彁绀烘樉绀烘椂闂?let adFilteringEnabled = true; // 榛樿寮€鍚箍鍛婅繃婊?let progressSaveInterval = null; // 瀹氭湡淇濆瓨杩涘害鐨勮鏃跺櫒
let currentVideoUrl = ''; // 璁板綍褰撳墠瀹為檯鐨勮棰慤RL
let resourceSwitchInProgress = false;
let playerTvNavigationMode = false;
let playerTvPreviousFocus = null;
let resourceModalKeydownHandler = null;
let resourceModalPreviousFocus = null;
const VISUAL_CLEAN_STORAGE_KEY = 'visualCleanRules.v1';
const VISUAL_CLEAN_AUTO_DISABLED_KEY = 'visualCleanAutoDisabledSources.v1';
const VISUAL_CLEAN_AUTO_SAMPLE_DELAYS = [8000, 20000, 45000];
const VISUAL_CLEAN_AUTO_WIDTH = 256;
const VISUAL_CLEAN_AUTO_MIN_CONFIDENCE = 0.74;
const VISUAL_CLEAN_MODES = [
    { key: 'off', label: '鍏抽棴', className: '' },
    { key: 'bottom-right', label: '鍙充笅瑙掗伄缃?, className: 'clean-mask-bottom-right' },
    { key: 'bottom-left', label: '宸︿笅瑙掗伄缃?, className: 'clean-mask-bottom-left' },
    { key: 'top-right', label: '鍙充笂瑙掗伄缃?, className: 'clean-mask-top-right' },
    { key: 'top-left', label: '宸︿笂瑙掗伄缃?, className: 'clean-mask-top-left' },
    { key: 'crop-bottom', label: '搴曢儴璺戦┈鐏?, className: 'clean-crop-bottom' },
    { key: 'crop-top', label: '椤堕儴璺戦┈鐏?, className: 'clean-crop-top' },
    { key: 'crop-bottom-right', label: '搴曢儴+鍙充笅瑙?, className: 'clean-crop-bottom-right' }
];
let currentVisualCleanMode = 'off';
let visualCleanDetectionSession = null;
let visualCleanDetectionAttemptKey = '';
let visualCleanConfirmKeydownHandler = null;
let visualCleanConfirmPreviousFocus = null;
let visualCleanEditorOriginalMode = 'off';
let visualCleanEditorPreviewMode = 'off';
const isWebkit = (typeof window.webkitConvertPointFromNodeToPage === 'function')
Artplayer.FULLSCREEN_WEB_IN_BODY = true;

function getCurrentSourceCode(params = new URLSearchParams(window.location.search)) {
    return params.get('source_code') || params.get('source') || '';
}

function readVisualCleanRules() {
    try {
        const parsed = JSON.parse(localStorage.getItem(VISUAL_CLEAN_STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function getVisualCleanModeForSource(sourceKey = getCurrentSourceCode()) {
    const savedMode = readVisualCleanRules()[sourceKey] || 'off';
    return VISUAL_CLEAN_MODES.some(mode => mode.key === savedMode) ? savedMode : 'off';
}

function saveVisualCleanModeForSource(sourceKey, modeKey) {
    if (!sourceKey) return;
    try {
        const rules = readVisualCleanRules();
        if (modeKey === 'off') delete rules[sourceKey];
        else rules[sourceKey] = modeKey;
        localStorage.setItem(VISUAL_CLEAN_STORAGE_KEY, JSON.stringify(rules));
    } catch (error) {}
}

function applyVisualCleanMode(modeKey, options = {}) {
    const container = document.getElementById('playerContainer');
    const button = document.getElementById('visualCleanButton');
    const text = document.getElementById('visualCleanText');
    if (!container) return;

    const selectedMode = VISUAL_CLEAN_MODES.find(mode => mode.key === modeKey) || VISUAL_CLEAN_MODES[0];
    VISUAL_CLEAN_MODES.forEach(mode => {
        if (mode.className) container.classList.remove(mode.className);
    });
    if (selectedMode.className) container.classList.add(selectedMode.className);
    currentVisualCleanMode = selectedMode.key;

    if (text) text.textContent = `鐢婚潰鍑€鍖栵細${selectedMode.label}`;
    if (button) {
        button.classList.toggle('is-active', selectedMode.key !== 'off');
        button.setAttribute('aria-label', `鐢婚潰鍑€鍖栵細${selectedMode.label}`);
        button.setAttribute('aria-pressed', selectedMode.key !== 'off' ? 'true' : 'false');
    }

    const sourceKey = getCurrentSourceCode();
    if (options.persist !== false) saveVisualCleanModeForSource(sourceKey, selectedMode.key);
    if (options.notify) showToast(`鐢婚潰鍑€鍖栵細${selectedMode.label}`, selectedMode.key === 'off' ? 'info' : 'success');
}

function cycleVisualCleanMode() {
    openVisualCleanEditor();
}

function selectVisualCleanPreview(modeKey, button = null) {
    if (!VISUAL_CLEAN_MODES.some(mode => mode.key === modeKey)) return;
    visualCleanEditorPreviewMode = modeKey;
    applyVisualCleanMode(modeKey, { persist: false });
    document.querySelectorAll('.visual-clean-option').forEach(option => {
        const isSelected = option.dataset.mode === modeKey;
        option.classList.toggle('is-selected', isSelected);
        option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
    button?.focus({ preventScroll: true });
}

function closeVisualCleanEditor(options = {}) {
    const modal = document.getElementById('visualCleanEditorModal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (!options.keepPreview) {
        applyVisualCleanMode(visualCleanEditorOriginalMode, { persist: false });
    }
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    closeVisualCleanConfirm();
}

function openVisualCleanEditor() {
    const modal = document.getElementById('visualCleanEditorModal');
    if (!modal) return;
    visualCleanEditorOriginalMode = currentVisualCleanMode;
    visualCleanEditorPreviewMode = currentVisualCleanMode;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    selectVisualCleanPreview(currentVisualCleanMode);
    const selected = modal.querySelector(`.visual-clean-option[data-mode="${currentVisualCleanMode}"]`)
        || modal.querySelector('.visual-clean-option');
    requestAnimationFrame(() => selected?.focus({ preventScroll: true }));
}

function saveVisualCleanEditor() {
    applyVisualCleanMode(visualCleanEditorPreviewMode, { persist: true, notify: true });
    closeVisualCleanEditor({ keepPreview: true });
}

function resetVisualCleanEditor() {
    selectVisualCleanPreview('off');
}

function restoreVisualCleanModeForCurrentSource() {
    applyVisualCleanMode(getVisualCleanModeForSource(), { persist: false });
}

function readVisualCleanAutoDisabledSources() {
    try {
        const parsed = JSON.parse(localStorage.getItem(VISUAL_CLEAN_AUTO_DISABLED_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
        return [];
    }
}

function isVisualCleanAutoDisabledForSource(sourceKey) {
    return Boolean(sourceKey) && readVisualCleanAutoDisabledSources().includes(sourceKey);
}

function disableVisualCleanAutoForSource(sourceKey) {
    if (!sourceKey) return;
    try {
        const sources = new Set(readVisualCleanAutoDisabledSources());
        sources.add(sourceKey);
        localStorage.setItem(VISUAL_CLEAN_AUTO_DISABLED_KEY, JSON.stringify(Array.from(sources)));
    } catch (error) {}
}

function hasVisualCleanRuleForSource(sourceKey) {
    if (!sourceKey) return false;
    return Object.prototype.hasOwnProperty.call(readVisualCleanRules(), sourceKey);
}

function isLowPerformanceVisualCleanDevice() {
    const cores = Number(navigator.hardwareConcurrency || 0);
    const memory = Number(navigator.deviceMemory || 0);
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);
    return saveData || (cores > 0 && cores <= 2) || (memory > 0 && memory <= 1);
}

function canStartVisualCleanDetection(video, sourceKey) {
    if (!video || !sourceKey || window.__legacyBrowser) return false;
    if (resourceSwitchInProgress || visualCleanDetectionSession) return false;
    if (hasVisualCleanRuleForSource(sourceKey) || isVisualCleanAutoDisabledForSource(sourceKey)) return false;
    if (isLowPerformanceVisualCleanDevice()) return false;
    if (!document.createElement('canvas').getContext) return false;
    return video.readyState >= 2 && video.videoWidth >= 240 && video.videoHeight >= 135;
}

function stopVisualCleanDetection() {
    const session = visualCleanDetectionSession;
    if (!session) return;
    session.cancelled = true;
    session.timers.forEach(timer => clearTimeout(timer));
    session.timers = [];
    if (session.canvas) {
        session.canvas.width = 1;
        session.canvas.height = 1;
    }
    visualCleanDetectionSession = null;
}

function getVisualCleanRegionPixels(frame, region) {
    const { width, height, data } = frame;
    const startX = Math.max(0, Math.floor(width * region.x));
    const startY = Math.max(0, Math.floor(height * region.y));
    const endX = Math.min(width, Math.ceil(width * (region.x + region.w)));
    const endY = Math.min(height, Math.ceil(height * (region.y + region.h)));
    const regionWidth = Math.max(1, endX - startX);
    const regionHeight = Math.max(1, endY - startY);
    const pixels = new Uint8Array(regionWidth * regionHeight);
    let outputIndex = 0;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const index = (y * width + x) * 4;
            pixels[outputIndex++] = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
        }
    }
    return { pixels, width: regionWidth, height: regionHeight };
}

function measureVisualCleanRegion(frame, region) {
    const sample = getVisualCleanRegionPixels(frame, region);
    let edgeCount = 0;
    let contrastCount = 0;
    let occupiedRows = 0;

    for (let y = 0; y < sample.height; y++) {
        let rowEdges = 0;
        for (let x = 0; x < sample.width; x++) {
            const index = y * sample.width + x;
            const value = sample.pixels[index];
            if (value < 42 || value > 214) contrastCount++;
            if (x > 0 && Math.abs(value - sample.pixels[index - 1]) > 34) {
                edgeCount++;
                rowEdges++;
            }
        }
        if (rowEdges >= Math.max(2, sample.width * 0.08)) occupiedRows++;
    }

    const pixelCount = Math.max(1, sample.pixels.length);
    return {
        sample,
        edgeDensity: edgeCount / pixelCount,
        contrastRatio: contrastCount / pixelCount,
        rowOccupancy: occupiedRows / sample.height
    };
}

function measureVisualCleanFrameDifference(firstSample, secondSample) {
    if (!firstSample || !secondSample || firstSample.pixels.length !== secondSample.pixels.length) return 1;
    let difference = 0;
    for (let index = 0; index < firstSample.pixels.length; index += 2) {
        difference += Math.abs(firstSample.pixels[index] - secondSample.pixels[index]);
    }
    return difference / (Math.ceil(firstSample.pixels.length / 2) * 255);
}

function clampVisualCleanScore(value) {
    return Math.max(0, Math.min(1, value));
}

function analyzeVisualCleanFrames(frames) {
    if (!Array.isArray(frames) || frames.length < 3) return null;
    const regions = {
        'top-left': { x: 0, y: 0.02, w: 0.28, h: 0.22, kind: 'corner' },
        'top-right': { x: 0.72, y: 0.02, w: 0.28, h: 0.22, kind: 'corner' },
        'bottom-left': { x: 0, y: 0.76, w: 0.28, h: 0.22, kind: 'corner' },
        'bottom-right': { x: 0.72, y: 0.76, w: 0.28, h: 0.22, kind: 'corner' },
        'crop-top': { x: 0.06, y: 0, w: 0.88, h: 0.15, kind: 'strip' },
        'crop-bottom': { x: 0.06, y: 0.84, w: 0.88, h: 0.16, kind: 'strip' }
    };
    const candidates = [];

    Object.entries(regions).forEach(([mode, region]) => {
        const measurements = frames.map(frame => measureVisualCleanRegion(frame, region));
        const averageEdge = measurements.reduce((sum, item) => sum + item.edgeDensity, 0) / measurements.length;
        const averageContrast = measurements.reduce((sum, item) => sum + item.contrastRatio, 0) / measurements.length;
        const averageRows = measurements.reduce((sum, item) => sum + item.rowOccupancy, 0) / measurements.length;
        const differences = measurements.slice(1).map((item, index) =>
            measureVisualCleanFrameDifference(measurements[index].sample, item.sample)
        );
        const averageDifference = differences.reduce((sum, value) => sum + value, 0) / Math.max(1, differences.length);

        let confidence;
        if (region.kind === 'corner') {
            const detailScore = clampVisualCleanScore((averageEdge - 0.035) / 0.14);
            const stabilityScore = clampVisualCleanScore((0.17 - averageDifference) / 0.15);
            const contrastScore = clampVisualCleanScore((averageContrast - 0.18) / 0.42);
            confidence = detailScore * 0.42 + stabilityScore * 0.43 + contrastScore * 0.15;
        } else {
            const detailScore = clampVisualCleanScore((averageEdge - 0.045) / 0.12);
            const rowScore = clampVisualCleanScore((averageRows - 0.22) / 0.55);
            const motionScore = clampVisualCleanScore(1 - Math.abs(averageDifference - 0.12) / 0.12);
            confidence = detailScore * 0.38 + rowScore * 0.32 + motionScore * 0.30;
        }

        candidates.push({ mode, confidence, averageDifference, averageEdge });
    });

    candidates.sort((first, second) => second.confidence - first.confidence);
    const best = candidates[0];
    const bottomStrip = candidates.find(item => item.mode === 'crop-bottom');
    const bottomRight = candidates.find(item => item.mode === 'bottom-right');
    if (bottomStrip && bottomRight
        && bottomStrip.confidence >= VISUAL_CLEAN_AUTO_MIN_CONFIDENCE
        && bottomRight.confidence >= VISUAL_CLEAN_AUTO_MIN_CONFIDENCE) {
        return {
            mode: 'crop-bottom-right',
            confidence: Math.min(0.98, (bottomStrip.confidence + bottomRight.confidence) / 2),
            reason: '妫€娴嬪埌搴曢儴妯潯鍜屽彸涓嬭鍥哄畾璐寸墖'
        };
    }

    if (!best || best.confidence < VISUAL_CLEAN_AUTO_MIN_CONFIDENCE) return null;
    const modeConfig = VISUAL_CLEAN_MODES.find(mode => mode.key === best.mode);
    return {
        mode: best.mode,
        confidence: best.confidence,
        reason: best.mode.startsWith('crop-')
            ? `妫€娴嬪埌${modeConfig?.label || '鎸佺画妯潯'}`
            : `妫€娴嬪埌${modeConfig?.label || '鍥哄畾璐寸墖'}`
    };
}

function closeVisualCleanConfirm() {
    const modal = document.getElementById('visualCleanConfirmModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (visualCleanConfirmKeydownHandler) {
        document.removeEventListener('keydown', visualCleanConfirmKeydownHandler, true);
        visualCleanConfirmKeydownHandler = null;
    }
    if (visualCleanConfirmPreviousFocus && document.contains(visualCleanConfirmPreviousFocus)) {
        visualCleanConfirmPreviousFocus.focus({ preventScroll: true });
    }
    visualCleanConfirmPreviousFocus = null;
}

function showVisualCleanConfirm(result, sourceKey) {
    const modal = document.getElementById('visualCleanConfirmModal');
    const description = document.getElementById('visualCleanConfirmDescription');
    if (!modal || !description || !result || sourceKey !== getCurrentSourceCode()) return;
    if (hasVisualCleanRuleForSource(sourceKey) || resourceSwitchInProgress) return;

    const modeConfig = VISUAL_CLEAN_MODES.find(mode => mode.key === result.mode);
    const sourceName = getResourceDisplayName(sourceKey);
    const confidence = Math.round(result.confidence * 100);
    description.textContent = `${result.reason}锛屽缓璁娇鐢ㄢ€?{modeConfig?.label || '鐢婚潰鍑€鍖?}鈥濓紙缃俊搴?${confidence}%锛夈€備粎鍦ㄤ綘纭鍚庡簲鐢紝骞朵繚瀛樺埌 ${sourceName}銆俙;
    visualCleanConfirmPreviousFocus = document.activeElement;
    modal.dataset.mode = result.mode;
    modal.dataset.sourceKey = sourceKey;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    const buttons = Array.from(modal.querySelectorAll('.visual-clean-confirm-action'));
    const applyButton = document.getElementById('visualCleanConfirmApply');
    requestAnimationFrame(() => applyButton?.focus({ preventScroll: true }));

    visualCleanConfirmKeydownHandler = function (event) {
        if (modal.classList.contains('hidden')) return;
        const isBackKey = event.key === 'Escape' || event.key === 'BrowserBack'
            || event.keyCode === 27 || event.keyCode === 461 || event.keyCode === 10009;
        if (isBackKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeVisualCleanConfirm();
            return;
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const activeIndex = Math.max(0, buttons.indexOf(document.activeElement));
            const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
            buttons[(activeIndex + step + buttons.length) % buttons.length]?.focus({ preventScroll: true });
            return;
        }
        const isConfirmKey = event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 23;
        if (isConfirmKey && buttons.includes(document.activeElement)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            document.activeElement.click();
        }
    };
    document.addEventListener('keydown', visualCleanConfirmKeydownHandler, true);
}

function handleVisualCleanConfirm(action) {
    const modal = document.getElementById('visualCleanConfirmModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const sourceKey = modal.dataset.sourceKey || '';
    const mode = modal.dataset.mode || '';
    closeVisualCleanConfirm();

    if (!sourceKey || sourceKey !== getCurrentSourceCode()) return;
    if (action === 'apply') {
        applyVisualCleanMode(mode, { persist: true, notify: true });
    } else if (action === 'disable') {
        disableVisualCleanAutoForSource(sourceKey);
        showToast(`宸插叧闂?${getResourceDisplayName(sourceKey)} 鐨勮嚜鍔ㄧ敾闈㈣瘑鍒玚, 'info');
    }
}

function captureVisualCleanFrame(session) {
    if (!session || session.cancelled || session !== visualCleanDetectionSession) return null;
    const video = session.video;
    if (!video || video.paused || video.ended || video.readyState < 2 || resourceSwitchInProgress) return null;
    if (session.sourceKey !== getCurrentSourceCode()) return null;

    const width = VISUAL_CLEAN_AUTO_WIDTH;
    const height = Math.max(90, Math.round(width * video.videoHeight / video.videoWidth));
    session.canvas.width = width;
    session.canvas.height = height;
    session.context.drawImage(video, 0, 0, width, height);
    const imageData = session.context.getImageData(0, 0, width, height);
    return { width, height, data: imageData.data };
}

function startVisualCleanDetection() {
    const video = art?.video;
    const sourceKey = getCurrentSourceCode();
    const attemptKey = `${sourceKey}|${currentVideoUrl}`;
    if (visualCleanDetectionAttemptKey === attemptKey) return;
    if (!canStartVisualCleanDetection(video, sourceKey)) return;
    visualCleanDetectionAttemptKey = attemptKey;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    const session = {
        sourceKey,
        video,
        canvas,
        context,
        frames: [],
        timers: [],
        cancelled: false
    };
    visualCleanDetectionSession = session;

    VISUAL_CLEAN_AUTO_SAMPLE_DELAYS.forEach((delay, sampleIndex) => {
        const timer = setTimeout(() => {
            if (session.cancelled || session !== visualCleanDetectionSession) return;
            try {
                const frame = captureVisualCleanFrame(session);
                if (frame) session.frames.push(frame);
            } catch (error) {
                // 绗笁鏂硅棰戞病鏈?CORS 鍝嶅簲澶存椂 Canvas 浼氳姹℃煋锛涢潤榛橀€€鍑猴紝涓嶅奖鍝嶆挱鏀俱€?                stopVisualCleanDetection();
                return;
            }

            if (sampleIndex === VISUAL_CLEAN_AUTO_SAMPLE_DELAYS.length - 1) {
                const frames = session.frames.slice();
                stopVisualCleanDetection();
                const result = analyzeVisualCleanFrames(frames);
                if (result && sourceKey === getCurrentSourceCode() && !hasVisualCleanRuleForSource(sourceKey)) {
                    showVisualCleanConfirm(result, sourceKey);
                }
            }
        }, delay);
        session.timers.push(timer);
    });
}

// 椤甸潰鍔犺浇
document.addEventListener('DOMContentLoaded', function () {
    // 鍏堟鏌ョ敤鎴锋槸鍚﹀凡閫氳繃瀵嗙爜楠岃瘉
    if (!isPasswordVerified()) {
        // 闅愯棌鍔犺浇鎻愮ず
        document.getElementById('player-loading').style.display = 'none';
        return;
    }

    initializePageContent();
});

// 鐩戝惉瀵嗙爜楠岃瘉鎴愬姛浜嬩欢
document.addEventListener('passwordVerified', () => {
    document.getElementById('player-loading').style.display = 'block';

    initializePageContent();
});

// 鍒濆鍖栭〉闈㈠唴瀹?function initializePageContent() {

    // 瑙ｆ瀽URL鍙傛暟
    const urlParams = new URLSearchParams(window.location.search);
    let videoUrl = urlParams.get('url');
    const title = urlParams.get('title');
    const sourceCode = getCurrentSourceCode(urlParams);
    let index = parseInt(urlParams.get('index') || '0');
    const episodesList = urlParams.get('episodes'); // 浠嶶RL鑾峰彇闆嗘暟淇℃伅
    const savedPosition = parseInt(urlParams.get('position') || '0'); // 鑾峰彇淇濆瓨鐨勬挱鏀句綅缃?    // 瑙ｅ喅鍘嗗彶璁板綍闂锛氭鏌RL鏄惁鏄痯layer.html寮€澶寸殑閾炬帴
    // 濡傛灉鏄紝璇存槑杩欐槸鍘嗗彶璁板綍閲嶅畾鍚戯紝闇€瑕佽В鏋愮湡瀹炵殑瑙嗛URL
    if (videoUrl && videoUrl.includes('player.html')) {
        try {
            // 灏濊瘯浠庡祵濂桿RL涓彁鍙栫湡瀹炵殑瑙嗛閾炬帴
            const nestedUrlParams = new URLSearchParams(videoUrl.split('?')[1]);
            // 浠庡祵濂楀弬鏁颁腑鑾峰彇鐪熷疄瑙嗛URL
            const nestedVideoUrl = nestedUrlParams.get('url');
            // 妫€鏌ュ祵濂桿RL鏄惁鍖呭惈鎾斁浣嶇疆淇℃伅
            const nestedPosition = nestedUrlParams.get('position');
            const nestedIndex = nestedUrlParams.get('index');
            const nestedTitle = nestedUrlParams.get('title');

            if (nestedVideoUrl) {
                videoUrl = nestedVideoUrl;

                // 鏇存柊褰撳墠URL鍙傛暟
                const url = new URL(window.location.href);
                if (!urlParams.has('position') && nestedPosition) {
                    url.searchParams.set('position', nestedPosition);
                }
                if (!urlParams.has('index') && nestedIndex) {
                    url.searchParams.set('index', nestedIndex);
                }
                if (!urlParams.has('title') && nestedTitle) {
                    url.searchParams.set('title', nestedTitle);
                }
                // 鏇挎崲褰撳墠URL
                window.history.replaceState({}, '', url);
            } else {
                showError('鍘嗗彶璁板綍閾炬帴鏃犳晥锛岃杩斿洖棣栭〉閲嶆柊璁块棶');
            }
        } catch (e) {
        }
    }

    // 淇濆瓨褰撳墠瑙嗛URL
    currentVideoUrl = videoUrl || '';

    // 浠巐ocalStorage鑾峰彇鏁版嵁
    currentVideoTitle = title || localStorage.getItem('currentVideoTitle') || '鏈煡瑙嗛';
    currentEpisodeIndex = index;

    // 璁剧疆鑷姩杩炴挱寮€鍏崇姸鎬?    autoplayEnabled = localStorage.getItem('autoplayEnabled') !== 'false'; // 榛樿涓簍rue
    document.getElementById('autoplayToggle').checked = autoplayEnabled;

    // 鑾峰彇骞垮憡杩囨护璁剧疆
    adFilteringEnabled = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false'; // 榛樿涓簍rue

    // 鐩戝惉鑷姩杩炴挱寮€鍏冲彉鍖?    document.getElementById('autoplayToggle').addEventListener('change', function (e) {
        autoplayEnabled = e.target.checked;
        localStorage.setItem('autoplayEnabled', autoplayEnabled);
    });

    // 浼樺厛浣跨敤URL浼犻€掔殑闆嗘暟淇℃伅锛屽惁鍒欎粠localStorage鑾峰彇
    try {
        if (episodesList) {
            // 濡傛灉URL涓湁闆嗘暟鏁版嵁锛屼紭鍏堜娇鐢ㄥ畠
            currentEpisodes = JSON.parse(decodeURIComponent(episodesList));

        } else {
            // 鍚﹀垯浠巐ocalStorage鑾峰彇
            currentEpisodes = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');

        }

        // 妫€鏌ラ泦鏁扮储寮曟槸鍚︽湁鏁堬紝濡傛灉鏃犳晥鍒欒皟鏁翠负0
        if (index < 0 || (currentEpisodes.length > 0 && index >= currentEpisodes.length)) {
            // 濡傛灉绱㈠紩澶ぇ锛屽垯浣跨敤鏈€澶ф湁鏁堢储寮?            if (index >= currentEpisodes.length && currentEpisodes.length > 0) {
                index = currentEpisodes.length - 1;
            } else {
                index = 0;
            }

            // 鏇存柊URL浠ュ弽鏄犱慨姝ｅ悗鐨勭储寮?            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('index', index);
            window.history.replaceState({}, '', newUrl);
        }

        // 鏇存柊褰撳墠绱㈠紩涓洪獙璇佽繃鐨勫€?        currentEpisodeIndex = index;

        episodesReversed = localStorage.getItem('episodesReversed') === 'true';
    } catch (e) {
        currentEpisodes = [];
        currentEpisodeIndex = 0;
        episodesReversed = false;
    }

    // 璁剧疆椤甸潰鏍囬
    document.title = currentVideoTitle + ' - FreeDY 鎾斁鍣?;
    document.getElementById('videoTitle').textContent = currentVideoTitle;

    // 鍒濆鍖栨挱鏀惧櫒
    if (videoUrl) {
        initPlayer(videoUrl);
    } else {
        showError('鏃犳晥鐨勮棰戦摼鎺?);
    }

    // 娓叉煋婧愪俊鎭苟鎭㈠璇ヨ祫婧愮珯鐨勭敾闈㈠噣鍖栬鍒?    renderResourceInfoBar();
    restoreVisualCleanModeForCurrentSource();

    // 鏇存柊闆嗘暟淇℃伅
    updateEpisodeInfo();

    // 娓叉煋闆嗘暟鍒楄〃
    renderEpisodes();

    // 鏇存柊鎸夐挳鐘舵€?    updateButtonStates();

    // 鏇存柊鎺掑簭鎸夐挳鐘舵€?    updateOrderButton();

    // 娣诲姞瀵硅繘搴︽潯鐨勭洃鍚紝纭繚鐐瑰嚮鍑嗙‘璺宠浆
    setTimeout(() => {
        setupProgressBarPreciseClicks();
    }, 1000);

    // 娣诲姞閿洏蹇嵎閿簨浠剁洃鍚?    document.addEventListener('keydown', handleKeyboardShortcuts);

    // 娣诲姞椤甸潰绂诲紑浜嬩欢鐩戝惉锛屼繚瀛樻挱鏀句綅缃苟閲婃斁鑷姩璇嗗埆璧勬簮
    window.addEventListener('beforeunload', saveCurrentProgress);
    window.addEventListener('pagehide', stopVisualCleanDetection, { once: true });

    // 椤甸潰闅愯棌鏃朵繚瀛橈紝骞跺仠姝㈠皻鏈畬鎴愮殑鎶芥牱锛涘洖鍒板墠鍙颁笉浼氭寔缁噸鍚垎鏋愩€?    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            saveCurrentProgress();
            stopVisualCleanDetection();
            closeVisualCleanConfirm();
        }
    });

    // 瑙嗛鏆傚仠鏃朵篃淇濆瓨
    const waitForVideo = setInterval(() => {
        if (art && art.video) {
            art.video.addEventListener('pause', saveCurrentProgress);

            // 鏂板锛氭挱鏀捐繘搴﹀彉鍖栨椂鑺傛祦淇濆瓨
            let lastSave = 0;
            art.video.addEventListener('timeupdate', function() {
                const now = Date.now();
                if (now - lastSave > 5000) { // 姣?绉掓渶澶氫繚瀛樹竴娆?                    saveCurrentProgress();
                    lastSave = now;
                }
            });

            clearInterval(waitForVideo);
        }
    }, 200);
}

function getPlayerTvControls() {
    return Array.from(document.querySelectorAll(
        '#goBack, #prevButton, #nextButton, #switchResourceBtn, #visualCleanButton, #episodeOrderButton, #episodesList button, #autoplayControl'
    )).filter(element => {
        if (element.disabled || element.closest('.hidden, [aria-hidden="true"]')) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });
}

function focusPlayerTvDefault() {
    const target = document.querySelector('#episodesList button.episode-active, #episodesList button, #goBack');
    if (!target) return;
    playerTvPreviousFocus = target;
    target.focus({ preventScroll: false });
}

function handlePlayerTvNavigation(event) {
    const directionMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const direction = directionMap[event.key];
    const active = document.activeElement;
    const isConfirm = event.key === 'Enter' || event.key === 'Select' || event.keyCode === 13 || event.keyCode === 23;
    const isBack = event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack'
        || event.keyCode === 27 || event.keyCode === 461 || event.keyCode === 10009;

    if (isBack) {
        if (playerTvNavigationMode) {
            event.preventDefault();
            playerTvNavigationMode = false;
            document.body.classList.remove('player-tv-navigation-active');
            if (playerTvPreviousFocus && document.contains(playerTvPreviousFocus)) playerTvPreviousFocus.focus();
            else focusPlayerTvDefault();
            return true;
        }
        return false;
    }

    if (direction && !playerTvNavigationMode) {
        playerTvNavigationMode = true;
        document.body.classList.add('player-tv-navigation-active');
        playerTvPreviousFocus = active;
        focusPlayerTvDefault();
        event.preventDefault();
        return true;
    }

    if (isConfirm && playerTvNavigationMode && active && active.matches('button, a, input[type="checkbox"], #autoplayControl')) {
        event.preventDefault();
        if (active.id === 'autoplayControl') {
            const toggle = document.getElementById('autoplayToggle');
            if (toggle) {
                toggle.checked = !toggle.checked;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
                active.setAttribute('aria-checked', toggle.checked ? 'true' : 'false');
            }
        } else {
            active.click();
        }
        return true;
    }

    if (!direction || !playerTvNavigationMode) return false;
    const controls = getPlayerTvControls();
    if (!controls.length) return false;
    const origin = active && active.getBoundingClientRect ? active.getBoundingClientRect() : null;
    if (!origin) return false;
    const center = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 };
    let target = null;
    let bestScore = Number.POSITIVE_INFINITY;
    controls.forEach(candidate => {
        if (candidate === active) return;
        const rect = candidate.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - center.x;
        const dy = rect.top + rect.height / 2 - center.y;
        const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
        if (primary <= 2) return;
        const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
        const score = primary + secondary * 2;
        if (score < bestScore) { bestScore = score; target = candidate; }
    });
    if (target) {
        event.preventDefault();
        event.stopImmediatePropagation();
        playerTvPreviousFocus = target;
        target.focus({ preventScroll: false });
        return true;
    }
    event.preventDefault();
    return true;
}

// 澶勭悊閿洏蹇嵎閿?function handleKeyboardShortcuts(e) {
    if (handlePlayerTvNavigation(e)) return;
    const visualEditor = document.getElementById('visualCleanEditorModal');
    if (visualEditor && !visualEditor.classList.contains('hidden')) {
        const focusables = Array.from(visualEditor.querySelectorAll('button'));
        const isBackKey = e.key === 'Escape' || e.key === 'BrowserBack'
            || e.keyCode === 27 || e.keyCode === 461 || e.keyCode === 10009;
        if (isBackKey) {
            e.preventDefault();
            closeVisualCleanEditor();
            return;
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            const activeIndex = Math.max(0, focusables.indexOf(document.activeElement));
            const columns = window.innerWidth <= 640 ? 1 : 2;
            const step = e.key === 'ArrowLeft' ? -1
                : e.key === 'ArrowRight' ? 1
                    : e.key === 'ArrowUp' ? -columns : columns;
            focusables[(activeIndex + step + focusables.length) % focusables.length]?.focus({ preventScroll: true });
            return;
        }
        const isConfirmKey = e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 23;
        if (isConfirmKey && focusables.includes(document.activeElement)) {
            e.preventDefault();
            document.activeElement.click();
        }
        return;
    }

    // 蹇界暐杈撳叆妗嗕腑鐨勬寜閿簨浠?    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Alt + 宸︾澶?= 涓婁竴闆?    if (e.altKey && e.key === 'ArrowLeft') {
        if (currentEpisodeIndex > 0) {
            playPreviousEpisode();
            showShortcutHint('涓婁竴闆?, 'left');
            e.preventDefault();
        }
    }

    // Alt + 鍙崇澶?= 涓嬩竴闆?    if (e.altKey && e.key === 'ArrowRight') {
        if (currentEpisodeIndex < currentEpisodes.length - 1) {
            playNextEpisode();
            showShortcutHint('涓嬩竴闆?, 'right');
            e.preventDefault();
        }
    }

    // 宸︾澶?= 蹇€€
    if (!e.altKey && e.key === 'ArrowLeft') {
        if (art && art.currentTime > 5) {
            art.currentTime -= 5;
            showShortcutHint('蹇€€', 'left');
            e.preventDefault();
        }
    }

    // 鍙崇澶?= 蹇繘
    if (!e.altKey && e.key === 'ArrowRight') {
        if (art && art.currentTime < art.duration - 5) {
            art.currentTime += 5;
            showShortcutHint('蹇繘', 'right');
            e.preventDefault();
        }
    }

    // 涓婄澶?= 闊抽噺+
    if (e.key === 'ArrowUp') {
        if (art && art.volume < 1) {
            art.volume += 0.1;
            showShortcutHint('闊抽噺+', 'up');
            e.preventDefault();
        }
    }

    // 涓嬬澶?= 闊抽噺-
    if (e.key === 'ArrowDown') {
        if (art && art.volume > 0) {
            art.volume -= 0.1;
            showShortcutHint('闊抽噺-', 'down');
            e.preventDefault();
        }
    }

    // 绌烘牸 = 鎾斁/鏆傚仠
    if (e.key === ' ') {
        if (art) {
            art.toggle();
            showShortcutHint('鎾斁/鏆傚仠', 'play');
            e.preventDefault();
        }
    }

    // f 閿?= 鍒囨崲鍏ㄥ睆
    if (e.key === 'f' || e.key === 'F') {
        if (art) {
            art.fullscreen = !art.fullscreen;
            showShortcutHint('鍒囨崲鍏ㄥ睆', 'fullscreen');
            e.preventDefault();
        }
    }

    // 鈹€鈹€ 閬ユ帶鍣ㄥ獟浣撻敭鏀寔 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    // NOTE: 鐩爣璁惧锛氬皬绫崇數瑙嗙洅 (Android TV)銆佸鏅數瑙?    // MediaPlayPause / keyCode 179
    if (e.key === 'MediaPlayPause' || e.keyCode === 179) {
        if (art) {
            art.toggle();
            showShortcutHint('鎾斁/鏆傚仠', 'play');
            e.preventDefault();
        }
    }

    // MediaPlay
    if (e.key === 'MediaPlay') {
        if (art && !art.playing) {
            art.play();
            showShortcutHint('鎾斁', 'play');
            e.preventDefault();
        }
    }

    // MediaPause
    if (e.key === 'MediaPause') {
        if (art && art.playing) {
            art.pause();
            showShortcutHint('鏆傚仠', 'play');
            e.preventDefault();
        }
    }

    // MediaStop / keyCode 178 鈫?鍋滄骞惰繑鍥?    if (e.key === 'MediaStop' || e.keyCode === 178) {
        if (art) {
            art.pause();
            showShortcutHint('宸插仠姝?, 'play');
            e.preventDefault();
        }
    }

    // MediaTrackNext / keyCode 176 鈫?涓嬩竴闆?    if (e.key === 'MediaTrackNext' || e.keyCode === 176) {
        if (currentEpisodeIndex < currentEpisodes.length - 1) {
            playNextEpisode();
            showShortcutHint('涓嬩竴闆?, 'right');
            e.preventDefault();
        }
    }

    // MediaTrackPrevious / keyCode 177 鈫?涓婁竴闆?    if (e.key === 'MediaTrackPrevious' || e.keyCode === 177) {
        if (currentEpisodeIndex > 0) {
            playPreviousEpisode();
            showShortcutHint('涓婁竴闆?, 'left');
            e.preventDefault();
        }
    }

    // ChannelUp / PageUp (keyCode 33) 鈫?涓嬩竴闆?    if (e.key === 'ChannelUp' || (!e.altKey && e.keyCode === 33)) {
        if (currentEpisodeIndex < currentEpisodes.length - 1) {
            playNextEpisode();
            showShortcutHint('涓嬩竴闆?, 'right');
            e.preventDefault();
        }
    }

    // ChannelDown / PageDown (keyCode 34) 鈫?涓婁竴闆?    if (e.key === 'ChannelDown' || (!e.altKey && e.keyCode === 34)) {
        if (currentEpisodeIndex > 0) {
            playPreviousEpisode();
            showShortcutHint('涓婁竴闆?, 'left');
            e.preventDefault();
        }
    }

    // 閬ユ帶鍣ㄥ僵鑹查敭锛圕olorF0Red=403 鎹㈡簮, ColorF1Green=404 鍑€鍖? ColorF2Yellow=405 鍊掑簭, ColorF3Blue=406 杩炴挱锛?    if (e.key === 'ColorF0Red' || e.keyCode === 403) {
        var switchBtn = document.getElementById('switchResourceBtn');
        if (switchBtn) { switchBtn.click(); e.preventDefault(); }
    }
    if (e.key === 'ColorF1Green' || e.keyCode === 404) {
        var cleanBtn = document.getElementById('visualCleanButton');
        if (cleanBtn) { cleanBtn.click(); e.preventDefault(); }
    }
    if (e.key === 'ColorF2Yellow' || e.keyCode === 405) {
        var orderBtn = document.getElementById('episodeOrderButton');
        if (orderBtn) { orderBtn.click(); e.preventDefault(); }
    }
    if (e.key === 'ColorF3Blue' || e.keyCode === 406) {
        var autoplayToggle = document.getElementById('autoplayToggle');
        if (autoplayToggle) {
            autoplayToggle.checked = !autoplayToggle.checked;
            autoplayToggle.dispatchEvent(new Event('change', { bubbles: true }));
            showShortcutHint(autoplayToggle.checked ? '鑷姩杩炴挱 寮€' : '鑷姩杩炴挱 鍏?, 'play');
            e.preventDefault();
        }
    }

    // 鈹€鈹€ 鏁板瓧閿洿鎺ヨ烦闆嗭紙甯?1.5s debounce 鍚堝苟澶氫綅鏁帮級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    var numKey = -1;
    if (e.key >= '0' && e.key <= '9') numKey = parseInt(e.key, 10);
    else if (e.keyCode >= 48 && e.keyCode <= 57) numKey = e.keyCode - 48;   // 涓婚敭鐩樻暟瀛?    else if (e.keyCode >= 96 && e.keyCode <= 105) numKey = e.keyCode - 96;  // 灏忛敭鐩樻暟瀛?
    if (numKey >= 0) {
        e.preventDefault();
        // NOTE: 浣跨敤 window._tvEpisodeDigitBuffer 鏆傚瓨澶氫綅鏁?        if (!window._tvEpisodeDigitBuffer) window._tvEpisodeDigitBuffer = '';
        window._tvEpisodeDigitBuffer += String(numKey);
        clearTimeout(window._tvEpisodeDigitTimer);
        window._tvEpisodeDigitTimer = setTimeout(function () {
            var targetNum = parseInt(window._tvEpisodeDigitBuffer, 10);
            window._tvEpisodeDigitBuffer = '';
            var targetIdx = targetNum - 1; // 闆嗘暟浠?1 寮€濮嬶紝绱㈠紩浠?0 寮€濮?            if (targetIdx >= 0 && targetIdx < currentEpisodes.length) {
                currentEpisodeIndex = targetIdx;
                var ep = currentEpisodes[targetIdx];
                if (ep) {
                    var src = typeof ep === 'string' ? ep : (ep.url || ep);
                    if (art) { art.url = src; art.play(); }
                    showShortcutHint('绗?' + targetNum + ' 闆?, 'play');
                    // 楂樹寒闆嗘暟鎸夐挳
                    var btns = document.querySelectorAll('#episodesList button');
                    btns.forEach(function (b, i) {
                        b.classList.toggle('episode-active', i === targetIdx);
                    });
                }
            }
        }, 1500);
    }
}


// 鏄剧ず蹇嵎閿彁绀?function showShortcutHint(text, direction) {
    const hintElement = document.getElementById('shortcutHint');
    const textElement = document.getElementById('shortcutText');
    const iconElement = document.getElementById('shortcutIcon');

    // 娓呴櫎涔嬪墠鐨勮秴鏃?    if (shortcutHintTimeout) {
        clearTimeout(shortcutHintTimeout);
    }

    // 璁剧疆鏂囨湰鍜屽浘鏍囨柟鍚?    textElement.textContent = text;

    if (direction === 'left') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>';
    } else if (direction === 'right') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>';
    }  else if (direction === 'up') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path>';
    } else if (direction === 'down') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>';
    } else if (direction === 'fullscreen') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>';
    } else if (direction === 'play') {
        iconElement.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"></path>';
    }

    // 鏄剧ず鎻愮ず
    hintElement.classList.add('show');

    // 涓ょ鍚庨殣钘?    shortcutHintTimeout = setTimeout(() => {
        hintElement.classList.remove('show');
    }, 2000);
}

// 鍒濆鍖栨挱鏀惧櫒
function initPlayer(videoUrl) {
    if (!videoUrl) {
        return
    }

    // 閿€姣佹棫瀹炰緥
    stopVisualCleanDetection();
    closeVisualCleanConfirm();
    visualCleanDetectionAttemptKey = '';
    if (art) {
        art.destroy();
        art = null;
    }

    // 閰嶇疆HLS.js閫夐」
    const hlsConfig = {
        debug: false,
        loader: adFilteringEnabled ? CustomHlsJsLoader : Hls.DefaultConfig.loader,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6,
        fragLoadingMaxRetryTimeout: 64000,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        levelLoadingMaxRetry: 4,
        levelLoadingRetryDelay: 1000,
        startLevel: -1,
        abrEwmaDefaultEstimate: 500000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: 0.7,
        abrMaxWithRealBitrate: true,
        stretchShortVideoTrack: true,
        appendErrorMaxRetry: 5,  // 澧炲姞灏濊瘯娆℃暟
        liveSyncDurationCount: 3,
        liveDurationInfinity: false
    };

    // Create new ArtPlayer instance
    art = new Artplayer({
        container: '#player',
        url: videoUrl,
        type: 'm3u8',
        title: videoTitle,
        volume: 0.8,
        isLive: false,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: true,
        screenshot: true,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: false,
        airplay: true,
        hotkey: false,
        theme: '#23ade5',
        lang: navigator.language.toLowerCase(),
        moreVideoAttr: {
            crossOrigin: 'anonymous',
        },
        customType: {
            m3u8: function (video, url) {
                // 娓呯悊涔嬪墠鐨凥LS瀹炰緥
                if (currentHls && currentHls.destroy) {
                    try {
                        currentHls.destroy();
                    } catch (e) {
                    }
                }

                // 鍒涘缓鏂扮殑HLS瀹炰緥
                const hls = new Hls(hlsConfig);
                currentHls = hls;

                // 璺熻釜鏄惁宸茬粡鏄剧ず閿欒
                let errorDisplayed = false;
                // 璺熻釜鏄惁鏈夐敊璇彂鐢?                let errorCount = 0;
                // 璺熻釜瑙嗛鏄惁寮€濮嬫挱鏀?                let playbackStarted = false;
                // 璺熻釜瑙嗛鏄惁鍑虹幇bufferAppendError
                let bufferAppendErrorCount = 0;

                // 鐩戝惉瑙嗛鎾斁浜嬩欢
                video.addEventListener('playing', function () {
                    playbackStarted = true;
                    document.getElementById('player-loading').style.display = 'none';
                    document.getElementById('error').style.display = 'none';
                });

                // 鐩戝惉瑙嗛杩涘害浜嬩欢
                video.addEventListener('timeupdate', function () {
                    if (video.currentTime > 1) {
                        // 瑙嗛杩涘害瓒呰繃1绉掞紝闅愯棌閿欒锛堝鏋滃瓨鍦級
                        document.getElementById('error').style.display = 'none';
                    }
                });

                hls.loadSource(url);
                hls.attachMedia(video);

                // enable airplay, from https://github.com/video-dev/hls.js/issues/5989
                // 妫€鏌ユ槸鍚﹀凡瀛樺湪source鍏冪礌锛屽鏋滃瓨鍦ㄥ垯鏇存柊锛屼笉瀛樺湪鍒欏垱寤?                let sourceElement = video.querySelector('source');
                if (sourceElement) {
                    // 鏇存柊鐜版湁source鍏冪礌鐨刄RL
                    sourceElement.src = url;
                } else {
                    // 鍒涘缓鏂扮殑source鍏冪礌
                    sourceElement = document.createElement('source');
                    sourceElement.src = url;
                    video.appendChild(sourceElement);
                }
                video.disableRemotePlayback = false;

                hls.on(Hls.Events.MANIFEST_PARSED, function () {
                    video.play().catch(e => {
                    });
                });

                hls.on(Hls.Events.ERROR, function (event, data) {
                    // 澧炲姞閿欒璁℃暟
                    errorCount++;

                    // 澶勭悊bufferAppendError
                    if (data.details === 'bufferAppendError') {
                        bufferAppendErrorCount++;
                        // 濡傛灉瑙嗛宸茬粡寮€濮嬫挱鏀撅紝鍒欏拷鐣ヨ繖涓敊璇?                        if (playbackStarted) {
                            return;
                        }

                        // 濡傛灉鍑虹幇澶氭bufferAppendError浣嗚棰戞湭鎾斁锛屽皾璇曟仮澶?                        if (bufferAppendErrorCount >= 3) {
                            hls.recoverMediaError();
                        }
                    }

                    // 濡傛灉鏄嚧鍛介敊璇紝涓旇棰戞湭鎾斁
                    if (data.fatal && !playbackStarted) {
                        // 灏濊瘯鎭㈠閿欒
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls.recoverMediaError();
                                break;
                            default:
                                // 浠呭湪澶氭鎭㈠灏濊瘯鍚庢樉绀洪敊璇?                                if (errorCount > 3 && !errorDisplayed) {
                                    errorDisplayed = true;
                                    showError('瑙嗛鍔犺浇澶辫触锛屽彲鑳芥槸鏍煎紡涓嶅吋瀹规垨婧愪笉鍙敤');
                                }
                                break;
                        }
                    }
                });

                // 鐩戝惉鍒嗘鍔犺浇浜嬩欢
                hls.on(Hls.Events.FRAG_LOADED, function () {
                    document.getElementById('player-loading').style.display = 'none';
                });

                // 鐩戝惉绾у埆鍔犺浇浜嬩欢
                hls.on(Hls.Events.LEVEL_LOADED, function () {
                    document.getElementById('player-loading').style.display = 'none';
                });
            }
        }
    });

    // artplayer 娌℃湁 'fullscreenWeb:enter', 'fullscreenWeb:exit' 绛変簨浠?    // 鎵€浠ュ師鎺у埗鏍忛殣钘忎唬鐮佸苟娌℃湁璧蜂綔鐢?    // 瀹為檯璧蜂綔鐢ㄧ殑鏄?artplayer 榛樿琛屼负锛屽畠鏀寔鑷姩闅愯棌宸ュ叿鏍?    // 浣嗘湁涓€涓?bug锛?鍦ㄥ壇灞忓叏灞忔椂锛岄紶鏍囩Щ鍑哄壇灞忓悗涓嶄細鑷姩闅愯棌宸ュ叿鏍?    // 涓嬮潰杩涗竴骞堕噸鏋勫拰淇锛?    let hideTimer;

    // 闅愯棌鎺у埗鏍?    function hideControls() {
        if (art && art.controls) {
            art.controls.show = false;
        }
    }

    // 閲嶇疆璁℃椂鍣紝璁℃椂鍣ㄨ秴鏃舵椂闂翠笌 artplayer 淇濇寔涓€鑷?    function resetHideTimer() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            hideControls();
        }, Artplayer.CONTROL_HIDE_TIME);
    }

    // 澶勭悊榧犳爣绂诲紑娴忚鍣ㄧ獥鍙?    function handleMouseOut(e) {
        if (e && !e.relatedTarget) {
            resetHideTimer();
        }
    }

    // 鍏ㄥ睆鐘舵€佸垏鎹㈡椂娉ㄥ唽/绉婚櫎 mouseout 浜嬩欢锛岀洃鍚紶鏍囩Щ鍑哄睆骞曚簨浠?    // 浠庤€屽鎾斁鍣ㄧ姸鎬佹爮杩涜闅愯棌鍊掕鏃?    function handleFullScreen(isFullScreen, isWeb) {
        if (isFullScreen) {
            document.addEventListener('mouseout', handleMouseOut);
        } else {
            document.removeEventListener('mouseout', handleMouseOut);
            // 閫€鍑哄叏灞忔椂娓呯悊璁℃椂鍣?            clearTimeout(hideTimer);
        }

        if (!isWeb) {
            if (window.screen.orientation && window.screen.orientation.lock) {
                window.screen.orientation.lock('landscape')
                    .then(() => {
                    })
                    .catch((error) => {
                    });
            }
        }
    }

    // 鎾斁鍣ㄥ姞杞藉畬鎴愬悗鍒濆闅愯棌宸ュ叿鏍?    art.on('ready', () => {
        hideControls();
    });

    // 鍏ㄥ睆 Web 妯″紡澶勭悊
    art.on('fullscreenWeb', function (isFullScreen) {
        handleFullScreen(isFullScreen, true);
    });

    // 鍏ㄥ睆妯″紡澶勭悊
    art.on('fullscreen', function (isFullScreen) {
        handleFullScreen(isFullScreen, false);
    });

    art.on('video:loadedmetadata', function() {
        document.getElementById('player-loading').style.display = 'none';
        videoHasEnded = false; // 瑙嗛鍔犺浇鏃堕噸缃粨鏉熸爣蹇?        // 浼樺厛浣跨敤URL浼犻€掔殑position鍙傛暟
        const urlParams = new URLSearchParams(window.location.search);
        const savedPosition = parseInt(urlParams.get('position') || '0');

        if (savedPosition > 10 && savedPosition < art.duration - 2) {
            // 濡傛灉URL涓湁鏈夋晥鐨勬挱鏀句綅缃弬鏁帮紝鐩存帴浣跨敤瀹?            art.currentTime = savedPosition;
            showPositionRestoreHint(savedPosition);
        } else {
            // 鍚﹀垯灏濊瘯浠庢湰鍦板瓨鍌ㄦ仮澶嶆挱鏀捐繘搴?            try {
                const progressKey = 'videoProgress_' + getVideoId();
                const progressStr = localStorage.getItem(progressKey);
                if (progressStr && art.duration > 0) {
                    const progress = JSON.parse(progressStr);
                    if (
                        progress &&
                        typeof progress.position === 'number' &&
                        progress.position > 10 &&
                        progress.position < art.duration - 2
                    ) {
                        art.currentTime = progress.position;
                        showPositionRestoreHint(progress.position);
                    }
                }
            } catch (e) {
            }
        }

        // 璁剧疆杩涘害鏉＄偣鍑荤洃鍚?        setupProgressBarPreciseClicks();

        // 瑙嗛鍔犺浇鎴愬姛鍚庯紝鍦ㄧ◢寰欢杩熷悗灏嗗叾娣诲姞鍒拌鐪嬪巻鍙?        setTimeout(saveToHistory, 3000);

        // 鍚姩瀹氭湡淇濆瓨鎾斁杩涘害
        startProgressSaveInterval();
    })

    // 閿欒澶勭悊
    art.on('video:error', function (error) {
        // 濡傛灉姝ｅ湪鍒囨崲瑙嗛锛屽拷鐣ラ敊璇?        if (window.isSwitchingVideo) {
            return;
        }

        // 闅愯棌鎵€鏈夊姞杞芥寚绀哄櫒
        const loadingElements = document.querySelectorAll('#player-loading, .player-loading-container');
        loadingElements.forEach(el => {
            if (el) el.style.display = 'none';
        });

        showError('瑙嗛鎾斁澶辫触: ' + (error.message || '鏈煡閿欒'));
    });

    // 娣诲姞绉诲姩绔暱鎸変笁鍊嶉€熸挱鏀惧姛鑳?    setupLongPressSpeedControl();

    // 瑙嗛鎾斁缁撴潫浜嬩欢
    art.on('video:ended', function () {
        videoHasEnded = true;

        clearVideoProgress();

        // 濡傛灉鑷姩鎾斁涓嬩竴闆嗗紑鍚紝涓旂‘瀹炴湁涓嬩竴闆?        if (autoplayEnabled && currentEpisodeIndex < currentEpisodes.length - 1) {
            // 绋嶉暱寤惰繜浠ョ‘淇濇墍鏈変簨浠跺鐞嗗畬鎴?            setTimeout(() => {
                // 纭涓嶆槸鍥犱负鐢ㄦ埛鎷栨嫿瀵艰嚧鐨勫亣缁撴潫浜嬩欢
                playNextEpisode();
                videoHasEnded = false; // 閲嶇疆鏍囧織
            }, 1000);
        } else {
            art.fullscreen = false;
        }
    });

    // 娣诲姞鍙屽嚮鍏ㄥ睆鏀寔
    art.on('video:playing', () => {
        // 缁戝畾鍙屽嚮浜嬩欢鍒拌棰戝鍣?        if (art.video && !art.video.dataset.freeDyDoubleClickBound) {
            art.video.dataset.freeDyDoubleClickBound = 'true';
            art.video.addEventListener('dblclick', () => {
                art.fullscreen = !art.fullscreen;
                art.play();
            });
        }
        // 鐢婚潰鍑€鍖栦笉鍐嶈嚜鍔ㄦ娊鏍峰脊绐楋紱鐢ㄦ埛鍙€氳繃宸ュ叿鏍忎富鍔ㄩ€夋嫨閬僵鎴栬鍒囨ā寮忋€?    });

    // 10绉掑悗濡傛灉浠嶅湪鍔犺浇锛屼絾涓嶇珛鍗虫樉绀洪敊璇?    setTimeout(function () {
        // 濡傛灉瑙嗛宸茬粡鎾斁寮€濮嬶紝鍒欎笉鏄剧ず閿欒
        if (art && art.video && art.video.currentTime > 0) {
            return;
        }

        const loadingElement = document.getElementById('player-loading');
        if (loadingElement && loadingElement.style.display !== 'none') {
            loadingElement.innerHTML = `
                <div class="loading-spinner"></div>
                <div>瑙嗛鍔犺浇鏃堕棿杈冮暱锛岃鑰愬績绛夊緟...</div>
                <div style="font-size: 12px; color: #aaa; margin-top: 10px;">濡傞暱鏃堕棿鏃犲搷搴旓紝璇峰皾璇曞叾浠栬棰戞簮</div>
            `;
        }
    }, 10000);
}

// 鑷畾涔?M3U8 Loader锛氬彧鍦ㄥ獟浣撴挱鏀炬竻鍗曢樁娈垫墽琛屽箍鍛婅繃婊わ紝涓绘竻鍗曞拰绾胯矾淇℃伅淇濇寔鍘熸牱銆?class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config) {
        super(config);
        const load = this.load.bind(this);
        this.load = function (context, config, callbacks) {
            if (context.type === 'manifest' || context.type === 'level') {
                const onSuccess = callbacks.onSuccess;
                callbacks.onSuccess = function (response, stats, context) {
                    if (response.data && typeof response.data === 'string') {
                        response.data = filterAdsFromM3U8(response.data, {
                            sourceKey: getCurrentSourceCode()
                        });
                    }
                    return onSuccess(response, stats, context);
                };
            }
            load(context, config, callbacks);
        };
    }
}

const HLS_AD_MARKER_PATTERN = /(?:^|[\/_\-.])(ad|ads|advert|advertise|advertisement|commercial|promo|preroll|midroll|postroll)(?:[\/_\-.]|$)/i;
const HLS_AD_CLASS_PATTERN = /CLASS=["']?(?:com\.)?(?:apple\.hls\.)?(?:interstitial|ad|ads|advertisement)/i;
const HLS_SOURCE_FILTER_PROFILES = {
    // ikun 浼氬湪姝ｇ墖涓彃鍏ヤ竴娈垫潵鑷笉鍚岀洰褰曠殑鐭墖娈靛潡锛屽墠鍚庣敤 DISCONTINUITY 鍒嗛殧锛屼笖璇ュ潡鍦ㄥ悓涓€娓呭崟涓細閲嶅鍑虹幇銆?    // 鍙垹闄ゆ弧瓒斥€滃紓鐩綍 + 閲嶅鍑虹幇 + 鐭潡 + 浣嶄簬鏃堕棿杞磋竟鐣屼箣闂粹€濈殑鍧楋紝涓嶆寜鍗曚釜鐭椂闀跨寽骞垮憡銆?    // 鍚屾椂淇濈暀鍘熺増鐨勬柇鐐瑰吋瀹硅涓猴細鍙Щ闄ゆ爣璁帮紝涓嶅垹闄や换浣曞獟浣撳垎鐗囥€?    ikun: {
        removeRepeatedForeignDiscontinuityBlocks: true,
        stripDiscontinuityMarkers: true,
        maxSegments: 8,
        maxDuration: 30
    },
    // 鏆撮璧勬簮鍦ㄥ涓湡瀹炴牱渚嬩腑鍥哄畾浣跨敤 /video/adjump/time/ 瀛樻斁 9 涓€佺害 26 绉掔殑鎻掓挱鍒嗙墖銆?    // 鏂偣鏍囪涔熸寜鍘熺増鍏煎鏂瑰紡绉婚櫎锛岄伩鍏嶆挱鏀惧櫒鎶婃彃鎾綋鎴愮嫭绔嬫椂闂磋酱娈佃惤銆?    bfzy: {
        explicitAdPathPatterns: [/\/video\/adjump\/time\//i],
        stripDiscontinuityMarkers: true
    },
    // 360璧勬簮鍦ㄥ涓湡瀹炴牱渚嬩腑鍥哄畾鎻掑叆鍚屼竴鐩綍鐨?4 鍒嗙墖銆佺害 17.57 绉掑箍鍛婂潡銆?    zy360: {
        explicitAdPathPatterns: [/\/20260726\/1AS9nSvi\/hls\//i],
        stripDiscontinuityMarkers: true
    },
    // 濡傛剰濯掍綋娓呭崟鐨勫垎鐗?URI 鏄函缂栧彿锛屽箍鍛婁笉浼氬甫 ad/ads 璺緞鏍囪瘑锛涘厛杩佺Щ鍘熺増鏂偣鍏煎锛屼笉鑳芥寜鐭椂闀跨寽娴嬪垎鐗囥€?    ruyi: {
        stripDiscontinuityMarkers: true
    },
    // 鍘熺郴缁熷绾㈢墰璧勬簮鐨勬湁鏁堝吋瀹规柟寮忥細鍙Щ闄ゆ椂闂磋酱鏂偣鏍囪锛屼笉鍒犻櫎鏂偣鍓嶅悗鐨勪换浣曞獟浣撳垎鐗囥€?    hongniu2: {
        stripDiscontinuityMarkers: true
    },
    hongniu3: {
        stripDiscontinuityMarkers: true
    }
};

function getHlsSourceFilterProfile(sourceKey) {
    return HLS_SOURCE_FILTER_PROFILES[String(sourceKey || '').toLowerCase()] || null;
}

function getHlsSegmentDirectory(uri) {
    if (!uri || uri.startsWith('#')) return '';
    try {
        const parsed = new URL(uri, window.location.href);
        const pathname = parsed.pathname.replace(/\/+/g, '/');
        return pathname.slice(0, pathname.lastIndexOf('/'));
    } catch (error) {
        const pathname = String(uri).split('?')[0].replace(/\/+/g, '/');
        return pathname.slice(0, pathname.lastIndexOf('/'));
    }
}

function removeRepeatedForeignDiscontinuityBlocks(sourceLines, sourceKey) {
    const profile = getHlsSourceFilterProfile(sourceKey);
    const shouldDetect = profile?.removeRepeatedForeignDiscontinuityBlocks !== false;
    if (!shouldDetect) return sourceLines;
    const maxSegments = Number(profile?.maxSegments) || 8;
    const maxDuration = Number(profile?.maxDuration) || 30;

    const discontinuityIndexes = [];
    sourceLines.forEach((line, index) => {
        if (/^\s*#EXT-X-DISCONTINUITY\s*$/i.test(line)) discontinuityIndexes.push(index);
    });
    if (discontinuityIndexes.length < 2) return sourceLines;

    const blocks = [];
    for (let index = 0; index < discontinuityIndexes.length - 1; index++) {
        const start = discontinuityIndexes[index];
        const end = discontinuityIndexes[index + 1];
        const segments = [];
        for (let lineIndex = start + 1; lineIndex < end; lineIndex++) {
            const trimmed = sourceLines[lineIndex].trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const previous = sourceLines[lineIndex - 1]?.trim() || '';
            if (/^#EXTINF:/i.test(previous)) {
                segments.push({
                    uri: trimmed,
                    uriIndex: lineIndex,
                    duration: Number((previous.match(/^#EXTINF:([0-9.]+)/i) || [])[1] || 0)
                });
            }
        }
        if (!segments.length) continue;
        const directories = new Map();
        segments.forEach(segment => {
            const directory = getHlsSegmentDirectory(segment.uri);
            directories.set(directory, (directories.get(directory) || 0) + 1);
        });
        const [directory, count] = Array.from(directories.entries()).sort((a, b) => b[1] - a[1])[0] || [];
        const duration = segments.reduce((sum, segment) => sum + segment.duration, 0);
        blocks.push({ start, end, segments, directory, count, duration });
    }

    const directoryBlockCounts = new Map();
    const directorySegmentCounts = new Map();
    sourceLines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const directory = getHlsSegmentDirectory(trimmed);
        if (directory) directorySegmentCounts.set(directory, (directorySegmentCounts.get(directory) || 0) + 1);
    });
    blocks.forEach(block => {
        if (block.count === block.segments.length && block.directory) {
            directoryBlockCounts.set(block.directory, (directoryBlockCounts.get(block.directory) || 0) + 1);
        }
    });
    const mainDirectory = Array.from(directorySegmentCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const removeRanges = [];
    blocks.forEach(block => {
        const isShort = block.segments.length <= maxSegments && block.duration <= maxDuration;
        const isSingleDirectory = block.count === block.segments.length && Boolean(block.directory);
        const isRepeated = isSingleDirectory && (directoryBlockCounts.get(block.directory) || 0) >= 2;
        const isForeignDirectory = Boolean(mainDirectory) && block.directory !== mainDirectory;
        if (!isShort || !isRepeated || !isForeignDirectory) return;
        removeRanges.push([block.start, block.end]);
    });

    if (!removeRanges.length) return sourceLines;
    const removedLines = new Set();
    removeRanges.forEach(([start, end]) => {
        for (let index = start; index < end; index++) removedLines.add(index);
    });
    console.info(`HLS ${sourceKey || 'unknown'} 閫氱敤妫€娴嬶細绉婚櫎 ${removeRanges.length} 涓噸澶嶅紓鐩綍鐭彃鎾潡`);
    return sourceLines.filter((_, index) => !removedLines.has(index));
}

function isExplicitHlsAdMarker(line) {
    const normalized = String(line || '').trim();
    if (!normalized) return false;
    return HLS_AD_CLASS_PATTERN.test(normalized)
        || /^#EXT-X-CUE-OUT(?::|$)/i.test(normalized)
        || /^#EXT-OATCLS-SCTE35:/i.test(normalized)
        || /^#EXT-X-ASSET:/i.test(normalized);
}

function isExplicitHlsAdUri(uri, sourceKey) {
    if (!uri || uri.startsWith('#')) return false;
    const profile = getHlsSourceFilterProfile(sourceKey);
    const profilePatterns = Array.isArray(profile?.explicitAdPathPatterns) ? profile.explicitAdPathPatterns : [];
    try {
        const parsed = new URL(uri, window.location.href);
        return HLS_AD_MARKER_PATTERN.test(parsed.pathname)
            || profilePatterns.some(pattern => pattern.test(parsed.pathname))
            || Array.from(parsed.searchParams.keys()).some(key => /^(?:ad|ads|advert|commercial)$/i.test(key));
    } catch (error) {
        const pathname = uri.split('?')[0];
        return HLS_AD_MARKER_PATTERN.test(pathname)
            || profilePatterns.some(pattern => pattern.test(pathname));
    }
}

function isHlsAdBreakEnd(line) {
    const normalized = String(line || '').trim();
    return /^#EXT-X-CUE-IN(?::|$)/i.test(normalized)
        || (/^#EXT-X-DATERANGE:/i.test(normalized) && /END-DATE=/i.test(normalized));
}

// 瀹夊叏鍒嗙墖杩囨护锛氫粎鍒犻櫎鍏锋湁鏄庣‘骞垮憡淇″彿鐨勫獟浣撳垎鐗囥€?// 榛樿涓嶆寜鏃堕暱鐚滄祴锛屼篃涓嶅垹闄ょ粨鏋勬爣绛撅紱绾㈢墰 profile 浠呭吋瀹规€хЩ闄?DISCONTINUITY 鏍囪锛岀粷涓嶅垹闄ょ浉閭诲垎鐗囥€?function filterAdsFromM3U8(m3u8Content, options = {}) {
    if (typeof m3u8Content !== 'string' || !m3u8Content.includes('#EXTM3U')) {
        return typeof m3u8Content === 'string' ? m3u8Content : '';
    }

    const sourceKey = options.sourceKey || getCurrentSourceCode();
    const profile = getHlsSourceFilterProfile(sourceKey);
    let removedDiscontinuityMarkers = 0;
    // 鍏堜緷鎹柇鐐硅瘑鍒噸澶嶅紓鐩綍骞垮憡鍧楋紝鍐嶆寜鏉ユ簮闇€瑕佺Щ闄ゆ柇鐐规爣璁帮紱鍚﹀垯鍏堝垹鏂偣浼氫涪澶卞箍鍛婅竟鐣岃瘉鎹€?    let sourceLines = m3u8Content.split(/\r?\n/);
    sourceLines = removeRepeatedForeignDiscontinuityBlocks(sourceLines, sourceKey);
    if (profile?.stripDiscontinuityMarkers) {
        sourceLines = sourceLines.filter(line => {
            const isDiscontinuity = /^\s*#EXT-X-DISCONTINUITY\s*$/i.test(line);
            if (isDiscontinuity) removedDiscontinuityMarkers++;
            return !isDiscontinuity;
        });
    }
    const output = [];
    let pendingSegmentTags = [];
    let insideExplicitAdBreak = false;
    let removedSegments = 0;

    const flushPending = () => {
        if (pendingSegmentTags.length) {
            output.push(...pendingSegmentTags);
            pendingSegmentTags = [];
        }
    };

    sourceLines.forEach((line, lineIndex) => {
        const trimmed = line.trim();

        if (isExplicitHlsAdMarker(trimmed)) {
            // 鍙湁鑳芥壘鍒版槑纭粨鏉熸爣璁版椂鎵嶈繘鍏ュ箍鍛婃锛岄槻姝㈡畫缂?CUE-OUT 璇垹鍚庣画鍏ㄩ儴姝ｇ墖銆?            const hasMatchingEnd = sourceLines
                .slice(lineIndex + 1)
                .some(candidate => isHlsAdBreakEnd(candidate));
            if (hasMatchingEnd && (/^#EXT-X-CUE-OUT(?::|$)/i.test(trimmed) || /^#EXT-OATCLS-SCTE35:/i.test(trimmed))) {
                insideExplicitAdBreak = true;
                pendingSegmentTags = [];
            } else {
                output.push(line);
            }
            return;
        }

        if (isHlsAdBreakEnd(trimmed)) {
            insideExplicitAdBreak = false;
            pendingSegmentTags = [];
            return;
        }

        if (/^#EXTINF:/i.test(trimmed) || /^#EXT-X-BYTERANGE:/i.test(trimmed) || /^#EXT-X-PROGRAM-DATE-TIME:/i.test(trimmed)) {
            pendingSegmentTags.push(line);
            return;
        }

        if (trimmed && !trimmed.startsWith('#')) {
            const removeSegment = insideExplicitAdBreak || isExplicitHlsAdUri(trimmed, sourceKey);
            if (removeSegment) {
                removedSegments++;
                pendingSegmentTags = [];
                return;
            }
            flushPending();
            output.push(line);
            return;
        }

        // 缁撴瀯鎬ф爣绛惧缁堜繚鐣欍€備粎鍦ㄥ箍鍛婃鍐呭拷鐣ュ垎鐗囩骇鍏冩暟鎹€?        if (!insideExplicitAdBreak || /^#EXT-X-DISCONTINUITY/i.test(trimmed)) {
            flushPending();
            output.push(line);
        }
    });

    flushPending();
    if (removedSegments > 0) {
        console.info(`HLS 鍒嗙墖骞垮憡杩囨护锛氱Щ闄?${removedSegments} 涓槑纭箍鍛婂垎鐗嘸);
    }
    if (removedDiscontinuityMarkers > 0) {
        console.info(`HLS ${sourceKey} 鍏煎杩囨护锛氱Щ闄?${removedDiscontinuityMarkers} 涓椂闂磋酱鏂偣鏍囪锛屽獟浣撳垎鐗囦繚鎸佷笉鍙榒);
    }
    return output.join('\n');
}


// 鏄剧ず閿欒
function showError(message) {
    // 鍦ㄨ棰戝凡缁忔挱鏀剧殑鎯呭喌涓嬩笉鏄剧ず閿欒
    if (art && art.video && art.video.currentTime > 1) {
        return;
    }
    const loadingEl = document.getElementById('player-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const errorEl = document.getElementById('error');
    if (errorEl) errorEl.style.display = 'flex';
    const errorMsgEl = document.getElementById('error-message');
    if (errorMsgEl) errorMsgEl.textContent = message;
}

// 鏇存柊闆嗘暟淇℃伅
function updateEpisodeInfo() {
    if (currentEpisodes.length > 0) {
        document.getElementById('episodeInfo').textContent = `绗?${currentEpisodeIndex + 1}/${currentEpisodes.length} 闆哷;
    } else {
        document.getElementById('episodeInfo').textContent = '鏃犻泦鏁颁俊鎭?;
    }
}

// 鏇存柊鎸夐挳鐘舵€?function updateButtonStates() {
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');

    // 澶勭悊涓婁竴闆嗘寜閽?    if (currentEpisodeIndex > 0) {
        prevButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        prevButton.removeAttribute('disabled');
    } else {
        prevButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        prevButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        prevButton.setAttribute('disabled', '');
    }

    // 澶勭悊涓嬩竴闆嗘寜閽?    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        nextButton.classList.remove('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.add('bg-[#222]', 'hover:bg-[#333]');
        nextButton.removeAttribute('disabled');
    } else {
        nextButton.classList.add('bg-gray-700', 'cursor-not-allowed');
        nextButton.classList.remove('bg-[#222]', 'hover:bg-[#333]');
        nextButton.setAttribute('disabled', '');
    }
}

// 娓叉煋闆嗘暟鎸夐挳
function renderEpisodes() {
    const episodesList = document.getElementById('episodesList');
    if (!episodesList) return;

    if (!currentEpisodes || currentEpisodes.length === 0) {
        episodesList.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">娌℃湁鍙敤鐨勯泦鏁?/div>';
        return;
    }

    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    let html = '';

    episodes.forEach((episode, index) => {
        // 鏍规嵁鍊掑簭鐘舵€佽绠楃湡瀹炵殑鍓ч泦绱㈠紩
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        const isActive = realIndex === currentEpisodeIndex;

        html += `
            <button id="episode-${realIndex}" type="button"
                    data-episode-index="${realIndex}" aria-label="鎾斁绗?${realIndex + 1} 闆?
                    onclick="playEpisode(${realIndex})"
                    class="px-4 py-2 ${isActive ? 'episode-active' : '!bg-[#222] hover:!bg-[#333] hover:!shadow-none'} !border ${isActive ? '!border-blue-500' : '!border-[#333]'} rounded-lg transition-colors text-center episode-btn">
                <span class="episode-btn-prefix">绗?/span><strong>${realIndex + 1}</strong><span class="episode-btn-suffix">闆?/span>
            </button>
        `;
    });

    episodesList.innerHTML = html;
}

// 鎾斁鎸囧畾闆嗘暟
function playEpisode(index) {
    // 纭繚index鍦ㄦ湁鏁堣寖鍥村唴
    if (index < 0 || index >= currentEpisodes.length) {
        return;
    }

    // 淇濆瓨褰撳墠鎾斁杩涘害锛堝鏋滄鍦ㄦ挱鏀撅級
    if (art && art.video && !art.video.paused && !videoHasEnded) {
        saveCurrentProgress();
    }

    // 娓呴櫎杩涘害淇濆瓨璁℃椂鍣?    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
        progressSaveInterval = null;
    }

    // 棣栧厛闅愯棌涔嬪墠鍙兘鏄剧ず鐨勯敊璇?    document.getElementById('error').style.display = 'none';
    // 鏄剧ず鍔犺浇鎸囩ず鍣?    document.getElementById('player-loading').style.display = 'flex';
    document.getElementById('player-loading').innerHTML = `
        <div class="loading-spinner"></div>
        <div>姝ｅ湪鍔犺浇瑙嗛...</div>
    `;

    // 鑾峰彇 sourceCode
    const urlParams2 = new URLSearchParams(window.location.search);
    const sourceCode = getCurrentSourceCode(urlParams2);

    // 鍑嗗鍒囨崲鍓ч泦鐨刄RL
    const url = currentEpisodes[index];

    // 鏇存柊褰撳墠鍓ч泦绱㈠紩
    currentEpisodeIndex = index;
    currentVideoUrl = url;
    videoHasEnded = false; // 閲嶇疆瑙嗛缁撴潫鏍囧織

    clearVideoProgress();

    // 鏇存柊URL鍙傛暟锛堜笉鍒锋柊椤甸潰锛?    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('index', index);
    currentUrl.searchParams.set('url', url);
    currentUrl.searchParams.delete('position');
    window.history.replaceState({}, '', currentUrl.toString());

    if (isWebkit) {
        initPlayer(url);
    } else {
        art.switch = url;
    }

    // 鏇存柊UI
    updateEpisodeInfo();
    updateButtonStates();
    renderEpisodes();

    // 閲嶇疆鐢ㄦ埛鐐瑰嚮浣嶇疆璁板綍
    userClickedPosition = null;

    // 涓夌鍚庝繚瀛樺埌鍘嗗彶璁板綍
    setTimeout(() => saveToHistory(), 3000);
}

// 鎾斁涓婁竴闆?function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        playEpisode(currentEpisodeIndex - 1);
    }
}

// 鎾斁涓嬩竴闆?function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
    }
}

// 澶嶅埗鎾斁閾炬帴
function copyLinks() {
    // 灏濊瘯浠嶶RL涓幏鍙栧弬鏁?    const urlParams = new URLSearchParams(window.location.search);
    const linkUrl = urlParams.get('url') || '';
    if (linkUrl !== '') {
        navigator.clipboard.writeText(linkUrl).then(() => {
            showToast('鎾斁閾炬帴宸插鍒?, 'success');
        }).catch(err => {
            showToast('澶嶅埗澶辫触锛岃妫€鏌ユ祻瑙堝櫒鏉冮檺', 'error');
        });
    }
}

// 鍒囨崲闆嗘暟鎺掑簭
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;

    // 淇濆瓨鍒發ocalStorage
    localStorage.setItem('episodesReversed', episodesReversed);

    // 閲嶆柊娓叉煋闆嗘暟鍒楄〃
    renderEpisodes();

    // 鏇存柊鎺掑簭鎸夐挳
    updateOrderButton();
}

// 鏇存柊鎺掑簭鎸夐挳鐘舵€?function updateOrderButton() {
    const orderText = document.getElementById('orderText');
    const orderIcon = document.getElementById('orderIcon');

    if (orderText && orderIcon) {
        orderText.textContent = episodesReversed ? '姝ｅ簭鎺掑垪' : '鍊掑簭鎺掑垪';
        orderIcon.style.transform = episodesReversed ? 'rotate(180deg)' : '';
    }
}

// 璁剧疆杩涘害鏉″噯纭偣鍑诲鐞?function setupProgressBarPreciseClicks() {
    // 鏌ユ壘DPlayer鐨勮繘搴︽潯鍏冪礌
    const progressBar = document.querySelector('.dplayer-bar-wrap');
    if (!progressBar || !art || !art.video) return;

    // 绉婚櫎鍙兘瀛樺湪鐨勬棫浜嬩欢鐩戝惉鍣?    progressBar.removeEventListener('mousedown', handleProgressBarClick);

    // 娣诲姞鏂扮殑浜嬩欢鐩戝惉鍣?    progressBar.addEventListener('mousedown', handleProgressBarClick);

    // 鍦ㄧЩ鍔ㄧ涔熸坊鍔犺Е鎽镐簨浠舵敮鎸?    progressBar.removeEventListener('touchstart', handleProgressBarTouch);
    progressBar.addEventListener('touchstart', handleProgressBarTouch);

    // 澶勭悊杩涘害鏉＄偣鍑?    function handleProgressBarClick(e) {
        if (!art || !art.video) return;

        // 璁＄畻鐐瑰嚮浣嶇疆鐩稿浜庤繘搴︽潯鐨勬瘮渚?        const rect = e.currentTarget.getBoundingClientRect();
        const percentage = (e.clientX - rect.left) / rect.width;

        // 璁＄畻鐐瑰嚮浣嶇疆瀵瑰簲鐨勮棰戞椂闂?        const duration = art.video.duration;
        let clickTime = percentage * duration;

        // 澶勭悊瑙嗛鎺ヨ繎缁撳熬鐨勬儏鍐?        if (duration - clickTime < 1) {
            // 濡傛灉鐐瑰嚮浣嶇疆闈炲父鎺ヨ繎缁撳熬锛岀◢寰線鍓嶇Щ涓€鐐?            clickTime = Math.min(clickTime, duration - 1.5);

        }

        // 璁板綍鐢ㄦ埛鐐瑰嚮鐨勪綅缃?        userClickedPosition = clickTime;

        // 闃绘榛樿浜嬩欢浼犳挱锛岄伩鍏岲Player鍐呴儴閫昏緫灏嗚棰戣烦鑷虫湯灏?        e.stopPropagation();

        // 鐩存帴璁剧疆瑙嗛鏃堕棿
        art.seek(clickTime);
    }

    // 澶勭悊绉诲姩绔Е鎽镐簨浠?    function handleProgressBarTouch(e) {
        if (!art || !art.video || !e.touches[0]) return;

        const touch = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        const percentage = (touch.clientX - rect.left) / rect.width;

        const duration = art.video.duration;
        let clickTime = percentage * duration;

        // 澶勭悊瑙嗛鎺ヨ繎缁撳熬鐨勬儏鍐?        if (duration - clickTime < 1) {
            clickTime = Math.min(clickTime, duration - 1.5);
        }

        // 璁板綍鐢ㄦ埛鐐瑰嚮鐨勪綅缃?        userClickedPosition = clickTime;

        e.stopPropagation();
        art.seek(clickTime);
    }
}

// 鍦ㄦ挱鏀惧櫒鍒濆鍖栧悗娣诲姞瑙嗛鍒板巻鍙茶褰?function saveToHistory() {
    // 纭繚 currentEpisodes 闈炵┖涓旀湁褰撳墠瑙嗛URL
    if (!currentEpisodes || currentEpisodes.length === 0 || !currentVideoUrl) {
        return;
    }

    // 灏濊瘯浠嶶RL涓幏鍙栧弬鏁?    const urlParams = new URLSearchParams(window.location.search);
    const sourceCode = getCurrentSourceCode(urlParams);
    let sourceName = urlParams.get('source') || '';
    if (!sourceName && sourceCode) {
        sourceName = sourceCode;
    }
    const id_from_params = urlParams.get('id'); // Get video ID from player URL (passed as 'id')

    // 鑾峰彇褰撳墠鎾斁杩涘害
    let currentPosition = 0;
    let videoDuration = 0;

    if (art && art.video) {
        currentPosition = art.video.currentTime;
        videoDuration = art.video.duration;
    }

    // Define a show identifier: Prioritize sourceName_id, fallback to first episode URL or current video URL
    let show_identifier_for_video_info;
    if (sourceName && id_from_params) {
        show_identifier_for_video_info = `${sourceName}_${id_from_params}`;
    } else {
        show_identifier_for_video_info = (currentEpisodes && currentEpisodes.length > 0) ? currentEpisodes[0] : currentVideoUrl;
    }

    // 鏋勫缓瑕佷繚瀛樼殑瑙嗛淇℃伅瀵硅薄
    const videoInfo = {
        title: currentVideoTitle,
        directVideoUrl: currentVideoUrl, // Current episode's direct URL
        url: `player.html?url=${encodeURIComponent(currentVideoUrl)}&title=${encodeURIComponent(currentVideoTitle)}&source=${encodeURIComponent(sourceName)}&source_code=${encodeURIComponent(sourceCode)}&id=${encodeURIComponent(id_from_params || '')}&index=${currentEpisodeIndex}&position=${Math.floor(currentPosition || 0)}`,
        episodeIndex: currentEpisodeIndex,
        sourceName: sourceName,
        vod_id: id_from_params || '', // Store the ID from params as vod_id in history item
        sourceCode: sourceCode,
        showIdentifier: show_identifier_for_video_info, // Identifier for the show/series
        timestamp: Date.now(),
        playbackPosition: currentPosition,
        duration: videoDuration,
        episodes: currentEpisodes && currentEpisodes.length > 0 ? [...currentEpisodes] : []
    };
    
    try {
        const history = JSON.parse(localStorage.getItem('viewingHistory') || '[]');

        // 妫€鏌ユ槸鍚﹀凡缁忓瓨鍦ㄧ浉鍚岀殑绯诲垪璁板綍 (鍩轰簬鏍囬銆佹潵婧愬拰 showIdentifier)
        const existingIndex = history.findIndex(item => 
            item.title === videoInfo.title && 
            item.sourceName === videoInfo.sourceName && 
            item.showIdentifier === videoInfo.showIdentifier
        );

        if (existingIndex !== -1) {
            // 瀛樺湪鍒欐洿鏂扮幇鏈夎褰曠殑褰撳墠闆嗘暟銆佹椂闂存埑銆佹挱鏀捐繘搴﹀拰URL绛?            const existingItem = history[existingIndex];
            existingItem.episodeIndex = videoInfo.episodeIndex;
            existingItem.timestamp = videoInfo.timestamp;
            existingItem.sourceName = videoInfo.sourceName; // Should be consistent, but update just in case
            existingItem.sourceCode = videoInfo.sourceCode;
            existingItem.vod_id = videoInfo.vod_id;
            
            // Update URLs to reflect the current episode being watched
            existingItem.directVideoUrl = videoInfo.directVideoUrl; // Current episode's direct URL
            existingItem.url = videoInfo.url; // Player link for the current episode

            // 鏇存柊鎾斁杩涘害淇℃伅
            existingItem.playbackPosition = videoInfo.playbackPosition > 10 ? videoInfo.playbackPosition : (existingItem.playbackPosition || 0);
            existingItem.duration = videoInfo.duration || existingItem.duration;
            
            // 鏇存柊闆嗘暟鍒楄〃锛堝鏋滄柊鐨勯泦鏁板垪琛ㄤ笌瀛樺偍鐨勪笉鍚岋紝渚嬪闆嗘暟澧炲姞浜嗭級
            if (videoInfo.episodes && videoInfo.episodes.length > 0) {
                if (!existingItem.episodes || 
                    !Array.isArray(existingItem.episodes) || 
                    existingItem.episodes.length !== videoInfo.episodes.length || 
                    !videoInfo.episodes.every((ep, i) => ep === existingItem.episodes[i])) { // Basic check for content change
                    existingItem.episodes = [...videoInfo.episodes]; // Deep copy
                }
            }
            
            // 绉诲埌鏈€鍓嶉潰
            const updatedItem = history.splice(existingIndex, 1)[0];
            history.unshift(updatedItem);
        } else {
            // 娣诲姞鏂拌褰曞埌鏈€鍓嶉潰
            history.unshift(videoInfo);
        }

        // 闄愬埗鍘嗗彶璁板綍鏁伴噺涓?0鏉?        if (history.length > 50) history.splice(50);

        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) {
    }
}

// 鏄剧ず鎭㈠浣嶇疆鎻愮ず
function showPositionRestoreHint(position) {
    if (!position || position < 10) return;

    // 鍒涘缓鎻愮ず鍏冪礌
    const hint = document.createElement('div');
    hint.className = 'position-restore-hint';
    hint.innerHTML = `
        <div class="hint-content">
            宸蹭粠 ${formatTime(position)} 缁х画鎾斁
        </div>
    `;

    // 娣诲姞鍒版挱鏀惧櫒瀹瑰櫒
    const playerContainer = document.querySelector('.player-container'); // Ensure this selector is correct
    if (playerContainer) { // Check if playerContainer exists
        playerContainer.appendChild(hint);
    } else {
        return; // Exit if container not found
    }

    // 鏄剧ず鎻愮ず
    setTimeout(() => {
        hint.classList.add('show');

        // 3绉掑悗闅愯棌
        setTimeout(() => {
            hint.classList.remove('show');
            setTimeout(() => hint.remove(), 300);
        }, 3000);
    }, 100);
}

// 鏍煎紡鍖栨椂闂翠负 mm:ss 鏍煎紡
function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 寮€濮嬪畾鏈熶繚瀛樻挱鏀捐繘搴?function startProgressSaveInterval() {
    // 娓呴櫎鍙兘瀛樺湪鐨勬棫璁℃椂鍣?    if (progressSaveInterval) {
        clearInterval(progressSaveInterval);
    }

    // 姣?0绉掍繚瀛樹竴娆℃挱鏀捐繘搴?    progressSaveInterval = setInterval(saveCurrentProgress, 30000);
}

// 淇濆瓨褰撳墠鎾斁杩涘害
function saveCurrentProgress() {
    if (!art || !art.video) return;
    const currentTime = art.video.currentTime;
    const duration = art.video.duration;
    if (!duration || currentTime < 1) return;

    // 鍦╨ocalStorage涓繚瀛樿繘搴?    const progressKey = `videoProgress_${getVideoId()}`;
    const progressData = {
        position: currentTime,
        duration: duration,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(progressKey, JSON.stringify(progressData));
        // --- 鏂板锛氬悓姝ユ洿鏂?viewingHistory 涓殑杩涘害 ---
        try {
            const historyRaw = localStorage.getItem('viewingHistory');
            if (historyRaw) {
                const history = JSON.parse(historyRaw);
                // 鐢?title + 闆嗘暟绱㈠紩鍞竴鏍囪瘑
                const idx = history.findIndex(item =>
                    item.title === currentVideoTitle &&
                    (item.episodeIndex === undefined || item.episodeIndex === currentEpisodeIndex)
                );
                if (idx !== -1) {
                    // 鍙湪杩涘害鏈夋槑鏄惧彉鍖栨椂鎵嶆洿鏂帮紝鍑忓皯鍐欏叆
                    if (
                        Math.abs((history[idx].playbackPosition || 0) - currentTime) > 2 ||
                        Math.abs((history[idx].duration || 0) - duration) > 2
                    ) {
                        history[idx].playbackPosition = currentTime;
                        history[idx].duration = duration;
                        history[idx].timestamp = Date.now();
                        localStorage.setItem('viewingHistory', JSON.stringify(history));
                    }
                }
            }
        } catch (e) {
        }
    } catch (e) {
    }
}

// 璁剧疆绉诲姩绔暱鎸変笁鍊嶉€熸挱鏀惧姛鑳?function setupLongPressSpeedControl() {
    if (!art || !art.video) return;

    const playerElement = document.getElementById('player');
    let longPressTimer = null;
    let originalPlaybackRate = 1.0;
    let isLongPress = false;

    // 鏄剧ず蹇€熸彁绀?    function showSpeedHint(speed) {
        showShortcutHint(`${speed}鍊嶉€焋, 'right');
    }

    // 绂佺敤鍙抽敭
    playerElement.oncontextmenu = () => {
        // 妫€娴嬫槸鍚︿负绉诲姩璁惧
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // 鍙湪绉诲姩璁惧涓婄鐢ㄥ彸閿?        if (isMobile) {
            const dplayerMenu = document.querySelector(".dplayer-menu");
            const dplayerMask = document.querySelector(".dplayer-mask");
            if (dplayerMenu) dplayerMenu.style.display = "none";
            if (dplayerMask) dplayerMask.style.display = "none";
            return false;
        }
        return true; // 鍦ㄦ闈㈣澶囦笂鍏佽鍙抽敭鑿滃崟
    };

    // 瑙︽懜寮€濮嬩簨浠?    playerElement.addEventListener('touchstart', function (e) {
        // 妫€鏌ヨ棰戞槸鍚︽鍦ㄦ挱鏀撅紝濡傛灉娌℃湁鎾斁鍒欎笉瑙﹀彂闀挎寜鍔熻兘
        if (art.video.paused) {
            return; // 瑙嗛鏆傚仠鏃朵笉瑙﹀彂闀挎寜鍔熻兘
        }

        // 淇濆瓨鍘熷鎾斁閫熷害
        originalPlaybackRate = art.video.playbackRate;

        // 璁剧疆闀挎寜璁℃椂鍣?        longPressTimer = setTimeout(() => {
            // 鍐嶆妫€鏌ヨ棰戞槸鍚︿粛鍦ㄦ挱鏀?            if (art.video.paused) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                return;
            }

            // 闀挎寜瓒呰繃500ms锛岃缃负3鍊嶉€?            art.video.playbackRate = 3.0;
            isLongPress = true;
            showSpeedHint(3.0);

            // 鍙湪纭涓洪暱鎸夋椂闃绘榛樿琛屼负
            e.preventDefault();
        }, 500);
    }, { passive: false });

    // 瑙︽懜缁撴潫浜嬩欢
    playerElement.addEventListener('touchend', function (e) {
        // 娓呴櫎闀挎寜璁℃椂鍣?        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 濡傛灉鏄暱鎸夌姸鎬侊紝鎭㈠鍘熷鎾斁閫熷害
        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
            showSpeedHint(originalPlaybackRate);

            // 闃绘闀挎寜鍚庣殑鐐瑰嚮浜嬩欢
            e.preventDefault();
        }
        // 濡傛灉涓嶆槸闀挎寜锛屽垯鍏佽姝ｅ父鐨勭偣鍑讳簨浠讹紙鏆傚仠/鎾斁锛?    });

    // 瑙︽懜鍙栨秷浜嬩欢
    playerElement.addEventListener('touchcancel', function () {
        // 娓呴櫎闀挎寜璁℃椂鍣?        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // 濡傛灉鏄暱鎸夌姸鎬侊紝鎭㈠鍘熷鎾斁閫熷害
        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }
    });

    // 瑙︽懜绉诲姩浜嬩欢 - 闃叉鍦ㄩ暱鎸夋椂瑙﹀彂椤甸潰婊氬姩
    playerElement.addEventListener('touchmove', function (e) {
        if (isLongPress) {
            e.preventDefault();
        }
    }, { passive: false });

    // 瑙嗛鏆傚仠鏃跺彇娑堥暱鎸夌姸鎬?    art.video.addEventListener('pause', function () {
        if (isLongPress) {
            art.video.playbackRate = originalPlaybackRate;
            isLongPress = false;
        }

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });
}

// 娓呴櫎瑙嗛杩涘害璁板綍
function clearVideoProgress() {
    const progressKey = `videoProgress_${getVideoId()}`;
    try {
        localStorage.removeItem(progressKey);
    } catch (e) {
    }
}

// 鑾峰彇瑙嗛鍞竴鏍囪瘑
function getVideoId() {
    // 浣跨敤瑙嗛鏍囬鍜岄泦鏁扮储寮曚綔涓哄敮涓€鏍囪瘑
    // If currentVideoUrl is available and more unique, prefer it. Otherwise, fallback.
    if (currentVideoUrl) {
        return `${encodeURIComponent(currentVideoUrl)}`;
    }
    return `${encodeURIComponent(currentVideoTitle)}_${currentEpisodeIndex}`;
}

let controlsLocked = false;
function toggleControlsLock() {
    const container = document.getElementById('playerContainer');
    controlsLocked = !controlsLocked;
    container.classList.toggle('controls-locked', controlsLocked);
    const icon = document.getElementById('lockIcon');
    // 鍒囨崲鍥炬爣锛氶攣 / 瑙ｉ攣
    icon.innerHTML = controlsLocked
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M12 15v2m0-8V7a4 4 0 00-8 0v2m8 0H4v8h16v-8H6v-6z\"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d=\"M15 11V7a3 3 0 00-6 0v4m-3 4h12v6H6v-6z\"/>';
}

// 鏀寔鍦╥frame涓叧闂挱鏀惧櫒
function closeEmbeddedPlayer() {
    try {
        if (window.self !== window.top) {
            // 濡傛灉鍦╥frame涓紝灏濊瘯璋冪敤鐖剁獥鍙ｇ殑鍏抽棴鏂规硶
            if (window.parent && typeof window.parent.closeVideoPlayer === 'function') {
                window.parent.closeVideoPlayer();
                return true;
            }
        }
    } catch (e) {
        console.error('灏濊瘯鍏抽棴宓屽叆寮忔挱鏀惧櫒澶辫触:', e);
    }
    return false;
}

function escapeResourceText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getResourceDisplayName(sourceKey) {
    if (sourceKey && API_SITES[sourceKey]) {
        return API_SITES[sourceKey].name;
    }

    if (sourceKey && sourceKey.startsWith('custom_')) {
        const customIndex = parseInt(sourceKey.replace('custom_', ''), 10);
        return customAPIs[customIndex]?.name || '鑷畾涔夎祫婧?;
    }

    return sourceKey || '鏈煡璧勬簮';
}

function closeResourceModal() {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.style.display = '';
    modal.setAttribute('aria-hidden', 'true');

    if (resourceModalKeydownHandler) {
        document.removeEventListener('keydown', resourceModalKeydownHandler, true);
        resourceModalKeydownHandler = null;
    }

    if (modalContent && !resourceSwitchInProgress) {
        modalContent.innerHTML = '';
    }

    if (resourceModalPreviousFocus && document.contains(resourceModalPreviousFocus)) {
        resourceModalPreviousFocus.focus({ preventScroll: true });
    }
    resourceModalPreviousFocus = null;
}

function renderResourceInfoBar() {
    const container = document.getElementById('resourceInfoBarContainer');
    if (!container) {
        console.error('鎵句笉鍒拌祫婧愪俊鎭崱鐗囧鍣?);
        return;
    }

    const currentSource = getCurrentSourceCode(new URLSearchParams(window.location.search));
    const resourceName = getResourceDisplayName(currentSource);
    const recommendedSource = window.getDefaultRecommendedSource
        ? window.getDefaultRecommendedSource()
        : '';
    const isDefaultRecommended = currentSource && currentSource === recommendedSource;
    const regionLabel = window.getSourceRegionLabel
        ? window.getSourceRegionLabel(currentSource)
        : '鏅€氱嚎璺?;
    const cachedSpeed = window.getCachedSourceSpeed
        ? window.getCachedSourceSpeed(currentSource)
        : null;
    const speedLabel = cachedSpeed === null ? '鏈祴閫? : `${Math.round(cachedSpeed)}ms`;

    container.innerHTML = `
      <div class="resource-info-bar-left flex">
        <div class="resource-info-primary">
          <span class="resource-info-name">${escapeResourceText(resourceName)}</span>
          ${isDefaultRecommended ? '<span class="resource-info-recommended">榛樿鎺ㄨ崘</span>' : ''}
        </div>
        <div class="resource-info-meta">
          <span>${currentEpisodes.length} 闆?/span>
          <span>${escapeResourceText(regionLabel)}</span>
          <span>${escapeResourceText(speedLabel)}</span>
        </div>
      </div>
      <button type="button" class="resource-switch-btn flex" id="switchResourceBtn" onclick="showSwitchResourceModal()" aria-haspopup="dialog">
        <span class="resource-switch-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4v16m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        鍒囨崲璧勬簮
      </button>
    `;
}

// 娴嬭瘯瑙嗛婧愰€熺巼鐨勫嚱鏁?async function testVideoSourceSpeed(sourceKey, vodId) {
    try {
        const startTime = performance.now();
        
        // 鏋勫缓API鍙傛暟
        let apiParams = '';
        if (sourceKey.startsWith('custom_')) {
            const customIndex = sourceKey.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) {
                return { speed: -1, error: 'API閰嶇疆鏃犳晥' };
            }
            if (customApi.detail) {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&customDetail=' + encodeURIComponent(customApi.detail) + '&source=custom';
            } else {
                apiParams = '&customApi=' + encodeURIComponent(customApi.url) + '&source=custom';
            }
        } else {
            apiParams = '&source=' + sourceKey;
        }
        
        // 娣诲姞鏃堕棿鎴抽槻姝㈢紦瀛?        const timestamp = new Date().getTime();
        const cacheBuster = `&_t=${timestamp}`;
        
        // 鑾峰彇瑙嗛璇︽儏
        const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}${cacheBuster}`, {
            method: 'GET',
            cache: 'no-cache'
        });
        
        if (!response.ok) {
            return { speed: -1, error: '鑾峰彇澶辫触' };
        }
        
        const data = await response.json();
        
        if (!data.episodes || data.episodes.length === 0) {
            return { speed: -1, error: '鏃犳挱鏀炬簮' };
        }
        
        // 娴嬭瘯绗竴涓挱鏀鹃摼鎺ョ殑鍝嶅簲閫熷害
        const firstEpisodeUrl = data.episodes[0];
        if (!firstEpisodeUrl) {
            return { speed: -1, error: '閾炬帴鏃犳晥' };
        }
        
        // 娴嬭瘯瑙嗛閾炬帴鍝嶅簲鏃堕棿
        const videoTestStart = performance.now();
        try {
            const videoResponse = await fetch(firstEpisodeUrl, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000) // 5绉掕秴鏃?            });
            
            const videoTestEnd = performance.now();
            const totalTime = videoTestEnd - startTime;
            
            // 杩斿洖鎬诲搷搴旀椂闂达紙姣锛?            return { 
                speed: Math.round(totalTime),
                episodes: data.episodes.length,
                error: null 
            };
        } catch (videoError) {
            // 濡傛灉瑙嗛閾炬帴娴嬭瘯澶辫触锛屽彧杩斿洖API鍝嶅簲鏃堕棿
            const apiTime = performance.now() - startTime;
            return { 
                speed: Math.round(apiTime),
                episodes: data.episodes.length,
                error: null,
                note: 'API鍝嶅簲' 
            };
        }
        
    } catch (error) {
        return { 
            speed: -1, 
            error: error.name === 'AbortError' ? '瓒呮椂' : '娴嬭瘯澶辫触' 
        };
    }
}

// 鏍煎紡鍖栭€熷害鏄剧ず
function formatSpeedDisplay(speedResult) {
    if (speedResult.speed === -1) {
        return `<span class="speed-indicator error">鉂?${speedResult.error}</span>`;
    }
    
    const speed = speedResult.speed;
    let className = 'speed-indicator good';
    let icon = '馃煝';
    
    if (speed > 2000) {
        className = 'speed-indicator poor';
        icon = '馃敶';
    } else if (speed > 1000) {
        className = 'speed-indicator medium';
        icon = '馃煛';
    }
    
    const note = speedResult.note ? ` (${speedResult.note})` : '';
    return `<span class="${className}">${icon} ${speed}ms${note}</span>`;
}

// 鈹€鈹€ 璧勬簮鍗＄墖鍗犱綅鍥?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const _FALLBACK_IMG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiPjwvcmVjdD48cGF0aCBkPSJNMjEgMTV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNCI+PC9wYXRoPjxwb2x5bGluZSBwb2ludHM9IjE3IDggMTIgMyA3IDgiPjwvcG9seWxpbmU+PHBhdGggZD0iTTEyIDN2MTIiPjwvcGF0aD48L3N2Zz4=";

// 娴佸紡璧勬簮鍒囨崲寮圭獥锛堜紭鍖栫増锛夛細鎼滃埌鍗虫樉鍗＄墖锛岄€熸祴瀹屽嵆鏇存柊寰界珷
async function showSwitchResourceModal() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentSourceCode = getCurrentSourceCode(urlParams);
    const currentVideoId = urlParams.get('id');

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    if (resourceSwitchInProgress) {
        showToast('姝ｅ湪鍒囨崲璧勬簮锛岃绋嶅€?, 'warning');
        return;
    }

    resourceModalPreviousFocus = document.activeElement;
    modalTitle.innerHTML = `<span class="break-words">${escapeResourceText(currentVideoTitle)}</span><span class="resource-modal-title-sub">閫夋嫨鍙敤绾胯矾</span>`;
    modal.classList.remove('hidden');
    modal.style.display = '';
    modal.setAttribute('aria-hidden', 'false');

    // NOTE: 浼樺厛浣跨敤鎼滅储椤电紦瀛樼殑鍏勫紵璧勬簮锛堝悓涓€娆℃悳绱㈢粨鏋滀腑鐨勫悓鍚嶅叾浠栨潵婧愶級
    // 缂撳瓨鐢?app.js 鐨?playVideo() 鍐欏叆锛屾爣棰樹竴鑷存椂鏈夋晥
    let siblingResults = [];
    try {
        const cachedTitle = localStorage.getItem('playerSiblingTitle') || '';
        const cachedRaw = localStorage.getItem('playerSiblingResults');
        const normalizedCurrent = String(currentVideoTitle || '').replace(/[\s路锛?()锛堬級\-]/g, '').toLowerCase();
        const normalizedCached = String(cachedTitle).replace(/[\s路锛?()锛堬級\-]/g, '').toLowerCase();
        // NOTE: 鍙湁鏍囬鍖归厤鏃舵墠浣跨敤缂撳瓨锛岄槻姝㈡墦寮€鍏朵粬瑙嗛鏃惰鐢ㄤ笂娆＄殑鏁版嵁
        if (cachedRaw && normalizedCached && normalizedCurrent && normalizedCached === normalizedCurrent) {
            siblingResults = JSON.parse(cachedRaw);
        }
    } catch (e) {
        siblingResults = [];
    }

    const playbackRegion = window.getUserPlaybackRegion
        ? window.getUserPlaybackRegion()
        : { region: 'overseas', recommendationLabel: '娴峰浼樺厛' };

    const defaultRecommendedSource = window.getDefaultRecommendedSource
        ? window.getDefaultRecommendedSource()
        : '';

    modalContent.innerHTML = `
        <div class="resource-grid-note">
            ${siblingResults.length > 0
                ? '浠ヤ笅涓烘湰娆℃悳绱㈢粨鏋滀腑鎵惧埌鐨勫彲鐢ㄧ嚎璺紝鐐瑰嚮鍗冲彲鍒囨崲銆?
                : (playbackRegion.region === 'mainland'
                    ? '褰撳墠鎸夊ぇ闄嗙綉缁滀紭鍏堟帹鑽愮嚎璺紝娴嬮€熷畬鎴愬悗浼氱户缁埛鏂伴『搴忋€?
                    : '褰撳墠鎸夋捣澶栫綉缁滀紭鍏堟帹鑽愮嚎璺紝娴嬮€熷畬鎴愬悗浼氱户缁埛鏂伴『搴忋€?)}
        </div>
        <div id="resource-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4"></div>
    `;
    const grid = document.getElementById('resource-grid');
    let resourceModalHasFocusedCard = false;
    const availableResults = new Map();
    const speedSnapshot = {};

    function getFocusableResourceCards() {
        return Array.from(grid.querySelectorAll('.resource-source-card:not(:disabled)'));
    }

    function focusPreferredResourceCard() {
        if (resourceModalHasFocusedCard || !modal || modal.classList.contains('hidden')) return;
        const cards = getFocusableResourceCards();
        if (!cards.length) return;

        const recommendedKey = getRecommendedSourceKeyForGrid();
        const preferredCard = cards.find(card => card.dataset.sourceKey === recommendedKey) || cards[0];
        preferredCard.focus({ preventScroll: true });
        preferredCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        resourceModalHasFocusedCard = true;
    }

    function moveResourceFocus(direction) {
        const cards = getFocusableResourceCards();
        if (!cards.length) return;

        const activeCard = document.activeElement?.classList?.contains('resource-source-card')
            ? document.activeElement
            : cards[0];
        const currentRect = activeCard.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCard = null;
        let bestScore = Infinity;
        cards.forEach(card => {
            if (card === activeCard) return;
            const rect = card.getBoundingClientRect();
            const center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            const dx = center.x - currentCenter.x;
            const dy = center.y - currentCenter.y;
            const validDirection = (direction === 'left' && dx < -4)
                || (direction === 'right' && dx > 4)
                || (direction === 'up' && dy < -4)
                || (direction === 'down' && dy > 4);
            if (!validDirection) return;

            const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
            const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
            const score = primary + secondary * 2.5;
            if (score < bestScore) {
                bestScore = score;
                bestCard = card;
            }
        });

        if (bestCard) {
            bestCard.focus({ preventScroll: true });
            bestCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    resourceModalKeydownHandler = function (event) {
        if (modal.classList.contains('hidden')) return;

        const directionMap = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'up',
            ArrowDown: 'down'
        };
        const direction = directionMap[event.key];
        if (direction) {
            event.preventDefault();
            event.stopImmediatePropagation();
            moveResourceFocus(direction);
            return;
        }

        const isConfirmKey = event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 23;
        if (isConfirmKey && document.activeElement?.classList?.contains('resource-source-card')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            document.activeElement.click();
            return;
        }

        const isBackKey = event.key === 'Escape'
            || event.key === 'BrowserBack'
            || event.keyCode === 27
            || event.keyCode === 461
            || event.keyCode === 10009;
        if (isBackKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!resourceSwitchInProgress) closeResourceModal();
        }
    };
    document.addEventListener('keydown', resourceModalKeydownHandler, true);

    function getOrderedGridKeys() {
        const availableKeys = Array.from(availableResults.keys());
        return window.getPreferredSourceOrder
            ? window.getPreferredSourceOrder(availableKeys, { speedMap: speedSnapshot })
            : availableKeys;
    }

    function syncCardOrder() {
        getOrderedGridKeys().forEach(sourceKey => {
            const card = document.getElementById(`rcard-${sourceKey}`);
            if (card) {
                grid.appendChild(card);
            }
        });
    }

    function getRecommendedSourceKeyForGrid() {
        const availableKeys = Array.from(availableResults.keys());
        return window.getRecommendedSourceKey
            ? window.getRecommendedSourceKey(availableKeys, { speedMap: speedSnapshot })
            : (availableKeys[0] || '');
    }

    function upsertCard(sourceKey, result, speedResult) {
        const existingState = availableResults.get(sourceKey) || {};
        const nextSpeedResult = speedResult || existingState.speedResult || null;
        availableResults.set(sourceKey, {
            result,
            speedResult: nextSpeedResult
        });

        if (nextSpeedResult && nextSpeedResult.speed >= 0) {
            speedSnapshot[sourceKey] = nextSpeedResult.speed;
        }

        const isCurrent = String(sourceKey) === String(currentSourceCode)
            && String(result.vod_id) === String(currentVideoId);
        const sourceName = result.source_name || getResourceDisplayName(sourceKey);
        const sourceRegionLabel = window.getSourceRegionLabel
            ? window.getSourceRegionLabel(sourceKey)
            : '鏅€氱嚎璺?;
        const isDefaultRecommended = sourceKey === defaultRecommendedSource;
        const isRecommended = getRecommendedSourceKeyForGrid() === sourceKey;
        const episodeCount = nextSpeedResult?.episodes || result.episodes?.length || 0;
        const speedText = nextSpeedResult
            ? formatSpeedDisplay(nextSpeedResult)
            : '<span class="speed-indicator resource-speed-pending">娴嬮€熶腑</span>';

        let card = document.getElementById(`rcard-${sourceKey}`);
        if (!card) {
            card = document.createElement('button');
            card.type = 'button';
            card.id = `rcard-${sourceKey}`;
            grid.appendChild(card);
        }

        card.className = `resource-source-card${isCurrent ? ' current' : ''}${isDefaultRecommended ? ' default-recommended' : ''}`;
        card.disabled = isCurrent || resourceSwitchInProgress;
        card.dataset.sourceKey = sourceKey;
        card.dataset.vodId = result.vod_id;
        card.setAttribute('aria-label', `${sourceName}锛?{sourceRegionLabel}${episodeCount ? `锛?{episodeCount}闆哷 : ''}${isCurrent ? '锛屽綋鍓嶆挱鏀? : ''}${isDefaultRecommended ? '锛岄粯璁ゆ帹鑽? : ''}`);
        card.onclick = isCurrent ? null : (() => switchToResource(sourceKey, result.vod_id, card));
        card.innerHTML = `
            <div class="resource-source-poster">
                <img src="${escapeResourceText(result.vod_pic || _FALLBACK_IMG)}" alt="${escapeResourceText(result.vod_name)}"
                     onerror="this.src='${_FALLBACK_IMG}'">
                <div class="resource-source-badges">
                    ${isDefaultRecommended ? '<span class="resource-recommend-badge default">榛樿鎺ㄨ崘</span>' : (isRecommended ? '<span class="resource-recommend-badge">鎺ㄨ崘</span>' : '')}
                    ${isCurrent ? '<span class="resource-current-badge">褰撳墠鎾斁</span>' : ''}
                </div>
                <div class="resource-speed-badge">${speedText}</div>
                <div class="resource-switching-state" aria-hidden="true"><span class="resource-switching-spinner"></span><span>姝ｅ湪鍒囨崲</span></div>
            </div>
            <div class="resource-source-copy">
                <strong title="${escapeResourceText(result.vod_name)}">${escapeResourceText(result.vod_name)}</strong>
                <span title="${escapeResourceText(sourceName)}">${escapeResourceText(sourceName)}</span>
                <div class="resource-source-meta">
                    <span class="resource-region-tag">${escapeResourceText(sourceRegionLabel)}</span>
                    <span>${episodeCount ? `${episodeCount}闆哷 : '闆嗘暟寰呯‘璁?}</span>
                </div>
            </div>`;

        syncCardOrder();
    }

    async function testSpeedFast(sourceKey, vodId) {
        if (window.testSourceConnectionSpeed) {
            const speedResult = await window.testSourceConnectionSpeed(sourceKey, vodId);
            if (!speedResult || speedResult.speed < 0) {
                return {
                    speed: -1,
                    error: speedResult?.error === 'timeout' ? '瓒呮椂' : '娴嬭瘯澶辫触'
                };
            }
            return {
                speed: speedResult.speed,
                episodes: speedResult.episodes,
                error: null,
                note: speedResult.cached ? '缂撳瓨' : ''
            };
        }

        try {
            const startAt = performance.now();
            const apiParams = sourceKey.startsWith('custom_')
                ? (() => {
                    const customApi = getCustomApiInfo(sourceKey.replace('custom_', ''));
                    if (!customApi) return null;
                    return customApi.detail
                        ? `&customApi=${encodeURIComponent(customApi.url)}&customDetail=${encodeURIComponent(customApi.detail)}&source=custom`
                        : `&customApi=${encodeURIComponent(customApi.url)}&source=custom`;
                })()
                : `&source=${sourceKey}`;
            if (apiParams === null) {
                return { speed: -1, error: 'API閰嶇疆鏃犳晥' };
            }

            const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}`, {
                signal: AbortSignal.timeout(6000)
            });
            if (!response.ok) {
                return { speed: -1, error: '鑾峰彇澶辫触' };
            }

            const detail = await response.json();
            if (!detail.episodes?.length) {
                return { speed: -1, error: '鏃犳挱鏀炬簮' };
            }

            const measuredSpeed = Math.round(performance.now() - startAt);
            if (window.updateSourceSpeedCache) {
                window.updateSourceSpeedCache(sourceKey, measuredSpeed, {
                    measurement: 'detail',
                    vodId,
                    episodes: detail.episodes.length
                });
            }

            return {
                speed: measuredSpeed,
                episodes: detail.episodes.length,
                error: null
            };
        } catch (error) {
            return {
                speed: -1,
                error: error.name === 'TimeoutError' || error.name === 'AbortError' ? '瓒呮椂' : '娴嬭瘯澶辫触'
            };
        }
    }

    // 鈹€鈹€ 浣跨敤缂撳瓨鍏勫紵璧勬簮锛堟潵鑷悳绱㈢粨鏋滈〉锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    if (siblingResults.length > 0) {
        // NOTE: 鐩存帴灞曠ず缂撳瓨鐨勬悳绱㈢粨鏋滐紝鏃犻渶閲嶆柊鎼滅储 API
        let foundAny = false;
        siblingResults.forEach(sibling => {
            foundAny = true;
            upsertCard(sibling.source_code, {
                vod_id: sibling.vod_id,
                vod_name: sibling.vod_name,
                vod_pic: sibling.vod_pic || '',
                source_name: sibling.source_name || sibling.source_code
            }, null);
            // 寮傛娴嬮€?            testSpeedFast(sibling.source_code, sibling.vod_id)
                .then(speedResult => upsertCard(sibling.source_code, {
                    vod_id: sibling.vod_id,
                    vod_name: sibling.vod_name,
                    vod_pic: sibling.vod_pic || '',
                    source_name: sibling.source_name || sibling.source_code
                }, speedResult))
                .catch(() => {});
        });

        if (!foundAny) {
            modalContent.innerHTML = '<div class="resource-empty-state">鏈壘鍒板尮閰嶈祫婧愶紝璇疯繑鍥炲悗缁х画浣跨敤褰撳墠绾胯矾銆?/div>';
        } else {
            focusPreferredResourceCard();
        }
        return;
    }

    // 鈹€鈹€ 鏃犵紦瀛樻椂锛氳法 API 閲嶆柊鎼滅储锛堝師鏈夐€昏緫锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    const candidateSourceKeys = Array.from(new Set([
        defaultRecommendedSource,
        currentSourceCode,
        ...selectedAPIs
    ].filter(Boolean)));
    const orderedSourceKeys = window.getPreferredSourceOrder
        ? window.getPreferredSourceOrder(candidateSourceKeys)
        : candidateSourceKeys;
    const resourceOptions = orderedSourceKeys.map(curr => {
        if (API_SITES[curr]) {
            return { key: curr, name: API_SITES[curr].name };
        }
        if (!curr.startsWith('custom_')) return null;
        const idx = parseInt(curr.replace('custom_', ''), 10);
        if (!customAPIs[idx]) return null;
        return { key: curr, name: customAPIs[idx].name || '鑷畾涔夎祫婧? };
    }).filter(Boolean);
    resourceOptions.forEach(option => {
        const cachedSpeed = window.getCachedSourceSpeed ? window.getCachedSourceSpeed(option.key) : null;
        if (cachedSpeed !== null) {
            speedSnapshot[option.key] = cachedSpeed;
        }
    });

    let foundAny = false;
    await Promise.all(resourceOptions.map(async option => {
        try {
            const queryResult = await searchByAPIAndKeyWord(option.key, currentVideoTitle);
            if (!Array.isArray(queryResult) || !queryResult.length) return;

            let result = queryResult[0];
            const normalizedTitle = String(currentVideoTitle || '').replace(/[\s路锛?()锛堬級\-]/g, '').toLowerCase();
            let bestScore = -1;
            queryResult.forEach(currentResult => {
                const resultTitle = String(currentResult.vod_name || '').replace(/[\s路锛?()锛堬級\-]/g, '').toLowerCase();
                let score = 0;
                if (resultTitle === normalizedTitle) score = 100;
                else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) score = 60;
                if (score > bestScore) {
                    bestScore = score;
                    result = currentResult;
                }
            });

            foundAny = true;
            upsertCard(option.key, result, null);
            testSpeedFast(option.key, result.vod_id)
                .then(speedResult => upsertCard(option.key, result, speedResult))
                .catch(() => {});
        } catch (error) {
            console.warn(`璧勬簮 ${option.key} 鎼滅储澶辫触:`, error.message);
        }
    }));

    if (!foundAny) {
        modalContent.innerHTML = '<div class="resource-empty-state">鏈壘鍒板尮閰嶈祫婧愶紝璇疯繑鍥炲悗缁х画浣跨敤褰撳墠绾胯矾銆?/div>';
    } else {
        focusPreferredResourceCard();
    }
}

/**
 * 设置资源卡片的切换中状态
 * @param {HTMLElement|null} activeCard - 当前点击的卡片（显示 spinner），null 表示所有卡片
 * @param {boolean} isSwitching - true 进入切换中状态，false 恢复正常
 */
function setResourceCardsSwitching(activeCard, isSwitching) {
    const grid = document.getElementById('resource-grid');
    if (!grid) return;
    const allCards = Array.from(grid.querySelectorAll('.resource-source-card'));
    allCards.forEach(card => {
        if (isSwitching) {
            card.disabled = true;
            if (card === activeCard) {
                card.classList.add('is-switching');
            }
        } else {
            // 恢复时只解除非"当前播放"卡片的禁用状态
            if (!card.classList.contains('current')) {
                card.disabled = false;
            }
            card.classList.remove('is-switching');
        }
    });
}

async function switchToResource(sourceKey, vodId, activeCard = null) {

    if (resourceSwitchInProgress) {
        showToast('正在切换资源，请勿重复操作', 'warning');
        return;
    }

    const sourceName = getResourceDisplayName(sourceKey);
    const snapshot = {
        episodes: [...currentEpisodes],
        episodeIndex: currentEpisodeIndex,
        videoUrl: currentVideoUrl,
        pageUrl: window.location.href,
        position: art?.video?.currentTime || 0,
        wasPaused: art?.video?.paused ?? false
    };

    let targetLoadStarted = false;
    stopVisualCleanDetection();
    closeVisualCleanConfirm();
    resourceSwitchInProgress = true;
    setResourceCardsSwitching(activeCard, true);
    showLoading(`正在切换到 ${sourceName}...`);
    showToast(`正在切换到 ${sourceName}`, 'warning');

    try {
        let apiParams = '';
        if (sourceKey.startsWith('custom_')) {
            const customApi = getCustomApiInfo(sourceKey.replace('custom_', ''));
            if (!customApi) throw new Error('自定义API配置无效');
            apiParams = customApi.detail
                ? `&customApi=${encodeURIComponent(customApi.url)}&customDetail=${encodeURIComponent(customApi.detail)}&source=custom`
                : `&customApi=${encodeURIComponent(customApi.url)}&source=custom`;
        } else {
            apiParams = `&source=${encodeURIComponent(sourceKey)}`;
        }

        const response = await fetch(`/api/detail?id=${encodeURIComponent(vodId)}${apiParams}`, {
            signal: AbortSignal.timeout(10000),
            cache: 'no-cache'
        });
        if (!response.ok) {
            throw new Error(`详情接口返回 ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data.episodes) || data.episodes.length === 0) {
            throw new Error('该线路没有可用播放地址');
        }

        const targetIndex = Math.min(snapshot.episodeIndex, data.episodes.length - 1);
        const targetUrl = data.episodes[targetIndex];
        if (!targetUrl || typeof targetUrl !== 'string') {
            throw new Error('目标播放地址无效');
        }

        targetLoadStarted = true;
        await loadResourceIntoPlayer(targetUrl, snapshot.position);

        // 目标线路已可播放，此时才原子提交应用状态
        currentEpisodes = data.episodes;
        currentEpisodeIndex = targetIndex;
        currentVideoUrl = targetUrl;

        const newUrl = new URL(snapshot.pageUrl);
        newUrl.searchParams.set('id', vodId);
        newUrl.searchParams.set('source', sourceKey);
        newUrl.searchParams.set('source_code', sourceKey);
        newUrl.searchParams.set('url', targetUrl);
        newUrl.searchParams.set('index', targetIndex);
        if (snapshot.position > 0) {
            newUrl.searchParams.set('position', Math.floor(snapshot.position));
        } else {
            newUrl.searchParams.delete('position');
        }
        window.history.replaceState({}, '', newUrl.toString());

        try {
            localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
            localStorage.setItem('currentEpisodeIndex', String(targetIndex));
            localStorage.setItem('currentSourceCode', sourceKey);
            localStorage.setItem('currentPlayingId', String(vodId));
            localStorage.setItem('currentPlayingSource', sourceKey);
        } catch (error) {}

        // 用户主动选源时优先恢复播放
        if (snapshot.wasPaused && snapshot.position > 1 && art?.pause) {
            art.pause();
        }

        updateEpisodeInfo();
        updateButtonStates();
        renderEpisodes();
        renderResourceInfoBar();
        restoreVisualCleanModeForCurrentSource();
        closeResourceModal();
        showToast(`已切换到 ${sourceName}`, 'success');
    } catch (error) {
        console.error('切换资源失败:', error);

        currentEpisodes = snapshot.episodes;
        currentEpisodeIndex = snapshot.episodeIndex;
        currentVideoUrl = snapshot.videoUrl;
        window.history.replaceState({}, '', snapshot.pageUrl);

        if (targetLoadStarted && snapshot.videoUrl) {
            try {
                await loadResourceIntoPlayer(snapshot.videoUrl, snapshot.position);
                if (snapshot.wasPaused && art?.pause) art.pause();
            } catch (rollbackError) {
                console.error('恢复原播放源失败:', rollbackError);
            }
        }

        updateEpisodeInfo();
        updateButtonStates();
        renderEpisodes();
        renderResourceInfoBar();
        restoreVisualCleanModeForCurrentSource();
        showToast(`切换到 ${sourceName} 失败，已保留原播放源`, 'error');
    } finally {
        window.isSwitchingVideo = false;
        resourceSwitchInProgress = false;
        setResourceCardsSwitching(null, false);
        hideLoading();
        if (!document.getElementById('modal')?.classList.contains('hidden')) {
            activeCard?.focus({ preventScroll: true });
        }
    }
}

function waitForPlayerReady(timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const video = art?.video;
        if (!video) {
            reject(new Error('播放器尚未就绪'));
            return;
        }

        if (video.readyState >= 2 && !video.error) {
            resolve();
            return;
        }

        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            video.removeEventListener('loadeddata', handleReady);
            video.removeEventListener('error', handleError);
        };
        const handleReady = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
        };
        const handleError = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('视频加载出错'));
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('视频加载超时'));
        }, timeoutMs);

        video.addEventListener('loadeddata', handleReady);
        video.addEventListener('error', handleError);
    });
}

async function loadResourceIntoPlayer(url, resumePosition = 0) {
    if (!art) throw new Error('播放器实例不存在');

    art.url = url;

    try {
        await waitForPlayerReady(12000);
    } catch (err) {
        // NOTE: 超时不阻断切换，允许继续（部分电视浏览器 readyState 更新慢）
        console.warn('loadResourceIntoPlayer: waitForPlayerReady failed:', err.message);
    }

    if (resumePosition > 1 && art.video) {
        try { art.video.currentTime = resumePosition; } catch (e) {}
    }

    art.play();
}