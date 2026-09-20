import type { ZipFile } from '../utils/zip'
import { BROWSER_UA, isAllowedImageUrl, sanitizeFilename } from '../utils/security'
import { createZip } from '../utils/zip'

/** 单次打包上限：文件数 与 总字节数，避免把内存打爆 */
const MAX_FILES = 60
const MAX_TOTAL_BYTES = 512 * 1024 * 1024

interface ZipRequestBody {
  filename?: string
  files?: { url?: string, filename?: string }[]
}

/**
 * POST /api/zip
 * body: { filename?: string, files: [{ url, filename }] }
 *
 * 服务端把多张图下载后打成一个 zip 返回，前端一次点击即可全部保存。
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<ZipRequestBody>(event).catch(() => null)
  const files = Array.isArray(body?.files) ? body!.files! : []

  if (!files.length) {
    throw createError({ statusCode: 400, statusMessage: '没有可打包的图片' })
  }
  if (files.length > MAX_FILES) {
    throw createError({ statusCode: 400, statusMessage: `一次最多打包 ${MAX_FILES} 张图片` })
  }
  for (const file of files) {
    if (!file?.url || !isAllowedImageUrl(file.url)) {
      throw createError({ statusCode: 403, statusMessage: '存在不在允许代理范围内的图片地址' })
    }
  }

  const collected: ZipFile[] = []
  const usedNames = new Set<string>()
  let totalBytes = 0

  for (const [position, file] of files.entries()) {
    let response: Response
    try {
      response = await fetch(file.url!, {
        headers: {
          'user-agent': BROWSER_UA,
          referer: 'https://www.doubao.com/'
        },
        signal: AbortSignal.timeout(60_000)
      })
    }
    catch {
      throw createError({ statusCode: 502, statusMessage: `第 ${position + 1} 张图片下载超时` })
    }

    if (!response.ok) {
      throw createError({ statusCode: 502, statusMessage: `第 ${position + 1} 张图片下载失败（HTTP ${response.status}）` })
    }

    const data = Buffer.from(await response.arrayBuffer())
    totalBytes += data.length
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw createError({ statusCode: 413, statusMessage: '图片总量过大，请分批打包下载' })
    }

    collected.push({
      name: uniqueName(sanitizeFilename(file.filename ?? '', `image_${position + 1}.png`), usedNames),
      data
    })
  }

  const zipBuffer = createZip(collected)
  const zipName = sanitizeFilename(body?.filename ?? '', `images-${Date.now()}.zip`)
  const finalName = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`

  setHeader(event, 'content-type', 'application/zip')
  setHeader(event, 'content-length', zipBuffer.length)
  setHeader(event, 'cache-control', 'no-store')
  setHeader(
    event,
    'content-disposition',
    `attachment; filename="${finalName}"; filename*=UTF-8''${encodeURIComponent(finalName)}`
  )

  return zipBuffer
})

/** zip 内部不允许出现重名条目 */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let counter = 2
  let candidate = `${base}_${counter}${ext}`
  while (used.has(candidate)) {
    counter += 1
    candidate = `${base}_${counter}${ext}`
  }
  used.add(candidate)
  return candidate
}
