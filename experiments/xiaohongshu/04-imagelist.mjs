/** 小红书探针 4：imageList 的 URL 变体 + 水印字段排查 */
import { readFileSync, writeFileSync } from 'node:fs'

const state = JSON.parse(readFileSync(new URL('./_initial-state.json', import.meta.url), 'utf8'))
const detail = state.noteData.data.noteData

console.log('type:', detail.type, '| title:', detail.title)
console.log('imageList 数量:', detail.imageList.length)
console.log('有 video:', Boolean(detail.video))

writeFileSync(new URL('./_image-list.json', import.meta.url), JSON.stringify(detail.imageList, null, 2))

console.log('\n=== imageList[0] 完整结构 ===')
console.log(JSON.stringify(detail.imageList[0], null, 2).slice(0, 4000))

console.log('\n=== 每张图的 URL 字段概览 ===')
detail.imageList.forEach((image, index) => {
  const fields = Object.entries(image)
    .filter(([, value]) => typeof value === 'string' && /^https?:\/\//.test(value))
    .map(([key, value]) => `${key}=${String(value).slice(0, 100)}`)
  console.log(`\n#${index + 1} ${image.width}x${image.height}`)
  fields.forEach(line => console.log('   ', line))
  if (image.infoList?.length) {
    console.log('    infoList:')
    image.infoList.forEach((info, i) => console.log(`      [${i}] imageScene=${info.imageScene} url=${String(info.url).slice(0, 110)}`))
  }
})

console.log('\n=== 字段名全量扫描（找水印线索）===')
const raw = JSON.stringify(detail.imageList)
const fields = new Set()
for (const match of raw.matchAll(/"([a-zA-Z0-9_]*(?:watermark|trace|wm|origin)[a-zA-Z0-9_]*)"/gi)) fields.add(match[1])
console.log('字段:', [...fields].join(', ') || '(无)')

console.log('\n=== 所有 URL 的路径与参数差异（同一张图）===')
const first = detail.imageList[0]
const allUrls = new Set()
const collect = (node) => {
  if (typeof node === 'string') { if (/^https?:\/\//.test(node)) allUrls.add(node); return }
  if (node && typeof node === 'object') Object.values(node).forEach(collect)
}
collect(first)
for (const url of allUrls) {
  const parsed = new URL(url)
  console.log(`  host=${parsed.hostname}`)
  console.log(`    path=${parsed.pathname}`)
  const params = [...parsed.searchParams.entries()]
  if (params.length) console.log(`    params=${JSON.stringify(Object.fromEntries(params))}`)
}
