// 探针 1：抓分享页，确认是否含 SSR 数据（data-fn-args / _ROUTER_DATA）
const URL_ = 'https://www.doubao.com/thread/xTOlFYCgraKkBExtJ'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const res = await fetch(URL_, {
  headers: { 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'zh-CN,zh;q=0.9', referer: 'https://www.doubao.com/' },
  redirect: 'follow',
  signal: AbortSignal.timeout(20000)
})
const html = await res.text()
console.log('status:', res.status, 'final:', res.url)
console.log('len:', html.length)
for (const marker of ['data-fn-args', '_ROUTER_DATA', 'image_ori_raw', 'image_ori', 'image_preview', '__NEXT_DATA__', 'share_info']) {
  console.log(marker.padEnd(16), html.includes(marker))
}
console.log('--- head 800 ---')
console.log(html.slice(0, 800))
const m = html.match(/data-fn-args=/g)
console.log('data-fn-args count:', m ? m.length : 0)
