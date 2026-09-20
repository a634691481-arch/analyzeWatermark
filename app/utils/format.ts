/** 相对时间：刚刚 / 12 分钟前 / 3 小时前 / 2 天前 / 2026-09-20 */
export function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''

  const diff = Date.now() - time
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`

  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 链接过长时截断显示，保留尾部特征字符 */
export function shortenUrl(url: string, max = 42): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 6)}…${url.slice(-5)}`
}
