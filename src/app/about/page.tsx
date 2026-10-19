import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import './about.css';

export const metadata: Metadata = {
  title: '关于与使用说明',
  description: '了解 FreeDY 的服务边界、数据处理、版权反馈与使用方式。',
};

const contactUrl = 'https://t.me/Y_Coin_Crypto';
const contactHandle = '@Y_Coin_Crypto';
const sections = [['overview', '服务说明'], ['privacy', '隐私与数据'], ['rights', '版权与反馈'], ['guide', '使用指南']];
const dataRows = [
  ['观看与偏好', '观看进度、搜索记录、收藏、设置及最近收听主要保存在本机 IndexedDB 或 localStorage。', '通常保留至主动删除或浏览器清理；可通过浏览器的网站数据管理删除。'],
  ['播放与缓存', '媒体可能直接连接第三方，也可能经过本站代理；启用缓存时，浏览器可能保存视频分片。', '缓存按设置及浏览器存储策略清理；主动下载的文件需在设备中另行删除。'],
  ['搜索与检测', '关键词、影片标识、来源地址会发送到本站服务，并按请求转发给相关数据源。服务端可能临时缓存结果。', '用于完成搜索、读取详情和检测可达性；不代表上游已取得内容授权。'],
  ['网络与会话', '本站、托管服务及直连的媒体、图片、广播服务可能接收 IP、请求时间、浏览器与请求信息。启用访问口令时使用会话 Cookie。', '日志保存与处理取决于实际部署及服务商；本站不承诺匿名访问或第三方无法识别 IP。'],
];

export default function AboutPage() {
  return <div className="zip-home fd-about min-h-screen flex flex-col"><Header landing />
    <main className="fd-about-shell">
      <section className="fd-about-hero" aria-labelledby="about-title">
        <div><p className="zip-eyebrow"><span className="zip-live-dot" /> ABOUT FREEDY</p><h1 id="about-title">让体验简单。<br /><span>让边界清晰。</span></h1><p className="fd-about-intro">从影视到电视与广播，FreeDY 将内容发现、来源比较与播放整理到同一个界面。这里也说明它如何工作，以及你应当知道的事。</p><a className="fd-about-cta" href="#overview">了解 FreeDY <span aria-hidden="true">↘</span></a></div>
        <div className="fd-about-signature" aria-hidden="true"><div className="fd-about-orbit" /><span>D</span><p>DISCOVER. CHOOSE. PLAY.</p><small>清楚选择，自在观看。</small></div>
      </section>
      <div className="fd-about-body"><nav className="fd-about-index" aria-label="关于页目录"><p>本页内容</p>{sections.map(([id, name], i) => <a href={`#${id}`} key={id}><small>0{i + 1}</small>{name}<span aria-hidden="true">↗</span></a>)}<div>服务说明<br /><time dateTime="2026-10-18">更新于 2026.10.18</time></div></nav>
        <div className="fd-about-content">
          <section id="overview" className="fd-about-section"><p className="zip-eyebrow">01 / THE SERVICE</p><h2>连接内容，也说明来源。</h2><p>FreeDY 提供第三方影视接口搜索、电视与广播目录、来源检测及媒体播放功能。搜索结果、封面、简介和媒体由对应服务提供，其可用性、准确性和授权范围可能变化。</p><div className="fd-about-pillars">{[['发现', '按片名搜索，或从分类和地区进入。'], ['比较', '查看来源与检测结果，选择合适的线路。'], ['播放', '保留本机进度，让下一次继续更方便。']].map(([title, text], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div><div className="fd-about-note"><span aria-hidden="true">↗</span><p><strong>公开可访问，不等于获得授权。</strong>目录收录、技术可播放及软件开源许可，都不能替代影视、电视或广播内容的授权。请使用你有权访问的内容，并遵守所在地及来源服务的规则。</p></div></section>
          <section id="privacy" className="fd-about-section"><p className="zip-eyebrow">02 / YOUR DATA</p><h2>数据去哪里，讲清楚。</h2><p>观看记录与影视收藏仅保存在当前浏览器；清理浏览器数据会移除这些记录。收藏上限为 200 部，超出时移除最早收藏。本机记录与网络请求有不同的数据路径。以下说明基于当前功能；使用第三方来源时，也应阅读其隐私规则。</p><div className="fd-about-data">{dataRows.map(([title, flow, retention]) => <article key={title}><h3>{title}</h3><div><p>{flow}</p><small>{retention}</small></div></article>)}</div><details><summary>如何管理或删除本机数据？<span aria-hidden="true">＋</span></summary><p>可在相应的历史、收藏及缓存管理功能中删除记录；也可在浏览器的“网站设置 / 网站数据”中清除此站点数据。这会重置本机偏好、登录状态和本地记录，操作前请按需备份。已导出的配置、下载文件及第三方持有的数据不会随之删除。涉及本站处理的个人信息，可通过下方 Telegram 联系方式提出查询、更正或删除请求。</p></details><details><summary>哪些外部服务可能收到请求？<span aria-hidden="true">＋</span></summary><p>你选用的影视接口、媒体与封面地址、直播及广播服务会按功能接收请求；电视目录来自 iptv-org，广播目录来自 Radio Browser 的随站快照，读取本站目录本身无需将整个目录发送给这些服务。第三方可能在境外，具体接收方随来源与配置变化；需要明确授权或跨境合规条件的部署，应由运营方先行落实。</p></details></section>
          <section id="rights" className="fd-about-section"><p className="zip-eyebrow">03 / RESPECT THE WORK</p><h2>尊重创作，认真回应。</h2><p>本站不主张对第三方作品拥有版权，也不承诺任何来源已获授权。不以“仅提供链接”“不存储内容”或“责任归来源”为由排除依法应承担的责任。不得将本工具用于绕过付费、访问控制、地域限制或作品保护措施。</p><div className="fd-about-contact"><div><span className="zip-eyebrow">版权 · 隐私 · 内容反馈</span><h3>有问题，请告诉我们。</h3><p>请发送具体链接和必要说明，避免提交无关的身份证件或敏感信息。</p></div><a href={contactUrl} target="_blank" rel="noopener noreferrer">{contactHandle}<span aria-hidden="true">↗</span></a></div><ol className="fd-about-steps"><li><span>01</span><div><h3>提供可核查的信息</h3><p>版权通知请包含权利人姓名或名称、联系方式与地址，作品名称、本站具体链接及相关来源地址，以及权属或授权的初步证明。代理提交时请附代理授权。</p></div></li><li><span>02</span><div><h3>按问题类型处理</h3><p>涉及侵权的通知将依法采取必要措施，包括删除相关信息或断开链接；隐私请求需确认与请求相关的身份及范围。处理应兼顾权利保护和必要的数据最小化。</p></div></li><li><span>03</span><div><h3>保留说明与异议渠道</h3><p>如认为通知或处理有误，请通过同一 Telegram 联系方式补充事实及证明，提出异议。具体处理依适用法律及核查结果，不承诺固定时限或保证所有请求均获支持。</p></div></li></ol><details><summary>服务边界与运营说明<span aria-hidden="true">＋</span></summary><p>线路检测只反映某次请求的技术结果，不证明内容合法、持续稳定或完全安全。第三方媒体可能包含广告、错误信息或不适宜内容；过滤不保证完整准确，未成年人应由监护人指导使用。运营主体、来源授权、服务器日志期限及适用地区的许可或备案情况仍需由实际运营方核实和披露。本页不能替代相应义务，也不能保证消除全部法律风险。</p></details><div className="fd-about-references"><span>相关官方资料</span><a href="https://www.samr.gov.cn/wljys/gzzd/art/2023/art_3ef1e889c1e644d4b65b5f5c7f432386.html" target="_blank" rel="noopener noreferrer">个人信息保护法 ↗</a><a href="https://xzfg.moj.gov.cn/front/law/detail?LawID=167" target="_blank" rel="noopener noreferrer">信息网络传播权保护条例 ↗</a></div></section>
          <section id="guide" className="fd-about-section"><p className="zip-eyebrow">04 / MAKE YOURSELF AT HOME</p><h2>少一点操作，多一点沉浸。</h2><div className="fd-about-shortcuts">{[['空格', '播放 / 暂停'], ['← / →', '快退 / 快进 5 秒'], ['↑ / ↓', '调节音量'], ['F', '切换全屏'], ['Alt + ← / →', '上一集 / 下一集'], ['移动端长按', '视频 3 倍速播放']].map(([key, label]) => <div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><p className="fd-about-caption">视频播放器获得焦点且未在输入框中输入时使用；不同设备与播放器能力可能有所差异。</p><div className="fd-about-open"><h3>基于开放的软件，也尊重许可。</h3><p>FreeDY 基于 LibreTV 进行修改。软件采用 AGPL-3.0-or-later，软件许可不授予第三方媒体版权。分发或通过网络提供修改版服务时，应履行相应源码提供等许可义务。</p></div><Link className="fd-about-back" href="/">回到首页 <span aria-hidden="true">↗</span></Link></section>
        </div>
      </div>
    </main><SiteFooter />
  </div>;
}
