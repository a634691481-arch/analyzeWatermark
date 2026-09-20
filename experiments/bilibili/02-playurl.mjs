/**
 * B 站探针 2：能不能拿到「音视频合一的单文件」？
 *
 * dash = 音视频分离的 m4s，浏览器直接下会没声音，必须服务端 mux。
 * 老式 durl（flv/mp4）是单文件，最省事 —— 试试不同 fnval 能不能拿到。
 */
const BVID = 'BV1uDe16vE51'
const CID = '41993375204'

const API_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'referer': 'https://www.bilibili.com/',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9'
}

const VARIANTS = [
  ['fnval=0 (默认)', 'qn=127&fnval=0'],
  ['fnval=1 (仅 mp4/flv)', 'qn=127&fnval=1'],
  ['fnval=16 (仅 dash)', 'qn=127&fnval=16'],
  ['fnval=80 (仅 4K dash)', 'qn=127&fnval=80'],
  ['fnval=4048 (全都要)', 'qn=127&fnval=4048&fourk=1'],
  ['无 fnval', 'qn=127']
]

for (const [label, query] of VARIANTS) {
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${CID}&${query}`
  try {
    const response = await fetch(url, { headers: API_HEADERS })
    const payload = await response.json()
    if (payload.code !== 0) {
      console.log(`${label.padEnd(24)} code=${payload.code} ${payload.message}`)
      continue
    }
    const data = payload.data
    const durl = data.durl ?? []
    const dashVideo = data.dash?.video ?? []
    const dashAudio = data.dash?.audio ?? []
    const qualities = [...new Set([...(data.accept_quality ?? [])])].join('/')
    console.log(`${label.padEnd(24)} format=${String(data.format).padEnd(8)} quality=${String(data.quality).padEnd(4)} durl=${durl.length} dash视频=${dashVideo.length} dash音频=${dashAudio.length}`)
    if (durl.length) {
      const seg = durl[0]
      console.log(`     durl[0] ${(seg.size / 1024 / 1024).toFixed(1)}MB ${seg.length}ms`)
      console.log(`     url: ${seg.url.slice(0, 140)}`)
    }
    if (dashVideo.length) {
      console.log(`     dash 视频最高: ${dashVideo.map(v => `${v.width}x${v.height}(id${v.id})`).join(', ')}`)
    }
  }
  catch (error) {
    console.log(`${label.padEnd(24)} ERR ${String(error).slice(0, 80)}`)
  }
}

console.log('\n=== 未登录时为何只有 480P：看接口返回的提示 ===')
const check = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${CID}&qn=112&fnval=4048&fourk=1`, { headers: API_HEADERS })
const checkPayload = await check.json()
console.log('请求 qn=112(1080P+)，实得 quality:', checkPayload.data?.quality)
console.log('accept_quality:', checkPayload.data?.accept_quality)
console.log('dash 实际视频档位:', (checkPayload.data?.dash?.video ?? []).map(v => `${v.width}x${v.height}`).join(', '))

console.log('\n=== 封面图是否可直接下载 ===')
const view = await (await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${BVID}`, { headers: API_HEADERS })).json()
const pic = view.data.pic
for (const [label, headers] of [
  ['带 referer', { 'user-agent': API_HEADERS['user-agent'], referer: 'https://www.bilibili.com/' }],
  ['无 referer', { 'user-agent': API_HEADERS['user-agent'] }]
]) {
  try {
    const response = await fetch(pic, { headers })
    const buffer = Buffer.from(await response.arrayBuffer())
    console.log(`  ${label.padEnd(10)} HTTP ${response.status} ${response.headers.get('content-type')} ${(buffer.length / 1024).toFixed(0)}KB`)
  }
  catch (error) {
    console.log(`  ${label.padEnd(10)} ERR ${String(error).slice(0, 60)}`)
  }
}
