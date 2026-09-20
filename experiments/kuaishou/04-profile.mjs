/**
 * 探针 4：从作者主页找一个「图集」作品，确认图集数据形态
 */
import { writeFileSync } from 'node:fs'

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

const res = await fetch('https://v.m.chenzhongtech.com/fw/profile/3xdf37hz6gd33qi', {
  headers: { 'user-agent': MOBILE_UA, 'accept': 'text/html', 'accept-language': 'zh-CN,zh;q=0.9' }
})
const html = await res.text()
console.log('status', res.status, 'bytes', html.length)
writeFileSync(new URL('./_profile.html', import.meta.url), html)

const lit = extractLiteral(html, 'window.INIT_STATE = ')
console.log('INIT_STATE', Boolean(lit))
if (!lit) process.exit(0)
const state = JSON.parse(lit)
for (const [key, value] of Object.entries(state)) {
  const decoded = [...key].map(c => String.fromCharCode(c.charCodeAt(0) - 1)).join('')
  console.log('KEY:', decoded.slice(0, 100))
  console.log('  top keys:', value && typeof value === 'object' ? Object.keys(value).join(',') : typeof value)
}
writeFileSync(new URL('./_profile_state.json', import.meta.url), JSON.stringify(state, null, 2))
