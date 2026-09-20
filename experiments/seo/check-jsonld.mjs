/** 正确解析 schema-org 的 @graph */
const base = process.env.BASE || 'http://localhost:3000'
const html = await (await fetch(`${base}/`)).text()

const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
console.log('JSON-LD 块数:', blocks.length)

for (const [index, block] of blocks.entries()) {
  const parsed = JSON.parse(block[1])
  const graph = parsed['@graph'] ?? (Array.isArray(parsed) ? parsed : [parsed])
  console.log(`\n--- 块 ${index}：${graph.length} 个节点 ---`)
  for (const node of graph) {
    const extra = []
    if (node.applicationCategory) extra.push(`category=${node.applicationCategory}`)
    if (node.featureList) extra.push(`features=${node.featureList.length}`)
    if (node.offers) extra.push(`offers=${node.offers.price}${node.offers.priceCurrency}`)
    console.log(`  @type=${String(node['@type']).padEnd(20)} name=${String(node.name ?? '-').slice(0, 28).padEnd(30)} ${extra.join(' ')}`)
  }
}

console.log('\n=== 关键字段抽查 ===')
console.log('  WebSite inLanguage:', html.includes('"inLanguage": "zh-CN"'))
console.log('  SoftwareApplication:', html.includes('"SoftwareApplication"'))
console.log('  MultimediaApplication:', html.includes('MultimediaApplication'))
