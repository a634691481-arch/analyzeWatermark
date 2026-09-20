/** 探针 3：数据不在 SSR 里，试经典接口 + 看桌面 UA 的 302 去哪 */
const AWEME_ID = '7686802947086257408'

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const CANDIDATES = [
  { name: 'iesdouyin iteminfo', url: `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${AWEME_ID}` },
  { name: 'iesdouyin detail', url: `https://www.iesdouyin.com/aweme/v1/web/aweme/detail/?aweme_id=${AWEME_ID}&device_platform=webapp&aid=6383` },
  { name: 'douyin detail', url: `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${AWEME_ID}&device_platform=webapp&aid=6383` },
  { name: 'iesdouyin share api', url: `https://www.iesdouyin.com/share/video/${AWEME_ID}/?from_ssr=1` }
]

for (const item of CANDIDATES) {
  console.log(`\n=== ${item.name} ===`)
  console.log(item.url)
  try {
    const response = await fetch(item.url, {
      redirect: 'manual',
      headers: {
        'user-agent': MOBILE_UA,
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'referer': `https://www.iesdouyin.com/share/video/${AWEME_ID}/`
      }
    })
    console.log('status:', response.status, '| location:', response.headers.get('location'), '| type:', response.headers.get('content-type'))
    const body = await response.text()
    console.log('bytes:', body.length, '| head:', JSON.stringify(body.slice(0, 260)))
  }
  catch (error) {
    console.log('失败:', String(error))
  }
}

console.log('\n=== 桌面 UA 访问分享页的 302 目标 ===')
const desktop = await fetch(`https://www.iesdouyin.com/share/video/${AWEME_ID}/`, {
  redirect: 'manual',
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
console.log('status:', desktop.status)
console.log('location:', desktop.headers.get('location'))
console.log('set-cookie:', desktop.headers.getSetCookie?.())
