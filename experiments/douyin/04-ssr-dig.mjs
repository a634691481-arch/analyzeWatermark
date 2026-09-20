/** 探针 4：完整还原跳转链上的参数 + cookie，挖 SSR 数据 */
import { writeFileSync } from 'node:fs'

const AWEME_ID = '7686802947086257408'
const SHORT_URL = process.argv[2] || 'https://v.douyin.com/PJIP6J56t8Y/'

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const DESKTOP_UA
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** 花括号配对提取 `_ROUTER_DATA = {...}` */
function readObjectLiteral(source, marker) {
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
    else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(begin, i + 1)
    }
  }
  return null
}

/** 收集 cookie jar */
function cookieJar(response, jar = {}) {
  const cookies = response.headers.getSetCookie?.() ?? []
  for (const raw of cookies) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim()
  }
  return jar
}
const jarToString = jar => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

const jar = {}

// 1) 短链跳转
let current = SHORT_URL
const chain = [current]
for (let hop = 0; hop < 5; hop++) {
  const response = await fetch(current, { redirect: 'manual', headers: { 'user-agent': MOBILE_UA } })
  cookieJar(response, jar)
  const location = response.headers.get('location')
  if (!location) break
  current = new URL(location, current).href
  chain.push(current)
}
console.log('跳转链:')
chain.forEach((url, index) => console.log(`  ${index}: ${url}`))
console.log('cookie jar:', Object.keys(jar))

// 2) 用完整参数 + cookie 拉分享页
console.log('\n=== 分享页（完整参数 + ttwid）===')
const shareUrl = chain[chain.length - 1]
const shareRes = await fetch(shareUrl, {
  redirect: 'manual',
  headers: {
    'user-agent': MOBILE_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cookie': jarToString(jar),
    'referer': 'https://www.douyin.com/'
  }
})
cookieJar(shareRes, jar)
const shareHtml = await shareRes.text()
console.log('status:', shareRes.status, 'bytes:', shareHtml.length)
writeFileSync(new URL('./_page-share-full.html', import.meta.url), shareHtml)

const literal = readObjectLiteral(shareHtml, '_ROUTER_DATA = ')
if (literal) {
  const data = JSON.parse(literal)
  console.log('loaderData keys:', Object.keys(data.loaderData || {}))
  const page = data.loaderData?.['video_(id)/page']
  if (page) console.log('video_(id)/page keys:', Object.keys(page))
  writeFileSync(new URL('./_router-data-share.json', import.meta.url), JSON.stringify(data, null, 2))
}
else {
  console.log('没有 _ROUTER_DATA 字面量')
}

// 3) 桌面端视频页
console.log('\n=== www.douyin.com/video/{id} （桌面 UA + cookie）===')
const videoUrl = `https://www.douyin.com/video/${AWEME_ID}`
const videoRes = await fetch(videoUrl, {
  redirect: 'manual',
  headers: {
    'user-agent': DESKTOP_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cookie': jarToString(jar)
  }
})
cookieJar(videoRes, jar)
const videoHtml = await videoRes.text()
console.log('status:', videoRes.status, '| location:', videoRes.headers.get('location'), '| bytes:', videoHtml.length)
writeFileSync(new URL('./_page-video-desktop.html', import.meta.url), videoHtml)
for (const marker of ['_ROUTER_DATA', 'RENDER_DATA', 'play_addr', 'playwm', '__pace_f', 'SSR_RENDER_DATA', 'videoInfoRes', 'item_list']) {
  console.log(`  ${marker}: ${videoHtml.includes(marker)}`)
}

// 4) 移动端分享页是不是也要 cookie
console.log('\n=== 分享页（不带 cookie 对照）===')
const noCookie = await fetch(shareUrl, {
  redirect: 'manual',
  headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' }
})
const noCookieHtml = await noCookie.text()
console.log('status:', noCookie.status, 'bytes:', noCookieHtml.length, '| play_addr:', noCookieHtml.includes('play_addr'))
