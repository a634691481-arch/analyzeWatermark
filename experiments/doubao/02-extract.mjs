// 探针 2：复刻 doubao.ts 的提取逻辑，输出图片清单与字段形态
const URL_ = 'https://www.doubao.com/thread/xTOlFYCgraKkBExtJ'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const res = await fetch(URL_, {
  headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', referer: 'https://www.doubao.com/' },
  signal: AbortSignal.timeout(20000)
})
const html = await res.text()

const decode = s => s
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')

const safeParse = (t) => {
  try { return JSON.parse(t) }
  catch { return undefined }
}

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
      if (e !== -1) {
        out.push(h.slice(s, e))
        i = h.indexOf(marker, e)
        continue
      }
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
  let d = 0
  let str = false
  let esc = false
  let q = ''
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
  const a = t[0]
  const b = t.at(-1)
  return ((a === '{' && b === '}') || (a === '[' && b === ']')) ? safeParse(t) : undefined
}

function walk(node, visit, depth = 0) {
  if (depth > 18 || node == null) return
  if (typeof node === 'string') {
    const n = tryJson(node)
    if (n !== undefined) walk(n, visit, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(x => walk(x, visit, depth + 1)); return }
  visit(node)
  Object.values(node).forEach(x => walk(x, visit, depth + 1))
}

const payloads = []
for (const raw of readFnArgs(html)) {
  const p = safeParse(decode(raw))
  if (p !== undefined) payloads.push(p)
}
const lit = readLiteral(html, '_ROUTER_DATA = ')
if (lit) {
  const p = safeParse(lit)
  if (p !== undefined) payloads.push(p)
}
console.log('payloads:', payloads.length)

const isImg = v => v && typeof v === 'object' && !Array.isArray(v) && typeof v.key === 'string' && v.key
  && (v.image_ori_raw?.url || v.image_ori?.url || v.image_preview?.url || v.image_thumb?.url)

const imgs = []
const others = new Map()
for (const p of payloads) {
  walk(p, (node) => {
    if (isImg(node.image)) { imgs.push({ where: 'node.image', ...node.image }); return }
    if (isImg(node)) imgs.push({ where: 'node', ...node })
    for (const k of Object.keys(node)) {
      if (/video|vid|media|attach|file/i.test(k)) {
        const v = node[k]
        others.set(k, Array.isArray(v) ? `array(${v.length})` : typeof v)
      }
    }
  })
}
console.log('images found:', imgs.length)
const seen = new Set()
for (const it of imgs) {
  if (seen.has(it.key)) continue
  seen.add(it.key)
  console.log('--- key:', it.key, '|', it.where)
  for (const f of ['image_ori_raw', 'image_ori', 'image_preview', 'image_thumb']) {
    const v = it[f]
    if (!v?.url) continue
    console.log(`  ${f}: ${v.width}x${v.height} ${v.url.replace(/\?.*$/, '').slice(0, 120)}`)
  }
}
console.log('--- media-ish keys ---')
console.log([...others].slice(0, 40))

let share
for (const p of payloads) walk(p, (n) => { if (!share && n.share_info) share = n.share_info })
console.log('--- share_info ---')
console.log(share && { share_name: share.share_name, nick: share.user?.nick_name })
