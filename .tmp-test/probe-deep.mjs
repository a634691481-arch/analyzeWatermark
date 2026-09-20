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
  return input.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
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
        values.push(source.slice(start, end))
        index = source.indexOf(marker, end)
        continue
      }
    }
    index = source.indexOf(marker, cursor)
  }
  return values
}

const payloads = extractFnArgsValues(html).map(v => JSON.parse(decodeHtmlEntities(v)))
const payload = payloads[0]
console.log('payload type:', Array.isArray(payload) ? 'array ' + payload.length : typeof payload)
console.log('payload[0] =', JSON.stringify(payload[0]))
console.log('payload[1] type:', Array.isArray(payload[1]) ? 'array ' + payload[1].length : typeof payload[1])

const item = payload[1][0]
console.log('item keys:', Object.keys(item))
console.log('item.key =', item.key, '| routerDataFnName =', item.routerDataFnName)
console.log('routerDataFnArgs type:', Array.isArray(item.routerDataFnArgs) ? 'array ' + item.routerDataFnArgs.length : typeof item.routerDataFnArgs)

const args = item.routerDataFnArgs
if (Array.isArray(args)) {
  args.forEach((a, i) => {
    const t = Array.isArray(a) ? 'array ' + a.length : typeof a
    let extra = ''
    if (typeof a === 'string') {
      extra = ' -> ' + JSON.stringify(a.slice(0, 60))
      console.log('  arg[' + i + '] string contains image_ori_raw:', a.includes('image_ori_raw'), 'len', a.length)
    }
    console.log('  arg[' + i + ']:', t, extra)
  })
}

/** 寻找所有含 image_ori_raw 的字符串值 */
const hits = []
function scan(node, path, depth) {
  if (depth > 8 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((v, i) => scan(v, path + '[' + i + ']', depth + 1)); return }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && v.includes('image_ori_raw')) hits.push({ path: path + '.' + k, len: v.length, head: v.slice(0, 80) })
    else if (v && typeof v === 'object') scan(v, path + '.' + k, depth + 1)
  }
}
scan(payload, 'p', 0)
console.log('\nstring values containing image_ori_raw:', hits.length)
hits.slice(0, 3).forEach(h => console.log('  ', h.path, 'len', h.len, '|', JSON.stringify(h.head)))
