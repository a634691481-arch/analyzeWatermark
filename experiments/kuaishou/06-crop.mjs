/**
 * 快手探针 6：判定左上那条是不是「文字/logo 叠加层」
 *  - 直方图是否双峰（文字=背景+白色字形两色）
 *  - 裁出图片存盘，供人工确认
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_media/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const VIDEO = fileURLToPath(new URL('./mainMvUrls0.mp4', OUT))

/** 原始分辨率 1280x720，水印大概在顶部 x 0..460, y 0..90 */
const CROP = 'crop=460:90:0:0'

console.log('=== 裁出候选水印区（4 个时间点）===')
for (const t of [3, 15, 30, 48]) {
  const file = new URL(`./crop-tl-t${t}.png`, OUT)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', VIDEO, '-frames:v', '1', '-vf', `${CROP},scale=920:180:flags=neighbor`, fileURLToPath(file)])
  console.log(`  t=${t}s -> ${fileURLToPath(file)}`)
}
{
  const file = new URL('./full-frame-t15.png', OUT)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '15', '-i', VIDEO, '-frames:v', '1', fileURLToPath(file)])
  console.log(`  整帧参考 -> ${fileURLToPath(file)}`)
}

console.log('\n=== 灰度直方图（水印区 vs 对照区）===')
function histogram(label, crop, t = 15) {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-ss', String(t), '-i', VIDEO,
    '-frames:v', '1', '-vf', `${crop},format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'
  ], { maxBuffer: 32 * 1024 * 1024 })
  const bins = new Array(8).fill(0)
  for (const value of raw) bins[value >> 5]++
  const total = raw.length
  console.log(`  ${label}`)
  console.log(`    ${bins.map((count, index) => `${index * 32}-${index * 32 + 31}:${(count / total * 100).toFixed(0)}%`).join('  ')}`)
  // 简单峰度判断：两端占比高 = 双峰
  const edges = (bins[0] + bins[1] + bins[6] + bins[7]) / total
  console.log(`    两端占比 ${(edges * 100).toFixed(1)}%  ${edges > 0.45 ? '→ 双峰，像文字/logo' : '→ 单峰，像自然画面'}`)
}

histogram('左上水印区 crop=460:90:0:0', 'crop=460:90:0:0')
histogram('对照：中间区 crop=460:90:410:315', 'crop=460:90:410:315')
histogram('对照：右下区 crop=460:90:820:630', 'crop=460:90:820:630')

console.log('\n=== 该区域的空间梯度（文字边缘密集）===')
for (const [label, crop] of [
  ['左上水印区', 'crop=460:90:0:0'],
  ['中间对照区', 'crop=460:90:410:315'],
  ['右下对照区', 'crop=460:90:820:630']
]) {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-ss', '15', '-i', VIDEO,
    '-frames:v', '1', '-vf', `${crop},format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'
  ], { maxBuffer: 32 * 1024 * 1024 })
  const width = 460
  let sum = 0
  let count = 0
  for (let y = 0; y < 90; y++) {
    for (let x = 0; x < width - 1; x++) {
      sum += Math.abs(raw[y * width + x] - raw[y * width + x + 1])
      count++
    }
  }
  console.log(`  ${label}  平均横向梯度=${(sum / count).toFixed(2)}`)
}
