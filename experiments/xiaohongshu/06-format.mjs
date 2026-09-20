/** 小红书探针 6：原图真实格式 + 更多模板试探 */
import { writeFileSync } from 'node:fs'

const FILE_ID = 'note_pre_post_uhdr/1040g3r8325b1t5kt4q905na2gfhlg8e9cm7bn4o'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** 按魔术字节判断真实格式 */
function sniff(buffer) {
  if (buffer.length < 12) return 'too-small'
  const hex = buffer.subarray(0, 12).toString('hex')
  const ascii = buffer.subarray(0, 12).toString('latin1')
  if (hex.startsWith('ffd8ff')) return 'JPEG'
  if (hex.startsWith('89504e47')) return 'PNG'
  if (hex.startsWith('52494646') && ascii.slice(8, 12) === 'WEBP') return 'WEBP'
  if (ascii.slice(4, 12).includes('ftypheic') || ascii.slice(4, 12).includes('ftypheix') || ascii.slice(4, 12).includes('ftypmif1')) return 'HEIC/HEIF'
  if (ascii.slice(4, 8) === 'ftyp') return `ISOBMFF(${ascii.slice(8, 12)})`
  return `未知(${hex.slice(0, 16)})`
}

const TEMPLATES = ['', '!h5_1080jpg', '!h5_2160jpg', '!h5_2kjpg', '!nd_dft_wgth_webp_3', '!nd_dft_wlteh_jpg_3', '!nd_dft_wlteh_webp_3', '!w1080', '!large']

console.log('=== sns-img-bd 各模板 ===')
for (const template of TEMPLATES) {
  const url = `https://sns-img-bd.xhscdn.com/${FILE_ID}${template}`
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA } })
    if (response.status !== 200) {
      console.log(`  ${String(template || '(无后缀)').padEnd(24)} HTTP ${response.status}`)
      continue
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    console.log(`  ${String(template || '(无后缀)').padEnd(24)} 200 ${String(response.headers.get('content-type')).padEnd(26)} ${(buffer.length / 1024).toFixed(0)}KB 实际格式=${sniff(buffer)}`)
    if (!template) writeFileSync(new URL('./_artifacts-original.bin', import.meta.url), buffer)
  }
  catch (error) {
    console.log(`  ${String(template || '(无后缀)').padEnd(24)} ERR ${String(error).slice(0, 50)}`)
  }
}

console.log('\n=== 用 ffprobe 读原图真实尺寸 ===')
try {
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const file = fileURLToPath(new URL('./_artifacts-original.bin', import.meta.url))
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'csv=p=0', file]).toString().trim()
  console.log('  原图:', out, '(声明尺寸 4284x5712)')
}
catch (error) {
  console.log('  ffprobe 失败:', String(error).slice(0, 150))
}

console.log('\n=== 对比 H5 1080 版尺寸 ===')
try {
  const { execFileSync } = await import('node:child_process')
  const { writeFileSync: ws } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const h5 = 'http://sns-webpic-qc.xhscdn.com/202609201439/17866ed7909b16741510721b7d7c4221/note_pre_post_uhdr/1040g3r8325b1t5kt4q905na2gfhlg8e9cm7bn4o!h5_1080jpg'
  const response = await fetch(h5, { headers: { 'user-agent': UA } })
  const buffer = Buffer.from(await response.arrayBuffer())
  const file = fileURLToPath(new URL('./_artifacts-h5.jpg', import.meta.url))
  ws(file, buffer)
  console.log('  H5 版:', execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'csv=p=0', file]).toString().trim(), `${(buffer.length / 1024).toFixed(0)}KB`)
}
catch (error) {
  console.log('  失败:', String(error).slice(0, 150))
}
