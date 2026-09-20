import type { ParseResult, ParsedMedia } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { parseLooseJsonState, readJsObjectLiteral } from '../http'
import { MOBILE_UA } from '../security'

/**
 * 小红书无水印原理：
 *
 * 1) 短链 xhslink.cn/o/xxx 302 到
 *    https://www.xiaohongshu.com/discovery/item/{noteId}?xsec_token=xxx&xsec_source=app_share
 *    **xsec_token 是强制的**，缺了会 302 到 /404/sec_xxx。
 *
 * 2) **必须用移动端 UA**：桌面 UA 会 302 到登录页，只有移动端分享页带 SSR 数据。
 *
 * 3) 数据在页面内联的 `window.__INITIAL_STATE__` 里（注意里面混着 JS 的
 *    `undefined` 字面量，不是严格 JSON，要先洗一遍）。
 *    路径：noteData.data.noteData
 *
 * 4) 图片：imageList[].fileId 是 TOS 对象键，通过 `!` 后缀选 CDN 模板。
 *    这里有个坑：**模板分族，水印只加在 h5_* 一族上**。
 *
 *    实测（同一 fileId，5 张图逐一验证）：
 *      !h5_1080jpg / !h5_1080webp        → 带白色文字水印 ❌
 *      !nd_dft_*（4 个变体互相像素一致）  → 干净 ✅
 *
 *    判定依据：把 h5 版与 nd 版缩放到同尺寸做**带符号**亮度差，
 *    h5 只亮不暗（~570 : 0），且差异固定在 y351-368（细笔划文字），
 *    5 张图位置完全一致 —— 这就是服务端叠加的水印层，不是压缩噪点。
 *
 *    可选模板：
 *      !nd_dft_wlteh_jpg_3  → 1080x1440 JPEG（主下载，通用格式）
 *      !nd_dft_wgth_webp_3  → 810x1080 WEBP（占位小图）
 *      {fileId}（无后缀）    → 源文件，实测是 iPhone HEIC（4284x5712）
 *    fileId 里没有日期/签名段，所以这些地址都是**长期有效**的。
 *
 * 5) 视频：`video.consumer.originVideoKey` 是原始对象键，拼到
 *    https://sns-video-bd.xhscdn.com/{originVideoKey} 即无水印原视频；
 *    `video.media.stream.*[].masterUrl` 是带水印的转码流。
 *
 * ⚠️ 视频分支尚未用真实分享链接验证过（拿不到带 xsec_token 的视频链接），
 *    代码按上面的结构实现，等有视频用例再回归。
 */

/** 短链：xhslink.cn / xhslink.com */
const SHORT_HOST = /(^|\.)xhslink\.(cn|com)$/i
const NOTE_PATH = /^\/(?:discovery\/item|explore)\/([0-9a-f]{24})\/?$/i

/** 图片资源 CDN（fileId 直取，无过期参数） */
const IMG_CDN = 'https://sns-img-bd.xhscdn.com'
/** 视频资源 CDN */
const VIDEO_CDN = 'https://sns-video-bd.xhscdn.com'
/** 无水印模板：nd_dft_* 一族；h5_* 一族带水印，不要用 */
const JPEG_TEMPLATE = '!nd_dft_wlteh_jpg_3'
const THUMB_TEMPLATE = '!nd_dft_wgth_webp_3'

interface XhsImage {
  /** TOS 对象键，用来重建无水印地址 */
  fileId?: string
  /** 源文件尺寸（用于换算下载尺寸），不是下载地址的尺寸 */
  width?: number
  height?: number
}

function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://')
}

/** 1080 模板下实际交付的尺寸（短边收敛到 1080） */
function deliveredSize(width?: number, height?: number): { width?: number, height?: number } {
  if (!width || !height) return {}
  const shortSide = Math.min(width, height)
  if (shortSide <= 1080) return { width, height }
  const scale = 1080 / shortSide
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** 视频：原始对象键拼 CDN 即可拿到无水印原片 */
function buildVideoMedia(video: Record<string, any>, detail: Record<string, any>, suffix: string): ParsedMedia | null {
  const originKey = video?.consumer?.originVideoKey
  const streams = video?.media?.stream ?? {}
  const watermarked = streams.h264?.[0]?.masterUrl ?? streams.h265?.[0]?.masterUrl
  const cover = detail.imageList?.[0]?.url

  if (typeof originKey === 'string' && originKey) {
    return {
      id: `${detail.noteId}-video`,
      index: 1,
      filename: `xiaohongshu_${suffix}.mp4`,
      type: 'video',
      url: `${VIDEO_CDN}/${originKey}`,
      thumbnailUrl: typeof cover === 'string' ? toHttps(cover) : undefined,
      width: detail.video?.width ?? video.width,
      height: detail.video?.height ?? video.height,
      duration: video?.capa?.duration ?? detail.video?.capa?.duration,
      watermarkFree: true,
      prompt: typeof detail.desc === 'string' ? detail.desc : undefined
    }
  }

  // 拿不到原始对象键时，退回带水印流，并如实标注
  if (typeof watermarked === 'string') {
    return {
      id: `${detail.noteId}-video`,
      index: 1,
      filename: `xiaohongshu_${suffix}.mp4`,
      type: 'video',
      url: toHttps(watermarked),
      thumbnailUrl: typeof cover === 'string' ? toHttps(cover) : undefined,
      watermarkFree: false,
      prompt: typeof detail.desc === 'string' ? detail.desc : undefined
    }
  }

  return null
}

function toImageMedia(image: XhsImage, index: number, detail: Record<string, any>, suffix: string): ParsedMedia | null {
  const fileId = image.fileId
  if (!fileId) return null

  // 注意：不要用 imageList[].url / infoList 里的预览地址，
  // 它们属于 h5_* 一族，带服务端水印；这里统一按 fileId 重建干净地址。
  const size = deliveredSize(image.width, image.height)

  return {
    id: fileId,
    index,
    filename: `xiaohongshu_${String(index).padStart(2, '0')}_${suffix}.jpeg`,
    type: 'image',
    url: `${IMG_CDN}/${fileId}${JPEG_TEMPLATE}`,
    originalUrl: `${IMG_CDN}/${fileId}`,
    thumbnailUrl: `${IMG_CDN}/${fileId}${THUMB_TEMPLATE}`,
    width: size.width,
    height: size.height,
    watermarkFree: true,
    prompt: typeof detail.desc === 'string' ? detail.desc : undefined
  }
}

async function fetchNoteDetail(shareUrl: string) {
  // 短链要跟着跳转，把 xsec_token 一起带到最终地址
  let current = shareUrl
  for (let hop = 0; hop < 6; hop++) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' },
      signal: AbortSignal.timeout(15_000)
    }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ParseError('FETCH_FAILED', `无法访问该链接：${reason}`, 502)
    })

    const location = response.headers.get('location')
    if (!location) break
    current = new URL(location, current).href
  }

  const response = await fetch(current, {
    redirect: 'manual',
    headers: {
      'user-agent': MOBILE_UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
      'referer': 'https://www.xiaohongshu.com/'
    },
    signal: AbortSignal.timeout(15_000)
  })

  const html = await response.text()

  // 被风控/跳登录时页面里没有 SSR 数据
  const literal = readJsObjectLiteral(html, '__INITIAL_STATE__=')
  if (!literal) {
    throw new ParseError('NO_MEDIA', '未能读取到笔记数据，笔记可能已删除或链接已过期', 502)
  }

  const state = parseLooseJsonState(literal) as Record<string, any> | undefined
  const detail = state?.noteData?.data?.noteData
  if (!detail) {
    throw new ParseError('NO_MEDIA', '笔记数据为空，可能是私密笔记或链接已失效')
  }
  return detail as Record<string, any>
}

export const xiaohongshuAdapter: PlatformAdapter = {
  id: 'xiaohongshu',
  name: '小红书',
  example: 'https://xhslink.cn/o/xxxxxxxx',
  icon: 'i-simple-icons-xiaohongshu',

  match(url) {
    if (SHORT_HOST.test(url.hostname)) return true
    return /(^|\.)xiaohongshu\.com$/i.test(url.hostname) && NOTE_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    const detail = await fetchNoteDetail(url.href)
    const noteId = String(detail.noteId ?? '')
    const suffix = noteId.slice(-8) || '01'

    let media: ParsedMedia[] = []

    if (Array.isArray(detail.imageList) && detail.imageList.length) {
      media = detail.imageList
        .map((image: XhsImage, position: number) => toImageMedia(image, position + 1, detail, suffix))
        .filter((item: ParsedMedia | null): item is ParsedMedia => Boolean(item))
    }
    else if (detail.video) {
      const video = buildVideoMedia(detail.video, detail, suffix)
      if (video) media = [video]
    }

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '该笔记里没有解析到可下载的图片或视频')
    }

    return {
      platform: { id: this.id, name: this.name, example: this.example },
      sourceUrl: url.href,
      title: typeof detail.title === 'string' ? detail.title : undefined,
      author: typeof detail.user?.nickName === 'string' ? detail.user.nickName : undefined,
      media,
      parsedAt: new Date().toISOString()
    }
  }
}
