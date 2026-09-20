import type { ParsedMedia, ParseResponse, ParseResult } from '#shared/types'

/** 把 $fetch / fetch 的各种错误形态压成一句人话 */
function extractMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as {
      data?: { error?: { message?: string }, statusMessage?: string, message?: string }
      statusMessage?: string
      message?: string
    }
    const fromBody = record.data?.error?.message ?? record.data?.statusMessage ?? record.data?.message
    if (typeof fromBody === 'string' && fromBody) return fromBody
    if (typeof record.statusMessage === 'string' && record.statusMessage) return record.statusMessage
    if (typeof record.message === 'string' && record.message) return record.message
  }
  return '解析失败，请检查链接后重试'
}

export function useMediaParser() {  const inputUrl = ref('')
  const loading = ref(false)
  const zipping = ref(false)
  const errorMessage = ref('')
  const result = ref<ParseResult | null>(null)
  const selectedIds = ref<string[]>([])

  const media = computed(() => result.value?.media ?? [])
  const selectedMedia = computed(() => media.value.filter(item => selectedIds.value.includes(item.id)))
  const allSelected = computed(() => media.value.length > 0 && selectedIds.value.length === media.value.length)
  const watermarkFreeCount = computed(() => media.value.filter(item => item.watermarkFree).length)

  /** 解析成功后返回结果，便于调用方做后续处理 */
  async function parse(): Promise<ParseResult | null> {
    if (loading.value) return null
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await $fetch<ParseResponse>('/api/parse', {
        method: 'POST',
        body: { url: inputUrl.value }
      })

      if (response.ok) {
        result.value = response.data
        selectedIds.value = response.data.media.map(item => item.id)
        return response.data
      }

      result.value = null
      selectedIds.value = []
      errorMessage.value = response.error.message
      return null
    }
    catch (error) {
      result.value = null
      selectedIds.value = []
      errorMessage.value = extractMessage(error)
      return null
    }
    finally {
      loading.value = false
    }
  }

  function toggle(id: string) {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter(item => item !== id)
      : [...selectedIds.value, id]
  }

  function toggleAll() {
    selectedIds.value = allSelected.value ? [] : media.value.map(item => item.id)
  }

  /** 单条下载：走服务端代理，避免防盗链与跨域下载失效（视频尤其需要） */
  function downloadOne(item: ParsedMedia) {
    triggerDownload(proxyUrl(item.url, { download: true, name: item.filename }), item.filename)
  }

  /**
   * 下载源文件（可选）。
   * 主地址一般是转码后的兼容格式，源文件可能是 HEIC 这类不通用格式，所以单独走一枚按钮。
   */
  function downloadOriginal(item: ParsedMedia) {
    if (!item.originalUrl) return
    const name = item.filename.replace(/\.[a-z0-9]+$/i, '.heic')
    triggerDownload(proxyUrl(item.originalUrl, { download: true, name }), name)
  }

  /** 批量下载：服务端打成一个 zip 返回 */
  async function downloadZip(list: ParsedMedia[]) {
    if (!list.length || zipping.value) return
    zipping.value = true
    errorMessage.value = ''

    const platformId = result.value?.platform.id ?? 'media'
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const zipName = `${platformId}-${stamp}.zip`

    try {
      const response = await fetch('/api/zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: zipName,
          files: list.map(item => ({ url: item.url, filename: item.filename }))
        })
      })

      if (!response.ok) {
        let message = '打包下载失败'
        try {
          const payload = await response.json()
          message = payload?.statusMessage ?? payload?.message ?? message
        }
        catch {
          // 响应不是 JSON 时沿用默认文案
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      triggerDownload(objectUrl, zipName)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }
    catch (error) {
      errorMessage.value = extractMessage(error)
    }
    finally {
      zipping.value = false
    }
  }

  async function copyLink(item: ParsedMedia): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(item.url)
      return true
    }
    catch {
      return false
    }
  }

  return {
    inputUrl,
    loading,
    zipping,
    errorMessage,
    result,
    media,
    selectedIds,
    selectedMedia,
    allSelected,
    watermarkFreeCount,
    parse,
    toggle,
    toggleAll,
    downloadOne,
    downloadOriginal,
    downloadZip,
    copyLink
  }
}
