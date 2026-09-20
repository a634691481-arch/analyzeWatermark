import type { PlatformInfo } from '#shared/types'
import type { PlatformAdapter } from './types'
import { ParseError } from '../errors'
import { doubaoAdapter } from './doubao'
import { douyinAdapter } from './douyin'
import { qianwenAdapter } from './qianwen'
import { xiaohongshuAdapter } from './xiaohongshu'

/** 已接入的平台。新增平台时在这里注册即可 */
export const platformAdapters: PlatformAdapter[] = [
  doubaoAdapter,
  douyinAdapter,
  xiaohongshuAdapter,
  qianwenAdapter
]

export function supportedPlatforms(): PlatformInfo[] {
  return platformAdapters.map(adapter => ({
    id: adapter.id,
    name: adapter.name,
    example: adapter.example
  }))
}

/** URL 末尾常见的粘连字符：中文标点、英文标点、emoji 旁的空格等 */
const TRAILING_JUNK = /[.,;:!?)\]}>）】》」』”，。、；：！？'"]+$/
/** 不带协议时，形如 v.douyin.com/xxxx 也算链接 */
const BARE_HOST = /^[\w-]+(\.[\w-]+)+(\/|$|\?)/

function trimTrailingJunk(value: string): string {
  return value.replace(TRAILING_JUNK, '')
}

/**
 * 从任意文本里挑出候选链接。
 *
 * 分享到剪贴板的内容通常是一整段文案，例如：
 *   「6.48 复制打开抖音，看看【xxx的作品】标题  https://v.douyin.com/xxxx/ rEu:/ y@g.OK 09/27 :4pm」
 *   「87 某某发布了一篇小红书笔记，快来看吧！😆 http://xhslink.com/a/xxxx，复制本条信息…」
 * 所以不能直接 new URL(整段)，必须先提取。
 */
function extractCandidateUrls(input: string): string[] {
  const text = input?.trim()
  if (!text) return []

  const found: string[] = []
  for (const match of text.matchAll(/https?:\/\/[^\s]+/gi)) {
    const cleaned = trimTrailingJunk(match[0])
    if (cleaned) found.push(cleaned)
  }
  if (found.length) return found

  // 整段就是一个不带协议的域名
  if (!/\s/.test(text)) {
    const bare = trimTrailingJunk(text)
    if (BARE_HOST.test(bare)) return [`https://${bare}`]
  }

  return []
}

function toUrl(candidate: string): URL | undefined {
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url
  }
  catch {
    return undefined
  }
}

/**
 * 把用户输入的文本解析成 URL。
 *
 * 输入可能是纯链接，也可能是整段分享文案；文案里若有多个链接，
 * 优先返回平台能识别的那个，都不认识时返回第一个，
 * 好让上层给出「暂不支持该平台」这种更准确的提示。
 */
export function parseShareUrl(input: string): URL {
  const candidates = extractCandidateUrls(input)

  if (!candidates.length) {
    throw new ParseError('INVALID_URL', '没有在内容里找到链接，请粘贴分享链接或整段分享文案')
  }

  const urls = candidates.map(toUrl).filter((url): url is URL => Boolean(url))

  const supported = urls.find(url => platformAdapters.some(adapter => adapter.match(url)))
  if (supported) return supported

  const [first] = urls
  if (first) return first

  throw new ParseError('INVALID_URL', '链接格式不正确，请粘贴分享链接或整段分享文案')
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
