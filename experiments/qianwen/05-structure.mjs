/** 千问探针 5：拆 share/info 结构，找图片与视频 */
import { readFileSync, writeFileSync } from 'node:fs'

const payload = JSON.parse(readFileSync(new URL('./_share-info.json', import.meta.url), 'utf8'))
const data = payload.data

console.log('=== data 顶层 ===')
console.log('keys:', Object.keys(data))
console.log('title:', data.title)

function shape(node, depth, maxDepth, prefix, out) {
  if (depth > maxDepth || node === null || node === undefined) return
  if (Array.isArray(node)) {
    out.push(`${prefix}[array ${node.length}]`)
    if (node.length) shape(node[0], depth + 1, maxDepth, `${prefix}  `, out)
    return
  }
  if (typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    const type = Array.isArray(value) ? `array(${value.length})` : typeof value
    let preview = ''
    if (typeof value === 'string') preview = ` = ${JSON.stringify(value.slice(0, 70))}`
    else if (typeof value === 'number' || typeof value === 'boolean') preview = ` = ${value}`
    out.push(`${prefix}${key}: ${type}${preview}`)
    if (value && typeof value === 'object') shape(value, depth + 1, maxDepth, `${prefix}  `, out)
  }
}

const out = []
shape(data, 0, 3, '', out)
console.log('\n' + out.join('\n'))

console.log('\n=== 所有 URL 汇总（按域名分组）===')
const urls = new Set()
const collect = (node) => {
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node)) urls.add(node)
    return
  }
  if (node && typeof node === 'object') Object.values(node).forEach(collect)
}
collect(data)

const byHost = new Map()
for (const url of urls) {
  let host
  try { host = new URL(url).hostname } catch { host = '(parse失败)' }
  if (!byHost.has(host)) byHost.set(host, [])
  byHost.get(host).push(url)
}
for (const [host, list] of [...byHost.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${host}  (${list.length})`)
  list.slice(0, 4).forEach(url => console.log(`    ${url.slice(0, 165)}`))
  if (list.length > 4) console.log(`    ... 其余 ${list.length - 4} 条`)
}

console.log('\n=== 含媒体关键字的字段（全量扫描）===')
const hits = new Map()
const scan = (node, path, depth) => {
  if (depth > 14 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach((v, i) => scan(v, `${path}[${i}]`, depth + 1)); return }
  for (const [key, value] of Object.entries(node)) {
    if (/image|video|audio|media|file|url|thumb|cover|duration|width|height|size/i.test(key)) {
      if (!hits.has(key)) hits.set(key, 0)
      hits.set(key, hits.get(key) + 1)
    }
    scan(value, `${path}.${key}`, depth + 1)
  }
}
scan(data, 'data', 0)
console.log([...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join('  '))

writeFileSync(new URL('./_share-info.pretty.json', import.meta.url), JSON.stringify(data, null, 2))
console.log('\n已写出 _share-info.pretty.json，大小', (JSON.stringify(data).length / 1024).toFixed(0) + 'KB')
