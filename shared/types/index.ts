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

/** 媒体类型：豆包只有图，抖音有图也有视频 */
export type MediaType = 'image' | 'video'

/** 单条媒体 */
export interface ParsedMedia {
  /** 稳定唯一 id，用于前端选中态 */
  id: string
  /** 在帖子中的序号，从 1 开始 */
  index: number
  /** 下载时使用的文件名，例如 douyin_01_76868029.mp4 */
  filename: string
  type: MediaType
  /** 无水印地址（服务端代理后才能下载） */
  url: string
  /**
   * 更接近源文件的无水印地址（可选）。
   * 有些平台主下载地址是转码后的兼容格式，源文件格式不通用
   * （例如小红书原图是 iPhone HEIC），单独放一枚按钮让用户自选。
   */
  originalUrl?: string
  /** 小尺寸缩略图：加载占位用，避免大文件白屏 */
  thumbnailUrl?: string
  width?: number
  height?: number
  /** 视频时长（毫秒） */
  duration?: number
  /** 是否存在真正的无水印文件；false 表示只拿到了带水印版本 */
  watermarkFree: boolean
  /** 生图提示词 / 视频文案，部分平台会返回 */
  prompt?: string
}

/** 一次解析的完整结果 */
export interface ParseResult {
  platform: PlatformInfo
  sourceUrl: string
  title?: string
  author?: string
  media: ParsedMedia[]
  parsedAt: string
}

/** 统一错误码 */
export type ApiErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PLATFORM'
  | 'FETCH_FAILED'
  | 'NOT_FOUND'
  | 'NO_MEDIA'
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
