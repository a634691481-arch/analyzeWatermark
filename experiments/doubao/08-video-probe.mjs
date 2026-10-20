// 探针 8：豆包视频分享页的字段形态（找无水印地址）
const URL_ = process.argv[2] || 'https://www.doubao.com/thread/xStCBbPYakxvVBcLM'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const res = await fetch(URL_, {
  headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' },
  signal: AbortSignal.timeout(20000)
})
const html = await res.text()
console.log('status', res.status, 'bytes', html.length)

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

const payloads = []
for (const raw of readFnArgs(html)) { const p = safeParse(decode(raw)); if (p !== undefined) payloads.push(p) }
const lit = readLiteral(html, '_ROUTER_DATA = ')
if (lit) { const p = safeParse(lit); if (p !== undefined) payloads.push(p) }
console.log('payloads', payloads.length)

const seen = new Set()
const videoNodes = []
const urlLike = new Map()

function walk(node, path, depth = 0) {
  if (depth > 20 || node == null) return
  if (typeof node === 'string') {
    const nested = tryJson(node)
    if (nested !== undefined) walk(nested, `${path}[json]`, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  if (seen.has(node)) return
  seen.add(node)

  if (Array.isArray(node)) {
    node.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1))
    return
  }

  const keys = Object.keys(node)
  if (keys.some(k => /video/i.test(k))) {
    videoNodes.push({ path, keys: keys.slice(0, 16) })
  }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v) && /video|\.mp4|\.m3u8|tos-cn/i.test(v)) {
      const family = v.match(/tplv-[a-z0-9_-]+/i)?.[0] ?? v.slice(0, 60)
      urlLike.set(family, (urlLike.get(family) ?? 0) + 1)
    }
    walk(v, `${path}.${k}`, depth + 1)
  }
}

payloads.forEach((p, i) => walk(p, `p${i}`))

console.log('\n=== nodes with video-ish keys ===')
for (const n of videoNodes.slice(0, 12)) {
  console.log(n.path.slice(-90))
  console.log('  keys:', n.keys.join(', '))
}

console.log('\n=== url families ===')
for (const [k, v] of [...urlLike].slice(0, 20)) console.log(`${v}x  ${k}`)

// 尽量打印视频对象细节
console.log('\n=== raw html markers ===')
for (const m of ['video_ori_raw', 'video_ori', 'video_url', 'vid', 'video_id', 'mainMvUrls', '.mp4', 'm3u8']) {
  console.log(m.padEnd(16), html.includes(m))
}
