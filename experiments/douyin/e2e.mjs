/**
 * 抖音无水印 · 端到端验证脚本
 *
 * 用法:
 *   node experiments/douyin/e2e.mjs                    # 跑内置的 video + 图文 两个用例
 *   node experiments/douyin/e2e.mjs <shareUrl>         # 跑指定链接
 *   node experiments/douyin/e2e.mjs <shareUrl> --download   # 顺带真下载首条
 *
 * 这份脚本是「服务端适配器」的蓝本：验证通过后按同样的结构搬到
 * server/utils/platform/douyin.ts，逻辑一一对应。
 */
import { createHash } from 'node:crypto'

const MOBILE_UA
  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const DESKTOP_UA
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// ---------------------------------------------------------------- 工具

/** 花括号配对提取对象字面量（字符串内的括号会被跳过） */
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

function mergeCookies(response, jar) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    if (index > 0) jar[pair.slice(0, index).trim()] = pair.slice(index + 1).trim()
  }
  return jar
}
const cookieHeader = jar => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

/** 深度优先遍历，收集所有形如 { url_list: [...] } 的资源对象 */
function walk(node, visit, depth = 0) {
  if (depth > 18 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit, depth + 1)
    return
  }
  visit(node)
  for (const value of Object.values(node)) walk(value, visit, depth + 1)
}

/** 从 SSR 数据里找视频/图集的 item */
function findAwemeItem(payload) {
  let found = null
  walk(payload, (node) => {
    if (found) return
    // item_list 里的是完整作品对象
    if (Array.isArray(node.item_list) && node.item_list.length) {
      found = node.item_list[0]
    }
  })
  return found
}

// ---------------------------------------------------------------- 主流程

/**
 * 1) 手跟跳转链，顺便把 Set-Cookie 收进 jar（ttwid 是风控会话票据）
 * 2) 带上 ttwid 请求分享页，SSR 里才有 videoInfoRes
 */
export async function fetchSharePayload(shareUrl) {
  const jar = {}
  let current = shareUrl
  const chain = [current]

  for (let hop = 0; hop < 6; hop++) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' }
    })
    mergeCookies(response, jar)
    const location = response.headers.get('location')
    if (!location) break
    current = new URL(location, current).href
    chain.push(current)
  }

  // 没拿到 ttwid 就去首页补一个
  if (!jar.ttwid) {
    const seed = await fetch('https://www.iesdouyin.com/', {
      redirect: 'manual',
      headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9' }
    })
    mergeCookies(seed, jar)
  }

  const response = await fetch(current, {
    redirect: 'manual',
    headers: {
      'user-agent': MOBILE_UA,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
      'cookie': cookieHeader(jar),
      'referer': 'https://www.douyin.com/'
    }
  })
  mergeCookies(response, jar)

  if (!response.ok) {
    throw new Error(`分享页返回 HTTP ${response.status}`)
  }

  const html = await response.text()
  const literal = readObjectLiteral(html, '_ROUTER_DATA = ')
  if (!literal) {
    throw new Error('页面里没有 _ROUTER_DATA，可能是链接失效或风控升级')
  }

  const payload = JSON.parse(literal)
  const item = findAwemeItem(payload)
  if (!item) {
    throw new Error('SSR 数据里没有 item_list（ttwid 可能无效）')
  }

  return { chain, jar, html, payload, item, hadTtwid: Boolean(jar.ttwid) }
}

/** 视频：playwm -> play；图片：url_list 就是无水印 */
function normalize(item) {
  const images = Array.isArray(item.images) ? item.images : []
  const isImagePost = images.length > 0

  const media = []
  if (isImagePost) {
    images.forEach((image, index) => {
      const cleanList = image.url_list ?? []
      const waterList = image.download_url_list ?? []
      // jpeg 兼容性最好，优先；否则退回第一个
      const pick = cleanList.find(url => /\.jpe?g(\?|$)/i.test(url)) ?? cleanList[0]
      const pickWater = waterList.find(url => /\.jpe?g(\?|$)/i.test(url)) ?? waterList[0]
      media.push({
        index: index + 1,
        type: 'image',
        url: pick,
        watermarkUrl: pickWater,
        width: image.width,
        height: image.height,
        watermarkFree: Boolean(pick) && !/-water/i.test(pick ?? '')
      })
    })
  }
  else if (item.video?.play_addr?.url_list?.length) {
    const waterUrl = item.video.play_addr.url_list[0]
    const cleanUrl = waterUrl.replace('/playwm/', '/play/')
    media.push({
      index: 1,
      type: 'video',
      url: cleanUrl,
      watermarkUrl: waterUrl,
      cover: item.video.cover?.url_list?.[0],
      width: item.video.width,
      height: item.video.height,
      duration: item.video.duration,
      watermarkFree: cleanUrl !== waterUrl
    })
  }

  return {
    awemeId: item.aweme_id,
    title: item.desc,
    author: item.author?.nickname,
    isImagePost,
    media
  }
}

// ---------------------------------------------------------------- 校验

const HEADERS = { 'user-agent': DESKTOP_UA, referer: 'https://www.douyin.com/' }

async function verifyDownloadable(entry, label) {
  const response = await fetch(entry.url, { headers: HEADERS, redirect: 'follow' })
  const buffer = Buffer.from(await response.arrayBuffer())
  const ok = response.ok && buffer.length > 1024
  console.log(
    `    ${ok ? 'PASS' : 'FAIL'}  #${entry.index} ${entry.type.padEnd(5)} `
    + `HTTP ${response.status} ${response.headers.get('content-type')} `
    + `${(buffer.length / 1024 / 1024).toFixed(2)}MB sha256:${createHash('sha256').update(buffer).digest('hex').slice(0, 12)}`
  )
  if (!ok) console.log('           url:', entry.url.slice(0, 140))
  return ok
}

const CASES = [
  { label: '视频帖', url: 'https://v.douyin.com/PJIP6J56t8Y/' },
  { label: '图文帖', url: 'https://v.douyin.com/lZGNcAGUqsY/' }
]

async function run(shareUrl, options = {}) {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`分享链接: ${shareUrl}`)
  const result = await fetchSharePayload(shareUrl)
  console.log(`跳转链: ${result.chain.length} 跳 | ttwid: ${result.hadTtwid ? '有' : '无'} | SSR: ${(result.html.length / 1024).toFixed(0)}KB`)

  const data = normalize(result.item)
  console.log(`类型: ${data.isImagePost ? '图文(图集)' : '视频'} | aweme_id: ${data.awemeId}`)
  console.log(`作者: ${data.author}`)
  console.log(`标题: ${String(data.title).slice(0, 60)}`)
  console.log(`解析出 ${data.media.length} 个媒体:`)

  for (const entry of data.media.slice(0, 3)) {
    console.log(`  #${entry.index} ${entry.type} ${entry.width}x${entry.height}${entry.duration ? ` ${(entry.duration / 1000).toFixed(1)}s` : ''} 无水印=${entry.watermarkFree}`)
    console.log(`      clean: ${entry.url.slice(0, 130)}`)
    if (entry.watermarkUrl) console.log(`      water: ${entry.watermarkUrl.slice(0, 130)}`)
  }
  if (data.media.length > 3) console.log(`  ... 其余 ${data.media.length - 3} 个略`)

  const checks = [
    data.media.length > 0,
    data.media.every(entry => typeof entry.url === 'string' && /^https?:\/\//.test(entry.url)),
    data.media.every(entry => entry.watermarkFree),
    Boolean(data.awemeId)
  ]

  if (options.download) {
    console.log('  下载校验:')
    const sample = data.media.slice(0, options.downloadAll ? data.media.length : 1)
    for (const entry of sample) {
      checks.push(await verifyDownloadable(entry, data.awemeId))
    }
  }

  const pass = checks.every(Boolean)
  console.log(`\n结果: ${pass ? '✅ PASS' : '❌ FAIL'}`)
  return { pass, data }
}

const argv = process.argv.slice(2)
const flags = new Set(argv.filter(item => item.startsWith('--')))
const urls = argv.filter(item => !item.startsWith('--'))
const targets = urls.length ? urls.map(url => ({ label: '指定链接', url })) : CASES

let allPass = true
for (const target of targets) {
  try {
    const { pass } = await run(target.url, {
      download: flags.has('--download'),
      downloadAll: flags.has('--all')
    })
    if (!pass) allPass = false
  }
  catch (error) {
    allPass = false
    console.log(`结果: ❌ FAIL  异常: ${error.message}`)
  }
}

console.log(`\n${'='.repeat(72)}`)
console.log(allPass ? '全部用例通过 ✅' : '存在失败用例 ❌')
process.exit(allPass ? 0 : 1)
