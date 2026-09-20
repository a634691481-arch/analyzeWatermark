/**
 * 千问探针 8：验证哪一份才是无水印
 *
 * 图片：display_list.image  vs  display_list.watermark_image
 * 视频：display_list.video  vs  display_list.download_video
 * 手法同抖音/小红书：带符号亮度差，只亮不暗 + 细笔划 = 白色叠加水印
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const data = JSON.parse(readFileSync(new URL('./_share-info.pretty.json', import.meta.url), 'utf8'))
const records = data.session.record_list

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const OUT = new URL('./_media/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

/** 收集 display_list 里的媒体 */
function collectDisplayLists(node, out, depth = 0) {
  if (depth > 16 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(item => collectDisplayLists(item, out, depth + 1)); return }
  if (Array.isArray(node.display_list)) out.push(...node.display_list)
  for (const value of Object.values(node)) collectDisplayLists(value, out, depth + 1)
}
const displayItems = []
collectDisplayLists(data, displayItems)

const imageItem = displayItems.find(item => item.type === 'generate_image')
const videoItem = displayItems.find(item => item.type === 'generate_video')

async function grab(name, url) {
  const response = await fetch(url, { headers: { 'user-agent': UA, 'referer': 'https://qianwen.my.cn/' } })
  if (response.status !== 200) {
    console.log(`  ${name}: HTTP ${response.status}`)
    return null
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const extension = /\.mp4/i.test(url) ? 'mp4' : 'png'
  const file = new URL(`./${name}.${extension}`, OUT)
  writeFileSync(file, buffer)
  console.log(`  ${name}: ${(buffer.length / 1024).toFixed(0)}KB -> ${fileURLToPath(file)}`)
  return file
}

console.log('=== 图片：image vs watermark_image ===')
const imgClean = await grab('img_image', imageItem.image[0].url)
const imgWm = await grab('img_watermark', imageItem.watermark_image[0].url)
const imgThumb = await grab('img_thumbnail', imageItem.thumbnail[0].url)

const extraImages = (() => {
  const out = []
  const walk = (node, depth) => {
    if (depth > 16 || !node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(v => walk(v, depth + 1)); return }
    if (Array.isArray(node.result_images) && node.result_images.length) out.push(...node.result_images)
    for (const v of Object.values(node)) walk(v, depth + 1)
  }
  walk(data, 0)
  return out
})()

console.log('\n=== 图片：result_images 里的各地址 ===')
const resultVariants = {}
if (extraImages[0]) {
  for (const field of ['url', 'cdn_url', 'download_url', 'preview_url', 'thumbnail_url']) {
    if (extraImages[0][field]) resultVariants[field] = await grab(`img_result_${field}`, extraImages[0][field])
  }
}

console.log('\n=== 视频：video vs download_video ===')
const vidClean = await grab('vid_video', videoItem.video[0].url)
const vidDownload = await grab('vid_download_video', videoItem.download_video[0].url)
const vidCover = await grab('vid_cover', videoItem.cover[0].url)

// ---------------------------------------------------------------- 比对

function imageRaw(file, width, height) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(file), '-vf', `scale=${width}:${height}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 128 * 1024 * 1024 })
}

/** 带符号亮度差：a 比 b 亮多少 */
function signedCompare(aBuf, bBuf, width, height) {
  let brighter = 0
  let darker = 0
  const rows = new Array(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const d = (aBuf[i] - bBuf[i]) + (aBuf[i + 1] - bBuf[i + 1]) + (aBuf[i + 2] - bBuf[i + 2])
      if (d > 90) { brighter++; rows[y]++ }
      else if (d < -90) darker++
    }
  }
  const bands = []
  let start = -1
  for (let y = 0; y <= height; y++) {
    const on = y < height && rows[y] > 0
    if (on && start === -1) start = y
    if (!on && start !== -1) { bands.push(`${start}-${y - 1}`); start = -1 }
  }
  return { 'A更亮': brighter, 'A更暗': darker, '差异行': bands.join(',') || '-' }
}

console.log('\n=== 图片像素对比（540x720）===')
if (imgClean && imgWm) {
  const W = 540
  const H = 720
  console.log('  watermark_image vs image :', JSON.stringify(signedCompare(imageRaw(imgWm, W, H), imageRaw(imgClean, W, H), W, H)))
}
if (imgClean && resultVariants.cdn_url) {
  const W = 540
  const H = 720
  console.log('  result.cdn_url vs image  :', JSON.stringify(signedCompare(imageRaw(resultVariants.cdn_url, W, H), imageRaw(imgClean, W, H), W, H)))
}
if (imgClean && resultVariants.download_url) {
  const W = 540
  const H = 720
  console.log('  result.download_url vs image :', JSON.stringify(signedCompare(imageRaw(resultVariants.download_url, W, H), imageRaw(imgClean, W, H), W, H)))
}
if (imgClean && imgThumb) {
  const W = 540
  const H = 720
  console.log('  thumbnail vs image       :', JSON.stringify(signedCompare(imageRaw(imgThumb, W, H), imageRaw(imgClean, W, H), W, H)))
}

console.log('\n=== 视频像素对比（时间轴对齐后）===')
function videoFrame(file, seconds, width, height) {
  return execFileSync('ffmpeg', ['-v', 'error', '-ss', String(seconds), '-i', fileURLToPath(file), '-frames:v', '1', '-vf', `scale=${width}:${height}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 })
}
function meanAbsDiff(a, b) {
  let sum = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n
}

if (vidClean && vidDownload) {
  const W = 216
  const H = 288
  // 找最佳对齐
  const ref = videoFrame(vidDownload, 2, W, H)
  const scores = []
  for (let offset = -2; offset <= 2; offset += 0.25) {
    if (2 + offset < 0) continue
    scores.push({ offset, score: +meanAbsDiff(ref, videoFrame(vidClean, 2 + offset, W, H)).toFixed(3) })
  }
  scores.sort((x, y) => x.score - y.score)
  const best = scores[0]
  console.log('  最佳对齐 offset:', best.offset, 's  (score', best.score + ')')
  console.log('  次优:', JSON.stringify(scores.slice(1, 3)))

  for (const t of [1, 2, 3, 4]) {
    const a = videoFrame(vidDownload, t, W, H)
    const b = videoFrame(vidClean, t + best.offset, W, H)
    console.log(`  t=${t}s  download_video - video :`, JSON.stringify(signedCompare(a, b, W, H)))
  }
}

console.log('\n=== 视频/图片文件规格 ===')
for (const [label, file] of [['image', imgClean], ['watermark', imgWm], ['video', vidClean], ['download_video', vidDownload], ['cover', vidCover]]) {
  if (!file) continue
  try {
    const info = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,duration', '-of', 'csv=p=0', fileURLToPath(file)]).toString().trim()
    console.log(`  ${label.padEnd(15)} ${info}`)
  }
  catch (error) {
    console.log(`  ${label.padEnd(15)} ffprobe 失败 ${String(error).slice(0, 60)}`)
  }
}
