/**
 * 合并后的全平台回归测试（打本地 Nuxt 服务的真实 HTTP 接口）
 *   node experiments/douyin/test-integrated.mjs
 */
const BASE = process.env.BASE || 'http://localhost:3010'

const CASES = [
  { name: '豆包图片', url: 'https://www.doubao.com/thread/xsADfnc82MMJBxiJJ', platform: 'doubao', type: 'image', count: 5, expectOriginal: false },
  { name: '抖音视频', url: 'https://v.douyin.com/PJIP6J56t8Y/', platform: 'douyin', type: 'video', count: 1, expectOriginal: false },
  { name: '抖音图文', url: 'https://v.douyin.com/lZGNcAGUqsY/', platform: 'douyin', type: 'image', count: 16, expectOriginal: false },
  { name: '小红书图文', url: 'https://xhslink.cn/o/3iRd5juLzyP', platform: 'xiaohongshu', type: 'image', count: 5, expectOriginal: true },
  { name: '千问图文+视频', url: 'https://qianwen.my.cn/share/chat/58c5c60a43164ccfbf6bb76715be1ba3', platform: 'qianwen', type: 'image', count: 2, expectOriginal: false }
]

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`   ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!condition) failures++
}

console.log('=== 平台清单 ===')
const platforms = await (await fetch(`${BASE}/api/platforms`)).json()
console.log('  ', platforms.map(item => `${item.id}(${item.name})`).join(', '))
check('注册了 4 个平台', platforms.length === 4)

const parsed = []
for (const testCase of CASES) {
  console.log(`\n=== ${testCase.name} ===`)
  console.log('  url:', testCase.url)
  const response = await fetch(`${BASE}/api/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: testCase.url })
  })
  const payload = await response.json()
  check('HTTP 200 且 ok=true', response.status === 200 && payload.ok === true, payload.ok ? '' : JSON.stringify(payload).slice(0, 200))
  if (!payload.ok) continue

  const data = payload.data
  parsed.push({ testCase, data })

  const first = data.media[0]
  console.log(`   平台=${data.platform.name} 类型=${first?.type} 数量=${data.media.length}`)
  console.log(`   作者=${data.author}`)
  console.log(`   标题=${String(data.title).slice(0, 46)}`)
  console.log(`   首个: ${first?.filename} ${first?.width}x${first?.height}${first?.duration ? ' ' + (first.duration / 1000).toFixed(1) + 's' : ''}`)
  console.log(`   url: ${String(first?.url).slice(0, 115)}`)
  if (first?.originalUrl) console.log(`   originalUrl: ${first.originalUrl.slice(0, 115)}`)

  check(`平台是 ${testCase.platform}`, data.platform.id === testCase.platform)
  check(`类型是 ${testCase.type}`, first?.type === testCase.type)
  check(`数量是 ${testCase.count}`, data.media.length === testCase.count, `实际 ${data.media.length}`)
  check('全部标记无水印', data.media.every(item => item.watermarkFree))
  check('每条都有文件名与地址', data.media.every(item => item.filename && /^https?:\/\//.test(item.url)))
  check('序号从 1 连续', data.media.every((item, index) => item.index === index + 1))
  if (testCase.expectOriginal) check('提供了原图地址', data.media.every(item => Boolean(item.originalUrl)))
  else check('未多余提供原图地址', data.media.every(item => !item.originalUrl))
}

console.log('\n=== 代理下载验证 ===')
for (const { testCase, data } of parsed) {
  for (const item of data.media.slice(0, testCase.type === 'video' ? 1 : 2)) {
    const href = `${BASE}/api/proxy?url=${encodeURIComponent(item.url)}&download=1&name=${encodeURIComponent(item.filename)}`
    const response = await fetch(href)
    const buffer = Buffer.from(await response.arrayBuffer())
    const disposition = response.headers.get('content-disposition') || ''
    console.log(`   ${testCase.name} #${item.index}: HTTP ${response.status} | ${response.headers.get('content-type')} | ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)
    check(`${testCase.name} #${item.index} 可下载`, response.status === 200 && buffer.length > 1024)
    check(`${testCase.name} #${item.index} 文件名正确`, disposition.includes(item.filename))
  }
  // 原图地址也要能下
  const withOriginal = data.media.find(item => item.originalUrl)
  if (withOriginal) {
    const response = await fetch(`${BASE}/api/proxy?url=${encodeURIComponent(withOriginal.originalUrl)}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    console.log(`   ${testCase.name} 原图: HTTP ${response.status} | ${response.headers.get('content-type')} | ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)
    check(`${testCase.name} 原图可下载`, response.status === 200 && buffer.length > 1024)
  }
}

console.log('\n=== 打包下载（各平台混装）===')
const zipFiles = []
for (const { data } of parsed) {
  for (const item of data.media.slice(0, data.media[0].type === 'video' ? 1 : 2)) {
    zipFiles.push({ url: item.url, filename: item.filename })
  }
}
const zipResponse = await fetch(`${BASE}/api/zip`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ filename: 'all-platforms-test.zip', files: zipFiles })
})
const zipBuffer = Buffer.from(await zipResponse.arrayBuffer())
console.log(`   HTTP ${zipResponse.status} | ${(zipBuffer.length / 1024 / 1024).toFixed(2)}MB | ${zipFiles.length} 个文件`)
check('zip 返回 200', zipResponse.status === 200)
check('zip 魔数正确', zipBuffer.subarray(0, 4).toString('hex') === '504b0304')

console.log('\n=== 安全与错误边界 ===')
check('非白名单域名 403', (await fetch(`${BASE}/api/proxy?url=${encodeURIComponent('https://evil.example.com/a.png')}`)).status === 403)
check('未支持平台 400', (await fetch(`${BASE}/api/parse`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/foo' }) })).status === 400)
check('非法链接 400', (await fetch(`${BASE}/api/parse`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'not-a-url' }) })).status === 400)

console.log(`\n${'='.repeat(60)}`)
console.log(failures === 0 ? '全部通过 ✅' : `${failures} 项失败 ❌`)
process.exit(failures === 0 ? 0 : 1)
