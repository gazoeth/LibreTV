// customer_site.js - API资源配置
// 最后更新：2026-03（通过 test_apis.py 实测验证，仅保留可用源）

const CUSTOMER_SITES = {
    uku2: {
        api: 'https://api.ukuapi88.com/api.php/provide/vod',
        name: 'U酷资源2',
    },
    ikun: {
        api: 'https://ikunzyapi.com/api.php/provide/vod',
        name: 'ikun资源',
    },
    bfzy: {
        api: 'https://bfzyapi.com/api.php/provide/vod',
        name: '暴风资源',
    },
    jisu: {
        api: 'https://jszyapi.com/api.php/provide/vod',
        name: '极速资源',
    },
    wolong: {
        api: 'https://wolongzyw.com/api.php/provide/vod',
        name: '卧龙资源',
    },
    uku: {
        api: 'https://api.ukuapi.com/api.php/provide/vod',
        name: 'U酷资源',
    },
    zy360: {
        api: 'https://360zy.com/api.php/provide/vod',
        name: '360资源',
    },
    xinlang: {
        api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod',
        name: '新浪点播',
    },
    zuidapi: {
        api: 'https://api.zuidapi.com/api.php/provide/vod',
        name: '最大资源',
    },
    ruyi: {
        api: 'https://cj.rycjapi.com/api.php/provide/vod',
        name: '如意资源',
    },
    wangwang: {
        api: 'https://api.wwzy.tv/api.php/provide/vod',
        name: '旺旺资源',
    },
    jinying: {
        api: 'https://jyzyapi.com/api.php/provide/vod',
        name: '金鹰资源',
    },
    hongniu2: {
        api: 'https://www.hongniuzy2.com/api.php/provide/vod',
        name: '红牛资源',
    },
    ffzynew: {
        api: 'https://api.ffzyapi.com/api.php/provide/vod',
        name: '非凡影视',
    },
    hongniu3: {
        api: 'https://www.hongniuzy3.com/api.php/provide/vod',
        name: '红牛资源3',
    },
    subo: {
        api: 'https://subocaiji.com/api.php/provide/vod',
        name: '速博资源',
    },
    feifan: {
        api: 'https://cj.ffzyapi.com/api.php/provide/vod',
        name: '非凡资源2',
    },
    bdzy: {
        api: 'https://api.apibdzy.com/api.php/provide/vod',
        name: '百度云资源',
    },
    lianzi: {
        api: 'https://cj.lziapi.com/api.php/provide/vod',
        name: '量子资源',
    },
    maotai: {
        api: 'https://caiji.maotaizy.cc/api.php/provide/vod',
        name: '茅台资源',
    },
};

if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
