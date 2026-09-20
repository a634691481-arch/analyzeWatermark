import type { ParseResponse } from '#shared/types'
import { ParseError } from '../utils/errors'
import { parseShareUrl, resolveAdapter } from '../utils/platform'

/**
 * POST /api/parse
 * body: { url: string }
 *
 * 流程：校验链接 -> 选择平台适配器 -> 解析 -> 返回归一化图片列表
 */
export default defineEventHandler(async (event): Promise<ParseResponse> => {
  const body = await readBody<{ url?: string }>(event).catch(() => null)

  try {
    const url = parseShareUrl(body?.url ?? '')
    const adapter = resolveAdapter(url)
    const data = await adapter.parse(url)
    return { ok: true, data }
  }
  catch (error) {
    if (error instanceof ParseError) {
      setResponseStatus(event, error.status)
      return { ok: false, error: { code: error.code, message: error.message } }
    }

    console.error('[api/parse] 未预期错误:', error)
    setResponseStatus(event, 500)
    return { ok: false, error: { code: 'INTERNAL', message: '解析失败，请稍后重试' } }
  }
})
