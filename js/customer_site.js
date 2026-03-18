// customer_site.js - API资源配置
// 最后更新：2026-03（根据实际请求日志清理失效源）
// 已移除的失效源：hwba(530), dbzy(530), heimuer(530), heimuer02(530),
//   cjhw(403), shandian(暂不支持搜索), tyyszy(暂不支持搜索),
//   jinma(444), haohua(搜索关闭), qiqi(HTML非JSON), ffzy(非JSON),
//   dadi(XML), mozhua(超时), fangtuan(530), fengchao(530), mdzy(503)

const CUSTOMER_SITES = {
    // ── 可用资源 ─────────────────────────────────────────────────────────
    jisu: {
        api: 'https://jszyapi.com/api.php/provide/vod',
        name: '极速资源',
        detail: 'https://jszyapi.com',
    },
    bfzy: {
        api: 'https://bfzyapi.com/api.php/provide/vod',
        name: '暴风资源',
    },
    ruyi: {
        api: 'https://cj.rycjapi.com/api.php/provide/vod',
        name: '如意资源',
    },
    wolong: {
        api: 'https://wolongzyw.com/api.php/provide/vod',
        name: '卧龙资源',
    },
    zy360: {
        api: 'https://360zy.com/api.php/provide/vod',
        name: '360资源',
    },
    uku: {
        api: 'https://api.ukuapi.com/api.php/provide/vod',
        name: 'U酷资源',
        detail: 'https://api.ukuapi.com',
    },
    uku2: {
        api: 'https://api.ukuapi88.com/api.php/provide/vod',
        name: 'U酷资源2',
        detail: 'https://api.ukuapi88.com',
    },
    ikun: {
        api: 'https://ikunzyapi.com/api.php/provide/vod',
        name: 'ikun资源',
        detail: 'https://ikunzyapi.com',
    },
    xinlang: {
        api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod',
        name: '新浪点播',
        detail: 'https://api.xinlangapi.com',
    },
    wangwang: {
        api: 'https://api.wwzy.tv/api.php/provide/vod',
        name: '旺旺资源',
        detail: 'https://api.wwzy.tv',
    },
    zuidapi: {
        api: 'https://api.zuidapi.com/api.php/provide/vod',
        name: '最大资源',
        detail: 'https://api.zuidapi.com',
    },
    jinying: {
        api: 'https://jyzyapi.com/api.php/provide/vod',
        name: '金鹰资源',
        detail: 'https://jyzyapi.com',
    },
    ffzynew: {
        api: 'https://api.ffzyapi.com/api.php/provide/vod',
        name: '非凡影视',
        detail: 'http://ffzy5.tv',
    },
    hongniu2: {
        api: 'https://www.hongniuzy2.com/api.php/provide/vod',
        name: '红牛资源',
        detail: 'https://www.hongniuzy2.com',
    },
    hongniu3: {
        api: 'https://www.hongniuzy3.com/api.php/provide/vod',
        name: '红牛资源3',
    },
    maotai: {
        api: 'https://caiji.maotaizy.cc/api.php/provide/vod',
        name: '茅台资源',
        detail: 'https://caiji.maotaizy.cc',
    },
    lianzi: {
        api: 'https://cj.lziapi.com/api.php/provide/vod',
        name: '量子资源',
    },
    feifan: {
        api: 'https://cj.ffzyapi.com/api.php/provide/vod',
        name: '非凡资源2',
        detail: 'https://cj.ffzyapi.com',
    },
    bdzy: {
        api: 'https://api.apibdzy.com/api.php/provide/vod',
        name: '百度云资源',
        detail: 'https://api.apibdzy.com',
    },
    subo: {
        api: 'https://subocaiji.com/api.php/provide/vod',
        name: '速博资源',
    },
    ckzy: {
        api: 'https://www.ckzy1.com/api.php/provide/vod',
        name: 'CK资源',
        adult: true,
    },
};

if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
