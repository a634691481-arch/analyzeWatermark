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

interface CollectedImage {
  payload: DoubaoImage
  prompt?: string
}

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
function toParsedMedia(collected: CollectedImage, index: number, awemeSuffix: string): ParsedMedia | null {
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
    filename: `doubao_${String(index).padStart(2, '0')}_${awemeSuffix}.${extension}`,
    type: 'image',
    url: best.url,
    thumbnailUrl: thumbnail,
    width: best.width,
    height: best.height,
    watermarkFree: Boolean(raw),
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
  description: '豆包 AI 生图的无水印原图下载，粘贴分享链接即可取回整个会话里的全部图片，未经二次压缩。',

  match(url) {
    return /(^|\.)doubao\.com$/i.test(url.hostname) && THREAD_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    const html = await fetchHtml(url.href, { referer: 'https://www.doubao.com/' })

    // 收集所有图片对象 + 分享元信息
    const collected: CollectedImage[] = []
    let title: string | undefined
    let author: string | undefined

    for (const payload of extractEmbeddedPayloads(html)) {
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

        // 形如 { image: {...}, gen_params: {...} } 的 creation 节点
        if (isImagePayload(node.image)) {
          collected.push({ payload: node.image, prompt })
          return
        }
        // 直接就是图片对象的节点
        if (isImagePayload(node)) {
          collected.push({ payload: node, prompt })
        }
      })
    }

    // 同一张图可能在多份数据里重复出现，按图片 key 去重
    const seen = new Set<string>()
    const media: ParsedMedia[] = []
    for (const item of collected) {
      const id = item.payload.key ?? item.payload.image_ori_raw?.url ?? ''
      if (id && seen.has(id)) continue
      if (id) seen.add(id)

      const hash = item.payload.key?.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? ''
      const suffix = hash.slice(0, 8) || String(media.length + 1).padStart(2, '0')
      const parsed = toParsedMedia(item, media.length + 1, suffix)
      if (parsed) media.push(parsed)
    }

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '该分享里没有解析到图片，请确认链接内容包含 AI 生成的图片')
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
