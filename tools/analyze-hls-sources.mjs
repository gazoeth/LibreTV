import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SITE_FILE = path.join(ROOT, 'js', 'customer_site.js');
const OUTPUT_FILE = path.join(ROOT, '.workbuddy', 'hls-source-audit-2026-08-04.json');
const SAMPLE_COUNT = 3;
const REQUEST_TIMEOUT = 10000;
const MAX_TEXT_SIZE = 2 * 1024 * 1024;

function extractSites(source) {
    const body = source.match(/const CUSTOMER_SITES = (\{[\s\S]*?\n\});/m)?.[1];
    if (!body) throw new Error('CUSTOMER_SITES not found');
    const context = {};
    vm.createContext(context);
    vm.runInContext(`globalThis.sites = ${body}`, context);
    return context.sites;
}

async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json, application/vnd.apple.mpegurl, application/x-mpegURL, */*' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (text.length > MAX_TEXT_SIZE) throw new Error('response too large');
        return { url: response.url || url, text };
    } finally {
        clearTimeout(timer);
    }
}

function absoluteUrl(uri, baseUrl) {
    try { return new URL(uri, baseUrl).href; } catch { return ''; }
}

function extractM3u8Urls(value) {
    return String(value || '').split(/[|$#\r\n]+/).map(item => item.trim()).filter(item => /^https?:\/\//i.test(item) && /\.m3u8(?:$|\?)/i.test(item));
}

function playlistSignals(text) {
    const lines = text.split(/\r?\n/);
    const uris = lines.filter(line => line.trim() && !line.trim().startsWith('#'));
    const directories = new Map();
    for (const uri of uris) {
        const normalized = uri.split('?')[0].replace(/\\/g, '/');
        const directory = normalized.slice(0, normalized.lastIndexOf('/'));
        if (directory) directories.set(directory, (directories.get(directory) || 0) + 1);
    }
    const markers = {
        cueOut: lines.filter(line => /#EXT-X-CUE-OUT|#EXT-OATCLS-SCTE35/i.test(line)).length,
        cueIn: lines.filter(line => /#EXT-X-CUE-IN/i.test(line)).length,
        daterange: lines.filter(line => /#EXT-X-DATERANGE/i.test(line)).length,
        discontinuity: lines.filter(line => /#EXT-X-DISCONTINUITY/i.test(line)).length,
        adPath: uris.filter(uri => /(?:^|[\/_\\.])(ad|ads|advert|advertise|advertisement|commercial|promo|preroll|midroll|postroll)(?:[\/_\\.\-]|$)/i.test(uri)).length
    };
    const shortSegments = lines.reduce((count, line) => {
        const duration = Number((line.match(/^#EXTINF:([0-9.]+)/i) || [])[1]);
        return Number.isFinite(duration) && duration > 0 && duration <= 3 ? count + 1 : count;
    }, 0);
    return {
        segmentCount: uris.length,
        shortSegments,
        markers,
        topDirectories: [...directories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    };
}

async function inspectPlaylist(url, depth = 0) {
    if (depth > 2) return { url, error: 'playlist recursion limit reached' };
    const response = await fetchText(url);
    const signal = playlistSignals(response.text);
    const variant = response.text.split(/\r?\n/).find(line => line.trim() && !line.trim().startsWith('#') && /\.m3u8(?:$|\?)/i.test(line.trim()));
    if (variant) {
        return {
            url: response.url,
            type: 'master',
            signal,
            child: await inspectPlaylist(absoluteUrl(variant.trim(), response.url), depth + 1)
        };
    }
    return { url: response.url, type: 'media', signal };
}

async function inspectSite(sourceKey, site) {
    const result = { sourceKey, name: site.name, api: site.api, samples: [], errors: [] };
    try {
        const api = new URL(site.api);
        api.searchParams.set('ac', 'list');
        api.searchParams.set('pg', '1');
        const payload = JSON.parse((await fetchText(api.href)).text);
        const list = Array.isArray(payload.list) ? payload.list.slice(0, SAMPLE_COUNT) : [];
        for (const item of list) {
            const detailUrl = new URL(site.api);
            detailUrl.searchParams.set('ac', 'detail');
            detailUrl.searchParams.set('ids', item.vod_id);
            const detailPayload = JSON.parse((await fetchText(detailUrl.href)).text);
            const detail = Array.isArray(detailPayload.list) ? detailPayload.list[0] || item : item;
            const sample = { vodId: detail.vod_id, vodName: detail.vod_name, playFrom: detail.vod_play_from, playlists: [] };
            const playUrls = extractM3u8Urls(detail.vod_play_url);
            for (const url of playUrls.slice(0, 2)) {
                try { sample.playlists.push(await inspectPlaylist(url)); } catch (error) { sample.playlists.push({ url, error: error.message }); }
            }
            result.samples.push(sample);
        }
    } catch (error) {
        result.errors.push(error.message);
    }
    return result;
}

const sites = extractSites(await fs.readFile(SITE_FILE, 'utf8'));
const results = [];
for (const [sourceKey, site] of Object.entries(sites)) {
    process.stdout.write(`Analyzing ${sourceKey}...\n`);
    results.push(await inspectSite(sourceKey, site));
}
await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
await fs.writeFile(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), sampleCount: SAMPLE_COUNT, results }, null, 2));
console.log(`Wrote ${OUTPUT_FILE}`);
