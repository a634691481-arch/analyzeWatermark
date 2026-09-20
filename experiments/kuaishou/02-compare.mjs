/**
 * 快手探针 2：判定哪个候选流才是真的无水印
 *
 * 手法同其他平台：两份缩放到同尺寸做**带符号**亮度差。
 * 只亮不暗 + 差异集中在局部条带 = 白水印叠加层。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_media/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const photo = (() => {
  const state = JSON.parse(readFileSync(new URL('./_state.json', import.meta.url), 'utf8'))
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && value.photo?.mainMvUrls?.length) return value.photo
  }
  return null
})()
if (!photo) {
  console.log('没有 photo')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const reps = photo.manifest?.adaptationSet?.[0]?.representation ?? []
console.log('=== representation 属性 ===')
reps.forEach((rep, index) => {
  console.log(`  [${index}] ${rep.width}x${rep.height} bitrate=${rep.bitrate} qualityType=${rep.qualityType} qualityLabel=${rep.qualityLabel} id=${rep.id}`)
})

const CANDIDATES = [
  ['mainMvUrls0', photo.mainMvUrls?.[0]?.url],
  ['repr0_upic', reps[0]?.url],
  ['repr1_High', reps[1]?.url],
  ['repr2_Ultra', reps[2]?.url]
]

console.log('\n=== 下载各候选 ===')
const downloaded = []
for (const [name, url] of CANDIDATES) {
  if (!url) { console.log(`  ${name}: (无 url)`); continue }
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' })
    if (!response.ok) { console.log(`  ${name}: HTTP ${response.status}`); continue }
    const buffer = Buffer.from(await response.arrayBuffer())
    const file = new URL(`./${name}.mp4`, OUT)
    writeFileSync(file, buffer)
    let spec = '-'
    try {
      spec = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fileURLToPath(file)]).toString().trim()
    }
    catch {}
    console.log(`  ${name.padEnd(14)} ${(buffer.length / 1024 / 1024).toFixed(2)}MB  ${spec}`)
    downloaded.push({ name, file })
  }
  catch (error) {
    console.log(`  ${name.padEnd(14)} ERR ${String(error).slice(0, 70)}`)
  }
}

if (downloaded.length < 2) {
  console.log('\n可下载的候选不足 2 个，无法比对')
  process.exit(1)
}

const W = 320
const H = 180
function frame(file, seconds) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', fileURLToPath(file),
    '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ], { maxBuffer: 32 * 1024 * 1024 })
}
function meanAbsDiff(a, b) {
  let sum = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n
}
function signed(a, b) {
  let brighter = 0
  let darker = 0
  const rows = new Array(H).fill(0)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const d = (a[i] - b[i]) + (a[i + 1] - b[i + 1]) + (a[i + 2] - b[i + 2])
      if (d > 90) { brighter++; rows[y]++ }
      else if (d < -90) darker++
    }
  }
  const bands = []
  let start = -1
  for (let y = 0; y <= H; y++) {
    const on = y < H && rows[y] > 0
    if (on && start === -1) start = y
    if (!on && start !== -1) { bands.push(`${start}-${y - 1}`); start = -1 }
  }
  return { 更亮: brighter, 更暗: darker, 差异行: bands.join(',') || '-' }
}

console.log('\n=== 时间轴对齐检查（以 mainMvUrls0 为基准，t=10s）===')
const ref = frame(downloaded[0].file, 10)
for (const item of downloaded.slice(1)) {
  const scores = []
  for (let offset = -1; offset <= 1; offset += 0.25) {
    if (10 + offset < 0) continue
    scores.push({ offset, score: +meanAbsDiff(ref, frame(item.file, 10 + offset)).toFixed(2) })
  }
  scores.sort((a, b) => a.score - b.score)
  console.log(`  ${item.name.padEnd(14)} 最佳 offset=${scores[0].offset}s score=${scores[0].score}`)
}

console.log('\n=== 两两带符号亮度差（A - B）===')
for (let i = 0; i < downloaded.length; i++) {
  for (let j = i + 1; j < downloaded.length; j++) {
    const a = downloaded[i]
    const b = downloaded[j]
    for (const t of [5, 20, 45]) {
      const result = signed(frame(a.file, t), frame(b.file, t))
      const flag = result.更亮 > 60 && result.更暗 < 20 ? '  <-- A 多一层白水印' : ''
      console.log(`  t=${String(t).padStart(2)}s  ${a.name.padEnd(14)} - ${b.name.padEnd(14)} ${JSON.stringify(result)}${flag}`)
    }
  }
}
