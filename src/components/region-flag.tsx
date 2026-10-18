/** 个别系统地区设置不显示 TW 的 Unicode 旗帜，使用本地图像保证显示一致。 */
export function RegionFlag({ code, emoji }: { code: string; emoji: string }) {
  return code === 'TW'
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src="/flags/tw.png" alt="" width={24} height={16} className="inline-block object-contain" />
    : <span aria-hidden="true">{emoji}</span>;
}
