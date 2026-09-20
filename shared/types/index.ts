/**
 * 前后端共享的数据契约。
 * 所有平台的解析结果都会被归一化成下面的结构，前端只认这一套类型。
 */

/** 平台元信息 */
export interface PlatformInfo {
  id: string
  name: string
  /** 该平台分享链接的示例，用于前端提示 */
  example: string
}

/** 单张图片 */
export interface ParsedImage {
  /** 稳定唯一 id，用于前端选中态 */
  id: string
  /** 在会话中的序号，从 1 开始 */
  index: number
  /** 下载时使用的文件名，例如 doubao_01_4059e22a.png */
  filename: string
  /** 无水印原图地址（服务端代理后才能下载） */
  url: string
  /** 带水印的小尺寸预览图：加载占位 + 对比用 */
  watermarkUrl?: string
  width?: number
  height?: number
  /** 是否存在真正的无水印原图；false 表示只拿到了带水印版本 */
  watermarkFree: boolean
  /** 生图提示词，部分平台会返回 */
  prompt?: string
}

/** 一次解析的完整结果 */
export interface ParseResult {
  platform: PlatformInfo
  sourceUrl: string
  title?: string
  author?: string
  images: ParsedImage[]
  parsedAt: string
}

/** 统一错误码 */
export type ApiErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'FETCH_FAILED'
  | 'NOT_FOUND'
  | 'NO_IMAGES'
  | 'BLOCKED_HOST'
  | 'BAD_REQUEST'
  | 'INTERNAL'

export interface ApiError {
  code: ApiErrorCode
  message: string
}

export type ParseResponse =
  | { ok: true, data: ParseResult }
  | { ok: false, error: ApiError }
