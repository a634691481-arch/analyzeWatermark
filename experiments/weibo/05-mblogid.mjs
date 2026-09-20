import { getVisitorCookie, pcHeaders } from './lib.mjs'

const cookie = await getVisitorCookie()
const h = pcHeaders(cookie, 'https://weibo.com/')

const probes = [
  ['mblogid', 'https://weibo.com/ajax/statuses/show?id=RhTtIg4XS'],
  ['mblogid-longtext', 'https://weibo.com/ajax/statuses/longtext?id=RhTtIg4XS'],
  ['component-by-mblogid', `https://weibo.com/tv/api/component?page=${encodeURIComponent('/tv/show/RhTtIg4XS')}&data=${encodeURIComponent(JSON.stringify({ Component_Play_Playinfo: { oid: 'RhTtIg4XS' } }))}`]
]

for (const [name, url] of probes) {
  const res = await fetch(url, { headers: h })
  const body = await res.text()
  console.log(`\n=== ${name} ${res.status} len=${body.length}`)
  console.log(body.slice(0, 260).replace(/\s+/g, ' '))
  if (body.startsWith('{"visible')) {
    const s = JSON.parse(body)
    console.log('  mblogid:', s.mblogid, '| id:', s.id, '| has video page_info:', Boolean(s.page_info?.object_type))
    console.log('  media_info stream_url:', s.page_info?.media_info?.stream_url?.slice(0, 80))
  }
}
