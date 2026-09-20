/** SEO 优化后的完整验证（打生产构建产物） */
const BASE = process.env.BASE || 'http://localhost:3000'

function meta(html, key) {
  const hit = html.match(new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*content="([^"]*)"`, 'i'))
  return hit ? hit[1] : '(无)'
}
function canonical(html) {
  return (html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i) ?? [])[1] ?? '(无)'
}
function title(html) {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/) ?? [])[1] ?? '(无)'
}

console.log('=== 首页 / ===')
const home = await (await fetch(`${BASE}/`)).text()
console.log('  title      ', title(home))
console.log('  canonical  ', canonical(home))
console.log('  og:url     ', meta(home, 'og:url'))
console.log('  og:image   ', meta(home, 'og:image'))
console.log('  twitter:image', meta(home, 'twitter:image'))
console.log('  指向 localhost:', home.includes('localhost:3000') ? '❌ 仍存在' : '✅ 已清除')

const platforms = await (await fetch(`${BASE}/api/platforms`)).json()
console.log(`\n=== 平台落地页（共 ${platforms.length} 个）===`)
for (const platform of platforms) {
  const response = await fetch(`${BASE}/${platform.id}`)
  const html = await response.text()
  const hasFaq = html.includes('"@type":"FAQPage"')
  const hasH1 = html.includes(`<h1`) && html.includes(`${platform.name}去水印`)
  const canonicalOk = canonical(html).includes(`/${platform.id}`)
  console.log(`  /${platform.id.padEnd(13)} HTTP ${response.status}  title="${title(html).slice(0, 34)}"  canonical=${canonicalOk ? 'ok' : 'BAD'}  H1=${hasH1}  FAQ-LD=${hasFaq}`)
  if (response.status !== 200) console.log('    ❌ 状态码异常')
}

console.log('\n=== 不存在的平台应 404 ===')
const notFound = await fetch(`${BASE}/not-a-platform`)
console.log('  /not-a-platform ->', notFound.status, notFound.status === 404 ? '✅' : '❌')

console.log('\n=== robots.txt ===')
const robots = await (await fetch(`${BASE}/robots.txt`)).text()
console.log(robots.trim())
console.log('  含正确域名:', robots.includes('qsy.mooon.vip') ? '✅' : '❌')
console.log('  含 localhost:', robots.includes('localhost') ? '❌ 仍存在' : '✅ 已清除')

console.log('\n=== sitemap.xml ===')
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
console.log('  URL 数:', locs.length)
locs.forEach(loc => console.log('   ', loc))
console.log('  全部为绝对地址:', locs.every(l => l.startsWith('https://qsy.mooon.vip')) ? '✅' : '❌')

console.log('\n=== og.png 可访问 ===')
const og = await fetch(`${BASE}/og.png`)
console.log('  HTTP', og.status, '| type', og.headers.get('content-type'), '| length', og.headers.get('content-length'))
