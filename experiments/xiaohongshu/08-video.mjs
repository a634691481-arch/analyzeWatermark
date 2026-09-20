/**
 * 小红书探针 8：视频笔记的数据形态
 * 用页内 relatedNotes 里的视频笔记 id 试（不带 xsec_token 看是否也能拿到 SSR）
 */
import { writeFileSync } from 'node:fs'

const NOTE_ID = process.argv[2] || '6aacc7560000000012002336'

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function readObjectLiteral(source, marker) {
  const start = source.indexOf(marker)
  if (start === -1) return null
  const begin = start + marker.length
  if (source[begin] !== '{') return null
  let depth = 0
  let inString = false
  let escaped = false
  let quote = ''
  for (let i = begin; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(begin, i + 1)
    }
  }
  return null
}

function parseXhsState(literal) {
  return JSON.parse(
    literal
      .replace(/:\s*undefined(?=[,}])/g, ':null')
      .replace(/\[\s*undefined(?=[,\]])/g, '[null')
      .replace(/,\s*undefined(?=[,\]])/g, ',null')
  )
}

for (const [label, url] of [
  ['不带 token', `https://www.xiaohongshu.com/discovery/item/${NOTE_ID}`],
  ['explore 路由', `https://www.xiaohongshu.com/explore/${NOTE_ID}`]
]) {
  console.log(`\n=== ${label}: ${url} ===`)
  const response = await fetch(url, {
    redirect: 'manual',
    headers: {
      'user-agent': MOBILE_UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
      'referer': 'https://www.xiaohongshu.com/'
    }
  })
  const html = await response.text()
  console.log(`HTTP ${response.status} | ${(html.length / 1024).toFixed(0)}KB | location: ${response.headers.get('location')}`)

  const literal = readObjectLiteral(html, '__INITIAL_STATE__=')
  if (!literal) {
    console.log('  没有 __INITIAL_STATE__')
    writeFileSync(new URL('./_page-video-attempt.html', import.meta.url), html)
    continue
  }

  const state = parseXhsState(literal)
  const detail = state.noteData?.data?.noteData
  console.log('  noteId:', detail?.noteId, '| type:', detail?.type)
  if (!detail) {
    console.log('  noteData 为空，hasError:', state.noteData?.hasError, '| keys:', Object.keys(state.noteData ?? {}))
    continue
  }

  writeFileSync(new URL('./_note-video.json', import.meta.url), JSON.stringify(detail, null, 2))
  console.log('  title:', detail.title)
  console.log('  imageList:', detail.imageList?.length ?? 0)
  console.log('  video:', detail.video ? '有' : '无')
  if (detail.video) {
    console.log('  video keys:', Object.keys(detail.video).join(', '))
    console.log('  consumer keys:', Object.keys(detail.video.consumer ?? {}).join(', '))
    console.log('  originVideoKey:', detail.video.consumer?.originVideoKey)
    const streams = detail.video.media?.stream ?? {}
    console.log('  stream keys:', Object.keys(streams).join(', '))
    for (const [codec, list] of Object.entries(streams)) {
      if (Array.isArray(list)) {
        list.slice(0, 2).forEach((item, index) => {
          console.log(`    ${codec}[${index}] masterUrl=${String(item.masterUrl).slice(0, 110)}`)
          if (item.backupUrls?.length) console.log(`              backup=${String(item.backupUrls[0]).slice(0, 100)}`)
        })
      }
    }
  }
}
