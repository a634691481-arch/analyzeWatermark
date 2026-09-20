/**
 * 小红书探针 9：到底哪个模板才是真正无水印的？
 *
 * 之前只验证了格式与尺寸，没验证水印 —— 这次补上。
 * 做法：同一个 fileId 拉多个模板，统一缩放到同尺寸后两两做像素差，
 * 差异集中在局部 → 该处就是叠加的水印层。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FILE_ID = 'note_pre_post_uhdr/1040g3r8325b1t5kt4q905na2gfhlg8e9cm7bn4o'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const OUT = new URL('./_wm/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const VARIANTS = [
  ['h5_1080jpg', `https://sns-img-bd.xhscdn.com/${FILE_ID}!h5_1080jpg`],
  ['h5_1080webp', `https://sns-img-bd.xhscdn.com/${FILE_ID}!h5_1080webp`],
  ['nd_wlteh_jpg', `https://sns-img-bd.xhscdn.com/${FILE_ID}!nd_dft_wlteh_jpg_3`],
  ['nd_wgth_webp', `https://sns-img-bd.xhscdn.com/${FILE_ID}!nd_dft_wgth_webp_3`],
  ['nd_wlteh_webp', `https://sns-img-bd.xhscdn.com/${FILE_ID}!nd_dft_wlteh_webp_3`],
  ['original', `https://sns-img-bd.xhscdn.com/${FILE_ID}`],
  ['h5prv_style', `https://sns-img-qc.xhscdn.com/${FILE_ID}!style_d4c824bab532bfe9`]
]

console.log('=== 下载各模板 ===')
const downloaded = []
for (const [name, url] of VARIANTS) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA } })
    if (response.status !== 200) {
      console.log(`  ${name.padEnd(14)} HTTP ${response.status}`)
      continue
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const file = new URL(`./${name}.bin`, OUT)
    writeFileSync(file, buffer)
    let size = '-'
    try {
      size = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'csv=p=0', fileURLToPath(file)]).toString().trim()
    }
    catch { size = '(解码失败)' }
    downloaded.push({ name, file, bytes: buffer.length })
    console.log(`  ${name.padEnd(14)} 200 ${(buffer.length / 1024).toFixed(0).padStart(5)}KB  ${size}`)
  }
  catch (error) {
    console.log(`  ${name.padEnd(14)} ERR ${String(error).slice(0, 50)}`)
  }
}

/** 抽帧成统一尺寸的 raw RGB */
function toRaw(file, width, height) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-i', fileURLToPath(file),
    '-vf', `scale=${width}:${height}`,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ], { maxBuffer: 64 * 1024 * 1024 })
}

const W = 270
const H = 360

/** 返回强差异像素占比 + 差异落在哪些纵向条带 */
function compare(a, b) {
  const ra = toRaw(a.file, W, H)
  const rb = toRaw(b.file, W, H)
  const rows = new Array(H).fill(0)
  let strong = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const d = Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2])
      if (d > 120) { strong++; rows[y]++ }
    }
  }
  const bandSize = 30
  const bands = []
  for (let y = 0; y < H; y += bandSize) {
    const sum = rows.slice(y, y + bandSize).reduce((acc, v) => acc + v, 0)
    const pct = +(sum / (bandSize * W) * 100).toFixed(2)
    if (pct > 0.2) bands.push(`y${y}-${y + bandSize}:${pct}%`)
  }
  return { strongPct: +(strong / (W * H) * 100).toFixed(3), bands }
}

console.log('\n=== 两两比对（强差异占比 & 集中在哪些纵向条带）===')
const decodable = downloaded.filter(item => {
  try { toRaw(item.file, 16, 16); return true }
  catch { return false }
})
for (let i = 0; i < decodable.length; i++) {
  for (let j = i + 1; j < decodable.length; j++) {
    try {
      const result = compare(decodable[i], decodable[j])
      const flag = result.strongPct > 0.05 ? '  <-- 有局部差异' : ''
      console.log(`  ${decodable[i].name.padEnd(14)} vs ${decodable[j].name.padEnd(14)} ${String(result.strongPct).padStart(6)}%  [${result.bands.join(' ')}]${flag}`)
    }
    catch (error) {
      console.log(`  ${decodable[i].name} vs ${decodable[j].name} 比对失败 ${String(error).slice(0, 60)}`)
    }
  }
}

console.log('\n=== 原图能否解码出真身（看 HEIC 里有几个流）===')
const original = downloaded.find(item => item.name === 'original')
if (original) {
  try {
    const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_name,width,height', '-of', 'csv=p=0', fileURLToPath(original.file)]).toString().trim()
    console.log('  流列表:', streams || '(无)')
  }
  catch (error) {
    console.log('  ffprobe 失败:', String(error).slice(0, 120))
  }
  console.log('  sha256:', createHash('sha256').update(Buffer.from('')).digest('hex').slice(0, 8))
}
