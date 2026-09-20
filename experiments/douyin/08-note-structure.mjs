/** 探针 8：note（图文）页面的数据在哪 */
import { readFileSync, writeFileSync } from 'node:fs'

function readObjectLiteral(source, marker) {
  const start = source.indexOf(marker)
  if (start === -1) return null
  const begin = start + marker.length
  if (source[begin] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  let quote = ''
  for (let i = begin; i < source.length; i++) {
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
      if (depth === 0) return source.slice(begin, i + 1)
    }
  }
  return null
}

const html = readFileSync(new URL('./_page-image-post.html', import.meta.url), 'utf8')
const data = JSON.parse(readObjectLiteral(html, '_ROUTER_DATA = '))

console.log('loaderData keys:', Object.keys(data.loaderData))
const page = data.loaderData['note_(id)/page']
console.log('\nnote_(id)/page keys:', Object.keys(page))

writeFileSync(new URL('./_note-page.json', import.meta.url), JSON.stringify(page, null, 2))

/** 打印前两层结构 */
function shape(node, depth, maxDepth, prefix, out) {
  if (depth > maxDepth || !node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    out.push(`${prefix}[array ${node.length}]`)
    if (node.length) shape(node[0], depth + 1, maxDepth, `${prefix}  `, out)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    const type = Array.isArray(value) ? `array(${value.length})` : typeof value
    const preview = typeof value === 'string' ? ` = ${JSON.stringify(value.slice(0, 70))}` : ''
    out.push(`${prefix}${key}: ${type}${preview}`)
    if (value && typeof value === 'object') shape(value, depth + 1, maxDepth, `${prefix}  `, out)
  }
}

const out = []
shape(page, 0, 3, '', out)
console.log('\n' + out.join('\n'))
