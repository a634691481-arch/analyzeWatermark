/**
 * B 站探针 1：短链解析 + 作品信息 + 播放流形态
 *   node experiments/bilibili/01-resolve.mjs [shareUrl]
 */
import { writeFileSync } from 'node:fs'

const SHARE_URL = process.argv[2] || 'https://b23.tv/BV1uDe16vE51'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** B 站接口对 Referer 敏感，必须带 */
const API_HEADERS = {
  'user-agent': BROWSER_UA,
  'referer': 'https://www.bilibili.com/',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9'
}

console.log('=== 1) 短链跳转 ===')
let current = SHARE_URL
const chain = [current]
for (let hop = 0; hop < 8; hop++) {
  const response = await fetch(current, {
    redirect: 'manual',
    headers: { 'user-agent': BROWSER_UA, 'accept-language': 'zh-CN,zh;q=0.9' }
  })
  const location = response.headers.get('location')
  console.log(`  ${hop}: HTTP ${response.status} -> ${location ? location.slice(0, 150) : '(终点)'}`)
  if (!location) break
  current = new URL(location, current).href
  chain.push(current)
}
console.log('  最终:', current)
writeFileSync(new URL('./_chain.json', import.meta.url), JSON.stringify({ chain, current }, null, 2))

/** 从各种链接形态里抠出 BV 号 */
const bvid = (current.match(/\/(BV[0-9A-Za-z]+)/) ?? current.match(/(BV[0-9A-Za-z]{8,})/) ?? [])[1]
console.log('  识别到的 BV 号:', bvid ?? '(无)')

if (!bvid) {
  console.log('  拿不到 BV 号，后续跳过')
  process.exit(1)
}

console.log('\n=== 2) web-interface/view 作品信息 ===')
const viewResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers: API_HEADERS })
const viewText = await viewResponse.text()
console.log('  HTTP', viewResponse.status, '| bytes', viewText.length)
writeFileSync(new URL('./_view.json', import.meta.url), viewText)

let view
try {
  view = JSON.parse(viewText)
}
catch {
  console.log('  非 JSON:', viewText.slice(0, 200))
  process.exit(1)
}

console.log('  code:', view.code, '| message:', view.message)
if (view.code !== 0) {
  console.log('  完整响应:', JSON.stringify(view).slice(0, 400))
  process.exit(1)
}

const d = view.data
console.log('  bvid:', d.bvid, '| aid:', d.aid, '| cid:', d.cid)
console.log('  title:', d.title)
console.log('  分P数:', d.videos, '| 时长:', d.duration, '秒')
console.log('  UP主:', d.owner?.name, '| mid:', d.owner?.mid)
console.log('  封面 pic:', String(d.pic).slice(0, 130))
console.log('  简介 desc:', String(d.desc).slice(0, 100))
console.log('  pages:', d.pages?.map(p => `${p.page}:${p.cid}`).join(', '))

console.log('\n=== 3) playurl 可用流 ===')
const cid = d.cid
const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=127&fnval=4048&fnver=0&fourk=1`
console.log(' ', playUrl)
const playResponse = await fetch(playUrl, { headers: API_HEADERS })
const playText = await playResponse.text()
console.log('  HTTP', playResponse.status, '| bytes', playText.length)
writeFileSync(new URL('./_playurl.json', import.meta.url), playText)

let play
try {
  play = JSON.parse(playText)
}
catch {
  console.log('  非 JSON:', playText.slice(0, 200))
  process.exit(1)
}

console.log('  code:', play.code, '| message:', play.message)
if (play.code !== 0) {
  console.log('  完整响应:', JSON.stringify(play).slice(0, 500))
  process.exit(1)
}

const p = play.data
console.log('  quality:', p.quality, '| format:', p.format)
console.log('  accept_quality:', (p.accept_quality ?? []).join(', '))
console.log('  accept_description:', (p.accept_description ?? []).join(', '))
console.log('  durl 段数:', p.durl?.length ?? 0)
if (p.durl?.length) {
  for (const [index, seg] of p.durl.entries()) {
    console.log(`    durl[${index}] 时长=${seg.length}ms 大小=${(seg.size / 1024 / 1024).toFixed(1)}MB order=${seg.order}`)
    console.log('      url:', seg.url)
    if (seg.backup_url?.length) console.log('      backup:', seg.backup_url[0])
  }
}
console.log('  dash:', p.dash ? '有' : '无')
if (p.dash) {
  console.log('    duration:', p.dash.duration, '| minBufferTime:', p.dash.minBufferTime)
  for (const key of ['video', 'audio']) {
    const list = p.dash[key] ?? []
    console.log(`    ${key} 条数: ${list.length}`)
    for (const [index, item] of list.entries()) {
      const label = key === 'video' ? `${item.width}x${item.height} id=${item.id} codecs=${item.codecs}` : `id=${item.id} codecs=${item.codecs}`
      console.log(`      ${key}[${index}] ${label}`)
      console.log(`         baseUrl: ${String(item.baseUrl).slice(0, 120)}`)
    }
  }
  console.log('    含 watermark 字段:', JSON.stringify(p.dash).includes('watermark'))
}
