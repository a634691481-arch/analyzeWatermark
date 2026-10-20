// 探针 15：视频封面到底哪条可用（cover 短链 vs video_model.poster_url）
const PAGE = process.argv[2] || 'https://www.doubao.com/thread/x4WHzLzMwqewC6RNX'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const html = await (await fetch(PAGE, { headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' }, signal: AbortSignal.timeout(20000) })).text()
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
let video
function walk(node, depth = 0) {
  if (depth > 20 || node == null || video) return
  if (typeof node === 'string') { const n = safeParse(node); if (n !== undefined) walk(n, depth + 1); return }
  if (typeof node !== 'object' || seen.has(node)) return
  seen.add(node)
  if (Array.isArray(node)) { node.forEach(x => walk(x, depth + 1)); return }
  if (node.video && typeof node.video === 'object' && node.video.vid) { video = node.video; return }
  Object.values(node).forEach(x => walk(x, depth + 1))
}
payloads.forEach(p => walk(p))

const model = typeof video.video_model === 'string' ? safeParse(video.video_model) : video.video_model
const candidates = [
  ['cover.image_preview', video.cover?.image_preview?.url],
  ['cover.image_thumb', video.cover?.image_thumb?.url],
  ['video_model.poster_url', model?.poster_url]
]

for (const [name, url] of candidates) {
  if (!url) { console.log(`${name.padEnd(24)} (none)`); continue }
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' }, signal: AbortSignal.timeout(15000) })
    console.log(`${name.padEnd(24)} HTTP ${res.status} ${res.headers.get('content-type')} ${res.headers.get('content-length')}B`)
    console.log('  ', url)
  }
  catch (error) {
    console.log(`${name.padEnd(24)} ERROR ${error.message}`)
  }
}
