// 探针 6：端到端回归 —— 纯链接 / 带 query / 整段分享文案
const ENDPOINT = 'http://localhost:3000/api/parse'
const THREAD = 'https://www.doubao.com/thread/xTOlFYCgraKkBExtJ'

const cases = [
  { name: '纯链接', url: THREAD },
  { name: '带 query', url: `${THREAD}?share_id=abc123&from=share` },
  { name: '整段文案（中文逗号紧跟）', url: `6.48 复制打开豆包，看看【怀远三绝创新产品摄影】 ${THREAD}，复制本条信息` },
  { name: '整段文案（换行分隔）', url: `怀远三绝创新产品摄影\n${THREAD}\n复制链接打开豆包` },
]

for (const c of cases) {
  const started = Date.now()
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: c.url })
  })
  const json = await res.json()
  const ms = Date.now() - started
  if (json.ok) {
    console.log(`PASS  ${c.name.padEnd(18)} ${json.data.media.length} imgs  ${json.data.title}  ${ms}ms`)
  }
  else {
    console.log(`FAIL  ${c.name.padEnd(18)} ${json.error.code} ${json.error.message}  ${ms}ms`)
  }
}
