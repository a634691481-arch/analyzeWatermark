/** 小红书探针 7：穷举模板，找「大尺寸 JPEG」 */
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FILE_ID = 'note_pre_post_uhdr/1040g3r8325b1t5kt4q905na2gfhlg8e9cm7bn4o'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function sniff(buffer) {
  const hex = buffer.subarray(0, 12).toString('hex')
  const ascii = buffer.subarray(0, 12).toString('latin1')
  if (hex.startsWith('ffd8ff')) return 'JPEG'
  if (hex.startsWith('89504e47')) return 'PNG'
  if (hex.startsWith('52494646') && ascii.slice(8, 12) === 'WEBP') return 'WEBP'
  if (ascii.slice(4, 12).includes('heic') || ascii.slice(4, 12).includes('heix') || ascii.slice(4, 12).includes('mif1')) return 'HEIC'
  if (ascii.slice(4, 8) === 'ftyp') return `ISO(${ascii.slice(8, 12)})`
  return `?(${hex.slice(0, 12)})`
}

const TEMPLATES = [
  '', '!h5_1080jpg', '!h5_1440jpg', '!h5_2160jpg', '!h5_4kjpg',
  '!nd_dft_wgth_jpg_3', '!nd_dft_wlteh_jpg_3', '!nd_dft_wgth_webp_3', '!nd_dft_wlteh_webp_3',
  '!bd_dft_jpg', '!jpg', '!jpeg', '!h5_1080webp', '!h5_2160webp',
  '!nd_whgtx_wlteh_webp_3', '!nd_whgth_wlteh_webp_3', '!large', '!origin', '!dw', '!prv'
]

const results = []
for (const template of TEMPLATES) {
  const url = `https://sns-img-bd.xhscdn.com/${FILE_ID}${template}`
  try {
    const response = await fetch(url, { headers: { 'user-agent': UA } })
    if (response.status !== 200) {
      results.push({ template: template || '(无)', status: response.status })
      continue
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const format = sniff(buffer)
    let size = ''
    if (format === 'JPEG' || format === 'PNG' || format === 'WEBP') {
      try {
        const file = fileURLToPath(new URL(`./_t${TEMPLATES.indexOf(template)}.bin`, import.meta.url))
        writeFileSync(file, buffer)
        size = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim()
      }
      catch {}
    }
    results.push({ template: template || '(无)', status: 200, format, kb: Math.round(buffer.length / 1024), size })
  }
  catch (error) {
    results.push({ template: template || '(无)', status: 'ERR', error: String(error).slice(0, 40) })
  }
}

for (const item of results) {
  if (item.status !== 200) {
    console.log(`  ${item.template.padEnd(26)} HTTP ${item.status}`)
  }
  else {
    console.log(`  ${item.template.padEnd(26)} 200 ${item.format.padEnd(6)} ${String(item.kb + 'KB').padEnd(9)} ${item.size || '(HEIC 需解码)'}`)
  }
}
