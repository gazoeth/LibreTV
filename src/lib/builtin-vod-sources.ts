import type { SourceConfig } from './types';

/**
 * 旧版迁入的 20 个点播 API 加本次补充的电影天堂、魔都，共 22 个。
 * 2026-10-18 初次检查时，旧版 16 个源的搜索与详情接口
 * 返回 Apple CMS 兼容数据且详情含播放地址；另 4 个保留在列表但默认关闭。
 * 上游可用性会随时间变化，关闭项也可能因网络地区不同而可用。
 */
export const BUILTIN_VOD_SOURCES: SourceConfig[] = [
  { key: 'builtin_dyttzy', name: '电影天堂资源', url: 'https://caiji.dyttzyapi.com/api.php/provide/vod' },
  { key: 'builtin_mdzy', name: '魔都资源', url: 'https://www.mdzyapi.com/api.php/provide/vod' },
  { key: 'builtin_uku2', name: 'U酷资源2', url: 'https://api.ukuapi88.com/api.php/provide/vod', enabledByDefault: false },
  { key: 'builtin_ikun', name: 'ikun资源', url: 'https://ikunzyapi.com/api.php/provide/vod' },
  { key: 'builtin_bfzy', name: '暴风资源', url: 'https://bfzyapi.com/api.php/provide/vod' },
  { key: 'builtin_jisu', name: '极速资源', url: 'https://jszyapi.com/api.php/provide/vod' },
  { key: 'builtin_wolong', name: '卧龙资源', url: 'https://wolongzyw.com/api.php/provide/vod', enabledByDefault: false },
  { key: 'builtin_uku', name: 'U酷资源', url: 'https://api.ukuapi.com/api.php/provide/vod' },
  { key: 'builtin_360zy', name: '360资源', url: 'https://360zy.com/api.php/provide/vod' },
  { key: 'builtin_xinlang', name: '新浪点播', url: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod' },
  { key: 'builtin_zuid', name: '最大资源', url: 'https://api.zuidapi.com/api.php/provide/vod' },
  { key: 'builtin_ruyi', name: '如意资源', url: 'https://cj.rycjapi.com/api.php/provide/vod' },
  { key: 'builtin_wangwang', name: '旺旺资源', url: 'https://api.wwzy.tv/api.php/provide/vod', enabledByDefault: false },
  { key: 'builtin_jinying', name: '金鹰资源', url: 'https://jyzyapi.com/api.php/provide/vod' },
  { key: 'builtin_hongniu2', name: '红牛资源', url: 'https://www.hongniuzy2.com/api.php/provide/vod/from/hnm3u8/at/josn' },
  { key: 'builtin_ffzy', name: '非凡影视', url: 'https://api.ffzyapi.com/api.php/provide/vod' },
  { key: 'builtin_hongniu3', name: '红牛资源（二）', url: 'https://www.hongniuzy3.com/api.php/provide/vod/from/hnm3u8/at/josn' },
  { key: 'builtin_subo', name: '速播资源', url: 'https://subocaiji.com/api.php/provide/vod' },
  { key: 'builtin_feifan', name: '非凡资源2', url: 'https://cj.ffzyapi.com/api.php/provide/vod' },
  { key: 'builtin_bdzy', name: '百度云资源', url: 'https://api.apibdzy.com/api.php/provide/vod' },
  { key: 'builtin_lzi', name: '量子资源', url: 'https://cj.lziapi.com/api.php/provide/vod/from/lzm3u8' },
  { key: 'builtin_maotai', name: '茅台资源', url: 'https://caiji.maotaizy.cc/api.php/provide/vod', enabledByDefault: false },
];

/** ZIP0 公开分类页返回的线路标识；复用已有来源，避免重复接入。 */
export const ZIP0_LINE_KEYS = [
  'builtin_dyttzy', 'builtin_ruyi', 'builtin_bfzy', 'builtin_ffzy', 'builtin_360zy',
  'builtin_jisu', 'builtin_mdzy', 'builtin_zuid', 'builtin_ikun', 'builtin_lzi',
] as const;
