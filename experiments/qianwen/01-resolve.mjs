/**
 * 千问探针 1：分享页数据形态摸底
 *   node experiments/qianwen/01-resolve.mjs [shareUrl]
 */
import { writeFileSync } from 'node:fs'

const SHARE_URL = process.argv[2] || 'https://qianwen.my.cn/share/chat/58c5c60a43164ccfbf6bb76715be1ba3'

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

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

console.log('=== 跳转链 ===')
let current = SHARE_URL
const chain = [current]
for (let hop = 0; hop < 8; hop++) {
  const response = await fetch(current, {
    redirect: 'manual',
    headers: { 'user-agent': UA_DESKTOP, 'accept-language': 'zh-CN,zh;q=0.9' }
  })
  mergeCookies(response, jar)
  const location = response.headers.get('location')
  console.log(`  ${hop}: HTTP ${response.status} -> ${location ? location.slice(0, 140) : '(终点)'}`)
  if (!location) break
  current = new URL(location, current).href
  chain.push(current)
}
console.log('  cookie jar:', Object.keys(jar))
writeFileSync(new URL('./_chain.json', import.meta.url), JSON.stringify({ chain, current }, null, 2))

const MARKERS = [
  '__INITIAL_STATE__', '__NEXT_DATA__', 'RENDER_DATA', '_ROUTER_DATA', 'window.__NUXT__',
  'ssrData', 'SSR_DATA', 'initialData', 'shareId', 'share_id',
  'imageUrl', 'image_url', 'videoUrl', 'video_url', 'videoUrlList', 'oss', 'aliyuncs',
  'cdn', '我的创作', '通义', '千问', 'qwen', 'wanx', 'login', 'verify', 'captcha', 'baxia'
]

for (const [label, ua] of [['桌面端', UA_DESKTOP], ['移动端', UA_MOBILE]]) {
  console.log(`\n=== ${label} UA ===`)
  const response = await fetch(current, {
    redirect: 'manual',
    headers: {
      'user-agent': ua,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
      'cookie': cookieHeader(jar),
      'referer': 'https://qianwen.my.cn/'
    }
  })
  mergeCookies(response, jar)
  const html = await response.text()
  console.log(`HTTP ${response.status} | ${(html.length / 1024).toFixed(0)}KB | type=${response.headers.get('content-type')} | location=${response.headers.get('location')}`)
  writeFileSync(new URL(`./_page-${label}.html`, import.meta.url), html)

  const hits = []
  for (const marker of MARKERS) {
    const count = (html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    if (count) hits.push(`${marker}:${count}`)
  }
  console.log('  命中:', hits.join('  ') || '(无)')

  // 打印 script 标签的 src 列表，方便找前端入口
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1])
  console.log('  script 数量:', scripts.length)
  scripts.slice(0, 12).forEach(src => console.log('    ', src.slice(0, 130)))

  // 内联 script 的形态
  const inline = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]{0,200})/g)].map(m => m[1].trim().slice(0, 120))
  console.log('  内联 script 前几段:')
  inline.slice(0, 8).forEach(text => console.log('    ', JSON.stringify(text)))
}
