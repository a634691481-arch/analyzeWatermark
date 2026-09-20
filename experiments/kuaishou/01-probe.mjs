/**
 * 探针 1：快手分享页能拿到什么
 *
 * 输入：v.kuaishou.com 短链
 * 目标：确认 302 落点、SSR 数据位置（window.INIT_STATE）、视频地址形态
 */
import { writeFileSync } from 'node:fs'

const SHARE = process.argv[2] || 'https://v.kuaishou.com/K23oc0R9'
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

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

let current = SHARE
for (let hop = 0; hop < 8; hop++) {
  const res = await fetch(current, { redirect: 'manual', headers: { 'user-agent': MOBILE_UA } })
  const loc = res.headers.get('location')
  console.log(`hop ${hop}: ${res.status} -> ${loc || '(no location)'}`)
  if (!loc) break
  current = new URL(loc, current).href
}
console.log('final url:', current)

const page = await fetch(current, {
  headers: {
    'user-agent': MOBILE_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
console.log('page status:', page.status, page.headers.get('content-type'))
const html = await page.text()
writeFileSync(new URL('./_page.html', import.meta.url), html)
console.log('html bytes:', html.length)

const lit = extractLiteral(html, 'window.INIT_STATE = ')
console.log('INIT_STATE found:', Boolean(lit), lit ? lit.length : 0)
if (!lit) process.exit(0)

const state = JSON.parse(lit)
for (const [key, value] of Object.entries(state)) {
  const decoded = [...key].map(c => String.fromCharCode(c.charCodeAt(0) - 1)).join('')
  const hasPhoto = value && typeof value === 'object' && value.photo
  console.log('key:', decoded.slice(0, 90))
  console.log('   value.photo?', Boolean(hasPhoto), 'keys:', value && typeof value === 'object' ? Object.keys(value).slice(0, 12).join(',') : typeof value)
}
