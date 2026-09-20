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
  'quark.cn',
  // 哔哩哔哩
  'bilibili.com',
  'b23.tv',
  'bilivideo.com',
  'bilivideo.cn',
  'hdslb.com',
  // 微博
  'weibo.com',
  'weibo.cn',
  'weibocdn.com',
  'sinaimg.cn',
  // 快手
  'kuaishou.com',
  'chenzhongtech.com',
  'gifshow.com',
  'yximgs.com',
  'kwimgs.com',
  'kwaicdn.com'
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

/**
 * 少数 CDN 会校验 Referer，缺了直接 403（B 站的 bilivideo 就是这样）。
 * 这里用精确的域名规则，而不是「一律带 referer」，
 * 免得把代理变成通用的带 referer 转发器。
 */
const REFERER_RULES: [RegExp, string][] = [
  [/(^|\.)(bilivideo\.(com|cn)|hdslb\.com|bilibili\.com)$/i, 'https://www.bilibili.com/'],
  // 微博图床/视频 CDN 不带 Referer 直接 403
  [/(^|\.)(weibocdn\.com|sinaimg\.cn|weibo\.com|weibo\.cn)$/i, 'https://weibo.com/']
]

/** 返回该资源域名需要的 Referer；不需要则返回 undefined */
export function refererForHost(hostname: string): string | undefined {
  return REFERER_RULES.find(([pattern]) => pattern.test(hostname))?.[1]
}


/** 去掉路径穿越与非法字符，保证 Content-Disposition 里的文件名安全 */
export function sanitizeFilename(name: string, fallback = 'media'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .replace(/\.+$/, '')
    .trim()
  return cleaned || fallback
}
