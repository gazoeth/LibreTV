package com.freedy.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.media3.common.MediaItem;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** 电视原生播放页：不使用系统 WebView，所有操作均支持方向键。 */
public final class PlayerActivity extends Activity {
    private static final int GREEN = Color.rgb(196, 237, 84);
    private static final String EXTRA_CONTENT = "freedy.content";
    private static final String EXTRA_QUEUE = "freedy.queue";
    private static final Object QUEUE_LOCK = new Object();
    private static String pendingQueueKey;
    private static ArrayList<TvContent> pendingQueue = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ArrayList<TvContent> queue = new ArrayList<>();
    private TvContent content;
    private TvRepository repository;
    private TvStore store;
    private FrameLayout root, videoHost, shade;
    private LinearLayout controls, panel;
    private TextView title, state, clock;
    private Button playButton, kernelButton;
    private PlayerView playerView;
    private SurfaceView surfaceView;
    private ExoPlayer exo;
    private MediaPlayer platform;
    private boolean platformPrepared, usePlatform, fallbackUsed, active, failed, desiredPlay = true;
    private boolean resolving, episodeCompleted, findingSources, sourceSearchAttempted, showingSources;
    private int sourceGeneration;
    private LinearLayout sourceList;
    private TextView sourceStatus;
    private Button sourceRetry;
    private final ArrayList<String> renderedSources = new ArrayList<>();
    private int playbackGeneration;
    private int episode, generation, queueIndex;
    private long resumePosition;
    private String currentUrl = "";
    private final Runnable hideControls = () -> {
        if (panel.getVisibility() != View.VISIBLE && !failed && isPlaying()) {
            shade.setVisibility(View.GONE);
            root.requestFocus();
        }
    };
    private final Runnable startupTimeout = () -> failPlayback("连接超时，请重试或切换来源", true);
    private final Runnable progressTick = new Runnable() {
        @Override public void run() {
            if (!active) return;
            updateProgress();
            handler.postDelayed(this, 1000);
        }
    };

    /** 队列留在进程内，Intent 只携带当前条目，避免封面列表超过 Binder 限额。 */
    public static void open(Activity activity, TvContent item, List<TvContent> items) {
        String key = Long.toHexString(System.nanoTime());
        synchronized (QUEUE_LOCK) {
            pendingQueueKey = key;
            pendingQueue = items == null ? new ArrayList<>() : new ArrayList<>(items);
        }
        Intent intent = new Intent(activity, PlayerActivity.class);
        intent.putExtra(EXTRA_CONTENT, item.toJson().toString());
        intent.putExtra(EXTRA_QUEUE, key);
        activity.startActivity(intent);
    }

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        store = new TvStore(this);
        repository = new TvRepository(this);
        try {
            String json = saved != null ? saved.getString(EXTRA_CONTENT) : getIntent().getStringExtra(EXTRA_CONTENT);
            content = TvContent.fromJson(new JSONObject(json));
        } catch (Exception error) { finish(); return; }
        synchronized (QUEUE_LOCK) {
            if (getIntent().getStringExtra(EXTRA_QUEUE) != null
                    && getIntent().getStringExtra(EXTRA_QUEUE).equals(pendingQueueKey)) queue.addAll(pendingQueue);
        }
        episode = saved == null ? store.episode(content) : saved.getInt("episode", 0);
        usePlatform = saved != null && saved.getBoolean("platform", false);
        resumePosition = saved == null ? store.position(content, episode) : saved.getLong("position", 0);
        for (int i = 0; i < queue.size(); i++) if (sameItem(queue.get(i), content)) queueIndex = i;
        createUi();
    }

    private void createUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setFocusable(true);
        root.setFocusableInTouchMode(true);
        videoHost = new FrameLayout(this);
        root.addView(videoHost, match());
        shade = new FrameLayout(this);
        GradientDrawable backdrop = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xB8000000, 0x11000000, 0xE8000000});
        shade.setBackground(backdrop);
        root.addView(shade, match());
        title = text(content.title, 24, Color.WHITE);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        titleParams.setMargins(dp(40), dp(26), dp(40), 0);
        shade.addView(title, titleParams);
        state = text("准备播放…", 18, 0xFFD4D9CD);
        state.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams stateParams = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
        stateParams.setMargins(dp(40), 0, dp(40), 0);
        shade.addView(state, stateParams);
        controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(dp(40), dp(16), dp(40), dp(26));
        FrameLayout.LayoutParams controlParams = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        shade.addView(controls, controlParams);
        clock = text("", 16, 0xFFCFD7C5);
        controls.addView(clock);
        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        controls.addView(actions);
        playButton = button("暂停", v -> togglePlay());
        addAction(actions, playButton);
        addAction(actions, button(content.live ? "频道" : "选集", v -> showItems(false)));
        addAction(actions, button("换源", v -> showItems(true)));
        kernelButton = button("内核：标准", v -> switchKernel());
        addAction(actions, kernelButton);
        addAction(actions, button("重试", v -> { fallbackUsed = false; startStream(); }));
        addAction(actions, button(store.isFavorite(content) ? "已收藏" : "收藏", v -> {
            store.toggleFavorite(content);
            ((Button) v).setText(store.isFavorite(content) ? "已收藏" : "收藏");
        }));
        TextView help = text("左右快进退  ·  上下选集/换台  ·  菜单打开控制  ·  返回关闭", 13, 0xFF9CA591);
        help.setPadding(0, dp(12), 0, 0);
        controls.addView(help);
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(24), dp(26), dp(24), dp(24));
        panel.setBackgroundColor(0xF51A1F17);
        FrameLayout.LayoutParams panelParams = new FrameLayout.LayoutParams(dp(340), -1, Gravity.RIGHT);
        root.addView(panel, panelParams);
        panel.setVisibility(View.GONE);
        setContentView(root);
        root.requestFocus();
    }

    private void addAction(LinearLayout row, Button button) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(52), 1);
        p.setMargins(0, dp(12), dp(8), 0);
        row.addView(button, p);
    }

    private Button button(String label, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(16);
        b.setAllCaps(false);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(dp(8), 0, dp(8), 0);
        b.setFocusable(true);
        b.setTextColor(new ColorStateList(new int[][]{new int[]{android.R.attr.state_focused}, new int[]{}},
                new int[]{Color.BLACK, Color.WHITE}));
        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_focused}, rounded(GREEN, GREEN));
        bg.addState(new int[]{}, rounded(0xFF252D21, 0xFF414C38));
        b.setBackground(bg);
        b.setOnClickListener(v -> {
            showControls(false);
            click.onClick(v);
            if (!failed && panel.getVisibility() != View.VISIBLE) scheduleHide();
        });
        b.setOnFocusChangeListener((v, hasFocus) -> {
            v.animate().scaleX(hasFocus ? 1.035f : 1).scaleY(hasFocus ? 1.035f : 1).setDuration(130).start();
            if (hasFocus) handler.removeCallbacks(hideControls);
        });
        return b;
    }

    private GradientDrawable rounded(int fill, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(9));
        drawable.setStroke(dp(2), stroke);
        return drawable;
    }

    private void resolveContent() {
        if (!active || resolving) return;
        if (hasStream(content)) { startStream(); return; }
        resolving = true;
        int request = ++generation;
        state.setText("正在获取播放地址…");
        showControls(false);
        repository.detail(content, new TvRepository.Callback<TvContent>() {
            @Override public void onSuccess(TvContent result) {
                if (request != generation || !active) return;
                resolving = false;
                if (result.alternatives.isEmpty()) result.alternatives.addAll(content.alternatives);
                content = result;
                episode = Math.min(episode, Math.max(0, content.episodes.size() - 1));
                startStream();
            }
            @Override public void onError(String message) {
                if (request != generation || !active) return;
                resolving = false;
                failPlayback("无法获取资源：" + message, false);
            }
        });
    }

    private boolean hasStream(TvContent item) {
        return (item.streamUrl != null && !item.streamUrl.isEmpty())
                || (item.episodes != null && !item.episodes.isEmpty());
    }

    private void startStream() {
        if (!active) return;
        if (!hasStream(content)) { resolveContent(); return; }
        releasePlayers();
        failed = false;
        episodeCompleted = false;
        if (!content.episodes.isEmpty()) episode = Math.max(0, Math.min(episode, content.episodes.size() - 1));
        episode = Math.max(0, Math.min(episode, Math.max(0, content.episodes.size() - 1)));
        currentUrl = content.episodes != null && !content.episodes.isEmpty()
                ? content.episodes.get(Math.max(0, Math.min(episode, content.episodes.size() - 1))) : content.streamUrl;
        Uri uri = Uri.parse(currentUrl == null ? "" : currentUrl);
        if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))) {
            failPlayback("播放地址无效，请切换来源", false); return;
        }
        title.setText(content.title + (!content.live && content.episodes.size() > 1 ? "  ·  第 " + (episode + 1) + " 集" : ""));
        kernelButton.setText(usePlatform ? "内核：兼容" : "内核：标准");
        state.setText("正在连接…");
        showControls(false);
        handler.postDelayed(startupTimeout, 22000);
        if (usePlatform) startPlatform(uri); else startExo(uri);
    }

    @androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
    private void startExo(Uri uri) {
        final int playbackRequest = playbackGeneration;
        try {
            playerView = new PlayerView(this);
            playerView.setUseController(false);
            playerView.setFocusable(false);
            videoHost.addView(playerView, match());
            DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
                    .setEnableDecoderFallback(true);
            DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                    .setBufferDurationsMs(10000, 25000, 1000, 2000)
                    .setTargetBufferBytes(16 * 1024 * 1024)
                    .setPrioritizeTimeOverSizeThresholds(false)
                    .build();
            DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                    .setUserAgent("Mozilla/5.0 (Linux; Android) FreeDYTV/2.0")
                    .setConnectTimeoutMs(8000).setReadTimeoutMs(15000)
                    .setAllowCrossProtocolRedirects(true);
            exo = new ExoPlayer.Builder(this, renderers).setLoadControl(loadControl)
                    .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http))).build();
            exo.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
            playerView.setPlayer(exo);
            final ExoPlayer currentPlayer = exo;
            exo.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int playbackState) {
                    if (!active || playbackRequest != playbackGeneration || exo != currentPlayer) return;
                    if (playbackState == Player.STATE_READY) ready();
                    else if (playbackState == Player.STATE_BUFFERING) {
                        state.setText("缓冲中…");
                        showControls(false);
                        handler.removeCallbacks(startupTimeout);
                        handler.postDelayed(startupTimeout, 22000);
                    } else if (playbackState == Player.STATE_ENDED) ended();
                }
                @Override public void onPlayerError(PlaybackException error) {
                    if (!active || playbackRequest != playbackGeneration || exo != currentPlayer) return;
                    failPlayback("播放失败（" + error.getErrorCodeName() + "）", true);
                }
                @Override public void onIsPlayingChanged(boolean playing) {
                    if (!active || playbackRequest != playbackGeneration || exo != currentPlayer) return;
                    playButton.setText(playing ? "暂停" : "播放");
                    if (playing) { state.setText(""); scheduleHide(); }
                }
            });
            exo.setMediaItem(MediaItem.fromUri(uri));
            if (!content.live && resumePosition > 0) exo.seekTo(resumePosition);
            exo.prepare();
            exo.setPlayWhenReady(desiredPlay);
        } catch (Exception error) { failPlayback("标准内核初始化失败", true); }
    }

    private void startPlatform(Uri uri) {
        final int playbackRequest = playbackGeneration;
        final SurfaceView currentSurface = new SurfaceView(this);
        surfaceView = currentSurface;
        videoHost.addView(currentSurface, match());
        currentSurface.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder holder) {
                if (!active || playbackRequest != playbackGeneration || surfaceView != currentSurface || platform != null) return;
                try {
                    final MediaPlayer next = new MediaPlayer();
                    platform = next;
                    next.setDisplay(holder);
                    next.setScreenOnWhilePlaying(true);
                    next.setAudioAttributes(new android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MOVIE).build());
                    next.setDataSource(PlayerActivity.this, uri);
                    next.setOnPreparedListener(mp -> {
                        if (platform != mp || !active || playbackRequest != playbackGeneration) return;
                        platformPrepared = true;
                        fitPlatformVideo(mp.getVideoWidth(), mp.getVideoHeight());
                        if (!content.live && resumePosition > 0) mp.seekTo((int) Math.min(Integer.MAX_VALUE, resumePosition));
                        if (desiredPlay) mp.start();
                        ready();
                    });
                    next.setOnVideoSizeChangedListener((mp, width, height) -> {
                        if (active && playbackRequest == playbackGeneration && platform == mp) fitPlatformVideo(width, height);
                    });
                    next.setOnCompletionListener(mp -> {
                        if (active && playbackRequest == playbackGeneration && platform == mp) ended();
                    });
                    next.setOnErrorListener((mp, what, extra) -> {
                        if (active && playbackRequest == playbackGeneration && platform == mp) failPlayback("兼容内核无法播放（" + what + "/" + extra + "）", false);
                        return true;
                    });
                    next.setOnInfoListener((mp, what, extra) -> {
                        if (!active || playbackRequest != playbackGeneration || platform != mp) return false;
                        if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) {
                            state.setText("缓冲中…"); showControls(false);
                            handler.removeCallbacks(startupTimeout); handler.postDelayed(startupTimeout, 22000);
                        } else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END || what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) ready();
                        return false;
                    });
                    next.prepareAsync();
                } catch (Exception error) { failPlayback("兼容内核连接失败，请换源", false); }
            }
            @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) { }
            @Override public void surfaceDestroyed(SurfaceHolder holder) { }
        });
    }

    private void fitPlatformVideo(int width, int height) {
        if (surfaceView == null || width <= 0 || height <= 0) return;
        int availableW = videoHost.getWidth(), availableH = videoHost.getHeight();
        if (availableW == 0 || availableH == 0) return;
        float scale = Math.min(availableW / (float) width, availableH / (float) height);
        surfaceView.setLayoutParams(new FrameLayout.LayoutParams(Math.round(width * scale), Math.round(height * scale), Gravity.CENTER));
    }

    private void ready() {
        handler.removeCallbacks(startupTimeout);
        failed = false;
        state.setText("");
        playButton.setText(isPlaying() ? "暂停" : "播放");
        scheduleHide();
    }

    private void failPlayback(String message, boolean canFallback) {
        if (!active) return;
        handler.removeCallbacks(startupTimeout);
        if (canFallback && !fallbackUsed && !usePlatform) {
            resumePosition = Math.max(resumePosition, position());
            fallbackUsed = true;
            usePlatform = true;
            startStream();
            state.setText("已切换兼容内核，正在连接…");
            return;
        }
        savePosition();
        releasePlayers();
        failed = true;
        state.setText(message + "\n请选择重试、换内核或换源");
        showControls(true);
        playButton.setText("播放");
    }

    private void switchKernel() {
        resumePosition = Math.max(resumePosition, position());
        usePlatform = !usePlatform;
        fallbackUsed = true;
        startStream();
    }

    private void togglePlay() {
        if (failed) { fallbackUsed = false; startStream(); return; }
        desiredPlay = !(exo != null ? exo.getPlayWhenReady() : desiredPlay);
        try {
            if (exo != null) exo.setPlayWhenReady(desiredPlay);
            else if (platform != null && platformPrepared) {
                if (desiredPlay) platform.start(); else platform.pause();
            }
        } catch (IllegalStateException error) { failPlayback("播放状态异常，请重试", false); return; }
        playButton.setText(desiredPlay ? "暂停" : "播放");
        showControls(false);
        if (desiredPlay) scheduleHide();
    }

    private boolean isPlaying() {
        try { return exo != null ? exo.isPlaying() : platform != null && platformPrepared && platform.isPlaying(); }
        catch (IllegalStateException error) { return false; }
    }
    private long position() {
        try { return exo != null ? Math.max(0, exo.getCurrentPosition()) : platform != null && platformPrepared ? platform.getCurrentPosition() : resumePosition; }
        catch (IllegalStateException error) { return resumePosition; }
    }
    private long duration() {
        try { return exo != null ? Math.max(0, exo.getDuration()) : platform != null && platformPrepared ? Math.max(0, platform.getDuration()) : 0; }
        catch (IllegalStateException error) { return 0; }
    }
    private void seek(int seconds) {
        if (content.live) { showItems(false); return; }
        long target = Math.max(0, position() + seconds * 1000L);
        long total = duration();
        if (total > 0) target = Math.min(target, Math.max(0, total - 1000));
        if (exo != null) exo.seekTo(target);
        else if (platform != null && platformPrepared) platform.seekTo((int) Math.min(Integer.MAX_VALUE, target));
        resumePosition = target;
        updateProgress(); showControls(false); scheduleHide();
    }
    private void updateProgress() {
        if (content.live) clock.setText("直播  ·  " + safe(content.sourceName));
        else clock.setText(time(position()) + " / " + time(duration()) + "  ·  " + safe(content.sourceName));
    }
    private String time(long ms) {
        long seconds = Math.max(0, ms / 1000);
        return seconds >= 3600 ? String.format(Locale.ROOT, "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
                : String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
    }

    private void showItems(boolean sources) {
        showingSources = sources;
        showControls(false);
        panel.removeAllViews();
        TextView heading = text(sources ? "选择来源" : content.live ? "选择频道" : "选择剧集", 23, Color.WHITE);
        heading.setPadding(0, 0, 0, dp(18));
        panel.addView(heading);
        ScrollView scroll = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if (sources) {
            addPanelButton(list, safe(content.sourceName) + " · 当前", v -> closePanel());
            sourceList = list;
            renderedSources.clear();
            sourceStatus = text("", 16, 0xFFB0BAA5);
            list.addView(sourceStatus);
            sourceRetry = button("重新查找", v -> findSources());
            list.addView(sourceRetry, new LinearLayout.LayoutParams(-1, dp(52)));
            appendSources();
        } else if (content.live) {
            if (queue.isEmpty()) addPanelButton(list, content.title, v -> closePanel());
            for (int i = 0; i < queue.size(); i++) {
                final int index = i;
                TvContent item = queue.get(i);
                addPanelButton(list, item.title + (sameItem(item, content) ? " · 当前" : ""), v -> {
                    queueIndex = index; selectContent(item);
                });
            }
        } else {
            int count = Math.max(1, content.episodes.size());
            for (int i = 0; i < count; i++) {
                final int index = i;
                addPanelButton(list, "第 " + (i + 1) + " 集" + (i == episode ? " · 当前" : ""), v -> selectEpisode(index));
            }
        }
        panel.setVisibility(View.VISIBLE);
        if (sources) appendSources();
        if (list.getChildCount() > 0) list.getChildAt(0).requestFocus();
        if (sources && !content.live && content.alternatives.isEmpty() && !findingSources && !sourceSearchAttempted) findSources();
    }

    private void appendSources() {
        if (!showingSources || sourceList == null || panel.getVisibility() != View.VISIBLE) return;
        for (TvContent candidate : content.alternatives) {
            String key = safe(candidate.sourceKey);
            if (key.equals(safe(content.sourceKey)) || renderedSources.contains(key)) continue;
            renderedSources.add(key);
            Button option = button(safe(candidate.sourceName), v -> selectSource(candidate));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(54));
            params.bottomMargin = dp(10);
            sourceList.addView(option, Math.max(1, sourceList.getChildCount() - 2), params);
        }
        sourceStatus.setText(renderedSources.isEmpty() ? (findingSources ? "正在查找同名资源…" : "暂无其他来源，可重新查找") : "");
        sourceRetry.setVisibility(findingSources || content.live ? View.GONE : View.VISIBLE);
    }

    private void findSources() {
        if (findingSources || content.live) return;
        findingSources = true; sourceSearchAttempted = true;
        final int request = ++sourceGeneration;
        final int contentRequest = generation;
        final String wantedTitle = normalizedTitle(content.title);
        appendSources();
        // 搜索返回多个完整快照，只追加来源控件，保留遥控器当前焦点。
        repository.search(content.title, new TvRepository.Callback<List<TvContent>>() {
            @Override public void onSuccess(List<TvContent> groups) {
                if (!active || request != sourceGeneration || contentRequest != generation) return;
                for (TvContent group : groups) {
                    if (!normalizedTitle(group.title).equals(wantedTitle)) continue;
                    mergeSource(group);
                    for (TvContent candidate : group.alternatives) mergeSource(candidate);
                }
                appendSources();
            }
            @Override public void onError(String message) {
                if (!active || request != sourceGeneration || contentRequest != generation) return;
                findingSources = false; appendSources();
                if (showingSources && sourceStatus != null && renderedSources.isEmpty()) sourceStatus.setText("查找失败，请重试");
            }
        });
        handler.postDelayed(() -> {
            if (!active || request != sourceGeneration || contentRequest != generation) return;
            findingSources = false; appendSources();
        }, 26000);
    }

    private String normalizedTitle(String value) {
        return safe(value).replaceAll("[\\s·：:()（）]", "").toLowerCase(Locale.ROOT);
    }
    private void mergeSource(TvContent candidate) {
        if (safe(candidate.sourceKey).equals(safe(content.sourceKey))) return;
        for (TvContent existing : content.alternatives) if (safe(existing.sourceKey).equals(safe(candidate.sourceKey))) return;
        content.alternatives.add(candidate);
    }
    private void selectSource(TvContent item) {
        savePosition();
        int previousEpisode = episode;
        long previousPosition = resumePosition;
        ArrayList<TvContent> candidates = new ArrayList<>(content.alternatives);
        candidates.add(content);
        releasePlayers(); generation++; sourceGeneration++; resolving = false; findingSources = false;
        content = item;
        ArrayList<TvContent> newCandidates = new ArrayList<>();
        for (TvContent candidate : candidates) if (!safe(candidate.sourceKey).equals(safe(item.sourceKey))) newCandidates.add(candidate);
        content.alternatives = newCandidates;
        episode = previousEpisode; resumePosition = previousPosition;
        desiredPlay = true; fallbackUsed = false; failed = false;
        closePanel(); resolveContent();
    }
    private void addPanelButton(LinearLayout list, String label, View.OnClickListener listener) {
        Button b = button(label, listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(54));
        params.bottomMargin = dp(10);
        list.addView(b, params);
    }
    private void closePanel() {
        panel.setVisibility(View.GONE);
        showingSources = false;
        root.requestFocus();
        scheduleHide();
    }
    private void selectContent(TvContent item) {
        savePosition(); releasePlayers(); generation++; sourceGeneration++; resolving = false;
        findingSources = false; sourceSearchAttempted = false;
        content = item; episode = store.episode(content); resumePosition = store.position(content, episode);
        desiredPlay = true; fallbackUsed = false; failed = false;
        closePanel(); resolveContent();
    }
    private void selectEpisode(int index) {
        savePosition(); episode = index; resumePosition = store.position(content, episode);
        desiredPlay = true; fallbackUsed = false; closePanel(); startStream();
    }
    private void ended() {
        episodeCompleted = true;
        savePosition();
        if (!content.live && episode + 1 < content.episodes.size()) selectEpisode(episode + 1);
        else { desiredPlay = false; state.setText(content.live ? "直播已结束，请切换频道" : "播放结束"); showControls(true); }
    }
    private void showControls(boolean focus) {
        shade.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideControls);
        if (focus && panel.getVisibility() != View.VISIBLE) playButton.requestFocus();
    }
    private void scheduleHide() {
        handler.removeCallbacks(hideControls);
        if (!failed && panel.getVisibility() != View.VISIBLE && isPlaying()) handler.postDelayed(hideControls, 5500);
    }
    private void savePosition() {
        if (content == null || store == null) return;
        if (content.live) { store.saveProgress(content, 0, 0); return; }
        resumePosition = episodeCompleted ? 0 : position();
        store.saveProgress(content, episode, resumePosition);
    }
    private void releasePlayers() {
        playbackGeneration++;
        handler.removeCallbacks(startupTimeout);
        if (playerView != null) { playerView.setPlayer(null); playerView = null; }
        if (exo != null) { exo.release(); exo = null; }
        if (platform != null) { platform.setOnErrorListener(null); platform.release(); platform = null; }
        platformPrepared = false;
        surfaceView = null;
        if (videoHost != null) videoHost.removeAllViews();
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event);
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_BACK) {
            if (panel.getVisibility() == View.VISIBLE) closePanel();
            else if (shade.getVisibility() == View.VISIBLE && !failed && isPlaying()) { shade.setVisibility(View.GONE); root.requestFocus(); }
            else finish();
            return true;
        }
        if (key == KeyEvent.KEYCODE_MENU) {
            if (panel.getVisibility() == View.VISIBLE) closePanel();
            else if (shade.getVisibility() == View.VISIBLE && !root.isFocused()) showItems(false);
            else showControls(true);
            return true;
        }
        if (panel.getVisibility() == View.VISIBLE) return super.dispatchKeyEvent(event);
        if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) { togglePlay(); return true; }
        if (key == KeyEvent.KEYCODE_MEDIA_PLAY) { if (!desiredPlay) togglePlay(); return true; }
        if (key == KeyEvent.KEYCODE_MEDIA_PAUSE) { if (desiredPlay) togglePlay(); return true; }
        if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seek(10); return true; }
        if (key == KeyEvent.KEYCODE_MEDIA_REWIND) { seek(-10); return true; }
        if (shade.getVisibility() == View.GONE || root.isFocused()) {
            if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) { togglePlay(); return true; }
            if (key == KeyEvent.KEYCODE_DPAD_LEFT) { seek(-10); return true; }
            if (key == KeyEvent.KEYCODE_DPAD_RIGHT) { seek(10); return true; }
            if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN) {
                if (content.live && queue.size() > 1) {
                    queueIndex = (queueIndex + (key == KeyEvent.KEYCODE_DPAD_DOWN ? 1 : -1) + queue.size()) % queue.size();
                    selectContent(queue.get(queueIndex));
                } else if (key == KeyEvent.KEYCODE_DPAD_UP) showControls(true);
                else showItems(false);
                return true;
            }
        }
        if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN
                || key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT) showControls(false);
        return super.dispatchKeyEvent(event);
    }

    @Override protected void onStart() {
        super.onStart(); active = true;
        if (content != null) { resolveContent(); handler.post(progressTick); }
    }
    @Override protected void onPause() {
        savePosition(); active = false; generation++; sourceGeneration++; resolving = false; findingSources = false; sourceSearchAttempted = false;
        handler.removeCallbacksAndMessages(null); releasePlayers(); super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (!active && content != null) { active = true; resolveContent(); handler.post(progressTick); }
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (content != null) {
            out.putString(EXTRA_CONTENT, content.toJson().toString());
            out.putInt("episode", episode); out.putLong("position", position()); out.putBoolean("platform", usePlatform);
        }
        super.onSaveInstanceState(out);
    }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null); releasePlayers();
        if (repository != null) repository.close(); super.onDestroy();
    }
    private boolean sameItem(TvContent left, TvContent right) {
        return safe(left.id).equals(safe(right.id)) && safe(left.sourceKey).equals(safe(right.sourceKey))
                && safe(left.streamUrl).equals(safe(right.streamUrl));
    }
    private String safe(String value) { return value == null ? "" : value; }
    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); return view;
    }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private FrameLayout.LayoutParams match() { return new FrameLayout.LayoutParams(-1, -1); }
}
