/**
 * 小红书探针 1：短链跳转 + 页面数据形态
 *   node experiments/xiaohongshu/01-resolve.mjs [shareUrl]
 */
import { writeFileSync } from 'node:fs'

const SHARE_URL = process.argv[2] || 'https://xhslink.cn/o/3iRd5juLzyP'

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const DESKTOP_UA
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function mergeCookies(response, jar = {}) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0] ?? ''
    const index = pair.indexOf('=')
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim()
  }
  return jar
}
const cookieHeader = jar => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

const jar = {}
let current = SHARE_URL
const chain = [current]

console.log('=== 跳转链 ===')
for (let hop = 0; hop < 8; hop++) {
  const response = await fetch(current, {
    redirect: 'manual',
    headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' }
  })
  mergeCookies(response, jar)
  const location = response.headers.get('location')
  console.log(`  ${hop}: HTTP ${response.status} -> ${location ? location.slice(0, 160) : '(终点)'}`)
  if (!location) break
  current = new URL(location, current).href
  chain.push(current)
}

console.log('\n最终 URL:')
console.log(' ', current)
console.log('cookie jar:', Object.keys(jar))

writeFileSync(new URL('./_chain.json', import.meta.url), JSON.stringify({ chain, current }, null, 2))

for (const [label, ua] of [['移动端', MOBILE_UA], ['桌面端', DESKTOP_UA]]) {
  console.log(`\n=== ${label} UA 拉取笔记页 ===`)
  const response = await fetch(current, {
    redirect: 'manual',
    headers: {
      'user-agent': ua,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
      'cookie': cookieHeader(jar),
      'referer': 'https://www.xiaohongshu.com/'
    }
  })
  mergeCookies(response, jar)
  const html = await response.text()
  console.log(`HTTP ${response.status} | ${(html.length / 1024).toFixed(0)}KB | location: ${response.headers.get('location')}`)
  writeFileSync(new URL(`./_page-${label}.html`, import.meta.url), html)

  const markers = [
    '__INITIAL_STATE__', 'noteDetailMap', 'imageList', 'urlDefault', 'urlTrace',
    'originVideoKey', 'masterUrl', 'video', 'xsec_token', 'noteId', 'watermark',
    'sns-webpic', 'xhscdn', '登录', '滑块', 'verify'
  ]
  for (const marker of markers) {
    const count = (html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    if (count) console.log(`   ${marker}: ${count}`)
  }
}
