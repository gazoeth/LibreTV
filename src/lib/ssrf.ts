import dns from 'node:dns/promises';

/** 去掉 URL.hostname 对 IPv6 附加的方括号（"[::1]" → "::1"） */
function stripBrackets(host: string): string {
  return host.trim().replace(/^\[+|\]+$/g, '');
}

/**
 * IPv4-mapped / IPv4-compatible IPv6 还原为点分十进制，命中不到时返回 null。
 * "::ffff:192.168.1.100" 与 "::ffff:c0a8:164" 都会归一化成 "192.168.1.100"，
 * 否则这类地址会绕过下面的私网规则被当成公网放行。
 */
function toIPv4(ip: string): string | null {
  const v = ip.replace(/^0:0:0:0:0:/i, '::'); // 全写形式
  const dotted = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (dotted) return dotted[1];
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(v);
  if (!hex) return null;
  const n = (((parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16)) >>> 0);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** 判断 IP 是否为私有/回环/链路本地/保留地址（SSRF 防护） */
export function isPrivateIP(ip: string): boolean {
  let v = stripBrackets(ip.trim());
  v = toIPv4(v) ?? v;
  if (/^(127\.|0\.0\.0\.0$|::1$|::$|fe80:|fc|fd)/i.test(v)) return true;
  if (v.startsWith('10.')) return true;
  if (v.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (v.startsWith('169.254.')) return true; // 链路本地（含云元数据 169.254.169.254）
  if (v.startsWith('100.64.')) return true; // CGNAT
  if (v.startsWith('192.0.0.')) return true; // 协议分配块
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** URL 字面量校验：协议白名单 + 主机名/字面量 IP 黑名单 */
export function isValidProxyUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = stripBrackets(parsed.hostname); // "[::1]" 也要能被黑名单命中
    if (BLOCKED_HOSTNAMES.has(host)) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
      if (isPrivateIP(host)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export type UpstreamVerdict = { ok: true } | { ok: false; reason: string; failureKind?: 'invalid' | 'dns' | 'platform' };

/** 解析失败与私网结果分别表达，均保持拒绝出网。 */
async function checkDnsTarget(urlString: string): Promise<UpstreamVerdict> {
  const denied = { ok: false as const, reason: '目标地址解析到私有/保留网络', failureKind: 'invalid' as const };
  try {
    const hostname = stripBrackets(new URL(urlString).hostname);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) return isPrivateIP(hostname) ? denied : { ok: true };
    let addresses: string[];
    if (process.env.CLOUDFLARE_WORKERS === '1') {
      const answers = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
      addresses = answers.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      // 无 AAAA 等正常空记录不应误报私网；预算、网络等解析故障必须保留原因。
      const failures = answers.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
      const platformError = failures.find(error => /too many subrequests|worker.*(?:limit|resource)/i.test(String(error?.message || error)));
      if (platformError) return { ok: false, reason: '平台子请求配额不足，DNS 校验未完成', failureKind: 'platform' };
      const unexpected = failures.find(error => !['ENODATA', 'ENOTFOUND', 'DNS_ENODATA', 'DNS_ENOTFOUND'].includes(String(error?.code || '')));
      if (unexpected || !addresses.length) return { ok: false, reason: 'DNS 解析暂时失败，尚未获得有效公网地址', failureKind: 'dns' };
    } else {
      addresses = (await dns.lookup(hostname, { all: true })).map(result => result.address);
    }
    if (!addresses.length) return { ok: false, reason: 'DNS 未返回有效地址', failureKind: 'dns' };
    return addresses.some(isPrivateIP) ? denied : { ok: true };
  } catch (error) {
    return { ok: false, reason: /too many subrequests/i.test(String(error)) ? '平台子请求配额不足，DNS 校验未完成' : 'DNS 解析暂时失败，尚未获得有效公网地址', failureKind: /too many subrequests/i.test(String(error)) ? 'platform' : 'dns' };
  }
}

/** 兼容旧代理消费者；未知 DNS 结果仍按禁止访问处理。 */
export async function isBlockedByDNS(urlString: string): Promise<boolean> {
  return !(await checkDnsTarget(urlString)).ok;
}

export class UpstreamAccessError extends Error {
  constructor(message: string, readonly failureKind: 'invalid' | 'dns' | 'platform') { super(message); this.name = 'UpstreamAccessError'; }
}

/** 出网校验由这里解释，所有重定向仍逐跳调用，未添加域名豁免。 */
export async function checkUpstreamAllowed(urlString: string): Promise<UpstreamVerdict> {
  if (!isValidProxyUrl(urlString)) return { ok: false, reason: '目标地址不在允许范围内（仅支持公网 http/https）', failureKind: 'invalid' };
  return checkDnsTarget(urlString);
}

/** 直播场景是否放行内网地址（自建 IPTV）；由部署者显式开启 */
export function allowLivePrivate(): boolean {
  return process.env.LIVE_ALLOW_PRIVATE === '1';
}

/**
 * 直播地址专用校验：协议必须 http(s)，默认仍拒绝内网，但部署者可用
 * LIVE_ALLOW_PRIVATE=1 显式放行（自建 IPTV 常位于内网）。
 *
 * 与点播侧 checkUpstreamAllowed 的区别只在这一处开关：
 * 订阅/播放列表若沿用点播那把尺子，会静默过滤掉内网自建源。
 */
export async function checkLiveUrlAllowed(urlString: string): Promise<UpstreamVerdict> {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: '直播地址仅支持 http/https 协议' };
    }
  } catch {
    return { ok: false, reason: '无效的直播地址' };
  }
  if (allowLivePrivate()) return { ok: true };
  return checkUpstreamAllowed(urlString);
}
