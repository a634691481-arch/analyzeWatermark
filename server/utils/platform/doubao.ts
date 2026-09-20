import type { ParseResult, ParsedImage } from '#shared/types'
import type { ImageVariant, PlatformAdapter } from './types'
import { ParseError } from '../errors'
import {
  decodeHtmlEntities,
  fetchHtml,
  readFnArgsAttributes,
  readRouterDataLiteral,
  safeJsonParse,
  tryParseJsonString
} from '../http'

const THREAD_PATH = /^\/thread\/([A-Za-z0-9_-]+)\/?$/

/**
 * 豆包图片对象的关键字段（节选）：
 *
 *   image_ori_raw   -> ~tplv-xxx-image_raw.png     无水印原图 ✅
 *   image_ori       -> ~tplv-xxx-cdld_wm3.png      带水印（wm = watermark）
 *   image_preview   -> ~tplv-xxx-cpreview_wm1.png  带水印预览图
 *   image_thumb     -> ~tplv-xxx-cthumb_wm1.png    带水印缩略图
 *
 * 所以「去水印」的本质不是修图，而是把 CDN 上另一份没打水印的原始文件地址取出来。
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

interface ExtractResult {
  images: CollectedImage[]
  title?: string
  author?: string
}

/** 判断一个对象是不是豆包的图片对象（至少含一个带 url 的尺寸变体） */
function isImagePayload(value: unknown): value is DoubaoImage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as DoubaoImage
  return Boolean(
    candidate.image_ori_raw?.url
    || candidate.image_ori?.url
    || candidate.image_preview?.url
    || candidate.image_thumb?.url
  )
}

/**
 * 读取页面内嵌的 SSR 数据。
 *
 * 页面存在两种数据来源，且形态随版本波动，所以两条路都走：
 *   1. <script data-fn-args="..."> 属性（可能是单引号也可能是双引号）
 *   2. _ROUTER_DATA = { ... } 对象字面量
 */
function extractEmbeddedPayloads(html: string): unknown[] {
  const payloads: unknown[] = []

  for (const raw of readFnArgsAttributes(html)) {
    const parsed = safeJsonParse(decodeHtmlEntities(raw))
    if (parsed !== undefined) payloads.push(parsed)
  }

  const literal = readRouterDataLiteral(html)
  if (literal) {
    const parsed = safeJsonParse(literal)
    if (parsed !== undefined) payloads.push(parsed)
  }

  if (!payloads.length) {
    throw new ParseError('NO_IMAGES', '未能从页面读取到分享数据，可能是链接已失效或页面改版', 502)
  }
  return payloads
}

const MAX_WALK_DEPTH = 16

/**
 * 深度优先遍历整份 SSR 数据，收集图片对象。
 *
 * 两个关键设计：
 *  1. 不写死 JSON 路径 —— 豆包会调整字段层级，路径写死容易失效；
 *     按文档顺序遍历则始终能拿到数据，且顺序即会话顺序。
 *  2. 遇到「JSON 字符串」自动解包 —— 页面会把 message.content、
 *     routerDataFnArgs 这类字段再包一层字符串，不解包就看不到图片。
 */
function extractFromPayload(payload: unknown): ExtractResult {
  const result: ExtractResult = { images: [] }
  const visited = new WeakSet<object>()

  const visit = (node: unknown, inheritedPrompt: string | undefined, depth: number) => {
    if (depth > MAX_WALK_DEPTH || node === null || node === undefined) return

    if (typeof node === 'string') {
      const nested = tryParseJsonString(node)
      if (nested !== undefined) visit(nested, inheritedPrompt, depth + 1)
      return
    }

    if (typeof node !== 'object' || visited.has(node)) return
    visited.add(node)

    if (Array.isArray(node)) {
      for (const item of node) visit(item, inheritedPrompt, depth + 1)
      return
    }

    const record = node as Record<string, unknown>

    // 分享元信息
    const shareInfo = record.share_info as
      | { share_name?: unknown, user?: { nick_name?: unknown } }
      | undefined
    if (shareInfo && typeof shareInfo === 'object') {
      if (!result.title && typeof shareInfo.share_name === 'string') result.title = shareInfo.share_name
      const nickName = shareInfo.user?.nick_name
      if (!result.author && typeof nickName === 'string') result.author = nickName
    }

    // 提示词向下继承，便于挂到图片上
    const genParams = record.gen_params as { prompt?: unknown } | undefined
    const prompt = typeof genParams?.prompt === 'string' ? genParams.prompt : inheritedPrompt

    // 形如 { image: {...}, gen_params: {...} } 的 creation 节点
    if (isImagePayload(record.image)) {
      result.images.push({ payload: record.image, prompt })
      for (const [key, value] of Object.entries(record)) {
        if (key === 'image') continue
        visit(value, prompt, depth + 1)
      }
      return
    }

    // 本身就是图片对象的节点
    if (isImagePayload(record)) {
      result.images.push({ payload: record, prompt })
      return
    }

    for (const value of Object.values(record)) visit(value, prompt, depth + 1)
  }

  visit(payload, undefined, 0)
  return result
}

/** 把豆包的图片对象转成统一结构 */
function toParsedImage(collected: CollectedImage, index: number): ParsedImage | null {
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

  const watermarkUrl = payload.image_preview?.url ?? payload.image_thumb?.url
  const hash = payload.key?.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? ''
  const shortHash = hash.slice(0, 8) || String(index).padStart(2, '0')
  const extension = raw ? 'png' : extensionFromKey(payload.key)
  const filename = `doubao_${String(index).padStart(2, '0')}_${shortHash}.${extension}`

  return {
    id: payload.key ?? best.url,
    index,
    filename,
    url: best.url,
    watermarkUrl,
    width: best.width,
    height: best.height,
    watermarkFree: Boolean(raw),
    prompt: collected.prompt
  }
}

function extensionFromKey(key?: string): string {
  const ext = key?.match(/\.([a-z0-9]+)$/i)?.[1]
  return ext ? ext.toLowerCase() : 'png'
}

export const doubaoAdapter: PlatformAdapter = {
  id: 'doubao',
  name: '豆包',
  example: 'https://www.doubao.com/thread/xxxxxxxxxxxx',

  match(url) {
    return /(^|\.)doubao\.com$/i.test(url.hostname) && THREAD_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    const html = await fetchHtml(url.href, { referer: 'https://www.doubao.com/' })

    const extracted: ExtractResult[] = extractEmbeddedPayloads(html).map(extractFromPayload)

    // 同一张图可能在多份数据里重复出现，按图片 key 去重
    const seen = new Set<string>()
    const images: ParsedImage[] = []
    for (const item of extracted.flatMap(entry => entry.images)) {
      const id = item.payload.key ?? item.payload.image_ori_raw?.url ?? ''
      if (id && seen.has(id)) continue
      if (id) seen.add(id)

      const image = toParsedImage(item, images.length + 1)
      if (image) images.push(image)
    }

    if (!images.length) {
      throw new ParseError('NO_IMAGES', '该分享里没有解析到图片，请确认链接内容包含 AI 生成的图片')
    }

    const meta = extracted.find(entry => entry.title || entry.author)

    return {
      platform: { id: this.id, name: this.name, example: this.example },
      sourceUrl: url.href,
      title: meta?.title,
      author: meta?.author,
      images,
      parsedAt: new Date().toISOString()
    }
  }
}
