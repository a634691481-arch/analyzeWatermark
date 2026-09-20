import type { ParsedImage, ParseResponse, ParseResult } from '#shared/types'

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

export function useImageParser() {
  const inputUrl = ref('')
  const loading = ref(false)
  const zipping = ref(false)
  const errorMessage = ref('')
  const result = ref<ParseResult | null>(null)
  const selectedIds = ref<string[]>([])

  const images = computed(() => result.value?.images ?? [])
  const selectedImages = computed(() => images.value.filter(image => selectedIds.value.includes(image.id)))
  const allSelected = computed(() => images.value.length > 0 && selectedIds.value.length === images.value.length)
  const watermarkFreeCount = computed(() => images.value.filter(image => image.watermarkFree).length)

  async function parse() {
    if (loading.value) return
    loading.value = true
    errorMessage.value = ''

    try {
      const response = await $fetch<ParseResponse>('/api/parse', {
        method: 'POST',
        body: { url: inputUrl.value }
      })

      if (response.ok) {
        result.value = response.data
        selectedIds.value = response.data.images.map(image => image.id)
      }
      else {
        result.value = null
        selectedIds.value = []
        errorMessage.value = response.error.message
      }
    }
    catch (error) {
      result.value = null
      selectedIds.value = []
      errorMessage.value = extractMessage(error)
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
    selectedIds.value = allSelected.value ? [] : images.value.map(image => image.id)
  }

  /** 单张下载：走服务端代理，避免防盗链与跨域下载失效 */
  function downloadOne(image: ParsedImage) {
    triggerDownload(proxyUrl(image.url, { download: true, name: image.filename }), image.filename)
  }

  /** 批量下载：服务端打成一个 zip 返回 */
  async function downloadZip(list: ParsedImage[]) {
    if (!list.length || zipping.value) return
    zipping.value = true
    errorMessage.value = ''

    const platformId = result.value?.platform.id ?? 'images'
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const zipName = `${platformId}-images-${stamp}.zip`

    try {
      const response = await fetch('/api/zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: zipName,
          files: list.map(image => ({ url: image.url, filename: image.filename }))
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

  async function copyLink(image: ParsedImage): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(image.url)
      return true
    }
    catch {
      return false
    }
  }

  function reset() {
    inputUrl.value = ''
    result.value = null
    selectedIds.value = []
    errorMessage.value = ''
  }

  return {
    inputUrl,
    loading,
    zipping,
    errorMessage,
    result,
    images,
    selectedIds,
    selectedImages,
    allSelected,
    watermarkFreeCount,
    parse,
    toggle,
    toggleAll,
    downloadOne,
    downloadZip,
    copyLink,
    reset
  }
}
