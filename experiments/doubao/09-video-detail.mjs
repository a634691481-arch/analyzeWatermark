// 探针 9：把创作节点里的 video 对象打全，确认哪条 URL 是可下载的原片
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
  if (typeof node === 'string') {
    const nested = safeParse(node)
    if (nested !== undefined) walk(nested, depth + 1)
    return
  }
  if (typeof node !== 'object' || seen.has(node)) return
  seen.add(node)

  if (Array.isArray(node)) { node.forEach(x => walk(x, depth + 1)); return }

  const v = node.video
  if (v && typeof v === 'object' && (v.vid || v.download_url || v.video_model)) {
    videos.push(v)
  }
  Object.values(node).forEach(x => walk(x, depth + 1))
}

payloads.forEach(p => walk(p))

console.log('video nodes:', videos.length)
const uniq = new Map()
for (const v of videos) {
  const key = v.vid ?? v.video_model?.video_id ?? JSON.stringify(v).slice(0, 40)
  if (!uniq.has(key)) uniq.set(key, v)
}

for (const [key, v] of uniq) {
  console.log('\n=== vid:', key, '===')
  console.log('type:', v.video_type, '| size:', v.width, 'x', v.height, '| duration:', v.duration, '| status:', v.status)
  console.log('cover:', typeof v.cover === 'string' ? v.cover.slice(0, 110) : v.cover)
  console.log('download_url:', typeof v.download_url === 'string' ? v.download_url.slice(0, 160) : v.download_url)
  console.log('download_filehash:', v.download_filehash)

  let model = v.video_model
  if (typeof model === 'string') model = safeParse(model)
  if (!model) continue
  console.log('model.media_type:', model.media_type, '| url_expire:', model.url_expire, '| poster:', String(model.poster_url ?? '').slice(0, 100))
  const list = model.video_list
  if (list && typeof list === 'object') {
    for (const [name, item] of Object.entries(list)) {
      if (!item || typeof item !== 'object') continue
      console.log(`  [${name}] keys:`, Object.keys(item).join(','))
      const main = item.main_url ?? item.url ?? item.play_url ?? item.video_url
      console.log(`    main: ${String(main ?? '').slice(0, 170)}`)
      for (const [k, val] of Object.entries(item)) {
        if (k !== 'main_url' && typeof val === 'string' && /^https?:\/\//.test(val)) {
          console.log(`    ${k}: ${val.slice(0, 170)}`)
        }
      }
    }
  }
  else {
    console.log('  video_list:', JSON.stringify(list)?.slice(0, 300))
  }
}
