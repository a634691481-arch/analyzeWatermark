/** 探针 9：图文 16 张图的 URL 变体 + 水印字段排查 */
import { readFileSync, writeFileSync } from 'node:fs'

const page = JSON.parse(readFileSync(new URL('./_note-page.json', import.meta.url), 'utf8'))
const item = page.videoInfoRes.item_list[0]

console.log('aweme_type:', item.aweme_type, '| desc:', item.desc, '| images:', item.images.length)
console.log('image_infos:', JSON.stringify(item.image_infos).slice(0, 400))
console.log('img_bitrate:', JSON.stringify(item.img_bitrate).slice(0, 600))

console.log('\n=== images[0] 完整结构 ===')
writeFileSync(new URL('./_images-full.json', import.meta.url), JSON.stringify(item.images, null, 2))
const first = item.images[0]
console.log('keys:', Object.keys(first).join(', '))
console.log(JSON.stringify(first, null, 2).slice(0, 3000))

console.log('\n=== 每张图的 URL 数量与差异 ===')
for (const [index, image] of item.images.entries()) {
  const urls = image.url_list ?? []
  const downloads = image.download_url_list ?? []
  console.log(`#${String(index).padStart(2)} ${image.width}x${image.height} | url_list:${urls.length} download_url_list:${downloads.length}`)
  if (index < 3) {
    console.log('      url_list[0]     :', urls[0]?.slice(0, 150))
    console.log('      url_list[last]  :', urls[urls.length - 1]?.slice(0, 150))
    if (downloads.length) console.log('      download[0]     :', downloads[0]?.slice(0, 150))
  }
}

console.log('\n=== 水印相关字段名全量扫描 ===')
const raw = JSON.stringify(item)
const fields = new Set()
for (const match of raw.matchAll(/"([a-z0-9_]*(?:watermark|wm|logo)[a-z0-9_]*)"/gi)) fields.add(match[1])
console.log('字段:', [...fields].join(', ') || '(无)')

const params = new Set()
for (const match of raw.matchAll(/[?&]([a-z_]*watermark[a-z_]*)=([^&"]*)/gi)) params.add(`${match[1]}=${match[2]}`)
console.log('URL 参数:', [...params].join(', ') || '(无)')

console.log('\n=== url_list 里各域的分布（判断哪个是原图 CDN）===')
const hosts = new Map()
for (const image of item.images) {
  for (const url of image.url_list ?? []) {
    const host = new URL(url).hostname
    hosts.set(host, (hosts.get(host) ?? 0) + 1)
  }
}
console.log([...hosts.entries()].map(([h, c]) => `${h}: ${c}`).join('\n'))

console.log('\n=== 同一张图不同 CDN 的路径是否一致 ===')
const sample = item.images[0].url_list ?? []
sample.forEach((url, index) => {
  const parsed = new URL(url)
  console.log(`  [${index}] host=${parsed.hostname} path=${parsed.pathname}`)
  const interesting = [...parsed.searchParams.entries()].filter(([k]) => !['lk3s', 'x-expires', 'x-signature', 'from', 'sc', 'se', 's', 'biz_tag', 'l'].includes(k))
  if (interesting.length) console.log('        params:', JSON.stringify(Object.fromEntries(interesting)))
})
