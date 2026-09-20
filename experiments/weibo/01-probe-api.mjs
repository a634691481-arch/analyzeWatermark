import { getVisitorCookie, pcHeaders } from './lib.mjs'

const OID = '1034:5342648219926608'
const PAGE = `/tv/show/${OID}`
const REFERER = `https://weibo.com/tv/show/${OID}`

const cookie = await getVisitorCookie()
console.log('cookie ok:', cookie.slice(0, 30), '...')

const dataCandidates = [
  { Component_Play_Playinfo: { oid: OID } },
  { Component_Play_Playinfo: { oid: OID, page: PAGE } },
  { Component_Play_Playinfo: { oid: OID, from: 'old_pc_videoshow' } }
]

const probes = []
for (const [i, data] of dataCandidates.entries()) {
  probes.push([
    `data#${i}`,
    `https://weibo.com/tv/api/component?page=${encodeURIComponent(PAGE)}&data=${encodeURIComponent(JSON.stringify(data))}`
  ])
}
probes.push(['ajax-show', `https://weibo.com/ajax/statuses/show?id=${OID.split(':')[1]}`])
probes.push(['component-v2', `https://weibo.com/tv/api/v2/component?page=${encodeURIComponent(PAGE)}&data=${encodeURIComponent(JSON.stringify({ Component_Play_Playinfo: { oid: OID } }))}`])

for (const [name, url] of probes) {
  try {
    const res = await fetch(url, { headers: pcHeaders(cookie, REFERER) })
    const body = await res.text()
    console.log(`\n=== ${name} ${res.status} len=${body.length}`)
    console.log(body.slice(0, 500).replace(/\s+/g, ' '))
  }
  catch (error) {
    console.log(`\n=== ${name} ERR ${error.message}`)
  }
}
