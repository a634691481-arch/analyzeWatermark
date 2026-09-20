/** 探针 5：拆解 videoInfoRes，找出无水印地址 */
import { readFileSync, writeFileSync } from 'node:fs'

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

const html = readFileSync(new URL('./_page-share-full.html', import.meta.url), 'utf8')
const data = JSON.parse(readObjectLiteral(html, '_ROUTER_DATA = '))
const page = data.loaderData['video_(id)/page']
const info = page.videoInfoRes
writeFileSync(new URL('./_video-info-res.json', import.meta.url), JSON.stringify(info, null, 2))

console.log('videoInfoRes keys:', Object.keys(info))
console.log('status_code:', info.status_code, '| filter_detail:', info.filter_detail)
console.log('item_list length:', info.item_list?.length)

const item = info.item_list?.[0]
if (!item) {
  console.log('没有 item_list[0]')
  process.exit(0)
}

console.log('\n=== item 顶层字段 ===')
console.log(Object.keys(item).join(', '))
console.log('\naweme_id:', item.aweme_id)
console.log('desc:', item.desc)
console.log('create_time:', item.create_time)
console.log('作者:', item.author?.nickname, '| uid:', item.author?.uid, '| sec_uid:', item.author?.sec_uid)
console.log('is_image_post(图集):', Boolean(item.images))

console.log('\n=== video 字段 ===')
if (item.video) {
  console.log('video keys:', Object.keys(item.video))
  for (const key of ['play_addr', 'play_addr_h264', 'play_addr_265', 'download_addr', 'play_addr_lowbr', 'bit_rate', 'cover', 'origin_cover', 'dynamic_cover', 'duration', 'ratio']) {
    const value = item.video[key]
    if (!value) continue
    const summary = Array.isArray(value)
      ? `array(${value.length})`
      : (value.url_list ? value.url_list.join('\n      ') : JSON.stringify(value).slice(0, 120))
    console.log(`\n  ${key}: ${summary}`)
    if (value.width) console.log(`    size: ${value.width}x${value.height}`)
    if (value.data_size) console.log(`    data_size: ${value.data_size}`)
    if (value.uri) console.log(`    uri: ${value.uri}`)
  }
}

console.log('\n=== images (图集) ===')
if (item.images?.length) {
  item.images.slice(0, 3).forEach((image, index) => {
    console.log(`  #${index} url_list:`, image.url_list)
    if (image.download_url_list) console.log(`     download_url_list:`, image.download_url_list)
  })
}

/** 在整条数据里搜所有 URL，标出水印相关关键字 */
console.log('\n=== 所有 URL 及水印关键字命中 ===')
const urls = new Set()
const collect = (node) => {
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node)) urls.add(node)
    return
  }
  if (node && typeof node === 'object') Object.values(node).forEach(collect)
}
collect(item)
for (const url of urls) {
  const flags = []
  if (/playwm/.test(url)) flags.push('PLAYWM')
  if (/\/play\//.test(url)) flags.push('PLAY')
  if (/watermark/.test(url)) flags.push('WATERMARK')
  if (/download/.test(url)) flags.push('DOWNLOAD')
  if (/ratio/.test(url)) flags.push('has-ratio')
  console.log(' ', flags.length ? `[${flags.join(',')}]` : '[     ]', url.slice(0, 150))
}
