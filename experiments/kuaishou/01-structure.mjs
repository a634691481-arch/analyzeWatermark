/**
 * 快手探针 1：作品页结构 + 所有视频候选地址
 *   node experiments/kuaishou/01-structure.mjs [shareUrl]
 */
import { writeFileSync } from 'node:fs'

const SHARE_URL = process.argv[2] || 'https://v.kuaishou.com/K23oc0R9'
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function readJsObjectLiteral(source, marker) {
  const start = source.indexOf(marker)
  if (start === -1) return null
  const begin = start + marker.length
  if (source[begin] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  let quote = ''
  for (let i = begin; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return source.slice(begin, i + 1) }
  }
  return null
}

console.log('=== 跳转链 ===')
let current = SHARE_URL
for (let hop = 0; hop < 6; hop++) {
  const response = await fetch(current, { redirect: 'manual', headers: { 'user-agent': MOBILE_UA } })
  const location = response.headers.get('location')
  console.log(`  ${hop}: HTTP ${response.status} -> ${location ? location.slice(0, 150) : '(终点)'}`)
  if (!location) break
  current = new URL(location, current).href
}
console.log('  最终:', current)

console.log('\n=== 抓作品页 ===')
const response = await fetch(current, {
  redirect: 'manual',
  headers: {
    'user-agent': MOBILE_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
const html = await response.text()
console.log('  HTTP', response.status, '| bytes', html.length)
writeFileSync(new URL('./_page.html', import.meta.url), html)

const literal = readJsObjectLiteral(html, 'window.INIT_STATE = ') ?? readJsObjectLiteral(html, 'window.INIT_STATE=')
console.log('  INIT_STATE 长度:', literal ? literal.length : '(未找到)')
if (!literal) process.exit(1)

const state = JSON.parse(literal)
writeFileSync(new URL('./_state.json', import.meta.url), JSON.stringify(state, null, 2))

let photo = null
for (const value of Object.values(state)) {
  if (!value || typeof value !== 'object') continue
  const candidate = value.photo
  if (candidate && typeof candidate === 'object') {
    if (candidate.mainMvUrls?.length || candidate.atlas) { photo = candidate; break }
    photo ??= candidate
  }
}
if (!photo) {
  console.log('  没有找到 photo 对象，state 顶层 keys:', Object.keys(state))
  process.exit(1)
}

console.log('\n=== photo 概览 ===')
console.log('  photoId:', photo.photoId)
console.log('  caption:', String(photo.caption).slice(0, 60))
console.log('  userName:', photo.userName)
console.log('  duration:', photo.duration, '| size:', photo.width, 'x', photo.height)
console.log('  是否图集:', Boolean(photo.atlas))

console.log('\n=== photo 的所有顶层字段 ===')
console.log(Object.keys(photo).join(', '))

/** 递归找所有像视频/图片地址的字符串 */
console.log('\n=== 全对象里所有 URL（按字段路径）===')
const found = []
const walk = (node, path, depth) => {
  if (depth > 8 || !node) return
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node)) found.push({ path, url: node })
    return
  }
  if (typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1))
    return
  }
  for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`, depth + 1)
}
walk(photo, 'photo', 0)

for (const item of found) {
  const flags = []
  if (/watermark|wm|mark/i.test(item.url)) flags.push('URL含mark')
  if (/srcNoMark|noMark/i.test(item.path)) flags.push('字段名noMark')
  if (/\.mp4/i.test(item.url)) flags.push('mp4')
  if (/upic/i.test(item.url)) flags.push('upic')
  console.log(`  ${flags.length ? '[' + flags.join(',') + ']' : '[        ]'} ${item.path}`)
  console.log(`      ${item.url.slice(0, 190)}`)
}
