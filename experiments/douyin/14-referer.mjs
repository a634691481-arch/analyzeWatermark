/** 探针 14：抖音资源是否需要 Referer（决定代理怎么写） */
const TESTS = [
  ['抖音图片(jpeg)', 'https://p11-sign.douyinpic.com/tos-cn-i-0813c000-ce/oUaMvAAJREMoQBqcJoiCRiCAIPUMAE5Bxx56A~tplv-dy-lqen-new:1440:2560:q80.jpeg?lk3s=138a59ce&x-expires=1792476000&x-signature=c3hsDrtwwfwlfu%2FIh%2FOd2Kh6aR8%3D&from=327834062&s=PackSourceEnum_DOUYIN_REFLOW&se=false&sc=image&biz_tag=aweme_images&l=202609201432257E452FD207963E34713F'],
  ['抖音图片(webp)', 'https://p11-sign.douyinpic.com/tos-cn-i-0813c000-ce/oUaMvAAJREMoQBqcJoiCRiCAIPUMAE5Bxx56A~tplv-dy-lqen-new:1440:2560:q80.webp?lk3s=138a59ce&x-expires=1792476000&x-signature=WjlbotKKiIUmgVj9r6ls6x6zG84%3D&from=327834062&s=PackSourceEnum_DOUYIN_REFLOW&se=false&sc=image&biz_tag=aweme_images&l=202609201432257E452FD207963E34713F'],
  ['抖音视频(play)', 'https://aweme.snssdk.com/aweme/v1/play/?video_id=v0200fg10000damg43nog65nt2g9f65g&ratio=1080p&line=0']
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

for (const [label, url] of TESTS) {
  for (const withReferer of [false, true]) {
    const headers = { 'user-agent': UA }
    if (withReferer) headers.referer = 'https://www.douyin.com/'
    try {
      const response = await fetch(url, { headers, redirect: 'follow' })
      const length = response.headers.get('content-length')
      console.log(
        `${label.padEnd(16)} referer=${withReferer ? 'YES' : 'NO '} `
        + `HTTP ${response.status} ${String(response.headers.get('content-type')).padEnd(12)} `
        + `${length ? (Number(length) / 1024 / 1024).toFixed(2) + 'MB' : ''}`
      )
    }
    catch (error) {
      console.log(`${label} referer=${withReferer} 失败: ${String(error).slice(0, 80)}`)
    }
  }
}
