/** 检查 SSR 输出的 head：title / meta / canonical / JSON-LD */
const BASE = process.env.BASE || 'http://localhost:3000'

const response = await fetch(`${BASE}/`)
const html = await response.text()
const head = html.slice(0, html.indexOf('</head>'))

console.log('=== title ===')
for (const m of head.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/g)) console.log(' ', m[1])

console.log('\n=== meta ===')
const metaKeys = ['description', 'keywords', 'robots', 'og:title', 'og:description', 'og:type', 'og:site_name', 'og:locale', 'og:url', 'og:image', 'twitter:card', 'twitter:title']
for (const key of metaKeys) {
  const re = new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*content="([^"]*)"`, 'i')
  const hit = head.match(re)
  if (hit) console.log(`  ${key.padEnd(20)} ${hit[1].slice(0, 90)}`)
}

console.log('\n=== link ===')
for (const key of ['canonical', 'alternate']) {
  for (const m of head.matchAll(new RegExp(`<link[^>]*rel="${key}"[^>]*>`, 'gi'))) console.log(' ', m[0].slice(0, 140))
}

console.log('\n=== JSON-LD ===')
const blocks = [...head.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
console.log('块数:', blocks.length)
blocks.forEach((block, index) => {
  try {
    const parsed = JSON.parse(block[1])
    const graph = Array.isArray(parsed) ? parsed : (parsed['@graph'] ?? [parsed])
    for (const node of graph) {
      console.log(`  [${index}] @type=${node['@type']}  name=${node.name ?? '-'}  @id=${node['@id'] ?? '-'}`)
    }
  }
  catch (error) {
    console.log(`  [${index}] 解析失败: ${String(error).slice(0, 80)}`)
    console.log('      ', block[1].slice(0, 200))
  }
})

console.log('\n=== head 里与 SEO 无关的自检 ===')
console.log('  html lang:', (html.match(/<html[^>]*lang="([^"]*)"/) || [])[1] ?? '(无)')
console.log('  总长度:', (html.length / 1024).toFixed(1) + 'KB')
