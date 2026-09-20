/** 探针 15：豆包图床是否需要 Referer */
const URL_DOUBAO = 'https://p11-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc_gen_image/4059e22a743f4afb84fe7645dd6c0bb1.jpeg~tplv-a9rns2rl98-image_raw.png?lk3s=8e244e95&rcl=20260920131822D5FA1FF1229D8E73207A&rrcfp=755f3169&x-expires=2105241510&x-signature=fUaFUu8N%2FiAfG9GgXuDcC%2B4cs24%3D'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

for (const withReferer of [false, true]) {
  const headers = { 'user-agent': UA }
  if (withReferer) headers.referer = 'https://www.doubao.com/'
  try {
    const response = await fetch(URL_DOUBAO, { headers, redirect: 'follow' })
    console.log(`豆包图床 referer=${withReferer ? 'YES' : 'NO '} HTTP ${response.status} ${response.headers.get('content-type')} ${response.headers.get('content-length')} bytes`)
  }
  catch (error) {
    console.log(`豆包图床 referer=${withReferer} 失败: ${String(error).slice(0, 80)}`)
  }
}
