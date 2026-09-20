import type { ParseResult, ParsedMedia } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { readJsObjectLiteral, safeJsonParse } from '../http'
import { findFirstNode } from '../json-walk'
import { MOBILE_UA } from '../security'

/**
 * 抖音无水分原理（两类帖子都验证过）：
 *
 * 【视频帖】同一份原片，两个播放端点：
 *   /aweme/v1/playwm/  → 带水印（wm = watermark）
 *   /aweme/v1/play/    → 无水印 ✅
 *   把路径里的 playwm 换成 play 即可。video_id 取 video.play_addr.uri。
 *   实测：两条流逐帧对齐（5 个采样点 offset 全为 0），对齐后差异仅 0.8%~1.2%
 *         且集中在底部条带，即水印叠加层。
 *
 * 【图文帖】同一个 uri，两个 CDN 模板：
 *   images[].url_list           → ~tplv-dy-lqen-new:...        无水印 ✅
 *   images[].download_url_list  → ~tplv-dy-lqen-new-water:...  带水印
 *   模板名里的 -water 就是水印标记，URL 中 base64 段解码即「抖音号：xxxx」。
 *
 * 【数据从哪来】分享页的 SSR，但必须带 ttwid 风控票据，否则拿不到数据。
 *   ttwid 是纯 HTTP 拿到的（短链 302 时的 Set-Cookie），不需要执行 JS。
 *
 * 【不要走的路】/aweme/v1/web/aweme/detail/ 需要 a_bogus 签名 + uifid，
 *   纯请求会被 Argus 挡回 403。分享页 SSR 这条路不需要签名。
 */

/** 分享页路由：/share/video/{id}/ 或 /share/note/{id}/ */
const SHARE_PATH = /^\/(share)\/(video|note)\/(\d+)\/?$/
/** 短链：v.douyin.com/xxxx */
const SHORT_HOST = /(^|\.)v\.douyin\.com$/i

/** ttwid 缓存：30 分钟内复用，避免每次解析都多走一次请求 */
let ttwidCache: { value: string, expiresAt: number } | null = null
const TTWID_TTL = 30 * 60 * 1000

function mergeCookies(response: Response, jar: Record<string, string>): void {
  const cookies = response.headers.getSetCookie?.() ?? []
  for (const raw of cookies) {
    const pair = raw.split(';')[0] ?? ''
    const index = pair.indexOf('=')
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim()
  }
}

/** 沿短链跳转，收集 cookie，返回最终分享页 URL */
async function resolveShareUrl(shareUrl: string): Promise<{ finalUrl: string, jar: Record<string, string> }> {
  const jar: Record<string, string> = {}
  let current = shareUrl

  for (let hop = 0; hop < 6; hop++) {
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(15_000)
      })
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ParseError('FETCH_FAILED', `无法访问该链接：${reason}`, 502)
    }

    mergeCookies(response, jar)
    const location = response.headers.get('location')
    if (!location) break
    current = new URL(location, current).href
  }

  return { finalUrl: current, jar }
}

/** 取一个可用的 ttwid（短链跳转拿不到时补一次首页） */
async function acquireTtwid(jar: Record<string, string>): Promise<string> {
  if (jar.ttwid) return jar.ttwid

  for (const seed of ['https://www.iesdouyin.com/', 'https://www.douyin.com/']) {
    try {
      const response = await fetch(seed, {
        redirect: 'manual',
        headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(10_000)
      })
      mergeCookies(response, jar)
    }
    catch {
      // 种子请求失败不影响主流程，后面会给出明确报错
    }
    if (jar.ttwid) break
  }

  return jar.ttwid ?? ''
}

/** 带 ttwid 请求分享页，取出 SSR 里的作品数据 */
async function fetchAwemeItem(shareUrl: string, forceFreshTtwid: boolean) {
  const { finalUrl, jar } = await resolveShareUrl(shareUrl)

  if (forceFreshTtwid) ttwidCache = null
  if (!ttwidCache || ttwidCache.expiresAt < Date.now()) {
    const value = await acquireTtwid(jar)
    if (value) ttwidCache = { value, expiresAt: Date.now() + TTWID_TTL }
  }
  if (ttwidCache?.value) jar.ttwid = ttwidCache.value

  const response = await fetch(finalUrl, {
    redirect: 'manual',
    headers: {
      'user-agent': MOBILE_UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
      'cookie': Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
      'referer': 'https://www.douyin.com/'
    },
    signal: AbortSignal.timeout(15_000)
  })

  if (response.status === 404) {
    throw new ParseError('NOT_FOUND', '该作品不存在或已被删除', 404)
  }
  if (!response.ok) {
    throw new ParseError('FETCH_FAILED', `分享页返回 HTTP ${response.status}`, 502)
  }

  const html = await response.text()
  const literal = readJsObjectLiteral(html, '_ROUTER_DATA = ')
  if (!literal) {
    throw new ParseError('NO_MEDIA', '页面里没有 SSR 数据，链接可能已失效或风控升级', 502)
  }

  const payload = safeJsonParse(literal)
  const holder = payload === undefined
    ? undefined
    : findFirstNode(payload, node => Array.isArray(node.item_list) && node.item_list.length > 0)

  const itemList = holder?.item_list
  if (!Array.isArray(itemList) || !itemList.length) return undefined
  return itemList[0] as Record<string, any>
}

/** 文件后缀：图片优先 jpeg（兼容性最好），视频固定 mp4 */
function pickImageUrl(list: unknown): string | undefined {
  if (!Array.isArray(list) || !list.length) return undefined
  const urls = list.filter((url): url is string => typeof url === 'string')
  return urls.find(url => /\.jpe?g(\?|$)/i.test(url)) ?? urls[0]
}

function extensionFromUrl(url?: string): string {
  const ext = url?.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]
  return (ext ?? 'jpeg').toLowerCase()
}

/** 视频：playwm -> play，并把清晰度提到 1080p（服务端会向源清晰度收敛） */
function buildCleanVideoUrl(watermarkUrl: string): string {
  try {
    const url = new URL(watermarkUrl)
    url.pathname = url.pathname.replace('/playwm/', '/play/')
    if (url.searchParams.has('ratio')) url.searchParams.set('ratio', '1080p')
    return url.href
  }
  catch {
    return watermarkUrl.replace('/playwm/', '/play/')
  }
}

/** 把抖音的作品对象归一化成统一结构 */
function toMediaList(item: Record<string, any>, suffix: string): ParsedMedia[] {
  const images = Array.isArray(item.images) ? item.images : []

  // 图文帖：每张图一个无水印地址
  if (images.length) {
    return images.flatMap((image, position): ParsedMedia[] => {
      const cleanUrl = pickImageUrl(image?.url_list)
      if (!cleanUrl) return []

      const watermarked = pickImageUrl(image?.download_url_list)
      const index = position + 1
      return [{
        id: image?.uri ?? cleanUrl,
        index,
        filename: `douyin_${String(index).padStart(2, '0')}_${suffix}.${extensionFromUrl(cleanUrl)}`,
        type: 'image',
        url: cleanUrl,
        // 带水印版本同时当占位图，先出画面再等原图
        thumbnailUrl: watermarked,
        width: image?.width,
        height: image?.height,
        watermarkFree: !/-water/i.test(cleanUrl),
        prompt: item.desc
      }]
    })
  }

  // 视频帖
  const watermarkedUrl = item.video?.play_addr?.url_list?.[0]
  if (typeof watermarkedUrl === 'string' && watermarkedUrl) {
    const cleanUrl = buildCleanVideoUrl(watermarkedUrl)
    return [{
      id: item.aweme_id ?? item.video?.play_addr?.uri ?? '1',
      index: 1,
      filename: `douyin_${suffix}.mp4`,
      type: 'video',
      url: cleanUrl,
      thumbnailUrl: item.video?.cover?.url_list?.[0],
      width: item.video?.width,
      height: item.video?.height,
      duration: item.video?.duration,
      watermarkFree: cleanUrl !== watermarkedUrl,
      prompt: item.desc
    }]
  }

  return []
}

export const douyinAdapter: PlatformAdapter = {
  id: 'douyin',
  name: '抖音',
  example: 'https://v.douyin.com/xxxxxxxx/',
  // 抖音与 TikTok 同源，simple-icons 只有后者
  icon: 'i-simple-icons-tiktok',
  description: '抖音无水印视频与图文图集下载，支持分享短链，视频默认取 1080P 原画，图集按原始尺寸取回。',

  match(url) {
    if (SHORT_HOST.test(url.hostname)) return true
    return /(^|\.)(douyin|iesdouyin)\.com$/i.test(url.hostname) && SHARE_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    // 首次失败时换一个 ttwid 重试，避免缓存票据失效导致误判
    let item = await fetchAwemeItem(url.href, false)
    if (!item) {
      item = await fetchAwemeItem(url.href, true)
    }
    if (!item) {
      throw new ParseError('NO_MEDIA', '未能读取到作品数据，请确认链接可正常打开')
    }

    const awemeId = String(item.aweme_id ?? '')
    const suffix = awemeId.slice(-8) || '01'
    const media = toMediaList(item, suffix)

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '该作品里没有解析到可下载的图片或视频')
    }

    return {
      platform: { id: this.id, name: this.name, example: this.example },
      sourceUrl: url.href,
      title: typeof item.desc === 'string' ? item.desc : undefined,
      author: typeof item.author?.nickname === 'string' ? item.author.nickname : undefined,
      media,
      parsedAt: new Date().toISOString()
    }
  }
}
