/**
 * 探针 6：验证不同链接形态都能拿到数据
 *   1) v.kuaishou.com 短链
 *   2) www.kuaishou.com/short-video/{id}
 *   3) m.gifshow.com/fw/photo/{id}
 *   4) v.m.chenzhongtech.com/fw/photo/{id} 不带任何 query
 */
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function extractLiteral(html, marker) {
  const start = html.indexOf(marker)
  if (start === -1) return null
  const begin = start + marker.length
  if (html[begin] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  let quote = ''
  for (let i = begin; i < html.length; i++) {
    const char = html[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (char === '\\') { escaped = true; continue }
      if (char === quote) inString = false
      continue
    }
    if (char === '"' || char === "'") { inString = true; quote = char; continue }
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return html.slice(begin, i + 1)
    }
  }
  return null
}

function findPhoto(state) {
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && value.photo) return value.photo
  }
  return null
}

const CASES = [
  'https://v.kuaishou.com/K23oc0R9',
  'https://www.kuaishou.com/short-video/3xb95g2q2kni4w9',
  'https://m.gifshow.com/fw/photo/3xb95g2q2kni4w9',
  'https://v.m.chenzhongtech.com/fw/photo/3xb95g2q2kni4w9'
]

for (const input of CASES) {
  console.log('\n########', input)
  let current = input
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'user-agent': MOBILE_UA } })
    const loc = res.headers.get('location')
    if (!loc) { console.log('final:', current, 'status', res.status); break }
    current = new URL(loc, current).href
  }
  const res = await fetch(current, { headers: { 'user-agent': MOBILE_UA, 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'zh-CN,zh;q=0.9' } })
  const html = await res.text()
  const lit = extractLiteral(html, 'window.INIT_STATE = ')
  const photo = lit ? findPhoto(JSON.parse(lit)) : null
  console.log('html:', html.length, 'INIT_STATE:', Boolean(lit), 'photo:', Boolean(photo))
  if (photo) {
    console.log('caption:', photo.caption)
    console.log('mainMvUrls:', photo.mainMvUrls?.length, 'atlas:', photo.atlas ? `list=${photo.atlas.list?.length}` : 'no', 'singlePicture:', photo.singlePicture, 'stereoType:', photo.stereoType)
  }
}
