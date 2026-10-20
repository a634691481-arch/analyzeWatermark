// 探针 12：lr 参数是否可剥离（判断有无真正无水印流）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BASE = process.argv[2]

if (!BASE) {
  console.log('usage: node 12-lr-strip.mjs "<download_url>"')
  process.exit(0)
}

const variants = [
  ['原样', BASE],
  ['去掉 lr', (() => { const u = new URL(BASE); u.searchParams.delete('lr'); return u.href })()],
  ['lr 置空', (() => { const u = new URL(BASE); u.searchParams.set('lr', ''); return u.href })()],
  ['lr=video_gen', (() => { const u = new URL(BASE); u.searchParams.set('lr', 'video_gen'); return u.href })()]
]

for (const [name, url] of variants) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'user-agent': UA, referer: 'https://www.doubao.com/' },
      signal: AbortSignal.timeout(15000)
    })
    console.log(`${name.padEnd(14)} HTTP ${res.status} ${res.headers.get('content-type')} ${res.headers.get('content-length')}B`)
  }
  catch (error) {
    console.log(`${name.padEnd(14)} ERROR ${error.message}`)
  }
}
