// customer_site.js - API资源配置
// 包含原有已验证资源 + 用户提供的新资源列表
// 建议：部署后打开 /api_tester.html 在线测试可用性，删除不可用项

const CUSTOMER_SITES = {
    // ── 原有资源（已验证可用）────────────────────────────────────────────
    heimuer: {
        api: 'https://json.heimuer.xyz/api.php/provide/vod',
        name: '黑木耳',
    },
    ffzy: {
        api: 'http://ffzy5.tv/api.php/provide/vod',
        name: '非凡影视',
    },
    tyyszy: {
        api: 'https://tyyszy.com/api.php/provide/vod',
        name: '天涯资源',
    },
    ckzy: {
        api: 'https://www.ckzy1.com/api.php/provide/vod',
        name: 'CK资源',
        adult: true
    },
    zy360: {
        api: 'https://360zy.com/api.php/provide/vod',
        name: '360资源',
    },
    wolong: {
        api: 'https://wolongzyw.com/api.php/provide/vod',
        name: '卧龙资源',
    },
    cjhw: {
        api: 'https://cjhwba.com/api.php/provide/vod',
        name: '新华为',
    },
    hwba: {
        api: 'https://cjwba.com/api.php/provide/vod',
        name: '华为吧资源',
    },
    jisu: {
        api: 'https://jszyapi.com/api.php/provide/vod',
        name: '极速资源',
        detail: 'https://jszyapi.com',
    },
    dbzy: {
        api: 'https://dbzy.com/api.php/provide/vod',
        name: '豆瓣资源',
    },
    bfzy: {
        api: 'https://bfzyapi.com/api.php/provide/vod',
        name: '暴风资源',
    },
    mozhua: {
        api: 'https://mozhuazy.com/api.php/provide/vod',
        name: '魔爪资源',
        detail: 'https://mozhuazy.com',
    },
    mdzy: {
        api: 'https://www.mdzyapi.com/api.php/provide/vod',
        name: '魔都资源',
        detail: 'https://www.mdzyapi.com',
    },
    ruyi: {
        api: 'https://cj.rycjapi.com/api.php/provide/vod',
        name: '如意资源',
    },
    qiqi: {
        api: 'https://www.qiqidys.com/api.php/provide/vod',
        name: '七七资源',
    },

    // ── 新增资源（需通过 api_tester.html 验证可用性）────────────────────
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
    shandian: {
        api: 'https://sdzyapi.com/api.php/provide/vod',
        name: '闪电资源',
        detail: 'https://sdzyapi.com',
    },
    ffzynew: {
        api: 'https://api.ffzyapi.com/api.php/provide/vod',
        name: '非凡影视new',
        detail: 'http://ffzy5.tv',
    },
    heimuer02: {
        api: 'https://json02.heimuer.xyz/api.php/provide/vod',
        name: '黑木耳02',
        detail: 'https://json02.heimuer.xyz',
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
    haohua: {
        api: 'https://hhzyapi.com/api.php/provide/vod',
        name: '豪华资源',
        detail: 'https://hhzyapi.com',
    },
    lianzi: {
        api: 'https://cj.lziapi.com/api.php/provide/vod',
        name: '量子资源',
    },
    feifan: {
        api: 'https://cj.ffzyapi.com/api.php/provide/vod',
        name: '非凡资源',
        detail: 'https://cj.ffzyapi.com',
    },
    dadi: {
        api: 'https://dadiapi.com/api.php/provide/vod',
        name: '大地资源',
    },
    jinma: {
        api: 'https://api.jmzy.com/api.php/provide/vod',
        name: '金马资源',
    },
    fengchao: {
        api: 'https://api.fczy888.me/api.php/provide/vod',
        name: '蜂巢片库',
    },
    fangtuan: {
        api: 'https://www.fantuan.tv/api.php/provide/vod/',
        name: '饭团影视',
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
};

if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
