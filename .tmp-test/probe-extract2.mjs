const url = 'https://www.doubao.com/thread/xsADfnc82MMJBxiJJ'
const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
const html = await res.text()

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
    let cursor = index + marker.length
    const quote = source[cursor]
    if (quote === '"' || quote === "'") {
      cursor += 1
      const end = source.indexOf(quote, cursor)
      if (end !== -1) {
        values.push(source.slice(cursor, end))
        index = source.indexOf(marker, end)
        continue
      }
    }
    index = source.indexOf(marker, cursor)
  }
  return values
}

const values = extractFnArgsValues(html)
console.log('fn-args values:', values.length)

const payloads = []
for (const [i, value] of values.entries()) {
  try {
    const parsed = JSON.parse(decodeHtmlEntities(value))
    payloads.push(parsed)
    console.log('parsed', i, 'ok, top keys/len:', Array.isArray(parsed) ? 'array ' + parsed.length : Object.keys(parsed).slice(0, 5))
  }
  catch (error) {
    console.log('parsed', i, 'FAILED', String(error).slice(0, 80))
  }
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
console.log('images found:', dedup.size)
for (const [, item] of dedup) {
  const raw = item.image.image_ori_raw?.url
  console.log(' -', item.image.key?.split('/').pop(), 'raw:', Boolean(raw), 'prompt:', item.prompt ? item.prompt.slice(0, 20) : '-')
}
