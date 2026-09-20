/**
 * 快手探针 3：
 *  A. repr0(upic) vs repr2(Ultra) 沿时间轴扫描 —— 差异是「某段」还是「全片」
 *  B. 对 repr0 做分块时空分析 —— 找是否存在固定位置的静态叠加层（烧录水印）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_media/', import.meta.url)
const files = {
  upic: new URL('./mainMvUrls0.mp4', OUT),
  ultra: new URL('./repr2_Ultra.mp4', OUT),
  high: new URL('./repr1_High.mp4', OUT)
}
for (const [name, file] of Object.entries(files)) {
  if (!existsSync(file)) {
    console.log('缺少', name, fileURLToPath(file))
    process.exit(1)
  }
}

const W = 320
const H = 180
function frame(file, seconds) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', fileURLToPath(file),
    '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ], { maxBuffer: 32 * 1024 * 1024 })
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
  return { brighter, darker, bands: bands.join(',') || '-' }
}

console.log('=== A. upic vs Ultra 沿时间轴扫描（每 3 秒）===')
for (let t = 1; t <= 55; t += 3) {
  const result = signed(frame(files.upic, t), frame(files.ultra, t))
  const mark = result.brighter > 60 ? '  <<< 有差异' : ''
  console.log(`  t=${String(t).padStart(2)}s  ${JSON.stringify(result)}${mark}`)
}

console.log('\n=== A2. upic vs High 沿时间轴扫描（每 3 秒）===')
for (let t = 1; t <= 55; t += 3) {
  const result = signed(frame(files.upic, t), frame(files.high, t))
  const mark = result.brighter > 60 ? '  <<< 有差异' : ''
  console.log(`  t=${String(t).padStart(2)}s  ${JSON.stringify(result)}${mark}`)
}

console.log('\n=== B. upic 自身：分块时空分析（找静态叠加层）===')
// 抽 15 帧，对每个 40x30 块算「跨帧方差」与「帧内平均梯度」
const TIMES = [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54]
const frames = TIMES.map(t => frame(files.upic, t))

const BW = 40
const BH = 30
console.log('  块坐标(x,y)  跨帧方差   平均梯度   说明')
const rows = []
for (let by = 0; by + BH <= H; by += BH) {
  for (let bx = 0; bx + BW <= W; bx += BW) {
    // 跨帧方差（对每个像素求时间方差，再平均）
    let varSum = 0
    let gradSum = 0
    let count = 0
    for (let y = by; y < by + BH; y += 2) {
      for (let x = bx; x < bx + BW; x += 2) {
        const i = (y * W + x) * 3
        const series = frames.map(f => (f[i] + f[i + 1] + f[i + 2]) / 3)
        const mean = series.reduce((a, b) => a + b, 0) / series.length
        varSum += series.reduce((a, v) => a + (v - mean) ** 2, 0) / series.length
        // 空间梯度（用第一帧）
        const f0 = frames[0]
        const gx = Math.abs(f0[i] - f0[i + 3])
        const gy = Math.abs(f0[i] - f0[i + W * 3])
        gradSum += gx + gy
        count++
      }
    }
    rows.push({ bx, by, variance: varSum / count, gradient: gradSum / count })
  }
}
rows.sort((a, b) => a.variance - b.variance)
console.log('  方差最小的 8 个块（最像静态叠加层）：')
for (const row of rows.slice(0, 8)) {
  console.log(`    (${String(row.bx).padStart(3)},${String(row.by).padStart(3)})  var=${row.variance.toFixed(1).padStart(8)}  grad=${row.gradient.toFixed(1)}`)
}
console.log('  方差最大的 3 个块（画面运动区）：')
for (const row of rows.slice(-3)) {
  console.log(`    (${String(row.bx).padStart(3)},${String(row.by).padStart(3)})  var=${row.variance.toFixed(1).padStart(8)}  grad=${row.gradient.toFixed(1)}`)
}
