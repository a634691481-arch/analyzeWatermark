/**
 * 探针 7：图文（图集）帖子 —— 和视频帖子走同一套提取路径吗？
 *
 * 用例台账：
 *   [video] https://v.douyin.com/PJIP6J56t8Y/  -> aweme 7686802947086257408  单视频
 *   [image] https://v.douyin.com/lZGNcAGUqsY/  -> 待解析                    多图图文
 */
import { writeFileSync } from 'node:fs'

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const SHORT_URL = process.argv[2] || 'https://v.douyin.com/lZGNcAGUqsY/'

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

function cookieJar(response, jar = {}) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim()
  }
  return jar
}
const jarToString = jar => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

const jar = {}

/** 完整流程：短链 -> 分享页（带 ttwid）-> videoInfoRes */
async function resolve(shortUrl) {
  let current = shortUrl
  const chain = [current]
  for (let hop = 0; hop < 6; hop++) {
    const response = await fetch(current, { redirect: 'manual', headers: { 'user-agent': MOBILE_UA } })
    cookieJar(response, jar)
    const location = response.headers.get('location')
    if (!location) break
    current = new URL(location, current).href
    chain.push(current)
  }

  const shareRes = await fetch(current, {
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
  const html = await shareRes.text()
  const literal = readObjectLiteral(html, '_ROUTER_DATA = ')
  const data = literal ? JSON.parse(literal) : null
  return { chain, html, data }
}

console.log('=== 图文用例 ===')
console.log('short:', SHORT_URL)
const { chain, html, data } = await resolve(SHORT_URL)
console.log('跳转链:')
chain.forEach((url, index) => console.log(`  ${index}: ${url.slice(0, 130)}`))
writeFileSync(new URL('./_page-image-post.html', import.meta.url), html)

const page = data?.loaderData?.['video_(id)/page']
if (!page) {
  console.log('缺少 video_(id)/page，loaderData keys:', data ? Object.keys(data.loaderData) : 'null')
  process.exit(1)
}

const info = page.videoInfoRes
console.log('\nvideoInfoRes.status_code:', info?.status_code)
console.log('videoInfoRes keys:', info ? Object.keys(info) : null)
const item = info?.item_list?.[0]
if (!item) {
  console.log('没有 item_list[0]，全文:', JSON.stringify(info).slice(0, 500))
  process.exit(1)
}

writeFileSync(new URL('./_image-post-item.json', import.meta.url), JSON.stringify(item, null, 2))

console.log('\n=== item 概览 ===')
console.log('aweme_id:', item.aweme_id)
console.log('aweme_type:', item.aweme_type, '(68/150 = 图集)')
console.log('desc:', item.desc)
console.log('作者:', item.author?.nickname)
console.log('images 数量:', item.images?.length ?? 0)
console.log('image_infos 数量:', item.image_infos?.length ?? 0)
console.log('img_bitrate 数量:', item.img_bitrate?.length ?? 0)
console.log('有 video.play_addr:', Boolean(item.video?.play_addr))

console.log('\n=== images 明细 ===')
for (const [index, image] of (item.images ?? []).entries()) {
  console.log(`\n--- image #${index} ---`)
  console.log('keys:', Object.keys(image).join(', '))
  console.log('width/height:', image.width, image.height)
  console.log('url_list:')
  for (const url of image.url_list ?? []) console.log('   ', url.slice(0, 170))
  if (image.download_url_list?.length) {
    console.log('download_url_list:')
    for (const url of image.download_url_list) console.log('   ', url.slice(0, 170))
  }
  if (image.owner_watermark_image) {
    console.log('owner_watermark_image:', JSON.stringify(image.owner_watermark_image.url_list?.[0] || '').slice(0, 170))
  }
  if (image.user_watermark_image) {
    console.log('user_watermark_image:', JSON.stringify(image.user_watermark_image.url_list?.[0] || '').slice(0, 170))
  }
}

console.log('\n=== 从原始 JSON 里搜水印相关字段名 ===')
const raw = JSON.stringify(item)
const fieldHits = new Set()
for (const match of raw.matchAll(/"[a-z_]*(watermark|wm)[a-z_]*"/gi)) fieldHits.add(match[0])
console.log([...fieldHits].join(', ') || '(无)')

const paramHits = new Set()
for (const match of raw.matchAll(/watermark=\d/g)) paramHits.add(match[0])
console.log('URL 参数里的 watermark:', [...paramHits].join(', ') || '(无)')
