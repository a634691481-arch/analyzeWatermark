/**
 * 小红书探针 11：对整篇笔记的每张图都验证「h5_* 有水印 / nd_* 没有」
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SHORT_URL = 'https://xhslink.cn/o/3iRd5juLzyP'
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const OUT = new URL('./_wm2/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

function readObjectLiteral(source, marker) {
  const start = source.indexOf(marker)
  if (start === -1) return null
  const begin = start + marker.length
  let depth = 0
  let inString = false
  let escaped = false
  let quote = ''
  for (let i = begin; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return source.slice(begin, i + 1) }
  }
  return null
}

// 取笔记数据
let current = SHORT_URL
for (let hop = 0; hop < 6; hop++) {
  const response = await fetch(current, { redirect: 'manual', headers: { 'user-agent': MOBILE_UA } })
  const location = response.headers.get('location')
  if (!location) break
  current = new URL(location, current).href
}
const html = await (await fetch(current, { headers: { 'user-agent': MOBILE_UA, referer: 'https://www.xiaohongshu.com/' } })).text()
const state = JSON.parse(readObjectLiteral(html, '__INITIAL_STATE__=').replace(/:\s*undefined(?=[,}])/g, ':null'))
const detail = state.noteData.data.noteData
const fileIds = detail.imageList.map(image => image.fileId)
console.log(`笔记「${detail.title}」共 ${fileIds.length} 张图\n`)

const W = 540
const H = 720
function toRaw(file, width = W, height = H) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(file), '-vf', `scale=${width}:${height}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 128 * 1024 * 1024 })
}

async function grab(name, url) {
  const response = await fetch(url, { headers: { 'user-agent': UA } })
  if (response.status !== 200) return null
  const file = new URL(`./${name}.bin`, OUT)
  writeFileSync(file, Buffer.from(await response.arrayBuffer()))
  return file
}

/** 返回 h5 相对 nd 的亮度差统计 */
function analyze(h5File, ndFile) {
  const a = toRaw(h5File)
  const b = toRaw(ndFile)
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
  let bandStart = -1
  const bands = []
  for (let y = 0; y <= H; y++) {
    const has = y < H && rows[y] > 0
    if (has && bandStart === -1) bandStart = y
    if (!has && bandStart !== -1) { bands.push(`${bandStart}-${y - 1}`); bandStart = -1 }
  }
  return { 'h5更亮': brighter, 'h5更暗': darker, '差异行区间': bands.join(',') || '-' }
}

for (const [index, fileId] of fileIds.entries()) {
  const h5 = await grab(`i${index}_h5`, `https://sns-img-bd.xhscdn.com/${fileId}!h5_1080jpg`)
  const nd = await grab(`i${index}_nd`, `https://sns-img-bd.xhscdn.com/${fileId}!nd_dft_wlteh_jpg_3`)
  if (!h5 || !nd) {
    console.log(`#${index + 1} 下载失败`)
    continue
  }
  const result = analyze(h5, nd)
  const verdict = result['h5更亮'] > 50 && result['h5更暗'] === 0
    ? 'h5 带白色水印 ✅ 结论一致'
    : (result['h5更亮'] < 50 && result['h5更暗'] < 50 ? '两族无差异' : '需人工确认')
  console.log(`#${index + 1} ${fileId.split('/').pop().slice(0, 14)}  ${JSON.stringify(result)}  -> ${verdict}`)
}

console.log('\n=== 各 nd_* 变体是否互相一致（确认 nd 族里没有带水印的成员）===')
const f0 = fileIds[0]
const variants = {
  nd_wlteh_jpg: `!nd_dft_wlteh_jpg_3`,
  nd_wgth_webp: `!nd_dft_wgth_webp_3`,
  nd_wlteh_webp: `!nd_dft_wlteh_webp_3`,
  nd_wgth_jpg: `!nd_dft_wgth_jpg_3`
}
const files = {}
for (const [name, suffix] of Object.entries(variants)) {
  files[name] = await grab(`v_${name}`, `https://sns-img-bd.xhscdn.com/${f0}${suffix}`)
}
const base = files.nd_wlteh_jpg
for (const [name, file] of Object.entries(files)) {
  if (!file) { console.log(`  ${name}: 下载失败`); continue }
  if (name === 'nd_wlteh_jpg') continue
  let brighter = 0
  let darker = 0
  const a = toRaw(file)
  const b = toRaw(base)
  for (let i = 0; i < a.length; i += 3) {
    const d = (a[i] - b[i]) + (a[i + 1] - b[i + 1]) + (a[i + 2] - b[i + 2])
    if (d > 90) brighter++
    else if (d < -90) darker++
  }
  console.log(`  ${name} vs nd_wlteh_jpg: 更亮 ${brighter} 更暗 ${darker} -> ${brighter < 50 && darker < 50 ? '一致（无水印差异）' : '有差异'}`)
}
