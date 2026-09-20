import type { ParseResult, ParsedMedia } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { BROWSER_UA } from '../security'

/**
 * 微博无水印原理
 *
 * 【为什么不能直接抓分享页】video.weibo.com / weibo.com/tv 的前端是 SPA，
 * 直连会被 302 到 passport.weibo.com 的「Sina Visitor System」，
 * 返回的 HTML 里没有任何媒体地址。所以必须走接口，且接口要求访客身份。
 *
 * 【访客身份怎么来】微博有一套免登录的访客体系，两步即可拿到 SUB/SUBP：
 *   GET passport.weibo.com/visitor/genvisitor?cb=gen_callback&fp=...   → tid
 *   GET passport.weibo.com/visitor/visitor?a=incarnate&t=<tid>&...     → Set-Cookie: SUB / SUBP
 * SUB/SUBP 有效期一年，这里做了内存缓存，避免每次解析都握两次手。
 *
 * 【媒体地址怎么来】两条路，覆盖两种分享形态：
 *   A. 带 oid（`fid=1034:xxx`、`/tv/show/1034:xxx`）
 *      GET weibo.com/tv/api/component?page=/tv/show/{oid}&data={"Component_Play_Playinfo":{"oid":"{oid}"}}
 *      → data.Component_Play_Playinfo.urls 里按清晰度给了「高清 720P / 标清 480P」
 *   B. 带微博正文 id（`/{uid}/{mblogid}`、`/status/{id}`、m.weibo.cn）
 *      GET weibo.com/ajax/statuses/show?id={id}
 *      → page_info.media_info（stream_url / mp4_720p_mp4 / mp4_hd_url ...）
 *   id 参数对数字 id 和 base62 的 mblogid 都认。
 *
 * 【关于水印】实测：微博只下发**一份**文件，上面所有字段
 * （stream_url / mp4_hd_url / mp4_720p_mp4 / h265_*）指向同一个
 * `f.video.weibocdn.com/o0/*.mp4`，并不存在「带水印 / 无水印」两份可选。
 * 抽 12 帧算逐像素时间方差，四角 std 31~52、全图均值 44.7 —— 没有静态叠加层。
 * 也就是说：微博播放器上看到的「微博」角标是 UI 层，流里是干净的原片。
 * （UP 主自己烧进画面的水印无法去除，不在本工具范围内。）
 *
 * 【下载必须带 Referer】f.video.weibocdn.com 不校验登录态，但校验 Referer，
 * 不带直接 403，这条由 server/utils/security.ts 的 refererForHost 在代理层补。
 */

const WEIBO_HOST = /(^|\.)weibo\.com$/i
const WEIBO_M_HOST = /(^|\.)m\.weibo\.cn$/i
const H5_VIDEO_HOST = /(^|\.)h5\.video\.weibo\.com$/i

/** /tv/show/1034:5342648219926608 */
const TV_SHOW_PATH = /^\/tv\/show\/(\d+:\d+)\/?$/
/** /show/1034:5342648219926608 */
const H5_SHOW_PATH = /^\/show\/(\d+:\d+)\/?$/
/** /3255950643/RhTtIg4XS —— 用户主页里的单条微博 */
const USER_STATUS_PATH = /^\/\d+\/([0-9A-Za-z]{6,})\/?$/
/** /status/RhTtIg4XS */
const STATUS_PATH = /^\/status\/([0-9A-Za-z]+)\/?$/
/** m.weibo.cn/detail/5342648383832336 */
const M_STATUS_PATH = /^\/(?:status|detail)\/([0-9A-Za-z]+)\/?$/
/** 形如 1034:5342648219926608 */
const OID_SHAPE = /^\d+:\d+$/

const FP = encodeURIComponent(JSON.stringify({
  os: '1',
  browser: 'Chrome131,0,0,0',
  fonts: 'undefined',
  screenInfo: '1920*1080*24',
  plugins: ''
}))

/** 访客 Cookie 缓存（SUB/SUBP 本身一年有效，缓存 6 小时足够） */
let cookieCache: { value: string, at: number } | null = null
const COOKIE_TTL = 6 * 60 * 60 * 1000

async function createVisitorCookie(): Promise<string> {
  let gen: Response
  try {
    gen = await fetch(
      `https://passport.weibo.com/visitor/genvisitor?cb=gen_callback&fp=${FP}`,
      {
        headers: { 'user-agent': BROWSER_UA, 'referer': 'https://weibo.com/' },
        signal: AbortSignal.timeout(15_000)
      }
    )
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ParseError('FETCH_FAILED', `无法获取微博访客身份：${reason}`, 502)
  }

  const tid = (await gen.text()).match(/gen_callback\((.*)\)/s)?.[1]
  if (!tid) {
    throw new ParseError('FETCH_FAILED', '微博访客身份握手失败', 502)
  }
  const parsedTid = (JSON.parse(tid) as { data?: { tid?: string } }).data?.tid
  if (!parsedTid) {
    throw new ParseError('FETCH_FAILED', '微博访客身份握手失败', 502)
  }

  let incarnate: Response
  try {
    incarnate = await fetch(
      'https://passport.weibo.com/visitor/visitor?a=incarnate'
      + `&t=${encodeURIComponent(parsedTid)}`
      + `&w=2&c=095&gc=&cb=cross_domain&from=weibo&_rand=${Math.random()}`
      + '&ua=php-sso_sdk_client-0.6.36',
      {
        headers: {
          'user-agent': BROWSER_UA,
          'referer': 'https://passport.weibo.com/visitor/visitor?entry=krvideo&a=enter'
        },
        signal: AbortSignal.timeout(15_000)
      }
    )
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ParseError('FETCH_FAILED', `无法获取微博访客身份：${reason}`, 502)
  }

  const cookies = incarnate.headers.getSetCookie()
  const sub = cookies.find(item => item.startsWith('SUB='))?.split(';')[0]
  const subp = cookies.find(item => item.startsWith('SUBP='))?.split(';')[0]
  if (!sub || !subp) {
    throw new ParseError('FETCH_FAILED', '微博访客身份获取失败，请稍后重试', 502)
  }

  cookieCache = { value: `${sub}; ${subp}`, at: Date.now() }
  return cookieCache.value
}

async function getVisitorCookie(force = false): Promise<string> {
  if (!force && cookieCache && Date.now() - cookieCache.at < COOKIE_TTL) {
    return cookieCache.value
  }
  return createVisitorCookie()
}

/**
 * 带访客身份的 JSON 请求。
 * 身份失效时接口会 302 到 passport.weibo.com，这里自动重取一次身份再试。
 */
async function fetchWeiboJson<T>(url: string, referer: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await getVisitorCookie(attempt > 0)

    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          'user-agent': BROWSER_UA,
          'cookie': cookie,
          'referer': referer,
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'zh-CN,zh;q=0.9'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000)
      })
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ParseError('FETCH_FAILED', `无法访问微博接口：${reason}`, 502)
    }

    // 302/301 = 访客身份过期，换一份 Cookie 再来
    if (response.status === 302 || response.status === 301) continue

    if (response.status === 404) {
      throw new ParseError('NOT_FOUND', '微博内容不存在或已被删除', 404)
    }
    if (response.status === 403 || response.status === 418) {
      throw new ParseError('RATE_LIMITED', '微博接口临时限制了访问，请稍后重试', 429)
    }
    if (!response.ok) {
      throw new ParseError('FETCH_FAILED', `微博接口返回 HTTP ${response.status}`, 502)
    }

    const payload = await response.json().catch(() => null) as T | null
    if (!payload) {
      throw new ParseError('NO_MEDIA', '微博接口返回内容无法解析', 502)
    }
    return payload
  }

  throw new ParseError('FETCH_FAILED', '微博访客身份获取失败，请稍后重试', 502)
}

/** 从 URL 里认出「这条内容怎么查」 */
function extractKey(url: URL): { kind: 'oid', oid: string } | { kind: 'status', id: string } | null {
  const fid = url.searchParams.get('fid')
  if (fid && OID_SHAPE.test(fid)) return { kind: 'oid', oid: fid }

  const path = url.pathname
  const tv = path.match(TV_SHOW_PATH)?.[1] ?? path.match(H5_SHOW_PATH)?.[1]
  if (tv) return { kind: 'oid', oid: tv }

  const status = path.match(STATUS_PATH)?.[1] ?? path.match(USER_STATUS_PATH)?.[1]
  if (status) return { kind: 'status', id: status }

  const mobile = path.match(M_STATUS_PATH)?.[1]
  if (mobile) return { kind: 'status', id: mobile }

  return null
}

/** 720p / 480p 之类，按 template=宽x高 估个像素量排序；HEVC 降权，兼容性优先 */
function scoreUrl(raw: string): number {
  const size = raw.match(/template=(\d+)x(\d+)/)
  const area = size ? Number(size[1]) * Number(size[2]) : 0
  const hevcPenalty = /h265|hevc/i.test(raw) ? 0.5 : 1
  return area * hevcPenalty
}

function pickBestUrl(candidates: (string | undefined)[]): string | undefined {
  const urls = [...new Set(candidates.filter((item): item is string => Boolean(item)))]
  if (!urls.length) return undefined
  return urls.sort((a, b) => scoreUrl(b) - scoreUrl(a))[0]
}

function absoluteUrl(raw?: string): string | undefined {
  if (!raw) return undefined
  // 微博接口常下发 http:// 或 //，统一成 https，否则 https 页面上预览会被浏览器拦成混合内容
  if (raw.startsWith('//')) return `https:${raw}`
  return raw.replace(/^http:\/\//i, 'https://')
}

/** 正文里常带一条 t.cn 短链，标题只保留文字部分 */
function cleanTitle(raw?: string): string | undefined {
  if (!raw) return undefined
  const cleaned = raw.replace(/https?:\/\/\S+/g, '').replace(/[\s\u200b]+/g, ' ').trim()
  return cleaned || undefined
}

/** 组件接口返回的单条视频信息 */
interface WeiboPlayInfo {
  mid?: number | string
  oid?: string
  media_id?: string | number
  title?: string
  author?: string
  nickname?: string
  cover_image?: string
  duration?: string
  duration_time?: string
  stream_url?: string
  object_type?: string
  urls?: Record<string, string>
}

/** 正文接口 page_info.media_info */
interface WeiboMediaInfo {
  name?: string
  media_id?: string | number
  duration?: number
  stream_url?: string
  stream_url_hd?: string
  mp4_720p_mp4?: string
  mp4_hd_url?: string
  mp4_sd_url?: string
  h265_mp4_hd?: string
  h265_mp4_ld?: string
}

interface WeiboStatus {
  ok?: number
  message?: string
  mblogid?: string
  text_raw?: string
  page_info?: {
    object_type?: string
    media_info?: WeiboMediaInfo
    page_title?: string
    page_pic?: string
  }
  user?: { screen_name?: string }
}

function durationToMs(info: WeiboPlayInfo): number | undefined {
  const seconds = Number(info.duration_time)
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000)

  const parts = (info.duration ?? '').split(':').map(Number)
  const min = parts[0]
  const sec = parts[1]
  if (typeof min === 'number' && typeof sec === 'number' && Number.isFinite(min) && Number.isFinite(sec)) {
    return Math.round((min * 60 + sec) * 1000)
  }
  return undefined
}

function buildMedia(options: {
  id: string
  index: number
  url: string
  cover?: string
  duration?: number
  title?: string
}): ParsedMedia {
  const shortId = options.id.replace(/[^0-9a-z]/gi, '').slice(-12) || String(options.index)
  return {
    id: options.id,
    index: options.index,
    filename: `weibo_${shortId}.mp4`,
    type: 'video',
    url: options.url,
    thumbnailUrl: absoluteUrl(options.cover),
    duration: options.duration,
    watermarkFree: true,
    prompt: options.title
  }
}

export const weiboAdapter: PlatformAdapter = {
  id: 'weibo',
  name: '微博',
  example: 'https://video.weibo.com/show?fid=1034:5342648219926608',
  icon: 'i-simple-icons-sinaweibo',

  match(url) {
    if (H5_VIDEO_HOST.test(url.hostname)) return H5_SHOW_PATH.test(url.pathname)
    if (WEIBO_M_HOST.test(url.hostname)) return M_STATUS_PATH.test(url.pathname)

    if (!WEIBO_HOST.test(url.hostname)) return false
    if (url.pathname === '/show' && url.searchParams.get('fid')) return true
    return TV_SHOW_PATH.test(url.pathname)
      || USER_STATUS_PATH.test(url.pathname)
      || STATUS_PATH.test(url.pathname)
  },

  async parse(url): Promise<ParseResult> {
    const key = extractKey(url)
    if (!key) {
      throw new ParseError('INVALID_URL', '链接里没有识别到微博视频或正文 id')
    }

    let media: ParsedMedia[] = []
    let title: string | undefined
    let author: string | undefined
    let sourceId = ''

    if (key.kind === 'oid') {
      const page = `/tv/show/${key.oid}`
      const payload = await fetchWeiboJson<{
        code?: string
        msg?: string
        data?: { Component_Play_Playinfo?: WeiboPlayInfo | null }
      }>(
        'https://weibo.com/tv/api/component'
        + `?page=${encodeURIComponent(page)}`
        + `&data=${encodeURIComponent(JSON.stringify({ Component_Play_Playinfo: { oid: key.oid } }))}`,
        `https://weibo.com/tv/show/${key.oid}`
      )

      if (payload.code !== '100000') {
        throw new ParseError('NO_MEDIA', `微博接口报错：${payload.msg || `code ${payload.code}`}`, 502)
      }

      const info = payload.data?.Component_Play_Playinfo
      if (!info) {
        throw new ParseError('NOT_FOUND', '该微博视频不存在或已被删除', 404)
      }
      if (info.object_type && info.object_type !== 'video') {
        throw new ParseError('NO_MEDIA', '这条微博不是视频，暂不支持解析')
      }

      const best = pickBestUrl([...Object.values(info.urls ?? {}), info.stream_url])
      if (!best) {
        throw new ParseError('NO_MEDIA', '没有取到微博视频地址，可能是付费或已下架内容')
      }

      sourceId = String(info.media_id ?? info.oid ?? key.oid)
      title = cleanTitle(info.title)
      author = info.author ?? info.nickname
      media = [buildMedia({
        id: sourceId,
        index: 1,
        url: absoluteUrl(best)!,
        cover: info.cover_image,
        duration: durationToMs(info),
        title
      })]
    }
    else {
      const status = await fetchWeiboJson<WeiboStatus>(
        `https://weibo.com/ajax/statuses/show?id=${encodeURIComponent(key.id)}`,
        'https://weibo.com/'
      )

      if (status.ok === 0) {
        throw new ParseError('NOT_FOUND', status.message || '该微博不存在或已被删除', 404)
      }

      const info = status.page_info?.media_info
      if (!info || (status.page_info?.object_type && status.page_info.object_type !== 'video')) {
        throw new ParseError('NO_MEDIA', '这条微博不是视频，暂不支持解析')
      }

      const best = pickBestUrl([
        info.mp4_720p_mp4,
        info.stream_url_hd,
        info.stream_url,
        info.mp4_hd_url,
        info.mp4_sd_url,
        info.h265_mp4_hd,
        info.h265_mp4_ld
      ])
      if (!best) {
        throw new ParseError('NO_MEDIA', '没有取到微博视频地址，可能是付费或已下架内容')
      }

      sourceId = String(info.media_id ?? status.mblogid ?? key.id)
      title = cleanTitle(status.text_raw) ?? info.name
      author = status.user?.screen_name
      media = [buildMedia({
        id: sourceId,
        index: 1,
        url: absoluteUrl(best)!,
        cover: status.page_info?.page_pic,
        duration: info.duration ? Math.round(info.duration * 1000) : undefined,
        title
      })]
    }

    if (!media.length) {
      throw new ParseError('NO_MEDIA', '没有解析到可下载的微博视频')
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
