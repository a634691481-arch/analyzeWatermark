/**
 * 小红书探针 2：拆 __INITIAL_STATE__，找图片/视频数据
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** 花括号配对提取对象字面量 */
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

/** 小红书的 __INITIAL_STATE__ 里含 JS 的 undefined 字面量，不是严格 JSON */
function parseXhsState(literal) {
  const sanitized = literal
    .replace(/:\s*undefined(?=[,}])/g, ':null')
    .replace(/\[\s*undefined(?=[,\]])/g, '[null')
    .replace(/,\s*undefined(?=[,\]])/g, ',null')
  return JSON.parse(sanitized)
}

const html = readFileSync(new URL('./_page-移动端.html', import.meta.url), 'utf8')
const literal = readObjectLiteral(html, '__INITIAL_STATE__=')
  ?? readObjectLiteral(html, '__INITIAL_STATE__ =')
  ?? readObjectLiteral(html, '__INITIAL_STATE__=')

console.log('literal 长度:', literal ? literal.length : null)
if (!literal) {
  console.log('没找到 __INITIAL_STATE__，上下文:')
  console.log(JSON.stringify(html.slice(Math.max(0, html.indexOf('__INITIAL_STATE__') - 200), html.indexOf('__INITIAL_STATE__') + 300)))
  process.exit(1)
}

let state
try {
  state = parseXhsState(literal)
}
catch (error) {
  console.log('JSON.parse 失败:', String(error).slice(0, 200))
  writeFileSync(new URL('./_initial-state-raw.txt', import.meta.url), literal)
  // 定位出错位置
  const match = /position (\d+)/.exec(String(error))
  if (match) {
    const at = Number(match[1])
    console.log('出错处上下文:', JSON.stringify(literal.slice(Math.max(0, at - 150), at + 150)))
  }
  process.exit(1)
}

console.log('顶层 keys:', Object.keys(state))
writeFileSync(new URL('./_initial-state.json', import.meta.url), JSON.stringify(state, null, 2))

const note = state.note
console.log('\nnote keys:', note ? Object.keys(note) : null)
if (note?.noteDetailMap) {
  console.log('noteDetailMap keys:', Object.keys(note.noteDetailMap))
  const first = Object.values(note.noteDetailMap)[0]
  console.log('第一个 entry keys:', Object.keys(first))
  const detail = first?.note
  console.log('\nnote detail keys:', detail ? Object.keys(detail) : null)
  if (detail) {
    console.log('noteId:', detail.noteId)
    console.log('type:', detail.type, '(normal=图文, video=视频)')
    console.log('title:', detail.title)
    console.log('desc:', String(detail.desc).slice(0, 80))
    console.log('user:', detail.user?.nickname, '| userId:', detail.user?.userId)
    console.log('imageList 数量:', detail.imageList?.length ?? 0)
    console.log('有 video:', Boolean(detail.video))
    writeFileSync(new URL('./_note-detail.json', import.meta.url), JSON.stringify(detail, null, 2))
  }
}
