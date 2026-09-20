/**
 * 小红书探针 10：判定 h5_* 与 nd_* 谁多了白色叠加层（水印）
 *
 * 思路：水印是半透明白色叠加 → 有它的一方在差异区域整体更亮。
 * 计算带符号亮度差（X - 参照），若 X 明显偏亮则 X 带水印。
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DIR = new URL('./_wm/', import.meta.url)
const file = name => fileURLToPath(new URL(`./${name}.bin`, DIR))

const W = 540
const H = 720

function toRaw(name) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-i', file(name),
    '-vf', `scale=${W}:${H}`,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
  ], { maxBuffer: 128 * 1024 * 1024 })
}

/** 带符号差异分析：正数表示 a 比 b 亮 */
function signedDiff(aName, bName) {
  const a = toRaw(aName)
  const b = toRaw(bName)

  let sumSigned = 0
  let sumAbs = 0
  let aBrighter = 0
  let bBrighter = 0
  const rows = new Array(H).fill(0)
  const cols = new Array(W).fill(0)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const da = (a[i] - b[i]) + (a[i + 1] - b[i + 1]) + (a[i + 2] - b[i + 2])
      sumSigned += da
      sumAbs += Math.abs(da)
      if (da > 90) { aBrighter++; rows[y]++; cols[x]++ }
      else if (da < -90) bBrighter++
    }
  }

  const total = W * H
  const bandSize = 36
  const bands = []
  for (let y = 0; y < H; y += bandSize) {
    const sum = rows.slice(y, y + bandSize).reduce((acc, v) => acc + v, 0)
    const pct = +(sum / (bandSize * W) * 100).toFixed(2)
    if (pct > 0.3) bands.push(`y${y}-${y + bandSize}:${pct}%`)
  }

  return {
    'A更亮像素': aBrighter,
    'B更亮像素': bBrighter,
    'A更亮占比': +(aBrighter / total * 100).toFixed(3) + '%',
    'B更亮占比': +(bBrighter / total * 100).toFixed(3) + '%',
    '平均带符号差(A-B)': +(sumSigned / total).toFixed(2),
    '平均绝对差': +(sumAbs / total).toFixed(2),
    'A更亮集中条带': bands
  }
}

console.log('=== h5_1080jpg  vs  nd_wlteh_jpg ===')
console.log(JSON.stringify(signedDiff('h5_1080jpg', 'nd_wlteh_jpg'), null, 2))

console.log('\n=== nd_wlteh_jpg vs h5_1080jpg（反向，验证对称）===')
const rev = signedDiff('nd_wlteh_jpg', 'h5_1080jpg')
console.log(JSON.stringify({ 'A更亮占比': rev['A更亮占比'], 'B更亮占比': rev['B更亮占比'], '平均带符号差(A-B)': rev['平均带符号差(A-B)'] }, null, 2))

console.log('\n=== h5prv_style vs nd_wlteh_jpg（缩略图是否也带水印）===')
console.log(JSON.stringify(signedDiff('h5prv_style', 'nd_wlteh_jpg'), null, 2))

console.log('\n=== 差异区域到底是「文字」还是「压缩噪点」 ===')
/** 文字：细笔画 → 高频；噪点：孤立点。用行方向连续性区分 */
function textureProfile(aName, bName) {
  const a = toRaw(aName)
  const b = toRaw(bName)
  const rowRuns = []
  for (let y = 0; y < H; y++) {
    let runs = 0
    let inRun = false
    let runLen = 0
    const lengths = []
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      const on = d > 90
      if (on) { if (!inRun) { inRun = true; runs++; runLen = 1 } else runLen++ }
      else if (inRun) { inRun = false; lengths.push(runLen) }
    }
    if (inRun) lengths.push(runLen)
    if (runs > 0) rowRuns.push({ y, runs, maxRun: Math.max(...lengths), avgRun: +(lengths.reduce((s, v) => s + v, 0) / lengths.length).toFixed(1) })
  }
  const withDiff = rowRuns.length
  const avgRuns = rowRuns.length ? +(rowRuns.reduce((s, r) => s + r.runs, 0) / rowRuns.length).toFixed(1) : 0
  const maxRun = rowRuns.length ? Math.max(...rowRuns.map(r => r.maxRun)) : 0
  return {
    有差异的行数: withDiff,
    每行平均差异段数: avgRuns,
    最长连续差异像素: maxRun,
    差异段数区间: rowRuns.length ? `${Math.min(...rowRuns.map(r => r.runs))}~${Math.max(...rowRuns.map(r => r.runs))}` : '-',
    样例行: rowRuns.slice(0, 3)
  }
}
console.log('h5_1080jpg vs nd_wlteh_jpg:', JSON.stringify(textureProfile('h5_1080jpg', 'nd_wlteh_jpg'), null, 2))
