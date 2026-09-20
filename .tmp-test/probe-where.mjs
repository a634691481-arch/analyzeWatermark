const url = 'https://www.doubao.com/thread/xsADfnc82MMJBxiJJ'
const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
})
const html = await res.text()

console.log('=== where is image_ori_raw ===')
let i = -1
let n = 0
while ((i = html.indexOf('image_ori_raw', i + 1)) !== -1 && n < 3) {
  n++
  console.log('---', n, 'at', i, '---')
  console.log(JSON.stringify(html.slice(Math.max(0, i - 700), i + 120)))
}

console.log('\n=== script tags containing it ===')
const k = html.indexOf('image_ori_raw')
const before = html.slice(0, k)
const lastScript = before.lastIndexOf('<script')
console.log(JSON.stringify(html.slice(lastScript, lastScript + 500)))
