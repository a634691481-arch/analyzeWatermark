// 探针 7：确认 URL 截断修复对其它平台同样生效
// 判据：能不能「提取出链接并交给对应适配器」——
//   UNSUPPORTED_PLATFORM = 链接提取成功，只是没这个平台（预期）
//   INVALID_URL         = 链接没提取出来（修复前的中文逗号问题）
const ENDPOINT = 'http://localhost:3000/api/parse'

const cases = [
  { name: '未知平台 + 中文逗号', url: 'https://example.com/share/abc，复制本条信息' },
  { name: '小红书 + 中文逗号', url: '87 某某发布了一篇小红书笔记，快来看吧！😆 http://xhslink.com/a/abcd1234，复制本条信息' },
  { name: '抖音 + 尾部参数', url: '6.48 复制打开抖音，看看【xxx的作品】 https://v.douyin.com/iRNBho6u/ rEu:/ 09/27' },
  { name: '无协议裸域名', url: 'v.douyin.com/iRNBho6u/' },
  { name: '文案里没有链接', url: '这段文字里面根本没有链接' },
]

for (const c of cases) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: c.url })
  })
  const json = await res.json()
  const code = json.ok ? 'OK' : json.error.code
  const msg = json.ok ? `${json.data.media.length} imgs` : json.error.message.slice(0, 60)
  console.log(`${code.padEnd(22)} ${c.name.padEnd(20)} ${msg}`)
}
