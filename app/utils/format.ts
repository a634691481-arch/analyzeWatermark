/** 视频时长（毫秒）-> 1:23 */
export function formatDuration(milliseconds?: number): string {
  if (!milliseconds || milliseconds <= 0) return ''
  const totalSeconds = Math.round(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
