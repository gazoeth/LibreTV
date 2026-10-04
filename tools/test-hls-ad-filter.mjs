import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';

const source = fs.readFileSync(new URL('../js/player.js', import.meta.url), 'utf8');
class Loader {
    load(request, config, callbacks) {
        callbacks.onSuccess({ data: config.data, url: request.url }, {}, request, config.networkDetails);
    }
}
const context = vm.createContext({ URL, URLSearchParams, Hls: { DefaultConfig: { loader: Loader } },
    window: { location: { search: '?source=bfzy' } } });
vm.runInContext(source.slice(source.indexOf('class CustomHlsJsLoader'), source.indexOf('// 显示错误')) + '\nglobalThis.TestLoader = CustomHlsJsLoader;', context);
const filter = context.filterAdsFromM3U8;
const segment = (uri, duration = 6) => `#EXTINF:${duration},\n${uri}\n`;
const playlist = body => `#EXTM3U\n#EXT-X-TARGETDURATION:10\n${body}#EXT-X-ENDLIST\n`;
const base = 'https://video.example/movie/index.m3u8';

const plain = playlist(segment('normal/0.ts', 1) + '#EXT-X-DISCONTINUITY\n' + segment('normal/1.ts', 1));
assert.equal(filter(plain, true, base), plain, 'normal discontinuities and short content must survive');
const explicit = playlist(segment('normal/0.ts') + segment('/video/adjump/time/0.ts', 3) + segment('normal/1.ts'));
assert.equal(filter(explicit, true, base), playlist(segment('normal/0.ts') + '#EXT-X-DISCONTINUITY\n' + segment('normal/1.ts')));
const cue = playlist(segment('normal/0.ts') + '#EXT-X-CUE-OUT:6\n' + segment('unknown/0.ts') + '#EXT-X-CUE-IN\n' + segment('normal/1.ts'));
assert.ok(!filter(cue, true, base).includes('unknown/0.ts'));
const incompleteCue = playlist(segment('normal/0.ts') + '#EXT-X-CUE-OUT:6\n' + segment('unknown/0.ts'));
assert.equal(filter(incompleteCue, true, base), incompleteCue, 'unclosed cues must not erase the tail');
const block = '#EXT-X-DISCONTINUITY\n' + segment('../insert/a.ts', 3) + segment('../insert/b.ts', 3) + '#EXT-X-DISCONTINUITY\n';
const repeated = playlist(segment('normal/0.ts', 10).repeat(4) + block + segment('normal/1.ts', 10).repeat(4) + block + segment('normal/2.ts', 10).repeat(4));
assert.ok(!filter(repeated, true, base).includes('../insert/'));
const repeatedAtEdges = playlist(block + segment('normal/0.ts', 10).repeat(4) + block +
    segment('normal/1.ts', 10).repeat(4) + block + segment('normal/2.ts', 10).repeat(4) + block);
assert.ok(!filter(repeatedAtEdges, true, base).includes('../insert/'), 'confirmed repeated ads at the edges must also be removed');
assert.equal(filter(playlist(segment('normal/0.ts') + block + segment('normal/1.ts')), true, base), playlist(segment('normal/0.ts') + block + segment('normal/1.ts')), 'a single alternate directory is not evidence');
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nads/index.m3u8\n';
assert.equal(filter(master, true, base), master);
const proxied = explicit.split('\n').map(line => line && !line.startsWith('#') ? '/proxy/' + encodeURIComponent(new URL(line, base).href) : line).join('\n');
assert.ok(!filter(proxied, true, 'https://app.example/proxy/manifest').includes('adjump'));
assert.ok(filter(proxied, true, 'https://app.example/proxy/manifest').includes('/proxy/'));
const encrypted = explicit.replace('#EXT-X-TARGETDURATION:10', '#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:100\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"');
const encryptedResult = filter(encrypted, true, base);
assert.match(encryptedResult, /IV=0x00000000000000000000000000000064/);
assert.match(encryptedResult, /IV=0x00000000000000000000000000000066/);
assert.ok(!encryptedResult.includes('adjump'));
const byteRange = explicit.replace('#EXTINF:3,', '#EXT-X-BYTERANGE:100\n#EXTINF:3,');
assert.equal(filter(byteRange, true, base), byteRange);
assert.equal(filter(explicit.replace('#EXT-X-ENDLIST\n', ''), true, base), explicit.replace('#EXT-X-ENDLIST\n', ''), 'live media sequence must remain stable');
assert.equal(filter(playlist(segment('ads/0.ts')), true, base), playlist(segment('ads/0.ts')), 'never return an empty playlist');
assert.equal(filter(playlist(segment('normal/0.ts') + segment('normal/1.ts?ads=yes')), true, base), playlist(segment('normal/0.ts') + segment('normal/1.ts?ads=yes')));
const metadata = { request: 'preserved' };
const loader = new context.TestLoader({});
for (const type of ['manifest', 'level', 'fragment']) {
    loader.load({ type, url: base }, { data: explicit, networkDetails: metadata }, {
        onSuccess(response, stats, request, networkDetails) {
            assert.equal(networkDetails, metadata);
            assert.equal(response.data.includes('adjump'), type === 'fragment');
        }
    });
}
const keyChange = playlist('#EXT-X-KEY:METHOD=AES-128,URI="main.key",IV=0x01\n' + segment('normal/0.ts') +
    '#EXT-X-DISCONTINUITY\n#EXT-X-KEY:METHOD=AES-128,URI="ad.key",IV=0x02\n#EXT-X-MAP:URI="ad-init.mp4"\n' + segment('ads/0.ts') +
    '#EXT-X-DISCONTINUITY\n#EXT-X-KEY:METHOD=AES-128,URI="main.key",IV=0x03\n#EXT-X-MAP:URI="main-init.mp4"\n' + segment('normal/1.ts'));
const keyResult = filter(keyChange, true, base);
assert.ok(keyResult.indexOf('IV=0x03') < keyResult.indexOf('normal/1.ts'));
assert.ok(keyResult.indexOf('main-init.mp4') < keyResult.indexOf('normal/1.ts'));
assert.ok(!keyResult.includes('ads/0.ts'));
assert.ok(!keyResult.includes('#EXT-X-DISCONTINUITY\n#EXT-X-DISCONTINUITY'));
assert.equal(filter(plain.replace(/\n/g, '\r\n'), true, base), plain.replace(/\n/g, '\r\n'));
const fixtures = JSON.parse(gunzipSync(fs.readFileSync(new URL('fixtures/hls-20261004.json.gz', import.meta.url))));
for (const sample of fixtures) {
    const filtered = filter(sample.playlist, true, sample.url, sample.source);
    assert.equal((filtered.match(/^#EXTINF:/gm) || []).length, sample.kept, sample.source);
    if (sample.adDirectory) {
        assert.ok(!filtered.includes(sample.adDirectory), 'all copies of the confirmed inserted block must disappear');
        const originalContent = sample.playlist.split(/\r?\n/).filter(line => line && !line.startsWith('#') && !line.includes(sample.adDirectory));
        const keptContent = filtered.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
        assert.deepEqual(keptContent, originalContent, 'every content segment must survive in order');
    } else assert.equal(filtered, sample.playlist);
    assert.match(filtered, /#EXT-X-ENDLIST/);
    const proxyPlaylist = sample.playlist.split('\n').map(line => line.trim() && !line.startsWith('#') ? '/proxy/' + encodeURIComponent(new URL(line.trim(), sample.url).href) : line).join('\n');
    assert.equal((filter(proxyPlaylist, true, 'https://app.example/proxy/manifest', sample.source).match(/^#EXTINF:/gm) || []).length, sample.kept);
}
console.log('HLS ad filter regression checks passed');
