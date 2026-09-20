/** 触发浏览器下载：同源地址和 blob 地址都适用 */
export function triggerDownload(href: string, filename?: string) {
  const link = document.createElement('a')
  link.href = href
  link.rel = 'noopener'
  if (filename) link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** 生成图片代理地址（预览或下载） */
export function proxyUrl(target: string, options: { download?: boolean, name?: string } = {}): string {
  const params = new URLSearchParams({ url: target })
  if (options.download) params.set('download', '1')
  if (options.name) params.set('name', options.name)
  return `/api/proxy?${params.toString()}`
}
