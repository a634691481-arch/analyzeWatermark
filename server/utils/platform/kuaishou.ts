import type { ParseResult, ParsedMedia } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { readJsObjectLiteral, safeJsonParse } from '../http'
import { MOBILE_UA } from '../security'

/**
 * 快手无水印原理
 *
 * 【数据从哪来】分享页是 SSR 的，数据内联在 `window.INIT_STATE = {...}` 里，
 * 不需要签名、不需要 cookie，跟着短链 302 到作品页再抓一次 HTML 就行。
 *
 *   v.kuaishou.com/xxxxxx            302 → v.m.chenzhongtech.com/fw/photo/{id}?shareToken=…
 *   www.kuaishou.com/short-video/{id} 302 → m.gifshow.com/fw/photo/{id}
 *   直接给 …/fw/photo/{id}（不带任何 query）同样能拿到数据
 *
 * ⚠️ 必须带「完整的 Accept」：只发 `Accept: text/html` 时页面会缩水到 ~96KB
 *    并且 INIT_STATE 里没有 photo（同一个链接实测 185KB ↔ 96KB 两种结果），
 *    所以这里固定用浏览器那串 accept。
 *
 * 【关于水印：这里是错的，别再照抄】
 * 曾经根据前端 bundle 里 `srcNoMark: Ki(l.mainMvUrls)` 这个名字，判断
 * `photo.mainMvUrls[0].url` 就是无水印源。**这个推断不成立** ——
 * 字段名只是前端给「播放源」起的别名，不代表流里没有水印。
 *
 * 2026-09 用真实链接（v.kuaishou.com/K23oc0R9）实测复核，结论是：
 *   1. 短视频顶部左侧确实有一条**烧进画面**的叠加层
 *      —— 该区域平均横向梯度 15.79，而中间/右下对照区只有 1.01 / 0.88（差 15 倍），
 *         且帧间相关性 0.44（全画面仅 0.14），是固定的文字/logo。
 *   2. 这条水印在 **所有官方流里都存在**。候选两两做带符号亮度差：
 *      mainMvUrls[0](720p h264) / manifest.representation[0] 完全同源（0 差异），
 *      与 representation[1](720p hevc) / [2](1080p hevc) 在 16 个采样点里有 14 个
 *      像素级零差异，仅 2 个点因转码/运动略有偏差（既变亮又变暗，非叠加层特征）。
 *      → 没有「另一条干净流」可取，换地址解决不了水印。
 *
 * 【那还能做什么】只能如实说明：水印是随内容下发的（作者或平台的 AI 计划烧入），
 * 任何下载源都带着，去不掉；要真去掉得上视频修复/重绘，不在本工具范围。
 * 适配器的职责只是「拿到平台给的最优源文件」。
 *
 * 【选哪条流】representation 里只有 h264（mainMvUrls，720p）和 hevc（720p/1080p）：
 *   mainMvUrls[0]      h264 1280x720  899kbps  ← 选它
 *   representation[1]  hevc 1280x720  472kbps
 *   representation[2]  hevc 1920x1080 778kbps
 * hevc 虽然有 1080p，但浏览器 <video> 基本放不了、Windows 还要额外装解码器，
 * 而卡片里要能直接预览，所以固定取 h264 那条。
 *
 * 【三类作品】结构都在 photo 对象里：
 *   视频   → mainMvUrls[0].url（path 里的 upic 是原始上传目录）
 *   单图   → 同上，URL 结尾是图片后缀
 *   图集   → photo.atlas = { cdnList:[{cdn}], list:[path], size:[{w,h}] }
 *            地址 = `https://{cdnList[0].cdn}{list[i]}`（list 项以 / 开头）
 *            图集分支的结构取自快手前端 bundle，尚未用真实图集链接回归。
 */

/** 短链：v.kuaishou.com/xxxxxx */
const SHORT_HOST = /(^|\.)v\.kuaishou\.com$/i
/** 作品页域名：m.gifshow.com / v.m.chenzhongtech.com / www.kuaishou.com */
const PHOTO_HOST = /(^|\.)(kuaishou|chenzhongtech|gifshow)\.com$/i
/** 作品页路径：/fw/photo/{id}、/short-video/{id} */
const PHOTO_PATH = /^\/(?:fw\/photo|short-video|photo|f)\/([A-Za-z0-9_-]+)\/?$/i

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i

interface KsCdnNode { cdn?: string, url?: string }
interface KsAtlas { cdnList?: KsCdnNode[], list?: unknown[], size?: unknown[] }
interface KsPhoto {
  photoId?: string | number
  caption?: string
  userName?: string
  width?: number
  height?: number
  duration?: number
  mainMvUrls?: KsCdnNode[]
  coverUrls?: KsCdnNode[]
  overrideCoverUrls?: { jpgCdnNodeView?: KsCdnNode[], webpCdnNodeView?: KsCdnNode[] }
  atlas?: KsAtlas
}

/** 跟着短链跳转，拿到最终作品页 URL（shareToken 就在跳转后的 query 里） */
async function resolveFinalUrl(shareUrl: string): Promise<string> {
  let current = shareUrl

  for (let hop = 0; hop < 6; hop++) {
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        headers: { 'user-agent': MOBILE_UA },
        signal: AbortSignal.timeout(15_000)
      })
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ParseError('FETCH_FAILED', `无法访问该链接：${reason}`, 502)
    }

    const location = response.headers.get('location')
    if (!location) break
    current = new URL(location, current).href
  }

  return current
}

/** 抓作品页 HTML（accept 必须完整，否则拿不到 SSR 数据） */
async function fetchShareHtml(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': MOBILE_UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9'
      },
      signal: AbortSignal.timeout(15_000)
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ParseError('FETCH_FAILED', `无法访问该链接：${reason}`, 502)
  }

  if (response.status === 404) {
    throw new ParseError('NOT_FOUND', '该作品不存在或已被删除', 404)
  }
  if (!response.ok) {
    throw new ParseError('FETCH_FAILED', `分享页返回 HTTP ${response.status}`, 502)
  }

  return response.text()
}

/**
 * 从 INIT_STATE 里找作品对象。
 *
 * INIT_STATE 的 key 是被编码过的（每个字符 +1，例如 `photo…` → `qipup…`），
 * 但 value 是明文，所以不解析 key，直接在 value 里找带 `photo` 的那一个。
 */
function extractPhoto(html: string): KsPhoto | null {
  const literal = readJsObjectLiteral(html, 'window.INIT_STATE = ')
    ?? readJsObjectLiteral(html, 'window.INIT_STATE=')
  if (!literal) {
    throw new ParseError('NO_MEDIA', '页面里没有 SSR 数据，链接可能已失效或风控升级', 502)
  }

  const state = safeJsonParse(literal) as Record<string, unknown> | undefined
  if (!state || typeof state !== 'object') {
    throw new ParseError('NO_MEDIA', 'SSR 数据无法解析', 502)
  }

  let fallback: KsPhoto | null = null
  for (const value of Object.values(state)) {
    if (!value || typeof value !== 'object') continue
    const photo = (value as { photo?: KsPhoto }).photo
    if (!photo || typeof photo !== 'object') continue

    // 优先选真正带媒体的那份，避免被别的接口占位数据抢先
    if (photo.mainMvUrls?.length || photo.atlas || (photo as { singlePicture?: boolean }).singlePicture) {
      return photo
    }
    fallback ??= photo
  }

  return fallback
}

/** 快捷取 CDN 节点里的地址（快手给的是一组 { cdn, url } 备选） */
function firstUrl(nodes?: KsCdnNode[]): string | undefined {
  for (const node of nodes ?? []) {
    if (typeof node?.url === 'string' && node.url) return node.url
  }
  return undefined
}

function pickCover(photo: KsPhoto): string | undefined {
  return firstUrl(photo.overrideCoverUrls?.jpgCdnNodeView)
    ?? firstUrl(photo.overrideCoverUrls?.webpCdnNodeView)
    ?? firstUrl(photo.coverUrls)
}

function extensionFromUrl(url: string, fallback = 'jpg'): string {
  const ext = url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]
  return ext ? ext.toLowerCase() : fallback
}

function pad(index: number): string {
  return String(index).padStart(2, '0')
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 图集：地址 = https://{cdn}{path}，尺寸来自 atlas.size[i] */
function toAtlasMedia(atlas: KsAtlas, suffix: string, prompt?: string): ParsedMedia[] {
  const cdn = atlas.cdnList?.[0]?.cdn
  const list = Array.isArray(atlas.list) ? atlas.list : []
  if (typeof cdn !== 'string' || !cdn || !list.length) return []

  return list.flatMap((path, position): ParsedMedia[] => {
    if (typeof path !== 'string' || !path) return []
    const url = /^https?:\/\//i.test(path) ? path : `https://${cdn}${path.startsWith('/') ? '' : '/'}${path}`

    // size 项可能是 { w, h } 也可能是 [w, h]
    const raw = atlas.size?.[position]
    const width = Array.isArray(raw) ? numberOrUndefined(raw[0]) : numberOrUndefined((raw as { w?: unknown } | undefined)?.w)
    const height = Array.isArray(raw) ? numberOrUndefined(raw[1]) : numberOrUndefined((raw as { h?: unknown } | undefined)?.h)

    const index = position + 1
    return [{
      id: `${suffix}-${index}-${extensionFromUrl(url)}`,
      index,
      filename: `kuaishou_${pad(index)}_${suffix}.${extensionFromUrl(url)}`,
      type: 'image',
      url,
      width,
      height,
      watermarkFree: true,
      prompt
    }]
  })
}

/** 单图：复用 mainMvUrls[0]，URL 结尾是图片后缀 */
function toImageMedia(url: string, suffix: string, photo: KsPhoto, prompt?: string): ParsedMedia {
  return {
    id: photo.photoId ? String(photo.photoId) : url,
    index: 1,
    filename: `kuaishou_${suffix}.${extensionFromUrl(url)}`,
    type: 'image',
    url,
    thumbnailUrl: pickCover(photo),
    width: numberOrUndefined(photo.width),
    height: numberOrUndefined(photo.height),
    watermarkFree: true,
    prompt
  }
}

/** 视频：mainMvUrls[0] 即前端命名的 srcNoMark（无水印播放源） */
function toVideoMedia(url: string, suffix: string, photo: KsPhoto, prompt?: string): ParsedMedia {
  return {
    id: photo.photoId ? String(photo.photoId) : url,
    index: 1,
    filename: `kuaishou_${suffix}.mp4`,
    type: 'video',
    url,
    thumbnailUrl: pickCover(photo),
    width: numberOrUndefined(photo.width),
    height: numberOrUndefined(photo.height),
    duration: numberOrUndefined(photo.duration),
    watermarkFree: true,
    prompt
  }
}

/** 把快手作品对象归一化成统一结构 */
function toMediaList(photo: KsPhoto, suffix: string): ParsedMedia[] {
  const prompt = typeof photo.caption === 'string' ? photo.caption : undefined

  // 图集优先：它不带 mainMvUrls
  if (photo.atlas) {
    const images = toAtlasMedia(photo.atlas, suffix, prompt)
    if (images.length) return images
  }

  const main = firstUrl(photo.mainMvUrls)
  if (!main) return []

  return [IMAGE_EXT.test(main)
    ? toImageMedia(main, suffix, photo, prompt)
    : toVideoMedia(main, suffix, photo, prompt)]
}

export const kuaishouAdapter: PlatformAdapter = {
  id: 'kuaishou',
  name: '快手',
  example: 'https://v.kuaishou.com/xxxxxx',
  icon: 'i-simple-icons-kuaishou',
  description: '快手短视频与图集下载，取平台提供的最高可用画质源文件，支持分享短链。',

  match(url) {
    if (SHORT_HOST.test(url.hostname)) return true
    return PHOTO_HOST.test(url.hostname) && PHOTO_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    const finalUrl = await resolveFinalUrl(url.href)
    const html = await fetchShareHtml(finalUrl)
    const photo = extractPhoto(html)

    if (!photo) {
      throw new ParseError('NO_MEDIA', '未能读取到作品数据，请确认链接可正常打开')
    }

    const photoId = photo.photoId ? String(photo.photoId) : ''
    const suffix = photoId.slice(-8) || '01'
    const media = toMediaList(photo, suffix)

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '该作品里没有解析到可下载的图片或视频')
    }

    return {
      platform: { id: this.id, name: this.name, example: this.example },
      sourceUrl: url.href,
      title: typeof photo.caption === 'string' ? photo.caption : undefined,
      author: typeof photo.userName === 'string' ? photo.userName : undefined,
      media,
      parsedAt: new Date().toISOString()
    }
  }
}
