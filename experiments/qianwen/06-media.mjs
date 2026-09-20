/** 千问探针 6：定位媒体节点，对比「无水印 / 带水印」 */
import { readFileSync, writeFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('./_share-info.pretty.json', import.meta.url), 'utf8'))

/** 打印所有含指定字段的节点路径 + 内容 */
function findNodes(node, path, predicate, out, depth = 0) {
  if (depth > 16 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item, index) => findNodes(item, `${path}[${index}]`, predicate, out, depth + 1))
    return
  }
  if (predicate(node)) out.push({ path, node })
  for (const [key, value] of Object.entries(node)) {
    findNodes(value, `${path}.${key}`, predicate, out, depth + 1)
  }
}

/** 媒体节点：带 image / video 字段的 */
const mediaNodes = []
for (const key of ['watermark_image', 'result_images', 'result_videos', 'without_bgm_result_videos']) {
  const hits = []
  findNodes(data, 'data', node => key in node, hits)
  hooks: {
    if (!hits.length) break hooks
    console.log(`\n${'='.repeat(70)}`)
    console.log(`字段 \`${key}\` 命中 ${hits.length} 处`)
    console.log('='.repeat(70))
    mediaNodes.push({ key, hits })
  }
}

for (const { key, hits } of mediaNodes) {
  for (const [index, hit] of hits.slice(0, 3).entries()) {
    console.log(`\n--- ${key} [${index}] path=${hit.path} ---`)
    console.log(JSON.stringify(hit.node, null, 2).slice(0, 2600))
  }
}

console.log(`\n\n${'='.repeat(70)}`)
console.log('图片节点的 URL 变体对照')
console.log('='.repeat(70))
const imageHits = []
findNodes(data, 'data', node => 'watermark_image' in node || ('image' in node && node.image && typeof node.image === 'object'), imageHits)
console.log(`命中 ${imageHits.length} 处`)
for (const [index, hit] of imageHits.slice(0, 4).entries()) {
  console.log(`\n--- [${index}] path=${hit.path} ---`)
  const node = hit.node
  for (const field of ['image', 'watermark_image', 'origin_image', 'image_url', 'thumbnail', 'download_url', 'preview_url', 'cdn_url']) {
    if (!(field in node)) continue
    const value = node[field]
    if (typeof value === 'string') console.log(`  ${field}: ${value.slice(0, 150)}`)
    else if (Array.isArray(value)) console.log(`  ${field}[${value.length}]: ${JSON.stringify(value).slice(0, 200)}`)
    else if (value && typeof value === 'object') console.log(`  ${field}: ${JSON.stringify(value).slice(0, 260)}`)
  }
  for (const field of ['width', 'height', 'size', 'duration', 'image_num', 'video_seed']) {
    if (field in node) console.log(`  ${field}: ${node[field]}`)
  }
}

console.log(`\n\n${'='.repeat(70)}`)
console.log('视频节点的 URL 变体对照')
console.log('='.repeat(70))
const videoHits = []
findNodes(data, 'data', node => ('video' in node && typeof node.video === 'string') || 'download_video' in node || 'result_videos' in node, videoHits)
console.log(`命中 ${videoHits.length} 处`)
for (const [index, hit] of videoHits.slice(0, 4).entries()) {
  console.log(`\n--- [${index}] path=${hit.path} ---`)
  const node = hit.node
  for (const field of ['video', 'download_video', 'result_videos', 'without_bgm_result_videos', 'cover', 'thumbnail_url', 'audio', 'bgm_audios']) {
    if (!(field in node)) continue
    const value = node[field]
    if (typeof value === 'string') console.log(`  ${field}: ${value.slice(0, 160)}`)
    else console.log(`  ${field}: ${JSON.stringify(value).slice(0, 320)}`)
  }
  for (const field of ['duration', 'width', 'height', 'size', 'video_sound_switch', 'video_seed']) {
    if (field in node) console.log(`  ${field}: ${node[field]}`)
  }
}
