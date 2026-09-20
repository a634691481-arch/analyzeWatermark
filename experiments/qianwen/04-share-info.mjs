/**
 * 千问探针 4：POST share/info 取数据
 *
 * 从 bundle 里挖到的调用方式（注意是 POST，GET 会 405）：
 *   POST {base}/api/v1/share/info?pr=qwen&fr=mac
 *   body: {"share_id": "...", "biz_id": "ai_qwen"}
 *   credentials: include
 */
import { writeFileSync } from 'node:fs'

const SHARE_ID = '58c5c60a43164ccfbf6bb76715be1ba3'
const URL_SHARE = 'https://chat2-api.qianwen.com/api/v1/share/info?pr=qwen&fr=mac'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function mergeCookies(response, jar = {}) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0] ?? ''
    const index = pair.indexOf('=')
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim()
  }
  return jar
}
const cookieHeader = jar => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

// 先访问分享页拿 cookie（bundle 里 fetch 带 credentials: include）
const jar = {}
const page = await fetch(`https://qianwen.my.cn/share/chat/${SHARE_ID}`, {
  headers: { 'user-agent': UA, 'accept': 'text/html', 'accept-language': 'zh-CN,zh;q=0.9' }
})
mergeCookies(page, jar)
console.log('分享页 HTTP', page.status, '| cookie:', Object.keys(jar))

for (const [label, bizId] of [['ai_qwen', 'ai_qwen'], ['空', ''], ['qwen', 'qwen'], ['tongyi', 'tongyi']]) {
  for (const withCookie of [true, false]) {
    const headers = {
      'user-agent': UA,
      'content-type': 'application/json',
      'accept': 'application/json, text/plain, */*',
      'referer': `https://qianwen.my.cn/share/chat/${SHARE_ID}`,
      'origin': 'https://qianwen.my.cn'
    }
    if (withCookie && Object.keys(jar).length) headers.cookie = cookieHeader(jar)

    try {
      const response = await fetch(URL_SHARE, {
        method: 'POST',
        headers,
        body: JSON.stringify({ share_id: SHARE_ID, biz_id: bizId })
      })
      const text = await response.text()
      console.log(`\nbiz_id=${label.padEnd(8)} cookie=${withCookie ? 'Y' : 'N'} -> HTTP ${response.status} ${(text.length / 1024).toFixed(1)}KB`)
      console.log('  ', text.slice(0, 220).replace(/\s+/g, ' '))
      if (response.status === 200 && text.length > 200) {
        writeFileSync(new URL('./_share-info.json', import.meta.url), text)
        console.log('  >>> 已保存 _share-info.json')
      }
    }
    catch (error) {
      console.log(`\nbiz_id=${label} cookie=${withCookie} ERR ${String(error).slice(0, 80)}`)
    }
  }
}
