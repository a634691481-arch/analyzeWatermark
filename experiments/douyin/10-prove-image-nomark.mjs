/**
 * 探针 10：图文用例的决定性验证
 *  1. 解码 download_url_list 里的 base64 参数，证明它就是水印文字
 *  2. 下载 url_list / download_url_list 各一张，像素比对，定位差异区域
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = new URL('./_artifacts/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'referer': 'https://www.douyin.com/'
}

console.log('=== 1) 解码水印模板参数 ===')
const WATER_TEMPLATE_PARAM = '5oqW6Z-z5Y-377yaMTY2NjU3OTIz'
function base64UrlDecode(input) {
  const normal = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}
console.log('原始:', WATER_TEMPLATE_PARAM)
console.log('解码:', base64UrlDecode(WATER_TEMPLATE_PARAM))

const CLEAN_URL = 'https://p11-sign.douyinpic.com/tos-cn-i-0813c000-ce/oUaMvAAJREMoQBqcJoiCRiCAIPUMAE5Bxx56A~tplv-dy-lqen-new:1440:2560:q80.jpeg?lk3s=138a59ce&x-expires=1792476000&x-signature=c3hsDrtwwfwlfu%2FIh%2FOd2Kh6aR8%3D&from=327834062&s=PackSourceEnum_DOUYIN_REFLOW&se=false&sc=image&biz_tag=aweme_images&l=202609201432257E452FD207963E34713F'

const WATER_URL = 'https://p11-sign.douyinpic.com/tos-cn-i-0813c000-ce/oUaMvAAJREMoQBqcJoiCRiCAIPUMAE5Bxx56A~tplv-dy-lqen-new-water:1440:2560:5oqW6Z-z5Y-377yaMTY2NjU3OTIz:q80.webp?lk3s=138a59ce&x-expires=1792476000&x-signature=%2FXzF2dwXK52GsTS9vwWiQs7NwNQ%3D&sig=gLATrvOHTJm5FTp02vzMLqNa6lc%3D&from=327834062&s=PackSourceEnum_DOUYIN_REFLOW&se=false&sc=image&biz_tag=aweme_images&l=202609201432257E452FD207963E34713F'

async function download(label, url, extension) {
  const response = await fetch(url, { headers: HEADERS, redirect: 'follow' })
  const buffer = Buffer.from(await response.arrayBuffer())
  const file = new URL(`./image-${label}.${extension}`, OUT)
  writeFileSync(file, buffer)
  console.log(`\n${label}: HTTP ${response.status} | ${response.headers.get('content-type')} | ${buffer.length} bytes | sha256 ${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`)
  console.log('  文件:', fileURLToPath(file))
  return file
}

console.log('\n=== 2) 下载两种变体 ===')
const clean = await download('clean', CLEAN_URL, 'jpeg')
const water = await download('water', WATER_URL, 'webp')

console.log('\n=== 3) 尺寸与像素比对 ===')
function toRaw(fileUrl, width = 360, height = 640) {
  return execFileSync('ffmpeg', [
    '-v', 'error',
    '-i', fileURLToPath(fileUrl),
    '-vf', `scale=${width}:${height}`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-'
  ], { maxBuffer: 64 * 1024 * 1024 })
}

// 先看原始尺寸
for (const [label, file] of [['clean', clean], ['water', water]]) {
  const probe = execFileSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(file), '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] })
  void probe
}
try {
  const info = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fileURLToPath(clean)]).toString().trim()
  const info2 = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fileURLToPath(water)]).toString().trim()
  console.log('clean 尺寸:', info, '| water 尺寸:', info2)
}
catch (error) {
  console.log('ffprobe 尺寸读取失败:', String(error).slice(0, 120))
}

const W = 360
const H = 640
const a = toRaw(clean, W, H)
const b = toRaw(water, W, H)

let strong = 0
const rows = new Array(H).fill(0)
const cols = new Array(W).fill(0)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    if (d > 60) {
      strong++
      rows[y]++
      cols[x]++
    }
  }
}
console.log('\n强差异像素占比:', (strong / (W * H) * 100).toFixed(3) + '%')

const bandOf = (arr, size) => {
  const bands = []
  for (let i = 0; i < arr.length; i += size) {
    const sum = arr.slice(i, i + size).reduce((acc, v) => acc + v, 0)
    bands.push({ range: `${i}-${i + size}`, pct: +(sum / (size * (arr === rows ? W : H)) * 100).toFixed(2) })
  }
  return bands.filter(b => b.pct > 0.05)
}
console.log('\n差异所在纵向条带:', JSON.stringify(bandOf(rows, 40)))
console.log('\n差异所在横向条带:', JSON.stringify(bandOf(cols, 40)))

console.log('\n=== 4) 把差异区域裁出来存盘（人工可复核）===')
try {
  // 用 ffmpeg 做差异图并放大，方便人眼确认是不是水印文字
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    '-i', fileURLToPath(water),
    '-i', fileURLToPath(clean),
    '-filter_complex', '[0:v][1:v]blend=all_mode=difference,eq=contrast=6:brightness=0.1,scale=720:-1',
    fileURLToPath(new URL('./diff-image.png', OUT))
  ])
  console.log('差异图:', fileURLToPath(new URL('./diff-image.png', OUT)))
}
catch (error) {
  console.log('差异图生成失败:', String(error).slice(0, 200))
}
