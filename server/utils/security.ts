/** 浏览器 UA：目标站点对非浏览器 UA 会返回空壳页面 */
export const BROWSER_UA
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** 移动端 UA：抖音的分享页只在移动端 UA 下渲染 SSR 数据 */
export const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

/**
 * 允许服务端代下载 / 代预览的域名白名单。
 * 只放各平台的图床/视频 CDN，避免这个接口被当成任意 URL 的代理（SSRF）。
 */
export const ALLOWED_MEDIA_HOSTS = [
  // 豆包
  'byteimg.com',
  'doubao.com',
  'bytecdn.cn',
  'volccdn.com',
  // 抖音
  'douyin.com',
  'iesdouyin.com',
  'douyinpic.com',
  'douyinvod.com',
  'snssdk.com',
  'jspcdn.cn',
  // 小红书
  'xiaohongshu.com',
  'xhslink.cn',
  'xhslink.com',
  'xhscdn.com',
  // 千问
  'qianwen.com',
  'qianwen.my.cn',
  'quark.cn'
]

export function isAllowedMediaUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return ALLOWED_MEDIA_HOSTS.some(
    host => url.hostname === host || url.hostname.endsWith(`.${host}`)
  )
}

/** 去掉路径穿越与非法字符，保证 Content-Disposition 里的文件名安全 */
export function sanitizeFilename(name: string, fallback = 'media'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\.+$/, '')
    .trim()
  return cleaned || fallback
}
