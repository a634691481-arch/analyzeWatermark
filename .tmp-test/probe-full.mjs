const url = 'https://www.doubao.com/thread/xsADfnc82MMJBxiJJ'

function decodeHtmlEntities(input) {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractFnArgsValues(source) {
  const values = []
  const marker = 'data-fn-args='
  let index = source.indexOf(marker)
  while (index !== -1) {
    const cursor = index + marker.length
    const quote = source[cursor]
    if (quote === '"' || quote === "'") {
      const start = cursor + 1
      const end = source.indexOf(quote, start)
      if (end !== -1) {
        values.push({ raw: source.slice(start, end), quote })
        index = source.indexOf(marker, end)
        continue
      }
    }
    index = source.indexOf(marker, cursor)
  }
  return values
}

/** 从 `_ROUTER_DATA = {...}` 里做花括号配对提取 */
function extractRouterDataLiteral(source) {
  const marker = '_ROUTER_DATA = '
  const start = source.indexOf(marker)
  if (start === -1) return null
  let i = start + marker.length
  if (source[i] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  let quote = ''
  for (; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(start + marker.length, i + 1)
    }
  }
  return null
}

const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
const html = await res.text()

console.log('bytes', html.length, '| image_ori_raw:', html.includes('image_ori_raw'), '| creation_block:', html.includes('creation_block'))

const values = extractFnArgsValues(html)
console.log('fn-args values:', values.length)
const payloads = []
for (const [i, entry] of values.entries()) {
  console.log(`  [${i}] quote=${entry.quote} len=${entry.raw.length} head=${entry.raw.slice(0, 60)}`)
  try {
    payloads.push(JSON.parse(decodeHtmlEntities(entry.raw)))
  }
  catch (error) {
    console.log(`      parse FAILED: ${String(error).slice(0, 90)}`)
  }
}

const literal = extractRouterDataLiteral(html)
if (literal) {
  console.log('_ROUTER_DATA literal len:', literal.length)
  try {
    payloads.push(JSON.parse(literal))
  }
  catch (error) {
    console.log('  router data parse FAILED:', String(error).slice(0, 90))
  }
}
else {
  console.log('no _ROUTER_DATA literal')
}

function isImagePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Boolean(value.image_ori_raw?.url || value.image_ori?.url || value.image_preview?.url || value.image_thumb?.url)
}

const collected = []
function walk(node, seen, prompt) {
  if (!node || typeof node !== 'object') return
  if (seen.has(node)) return
  seen.add(node)
  if (Array.isArray(node)) {
    for (const item of node) walk(item, seen, prompt)
    return
  }
  const record = node
  const nextPrompt = typeof record.gen_params?.prompt === 'string' ? record.gen_params.prompt : prompt
  if (isImagePayload(record.image)) {
    collected.push({ image: record.image, prompt: nextPrompt })
  }
  else if (isImagePayload(record)) {
    collected.push({ image: record, prompt: nextPrompt })
    return
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === 'image' && isImagePayload(record.image)) continue
    walk(value, seen, nextPrompt)
  }
}

const seen = new WeakSet()
for (const payload of payloads) walk(payload, seen)

const dedup = new Map()
for (const item of collected) {
  const id = item.image.key ?? item.image.image_ori_raw?.url
  if (!dedup.has(id)) dedup.set(id, item)
}
console.log('\n>>> images found:', dedup.size)
for (const [, item] of dedup) {
  console.log('  -', item.image.key?.split('/').pop(), '| raw:', Boolean(item.image.image_ori_raw?.url), '| prompt:', item.prompt ? item.prompt.slice(0, 16) + '...' : '-')
}
