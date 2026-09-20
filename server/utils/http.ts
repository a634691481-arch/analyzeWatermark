import { ParseError } from './errors'
import { BROWSER_UA } from './security'

export interface FetchHtmlOptions {
  referer?: string
  timeout?: number
}

/** 拉取 HTML 页面，带浏览器 UA 与超时保护 */
export async function fetchHtml(url: string, options: FetchHtmlOptions = {}): Promise<string> {
  const { referer, timeout = 15_000 } = options

  const headers: Record<string, string> = {
    'user-agent': BROWSER_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
  if (referer) headers.referer = referer

  let response: Response
  try {
    response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout)
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ParseError('FETCH_FAILED', `无法访问该链接：${reason}`, 502)
  }

  if (response.status === 404) {
    throw new ParseError('NOT_FOUND', '分享链接不存在或已被删除', 404)
  }
  if (!response.ok) {
    throw new ParseError('FETCH_FAILED', `目标站点返回 HTTP ${response.status}`, 502)
  }

  return response.text()
}

/**
 * 把 HTML 实体还原成普通文本。
 * 页面把内嵌 JSON 放在 HTML 属性里，引号等字符都被转义了。
 */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** JSON.parse 的安全版本：失败返回 undefined 而不是抛错 */
export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

/**
 * 把形如 '{"a":1}' / '[1,2]' 的字符串还原成对象。
 *
 * 服务端下发数据时常出现「JSON 被当成字符串塞进另一个 JSON」的双重编码，
 * 靠这个函数把外层剥掉。
 */
export function tryParseJsonString(value: string): unknown {
  const text = value.trim()
  if (text.length < 2) return undefined
  const first = text[0]
  const last = text[text.length - 1]
  const isObject = first === '{' && last === '}'
  const isArray = first === '[' && last === ']'
  if (!isObject && !isArray) return undefined
  return safeJsonParse(text)
}

/**
 * 读取所有 `data-fn-args="..."` / `data-fn-args='...'` 属性值（原始，未解码）。
 *
 * 不用正则的原因：HTML 里同时存在单引号和双引号两种写法，
 * 且页面还有 `getAttribute("data-fn-args")` 这类字符串干扰，逐字符扫描最稳。
 */
export function readFnArgsAttributes(html: string): string[] {
  const values: string[] = []
  const marker = 'data-fn-args='
  let index = html.indexOf(marker)

  while (index !== -1) {
    const cursor = index + marker.length
    const quote = html[cursor]
    if (quote === '"' || quote === '\'') {
      const start = cursor + 1
      const end = html.indexOf(quote, start)
      if (end !== -1) {
        values.push(html.slice(start, end))
        index = html.indexOf(marker, end)
        continue
      }
    }
    index = html.indexOf(marker, cursor)
  }

  return values
}

/**
 * 提取 `_ROUTER_DATA = {...}` 这个对象字面量（花括号配对，忽略字符串内的括号）。
 * 它是页面的另一份 SSR 数据来源，结构随版本变化，所以两种来源都尝试。
 */
export function readRouterDataLiteral(html: string): string | null {
  const marker = '_ROUTER_DATA = '
  const start = html.indexOf(marker)
  if (start === -1) return null

  const begin = start + marker.length
  if (html[begin] !== '{') return null

  let depth = 0
  let inString = false
  let escaped = false
  let quote = ''

  for (let i = begin; i < html.length; i++) {
    const char = html[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if (char === quote) inString = false
      continue
    }
    if (char === '"' || char === '\'') { inString = true; quote = char; continue }
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return html.slice(begin, i + 1)
    }
  }

  return null
}
