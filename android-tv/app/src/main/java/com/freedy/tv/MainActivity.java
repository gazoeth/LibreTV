package com.freedy.tv;

import android.app.Activity;
import android.graphics.Insets;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public final class MainActivity extends Activity {
    private static final String HOME_URL = "https://dy.dayiwu.com/";
    private static final String SITE_HOST = "dy.dayiwu.com";

    private FrameLayout root;
    private WebView webView;
    private TvChromeClient chromeClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(12, 14, 12));
        getWindow().setNavigationBarColor(Color.BLACK);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(12, 14, 12));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(12, 14, 12));
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString() + " FreeDYTV/1.0");

        webView.setWebViewClient(new TvWebViewClient());
        chromeClient = new TvChromeClient();
        webView.setWebChromeClient(chromeClient);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        webView.requestFocus(View.FOCUS_DOWN);
        webView.loadUrl(HOME_URL);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (chromeClient != null && chromeClient.isShowingCustomView()) {
            chromeClient.onHideCustomView();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            root.removeView(webView);
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private final class TvWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return !"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null
                    || !SITE_HOST.equalsIgnoreCase(uri.getHost());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            return !"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null
                    || !SITE_HOST.equalsIgnoreCase(uri.getHost());
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler,
                                       android.net.http.SslError error) {
            handler.cancel();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request,
                                    WebResourceError error) {
            if (request.isForMainFrame()) showOfflineState();
        }
    }

    private void showOfflineState() {
        String html = "<!doctype html><html lang='zh-CN'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;background:#0c0e0c;color:#f1f4ed;font:22px sans-serif;display:grid;place-items:center;height:100vh'>"
                + "<main style='text-align:center;padding:40px'><div style='color:#c4ed54;font-size:30px;font-weight:800'>FreeDY TV</div>"
                + "<h1 style='font-size:28px'>暂时无法连接</h1><p style='color:#a3ad99'>请检查电视网络后重试。</p>"
                + "<button autofocus onclick='location.href=\"https://dy.dayiwu.com/\"' style='margin-top:20px;padding:16px 30px;border:0;border-radius:9px;background:#c4ed54;color:#10120d;font-size:20px;font-weight:700'>重新连接</button>"
                + "</main></body></html>";
        webView.loadDataWithBaseURL(HOME_URL, html, "text/html", "UTF-8", null);
    }

    private final class TvChromeClient extends WebChromeClient {
        private View customView;
        private CustomViewCallback customViewCallback;
        private int previousSystemUiVisibility;

        boolean isShowingCustomView() {
            return customView != null;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }
            customView = view;
            customViewCallback = callback;
            previousSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
            root.removeView(webView);
            root.addView(customView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            customView.requestFocus();
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) return;
            root.removeView(customView);
            customView = null;
            root.addView(webView, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getWindow().getDecorView().setSystemUiVisibility(previousSystemUiVisibility);
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
            webView.requestFocus(View.FOCUS_DOWN);
        }
    }
}
