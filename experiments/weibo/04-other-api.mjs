import { writeFileSync } from 'node:fs'
import { getVisitorCookie, pcHeaders } from './lib.mjs'

const OID = '1034:5342648219926608'
const MID = '5342648383832336'

const cookie = await getVisitorCookie()
const h = pcHeaders(cookie, `https://weibo.com/tv/show/${OID}`)

const probes = [
  ['ajax-mid', `https://weibo.com/ajax/statuses/show?id=${MID}&isGetLongText=true`],
  ['ajax-midstr', `https://weibo.com/ajax/statuses/show?id=${OID}`],
  ['detail', `https://weibo.com/ajax/statuses/longtext?id=${MID}`]
]

for (const [name, url] of probes) {
  const res = await fetch(url, { headers: h })
  const body = await res.text()
  console.log(`\n=== ${name} ${res.status} len=${body.length}`)
  console.log(body.slice(0, 300).replace(/\s+/g, ' '))
  if (body.startsWith('{') && body.length > 500) {
    writeFileSync(new URL(`./_${name}.json`, import.meta.url), body)
    try {
      const json = JSON.parse(body)
      const s = json.data ?? json
      console.log('  keys:', Object.keys(s).slice(0, 40).join(', '))
      if (s.page_info) {
        console.log('  page_info.media_info:', JSON.stringify(s.page_info.media_info, null, 2)?.slice(0, 2500))
      }
    }
    catch {}
  }
}
