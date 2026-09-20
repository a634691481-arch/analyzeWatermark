import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getVisitorCookie, pcHeaders } from './lib.mjs'

const OID = '1034:5342648219926608'
const PAGE = `/tv/show/${OID}`

const cookie = await getVisitorCookie()
const res = await fetch(
  `https://weibo.com/tv/api/component?page=${encodeURIComponent(PAGE)}`
  + `&data=${encodeURIComponent(JSON.stringify({ Component_Play_Playinfo: { oid: OID } }))}`,
  { headers: pcHeaders(cookie, `https://weibo.com/tv/show/${OID}`) }
)
const info = (await res.json()).data.Component_Play_Playinfo

const mediaDir = fileURLToPath(new URL('./_media/', import.meta.url))
mkdirSync(mediaDir, { recursive: true })

const variants = [
  ['720p', info.urls['高清 720P']],
  ['480p', info.urls['标清 480P']],
  ['stream', info.stream_url]
]

for (const [name, raw] of variants) {
  if (!raw) continue
  const url = raw.startsWith('//') ? `https:${raw}` : raw
  const file = mediaDir + name + '.mp4'

  const video = await fetch(url, { headers: { 'user-agent': pcHeaders(cookie).user_agent, 'referer': 'https://weibo.com/' } })
  console.log(`\n=== ${name} ${video.status} ${video.headers.get('content-length')} bytes`)
  if (!video.ok) continue

  writeFileSync(file, Buffer.from(await video.arrayBuffer()))
  console.log('   ffprobe:', execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height',
    '-show_entries', 'format=duration,size',
    '-of', 'default=noprint_wrappers=1',
    file
  ], { encoding: 'utf8' }).trim().replace(/\n/g, ' '))

  for (const t of ['1', '18', '35']) {
    const out = `${mediaDir}${name}-t${t}.png`
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t, '-i', file, '-frames:v', '1', out])
    console.log('   frame t=' + t, '->', out)
  }
}
