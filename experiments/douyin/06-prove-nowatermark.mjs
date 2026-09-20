/**
 * 探针 6：证明 playwm -> play 是否真的去掉水印
 *
 * 做法：两个地址各下载一份 -> 抽同一时间点的帧 -> 输出 raw RGB -> 逐像素比对
 * 水印是叠加层，去水印版的差异应该只集中在局部区域。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const VIDEO_ID = 'v0200fg10000damg43nog65nt2g9f65g'
const PLAYWM = `https://aweme.snssdk.com/aweme/v1/playwm/?video_id=${VIDEO_ID}&ratio=720p&line=0`
const PLAY = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${VIDEO_ID}&ratio=720p&line=0`

const OUT = new URL('./_artifacts/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'referer': 'https://www.douyin.com/'
}

async function download(label, url) {
  console.log(`\n=== 下载 ${label} ===`)
  console.log(url)
  const response = await fetch(url, { headers: HEADERS, redirect: 'follow' })
  console.log('status:', response.status)
  console.log('content-type:', response.headers.get('content-type'))
  console.log('content-length:', response.headers.get('content-length'))
  console.log('final url:', response.url)
  const buffer = Buffer.from(await response.arrayBuffer())
  const file = new URL(`./${label}.mp4`, OUT)
  writeFileSync(file, buffer)
  console.log('bytes:', buffer.length)
  console.log('sha256:', createHash('sha256').update(buffer).digest('hex'))
  console.log('前 12 字节:', buffer.subarray(0, 12).toString('hex'))
  return { file, buffer }
}

const wm = await download('playwm', PLAYWM)
const clean = await download('play', PLAY)

console.log('\n=== 文件级对比 ===')
console.log('大小相同:', wm.buffer.length === clean.buffer.length)
console.log('内容相同:', wm.buffer.equals(clean.buffer))

/** 用 ffmpeg 抽帧成 raw RGB24，再逐像素比对 */
function probeFrame(fileUrl, seconds, width, height) {
  return execFileSync('ffmpeg', [
    '-v', 'error',
    '-ss', String(seconds),
    '-i', fileURLToPath(fileUrl),
    '-frames:v', '1',
    '-vf', `scale=${width}:${height}`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-'
  ], { maxBuffer: 64 * 1024 * 1024 })
}

function compareFrames(seconds) {
  const W = 270
  const H = 480
  const a = probeFrame(wm.file, seconds, W, H)
  const b = probeFrame(clean.file, seconds, W, H)
  const total = Math.min(a.length, b.length) / 3
  let diffPixels = 0
  let bigDiffPixels = 0
  let maxDelta = 0
  let sumDelta = 0
  for (let i = 0; i + 2 < Math.min(a.length, b.length); i += 3) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    if (d > 0) diffPixels++
    if (d > 45) bigDiffPixels++
    if (d > maxDelta) maxDelta = d
    sumDelta += d
  }
  return {
    seconds,
    pixels: total,
    anyDiffPct: +(diffPixels / total * 100).toFixed(3),
    strongDiffPct: +(bigDiffPixels / total * 100).toFixed(3),
    avgDelta: +(sumDelta / total).toFixed(3),
    maxDelta
  }
}

console.log('\n=== 逐帧像素比对（playwm vs play）===')
for (const seconds of [0.5, 2, 5, 9]) {
  try {
    console.log(compareFrames(seconds))
  }
  catch (error) {
    console.log(seconds, '失败:', String(error).slice(0, 160))
  }
}

/** 把某时刻的差异区域定位出来，用于确认差异是不是「角落的水印」 */
function diffRegion(seconds) {
  const W = 360
  const H = 640
  const a = probeFrame(wm.file, seconds, W, H)
  const b = probeFrame(clean.file, seconds, W, H)
  const rows = []
  for (let y = 0; y < H; y++) {
    let count = 0
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      if (d > 45) count++
    }
    rows.push(count)
  }
  const bandSize = 40
  const bands = []
  for (let y = 0; y < H; y += bandSize) {
    const sum = rows.slice(y, y + bandSize).reduce((acc, v) => acc + v, 0)
    bands.push({ band: `${y}-${y + bandSize}`, diffPixels: sum, pctOfBand: +(sum / (bandSize * W) * 100).toFixed(2) })
  }
  return bands.filter(b => b.diffPixels > 0)
}

console.log('\n=== 差异在画面的哪个纵向区域（360x640）===')
for (const seconds of [2, 5]) {
  try {
    console.log(`t=${seconds}s:`, JSON.stringify(diffRegion(seconds)))
  }
  catch (error) {
    console.log(seconds, '失败:', String(error).slice(0, 160))
  }
}

// 用 ffmpeg 的 SSIM 做交叉验证
console.log('\n=== ffmpeg SSIM 交叉验证 ===')
try {
  const ssim = execFileSync('ffmpeg', [
    '-v', 'error',
    '-i', fileURLToPath(wm.file),
    '-i', fileURLToPath(clean.file),
    '-lavfi', 'ssim=stats_file=-',
    '-f', 'null', '-'
  ], { maxBuffer: 32 * 1024 * 1024 }).toString()
  const lines = ssim.trim().split('\n')
  console.log('SSIM 行数:', lines.length)
  console.log('最后一行:', lines[lines.length - 1])
}
catch (error) {
  console.log('SSIM 失败:', String(error).slice(0, 200))
}
