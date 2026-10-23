package com.freedy.tv;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;

/** 原生目录、播放页与本机收藏共用的内容模型。 */
public final class TvContent {
    public String id = "", title = "", poster = "", subtitle = "";
    public String sourceKey = "", sourceName = "", sourceUrl = "", streamUrl = "";
    public boolean live;
    public int episodeIndex;
    public ArrayList<String> episodes = new ArrayList<>();
    public ArrayList<TvContent> alternatives = new ArrayList<>();

    public String key() { return sourceKey + ":" + id + ":" + (live ? streamUrl : ""); }

    public JSONObject toJson() {
        JSONObject out = new JSONObject();
        try {
            out.put("id", id).put("title", title).put("poster", poster).put("subtitle", subtitle)
                .put("sourceKey", sourceKey).put("sourceName", sourceName).put("sourceUrl", sourceUrl)
                .put("streamUrl", streamUrl).put("live", live).put("episodeIndex", episodeIndex)
                .put("episodes", new JSONArray(episodes));
            JSONArray lines = new JSONArray();
            for (int i = 0; i < Math.min(20, alternatives.size()); i++) {
                TvContent item = alternatives.get(i);
                // 来源候选不再递归序列化，避免搜索结果产生环或膨胀。
                JSONObject line = new JSONObject();
                line.put("id", item.id).put("title", item.title).put("poster", item.poster)
                    .put("sourceKey", item.sourceKey).put("sourceName", item.sourceName).put("sourceUrl", item.sourceUrl);
                lines.put(line);
            }
            out.put("alternatives", lines);
        } catch (Exception ignored) { }
        return out;
    }

    public static TvContent fromJson(JSONObject raw) {
        TvContent item = new TvContent();
        if (raw == null) return item;
        item.id = raw.optString("id"); item.title = raw.optString("title");
        item.poster = raw.optString("poster"); item.subtitle = raw.optString("subtitle");
        item.sourceKey = raw.optString("sourceKey"); item.sourceName = raw.optString("sourceName");
        item.sourceUrl = raw.optString("sourceUrl"); item.streamUrl = raw.optString("streamUrl");
        item.live = raw.optBoolean("live"); item.episodeIndex = raw.optInt("episodeIndex");
        JSONArray episodes = raw.optJSONArray("episodes");
        if (episodes != null) for (int i = 0; i < episodes.length(); i++) item.episodes.add(episodes.optString(i));
        JSONArray lines = raw.optJSONArray("alternatives");
        if (lines != null) for (int i = 0; i < Math.min(lines.length(), 20); i++) item.alternatives.add(fromJson(lines.optJSONObject(i)));
        return item;
    }
}
