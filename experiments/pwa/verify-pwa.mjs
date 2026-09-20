/** PWA 运行时验证（打生产产物） */
const BASE = process.env.BASE || 'http://localhost:3000'

console.log('=== /manifest.webmanifest ===')
const manifest = await fetch(`${BASE}/manifest.webmanifest`)
console.log('  HTTP', manifest.status, '| type', manifest.headers.get('content-type'))
const json = await manifest.json()
console.log('  name:', json.name, '| short_name:', json.short_name)
console.log('  display:', json.display, '| start_url:', json.start_url, '| scope:', json.scope)
console.log('  theme_color:', json.theme_color, '| lang:', json.lang)
console.log('  icons:', json.icons.map(i => `${i.sizes}${i.purpose ? '(' + i.purpose + ')' : ''}`).join(', '))

console.log('\n=== /sw.js ===')
const sw = await fetch(`${BASE}/sw.js`)
const swText = await sw.text()
console.log('  HTTP', sw.status, '| type', sw.headers.get('content-type'), '| size', (swText.length / 1024).toFixed(1) + 'KB')
console.log('  含 NavigationRoute（应为 false）:', swText.includes('NavigationRoute'))

console.log('\n=== workbox 运行时 ===')
const workboxName = (swText.match(/workbox-([a-f0-9]+)/) ?? [])[1]
if (workboxName) {
  const wb = await fetch(`${BASE}/workbox-${workboxName}.js`)
  console.log(`  /workbox-${workboxName}.js  HTTP`, wb.status, '| size', ((await wb.text()).length / 1024).toFixed(1) + 'KB')
}

console.log('\n=== 图标可访问 ===')
for (const icon of ['/pwa-192x192.png', '/pwa-512x512.png', '/maskable-icon-512x512.png', '/apple-touch-icon.png']) {
  const response = await fetch(`${BASE}${icon}`)
  console.log(`  ${icon.padEnd(28)} HTTP ${response.status} ${response.headers.get('content-type')} ${response.headers.get('content-length')}B`)
}

console.log('\n=== 页面 head 里的 PWA 标签 ===')
const html = await (await fetch(`${BASE}/`)).text()
const checks = [
  ['manifest link', /<link[^>]*rel="manifest"[^>]*href="([^"]+)"/i, (m) => m[1]],
  ['theme-color', /<meta[^>]*name="theme-color"[^>]*content="([^"]+)"/i, (m) => m[1]],
  ['apple-touch-icon', /<link[^>]*rel="apple-touch-icon"[^>]*href="([^"]+)"/i, (m) => m[1]],
  ['apple-mobile-web-app-title', /<meta[^>]*name="apple-mobile-web-app-title"[^>]*content="([^"]+)"/i, (m) => m[1]]
]
for (const [label, pattern, pick] of checks) {
  const hit = html.match(pattern)
  console.log(`  ${label.padEnd(28)} ${hit ? pick(hit) : '❌ 缺失'}`)
}

console.log('\n=== 平台页也应带 manifest / 可被 SW 接管 ===')
const platformHtml = await (await fetch(`${BASE}/douyin`)).text()
console.log('  /douyin 含 manifest link:', /rel="manifest"/.test(platformHtml))
console.log('  /douyin canonical 仍正确:', platformHtml.includes('https://qsy.mooon.vip/douyin'))
