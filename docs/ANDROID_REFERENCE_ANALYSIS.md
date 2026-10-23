# 耐看直播 APK 静态参考分析

分析日期：2026-10-23。此报告用于指导 FreeDY Android TV 的原创实现，不构成对参考应用运行效果的验证。

## 样本与边界

- 用户提供文件：`/Users/allen/Downloads/耐看直-.apk`，11,963,717 字节。
- SHA-256：`6516ebceb25254b81727e9b1a048ac496eae3d059eea544c3a0345c7d6b08cbc`。
- Manifest：包名 `com.nkzb.tv`，版本 `1.0` / 100，最低 Android API 19，目标 API 22，编译 API 33。
- 使用本地 Android SDK 35 的 `aapt`、`dexdump`、ZIP 清单与 DEX 字符串表，只读检查 Manifest、资源、类字段及局部字节码。
- 未运行 APK，未访问样本配置或代码中的远程接口，未导入其频道、签名、图像、原生二进制或源代码。
- 当前未连接 Android 盒子、没有模拟器。因此画面实际尺寸、焦点视觉、播放成功率、解码能力和动画流畅度均未实测。
- 未发现现成 JADX 可执行程序或 JADX JAR；现有 SDK 含 `dexdump` 与 smali-baksmali JAR，本报告没有安装新工具。
- REA 6.4.0 的 `inspect-android-package` 实际返回 `capability_unavailable`：缺少调用方提供的 `jadx-headless-mcp 0.7.1` JAR。下述结论来自 SDK 工具和普通文件解析，不冒充 REA Evidence 或完整反编译结果。

## 已观察到的原生结构

Manifest 声明启动页 `SplashActivity`、`HomeActivity`、直播 `TVLivePlayer`、点播 `VodTypeActivity` / `VodDetailsActivity` / `VideoPlayerActivity`、直播播放 `VodTVLivePlayActivity`、`SettingPlayActivity`、`HistoryActivity` 等，活动均指定横屏。DEX 可直接观察到 `VodTVLivePlayActivity` 与 `VideoPlayerActivity` 继承 Android `Activity`；不能仅凭 Manifest 中的旧活动声明证明该入口在当前版本实际使用。

资源包含 `lives_main.xml`、`vod_play_tv_live.xml`、`live_swich_line.xml`、`live_loading_dialog.xml`、`mv_videoplayer.xml`、`layout_setting_play.xml`、两级设置列表 `item_settings_main.xml` / `item_settings_sub.xml` 及退出确认布局。部分 XML 节点被缩为 `E: x`，因此不据此声称已恢复完整页面外观。

DEX 中存在 `TVTabAdapter`、`TVStationListAdapter`、`TVDateAdapter`、`TVDateProgramAdapter`、`TVTabLayout`、`FocusScaleFrameLayout` 和 `TvRecyclerView` 类型。由类名及字段可推断采用原生分类、频道、日期/节目列表和显式焦点控制；焦点放大类具有 `duration`、`scaleFactor` 字段，但其具体倍率和实际动效未确认。

## 遥控器行为：局部字节码证据

`com.shenma.tvlauncher.vod.VodTVLivePlayActivity.dispatchKeyEvent` 可直接读取。该方法处理 ACTION_UP；以下映射由 sparse-switch 数字键值与对应调用联合确认，而非仅依赖字符串猜测。

| 遥控键 | 方法中的行为 |
| --- | --- |
| 确认 / Enter（23 / 66） | 调用 `showTVListPanel()` 打开频道面板 |
| 菜单（82） | 根据当前可见状态调用 `showSettingsPanel()` 或 `hideSettingsPanel()` |
| 上（19） | 频道面板和设置面板未占用时调用 `switchToPrevStation()` |
| 下（20） | 同样条件下调用 `switchToNextStation()` |
| 左 / 右（21 / 22） | 设置面板中变更主设置 / 子设置焦点状态；其他情况交回 Activity 默认处理 |
| 数字 0–9（7–16） | 将 keyCode 减 7 传给 `appendChannelNumberDigit()` |
| 返回（4） | 优先关闭频道、日期、省份或设置面板；无面板时交回 Activity |

在频道面板和设置面板可见时，按键会移除并重新安排隐藏回调，延时常量为 5,000 毫秒。这证明其交互以视频为底、短暂覆盖操作面板，并在用户继续操作时延长面板停留。

## 播放、切源与恢复

APK 打包 `ExoPlayerLib/2.14.2` 字符串、`IjkVideoView` / `IjkMediaPlayer` / `IjkExoMediaPlayer` 类，以及 `armeabi-v7a` 的 `libijkffmpeg.so`、`libijkplayer.so`、`libijksdl.so`。这证明应用包含多种原生播放组件；不能据此认定所有组件均在当前直播入口启用。

`VodTVLivePlayActivity` 字段包括 `currentLineName`、`lineNames`、`playingStation`、`playingType`、`categoryChannelCache`、频道号缓存和线路隐藏任务；方法包括 `fetchPlayUrl`、`findNextLine`、`switchToLine`、`resetPlayerLine`、`showPlayError`、`onVideoPlaybackStarted`。字符串含“播放失败可尝试重新播放或更换线路”与“onError: 切换到下一条线路”。这些是切源和错误恢复设计的静态证据；其重试次数、等待时长和线路健康检测策略没有完整确认。

点播 `VideoPlayerActivity` 可观察到 `errorRetryCount`、`currentPlaySeek`、`mIsHwDecode`、`mMediaPlayer`、`getPlayPreferences`、`resetRetryCountAndSeek`、`chooseSource`、`switchCode`、`setDecode`、`selectScales`、`setSpeed`、`showController` / `hideControllerDelay`。`SettingPlayActivity` 有解码、清晰度、跳过和画面比例选项及左右箭头字段。字符串表含“软解码”“硬解码”“视频解码”“切换线路”“切换剧集”。这些支持“提供播放设置并保留播放位置”的设计方向，不能证明每一设置在每台设备上有效。

## 收藏与启动恢复

观察到 `TVSCollect`、`TVStationDao`、`DatabaseHelper`、`DatabaseOperator`、`SharePreferenceDataUtil` 类型，直播入口存在 `resolveStartupSource`、`setStartupChannel`、`playFirstAvailableTabWithChannels` 等方法。字符串明确区分“上次观看”“推荐频道”“收藏频道”，并描述收藏为空、分类屏蔽、推荐为空时查找首个非空分类的退路。

可吸收的产品规则是：收藏和观看位置由本机保存；启动恢复不能指向已删除的频道；无数据时展示可执行重试入口；分类切换与正在播放的频道身份分别维护。

## 对 FreeDY 的实现建议

1. 使用原生电视首页、列表和播放器，使菜单与遥控焦点不依赖盒子的旧 WebView。
2. 把“视频底层 + 频道/选集/线路覆盖面板”作为播放主界面；确认打开操作，返回逐层关闭，菜单打开设置。
3. 原生播放器处理生命周期、音频焦点、缓冲状态和错误；错误信息必须区分网络、来源、格式与解码，提供重试与换源。
4. 播放失败后保留内容身份、剧集及进度；切线路成功后恢复进度，防止旧请求覆盖新选择。
5. 默认只显示封面、分类与必要标题；焦点采用清晰高对比描边，用户连续操作时保持面板可见。
6. 采用 FreeDY 自有接口、视觉与代码实现，不复制样本的私有服务和原生库。参考样本仅提供交互与结构证据。

样本 `targetSdk 22`、`usesCleartextTraffic=true`、`debuggable=true`、大量设备/存储/位置权限和仅部分 ABI 的原生库，不是可照搬的兼容方案。FreeDY 应保留最小权限并明确处理公开 HTTP 视频源的网络策略，逐台验证盒子解码与 TLS 能力。
