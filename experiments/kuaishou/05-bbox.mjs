/**
 * 快手探针 5：
 *  1) 定位左上的水印具体范围（细分块找稳定区边界）
 *  2) 确认是否从第一帧就在
 *  3) 对比各候选的码率/体积，判断该选哪条流
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_media/', import.meta.url)
const CANDIDATES = {
  mainMvUrls0_720p: fileURLToPath(new URL('./mainMvUrls0.mp4', OUT)),
  repr1_High: fileURLToPath(new URL('./repr1_High.mp4', OUT)),
  repr2_Ultra_1080p: fileURLToPath(new URL('./repr2_Ultra.mp4', OUT))
}

console.log('=== 各候选规格 ===')
for (const [name, file] of Object.entries(CANDIDATES)) {
  try {
    const spec = execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,bit_rate,codec_name',
      '-show_entries', 'format=duration,bit_rate,size',
      '-of', 'default=noprint_wrappers=1', file
    ]).toString().trim().replace(/\n/g, '  ')
    console.log(`  ${name.padEnd(20)} ${spec}`)
  }
  catch (error) {
    console.log(`  ${name.padEnd(20)} ffprobe 失败 ${String(error).slice(0, 60)}`)
  }
}

const W = 320
const H = 180
const TIMES = [3, 8, 13, 25, 33, 41, 47, 53]
function gray(file, seconds) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', file,
    '-frames:v', '1', '-vf', 'scale=320:180,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'
  ], { maxBuffer: 16 * 1024 * 1024 })
}

function regionCorrelation(frames, rx, ry, rw, rh) {
  const samples = []
  for (let y = ry; y < ry + rh; y += 2) {
    for (let x = rx; x < rx + rw; x += 2) samples.push(frames.map(f => f[y * W + x]))
  }
  const cors = []
  for (let a = 0; a < frames.length; a++) {
    for (let b = a + 1; b < frames.length; b++) {
      let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0
      for (const series of samples) {
        const va = series[a]; const vb = series[b]
        sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb
      }
      const n = samples.length
      const cov = sab / n - (sa / n) * (sb / n)
      const sdA = Math.sqrt(saa / n - (sa / n) ** 2)
      const sdB = Math.sqrt(sbb / n - (sb / n) ** 2)
      cors.push(sdA && sdB ? cov / (sdA * sdB) : 0)
    }
  }
  return cors.reduce((a, b) => a + b, 0) / cors.length
}

const frames = TIMES.map(t => gray(CANDIDATES.mainMvUrls0_720p, t))
console.log('\n=== 左上象限细分块（32x20 块）跨帧相关性 ===')
console.log('     x:   0    32   64   96  128  160')
for (let y = 0; y < 60; y += 20) {
  const row = []
  for (let x = 0; x < 192; x += 32) {
    row.push(regionCorrelation(frames, x, y, 32, 20).toFixed(2))
  }
  console.log(`  y=${String(y).padStart(3)}  ${row.map(v => v.padStart(5)).join('')}`)
}
console.log('  （相关性高 = 该块帧间几乎不变 = 固定叠加层所在）')

console.log('\n=== 水印是否从第一帧就有 ===')
for (const t of [0.2, 0.5, 1, 2, 60]) {
  try {
    const f = gray(CANDIDATES.mainMvUrls0_720p, t)
    // 只用左上角 110x40 采样
    const cors = []
    const base = frames[0]
    const samples = []
    for (let y = 0; y < 40; y += 2) for (let x = 0; x < 110; x += 2) samples.push([base[y * W + x], f[y * W + x]])
    let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0
    for (const [va, vb] of samples) { sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb }
    const n = samples.length
    const cov = sab / n - (sa / n) * (sb / n)
    const sdA = Math.sqrt(saa / n - (sa / n) ** 2)
    const sdB = Math.sqrt(sbb / n - (sb / n) ** 2)
    cors.push(sdA && sdB ? cov / (sdA * sdB) : 0)
    console.log(`  t=${String(t).padStart(4)}s  与 t=3s 的左上角相关性 = ${cors[0].toFixed(4)}`)
  }
  catch (error) {
    console.log(`  t=${t}s 失败 ${String(error).slice(0, 60)}`)
  }
}
