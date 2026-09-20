import type { ParseResult, PlatformInfo } from '#shared/types'

export interface HistoryEntry {
  /** 以 sourceUrl 作为唯一键，同一条链接只保留最新一次解析 */
  id: string
  sourceUrl: string
  platform: PlatformInfo
  title?: string
  author?: string
  imageCount: number
  watermarkFreeCount: number
  parsedAt: string
  /** 完整的解析结果，点击历史时直接恢复，无需重新请求 */
  result: ParseResult
}

const STORAGE_KEY = 'ai-image-dewatermark:history:v1'
/** 最多保留的条数，避免 localStorage 无限膨胀 */
const MAX_ENTRIES = 20

function toEntry(result: ParseResult): HistoryEntry {
  return {
    id: result.sourceUrl,
    sourceUrl: result.sourceUrl,
    platform: result.platform,
    title: result.title,
    author: result.author,
    imageCount: result.images.length,
    watermarkFreeCount: result.images.filter(image => image.watermarkFree).length,
    parsedAt: result.parsedAt,
    result
  }
}

/**
 * 解析历史：存在 localStorage，刷新页面甚至下次打开都还在。
 * 点击历史记录直接用缓存结果恢复，避免重复请求（图床签名地址有效期很长）。
 */
export function useParseHistory() {
  const entries = useState<HistoryEntry[]>('parse-history', () => [])
  const loaded = useState('parse-history-loaded', () => false)

  function load() {
    if (!import.meta.client || loaded.value) return
    loaded.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) entries.value = parsed
    }
    catch {
      // 历史数据损坏时直接丢弃，不影响主流程
      entries.value = []
    }
  }

  function persist() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
    }
    catch {
      // 存储配额不足时退回内存态，不打断用户操作
    }
  }

  /** 新增一条记录；同一链接已存在则移动到最前并更新 */
  function add(result: ParseResult) {
    const entry = toEntry(result)
    const rest = entries.value.filter(item => item.id !== entry.id)
    entries.value = [entry, ...rest].slice(0, MAX_ENTRIES)
    persist()
  }

  function remove(id: string) {
    entries.value = entries.value.filter(item => item.id !== id)
    persist()
  }

  function clear() {
    entries.value = []
    persist()
  }

  onMounted(load)

  return { entries, load, add, remove, clear }
}
