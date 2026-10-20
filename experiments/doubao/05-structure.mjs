// 探针 5：看 SSR 里到底装了几条消息、几轮图片，确认 3 张是否完整
const URL_ = 'https://www.doubao.com/thread/xTOlFYCgraKkBExtJ'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const html = await (await fetch(URL_, { headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' }, signal: AbortSignal.timeout(20000) })).text()

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

function walk(node, path, visit, depth = 0) {
  if (depth > 18 || node == null) return
  if (typeof node === 'string') { const n = tryJson(node); if (n !== undefined) walk(n, path + '[json]', visit, depth + 1); return }
  if (typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((x, i) => walk(x, `${path}[${i}]`, visit, depth + 1)); return }
  visit(node, path)
  for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, visit, depth + 1)
}

const payloads = []
for (const raw of readFnArgs(html)) { const p = safeParse(decode(raw)); if (p !== undefined) payloads.push(p) }
const lit = readLiteral(html, '_ROUTER_DATA = ')
if (lit) { const p = safeParse(lit); if (p !== undefined) payloads.push(p) }

console.log('payloads:', payloads.length)
payloads.forEach((p, i) => {
  console.log(`\n=== payload ${i} top keys ===`)
  console.log(Object.keys(p).slice(0, 30))
})

// 找消息数组
const hits = []
for (const p of payloads) {
  walk(p, '', (node, path) => {
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && ('role' in x || 'content' in x || 'message_id' in x))) {
        hits.push({ path: `${path}.${k}`, len: v.length, sample: Object.keys(v[0]).slice(0, 12) })
      }
    }
  })
}
console.log('\n=== message-like arrays ===')
for (const h of hits.slice(0, 12)) console.log(h.len, h.path.slice(0, 120), h.sample)

// 统计图片出现位置
const imgs = new Map()
const isImg = v => v && typeof v === 'object' && !Array.isArray(v) && typeof v.key === 'string' && v.key
  && (v.image_ori_raw?.url || v.image_ori?.url || v.image_preview?.url)
for (const p of payloads) {
  walk(p, '', (node, path) => {
    const cand = isImg(node.image) ? node.image : isImg(node) ? node : null
    if (!cand) return
    const prev = imgs.get(cand.key)
    imgs.set(cand.key, (prev ?? 0) + 1)
    if (imgs.size <= 10) console.log('img at', path.slice(-90))
  })
}
console.log('\nunique image keys:', imgs.size)
