/**
 * 探针 12：两条流差 3 秒，先做时间轴对齐（互相关扫描），再验证水印
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_artifacts/', import.meta.url)
const WM = new URL('./playwm.mp4', OUT)
const CLEAN = new URL('./play.mp4', OUT)

const W = 320
const H = 180

function frameRaw(fileUrl, seconds, width = W, height = H) {
  return execFileSync('ffmpeg', [
    '-v', 'error',
    '-ss', String(seconds),
    '-i', fileURLToPath(fileUrl),
    '-frames:v', '1',
    '-vf', `scale=${width}:${height}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ], { maxBuffer: 32 * 1024 * 1024 })
}

function meanAbsDiff(a, b) {
  let sum = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n
}

/** 以 clean 的 t0 为基准，在 playwm 上扫 offset，找最相似的位置 */
console.log('=== 时间轴对齐扫描（基准 clean t=10s）===')
const REF_T = 10
const ref = frameRaw(CLEAN, REF_T)

const scores = []
for (let offset = -5; offset <= 5; offset += 0.5) {
  const candidate = frameRaw(WM, REF_T + offset)
  const score = meanAbsDiff(ref, candidate)
  scores.push({ offset, score: +score.toFixed(3) })
}
scores.sort((x, y) => x.score - y.score)
console.log('最相似的 6 个 offset:')
scores.slice(0, 6).forEach(item => console.log(`  offset=${item.offset}s  meanAbsDiff=${item.score}`))
console.log('最差的 3 个:')
scores.slice(-3).forEach(item => console.log(`  offset=${item.offset}s  meanAbsDiff=${item.score}`))

const best = scores[0]
console.log(`\n>>> 最佳对齐：playwm 比 clean 晚/早 ${best.offset}s（meanAbsDiff=${best.score}）`)

/** 用多个基准点确认 offset 稳定 */
console.log('\n=== 多点交叉验证 offset 稳定性 ===')
for (const t of [5, 10, 15, 20, 25]) {
  const reference = frameRaw(CLEAN, t)
  const local = []
  for (let offset = best.offset - 1; offset <= best.offset + 1; offset += 0.25) {
    if (t + offset < 0) continue
    local.push({ offset, score: +meanAbsDiff(reference, frameRaw(WM, t + offset)).toFixed(3) })
  }
  local.sort((x, y) => x.score - y.score)
  console.log(`  clean t=${t}s -> 最佳 offset=${local[0].offset}s (score ${local[0].score})`)
}

/** 对齐后提交：水印差异应集中在局部 */
console.log('\n=== 对齐后逐帧差异（差异应集中在局部）===')
const bandSize = 15
for (const t of [5, 10, 15, 20, 25]) {
  const a = frameRaw(WM, t + best.offset, W, H)
  const b = frameRaw(CLEAN, t, W, H)
  const rows = new Array(H).fill(0)
  let strong = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      if (d > 120) { strong++; rows[y]++ }
    }
  }
  const bands = []
  for (let y = 0; y < H; y += bandSize) {
    const sum = rows.slice(y, y + bandSize).reduce((acc, v) => acc + v, 0)
    bands.push({ y, pct: +(sum / (bandSize * W) * 100).toFixed(2) })
  }
  console.log(`t=${t}s 强差异=${(strong / (W * H) * 100).toFixed(3)}%  条带:`, JSON.stringify(bands.filter(x => x.pct > 0.3)))
}

/** 生成对齐后的差异图，人工复核 */
try {
  execFileSync('ffmpeg', ['-v', 'error', '-y',
    '-ss', String(10 + best.offset), '-i', fileURLToPath(WM),
    '-ss', '10', '-i', fileURLToPath(CLEAN),
    '-filter_complex', '[0:v]scale=640:360[a];[1:v]scale=640:360[b];[a][b]blend=all_mode=difference,eq=contrast=8:brightness=0.05',
    '-frames:v', '1',
    fileURLToPath(new URL('./diff-aligned.png', OUT))
  ])
  console.log('\n对齐差异图:', fileURLToPath(new URL('./diff-aligned.png', OUT)))
}
catch (error) {
  console.log('差异图失败:', String(error).slice(0, 200))
}
