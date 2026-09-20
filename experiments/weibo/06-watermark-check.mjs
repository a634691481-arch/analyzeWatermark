// 判断画面里有没有「服务端叠加的静态水印层」
// 做法：抽多帧 → 逐像素算时间方差 → 看四角有没有异常低方差的静态块
// 结论：微博这条流四个角都在动，没有静态叠加层 → 文件本身就是原片
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const W = 90
const H = 160
const file = fileURLToPath(new URL('./_media/720p.mp4', import.meta.url))

// 每 3 秒一帧，共 12 帧灰度像素
const raw = execFileSync('ffmpeg', [
  '-v', 'error', '-i', file,
  '-vf', `fps=1/3,scale=${W}:${H},format=gray`,
  '-f', 'rawvideo', '-'
], { maxBuffer: 64 * 1024 * 1024 })

const frameSize = W * H
const frames = raw.length / frameSize
const pixels = []
for (let f = 0; f < frames; f++) {
  pixels.push(raw.subarray(f * frameSize, (f + 1) * frameSize))
}

const mean = new Float64Array(frameSize)
const std = new Float64Array(frameSize)
for (let i = 0; i < frameSize; i++) {
  let sum = 0
  for (const px of pixels) sum += px[i]
  const m = sum / frames
  let acc = 0
  for (const px of pixels) acc += (px[i] - m) ** 2
  mean[i] = m
  std[i] = Math.sqrt(acc / frames)
}

console.log('frames:', frames)
console.log('global std avg:', (std.reduce((a, b) => a + b, 0) / frameSize).toFixed(2))

// 四角 20x30 区域的方差均值：水印层会让这里明显低于全图
const corners = {
  'top-left': [0, 0],
  'top-right': [W - 20, 0],
  'bottom-left': [0, H - 30],
  'bottom-right': [W - 20, H - 30]
}
for (const [name, [x0, y0]] of Object.entries(corners)) {
  let sum = 0
  let n = 0
  for (let y = y0; y < y0 + 30; y++) {
    for (let x = x0; x < x0 + 20; x++) { sum += std[y * W + x]; n++ }
  }
  console.log(`corner ${name}: std avg ${(sum / n).toFixed(2)}`)
}
