package com.freedy.tv;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.View;
import android.widget.TextView;

/** 电视端共用色彩与遥控器焦点样式。 */
final class TvStyle {
    static final int BG = Color.rgb(9, 14, 11);
    static final int PANEL = Color.rgb(22, 29, 24);
    static final int GREEN = Color.rgb(201, 246, 66);
    static final int TEXT = Color.rgb(242, 245, 237);
    static final int MUTED = Color.rgb(147, 160, 148);

    static int dp(Context c, float n) { return (int) (c.getResources().getDisplayMetrics().density * n + .5f); }
    static GradientDrawable panel(int color, int stroke, int width, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        if (width > 0) d.setStroke(width, stroke);
        return d;
    }
    static TextView text(Context c, String value, float size, int color) {
        TextView v = new TextView(c);
        v.setText(value); v.setTextSize(size); v.setTextColor(color);
        v.setFontFeatureSettings("kern");
        return v;
    }
    static void focus(View v, boolean selected, boolean zoom) {
        Context c = v.getContext();
        v.setFocusable(true);
        if (v instanceof TextView) ((TextView) v).setTextColor(v.hasFocus() || selected ? GREEN : TEXT);
        v.setBackground(panel(selected ? Color.rgb(37, 48, 31) : PANEL, selected ? GREEN : Color.TRANSPARENT,
                dp(c, selected ? 1 : 0), dp(c, 9)));
        v.setOnFocusChangeListener((view, hasFocus) -> {
            view.setBackground(panel(hasFocus ? Color.rgb(41, 53, 30) : selected ? Color.rgb(37, 48, 31) : PANEL,
                    hasFocus || selected ? GREEN : Color.TRANSPARENT, dp(c, hasFocus ? 2 : selected ? 1 : 0), dp(c, 9)));
            if (zoom) view.animate().scaleX(hasFocus ? 1.035f : 1f).scaleY(hasFocus ? 1.035f : 1f).setDuration(130).start();
            if (view instanceof TextView) ((TextView) view).setTextColor(hasFocus || selected ? GREEN : TEXT);
        });
    }
    private TvStyle() { }
}
