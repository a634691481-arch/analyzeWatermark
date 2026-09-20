/**
 * 探针 7：INIT_STATE 结构考古
 *
 * 1) key 每个字符 +1（`tusjoh` → `string`），解出来是「请求 URL + 参数签名」
 * 2) value 是明文，作品数据在带 `photo` 的那个 value 里
 * 3) 顺手把所有 http(s) 链接打出来，确认 CDN 域名
 *
 * 用法：node 07-init-state.mjs [页面 html 路径，默认 ./_page.html]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function extractLiteral(html, marker) {
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
    if (char === '"' || char === "'") { inString = true; quote = char; continue }
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return html.slice(begin, i + 1)
    }
  }
  return null
}

const file = process.argv[2]
  ? fileURLToPath(new URL(process.argv[2], `file://${process.cwd()}/`))
  : fileURLToPath(new URL('./_page.html', import.meta.url))

const html = readFileSync(file, 'utf8')
const literal = extractLiteral(html, 'window.INIT_STATE = ')
if (!literal) {
  console.log('没有找到 window.INIT_STATE（页面可能是缩水版，检查 Accept 头）')
  process.exit(1)
}

const state = JSON.parse(literal)
console.log(`INIT_STATE: ${literal.length} 字符，${Object.keys(state).length} 个 key\n`)

const shift = (s, d) => [...s].map(c => String.fromCharCode(c.charCodeAt(0) + d)).join('')

for (const [key, value] of Object.entries(state)) {
  console.log('KEY :', shift(key, -1).slice(0, 120))
  console.log('VALUE:', value && typeof value === 'object' ? Object.keys(value).join(',') : typeof value)
  if (value?.photo) console.log('  ↳ photo: caption=%s mainMvUrls=%s atlas=%s',
    JSON.stringify(value.photo.caption),
    value.photo.mainMvUrls?.length ?? 0,
    value.photo.atlas ? value.photo.atlas.list?.length : 'no')
  console.log()
}

const urls = new Set(literal.match(/https?:\/\/[^\s"'\\]+/g) ?? [])
console.log('=== 页面里出现的链接 ===')
for (const u of urls) console.log(u)
