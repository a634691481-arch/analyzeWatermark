/** B 站探针 5：durl mp4 是否需要 Referer */
const BVID = 'BV1uDe16vE51'
const CID = '41993375204'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const play = await (await fetch(
  `https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${CID}&qn=127&fnval=0`,
  { headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' } }
)).json()

const url = play.data.durl[0].url
console.log('durl:', url.slice(0, 120))
console.log('host:', new URL(url).hostname)
console.log('quality:', play.data.quality, '| format:', play.data.format, '| size:', (play.data.durl[0].size / 1024 / 1024).toFixed(1) + 'MB')

for (const withReferer of [false, true]) {
  const headers = { 'user-agent': UA }
  if (withReferer) headers.referer = 'https://www.bilibili.com/'
  try {
    const response = await fetch(url, { headers, redirect: 'follow' })
    const reader = response.body.getReader()
    const { value } = await reader.read()
    await reader.cancel()
    console.log(`referer=${withReferer ? 'Y' : 'N'}  HTTP ${response.status}  ${response.headers.get('content-type')}  ${response.headers.get('content-length') ? (Number(response.headers.get('content-length')) / 1024 / 1024).toFixed(1) + 'MB' : (value?.length ?? 0) + 'B(首包)'}  accept-ranges=${response.headers.get('accept-ranges')}`)
  }
  catch (error) {
    console.log(`referer=${withReferer ? 'Y' : 'N'}  ERR ${String(error).slice(0, 70)}`)
  }
}

/** 顺带看看 Range 请求是否被支持（进度条拖动） */
console.log('\n=== Range 支持 ===')
const ranged = await fetch(url, {
  headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/', range: 'bytes=0-1023' }
})
console.log('  status:', ranged.status, '| content-range:', ranged.headers.get('content-range'), '| length:', ranged.headers.get('content-length'))
