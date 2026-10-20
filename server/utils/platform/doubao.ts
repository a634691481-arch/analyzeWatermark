import type { ParseResult, ParsedMedia } from '#shared/types'
import type { ImageVariant, PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { decodeHtmlEntities, fetchHtml, readFnArgsAttributes, readJsObjectLiteral, safeJsonParse } from '../http'
import { forEachNode } from '../json-walk'

const THREAD_PATH = /^\/thread\/([A-Za-z0-9_-]+)\/?$/

/**
 * 豆包图片对象的关键字段（节选，模板名为 2026-10 实测值）：
 *
 *   image_ori_raw   -> ~tplv-xxx-image_raw_hflow    无水印原图 ✅
 *   image_ori       -> ~tplv-xxx-cgen_lwm3_hflow    带水印（lwm = logo watermark）
 *   image_preview   -> ~tplv-xxx-cgen_lwm3_hflow    与 ori 同一份模板，同尺寸同体积
 *   image_thumb     -> ~tplv-xxx-cthumb_lwm3        带水印缩略图（真正的缩略尺寸）
 *
 * 实测对比（xTOlFYCgraKkBExtJ）：raw vs ori 仅右下角 238×55 px、0.196% 像素有差异，
 * 正是「豆包AI生成」水印层，画面本身一致 —— 所以「去水印」不是修图，
 * 而是把 CDN 上另一份没打水印的原始文件地址取出来。
 *
 * 模板名会变（早期是 cdld_wm3 / cpreview_wm1），但两族的语义稳定：
 * 带 `raw` 的是原图，带 `wm` / `lwm` 的是水印版。
 */
interface DoubaoImage {
  key?: string
  image_ori_raw?: ImageVariant
  image_ori?: ImageVariant
  image_preview?: ImageVariant
  image_thumb?: ImageVariant
}

/** video_list 里的单档码流。main_url 是 base64 编码的地址，不是明文 URL */
interface DoubaoVideoVariant {
  definition?: string
  quality?: string
  vwidth?: number
  vheight?: number
  codec_type?: string
  size?: number
  main_url?: string
}

interface DoubaoVideoModel {
  video_list?: Record<string, DoubaoVideoVariant>
  poster_url?: string
}

/**
 * 豆包视频对象。
 *
 * 【没有无水印版本】实测（xStCBbPYakxvVBcLM）：CDN 地址带
 * `lr=video_gen_watermark_dyn`，把该参数删掉 / 置空 / 改成别的值，返回的
 * content-length 一模一样（2916638B），说明水印是烧进画面的「豆包 AI 生成」
 * 标识（左上角，静态），属于 AIGC 强制标识，换地址拿不到干净版。
 * 所以视频一律标 watermarkFree: false，UI 上显示「仅水印版」。
 *
 * 【优先 h264】同一段视频会给两档码流：video_1 是 bytevc1、video_2 是 h264。
 * bytevc1 部分浏览器放不了，下载后也难二次编辑，所以优先取 h264。
 *
 * 【尺寸】video.width/height 是 384×216 的预览尺寸，真实分辨率在
 * video_list[].vwidth/vheight（1280×720），别取错。
 */
interface DoubaoVideo {
  vid?: string
  cover?: DoubaoImage
  width?: number
  height?: number
  /** 秒，不是毫秒（15.073 表示 15 秒） */
  duration?: number
  video_type?: string
  download_url?: string
  download_filehash?: string
  video_model?: DoubaoVideoModel | string
}

type CollectedMedia =
  | { kind: 'image', payload: DoubaoImage, prompt?: string }
  | { kind: 'video', payload: DoubaoVideo, prompt?: string }

/**
 * 判断一个对象是不是豆包的作品图片。
 *
 * 必须带 TOS key —— 页面里还散布着一些「无 key、无尺寸」的占位变体
 * （它们也有 image_preview.url 之类的字段），不加这道闸会把垃圾一起收进来。
 */
function isImagePayload(value: unknown): value is DoubaoImage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as DoubaoImage
  if (typeof candidate.key !== 'string' || !candidate.key) return false
  return Boolean(
    candidate.image_ori_raw?.url
    || candidate.image_ori?.url
    || candidate.image_preview?.url
    || candidate.image_thumb?.url
  )
}

function isVideoPayload(value: unknown): value is DoubaoVideo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as DoubaoVideo
  if (typeof candidate.vid !== 'string' || !candidate.vid) return false
  return Boolean(candidate.download_url || candidate.video_model)
}

/**
 * 页面存在两种数据来源，且形态随版本波动，所以两条路都走：
 *   1. <script data-fn-args="..."> 属性（可能是单引号也可能是双引号）
 *   2. _ROUTER_DATA = { ... } 对象字面量
 */
function extractEmbeddedPayloads(html: string): unknown[] {
  const payloads: unknown[] = []

  // data-fn-args 属性值（引号形式不固定，用逐字符扫描）
  for (const raw of readFnArgsAttributes(html)) {
    const parsed = safeJsonParse(decodeHtmlEntities(raw))
    if (parsed !== undefined) payloads.push(parsed)
  }

  const literal = readJsObjectLiteral(html, '_ROUTER_DATA = ')
  if (literal) {
    const parsed = safeJsonParse(literal)
    if (parsed !== undefined) payloads.push(parsed)
  }

  if (!payloads.length) {
    throw new ParseError('NO_MEDIA', '未能从页面读取到分享数据，可能是链接已失效或页面改版', 502)
  }
  return payloads
}

/** 把豆包的图片对象转成统一结构 */
function toImageMedia(collected: Extract<CollectedMedia, { kind: 'image' }>, index: number, suffix: string): ParsedMedia | null {
  const { payload } = collected

  // 优先级：无水印原图 > 原图 > 预览图 > 缩略图
  const raw = payload.image_ori_raw?.url ? payload.image_ori_raw : undefined
  const fallback = payload.image_ori?.url
    ? payload.image_ori
    : payload.image_preview?.url
      ? payload.image_preview
      : payload.image_thumb

  const best = raw ?? fallback
  if (!best?.url) return null

  /**
   * 缩略图必须用 image_thumb。
   * image_preview 现在与 image_ori 是同一份模板（实测同为 2720×1520 / 5MB），
   * 拿它当占位图等于每张卡片多重下 5MB —— 缩略图只有 148KB。
   */
  const thumbnail = payload.image_thumb?.url ?? payload.image_preview?.url
  const extension = extensionFromUrl(best.url) ?? extensionFromKey(payload.key)

  return {
    id: payload.key ?? best.url,
    index,
    filename: `doubao_${String(index).padStart(2, '0')}_${suffix}.${extension}`,
    type: 'image',
    url: best.url,
    thumbnailUrl: thumbnail,
    width: best.width,
    height: best.height,
    watermarkFree: Boolean(raw),
    prompt: collected.prompt
  }
}

/** video_list 的 main_url 是 base64；也兼容已经是明文的情况 */
function decodeVideoUrl(value?: string): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  if (/^https?:\/\//i.test(value)) return value

  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8')
    return /^https?:\/\//i.test(decoded) ? decoded : undefined
  }
  catch {
    return undefined
  }
}

/** h264 兼容性最好，bytevc1 放到浏览器里可能直接播不了 */
function videoCodecRank(variant: DoubaoVideoVariant): number {
  return variant.codec_type === 'h264' ? 0 : 1
}

function pickVideoSource(video: DoubaoVideo): { url: string, width?: number, height?: number, poster?: string } | undefined {
  const model = typeof video.video_model === 'string'
    ? safeJsonParse(video.video_model) as DoubaoVideoModel | undefined
    : video.video_model

  const poster = model?.poster_url
  const variants = Object.values(model?.video_list ?? {})
    .filter((item): item is DoubaoVideoVariant => Boolean(item) && typeof item === 'object')
    .sort((a, b) => videoCodecRank(a) - videoCodecRank(b))

  for (const variant of variants) {
    const url = decodeVideoUrl(variant.main_url)
    if (!url) continue
    return {
      url,
      width: variant.vwidth ?? video.width,
      height: variant.vheight ?? video.height,
      poster
    }
  }

  // 兜底：官方下载地址（实测与 bytevc1 档同源同体积）
  if (video.download_url) {
    return { url: video.download_url, width: video.width, height: video.height, poster }
  }
  return undefined
}

/** 把豆包的视频对象转成统一结构 */
function toVideoMedia(collected: Extract<CollectedMedia, { kind: 'video' }>, index: number, suffix: string): ParsedMedia | null {
  const { payload } = collected
  const source = pickVideoSource(payload)
  if (!source) return null

  const cover = payload.cover
  /**
   * 封面优先用 poster_url。
   * cover 里的 image_thumb / image_preview 指向 aka.doubaocdn.com 短链，
   * 实测两个都 404（截图里「第 2 张图是破图」就是它们），poster_url 才是可用的。
   */
  const thumbnail = source.poster
    ?? cover?.image_preview?.url
    ?? cover?.image_thumb?.url

  return {
    id: payload.vid ?? source.url,
    index,
    filename: `doubao_${String(index).padStart(2, '0')}_${suffix}.mp4`,
    type: 'video',
    url: source.url,
    thumbnailUrl: thumbnail,
    width: source.width,
    height: source.height,
    // duration 是秒，契约里要毫秒
    duration: typeof payload.duration === 'number' ? Math.round(payload.duration * 1000) : undefined,
    // 画面左上角固定烧着「豆包 AI 生成」，实测无法通过换地址去除
    watermarkFree: false,
    prompt: collected.prompt
  }
}

/**
 * 以 CDN 实际返回的模板后缀为准。
 *
 * 源 key 是 `.jpeg`，但模板名后面会再拼 `.png`（image_raw_hflow → 返回 image/png），
 * 按 key 猜会把 jpeg 写进文件名，下载器拿到的是扩展名与内容不符的文件。
 */
function extensionFromUrl(url: string): string | undefined {
  return url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1]?.toLowerCase()
}

function extensionFromKey(key?: string): string {
  const ext = key?.match(/\.([a-z0-9]+)$/i)?.[1]
  return ext ? ext.toLowerCase() : 'png'
}

export const doubaoAdapter: PlatformAdapter = {
  id: 'doubao',
  name: '豆包',
  example: 'https://www.doubao.com/thread/xxxxxxxxxxxx',
  // 豆包没有现成的品牌图标，用线稿机器人（lucide:bot）
  icon: 'i-lucide-bot',
  description: '豆包 AI 生图与生成视频下载，粘贴分享链接即可取回整个会话里的全部图片与原视频，未经二次压缩。',

  match(url) {
    return /(^|\.)doubao\.com$/i.test(url.hostname) && THREAD_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    const html = await fetchHtml(url.href, { referer: 'https://www.doubao.com/' })

    // 收集所有图片 / 视频对象 + 分享元信息
    const collected: CollectedMedia[] = []
    let title: string | undefined
    let author: string | undefined

    const payloads = extractEmbeddedPayloads(html)

    /**
     * 先扫一遍视频封面。
     *
     * 封面对象是 `{ key, image_thumb, image_preview }`，和图片对象同形，
     * 不排除会被当成第 2 张「图片」收进结果（实测视频帖就会多出一张 384×216 的破图）。
     * 同一份 SSR 数据在 3 个 payload 里各有一份副本，对象引用不同，
     * 所以只能按 key 判，WeakSet 挡不住。
     */
    const coverKeys = new Set<string>()
    for (const payload of payloads) {
      forEachNode(payload, (node) => {
        if (isVideoPayload(node.video) && node.video.cover?.key) {
          coverKeys.add(node.video.cover.key)
        }
        const selfAsVideo: unknown = node
        if (isVideoPayload(selfAsVideo) && selfAsVideo.cover?.key) {
          coverKeys.add(selfAsVideo.cover.key)
        }
      })
    }

    for (const payload of payloads) {
      forEachNode(payload, (node) => {
        if (!title) {
          const shareInfo = node.share_info as { share_name?: unknown, user?: { nick_name?: unknown } } | undefined
          if (shareInfo && typeof shareInfo === 'object') {
            if (typeof shareInfo.share_name === 'string') title = shareInfo.share_name
            const nickName = shareInfo.user?.nick_name
            if (typeof nickName === 'string') author = nickName
          }
        }

        const genParams = node.gen_params as { prompt?: unknown } | undefined
        const prompt = typeof genParams?.prompt === 'string' ? genParams.prompt : undefined

        // 形如 { video: {...}, gen_params: {...} } 的 creation 节点
        const videoInNode = node.video
        if (isVideoPayload(videoInNode)) {
          collected.push({ kind: 'video', payload: videoInNode, prompt })
          return
        }
        // 直接就是视频对象的节点（用独立变量承接，避免收窄 node 自身类型）
        const selfAsVideo: unknown = node
        if (isVideoPayload(selfAsVideo)) {
          collected.push({ kind: 'video', payload: selfAsVideo, prompt })
          return
        }

        // 形如 { image: {...}, gen_params: {...} } 的 creation 节点
        const imageInNode = node.image
        if (isImagePayload(imageInNode)) {
          if (imageInNode.key && coverKeys.has(imageInNode.key)) return
          collected.push({ kind: 'image', payload: imageInNode, prompt })
          return
        }
        // 直接就是图片对象的节点
        const selfAsImage: unknown = node
        if (isImagePayload(selfAsImage)) {
          if (selfAsImage.key && coverKeys.has(selfAsImage.key)) return
          collected.push({ kind: 'image', payload: selfAsImage, prompt })
        }
      })
    }

    // 同一张图 / 同一段视频可能在多份数据里重复出现，按 id 去重
    const seen = new Set<string>()
    const media: ParsedMedia[] = []
    for (const item of collected) {
      const id = item.kind === 'image'
        ? (item.payload.key ?? item.payload.image_ori_raw?.url ?? '')
        : (item.payload.vid ?? '')

      if (id && seen.has(id)) continue
      if (id) seen.add(id)

      const source = item.kind === 'image' ? item.payload.key : item.payload.vid
      const hash = source?.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? ''
      const suffix = hash.slice(0, 8) || String(media.length + 1).padStart(2, '0')

      const parsed = item.kind === 'image'
        ? toImageMedia(item, media.length + 1, suffix)
        : toVideoMedia(item, media.length + 1, suffix)
      if (parsed) media.push(parsed)
    }

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '该分享里没有解析到图片或视频，请确认链接内容包含 AI 生成的作品')
    }

    return {
      platform: { id: this.id, name: this.name, example: this.example },
      sourceUrl: url.href,
      title,
      author,
      media,
      parsedAt: new Date().toISOString()
    }
  }
}
