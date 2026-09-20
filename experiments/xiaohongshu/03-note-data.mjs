/** 小红书探针 3：noteData 结构 */
import { readFileSync, writeFileSync } from 'node:fs'

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
  const sanitized = literal
    .replace(/:\s*undefined(?=[,}])/g, ':null')
    .replace(/\[\s*undefined(?=[,\]])/g, '[null')
    .replace(/,\s*undefined(?=[,\]])/g, ',null')
  return JSON.parse(sanitized)
}

const html = readFileSync(new URL('./_page-移动端.html', import.meta.url), 'utf8')
const state = parseXhsState(readObjectLiteral(html, '__INITIAL_STATE__='))

console.log('=== noteData ===')
console.log('keys:', Object.keys(state.noteData))
writeFileSync(new URL('./_note-data.json', import.meta.url), JSON.stringify(state.noteData, null, 2))

const detailMap = state.noteData.noteDetailMap
console.log('noteDetailMap keys:', Object.keys(detailMap ?? {}))

const entry = Object.values(detailMap ?? {})[0]
console.log('entry keys:', entry ? Object.keys(entry) : null)

const detail = entry?.note
if (!detail) {
  console.log('\n没有 entry.note，完整 entry:')
  console.log(JSON.stringify(entry, null, 2).slice(0, 2500))
  process.exit(0)
}

console.log('\n=== note detail ===')
console.log('keys:', Object.keys(detail))
console.log('noteId:', detail.noteId)
console.log('type:', detail.type, '(normal=图文 / video=视频)')
console.log('title:', detail.title)
console.log('desc:', String(detail.desc).slice(0, 100))
console.log('user:', detail.user?.nickname, '|', detail.user?.userId)
console.log('imageList:', detail.imageList?.length ?? 0)
console.log('video:', detail.video ? '有' : '无')
writeFileSync(new URL('./_note-detail.json', import.meta.url), JSON.stringify(detail, null, 2))
