// 探针 11：打印完整 URL 参数，确认 lr=video_gen_watermark_dyn 的含义
const URL_ = process.argv[2] || 'https://www.doubao.com/thread/xStCBbPYakxvVBcLM'
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

const payloads = []
for (const raw of readFnArgs(html)) { const p = safeParse(decode(raw)); if (p !== undefined) payloads.push(p) }
const lit = readLiteral(html, '_ROUTER_DATA = ')
if (lit) { const p = safeParse(lit); if (p !== undefined) payloads.push(p) }

const seen = new Set()
const videos = []
function walk(node, depth = 0) {
  if (depth > 20 || node == null) return
  if (typeof node === 'string') { const n = safeParse(node); if (n !== undefined) walk(n, depth + 1); return }
  if (typeof node !== 'object' || seen.has(node)) return
  seen.add(node)
  if (Array.isArray(node)) { node.forEach(x => walk(x, depth + 1)); return }
  if (node.video && typeof node.video === 'object' && (node.video.vid || node.video.download_url)) videos.push(node.video)
  Object.values(node).forEach(x => walk(x, depth + 1))
}
payloads.forEach(p => walk(p))

const v = videos[0]
console.log('=== download_url 完整 ===')
console.log(v.download_url)

let model = v.video_model
if (typeof model === 'string') model = safeParse(model)
console.log('\n=== video_list ===')
for (const [name, item] of Object.entries(model?.video_list ?? {})) {
  if (!item || typeof item !== 'object') continue
  const raw = item.main_url
  const url = /^https?:\/\//.test(raw) ? raw : Buffer.from(raw, 'base64').toString('utf8')
  console.log(`\n[${name}] ${item.definition} ${item.codec_type} ${item.vwidth}x${item.vheight} ${item.size}B`)
  console.log(url)
  const parsed = new URL(url)
  console.log('query:', Object.fromEntries(parsed.searchParams))
}
