const CUSTOMER_SITES = {
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
    },
    mdzy: {
        api: 'https://www.mdzyapi.com/api.php/provide/vod',
        name: '魔都资源',
    },
    ruyi: {
        api: 'https://cj.rycjapi.com/api.php/provide/vod',
        name: '如意资源',
    },
    qiqi: {
        api: 'https://www.qiqidys.com/api.php/provide/vod',
        name: '七七资源',
    },

    // ===== 从文本1合并过来的其他接口 =====
    tv1080: {
        api: 'https://api.1080zyku.com/inc/api_mac10.php',
        name: ' 1080资源',
    },
    uku: {
        api: 'https://api.ukuapi.com/api.php/provide/vod',
        name: ' U酷资源',
    },
    uku2: {
        api: 'https://api.ukuapi88.com/api.php/provide/vod',
        name: ' U酷资源',
    },
    ikun: {
        api: 'https://ikunzyapi.com/api.php/provide/vod',
        name: ' ikun资源',
    },
    wujin: {
        api: 'https://api.wujinapi.cc/api.php/provide/vod',
        name: ' wujinapi无尽',
    },
    yayadianbo: {
        api: 'https://cj.yayazy.net/api.php/provide/vod',
        name: ' 丫丫点播',
    },
    guangsu: {
        api: 'https://api.guangsuapi.com/api.php/provide/vod',
        name: ' 光速资源',
    },
    wolong2: {
        api: 'https://collect.wolongzyw.com/api.php/provide/vod',
        name: ' 卧龙点播',
    },
    wolong3: {
        api: 'https://collect.wolongzy.cc/api.php/provide/vod',
        name: ' 卧龙资源',
    },
    xiaomao: {
        api: 'https://zy.xmm.hk/api.php/provide/vod',
        name: ' 小猫咪资源',
    },
    xinlang: {
        api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod',
        name: ' 新浪点播',
    },
    wangwang: {
        api: 'https://wwzy.tv/api.php/provide/vod',
        name: ' 旺旺短剧',
    },
    wangwang2: {
        api: 'https://api.wwzy.tv/api.php/provide/vod',
        name: ' 旺旺资源',
    },
    zuida: {
        api: 'http://zuidazy.me/api.php/provide/vod',
        name: ' 最大点播',
    },
    zuida2: {
        api: 'https://api.zuidapi.com/api.php/provide/vod',
        name: ' 最大资源',
    },
    niuniu: {
        api: 'https://api.niuniuzy.me/api.php/provide/vod',
        name: ' 牛牛点播',
    },
    dytt: {
        api: 'http://caiji.dyttzyapi.com/api.php/provide/vod',
        name: ' 电影天堂资源',
    },
    baiduyun: {
        api: 'https://api.apibdzy.com/api.php/provide/vod',
        name: ' 百度云资源',
    },
    sony: {
        api: 'https://suoniapi.com/api.php/provide/vod',
        name: ' 索尼资源',
    },
    hongniu: {
        api: 'https://www.hongniuzy2.com/api.php/provide/vod',
        name: ' 红牛资源',
    },
    maotai: {
        api: 'https://caiji.maotaizy.cc/api.php/provide/vod',
        name: ' 茅台资源',
    },
    huya: {
        api: 'https://www.huyaapi.com/api.php/provide/vod',
        name: ' 虎牙资源',
    },
    douban: {
        api: 'https://caiji.dbzy.tv/api.php/provide/vod',
        name: ' 豆瓣资源',
    },
    hhzy: {
        api: 'https://hhzyapi.com/api.php/provide/vod',
        name: ' 豪华资源',
    },
    subo: {
        api: 'https://subocaiji.com/api.php/provide/vod',
        name: ' 速博资源',
    },
    liangzi: {
        api: 'https://cj.lziapi.com/api.php/provide/vod',
        name: ' 量子资源',
    },
    jinying: {
        api: 'https://jinyingzy.com/api.php/provide/vod',
        name: ' 金鹰点播',
    },
    jinying2: {
        api: 'https://jyzyapi.com/api.php/provide/vod',
        name: ' 金鹰资源',
    },
    shandian: {
        api: 'https://sdzyapi.com/api.php/provide/vod',
        name: ' 閃電资源',
    },
    piaoling: {
        api: 'https://p2100.net/api.php/provide/vod',
        name: ' 飘零资源',
    },
    mozhu: {
        api: 'https://mozhuazy.com/api.php/provide/vod',
        name: ' 魔爪资源',
    },
    modu: {
        api: 'https://www.mdzyapi.com/api.php/provide/vod',
        name: ' 魔都资源',
    },
    heimuer2: {
        api: 'https://json02.heimuer.xyz/api.php/provide/vod',
        name: ' 黑木耳点播',
    },
    // 还可以继续补充 AV、短剧、iqiyi 等接口……
};

// 调用全局方法合并
if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
