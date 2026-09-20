/**
 * 抖音分享链接探针 1：解析短链 -> 拿到真实视频页 -> 摸清数据在哪
 *
 * 用法: node experiments/douyin/01-resolve.mjs [shareUrl]
 */
import { writeFileSync } from 'node:fs'

const SHARE_URL = process.argv[2] || 'https://v.douyin.com/PJIP6J56t8Y/'

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const DESKTOP_UA
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function trace(label, url, headers, redirect = 'manual') {
  console.log(`\n=== ${label} ===`)
  console.log('url:', url)
  let response
  try {
    response = await fetch(url, { redirect, headers })
  }
  catch (error) {
    console.log('请求失败:', String(error))
    return null
  }
  console.log('status:', response.status)
  console.log('location:', response.headers.get('location'))
  console.log('content-type:', response.headers.get('content-type'))
  console.log('set-cookie:', response.headers.getSetCookie?.() ?? response.headers.get('set-cookie'))
  return response
}

// 1) 短链跳转链
let current = SHARE_URL
const chain = [current]
for (let hop = 0; hop < 6; hop++) {
  const response = await trace(`hop ${hop}`, current, { 'user-agent': MOBILE_UA })
  if (!response) break
  const location = response.headers.get('location')
  if (!location) {
    console.log('-> 到达终点（无 location）')
    break
  }
  const next = new URL(location, current).href
  chain.push(next)
  current = next
}

console.log('\n=== 跳转链 ===')
chain.forEach((url, index) => console.log(`${index}: ${url}`))

writeFileSync(new URL('./_chain.json', import.meta.url), JSON.stringify(chain, null, 2))

// 2) 用移动端 UA 拉最终页面，看数据形态
console.log('\n=== 移动端 UA 拉分享页 ===')
const pageRes = await fetch(current, {
  headers: {
    'user-agent': MOBILE_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
const html = await pageRes.text()
console.log('status:', pageRes.status, 'bytes:', html.length)
writeFileSync(new URL('./_page-mobile.html', import.meta.url), html)

const markers = ['_ROUTER_DATA', 'RENDER_DATA', 'play_addr', 'playwm', 'aweme_id', 'video_id', 'videoInfoRes', 'item_list', 'download_addr', 'images', 'verify', 'captcha']
for (const marker of markers) {
  console.log(`  ${marker}: ${html.includes(marker)} (${(html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length})`)
}

// 3) 用桌面 UA 对比
console.log('\n=== 桌面 UA 拉同一个页面 ===')
const desktopRes = await fetch(current, {
  headers: {
    'user-agent': DESKTOP_UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
const desktopHtml = await desktopRes.text()
console.log('status:', desktopRes.status, 'bytes:', desktopHtml.length)
for (const marker of ['_ROUTER_DATA', 'RENDER_DATA', 'play_addr', 'playwm', 'aweme_id']) {
  console.log(`  ${marker}: ${desktopHtml.includes(marker)}`)
}
writeFileSync(new URL('./_page-desktop.html', import.meta.url), desktopHtml)
