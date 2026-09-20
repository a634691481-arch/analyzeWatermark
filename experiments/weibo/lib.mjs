// 微博访客身份（visitor system）+ 请求工具
// 结论：weibo.com 全站接口都要 SUB/SUBP cookie，拿访客身份即可，无需登录

export const PC_UA
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const FP = encodeURIComponent(JSON.stringify({
  os: '1',
  browser: 'Chrome131,0,0,0',
  fonts: 'undefined',
  screenInfo: '1920*1080*24',
  plugins: ''
}))

/** 走一次 genvisitor + incarnate，拿回可用的 Cookie 头 */
export async function getVisitorCookie() {
  const gen = await fetch(
    `https://passport.weibo.com/visitor/genvisitor?cb=gen_callback&fp=${FP}`,
    { headers: { 'user-agent': PC_UA, 'referer': 'https://weibo.com/' } }
  )
  const text = await gen.text()
  const tid = JSON.parse(text.match(/gen_callback\((.*)\)/s)?.[1]).data.tid

  const incarnate = await fetch(
    `https://passport.weibo.com/visitor/visitor?a=incarnate&t=${encodeURIComponent(tid)}`
    + `&w=2&c=095&gc=&cb=cross_domain&from=weibo&_rand=${Math.random()}`
    + '&ua=php-sso_sdk_client-0.6.36',
    {
      headers: {
        'user-agent': PC_UA,
        'referer': 'https://passport.weibo.com/visitor/visitor?entry=krvideo&a=enter'
      }
    }
  )
  const cookies = incarnate.headers.getSetCookie()
  const sub = cookies.find(c => c.startsWith('SUB=')).split(';')[0]
  const subp = cookies.find(c => c.startsWith('SUBP=')).split(';')[0]
  return `${sub}; ${subp}`
}

export function pcHeaders(cookie, referer) {
  return {
    'user-agent': PC_UA,
    'cookie': cookie,
    'referer': referer,
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9'
  }
}
