# FreeDY TV 2.0

面向遥控器和安卓电视盒子的原生 Android 应用。2.0 移除了远程 WebView 外壳，首页和播放器不依赖系统网页内核。兼容范围为 Android 5.0/API 21 及以上；本次重点针对用户的中国移动魔百合 Android 9。

## 功能

- 原生侧栏、五列封面、分类、搜索、电视与广播目录。
- 方向键导航、可见焦点、封面长按收藏、本机最近观看及分集进度。
- Media3 ExoPlayer 标准内核，系统 MediaPlayer 兼容内核；超时或播放失败仅自动回退一次，之后由用户重试或换源。
- 原生直连点播搜索、专题目录与详情，减少浏览器 CORS 和服务端代理故障的影响；专题直连失败时尝试 FreeDY API 和本机缓存。
- 电视、广播支持地区选择，保留全球目录入口；中国地区的频道快照也可在远程目录不可达时读取。
- 点播源配置、电视和广播目录快照随 APK 提供，远程目录失败时可读取。目录存在不代表每条流当前可播，快照日期见 assets JSON。
- 只申请联网、网络状态和保持唤醒权限，不申请电话、位置或外部存储权限。

原生直连不经过网页的 HLS 广告过滤加载器，因此此版本**不包含网页端切片广告过滤**。未移植耐看直播的私有接口、频道授权、原生库、图标或签名。

## 遥控操作

| 场景 | 操作 |
| --- | --- |
| 首页 | 方向键选中封面，确认播放，长按确认收藏 |
| 播放画面 | 确认暂停/播放；左右快进退 10 秒 |
| 点播 | 上键聚焦控制，下键打开选集 |
| 直播 | 上下换台；菜单打开频道/控制面板 |
| 控制面板 | 方向键选集、换源、切内核、重试或收藏 |
| 返回 | 先关闭面板，再退出播放；首页退出需确认 |

## 构建与安装

使用 JDK 17、Android SDK 35 和 Gradle Wrapper：

```sh
./gradlew testDebugUnitTest lintDebug assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.freedy.tv/.MainActivity
```

输出：`app/build/outputs/apk/debug/app-debug.apk`。版本 `2.0.0`，versionCode `20000`，包名保持 `com.freedy.tv`。

Debug APK 适合本次侧载验收。必须使用与旧包相同的本机 debug keystore 才能覆盖安装；正式分发应单独管理发行签名。不要把密钥提交到仓库。

## 验证边界

Android 9 的 Robolectric 回归用于检查 Activity 原生视图创建、焦点入口和本机数据保存，不证明魔百合真实显示、硬件解码、遥控器键映射或 IPTV 可用性。没有连接盒子时，不将编译或模拟测试描述为真机安装成功。

如果盒子仍无法显示界面，可在开启开发者调试后收集：

```sh
adb logcat -c
adb shell am start -n com.freedy.tv/.MainActivity
adb logcat -d -s AndroidRuntime ActivityManager
```

应用默认连接 `https://dy.dayiwu.com`，可在设置中修改为兼容的 HTTPS 站点。所有 HTTPS 请求保留系统证书校验；安全连接失败时应检查盒子时间、证书和网络，而不是忽略证书错误。

## 参考与许可

静态参考记录见 `docs/ANDROID_REFERENCE_ANALYSIS.md`。FreeDY 基于 AGPL-3.0-or-later；Media3/ExoPlayer 按其 Apache-2.0 许可证使用，构建包携带的第三方许可证见 `app/src/main/assets/THIRD_PARTY_NOTICES.txt`。
