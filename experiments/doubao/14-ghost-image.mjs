// 探针 14：为什么视频帖会多出一张图？对比 image 候选与 video.cover 的 key
const URL_ = process.argv[2] || 'https://www.doubao.com/thread/x4WHzLzMwqewC6RNX'
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
console.log('payloads:', payloads.length)

const seen = new Set()
const isVideo = v => v && typeof v === 'object' && typeof v.vid === 'string' && v.vid && (v.download_url || v.video_model)
const isImage = v => v && typeof v === 'object' && typeof v.key === 'string' && v.key
  && (v.image_ori_raw?.url || v.image_ori?.url || v.image_preview?.url || v.image_thumb?.url)

const coverKeys = new Map()
const images = new Map()

function walk(node, where, depth = 0) {
  if (depth > 20 || node == null) return
  if (typeof node === 'string') { const n = safeParse(node); if (n !== undefined) walk(n, where + '[json]', depth + 1); return }
  if (typeof node !== 'object' || seen.has(node)) return
  seen.add(node)
  if (Array.isArray(node)) { node.forEach((x, i) => walk(x, `${where}[${i}]`, depth + 1)); return }

  if (isVideo(node)) {
    const v = node
    if (v.cover && typeof v.cover === 'object') {
      const k = v.cover.key ?? '(no key)'
      coverKeys.set(k, (coverKeys.get(k) ?? 0) + 1)
    }
    // 关键：不 return，继续向下遍历（forEachNode 就是这么走的，
    // 所以 video.cover 会被当成图片候选，必须靠 key 过滤）
  }

  if (isImage(node)) {
    const k = node.key
    const entry = images.get(k) ?? { count: 0, where, fields: [] }
    entry.count += 1
    entry.fields = Object.keys(node).filter(f => /image_/.test(f))
    entry.thumb = node.image_thumb
    entry.preview = node.image_preview
    entry.ori = node.image_ori
    entry.raw = node.image_ori_raw
    images.set(k, entry)
  }

  Object.entries(node).forEach(([k, v]) => walk(v, `${where}.${k}`, depth + 1))
}

payloads.forEach((p, i) => walk(p, `p${i}`))

console.log('\n=== video.cover keys ===')
for (const [k, n] of coverKeys) console.log(`${n}x`, k)

console.log('\n=== image candidates ===')
for (const [k, e] of images) {
  const isCover = coverKeys.has(k)
  console.log(`\n${isCover ? '[COVER]' : '[IMAGE]'} ${k}  (${e.count}x)`)
  console.log('  fields:', e.fields.join(','))
  for (const f of ['raw', 'ori', 'preview', 'thumb']) {
    const v = e[f]
    if (v?.url) console.log(`  ${f}: ${v.width}x${v.height} ${v.url.slice(0, 80)}`)
  }
}

console.log('\nsummary: images =', images.size, '| covers =', coverKeys.size,
  '| overlap =', [...images.keys()].filter(k => coverKeys.has(k)).length)
