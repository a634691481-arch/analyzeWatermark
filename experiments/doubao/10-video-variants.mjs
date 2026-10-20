// 探针 10：解码 video_list.main_url（base64），对比档位与体积
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

const uniq = new Map()
for (const v of videos) {
  const key = v.vid ?? JSON.stringify(v).slice(0, 30)
  if (!uniq.has(key)) uniq.set(key, v)
}

function decodeMaybeBase64(value) {
  if (typeof value !== 'string') return undefined
  if (/^https?:\/\//.test(value)) return value
  try {
    const text = Buffer.from(value, 'base64').toString('utf8')
    return /^https?:\/\//.test(text) ? text : undefined
  }
  catch { return undefined }
}

for (const [vid, v] of uniq) {
  console.log(`\n=== ${vid} ===`)
  console.log('duration(raw):', v.duration, '| width/height:', v.width, v.height, '| type:', v.video_type)
  console.log('download_url:', String(v.download_url).slice(0, 200))

  let model = v.video_model
  if (typeof model === 'string') model = safeParse(model)
  for (const [name, item] of Object.entries(model?.video_list ?? {})) {
    if (!item || typeof item !== 'object') continue
    const url = decodeMaybeBase64(item.main_url)
    console.log(`[${name}] definition=${item.definition} quality=${item.quality} ${item.vwidth}x${item.vheight} size=${item.size} codec=${item.codec_type} fps=${item.fps}`)
    console.log('  url:', String(url).slice(0, 180))

    if (url) {
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' },
          signal: AbortSignal.timeout(15000)
        })
        console.log('  HEAD:', res.status, res.headers.get('content-type'), res.headers.get('content-length'), 'bytes')
      }
      catch (error) {
        console.log('  HEAD error:', error.message)
      }
    }
  }

  const dl = String(v.download_url ?? '')
  if (dl) {
    try {
      const res = await fetch(dl, {
        method: 'HEAD',
        headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' },
        signal: AbortSignal.timeout(15000)
      })
      console.log('download_url HEAD:', res.status, res.headers.get('content-type'), res.headers.get('content-length'), 'bytes')
    }
    catch (error) {
      console.log('download_url HEAD error:', error.message)
    }
  }
}
