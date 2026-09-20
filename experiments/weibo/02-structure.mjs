import { writeFileSync } from 'node:fs'
import { getVisitorCookie, pcHeaders } from './lib.mjs'

const OID = '1034:5342648219926608'
const PAGE = `/tv/show/${OID}`

const cookie = await getVisitorCookie()
const url = `https://weibo.com/tv/api/component?page=${encodeURIComponent(PAGE)}`
  + `&data=${encodeURIComponent(JSON.stringify({ Component_Play_Playinfo: { oid: OID } }))}`

const res = await fetch(url, { headers: pcHeaders(cookie, `https://weibo.com/tv/show/${OID}`) })
const json = await res.json()
writeFileSync(new URL('./_component.json', import.meta.url), JSON.stringify(json, null, 2))

const info = json.data.Component_Play_Playinfo
console.log('title:', info.title)
console.log('author:', info.author)
console.log('keys:', Object.keys(info).join(', '))
console.log('\nmedia_info:', JSON.stringify(info.media_info, null, 2)?.slice(0, 3000))
console.log('\npage_info:', JSON.stringify(info.page_info, null, 2)?.slice(0, 1500))
console.log('\nurl keys sample:', JSON.stringify(Object.fromEntries(Object.entries(info).filter(([, v]) => typeof v === 'string' && /http/.test(v))), null, 2))
