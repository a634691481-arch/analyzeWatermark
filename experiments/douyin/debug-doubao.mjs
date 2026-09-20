/** 调试：为什么豆包解析出 17 条 */
const BASE = 'http://localhost:3010'

const response = await fetch(`${BASE}/api/parse`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ url: 'https://www.doubao.com/thread/xsADfnc82MMJBxiJJ' })
})
const payload = await response.json()
if (!payload.ok) {
  console.log('解析失败:', JSON.stringify(payload))
  process.exit(1)
}

const media = payload.data.media
console.log('总数:', media.length)
console.log('无水印数量:', media.filter(item => item.watermarkFree).length)
console.log()
for (const item of media) {
  console.log(
    `#${String(item.index).padStart(2)} wf=${item.watermarkFree ? 'Y' : 'N'} `
    + `${item.width}x${item.height} ${item.filename}`
  )
  console.log(`     id/key: ${String(item.id).slice(0, 110)}`)
  console.log(`     url模板: ${(item.url.match(/~tplv-[a-z0-9_-]+/i) || ['?'])[0]}`)
}
