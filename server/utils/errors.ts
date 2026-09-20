import type { ApiErrorCode } from '#shared/types'

/**
 * 解析过程中的可预期错误。
 * API 层捕获后转成 { ok: false, error } 返回给前端。
 */
export class ParseError extends Error {
  code: ApiErrorCode
  status: number

  constructor(code: ApiErrorCode, message: string, status = 400) {
    super(message)
    this.name = 'ParseError'
    this.code = code
    this.status = status
  }
}
