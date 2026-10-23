package com.freedy.tv;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** 仅存于本机的收藏与最近观看；不读取旧网页存储或上传到服务端。 */
public final class TvStore {
    private final SharedPreferences prefs;
    public TvStore(Context context) { prefs = context.getSharedPreferences("freedy_native_library", Context.MODE_PRIVATE); }
    public List<TvContent> favorites() { return read("favorites"); }
    public List<TvContent> history() { return read("history"); }
    public boolean isFavorite(TvContent item) {
        for (TvContent saved : favorites()) if (saved.key().equals(item.key())) return true;
        return false;
    }
    public synchronized boolean toggleFavorite(TvContent item) {
        List<TvContent> items = favorites();
        for (int i = 0; i < items.size(); i++) if (items.get(i).key().equals(item.key())) {
            items.remove(i); write("favorites", items); return false;
        }
        items.add(0, TvContent.fromJson(item.toJson())); write("favorites", items); return true;
    }
    public int episode(TvContent item) { return prefs.getInt("episode:" + item.key(), item.episodeIndex); }
    public long position(TvContent item, int episode) {
        return Math.max(0, prefs.getLong("position:" + item.key() + ":" + episode, 0));
    }
    public synchronized void saveProgress(TvContent item, int episode, long positionMs) {
        if (item == null || item.title.isEmpty()) return;
        prefs.edit().putInt("episode:" + item.key(), episode)
            .putLong("position:" + item.key() + ":" + episode, item.live ? 0 : Math.max(0, positionMs)).apply();
        List<TvContent> items = history();
        for (int i = items.size() - 1; i >= 0; i--) if (items.get(i).key().equals(item.key())) items.remove(i);
        TvContent saved = TvContent.fromJson(item.toJson()); saved.episodeIndex = episode;
        items.add(0, saved); write("history", items);
    }
    private List<TvContent> read(String name) {
        ArrayList<TvContent> items = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs.getString(name, "[]"));
            for (int i = 0; i < Math.min(array.length(), 60); i++) items.add(TvContent.fromJson(array.optJSONObject(i)));
        } catch (Exception ignored) { }
        return items;
    }
    private void write(String name, List<TvContent> items) {
        JSONArray array = new JSONArray();
        for (int i = 0; i < Math.min(60, items.size()); i++) array.put(items.get(i).toJson());
        prefs.edit().putString(name, array.toString()).apply();
    }
}
