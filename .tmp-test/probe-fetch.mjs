const url = 'https://www.doubao.com/thread/xsADfnc82MMJBxiJJ'

const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9'
  },
  redirect: 'follow'
})
const html = await res.text()
console.log('status', res.status, 'bytes', html.length)
console.log('has _ROUTER_DATA:', html.includes('_ROUTER_DATA'))
console.log('has data-fn-args:', html.includes('data-fn-args'))
console.log('has image_ori_raw:', html.includes('image_ori_raw'))
console.log('data-fn-args count:', (html.match(/data-fn-args/g) || []).length)

const pattern = /data-fn-args='([\s\S]*?)'/g
let m
let i = 0
while ((m = pattern.exec(html)) !== null) {
  i++
  console.log('--- match', i, 'len', m[1].length, '---')
  console.log(m[1].slice(0, 120))
  if (i > 3) break
}
console.log('total matches:', i)
