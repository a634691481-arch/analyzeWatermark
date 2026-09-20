/** 校验：输入框里那行已删除 + 顶部平台展示带图标 */
const base = process.env.BASE || 'http://localhost:3010'

const html = await (await fetch(`${base}/`)).text()

console.log('=== 输入框区域 ===')
console.log('  含「已支持」:', html.includes('已支持'))
console.log('  含「示例：」:', html.includes('示例：'))
console.log('  占位符:', (html.match(/placeholder="([^"]*)"/) || [])[1] ?? '(未找到)')
console.log('  保留「联系作者」按钮:', html.includes('联系作者适配'))

console.log('\n=== 顶部平台展示 ===')
const api = await (await fetch(`${base}/api/platforms`)).json()
console.log('  /api/platforms 返回 icon 字段:')
for (const platform of api) {
  console.log(`    ${platform.id.padEnd(14)} ${platform.name.padEnd(8)} icon=${platform.icon}`)
  console.log(`      ${platform.name} 出现在页面: ${html.includes(platform.name)}`)
}

console.log('\n=== 图标是否渲染（服务端 SVG / CSS mask）===')
for (const platform of api) {
  const icon = platform.icon
  if (!icon) continue
  const body = icon.replace(/^i-/, '').replace(/-/g, '')
  // 服务端渲染时 .i-lucide-bot 会带上 --svg: url("data:image/svg+xml...")
  const styleHit = html.includes(`i-${icon.replace(/^i-/, '')}`) || html.includes(icon.replace(/^i-/, ''))
  console.log(`  ${platform.name.padEnd(8)} ${icon.padEnd(32)} 渲染: ${styleHit}`)
}
const svgCount = (html.match(/data:image\/svg\+xml/g) ?? []).length
console.log('  内联 svg data-url 数量:', svgCount)

console.log('\n=== 解析功能仍正常 ===')
const parsed = await (await fetch(`${base}/api/parse`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ url: 'https://b23.tv/BV1uDe16vE51' })
})).json()
console.log('  ok:', parsed.ok, '| 媒体数:', parsed.ok ? parsed.data.media.length : '-')
