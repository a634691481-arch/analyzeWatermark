import type { ParseResult, ParsedMedia } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { BROWSER_UA } from '../security'

/**
 * 哔哩哔哩无水印原理
 *
 * 【链接形态】b23.tv 短链有两种：
 *   https://b23.tv/BV1uDe16vE51   → 路径本身就是 BV 号，跟一次跳转即到 /video/BVxxx/
 *   https://b23.tv/xxxxxxx        → 纯短码，必须跟跳转才能拿到 BV 号
 * 所以统一「跟着跳转走到终点，再从路径里抠 BV/av 号」。
 *
 * 【关键：走 durl，不要走 dash】
 * playurl 有两种返回：
 *   不带 fnval / fnval=0/1 → `durl`，**音视频合一的单个 mp4** ✅
 *   fnval=16/80/4048       → `dash`，音视频分离的 m4s，浏览器直接下会没声音，
 *                            必须服务端 ffmpeg mux
 * 实测（未登录）：
 *   durl  → quality=64（720P），10,004,037 字节，ffprobe 确认 h264 1280x720 + aac
 *   dash  → 最高只有 852x480
 * 也就是说 durl 不但省掉 mux，清晰度还更高。所以固定用 fnval=0。
 *
 * 【必须带 Referer】bilivideo 的 CDN 校验 Referer，不带直接 403，
 * 这一条由 server/utils/security.ts 的 refererForHost 在代理层补上。
 *
 * 【关于水印】B 站不对普通投稿视频烧角标水印（播放器上的 UP 主信息和
 * bilibili logo 是 UI 层，不在流里）。实测抽 5 帧看四角时间方差：
 * 3825~5993，四个角都在变 → 是画面内容，没有静态叠加层。
 * UP 主自己烧进画面的水印无法去除，也不在本工具范围内。
 *
 * 【清晰度】未登录封顶 720P。若配置了 BILIBILI_SESSDATA 环境变量
 * （用户自己的 Cookie），可拿到更高清晰度，这里只透传、不落日志。
 */

const SHORT_HOST = /(^|\.)b23\.tv$/i
const VIDEO_HOST = /(^|\.)bilibili\.com$/i
/** /video/BV1uDe16vE51/ 或 /video/av123456 */
const VIDEO_PATH = /^\/video\/(BV[0-9A-Za-z]+|av\d+)/i

/** 多 P 视频最多解析多少 P，避免单个请求打太多接口 */
const MAX_PAGES = 20

/** quality 数值 → 交付高度（B 站清晰度档位） */
const HEIGHT_BY_QUALITY: Record<number, number> = {
  125: 2160,
  120: 2160,
  116: 1080,
  112: 1080,
  80: 1080,
  74: 720,
  64: 720,
  32: 480,
  16: 360
}

interface BiliView {
  bvid?: string
  aid?: number
  cid?: number
  title?: string
  duration?: number
  pic?: string
  dimension?: { width?: number, height?: number, rotate?: number }
  owner?: { name?: string, mid?: number }
  pages?: { cid?: number, page?: number, part?: string, duration?: number }[]
}

interface BiliDurl {
  url?: string
  size?: number
  length?: number
  order?: number
}

/** 调 B 站接口：统一带 UA + Referer，可选带上用户自己的 SESSDATA */
async function fetchBilibiliJson<T>(url: string, timeout = 15_000): Promise<T> {
  const headers: Record<string, string> = {
    'user-agent': BROWSER_UA,
    'referer': 'https://www.bilibili.com/',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9'
  }

  // 可选：用户自己的登录态，用于拿更高清晰度；只透传，不记录
  const sessdata = process.env.BILIBILI_SESSDATA
  if (sessdata) headers.cookie = `SESSDATA=${sessdata}`

  let response: Response
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ParseError('FETCH_FAILED', `无法访问 B 站接口：${reason}`, 502)
  }

  if (!response.ok) {
    throw new ParseError('FETCH_FAILED', `B 站接口返回 HTTP ${response.status}`, 502)
  }

  const payload = await response.json().catch(() => null) as { code?: number, message?: string, data?: T } | null
  if (!payload) {
    throw new ParseError('NO_MEDIA', 'B 站接口返回内容无法解析', 502)
  }
  if (payload.code !== 0) {
    if (payload.code === -404) {
      throw new ParseError('NOT_FOUND', '视频不存在或已被删除', 404)
    }
    throw new ParseError('NO_MEDIA', `B 站接口报错：${payload.message ?? `code ${payload.code}`}`)
  }
  if (!payload.data) {
    throw new ParseError('NO_MEDIA', 'B 站接口没有返回数据')
  }
  return payload.data
}

/** 跟着短链跳到终点，返回最终 URL */
async function resolveFinalUrl(shareUrl: string): Promise<string> {
  let current = shareUrl
  for (let hop = 0; hop < 6; hop++) {
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        headers: { 'user-agent': BROWSER_UA, 'accept-language': 'zh-CN,zh;q=0.9' },
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

/** 从 URL 里抠出 bvid / aid */
function extractVideoId(rawUrl: string): { bvid?: string, aid?: string } {
  const bvid = rawUrl.match(/(BV[0-9A-Za-z]{8,})/)?.[1]
  if (bvid) return { bvid }
  const aid = rawUrl.match(/\/video\/av(\d+)/i)?.[1] ?? rawUrl.match(/[?&]aid=(\d+)/)?.[1]
  if (aid) return { aid }
  return {}
}

/** 把 durl 响应里的尺寸换算出来（durl 不带分辨率，用 quality 档位 + 源宽高比推） */
function estimateSize(quality: number | undefined, view: BiliView): { width?: number, height?: number } {
  const height = quality ? HEIGHT_BY_QUALITY[quality] : undefined
  const sourceWidth = view.dimension?.width
  const sourceHeight = view.dimension?.height
  if (!height) return {}
  if (!sourceWidth || !sourceHeight) return { height }
  return { width: Math.round(height * (sourceWidth / sourceHeight)), height }
}

/** 封面等资源 B 站会给 http://，统一升级成 https，避免部署环境封 80 端口 */
function toHttps(url?: string): string | undefined {
  return url?.replace(/^http:\/\//i, 'https://')
}

export const bilibiliAdapter: PlatformAdapter = {
  id: 'bilibili',
  name: '哔哩哔哩',
  example: 'https://b23.tv/BV1uDe16vE51',
  icon: 'i-simple-icons-bilibili',

  match(url) {
    if (SHORT_HOST.test(url.hostname)) return true
    return VIDEO_HOST.test(url.hostname) && VIDEO_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    // 1) 走到终点再抠号，两种短链形态都能覆盖
    const finalUrl = await resolveFinalUrl(url.href)
    const fromFinal = extractVideoId(finalUrl)
    const fromInput = extractVideoId(url.href)
    const bvid = fromFinal.bvid ?? fromInput.bvid
    const aid = fromFinal.aid ?? fromInput.aid
    const idQuery = bvid ? `bvid=${bvid}` : aid ? `aid=${aid}` : ''

    if (!idQuery) {
      throw new ParseError('INVALID_URL', '链接里没有识别到 BV 号或 av 号')
    }

    // 2) 作品信息（标题 / 封面 / UP 主 / 分P 列表 / 原始尺寸）
    const view = await fetchBilibiliJson<BiliView>(
      `https://api.bilibili.com/x/web-interface/view?${idQuery}`
    )

    const pages = view.pages?.length
      ? view.pages
      : [{ cid: view.cid, page: 1, part: view.title, duration: view.duration }]

    if (pages.length > MAX_PAGES) {
      throw new ParseError('NO_MEDIA', `该视频有 ${pages.length} 个分P，超过单次解析上限 ${MAX_PAGES} 个`)
    }

    // 3) 每个分P 取一条 durl（音视频合一的 mp4）
    const media: ParsedMedia[] = []
    const multiPage = pages.length > 1
    const bvLabel = view.bvid ?? String(view.aid ?? 'video')

    for (const [position, page] of pages.entries()) {
      const cid = page.cid
      if (!cid) continue

      const play = await fetchBilibiliJson<{
        quality?: number
        format?: string
        durl?: BiliDurl[]
      }>(
        `https://api.bilibili.com/x/player/playurl?${idQuery}&cid=${cid}&qn=127&fnval=0&fourk=1`
      )

      // durl 按 order 排序，拼起来才是完整视频；实际基本只有一段
      const segments = (play.durl ?? [])
        .filter(segment => typeof segment.url === 'string' && segment.url)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const first = segments[0]
      if (!first?.url) continue

      const index = media.length + 1
      const size = estimateSize(play.quality, view)
      const pageSuffix = multiPage ? `_p${page.page ?? position + 1}` : ''

      media.push({
        id: `${bvLabel}${pageSuffix}`,
        index,
        filename: `bilibili_${bvLabel}${pageSuffix}.mp4`,
        type: 'video',
        url: first.url,
        thumbnailUrl: toHttps(view.pic),
        width: size.width,
        height: size.height,
        duration: first.length ?? (page.duration ? page.duration * 1000 : undefined),
        watermarkFree: true,
        prompt: multiPage && page.part ? page.part : undefined
      })
    }

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '没有解析到可下载的视频流，可能是付费/限定内容')
    }

    const title = view.title ?? ''
    const pageHint = media.length > 1 ? `（共 ${media.length} 个分P）` : ''

    return {
      platform: { id: this.id, name: this.name, example: this.example },
      sourceUrl: url.href,
      title: title ? `${title}${pageHint}` : undefined,
      author: view.owner?.name,
      media,
      parsedAt: new Date().toISOString()
    }
  }
}
