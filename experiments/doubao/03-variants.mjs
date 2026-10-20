// 探针 3：打印完整 URL 模板 + 下载各变体做字节级对比（是否真的无水印）
import { writeFile, mkdir } from 'node:fs/promises'

const URL_ = 'https://www.doubao.com/thread/xTOlFYCgraKkBExtJ'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const html = await (await fetch(URL_, {
  headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' },
  signal: AbortSignal.timeout(20000)
})).text()

const decode = s => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const safeParse = (t) => { try { return JSON.parse(t) } catch { return undefined } }

function readFnArgs(h) {
  const out = []
  const marker = 'data-fn-args='
  let i = h.indexOf(marker)
  while (i !== -1) {
    const c = i + marker.length
    const q = h[c]
    if (q === '"' || q === "'") {
      const s = c + 1
      const e = h.indexOf(q, s)
      if (e !== -1) { out.push(h.slice(s, e)); i = h.indexOf(marker, e); continue }
    }
    i = h.indexOf(marker, c)
  }
  return out
}

function readLiteral(h, marker) {
  const s = h.indexOf(marker)
  if (s === -1) return null
  const b = s + marker.length
  if (h[b] !== '{') return null
  let d = 0, str = false, esc = false, q = ''
  for (let i = b; i < h.length; i++) {
    const ch = h[i]
    if (str) {
      if (esc) { esc = false; continue }
      if (ch === String.fromCharCode(92)) { esc = true; continue }
      if (ch === q) str = false
      continue
    }
    if (ch === '"' || ch === "'") { str = true; q = ch; continue }
    if (ch === '{') d++
    else if (ch === '}') { d--; if (d === 0) return h.slice(b, i + 1) }
  }
  return null
}

const tryJson = (v) => {
  const t = v.trim()
  if (t.length < 2) return undefined
  const a = t[0], b = t.at(-1)
  return ((a === '{' && b === '}') || (a === '[' && b === ']')) ? safeParse(t) : undefined
}

function walk(node, visit, depth = 0) {
  if (depth > 18 || node == null) return
  if (typeof node === 'string') { const n = tryJson(node); if (n !== undefined) walk(n, visit, depth + 1); return }
  if (typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(x => walk(x, visit, depth + 1)); return }
  visit(node)
  Object.values(node).forEach(x => walk(x, visit, depth + 1))
}

const payloads = []
for (const raw of readFnArgs(html)) { const p = safeParse(decode(raw)); if (p !== undefined) payloads.push(p) }
const lit = readLiteral(html, '_ROUTER_DATA = ')
if (lit) { const p = safeParse(lit); if (p !== undefined) payloads.push(p) }

const isImg = v => v && typeof v === 'object' && !Array.isArray(v) && typeof v.key === 'string' && v.key
  && (v.image_ori_raw?.url || v.image_ori?.url || v.image_preview?.url || v.image_thumb?.url)

const imgs = []
for (const p of payloads) {
  walk(p, (node) => {
    if (isImg(node.image)) imgs.push(node.image)
    else if (isImg(node)) imgs.push(node)
  })
}
const uniq = []
const seen = new Set()
for (const it of imgs) { if (!seen.has(it.key)) { seen.add(it.key); uniq.push(it) } }

const first = uniq[0]
console.log('unique images:', uniq.length)
console.log('key:', first.key)
for (const f of ['image_ori_raw', 'image_ori', 'image_preview', 'image_thumb']) {
  const v = first[f]
  if (!v?.url) continue
  console.log(`\n[${f}] ${v.width}x${v.height}  size=${v.size ?? '-'}`)
  console.log(v.url)
}

// 逐变体下载，记录 content-type / 字节数 / 真实格式
await mkdir('experiments/doubao/out', { recursive: true })
for (const f of ['image_ori_raw', 'image_ori', 'image_preview', 'image_thumb']) {
  const v = first[f]
  if (!v?.url) continue
  const r = await fetch(v.url, { headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' }, signal: AbortSignal.timeout(30000) })
  const buf = Buffer.from(await r.arrayBuffer())
  const magic = buf.subarray(0, 4).toString('hex')
  const isJpeg = magic.startsWith('ffd8')
  const isPng = magic === '89504e47'
  const name = `experiments/doubao/out/${f}.${isJpeg ? 'jpg' : isPng ? 'png' : 'bin'}`
  await writeFile(name, buf)
  console.log(`\nGET ${f}: HTTP ${r.status} ${r.headers.get('content-type')} ${buf.length}B magic=${magic} -> ${name}`)
}
