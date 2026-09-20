import { BROWSER_UA, isAllowedMediaUrl, refererForHost, sanitizeFilename } from '../utils/security'

/**
 * GET /api/proxy?url=<资源地址>&download=1&name=<文件名>
 *
 * 为什么需要代理：
 *  1. 部分图床有防盗链，浏览器直连会 403
 *  2. 跨域地址无法用 <a download> 直接触发下载，会变成打开新标签页
 *     （视频尤其明显，浏览器会直接内联播放而不是下载）
 *
 * 两个关键实现点：
 *  - **流式转发**，不缓冲整份内容：否则视频要等整段下完才能播
 *  - **透传 Range**：浏览器拖动进度条会发 Range 请求，
 *    不透传就退化成一整个 200 响应，既不能拖也不能边下边播
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const target = typeof query.url === 'string' ? query.url : ''

  if (!target) {
    throw createError({ statusCode: 400, statusMessage: '缺少 url 参数' })
  }
  if (!isAllowedMediaUrl(target)) {
    throw createError({ statusCode: 403, statusMessage: '该地址不在允许代理的域名范围内' })
  }

  const asAttachment = query.download === '1' || query.download === 'true'
  const rawName = typeof query.name === 'string' ? query.name : ''
  const range = getRequestHeader(event, 'range')

  const upstreamHeaders: Record<string, string> = { 'user-agent': BROWSER_UA }
  // 个别 CDN（如 B 站 bilivideo）校验 Referer，缺了会 403
  const referer = refererForHost(new URL(target).hostname)
  if (referer) upstreamHeaders.referer = referer
  // 下载时不要带上浏览器的 Range，整段拿才能正确写 attachment
  if (range && !asAttachment) upstreamHeaders.range = range

  let upstream: Response
  try {
    upstream = await fetch(target, {
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000)
    })
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: '资源地址访问超时' })
  }

  if (!upstream.ok && upstream.status !== 206) {
    throw createError({ statusCode: 502, statusMessage: `资源返回 HTTP ${upstream.status}` })
  }

  const headers: Record<string, string> = {
    'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'cache-control': 'public, max-age=86400',
    'accept-ranges': upstream.headers.get('accept-ranges') ?? 'bytes'
  }

  for (const name of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name)
    if (value) headers[name] = value
  }

  if (asAttachment && rawName) {
    const name = sanitizeFilename(rawName, 'media')
    headers['content-disposition']
      = `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`
  }

  // 直接把上游响应体流回去，状态码原样透传（关键：206 要保留，否则拖不动进度条）
  return new Response(upstream.body, { status: upstream.status, headers })
})
