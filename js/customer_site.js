// customer_site.js - API资源配置
// 最后更新：2026-03（通过 test_apis.py 实测验证，仅保留可用源）

const CUSTOMER_SITES = {
    uku2: {
        api: 'https://api.ukuapi88.com/api.php/provide/vod',
        name: 'U酷资源2',
        regionSupport: 'overseas'
    },
    ikun: {
        api: 'https://ikunzyapi.com/api.php/provide/vod',
        name: 'ikun资源',
        regionSupport: 'overseas'
    },
    bfzy: {
        api: 'https://bfzyapi.com/api.php/provide/vod',
        name: '暴风资源',
        regionSupport: 'mainland'
    },
    jisu: {
        api: 'https://jszyapi.com/api.php/provide/vod',
        name: '极速资源',
        regionSupport: 'mainland'
    },
    wolong: {
        api: 'https://wolongzyw.com/api.php/provide/vod',
        name: '卧龙资源',
        regionSupport: 'overseas'
    },
    uku: {
        api: 'https://api.ukuapi.com/api.php/provide/vod',
        name: 'U酷资源',
        regionSupport: 'mainland'
    },
    zy360: {
        api: 'https://360zy.com/api.php/provide/vod',
        name: '360资源',
        regionSupport: 'mainland'
    },
    xinlang: {
        api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod',
        name: '新浪点播',
        regionSupport: 'mainland'
    },
    zuidapi: {
        api: 'https://api.zuidapi.com/api.php/provide/vod',
        name: '最大资源',
        regionSupport: 'overseas'
    },
    ruyi: {
        api: 'https://cj.rycjapi.com/api.php/provide/vod',
        name: '如意资源',
        regionSupport: 'mainland'
    },
    wangwang: {
        api: 'https://api.wwzy.tv/api.php/provide/vod',
        name: '旺旺资源',
        regionSupport: 'mainland'
    },
    jinying: {
        api: 'https://jyzyapi.com/api.php/provide/vod',
        name: '金鹰资源',
        regionSupport: 'mainland'
    },
    hongniu2: {
        api: 'https://www.hongniuzy2.com/api.php/provide/vod/from/hnm3u8/at/josn/',
        name: '红牛资源',
        regionSupport: 'mainland'
    },
    ffzynew: {
        api: 'https://api.ffzyapi.com/api.php/provide/vod',
        name: '非凡影视',
        regionSupport: 'overseas'
    },
    hongniu3: {
        api: 'https://www.hongniuzy3.com/api.php/provide/vod/from/hnm3u8/at/josn/',
        name: '红牛资源(二)',
        regionSupport: 'mainland'
    },
    subo: {
        api: 'https://subocaiji.com/api.php/provide/vod',
        name: '速播资源',
        regionSupport: 'overseas'
    },
    feifan: {
        api: 'https://cj.ffzyapi.com/api.php/provide/vod',
        name: '非凡资源2',
        regionSupport: 'overseas'
    },
    bdzy: {
        api: 'https://api.apibdzy.com/api.php/provide/vod',
        name: '百度云资源',
        regionSupport: 'mainland'
    },
    lianzi: {
        api: 'https://cj.lziapi.com/api.php/provide/vod/from/lzm3u8/',
        name: '量子资源',
        regionSupport: 'overseas'
    },
    maotai: {
        api: 'https://caiji.maotaizy.cc/api.php/provide/vod',
        name: '茅台资源',
        regionSupport: 'mainland'
    },
};

if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js");
}