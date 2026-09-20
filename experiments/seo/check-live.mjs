/** 分析线上站点当前的 SEO 状态 */
import { readFileSync, existsSync } from 'node:fs'

const dir = process.env.TEMP + '\\opencode'

const home = existsSync(`${dir}\\live-home.html`) ? readFileSync(`${dir}\\live-home.html`, 'utf8') : ''
const sitemap = existsSync(`${dir}\\live-sitemap.xml`) ? readFileSync(`${dir}\\live-sitemap.xml`, 'utf8') : ''

console.log('=== 线上首页 ===')
console.log('  大小:', (home.length / 1024).toFixed(1) + 'KB')
console.log('  是 Nuxt SSR:', home.includes('__NUXT__') || home.includes('/_nuxt/'))

const head = home.slice(0, home.indexOf('</head>'))
console.log('\n  title:', (head.match(/<title[^>]*>([\s\S]*?)<\/title>/) ?? [])[1] ?? '(无)')
for (const key of ['description', 'keywords', 'robots', 'og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name', 'twitter:card', 'twitter:image']) {
  const hit = head.match(new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*content="([^"]*)"`, 'i'))
  console.log(`  ${key.padEnd(16)} ${hit ? hit[1].slice(0, 100) : '(无)'}`)
}
const canonical = head.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i)
console.log('  canonical       ', canonical ? canonical[1] : '(无)')
console.log('  html lang       ', (home.match(/<html[^>]*lang="([^"]*)"/) ?? [])[1] ?? '(无)')

const ld = [...home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
console.log('  JSON-LD 块数    ', ld.length)
for (const block of ld) {
  try {
    const parsed = JSON.parse(block[1])
    const graph = parsed['@graph'] ?? [parsed]
    for (const node of graph) console.log(`    @type=${node['@type']} name=${node.name ?? '-'}`)
  }
  catch { console.log('    解析失败') }
}

console.log('\n=== 线上 sitemap.xml ===')
console.log(sitemap || '(空)')

console.log('\n=== 静态资源 / 性能相关 ===')
console.log('  preconnect:', (head.match(/<link[^>]*rel="preconnect"[^>]*>/gi) ?? []).length)
console.log('  modulepreload:', (head.match(/rel="modulepreload"/gi) ?? []).length)
console.log('  内联 CSS:', /<style[^>]*>/i.test(head))
