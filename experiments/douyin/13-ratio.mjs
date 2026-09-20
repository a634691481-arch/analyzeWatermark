/** 探针 13：ratio 参数能否调高清 */
import { execFileSync } from 'node:child_process'

const VIDEO_ID = 'v0200fg10000damg43nog65nt2g9f65g'
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'referer': 'https://www.douyin.com/'
}

for (const ratio of ['720p', '1080p', '2160p', 'origin']) {
  const url = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${VIDEO_ID}&ratio=${ratio}&line=0`
  try {
    // 只要响应头，不下载全量
    const response = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    const length = response.headers.get('content-length')
    console.log(`ratio=${ratio.padEnd(6)} HTTP ${response.status} | ${response.headers.get('content-type')} | ${length ? (Number(length) / 1024 / 1024).toFixed(2) + 'MB' : 'unknown'}`)

    // 读前面一段判断是否真是视频
    const reader = response.body.getReader()
    const { value } = await reader.read()
    await reader.cancel()
    console.log(`         前 12 字节: ${Buffer.from(value?.slice(0, 12) ?? []).toString('hex')}`)
  }
  catch (error) {
    console.log(`ratio=${ratio} 失败: ${String(error).slice(0, 100)}`)
  }
}

/** 对 1080p 做一次真实规格检查 */
console.log('\n=== 下载 1080p 实测规格 ===')
const url1080 = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${VIDEO_ID}&ratio=1080p&line=0`
const response = await fetch(url1080, { headers: HEADERS, redirect: 'follow' })
const buffer = Buffer.from(await response.arrayBuffer())
const { writeFileSync } = await import('node:fs')
const file = new URL('./_artifacts/play-1080p.mp4', import.meta.url)
writeFileSync(file, buffer)
console.log('bytes:', buffer.length)
try {
  console.log(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,bit_rate', '-of', 'default=noprint_wrappers=1', file.pathname.replace(/^\//, '')]).toString().trim())
}
catch (error) {
  console.log('ffprobe 失败:', String(error).slice(0, 120))
}
