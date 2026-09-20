/**
 * 快手探针 4：定位烧录水印
 *
 * 原理：烧进画面的 logo 区域，帧与帧之间几乎完全一样；
 * 而画面内容区域帧间会变化。所以比较各候选区域的「跨帧相关性」。
 * 相关性接近 1 且梯度高 = 固定叠加的文字/logo。
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_media/', import.meta.url)
const FILES = {
  upic: fileURLToPath(new URL('./mainMvUrls0.mp4', OUT)),
  ultra: fileURLToPath(new URL('./repr2_Ultra.mp4', OUT))
}

const TIMES = [3, 8, 13, 25, 33, 41, 47, 53]

function gray(file, seconds) {
  // 输出灰度原始帧，缩小到 320x180
  return execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', file,
    '-frames:v', '1', '-vf', 'scale=320:180,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'
  ], { maxBuffer: 16 * 1024 * 1024 })
}

const W = 320
const H = 180

/** 区域：名字 -> [x, y, w, h] */
const REGIONS = {
  '左上': [0, 0, 110, 40],
  '右上': [W - 110, 0, 110, 40],
  '左下': [0, H - 40, 110, 40],
  '右下': [W - 110, H - 40, 110, 40],
  '底部中': [W / 2 - 55, H - 40, 110, 40],
  '中间': [W / 2 - 55, H / 2 - 20, 110, 40]
}

/** 区域内：跨帧相关性 + 平均空间梯度 */
function analyzeRegion(frames, [rx, ry, rw, rh]) {
  const samples = []
  for (let y = ry; y < ry + rh; y += 2) {
    for (let x = rx; x < rx + rw; x += 2) {
      samples.push(frames.map(f => f[y * W + x]))
    }
  }
  // 每两个时间点之间算区域相关系数，取平均
  const correlations = []
  for (let a = 0; a < frames.length; a++) {
    for (let b = a + 1; b < frames.length; b++) {
      let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0
      for (const series of samples) {
        const va = series[a]
        const vb = series[b]
        sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb
      }
      const n = samples.length
      const cov = sab / n - (sa / n) * (sb / n)
      const sdA = Math.sqrt(saa / n - (sa / n) ** 2)
      const sdB = Math.sqrt(sbb / n - (sb / n) ** 2)
      correlations.push(sdA && sdB ? cov / (sdA * sdB) : 0)
    }
  }
  const avgCorrelation = correlations.reduce((a, b) => a + b, 0) / correlations.length

  // 空间梯度（第一帧）
  let gradSum = 0
  let gradCount = 0
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw - 1; x++) {
      gradSum += Math.abs(frames[0][y * W + x] - frames[0][y * W + x + 1])
      gradCount++
    }
  }
  return { avgCorrelation, gradient: gradSum / gradCount }
}

for (const [label, file] of Object.entries(FILES)) {
  console.log(`\n=== ${label} ===`)
  const frames = TIMES.map(t => gray(file, t))
  // 全帧相关性作为对照组
  const whole = analyzeRegion(frames, [0, 0, W, H])
  console.log(`  全画面（对照）: 相关性=${whole.avgCorrelation.toFixed(4)} 梯度=${whole.gradient.toFixed(1)}`)
  const results = []
  for (const [name, rect] of Object.entries(REGIONS)) {
    const r = analyzeRegion(frames, rect)
    results.push({ name, ...r })
  }
  results.sort((a, b) => b.avgCorrelation - a.avgCorrelation)
  for (const r of results) {
    const flag = r.avgCorrelation > whole.avgCorrelation + 0.15 ? '  <<< 比全画面明显更稳定（疑似固定叠加）' : ''
    console.log(`  ${r.name.padEnd(6)} 相关性=${r.avgCorrelation.toFixed(4)} 梯度=${r.gradient.toFixed(1)}${flag}`)
  }
}
