/** 千问探针 7：遍历所有消息的 display_list，定位图片与视频的全部地址变体 */
import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('./_share-info.pretty.json', import.meta.url), 'utf8'))
const records = data.session.record_list

console.log(`record_list 共 ${records.length} 轮对话\n`)

function walkDisplayLists(node, path, out, depth = 0) {
  if (depth > 16 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkDisplayLists(item, `${path}[${index}]`, out, depth + 1))
    return
  }
  if (Array.isArray(node.display_list)) {
    node.display_list.forEach((item, index) => out.push({ path: `${path}.display_list[${index}]`, item }))
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'display_list') continue
    walkDisplayLists(value, `${path}.${key}`, out, depth + 1)
  }
}

const entries = []
walkDisplayLists(data, 'data', entries)
console.log(`display_list 条目共 ${entries.length}\n`)

for (const [index, entry] of entries.entries()) {
  const item = entry.item ?? {}
  console.log(`${'='.repeat(72)}`)
  console.log(`[${index}] type=${item.type}  path=${entry.path.replace('data.session.', '')}`)
  console.log('   字段:', Object.keys(item).join(', '))

  for (const [field, value] of Object.entries(item)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
      console.log(`   ${field}:`)
      value.forEach((media, mediaIndex) => {
        const parts = []
        for (const key of ['url', 'cdn_url', 'download_url', 'preview_url', 'thumbnail_url', 'oss_url', 'id', 'width', 'height', 'duration', 'size', 'format']) {
          if (media[key] !== undefined && media[key] !== null && media[key] !== '') parts.push(`${key}=${String(media[key]).slice(0, 105)}`)
        }
        console.log(`     [${mediaIndex}] ${parts.join('\n           ')}`)
      })
    }
    else if (typeof value === 'string' && value.length) {
      console.log(`   ${field}: ${value.slice(0, 150)}`)
    }
  }
}

console.log(`\n\n${'='.repeat(72)}`)
console.log('全文搜索 .mp4 出现的位置')
console.log('='.repeat(72))
const raw = JSON.stringify(data)
let index = -1
let count = 0
while ((index = raw.indexOf('.mp4', index + 1)) !== -1 && count < 6) {
  count++
  console.log(`\n@${index}:`)
  console.log(JSON.stringify(raw.slice(Math.max(0, index - 320), index + 60)))
}
if (!count) console.log('(全文没有 .mp4)')
