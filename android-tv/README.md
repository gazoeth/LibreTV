# FreeDY TV

FreeDY TV 是 FreeDY 的 Android TV 遙控器版入口，包含原生 WebView 外壳和电视焦点导航样式。

## 构建与安装

在安装 Android SDK 和 JDK 17 的环境中运行：

```sh
./gradlew assembleDebug
```

APK 输出在 `app/build/outputs/apk/debug/app-debug.apk`。连接 Android TV 并启用开发者调试后，可运行：

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

应用从 `https://dy.dayiwu.com/` 加载 FreeDY，需要电视保持联网。D-pad 可在页面控件间按空间位置移动焦点，返回键沿浏览历史返回，播放器在获得用户操作后开始播放。

## 页面预览

在桌面浏览器打开 `https://dy.dayiwu.com/?tv=1` 可预览大屏样式。Android 外壳通过 `FreeDYTV/1.0` User-Agent 标记自动启用。
