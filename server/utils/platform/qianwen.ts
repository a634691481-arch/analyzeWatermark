import type { ParseResult, ParsedMedia } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { BROWSER_UA } from '../security'

/**
 * 千问（chat.qianwen.com）无水印原理
 *
 * 【数据从哪来】分享页是纯前端 SPA，HTML 里没有任何数据，得走接口：
 *   POST https://chat2-api.qianwen.com/api/v1/share/info?pr=qwen&fr=mac
 *   body: {"share_id": "<分享id>", "biz_id": "ai_qwen"}
 *   → { code: 0, data: { title, session: { record_list: [...] } } }
 *
 * 注意两点（都是从 bundle 里挖出来的）：
 *   - 必须是 **POST**，GET 会返回 405 Method Not Allowed
 *   - 不需要 cookie，biz_id 也可以省略（服务端自己会解析），但显式带上更稳
 *
 * 【媒体在哪】record_list[].response_messages[].meta_data.multi_load[].content.display_list[]
 * 每一项是一张卡片，字段天然区分了带不带水印：
 *
 *   type=generate_image →  image[]（无水印）  watermark_image[]（带水印）  thumbnail[]
 *   type=generate_video →  video[]（无水印）  download_video[]（带水印）   cover[]
 *
 * 实测（带符号亮度差，只亮不暗 + 差异固定在底部条带 = 服务端叠加的白色水印）：
 *   watermark_image - image          : 更亮 1329 / 更暗 0，差异行 678-701
 *   download_video  - video (t=1~4s) : 更亮 192~245 / 更暗 0，差异行 271-280
 *   两条视频流时间轴 offset=0s 精确对齐，确认是同一内容
 *
 *   type=ref_image 是生成时喂进去的参考图，不属于生成结果，跳过避免重复。
 *
 * 【地址有效期】资源地址带 `auth_key=<过期秒级时间戳>-...`，大约 1 个月。
 * 过期后重新解析即可。
 */

/** 分享页：qianwen.my.cn/share/chat/{shareId} */
const SHARE_PATH = /^\/share\/chat\/([0-9a-zA-Z]+)\/?$/
const SHARE_HOST = /(^|\.)qianwen\.my\.cn$/i

const API_BASE = 'https://chat2-api.qianwen.com'
const API_URL = `${API_BASE}/api/v1/share/info?pr=qwen&fr=mac`
const DEFAULT_BIZ_ID = 'ai_qwen'

/** 单条卡片里的媒体对象 */
interface QwenMedia {
  id?: string
  url?: string
  width?: number
  height?: number
}

interface QwenDisplayItem {
  type?: string
  image?: QwenMedia[]
  watermark_image?: QwenMedia[]
  thumbnail?: QwenMedia[]
  video?: QwenMedia[]
  download_video?: QwenMedia[]
  cover?: QwenMedia[]
}

function extensionFromUrl(url: string): string {
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i)
  return match?.[1] ? match[1].toLowerCase() : 'bin'
}

/** 从 URL 里取一个短的稳定片段做文件名后缀 */
function shortId(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    const cleaned = candidate.replace(/[^a-z0-9]/gi, '')
    if (cleaned.length >= 6) return cleaned.slice(0, 8).toLowerCase()
  }
  return ''
}

/** 遍历所有带 display_list 的节点（同一节点上还挂着 extra_info，可拿到时长等参数） */
function collectCards(root: unknown): { item: QwenDisplayItem, durationSeconds?: number }[] {
  const cards: { item: QwenDisplayItem, durationSeconds?: number }[] = []
  const visited = new WeakSet<object>()

  const walk = (node: unknown, depth: number) => {
    if (depth > 18 || !node || typeof node !== 'object' || visited.has(node)) return
    visited.add(node)

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }

    const record = node as Record<string, unknown>
    if (Array.isArray(record.display_list)) {
      const extra = (record.extra_info as Record<string, any> | undefined)?.content?.extra
      const duration = extra?.params?.duration
      for (const item of record.display_list) {
        cards.push({ item: item as QwenDisplayItem, durationSeconds: typeof duration === 'number' ? duration : undefined })
      }
    }

    for (const value of Object.values(record)) walk(value, depth + 1)
  }

  walk(root, 0)
  return cards
}

function toParsedMedia(card: { item: QwenDisplayItem, durationSeconds?: number }, index: number): ParsedMedia | null {
  const { item, durationSeconds } = card

  if (item.type === 'generate_image') {
    const best = item.image?.[0]
    if (!best?.url) return null
    const thumbnail = item.thumbnail?.[0]?.url
    return {
      id: best.id ?? best.url,
      index,
      filename: `qianwen_${String(index).padStart(2, '0')}_${shortId(best.id) || index}.${extensionFromUrl(best.url)}`,
      type: 'image',
      url: best.url,
      thumbnailUrl: thumbnail,
      width: best.width,
      height: best.height,
      watermarkFree: true
    }
  }

  if (item.type === 'generate_video') {
    const best = item.video?.[0]
    if (!best?.url) return null
    return {
      id: best.id ?? best.url,
      index,
      filename: `qianwen_${String(index).padStart(2, '0')}_${shortId(best.id) || index}.${extensionFromUrl(best.url)}`,
      type: 'video',
      url: best.url,
      thumbnailUrl: item.cover?.[0]?.url,
      width: item.cover?.[0]?.width,
      height: item.cover?.[0]?.height,
      duration: durationSeconds ? durationSeconds * 1000 : undefined,
      watermarkFree: true
    }
  }

  // ref_image 等其它卡片不是生成结果，跳过
  return null
}

async function fetchShareInfo(shareId: string): Promise<Record<string, any>> {
  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'user-agent': BROWSER_UA,
        'content-type': 'application/json',
        'accept': 'application/json, text/plain, */*',
        'referer': 'https://qianwen.my.cn/',
        'origin': 'https://qianwen.my.cn'
      },
      body: JSON.stringify({ share_id: shareId, biz_id: DEFAULT_BIZ_ID }),
      signal: AbortSignal.timeout(20_000)
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ParseError('FETCH_FAILED', `无法访问分享接口：${reason}`, 502)
  }

  if (response.status === 404) {
    throw new ParseError('NOT_FOUND', '分享不存在或已被删除', 404)
  }
  if (!response.ok) {
    throw new ParseError('FETCH_FAILED', `分享接口返回 HTTP ${response.status}`, 502)
  }

  const payload = await response.json().catch(() => null) as Record<string, any> | null
  if (!payload) {
    throw new ParseError('NO_MEDIA', '分享接口返回内容无法解析', 502)
  }
  if (payload.code !== 0) {
    throw new ParseError('NO_MEDIA', `分享读取失败：${payload.msg || `code ${payload.code}`}`)
  }

  const data = payload.data
  if (!data?.session) {
    throw new ParseError('NO_MEDIA', '分享内容为空，可能是私密分享或链接已失效')
  }
  if (data.expired) {
    throw new ParseError('NO_MEDIA', '该分享已过期')
  }
  return data as Record<string, any>
}

export const qianwenAdapter: PlatformAdapter = {
  id: 'qianwen',
  name: '千问',
  example: 'https://qianwen.my.cn/share/chat/xxxxxxxx',

  match(url) {
    return SHARE_HOST.test(url.hostname) && SHARE_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    const shareId = url.pathname.match(SHARE_PATH)?.[1]
    if (!shareId) {
      throw new ParseError('INVALID_URL', '链接里没有分享 id')
    }

    const data = await fetchShareInfo(shareId)
    const session = data.session as Record<string, any>

    const media: ParsedMedia[] = []
    const seen = new Set<string>()
    for (const card of collectCards(session)) {
      const parsed = toParsedMedia(card, media.length + 1)
      if (!parsed) continue
      if (seen.has(parsed.id)) continue
      seen.add(parsed.id)
      media.push(parsed)
    }

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '该分享里没有解析到生成的图片或视频')
    }

    return {
      platform: { id: this.id, name: this.name, example: this.example },
      sourceUrl: url.href,
      title: typeof data.title === 'string' ? data.title : undefined,
      media,
      parsedAt: new Date().toISOString()
    }
  }
}
