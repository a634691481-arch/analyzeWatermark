/**
 * B 站探针 4：CDN 是否要 Referer（决定代理要不要按域名补 referer）
 */
const BVID = 'BV1uDe16vE51'
const CID = '41993375204'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const API_HEADERS = {
  'user-agent': UA,
  'referer': 'https://www.bilibili.com/',
  'accept': 'application/json, text/plain, */*'
}

const play = await (await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${CID}&qn=127&fnval=4048`, { headers: API_HEADERS })).json()
const dash = play.data.dash
const durl = play.data.durl
const view = await (await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${BVID}`, { headers: API_HEADERS })).json()

const TARGETS = [
  ['durl mp4', durl?.[0]?.url],
  ['dash 视频 m4s', dash?.video?.[0]?.baseUrl],
  ['dash 音频 m4s', dash?.audio?.[0]?.baseUrl],
  ['封面 hdslb', view.data.pic]
]

console.log('=== 代理只发 UA（不加 referer）时能否下载 ===\n')
for (const [label, url] of TARGETS) {
  if (!url) { console.log(`${label.padEnd(16)} (无 url)`); continue }
  const host = new URL(url).hostname
  for (const withReferer of [false, true]) {
    const headers = { 'user-agent': UA }
    if (withReferer) headers.referer = 'https://www.bilibili.com/'
    try {
      const response = await fetch(url, { headers, redirect: 'follow' })
      // 只读前 64KB 判断可用性，不整段下载
      const reader = response.body.getReader()
      const { value } = await reader.read()
      await reader.cancel()
      const size = value?.length ?? 0
      const head = response.headers.get('content-length')
      console.log(
        `${label.padEnd(16)} referer=${withReferer ? 'Y' : 'N'}  HTTP ${response.status} `
        + `${String(response.headers.get('content-type')).padEnd(20)} `
        + `${head ? (Number(head) / 1024 / 1024).toFixed(1) + 'MB' : size + 'B(首包)'}  ${host}`
      )
    }
    catch (error) {
      console.log(`${label.padEnd(16)} referer=${withReferer ? 'Y' : 'N'}  ERR ${String(error).slice(0, 70)}`)
    }
  }
  console.log('')
}
