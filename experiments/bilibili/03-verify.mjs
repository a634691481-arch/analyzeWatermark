/**
 * B 站探针 3：验证 durl 单文件 mp4 是否真能下、是否含音轨、实际分辨率
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BVID = 'BV1uDe16vE51'
const CID = '41993375204'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const API_HEADERS = {
  'user-agent': UA,
  'referer': 'https://www.bilibili.com/',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9'
}

const OUT = new URL('./_media/', import.meta.url)
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

/** 试不同 qn（清晰度）在 durl 端点下的实际结果 */
console.log('=== durl 端点下各清晰度实测 ===')
const results = []
for (const [qn, label] of [[127, '最高'], [120, '4K'], [116, '1080P60'], [112, '1080P+'], [80, '1080P'], [64, '720P'], [32, '480P'], [16, '360P']]) {
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${BVID}&cid=${CID}&qn=${qn}&fnval=0`
  try {
    const payload = await (await fetch(url, { headers: API_HEADERS })).json()
    if (payload.code !== 0) {
      console.log(`  qn=${String(qn).padEnd(4)} ${label.padEnd(8)} code=${payload.code} ${payload.message}`)
      continue
    }
    const seg = payload.data?.durl?.[0]
    const quality = payload.data?.quality
    const format = payload.data?.format
    console.log(`  qn=${String(qn).padEnd(4)} ${label.padEnd(8)} 实得 quality=${String(quality).padEnd(4)} format=${String(format).padEnd(8)} ${seg ? (seg.size / 1024 / 1024).toFixed(1) + 'MB' : '(无 durl)'}`)
    if (seg) results.push({ qn, quality, format, seg })
  }
  catch (error) {
    console.log(`  qn=${qn} ERR ${String(error).slice(0, 60)}`)
  }
}

/** 取最高清晰度的那个下载下来做规格检查 */
const best = results[0]
if (!best) {
  console.log('\n没有可下载的 durl')
  process.exit(1)
}

console.log(`\n=== 下载 qn=${best.qn}（quality=${best.quality}）并校验 ===`)
const videoUrl = best.seg.url
const response = await fetch(videoUrl, {
  headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' }
})
console.log('  HTTP', response.status, '| type', response.headers.get('content-type'), '| length', response.headers.get('content-length'))
const buffer = Buffer.from(await response.arrayBuffer())
const file = new URL('./video-720p.mp4', OUT)
writeFileSync(file, buffer)
console.log('  bytes:', buffer.length, '| 前 12 字节:', buffer.subarray(0, 12).toString('hex'))

try {
  const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_type,codec_name,width,height', '-of', 'csv=p=0', fileURLToPath(file)]).toString().trim()
  console.log('  ffprobe 流列表:')
  streams.split('\n').forEach(line => console.log('    ', line))
  const hasAudio = streams.includes('audio')
  const hasVideo = streams.includes('video')
  console.log(`  >>> 含视频轨: ${hasVideo} | 含音频轨: ${hasAudio} | ${hasVideo && hasAudio ? '音视频合一 ✅' : '不完整 ❌'}`)
}
catch (error) {
  console.log('  ffprobe 失败:', String(error).slice(0, 200))
}

/** 是否被 B 站烧了水印：抽多帧看四角是否恒定不变（静态 logo 特征） */
console.log('\n=== 水印排查：抽 5 帧看四角的时间方差 ===')
try {
  const W = 640
  const H = 360
  const frames = []
  for (const t of [5, 20, 40, 80, 150]) {
    const raw = execFileSync('ffmpeg', [
      '-v', 'error', '-ss', String(t), '-i', fileURLToPath(file),
      '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
    ], { maxBuffer: 64 * 1024 * 1024 })
    frames.push(raw)
  }
  // 四个角各取 120x60 区域，算跨帧方差
  const regions = {
    '左上': [0, 0],
    '右上': [W - 120, 0],
    '左下': [0, H - 60],
    '右下': [W - 120, H - 60]
  }
  for (const [name, [ox, oy]] of Object.entries(regions)) {
    const values = []
    for (let y = oy; y < oy + 60; y += 4) {
      for (let x = ox; x < ox + 120; x += 4) {
        const i = (y * W + x) * 3
        values.push(frames.map(f => (f[i] + f[i + 1] + f[i + 2]) / 3))
      }
    }
    // 每个采样点跨 5 帧的方差，再取均值
    let totalVar = 0
    for (const series of values) {
      const mean = series.reduce((a, b) => a + b, 0) / series.length
      totalVar += series.reduce((a, v) => a + (v - mean) ** 2, 0) / series.length
    }
    const avgVar = totalVar / values.length
    let totalMean = 0
    for (const series of values) totalMean += series.reduce((a, b) => a + b, 0) / series.length
    console.log(`  ${name}  跨帧方差=${avgVar.toFixed(1).padStart(8)}  平均亮度=${(totalMean / values.length).toFixed(1)}`)
  }
  console.log('  （方差接近 0 且亮度高 → 疑似静态叠加层；方差大 → 画面内容）')
}
catch (error) {
  console.log('  抽帧失败:', String(error).slice(0, 160))
}
