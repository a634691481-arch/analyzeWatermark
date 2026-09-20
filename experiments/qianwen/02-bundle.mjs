/**
 * 千问探针 2：从前端 bundle 里挖接口路径
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'https://g.alicdn.com/code/npm/@ali/tongyi-app-share/26.915.150706/js/'
const FILES = ['main.js', 'vendor.js', 'lib-react.js', 'lib-router.js']

const OUT = new URL('./_bundle/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

for (const name of FILES) {
  const response = await fetch(BASE + name, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36' }
  })
  if (response.status !== 200) {
    console.log(`${name}: HTTP ${response.status}`)
    continue
  }
  const text = await response.text()
  writeFileSync(new URL(`./${name}`, OUT), text)
  console.log(`${name}: ${(text.length / 1024).toFixed(0)}KB`)
}

console.log('\n=== main.js 里的接口路径候选 ===')
const main = (await import('node:fs')).readFileSync(new URL('./main.js', OUT), 'utf8')
const vendor = existsSync(new URL('./vendor.js', OUT))
  ? (await import('node:fs')).readFileSync(new URL('./vendor.js', OUT), 'utf8')
  : ''

// 形如 "/api/xxx" 或 "https://host/xxx" 的字符串
const PATH_PATTERNS = [
  /["'`](\/api\/[A-Za-z0-9_\-/.{}$:]+)["'`]/g,
  /["'`](https:\/\/[a-z0-9.-]+\/[A-Za-z0-9_\-/.{}$:]*(?:api|share|chat|query)[A-Za-z0-9_\-/.{}$:]*)["'`]/gi,
  /["'`](\/[a-z0-9_-]*(?:share|chat|query|detail|conversation|message)[a-z0-9_/-]*)["'`]/gi
]

for (const [label, source] of [['main.js', main], ['vendor.js', vendor]]) {
  console.log(`\n--- ${label} ---`)
  const found = new Set()
  for (const pattern of PATH_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.add(match[1])
  }
  const list = [...found].filter(item => item.length < 120).sort()
  console.log('候选数量:', list.length)
  list.slice(0, 60).forEach(item => console.log('  ', item))

  if (list.length > 60) console.log(`  ... 其余 ${list.length - 60} 条略`)
}

console.log('\n=== 与 share 相关的上下文片段 ===')
for (const [label, source] of [['main.js', main]]) {
  let index = -1
  let count = 0
  while ((index = source.indexOf('share/', index + 1)) !== -1 && count < 8) {
    count++
    console.log(`\n[${label} @${index}]`)
    console.log(JSON.stringify(source.slice(Math.max(0, index - 220), index + 160)))
  }
}

console.log('\n=== 域名线索 ===')
const hosts = new Set()
for (const match of (main + vendor).matchAll(/https:\/\/([a-z0-9.-]+\.(?:cn|com|net))/gi)) hosts.add(match[1])
console.log([...hosts].sort().join('\n'))
