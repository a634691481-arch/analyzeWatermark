/** 小红书探针 5：试探原图地址与各模板可用性 */
const FILE_ID = 'note_pre_post_uhdr/1040g3r8325b1t5kt4q905na2gfhlg8e9cm7bn4o'
const GIVEN = 'http://sns-webpic-qc.xhscdn.com/202609201439/17866ed7909b16741510721b7d7c4221/note_pre_post_uhdr/1040g3r8325b1t5kt4q905na2gfhlg8e9cm7bn4o!h5_1080jpg'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REFERER = 'https://www.xiaohongshu.com/'

const CANDIDATES = [
  ['给定 url (h5_1080jpg)', GIVEN],
  ['同路径换 nd_dft_wgth_webp_3', GIVEN.replace('!h5_1080jpg', '!nd_dft_wgth_webp_3')],
  ['同路径换 nd_dft_wlteh_webp_3', GIVEN.replace('!h5_1080jpg', '!nd_dft_wlteh_webp_3')],
  ['同路径去掉 ! 后缀', GIVEN.replace('!h5_1080jpg', '')],
  ['同路径 !origin', GIVEN.replace('!h5_1080jpg', '!origin')],
  ['sns-img-bd + fileId', `https://sns-img-bd.xhscdn.com/${FILE_ID}`],
  ['sns-img-qc + fileId', `https://sns-img-qc.xhscdn.com/${FILE_ID}`],
  ['sns-webpic-qc + fileId（无日期哈希）', `https://sns-webpic-qc.xhscdn.com/${FILE_ID}`],
  ['ci.xiaohongshu.com + fileId', `https://ci.xiaohongshu.com/${FILE_ID}`],
  ['sns-webpic-qc + fileId + !h5_1080jpg', `https://sns-webpic-qc.xhscdn.com/${FILE_ID}!h5_1080jpg`],
  ['sns-img-bd + fileId + !nd_dft_wgth_webp_3', `https://sns-img-bd.xhscdn.com/${FILE_ID}!nd_dft_wgth_webp_3`]
]

for (const [label, url] of CANDIDATES) {
  for (const withReferer of [false, true]) {
    const headers = { 'user-agent': UA }
    if (withReferer) headers.referer = REFERER
    try {
      const response = await fetch(url, { headers, redirect: 'follow' })
      const length = response.headers.get('content-length')
      const note = withReferer ? '' : ' (无 referer)'
      if (response.status === 200) {
        console.log(`PASS  ${label.padEnd(38)}${note} ${String(response.headers.get('content-type')).padEnd(12)} ${length ? (Number(length) / 1024).toFixed(0) + 'KB' : '-'}`)
      }
      else {
        console.log(`FAIL  ${label.padEnd(38)}${note} HTTP ${response.status}`)
      }
    }
    catch (error) {
      console.log(`ERR   ${label.padEnd(38)}${withReferer ? '' : ' (无 referer)'} ${String(error).slice(0, 60)}`)
    }
    // 有 referer 的成功就够，不再跑无 referer
    break
  }
}
