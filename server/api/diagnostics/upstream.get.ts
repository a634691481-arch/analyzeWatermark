/**
 * GET /api/diagnostics/upstream?url=<豆包分享链接>
 *
 * 线上排障专用：把「服务器出口 IP / 各 UA 策略下抓到的响应特征」直接吐出来，
 * 用来判断解析失败是「页面改版」还是「出口 IP 被风控」。
 *
 * 只回摘要，不回正文；只允许 doubao.com，避免被当成通用代理。
 * ⚠️ 排障完成后应删除此文件。
 */
import { BROWSER_UA, MOBILE_UA } from '../../utils/security'

interface ProbeResult {
  ua: string
  status?: number
  finalUrl?: string
  ms: number
  bytes?: number
  hasFnArgs?: boolean
  hasRouterData?: boolean
  hasImageField?: boolean
  title?: string
  server?: string | null
  contentType?: string | null
  head?: string
  error?: string
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const target = typeof query.url === 'string' ? query.url : ''

  let url: URL
  try {
    url = new URL(target)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'url 不合法' })
  }
  if (!/(^|\.)doubao\.com$/i.test(url.hostname)) {
    throw createError({ statusCode: 403, statusMessage: '仅支持 doubao.com' })
  }

  async function probe(ua: string, referer?: string): Promise<ProbeResult> {
    const started = Date.now()
    try {
      const headers: Record<string, string> = {
        'user-agent': ua,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9'
      }
      if (referer) headers.referer = referer

      const response = await fetch(url.href, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000)
      })
      const html = await response.text()

      return {
        ua: ua.slice(0, 40),
        status: response.status,
        finalUrl: response.url,
        ms: Date.now() - started,
        bytes: html.length,
        hasFnArgs: html.includes('data-fn-args'),
        hasRouterData: html.includes('_ROUTER_DATA'),
        hasImageField: html.includes('image_ori_raw'),
        title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.slice(0, 80),
        server: response.headers.get('server'),
        contentType: response.headers.get('content-type'),
        head: html.slice(0, 200).replace(/\s+/g, ' ')
      }
    }
    catch (error) {
      return {
        ua: ua.slice(0, 40),
        ms: Date.now() - started,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }
    }
  }

  // 出口 IP 与地区：判断是不是「海外/机房 IP 被拦」
  let egress: unknown
  try {
    const response = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) })
    egress = await response.json()
  }
  catch (error) {
    egress = { error: error instanceof Error ? error.message : String(error) }
  }

  return {
    now: new Date().toISOString(),
    vercelRegion: process.env.VERCEL_REGION ?? null,
    node: process.version,
    egress,
    probes: {
      desktop: await probe(BROWSER_UA, 'https://www.doubao.com/'),
      mobile: await probe(MOBILE_UA)
    }
  }
})
