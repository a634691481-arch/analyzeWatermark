/** 千问探针 3：确定 API base、bizId，并尝试直接请求 share/info */
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('./_bundle/main.js', import.meta.url), 'utf8')

console.log('=== share/info 附近（找 base 与 bizId 定义）===')
const at = main.indexOf('/api/v1/share/info')
console.log(JSON.stringify(main.slice(Math.max(0, at - 700), at + 400)))

console.log('\n=== chat2-api / qianwen.com 出现位置 ===')
for (const needle of ['chat2-api.qianwen.com', 'pre-chat2-api-na', 'fr=mac', 'biz_id', 'bizId']) {
  let index = -1
  let count = 0
  while ((index = main.indexOf(needle, index + 1)) !== -1 && count < 4) {
    count++
    console.log(`\n[${needle} @${index}]`)
    console.log(JSON.stringify(main.slice(Math.max(0, index - 260), index + 200)))
  }
  if (!count) console.log(`[${needle}] 未出现`)
}

/** 试探各种 base 与 bizId 组合 */
const SHARE_ID = '58c5c60a43164ccfbf6bb76715be1ba3'
const BASES = [
  'https://chat2-api.qianwen.com',
  'https://qianwen.my.cn',
  'https://www.qianwen.com',
  'https://pre-chat2-api-na.qianwen.com'
]
const BIZ_IDS = ['', 'qwen', 'tongyi', 'qwen_chat', 'mac']

console.log('\n\n=== 试探 share/info ===')
for (const base of BASES) {
  for (const bizId of BIZ_IDS) {
    const url = `${base}/api/v1/share/info?pr=qwen&fr=mac&shareId=${SHARE_ID}${bizId ? `&bizId=${bizId}` : ''}`
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'accept': 'application/json, text/plain, */*',
          'referer': 'https://qianwen.my.cn/',
          'origin': 'https://qianwen.my.cn'
        }
      })
      const text = await response.text()
      const head = text.slice(0, 170).replace(/\s+/g, ' ')
      console.log(`${base.padEnd(38)} bizId=${bizId.padEnd(10)} HTTP ${response.status} ${(text.length / 1024).toFixed(1)}KB  ${head}`)
    }
    catch (error) {
      console.log(`${base.padEnd(38)} bizId=${bizId.padEnd(10)} ERR ${String(error).slice(0, 60)}`)
    }
  }
}
