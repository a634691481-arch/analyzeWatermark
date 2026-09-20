/** 浏览器 UA：目标站点对非浏览器 UA 会返回空壳页面 */
export const BROWSER_UA
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * 允许服务端代下载 / 代预览的域名白名单。
 * 只放图床域名，避免这个接口被当成任意 URL 的代理（SSRF）。
 */
export const ALLOWED_IMAGE_HOSTS = [
  'byteimg.com',
  'doubao.com',
  'bytecdn.cn',
  'volccdn.com'
]

export function isAllowedImageUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return ALLOWED_IMAGE_HOSTS.some(
    host => url.hostname === host || url.hostname.endsWith(`.${host}`)
  )
}

/** 去掉路径穿越与非法字符，保证 Content-Disposition 里的文件名安全 */
export function sanitizeFilename(name: string, fallback = 'image'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\.+$/, '')
    .trim()
  return cleaned || fallback
}
