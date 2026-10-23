package com.freedy.tv;

import android.app.Application;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.view.KeyEvent;
import android.webkit.WebView;
import android.widget.TextView;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import static org.junit.Assert.*;

/** Android 9 原生页面与本机数据回归；不验证真机硬件解码或远程播放。 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@LooperMode(LooperMode.Mode.PAUSED)
public class NativeTvRegressionTest {
    private Application application;

    @Before public void resetLocalState() {
        application = RuntimeEnvironment.getApplication();
        application.getSharedPreferences("freedy_native_library", 0).edit().clear().commit();
        // PAUSED 主消息队列不执行首页延后的加载任务；测试不 idle 或恢复播放生命周期。
    }

    @Test public void android9HomeCreatesNativeUiAndFocusableSidebar() {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create();
        try {
            MainActivity activity = controller.get();
            View root = activity.findViewById(android.R.id.content);
            assertNotNull(findText(root, "FreeDY"));
            assertNotNull(findText(root, "精选推荐"));
            assertFalse("首页不应依赖系统 WebView", containsWebView(root));
            for (String label : new String[]{"首页", "影视", "电视", "广播", "收藏", "最近观看", "搜索", "设置"}) {
                TextView button = findText(root, label);
                assertNotNull(label, button);
                assertTrue(label + "必须可聚焦", button.isFocusable());
                assertTrue(label + "必须可操作", button.isClickable());
            }
        } finally { controller.destroy(); }
    }

    @Test public void android9PlayerCreatesNativeControlsWithoutStartingPlayback() {
        TvContent item = content("episode-test");
        Intent intent = new Intent(application, PlayerActivity.class)
                .putExtra("freedy.content", item.toJson().toString());
        ActivityController<PlayerActivity> controller = Robolectric.buildActivity(PlayerActivity.class, intent).create().visible();
        try {
            assertFalse(controller.get().isFinishing());
            View root = controller.get().findViewById(android.R.id.content);
            assertNotNull(findText(root, item.title));
            assertFalse("播放页不应包含 WebView", containsWebView(root));
            for (String label : new String[]{"暂停", "选集", "换源", "重试", "收藏"}) {
                TextView button = findText(root, label);
                assertNotNull(label, button);
                assertTrue(label + "必须可聚焦", button.isFocusable());
            }
        } finally { controller.destroy(); }
    }

    @Test public void favoritesRoundTripPreservesEpisodesAndSourceCandidates() {
        TvContent item = content("favorite-test");
        TvContent alternative = content("other-source"); alternative.sourceKey = "alternate";
        item.alternatives.add(alternative);
        TvStore store = new TvStore(application);
        assertTrue(store.toggleFavorite(item));
        TvContent restored = new TvStore(application).favorites().get(0);
        assertEquals(item.key(), restored.key());
        assertEquals(item.episodes, restored.episodes);
        assertEquals("alternate", restored.alternatives.get(0).sourceKey);
        assertFalse(store.toggleFavorite(item));
        assertTrue(new TvStore(application).favorites().isEmpty());
    }

    @Test public void playerCenterKeyActivatesFocusedFavoriteInsteadOfStealingFocus() {
        TvContent item = content("focused-favorite");
        Intent intent = new Intent(application, PlayerActivity.class)
                .putExtra("freedy.content", item.toJson().toString());
        ActivityController<PlayerActivity> controller = Robolectric.buildActivity(PlayerActivity.class, intent).create().visible();
        try {
            PlayerActivity activity = controller.get();
            View root = activity.findViewById(android.R.id.content);
            root.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
            root.layout(0, 0, 1920, 1080);
            TextView favorite = findText(root, "收藏");
            assertNotNull(favorite);
            assertTrue("收藏按钮应能真正获得焦点", favorite.requestFocus());
            assertTrue(favorite.isFocused());
            activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER));
            activity.dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_CENTER));
            // Android 按钮将确认键的点击投递到消息队列；仅播放页 create 阶段没有联网任务。
            org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
            assertTrue("确认键应操作当前焦点按钮", new TvStore(application).isFavorite(item));
        } finally { controller.destroy(); }
    }

    @Test public void historyDeduplicatesAndKeepsIndependentEpisodeProgress() {
        TvContent first = content("first"), second = content("second");
        TvStore store = new TvStore(application);
        store.saveProgress(first, 0, 12000);
        store.saveProgress(second, 0, 23000);
        store.saveProgress(first, 1, 45000);
        TvStore restored = new TvStore(application);
        assertEquals(2, restored.history().size());
        assertEquals(first.key(), restored.history().get(0).key());
        assertEquals(1, restored.episode(first));
        assertEquals(1, restored.history().get(0).episodeIndex);
        assertEquals(12000, restored.position(first, 0));
        assertEquals(45000, restored.position(first, 1));
        assertEquals(23000, restored.position(second, 0));
    }

    @Test public void liveHistoryDoesNotResumeStaleTimestampAndNegativePositionIsClamped() {
        TvStore store = new TvStore(application);
        TvContent live = content("channel"); live.live = true; live.streamUrl = "https://example.invalid/live.m3u8";
        store.saveProgress(live, 0, 90000);
        assertEquals(0, new TvStore(application).position(live, 0));
        TvContent vod = content("vod"); store.saveProgress(vod, 0, -30);
        assertEquals(0, new TvStore(application).position(vod, 0));
    }

    private static TvContent content(String id) {
        TvContent item = new TvContent(); item.id = id; item.title = "回归影片 " + id;
        item.sourceKey = "test-source"; item.sourceName = "测试来源";
        item.sourceUrl = "https://example.invalid/api";
        item.episodes.add("https://example.invalid/1.m3u8");
        item.episodes.add("https://example.invalid/2.m3u8");
        return item;
    }
    private static TextView findText(View view, String text) {
        if (view instanceof TextView && text.contentEquals(((TextView) view).getText())) return (TextView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                TextView found = findText(group.getChildAt(i), text); if (found != null) return found;
            }
        }
        return null;
    }
    private static boolean containsWebView(View view) {
        if (view instanceof WebView) return true;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) if (containsWebView(group.getChildAt(i))) return true;
        }
        return false;
    }
}
