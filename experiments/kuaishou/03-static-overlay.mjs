/**
 * 探针 3：静态叠加层检测
 *
 * 水印是烧进画面的固定图层：跨帧位置不变、像素几乎不随时间变化。
 * 所以取多个相隔很远的时刻（画面内容大幅变化），逐像素算 max-min：
 *   - 内容区：max-min 大
 *   - 水印区：max-min 很小（接近 0），且连成一片固定形状
 *
 * 输出：按网格统计「准静态」像素，定位水印所在的屏幕区域。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FFMPEG = 'C:/Users/63469/AppData/Local/Temp/opencode/ff2/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'
const OUT = new URL('./_artifacts/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const W = 320
const H = 180
const TIMES = [1, 7, 14, 21, 28, 35, 42, 49, 54]

function grabFrame(file, seconds) {
  return execFileSync(FFMPEG, [
    '-v', 'error',
    '-ss', String(seconds),
    '-i', fileURLToPath(file),
    '-frames:v', '1',
    '-vf', `scale=${W}:${H}`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-'
  ], { maxBuffer: 64 * 1024 * 1024 })
}

function analyze(name, file) {
  const frames = TIMES.map(t => grabFrame(file, t))
  const min = new Uint8Array(W * H * 3).fill(255)
  const max = new Uint8Array(W * H * 3).fill(0)
  for (const f of frames) {
    for (let i = 0; i < min.length; i++) {
      if (f[i] < min[i]) min[i] = f[i]
      if (f[i] > max[i]) max[i] = f[i]
    }
  }
  // 归一化亮度 max-min
  const luma = new Float32Array(W * H)
  for (let p = 0; p < W * H; p++) {
    const r = max[p * 3] - min[p * 3]
    const g = max[p * 3 + 1] - min[p * 3 + 1]
    const b = max[p * 3 + 2] - min[p * 3 + 2]
    luma[p] = (r + g + b) / 3
  }
  // 网格 16x9
  const GX = 16
  const GY = 9
  console.log(`\n=== ${name} (${W}x${H}) 网格 ${GX}x${GY} 平均 max-min ===`)
  const rows = []
  for (let gy = 0; gy < GY; gy++) {
    const row = []
    for (let gx = 0; gx < GX; gx++) {
      let sum = 0
      let n = 0
      for (let y = Math.floor(gy * H / GY); y < Math.floor((gy + 1) * H / GY); y++) {
        for (let x = Math.floor(gx * W / GX); x < Math.floor((gx + 1) * W / GX); x++) {
          sum += luma[y * W + x]
          n++
        }
      }
      row.push((sum / n).toFixed(1).padStart(6))
    }
    rows.push(row.join(' '))
  }
  console.log(rows.join('\n'))

  // 全图准静态像素比例
  let staticPixels = 0
  for (let p = 0; p < W * H; p++) if (luma[p] < 8) staticPixels++
  console.log(`静态像素(<8) 占比: ${(staticPixels / (W * H) * 100).toFixed(2)}%`)
}

for (const [name, path] of [
  ['main_b', new URL('./_artifacts/main_b.mp4', import.meta.url)],
  ['mz_v6ultra', new URL('./_artifacts/mz_v6ultra.mp4', import.meta.url)]
]) {
  if (!existsSync(path)) { console.log('missing', name); continue }
  analyze(name, path)
}
