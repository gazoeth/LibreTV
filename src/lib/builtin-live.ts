/**
 * FreeDY 内置的公开频道。候选直播地址来自 GitHub 上 iptv-org/iptv 的
 * streams.json；仅保留频道方域名上的国际新闻频道，并在 2026-10-18
 * 检查了播放列表与首个媒体分片。地址可能按地区限制或由频道方调整。
 */
export const BUILTIN_LIVE_SOURCE_URL = '/api/live/builtin';

export const BUILTIN_LIVE_PLAYLIST = `#EXTM3U
#PLAYLIST:FreeDY 国际公开频道
#EXTINF:-1 tvg-id="CGTN.cn" group-title="国际新闻",CGTN（英语）
https://english-livebkali.cgtn.com/live/encgtn.m3u8
#EXTINF:-1 tvg-id="France24.fr" group-title="国际新闻",France 24（英语）
https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_900.m3u8
#EXTINF:-1 tvg-id="France24.fr" group-title="国际新闻",France 24（法语）
https://live.france24.com/hls/live/2037179/F24_FR_HI_HLS/master_900.m3u8
#EXTINF:-1 tvg-id="France24.fr" group-title="国际新闻",France 24（阿拉伯语）
https://live.france24.com/hls/live/2037222/F24_AR_HI_HLS/master_900.m3u8
#EXTINF:-1 tvg-id="France24.fr" group-title="国际新闻",France 24（西班牙语）
https://live.france24.com/hls/live/2037220/F24_ES_HI_HLS/master_900.m3u8
`;
