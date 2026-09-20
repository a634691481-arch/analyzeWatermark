import type { PlatformInfo } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { doubaoAdapter } from './doubao'

/** 已接入的平台。新增平台时在这里注册即可 */
export const platformAdapters: PlatformAdapter[] = [
  doubaoAdapter
]

export function supportedPlatforms(): PlatformInfo[] {
  return platformAdapters.map(adapter => ({
    id: adapter.id,
    name: adapter.name,
    example: adapter.example
  }))
}

/** 把用户输入的文本解析成 URL，并做基本校验 */
export function parseShareUrl(input: string): URL {
  const text = input?.trim()
  if (!text) {
    throw new ParseError('INVALID_URL', '请先粘贴分享链接')
  }

  let url: URL
  try {
    url = new URL(text)
  }
  catch {
    throw new ParseError('INVALID_URL', '链接格式不正确，请粘贴完整链接（以 http:// 或 https:// 开头）')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ParseError('INVALID_URL', '仅支持 http/https 链接')
  }

  return url
}

/** 找到能处理该链接的平台适配器 */
export function resolveAdapter(url: URL): PlatformAdapter {
  const adapter = platformAdapters.find(item => item.match(url))
  if (!adapter) {
    const names = platformAdapters.map(item => item.name).join('、')
    throw new ParseError('UNSUPPORTED_PLATFORM', `暂不支持该链接，目前已接入：${names}`)
  }
  return adapter
}
