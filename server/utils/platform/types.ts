import type { ParseResult } from '#shared/types'

/**
 * 平台适配器接口。
 *
 * 新增一个平台只需要：
 *   1. 在本目录新建 <platform>.ts，实现这个接口
 *   2. 在 ./index.ts 的 platformAdapters 数组里注册
 * 前端和 API 层完全不用改。
 */
export interface PlatformAdapter {
  /** 平台唯一标识，如 doubao */
  id: string
  /** 平台中文名，用于界面展示 */
  name: string
  /** 分享链接示例，用于前端提示 */
  example: string
  /** 判断这条链接是否交给本适配器处理 */
  match(url: URL): boolean
  /** 解析分享链接，产出归一化后的图片列表 */
  parse(url: URL): Promise<ParseResult>
}

/** 图片对象里单个尺寸变体的通用形状 */
export interface ImageVariant {
  url?: string
  width?: number
  height?: number
}
