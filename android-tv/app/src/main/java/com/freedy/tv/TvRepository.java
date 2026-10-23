package com.freedy.tv;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** 目录使用现有站点协议；搜索与点播详情优先原生直连，避免旧 WebView 和 CORS 依赖。 */
public final class TvRepository {
    public static final String BASE_URL = "https://dy.dayiwu.com";
    public interface Callback<T> { void onSuccess(T value); void onError(String message); }
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService work = Executors.newFixedThreadPool(2);
    private final ExecutorService network = Executors.newFixedThreadPool(6);
    private volatile boolean closed;
    private volatile List<JSONObject> sources;

    public TvRepository(Context context) { this.context = context.getApplicationContext(); }
    private String base() {
        String value = context.getSharedPreferences("freedy_native", 0).getString("base_url", BASE_URL);
        return value != null && value.startsWith("https://") ? value.replaceAll("/+$", "") : BASE_URL;
    }
    private <T> void success(Callback<T> cb, T value) { main.post(() -> { if (!closed) cb.onSuccess(value); }); }
    private <T> void error(Callback<T> cb, Exception err) { main.post(() -> { if (!closed) cb.onError(message(err)); }); }
    private <T> void run(Callable<T> task, Callback<T> cb) {
        if (closed) return;
        work.submit(() -> { try { success(cb, task.call()); } catch (Exception err) { error(cb, err); } });
    }
    public void home(String kind, Callback<List<TvContent>> cb) {
        run(() -> {
            Map<String, String> names = new LinkedHashMap<>();
            names.put("western-tv", "western-series"); names.put("western-movie", "western-movies");
            names.put("jpkr-tv", "east-asian-series"); names.put("cn-anime", "chinese-anime");
            names.put("jpkr-variety", "variety-2026-jpkr");
            String actual = names.containsKey(kind) ? names.get(kind) : "western-series";
            List<TvContent> items;
            try {
                // 盒子可直接访问资源站，不要求首屏必须先连接 Cloudflare 网站。
                items = directHome(actual);
            } catch (Exception err) {
                try { items = siteItems(json(base() + "/api/home-catalog?kind=" + actual, 12000).optJSONArray("list")); }
                catch (Exception fallback) {
                    String cached = context.getSharedPreferences("freedy_native_catalog", 0).getString(actual, null);
                    if (cached == null) throw fallback;
                    JSONArray rows = new JSONArray(cached); items = new ArrayList<>();
                    for (int i = 0; i < rows.length(); i++) items.add(TvContent.fromJson(rows.optJSONObject(i)));
                }
            }
            JSONArray cache = new JSONArray(); for (TvContent item : items) cache.put(item.toJson());
            context.getSharedPreferences("freedy_native_catalog", 0).edit().putString(actual, cache.toString()).apply();
            return items;
        }, cb);
    }
    private List<TvContent> directHome(String kind) throws Exception {
        JSONArray builtins = new JSONObject(asset("sources.json")).getJSONArray("defaultSources");
        JSONObject source = null;
        for (int i = 0; i < builtins.length(); i++) if ("builtin_jisu".equals(builtins.getJSONObject(i).optString("key"))) source = builtins.getJSONObject(i);
        if (source == null) throw new Exception("首页来源尚未配置");
        String address = source.getString("url");
        JSONArray categories = json(Uri.parse(address).buildUpon().appendQueryParameter("ac", "list").build().toString(), 6500).optJSONArray("class");
        if (categories == null) throw new Exception("来源没有分类元数据");
        String pattern = "western-series".equals(kind) ? ".*欧美.*"
            : "east-asian-series".equals(kind) ? "韩剧|韩国剧|日剧|日本剧|日韩剧"
            : "chinese-anime".equals(kind) ? "国产动漫|中国动漫|大陆动漫"
            : "variety-2026-jpkr".equals(kind) ? ".*日韩综艺.*" : "动作片|科幻片|剧情片|喜剧片";
        LinkedHashMap<String, TvContent> found = new LinkedHashMap<>();
        int selected = 0;
        for (int i = 0; i < categories.length() && selected < 4; i++) {
            JSONObject category = categories.optJSONObject(i);
            if (category == null || !category.optString("type_name").matches(pattern)) continue;
            selected++;
            JSONObject page;
            try { page = json(cms(address, "t", category.optString("type_id")), 6500); }
            catch (Exception err) { continue; }
            JSONArray rows = page.optJSONArray("list");
            if (rows == null) continue;
            for (int j = 0; j < rows.length(); j++) {
                JSONObject row = rows.optJSONObject(j); if (row == null) continue;
                if ("western-movies".equals(kind) && !row.optString("vod_area").matches(".*(美国|英国|法国|德国|加拿大|意大利|西班牙|澳大利亚|欧美|欧洲|瑞典|挪威|丹麦|芬兰|爱尔兰).*")) continue;
                if ("variety-2026-jpkr".equals(kind) && !"2026".equals(row.optString("vod_year"))) continue;
                TvContent item = cmsItem(row, source);
                if (!item.id.isEmpty() && !item.title.isEmpty()) found.put(item.key(), item);
            }
        }
        if (found.isEmpty()) throw new Exception("该专题直连暂时没有结果");
        ArrayList<TvContent> result = new ArrayList<>(found.values());
        return new ArrayList<>(result.subList(0, Math.min(40, result.size())));
    }
    public void search(String query, Callback<List<TvContent>> cb) {
        if (closed) return;
        work.submit(() -> {
            List<Future<List<TvContent>>> futures = new ArrayList<>();
            try {
                List<JSONObject> available = getSources();
                CompletionService<List<TvContent>> completion = new ExecutorCompletionService<>(network);
                for (JSONObject source : available) futures.add(completion.submit(() -> searchOne(source, query)));
                LinkedHashMap<String, TvContent> grouped = new LinkedHashMap<>();
                int settled = 0, responded = 0;
                long deadline = System.currentTimeMillis() + 24000;
                while (!closed && settled < futures.size()) {
                    long left = deadline - System.currentTimeMillis(); if (left <= 0) break;
                    Future<List<TvContent>> result = completion.poll(left, TimeUnit.MILLISECONDS); if (result == null) break;
                    settled++;
                    try {
                        List<TvContent> items = result.get(); responded++;
                        for (TvContent item : items) {
                            String key = item.title.replaceAll("[\\s·：:()（）]", "").toLowerCase(java.util.Locale.ROOT);
                            TvContent first = grouped.get(key);
                            if (first == null) grouped.put(key, item);
                            else if (!first.sourceKey.equals(item.sourceKey)) first.alternatives.add(item);
                        }
                        if (!grouped.isEmpty()) success(cb, snapshot(grouped));
                    } catch (Exception ignored) { }
                }
                if (grouped.isEmpty() && responded == 0) throw new Exception("点播源暂时无法连接，请检查网络后重试");
                success(cb, snapshot(grouped));
            } catch (Exception err) { error(cb, err); }
            finally { for (Future<?> future : futures) future.cancel(true); }
        });
    }
    private List<TvContent> snapshot(Map<String, TvContent> grouped) {
        List<TvContent> copy = new ArrayList<>();
        for (TvContent item : grouped.values()) copy.add(TvContent.fromJson(item.toJson()));
        return copy;
    }
    public void detail(TvContent item, Callback<TvContent> cb) {
        run(() -> {
            if (item.live || !item.streamUrl.isEmpty() || !item.episodes.isEmpty()) return item;
            JSONObject source = sourceFor(item);
            try {
                JSONObject raw = json(cms(source.optString("url"), "ids", item.id), 10000);
                JSONArray list = raw.optJSONArray("list");
                if (list == null || list.length() == 0) throw new Exception("来源未返回剧集");
                TvContent resolved = TvContent.fromJson(item.toJson());
                JSONObject movie = list.getJSONObject(0);
                String[] lines = movie.optString("vod_play_url").split("\\$\\$\\$");
                for (String line : lines) {
                    ArrayList<String> episodes = new ArrayList<>();
                    for (String episode : line.split("#")) {
                        String url = episode.substring(episode.lastIndexOf('$') + 1).trim();
                        if (mediaUrl(url) && (url.contains("m3u8") || url.matches("(?i).+\\.(mp4|mkv|mp3|aac|m4a)(\\?.*)?"))) episodes.add(url);
                    }
                    if (episodes.size() > resolved.episodes.size()) resolved.episodes = episodes;
                }
                if (resolved.episodes.isEmpty()) throw new Exception("来源没有原生可播直链");
                return resolved;
            } catch (Exception original) {
                JSONObject raw = json(base() + "/api/detail?id=" + Uri.encode(item.id) + "&source=" + Uri.encode(source.toString()), 15000);
                TvContent resolved = TvContent.fromJson(item.toJson());
                JSONArray urls = raw.optJSONArray("episodes");
                if (urls != null) for (int i = 0; i < urls.length(); i++) if (mediaUrl(urls.optString(i))) resolved.episodes.add(urls.optString(i));
                if (resolved.episodes.isEmpty()) throw original;
                return resolved;
            }
        }, cb);
    }
    public void live(Callback<List<TvContent>> cb) { live("CN", cb); }
    public void radio(Callback<List<TvContent>> cb) { radio("CN", cb); }
    public void live(String country, Callback<List<TvContent>> cb) { run(() -> directory(false, country), cb); }
    public void radio(String country, Callback<List<TvContent>> cb) { run(() -> directory(true, country), cb); }
    public void regions(boolean radio, Callback<List<String[]>> cb) {
        run(() -> {
            JSONObject raw;
            try { raw = json(base() + (radio ? "/api/radio" : "/api/tv"), 6500); }
            catch (Exception err) { raw = new JSONObject(asset(radio ? "radio-regions.json" : "tv-regions.json")); }
            JSONArray rows = raw.optJSONArray("regions"); List<String[]> result = new ArrayList<>();
            if (rows != null) for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i); if (row == null) continue;
                result.add(new String[]{row.optString("code"), row.optString("name"), row.optString("count")});
            }
            return result;
        }, cb);
    }
    private List<TvContent> directory(boolean radio, String country) throws Exception {
        if (country == null || !country.matches("[A-Z]{2}")) throw new Exception("地区代码无效");
        JSONObject raw;
        try { raw = json(base() + (radio ? "/api/radio?country=" : "/api/tv?country=") + country, 10000); }
        catch (Exception err) {
            if (!"CN".equals(country)) throw err;
            raw = new JSONObject(asset(radio ? "radio-cn.json" : "tv-cn.json"));
        }
        JSONArray entries = raw.optJSONArray(radio ? "stations" : "channels");
        List<TvContent> result = new ArrayList<>();
        if (entries != null) for (int i = 0; i < entries.length(); i++) {
            JSONObject row = entries.optJSONObject(i); if (row == null || !mediaUrl(row.optString("url"))) continue;
            TvContent item = new TvContent(); item.id = row.optString("id"); item.title = row.optString("name");
            item.streamUrl = row.optString("url"); item.poster = row.optString("logo");
            item.sourceKey = radio ? "radio" : "tv"; item.sourceName = radio ? "广播" : "电视";
            item.subtitle = row.optString(radio ? "tags" : "group", item.sourceName); item.live = true;
            result.add(item);
        }
        return result;
    }
    private synchronized List<JSONObject> getSources() throws Exception {
        if (sources != null) return sources;
        JSONObject raw;
        try { raw = json(base() + "/api/status", 6000); }
        catch (Exception err) { raw = new JSONObject(asset("sources.json")); }
        JSONArray entries = raw.optJSONArray("defaultSources");
        List<JSONObject> result = new ArrayList<>();
        if (entries != null) for (int i = 0; i < entries.length(); i++) {
            JSONObject source = entries.optJSONObject(i);
            if (source != null && !source.optBoolean("isAdult") && source.optBoolean("enabledByDefault", true) && mediaUrl(source.optString("url"))) result.add(source);
        }
        if (result.isEmpty()) throw new Exception("没有可用的点播源配置");
        sources = result; return result;
    }
    private JSONObject sourceFor(TvContent item) throws Exception {
        if (!item.sourceUrl.isEmpty()) return new JSONObject().put("key", item.sourceKey).put("name", item.sourceName).put("url", item.sourceUrl);
        for (JSONObject source : getSources()) if (source.optString("key").equals(item.sourceKey)) return source;
        throw new Exception("此影片缺少来源地址，请重新搜索");
    }
    private List<TvContent> searchOne(JSONObject source, String query) throws Exception {
        JSONObject raw = json(cms(source.optString("url"), "wd", query), 6500);
        JSONArray entries = raw.optJSONArray("list");
        List<TvContent> result = new ArrayList<>();
        if (entries == null) throw new Exception("来源未返回有效列表");
        for (int i = 0; i < Math.min(entries.length(), 80); i++) {
            JSONObject row = entries.optJSONObject(i); if (row == null) continue;
            TvContent item = cmsItem(row, source);
            if (!item.id.isEmpty() && !item.title.isEmpty()) result.add(item);
        }
        return result;
    }
    private TvContent cmsItem(JSONObject row, JSONObject source) {
        TvContent item = new TvContent(); item.id = row.optString("vod_id"); item.title = row.optString("vod_name");
        item.poster = row.optString("vod_pic"); item.subtitle = row.optString("vod_year") + " · " + row.optString("vod_remarks");
        item.sourceKey = source.optString("key"); item.sourceName = source.optString("name"); item.sourceUrl = source.optString("url");
        return item;
    }
    private List<TvContent> siteItems(JSONArray entries) {
        List<TvContent> result = new ArrayList<>();
        if (entries != null) for (int i = 0; i < Math.min(entries.length(), 80); i++) {
            JSONObject row = entries.optJSONObject(i); if (row == null) continue;
            TvContent item = new TvContent(); item.id = row.optString("vodId"); item.title = row.optString("name");
            item.poster = row.optString("pic"); item.subtitle = row.optString("year") + " · " + row.optString("remarks");
            item.sourceKey = row.optString("sourceKey"); item.sourceName = row.optString("sourceName"); item.sourceUrl = row.optString("sourceUrl");
            if (!item.id.isEmpty() && !item.title.isEmpty()) result.add(item);
        }
        return result;
    }
    private String cms(String url, String name, String value) {
        return Uri.parse(url).buildUpon().appendQueryParameter("ac", "detail").appendQueryParameter(name, value).build().toString();
    }
    private static boolean mediaUrl(String url) { return url.startsWith("https://") || url.startsWith("http://"); }
    private JSONObject json(String url, int timeout) throws Exception {
        if (!mediaUrl(url)) throw new Exception("不支持的网络地址");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(Math.min(timeout, 8000)); connection.setReadTimeout(timeout);
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 FreeDYTV/2.0 Android");
        connection.setRequestProperty("Accept", "application/json,*/*");
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Exception("网络返回 HTTP " + status);
            try (InputStream stream = connection.getInputStream()) { return new JSONObject(read(stream)); }
        } finally { connection.disconnect(); }
    }
    private String asset(String name) throws Exception { try (InputStream stream = context.getAssets().open(name)) { return read(stream); } }
    private String read(InputStream stream) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] bytes = new byte[8192]; int size;
        while ((size = stream.read(bytes)) != -1) {
            if (Thread.currentThread().isInterrupted()) throw new Exception("请求已取消");
            if (out.size() + size > 4 * 1024 * 1024) throw new Exception("目录数据过大");
            out.write(bytes, 0, size);
        }
        return out.toString("UTF-8");
    }
    private String message(Exception err) {
        if (err instanceof javax.net.ssl.SSLException) return "安全连接失败，请检查盒子日期、时间和网络";
        if (err instanceof java.net.SocketTimeoutException) return "连接超时，请重试或切换网络";
        if (err instanceof java.net.UnknownHostException) return "无法解析地址，请检查盒子网络和 DNS";
        return err.getMessage() == null ? "暂时无法读取，请重试" : err.getMessage();
    }
    public void close() { closed = true; work.shutdownNow(); network.shutdownNow(); }
}
