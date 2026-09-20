/** 探针 2：看被风控页面里到底是什么，并测试「带 ttwid 二次请求」是否放行 */
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync(new URL('./_page-mobile.html', import.meta.url), 'utf8')

console.log('=== _ROUTER_DATA 附近 ===')
const routerIndex = html.indexOf('_ROUTER_DATA')
console.log(JSON.stringify(html.slice(routerIndex, routerIndex + 1200)))

console.log('\n=== verify / captcha 附近 ===')
for (const marker of ['verify', 'captcha']) {
  let i = -1
  let count = 0
  while ((i = html.indexOf(marker, i + 1)) !== -1 && count < 2) {
    count++
    console.log(`--- ${marker} @${i} ---`)
    console.log(JSON.stringify(html.slice(Math.max(0, i - 300), i + 200)))
  }
}

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const SHARE_PAGE = 'https://www.iesdouyin.com/share/video/7686802947086257408/'

console.log('\n\n=== 请求1：拿 ttwid ===')
const first = await fetch(SHARE_PAGE, {
  redirect: 'manual',
  headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' }
})
const setCookie = first.headers.getSetCookie?.() ?? []
console.log('status:', first.status, 'set-cookie:', setCookie)
const ttwid = setCookie.map(c => c.split(';')[0]).join('; ')
console.log('ttwid:', ttwid)

console.log('\n=== 请求2：带上 ttwid 再请求同一个页面 ===')
const second = await fetch(SHARE_PAGE, {
  redirect: 'manual',
  headers: {
    'user-agent': MOBILE_UA,
    'accept-language': 'zh-CN,zh;q=0.9',
    'cookie': ttwid,
    'referer': 'https://www.douyin.com/'
  }
})
const secondHtml = await second.text()
console.log('status:', second.status, 'bytes:', secondHtml.length)
for (const marker of ['_ROUTER_DATA', 'play_addr', 'playwm', 'videoInfoRes', 'item_list', 'download_addr', 'verify', 'captcha', 'aweme_id']) {
  console.log(`  ${marker}: ${secondHtml.includes(marker)}`)
}
writeFileSync(new URL('./_page-with-ttwid.html', import.meta.url), secondHtml)

console.log('\n=== 请求3：桌面 UA + ttwid ===')
const third = await fetch(SHARE_PAGE, {
  redirect: 'manual',
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cookie': ttwid
  }
})
const thirdHtml = await third.text()
console.log('status:', third.status, 'bytes:', thirdHtml.length)
for (const marker of ['_ROUTER_DATA', 'play_addr', 'playwm', 'videoInfoRes', 'item_list', 'verify']) {
  console.log(`  ${marker}: ${thirdHtml.includes(marker)}`)
}
writeFileSync(new URL('./_page-desktop-ttwid.html', import.meta.url), thirdHtml)
