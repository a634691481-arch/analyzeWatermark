import { BROWSER_UA, isAllowedImageUrl, sanitizeFilename } from '../utils/security'

/**
 * GET /api/proxy?url=<图片地址>&download=1&name=<文件名>
 *
 * 为什么需要代理：
 *  1. 图床有防盗链，浏览器直连会 403
 *  2. 跨域地址无法用 <a download> 直接触发下载，会变成打开新标签页
 * 代理层统一补上 Referer 并以 attachment 响应，下载就稳定了。
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const target = typeof query.url === 'string' ? query.url : ''

  if (!target) {
    throw createError({ statusCode: 400, statusMessage: '缺少 url 参数' })
  }
  if (!isAllowedImageUrl(target)) {
    throw createError({ statusCode: 403, statusMessage: '该地址不在允许代理的域名范围内' })
  }

  const asAttachment = query.download === '1' || query.download === 'true'
  const rawName = typeof query.name === 'string' ? query.name : ''

  let upstream: Response
  try {
    upstream = await fetch(target, {
      headers: {
        'user-agent': BROWSER_UA,
        referer: 'https://www.doubao.com/'
      },
      signal: AbortSignal.timeout(30_000)
    })
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: '图片源访问超时' })
  }

  if (!upstream.ok) {
    throw createError({ statusCode: 502, statusMessage: `图片源返回 HTTP ${upstream.status}` })
  }

  const buffer = Buffer.from(await upstream.arrayBuffer())

  setHeader(event, 'content-type', upstream.headers.get('content-type') ?? 'application/octet-stream')
  setHeader(event, 'content-length', buffer.length)
  setHeader(event, 'cache-control', 'public, max-age=86400')

  if (asAttachment && rawName) {
    const name = sanitizeFilename(rawName, 'image')
    setHeader(
      event,
      'content-disposition',
      `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`
    )
  }

  return buffer
})
