/** 探针 11：视频 playwm / play 的真实分辨率与编码参数 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_artifacts/', import.meta.url)

for (const name of ['playwm', 'play']) {
  const file = fileURLToPath(new URL(`./${name}.mp4`, OUT))
  console.log(`\n=== ${name}.mp4 ===`)
  try {
    const probe = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,bit_rate,nb_frames,duration,codec_name,profile',
      '-of', 'default=noprint_wrappers=1',
      file
    ]).toString().trim()
    console.log(probe)
  }
  catch (error) {
    console.log('ffprobe 失败:', String(error).slice(0, 200))
  }
  try {
    const format = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,bit_rate,size', '-of', 'default=noprint_wrappers=1', file]).toString().trim()
    console.log(format)
  }
  catch {}
}

/** 按原始分辨率（不缩放）抽同一时刻的帧，比对差异分布 */
function frameRaw(fileUrl, seconds) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(seconds), '-i', fileURLToPath(fileUrl),
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ], { maxBuffer: 256 * 1024 * 1024 })
}

function dimensions(fileUrl) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fileURLToPath(fileUrl)]).toString().trim()
  const [width, height] = out.split(',').map(Number)
  return { width, height }
}

const dimA = dimensions(new URL('./playwm.mp4', OUT))
const dimB = dimensions(new URL('./play.mp4', OUT))
console.log('\n=== 分辨率对比 ===')
console.log('playwm:', dimA, '| play:', dimB, '| 相同:', dimA.width === dimB.width && dimA.height === dimB.height)

if (dimA.width === dimB.width && dimA.height === dimB.height) {
  const { width: W, height: H } = dimA
  console.log(`\n=== 原生分辨率 ${W}x${H} 逐帧差异（t=2s / t=5s）===`)
  for (const seconds of [2, 5]) {
    const a = frameRaw(new URL('./playwm.mp4', OUT), seconds)
    const b = frameRaw(new URL('./play.mp4', OUT), seconds)
    let strong = 0
    const rows = new Array(H).fill(0)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
        if (d > 90) { strong++; rows[y]++ }
      }
    }
    const bands = []
    const bandSize = Math.round(H / 16)
    for (let y = 0; y < H; y += bandSize) {
      const sum = rows.slice(y, y + bandSize).reduce((acc, v) => acc + v, 0)
      bands.push({ y: `${y}-${y + bandSize}`, pct: +(sum / (bandSize * W) * 100).toFixed(2) })
    }
    console.log(`t=${seconds}s 强差异 ${(strong / (W * H) * 100).toFixed(3)}%`)
    console.log('  条带分布:', JSON.stringify(bands.filter(b => b.pct > 0.1)))
  }
}
