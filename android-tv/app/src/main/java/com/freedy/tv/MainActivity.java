package com.freedy.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.TextUtils;
import android.util.LruCache;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 独立于网页引擎的电视首页，所有内容操作均可通过方向键及确认键完成。 */
public final class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService images = Executors.newFixedThreadPool(3);
    private final LruCache<String, Bitmap> imageCache = new LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getByteCount(); }
    };
    private static final String[] NAV = {"首页", "影视", "电视", "广播", "收藏", "最近观看", "搜索", "设置"};
    private static final String[] KINDS = {"western-tv", "western-movie", "jpkr-tv", "cn-anime", "jpkr-variety"};
    private static final String[] LABELS = {"欧美剧", "欧美电影", "日韩剧", "大陆动漫", "日韩综艺"};
    private final List<TextView> navViews = new ArrayList<>();
    private final List<View> tabViews = new ArrayList<>();
    private TvRepository repository;
    private TvStore store;
    private LinearLayout content;
    private LinearLayout tabs;
    private FrameLayout stage;
    private TextView heading;
    private int section = 0;
    private int kind = 0;
    private int requestId = 0;
    private boolean destroyed;
    private String query = "";
    private String tvRegion = "CN", tvRegionName = "中国";
    private String radioRegion = "CN", radioRegionName = "中国";
    private AlertDialog regionDialog;
    private View firstCard;
    private ScrollView currentScroll;
    private List<TvContent> visible = new ArrayList<>();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        getWindow().setNavigationBarColor(TvStyle.BG);
        repository = new TvRepository(this);
        store = new TvStore(this);
        SharedPreferences prefs = getSharedPreferences("freedy_native", MODE_PRIVATE);
        tvRegion = prefs.getString("tv_region", "CN"); tvRegionName = prefs.getString("tv_region_name", "中国");
        radioRegion = prefs.getString("radio_region", "CN"); radioRegionName = prefs.getString("radio_region_name", "中国");
        buildLayout();
        // 先完成原生页面创建，再调度目录读取，网络不参与启动界面构建。
        navViews.get(section).requestFocus();
        main.post(() -> { if (!destroyed) load(true); });
    }

    private int dp(float n) { return TvStyle.dp(this, n); }

    private void buildLayout() {
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.HORIZONTAL);
        shell.setBackgroundColor(TvStyle.BG);
        shell.setPadding(dp(22), dp(20), dp(24), dp(16));
        LinearLayout rail = new LinearLayout(this);
        rail.setOrientation(LinearLayout.VERTICAL);
        rail.setPadding(0, 0, dp(18), 0);
        shell.addView(rail, new LinearLayout.LayoutParams(dp(138), -1));
        TextView brand = TvStyle.text(this, "FreeDY", 26, TvStyle.GREEN);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        brand.setPadding(dp(10), dp(2), 0, dp(24));
        rail.addView(brand);
        for (int i = 0; i < NAV.length; i++) {
            final int target = i;
            TextView button = TvStyle.text(this, NAV[i], 17, TvStyle.TEXT);
            button.setId(View.generateViewId());
            button.setGravity(Gravity.CENTER_VERTICAL);
            button.setPadding(dp(15), 0, dp(8), 0);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(41));
            p.bottomMargin = dp(7);
            rail.addView(button, p);
            button.setOnClickListener(v -> selectSection(target));
            navViews.add(button);
        }
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(10), 0, dp(2), 0);
        shell.addView(content, new LinearLayout.LayoutParams(0, -1, 1));
        heading = TvStyle.text(this, "精选推荐", 23, TvStyle.TEXT);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.setPadding(0, dp(3), 0, dp(14));
        content.addView(heading, new LinearLayout.LayoutParams(-1, dp(48)));
        tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        content.addView(tabs, new LinearLayout.LayoutParams(-1, dp(43)));
        stage = new FrameLayout(this);
        content.addView(stage, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(shell);
        updateNav();
        updateTabs();
    }

    private void updateNav() {
        for (int i = 0; i < navViews.size(); i++) TvStyle.focus(navViews.get(i), section == i, false);
    }

    private void updateTabs() {
        tabs.removeAllViews(); tabViews.clear();
        boolean show = section >= 0 && section <= 3;
        tabs.setVisibility(show ? View.VISIBLE : View.GONE);
        if (!show) return;
        if (section == 2 || section == 3) {
            TextView region = TvStyle.text(this, "地区：" + (section == 3 ? radioRegionName : tvRegionName) + "  ▾", 14, TvStyle.GREEN);
            region.setId(View.generateViewId()); region.setGravity(Gravity.CENTER);
            region.setPadding(dp(16), 0, dp(16), 0);
            tabs.addView(region, new LinearLayout.LayoutParams(-2, dp(32)));
            TvStyle.focus(region, true, false);
            region.setNextFocusLeftId(navViews.get(section).getId());
            region.setOnClickListener(v -> chooseRegion());
            tabViews.add(region);
            return;
        }
        for (int i = 0; i < LABELS.length; i++) {
            final int value = i;
            TextView tab = TvStyle.text(this, LABELS[i], 14, i == kind ? TvStyle.GREEN : TvStyle.TEXT);
            tab.setId(View.generateViewId());
            tab.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(32), 1);
            p.rightMargin = dp(8);
            tabs.addView(tab, p);
            TvStyle.focus(tab, i == kind, false);
            tab.setOnClickListener(v -> { kind = value; updateTabs(); load(true); });
            if (i == 0) tab.setNextFocusLeftId(navViews.get(section).getId());
            tabViews.add(tab);
        }
    }

    private void chooseRegion() {
        if (regionDialog != null && regionDialog.isShowing()) return;
        final int targetSection = section;
        final int token = requestId;
        final boolean radio = section == 3;
        final String selectedCode = radio ? radioRegion : tvRegion;
        regionDialog = new AlertDialog.Builder(this).setTitle("选择地区")
                .setMessage("正在读取地区…").setNegativeButton("取消", null).create();
        final AlertDialog loading = regionDialog;
        loading.show();
        repository.regions(radio, new TvRepository.Callback<List<String[]>>() {
            @Override public void onSuccess(List<String[]> result) {
                if (destroyed || section != targetSection || token != requestId || !loading.isShowing()) {
                    loading.dismiss(); return;
                }
                loading.dismiss();
                List<String[]> regions = new ArrayList<>();
                if (result != null) for (String[] row : result) {
                    if (row != null && row.length >= 2 && !TextUtils.isEmpty(row[0])) regions.add(row);
                }
                if (regions.isEmpty()) { Toast.makeText(MainActivity.this, "暂无地区，请稍后重试", Toast.LENGTH_SHORT).show(); return; }
                String[] labels = new String[regions.size()];
                int selected = -1;
                for (int i = 0; i < regions.size(); i++) {
                    String[] row = regions.get(i);
                    labels[i] = row[1] + (row.length > 2 && !TextUtils.isEmpty(row[2]) ? "  ·  " + row[2] : "");
                    if (selectedCode.equalsIgnoreCase(row[0])) selected = i;
                }
                regionDialog = new AlertDialog.Builder(MainActivity.this).setTitle("选择地区")
                        .setSingleChoiceItems(labels, selected, (dialog, index) -> {
                            String[] row = regions.get(index);
                            SharedPreferences.Editor editor = getSharedPreferences("freedy_native", MODE_PRIVATE).edit();
                            if (radio) {
                                radioRegion = row[0]; radioRegionName = row[1];
                                editor.putString("radio_region", radioRegion).putString("radio_region_name", radioRegionName);
                            } else {
                                tvRegion = row[0]; tvRegionName = row[1];
                                editor.putString("tv_region", tvRegion).putString("tv_region_name", tvRegionName);
                            }
                            editor.apply(); dialog.dismiss(); updateTabs(); load(true);
                        }).setNegativeButton("取消", null).create();
                regionDialog.show();
            }
            @Override public void onError(String message) {
                boolean active = !destroyed && loading.isShowing() && section == targetSection && token == requestId;
                loading.dismiss();
                if (active) Toast.makeText(MainActivity.this, TextUtils.isEmpty(message) ? "地区读取失败，请重试" : message, Toast.LENGTH_LONG).show();
            }
        });
    }

    private void selectSection(int target) {
        if (target == 7) { settings(); return; }
        if (target == 6) { searchDialog(); return; }
        section = target;
        updateNav(); updateTabs(); load(true);
    }

    private void load(boolean focusResults) {
        final int token = ++requestId;
        heading.setText(section == 0 ? "精选推荐" : section == 6 ? "搜索 · " + query : NAV[section]);
        firstCard = null;
        visible = new ArrayList<>();
        showStatus("正在加载…", false);
        TvRepository.Callback<List<TvContent>> callback = new TvRepository.Callback<List<TvContent>>() {
            private boolean receivedResults;
            @Override public void onSuccess(List<TvContent> items) {
                if (destroyed || token != requestId) return;
                List<TvContent> snapshot = items == null ? new ArrayList<>() : items;
                render(snapshot, focusResults && !receivedResults);
                if (!snapshot.isEmpty()) receivedResults = true;
            }
            @Override public void onError(String message) {
                if (destroyed || token != requestId || receivedResults) return;
                showStatus(TextUtils.isEmpty(message) ? "暂时无法连接" : message, true);
            }
        };
        if (section == 4) callback.onSuccess(store.favorites());
        else if (section == 5) callback.onSuccess(store.history());
        else if (section == 2) repository.live(tvRegion, callback);
        else if (section == 3) repository.radio(radioRegion, callback);
        else if (section == 6) repository.search(query, callback);
        else repository.home(KINDS[kind], callback);
    }

    private void showStatus(String message, boolean retry) {
        currentScroll = null;
        stage.removeAllViews();
        if (!retry && "正在加载…".equals(message)) {
            LinearLayout skeletons = new LinearLayout(this);
            skeletons.setPadding(dp(3), dp(12), 0, 0);
            for (int i = 0; i < 5; i++) {
                View skeleton = new View(this);
                skeleton.setBackground(TvStyle.panel(TvStyle.PANEL, 0, 0, dp(9)));
                LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(212), 1);
                p.rightMargin = dp(12);
                skeletons.addView(skeleton, p);
            }
            stage.addView(skeletons, new FrameLayout.LayoutParams(-1, -2));
            TextView loading = TvStyle.text(this, message, 14, TvStyle.MUTED);
            FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
            p.bottomMargin = dp(16);
            stage.addView(loading, p);
            if (getCurrentFocus() == null) navViews.get(section).requestFocus();
            return;
        }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER);
        TextView text = TvStyle.text(this, message, 17, TvStyle.MUTED);
        text.setGravity(Gravity.CENTER); text.setMaxLines(3);
        box.addView(text, new LinearLayout.LayoutParams(-1, dp(80)));
        TextView retryButton = null;
        if (retry) {
            TextView button = TvStyle.text(this, "重试", 17, TvStyle.GREEN);
            button.setGravity(Gravity.CENTER); TvStyle.focus(button, false, false);
            box.addView(button, new LinearLayout.LayoutParams(dp(130), dp(44)));
            button.setOnClickListener(v -> load(true));
            retryButton = button;
        }
        stage.addView(box, new FrameLayout.LayoutParams(-1, -1));
        if (retryButton != null) retryButton.requestFocus();
    }

    private void render(List<TvContent> items, boolean focusResults) {
        // 搜索会分批返回完整快照，重建封面前保留遥控器焦点与滚动位置。
        View focused = getCurrentFocus();
        String focusedKey = focused != null && focused.getTag() instanceof String ? (String) focused.getTag() : null;
        boolean focusWasInResults = currentScroll != null && currentScroll.hasFocus();
        int scrollPosition = currentScroll == null ? 0 : currentScroll.getScrollY();
        visible = new ArrayList<>(items);
        if (items.isEmpty()) {
            String empty = section == 4 ? "长按封面可加入收藏" : section == 5 ? "播放过的节目会出现在这里" : "暂无内容";
            showStatus(empty, section != 4 && section != 5);
            if (section == 4 || section == 5) navViews.get(section).requestFocus();
            return;
        }
        stage.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        scroll.setClipToPadding(false); scroll.setClipChildren(false);
        scroll.setPadding(dp(4), dp(9), dp(8), dp(16));
        scroll.setFillViewport(false);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(5); grid.setClipChildren(false); grid.setClipToPadding(false);
        int available = getResources().getDisplayMetrics().widthPixels - dp(210);
        int cardWidth = Math.max(dp(85), available / 5 - dp(12));
        final List<View> cards = new ArrayList<>();
        View restoredCard = null;
        for (int i = 0; i < items.size(); i++) {
            TvContent item = items.get(i);
            LinearLayout card = card(item, cardWidth);
            card.setId(View.generateViewId());
            card.setTag(item.key());
            if (item.key().equals(focusedKey)) restoredCard = card;
            GridLayout.LayoutParams p = new GridLayout.LayoutParams();
            p.width = cardWidth; p.height = ViewGroup.LayoutParams.WRAP_CONTENT;
            p.setMargins(dp(3), dp(3), dp(9), dp(15));
            grid.addView(card, p); cards.add(card);
            card.setOnClickListener(v -> PlayerActivity.open(MainActivity.this, item, visible));
            card.setOnLongClickListener(v -> {
                boolean wasFavorite = store.isFavorite(item);
                store.toggleFavorite(item);
                Toast.makeText(this, wasFavorite ? "已取消收藏" : "已加入收藏", Toast.LENGTH_SHORT).show();
                if (section == 4) load(true);
                return true;
            });
        }
        for (int i = 0; i < cards.size(); i++) {
            View v = cards.get(i);
            if (i % 5 == 0) v.setNextFocusLeftId(navViews.get(section).getId());
            if (i >= 5) v.setNextFocusUpId(cards.get(i - 5).getId());
            else if (!tabViews.isEmpty()) v.setNextFocusUpId(tabViews.get(Math.min(kind, tabViews.size() - 1)).getId());
            if (i + 5 < cards.size()) v.setNextFocusDownId(cards.get(i + 5).getId());
        }
        firstCard = cards.get(0);
        for (TextView nav : navViews) nav.setNextFocusRightId(firstCard.getId());
        for (View tab : tabViews) tab.setNextFocusDownId(firstCard.getId());
        scroll.addView(grid, new ScrollView.LayoutParams(-1, -2));
        stage.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        currentScroll = scroll;
        if (focusWasInResults) {
            (restoredCard != null ? restoredCard : firstCard).requestFocus();
        } else if (focusResults) {
            firstCard.requestFocus();
        } else if (focused != null && focused.isAttachedToWindow()) {
            focused.requestFocus();
        }
        // 布局完成后还原偏移，防止批次刷新把已浏览的位置拉回顶部。
        if (!focusResults || focusWasInResults) scroll.post(() -> {
            if (!destroyed && currentScroll == scroll) scroll.scrollTo(0, scrollPosition);
        });
    }

    private LinearLayout card(TvContent item, int width) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(3), dp(3), dp(3), dp(6));
        TvStyle.focus(card, false, true);
        FrameLayout cover = new FrameLayout(this);
        boolean landscape = section == 2 || section == 3;
        card.addView(cover, new LinearLayout.LayoutParams(-1, landscape ? width * 3 / 4 : width * 3 / 2));
        TextView placeholder = TvStyle.text(this, item.title, landscape ? 19 : 16, TvStyle.MUTED);
        placeholder.setGravity(Gravity.CENTER); placeholder.setPadding(dp(8), dp(8), dp(8), dp(8));
        cover.addView(placeholder, new FrameLayout.LayoutParams(-1, -1));
        ImageView image = new ImageView(this);
        image.setScaleType(landscape ? ImageView.ScaleType.FIT_CENTER : ImageView.ScaleType.CENTER_CROP);
        image.setContentDescription(item.title);
        cover.addView(image, new FrameLayout.LayoutParams(-1, -1));
        loadImage(image, item.poster);
        TextView title = TvStyle.text(this, item.title, 13, TvStyle.TEXT);
        title.setSingleLine(true); title.setEllipsize(TextUtils.TruncateAt.END);
        title.setPadding(dp(4), dp(8), dp(4), dp(2));
        card.addView(title, new LinearLayout.LayoutParams(-1, -2));
        card.setContentDescription(item.title + "，确认播放，长按收藏");
        return card;
    }

    private void loadImage(ImageView image, String url) {
        if (TextUtils.isEmpty(url) || destroyed) return;
        Uri uri = Uri.parse(url);
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) return;
        image.setTag(url);
        Bitmap cached = imageCache.get(url);
        if (cached != null) { image.setImageBitmap(cached); return; }
        images.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
                connection.setRequestProperty("User-Agent", "FreeDY-TV/2.0");
                connection.setInstanceFollowRedirects(true);
                if (connection.getResponseCode() != 200) return;
                // 先读取尺寸并按电视卡片大小采样，避免大海报耗尽盒子内存。
                java.io.InputStream stream = connection.getInputStream();
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n, total = 0;
                try { while ((n = stream.read(buf)) != -1) { total += n; if (total > 3 * 1024 * 1024) return; out.write(buf, 0, n); } }
                finally { stream.close(); }
                byte[] bytes = out.toByteArray();
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                if (options.outWidth <= 0 || options.outHeight <= 0) return;
                options.inSampleSize = 1;
                while (options.outWidth / options.inSampleSize > 480 || options.outHeight / options.inSampleSize > 720) options.inSampleSize *= 2;
                options.inJustDecodeBounds = false; options.inPreferredConfig = Bitmap.Config.RGB_565;
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                if (bitmap == null) return;
                imageCache.put(url, bitmap);
                main.post(() -> { if (!destroyed && url.equals(image.getTag())) image.setImageBitmap(bitmap); });
            } catch (Exception ignored) { /* 海报失败时保留标题占位，不影响节目操作。 */ }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    private void searchDialog() {
        EditText field = new EditText(this);
        field.setSingleLine(true); field.setText(query); field.setTextColor(TvStyle.TEXT);
        field.setHintTextColor(TvStyle.MUTED); field.setHint("输入影片或剧集名称");
        field.setInputType(InputType.TYPE_CLASS_TEXT); field.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        field.setPadding(dp(20), dp(15), dp(20), dp(15));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("搜索")
                .setView(field).setNegativeButton("取消", null).setPositiveButton("搜索", null).create();
        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> performSearch(field, dialog));
            field.setOnEditorActionListener((v, action, event) -> {
                if (action == EditorInfo.IME_ACTION_SEARCH) { performSearch(field, dialog); return true; } return false;
            });
            field.requestFocus();
        });
        dialog.show();
    }

    private void performSearch(EditText field, AlertDialog dialog) {
        String value = field.getText().toString().trim();
        if (value.isEmpty()) { field.setError("请输入名称"); return; }
        query = value; section = 6; dialog.dismiss(); updateNav(); updateTabs(); load(true);
    }

    private void settings() {
        SharedPreferences prefs = getSharedPreferences("freedy_native", MODE_PRIVATE);
        String version = "";
        try { version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception ignored) { }
        new AlertDialog.Builder(this).setTitle("FreeDY TV · " + version)
                .setMessage("Android " + Build.VERSION.RELEASE + "  ·  " + Build.MODEL + "\n\n" + prefs.getString("base_url", TvRepository.BASE_URL))
                .setPositiveButton("修改站点", (d, w) -> editSite())
                .setNeutralButton("清除海报缓存", (d, w) -> { imageCache.evictAll(); Toast.makeText(this, "海报缓存已清除", Toast.LENGTH_SHORT).show(); })
                .setNegativeButton("关闭", null).show();
    }

    private void editSite() {
        SharedPreferences prefs = getSharedPreferences("freedy_native", MODE_PRIVATE);
        EditText field = new EditText(this);
        field.setSingleLine(true); field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        field.setText(prefs.getString("base_url", TvRepository.BASE_URL));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("站点地址")
                .setView(field).setPositiveButton("保存", null).setNegativeButton("取消", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String value = field.getText().toString().trim();
            Uri uri = Uri.parse(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || TextUtils.isEmpty(uri.getHost()) || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null || (!TextUtils.isEmpty(uri.getPath()) && !"/".equals(uri.getPath()))) {
                field.setError("请输入 HTTPS 站点根地址"); return;
            }
            while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
            prefs.edit().putString("base_url", value).apply();
            repository.close(); repository = new TvRepository(this);
            dialog.dismiss(); load(true);
        }));
        dialog.show();
    }

    @Override protected void onResume() {
        super.onResume();
        if (store != null && (section == 4 || section == 5)) load(true);
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_SEARCH) { searchDialog(); return true; }
        if (keyCode == KeyEvent.KEYCODE_MENU) { settings(); return true; }
        return super.onKeyDown(keyCode, event);
    }

    @Override @SuppressWarnings("deprecation") public void onBackPressed() {
        if (section != 0) { section = 0; updateNav(); updateTabs(); load(true); return; }
        new AlertDialog.Builder(this).setTitle("退出 FreeDY？")
                .setPositiveButton("退出", (d, w) -> finish()).setNegativeButton("继续观看", null).show();
    }

    @Override protected void onDestroy() {
        destroyed = true; requestId++; repository.close(); images.shutdownNow();
        if (regionDialog != null) regionDialog.dismiss();
        main.removeCallbacksAndMessages(null); imageCache.evictAll();
        super.onDestroy();
    }
}
