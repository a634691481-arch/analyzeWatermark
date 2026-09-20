/**
 * 探针 2：把候选视频下载下来抽帧，肉眼看有没有水印
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FFMPEG = 'C:/Users/63469/AppData/Local/Temp/opencode/ff2/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'
const OUT = new URL('./_artifacts/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

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

const html = readFileSync(new URL('./_page.html', import.meta.url), 'utf8')
const state = JSON.parse(extractLiteral(html, 'window.INIT_STATE = '))
let photo
for (const value of Object.values(state)) {
  if (value && typeof value === 'object' && value.photo) photo = value.photo
}

const reps = photo.manifest.adaptationSet[0].representation
console.log('caption:', photo.caption)
console.log('userName:', photo.userName)
console.log('mainMvUrls:', photo.mainMvUrls.map(u => u.url))
console.log('representations:', reps.map(r => ({ id: r.id, codec: r.videoCodec, quality: r.qualityType, size: r.fileSize, url: r.url.slice(0, 120) })))

const HEADERS = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }

async function download(name, url) {
  const res = await fetch(url, { headers: HEADERS })
  console.log(`\n${name} status=${res.status} type=${res.headers.get('content-type')} len=${res.headers.get('content-length')}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const file = new URL(`./${name}.mp4`, OUT)
  writeFileSync(file, buf)
  console.log(`${name} bytes=${buf.length}`)
  return file
}

const main = await download('main_b', photo.mainMvUrls[0].url)
const ultra = await download('mz_v6ultra', reps[2].url)
const high = await download('mz_v6high', reps[1].url)

function frame(mp4, seconds, outPng) {
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(seconds), '-i', fileURLToPath(mp4), '-frames:v', '1', fileURLToPath(outPng)])
  console.log('frame written', outPng.pathname)
}

for (const [label, file] of [['main_b', main], ['mz_v6ultra', ultra], ['mz_v6high', high]]) {
  for (const t of [1, 3]) {
    frame(file, t, new URL(`./frame_${label}_${t}s.png`, OUT))
  }
}
