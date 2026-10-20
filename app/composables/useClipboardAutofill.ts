/**
 * 剪贴板自动填入。
 *
 * 浏览器的 `clipboard.readText()` 有两个硬约束：
 *  1. 必须是安全上下文（HTTPS / localhost）
 *  2. 需要用户手势，页面一加载就读取，Chrome 多半直接 NotAllowedError，
 *     iOS Safari 基本只认显式点击
 *
 * 所以这里埋了三个时机：挂载后、首次交互后、窗口重新获得焦点后；
 * 全部只在输入框为空时填，避免覆盖用户自己打了一半的链接。
 * 自动尝试一律「静默」——失败不打扰，成功给一条轻提示。
 */

type ClipboardOutcome = 'filled' | 'empty' | 'invalid' | 'denied' | 'unavailable' | 'busy'

/** 分享文案里至少有链接才算有效：带协议，或整段就是个裸域名 */
const LINK_PATTERN = /https?:\/\/\S+|^[\w-]+(\.[\w-]+)+(\/|$|\?)/i

export function useClipboardAutofill(target: Ref<string>) {
  const toast = useToast()
  const busy = ref(false)

  function notify(
    title: string,
    description: string,
    color: 'success' | 'warning' | 'error' = 'warning',
    icon = 'i-lucide-clipboard-paste'
  ) {
    toast.add({ title, description, color, icon, duration: 4500 })
  }

  async function readFromClipboard(): Promise<ClipboardOutcome> {
    return attempt(false)
  }

  /**
   * @param silent 自动触发时为 true：失败不提示，成功仍提示（否则内容突然出现会很困惑）
   */
  async function attempt(silent: boolean): Promise<ClipboardOutcome> {
    if (!import.meta.client) return 'unavailable'
    if (busy.value) return 'busy'

    if (!navigator.clipboard?.readText) {
      if (!silent) {
        notify('当前浏览器不支持自动读取剪贴板', '请长按输入框手动粘贴', 'error', 'i-lucide-triangle-alert')
      }
      return 'unavailable'
    }

    busy.value = true
    try {
      const text = (await navigator.clipboard.readText())?.trim() ?? ''

      // 剪贴板为空：用户主动点才提示，自动尝试静默跳过
      if (!text) {
        if (!silent) notify('剪贴板里没有内容', '先复制分享链接或整段分享文案，再点这里')
        return 'empty'
      }

      // 有内容但不是链接：不往输入框里塞无意义文本
      if (!LINK_PATTERN.test(text)) {
        if (!silent) notify('剪贴板里没有识别到链接', '请复制平台的分享链接或整段分享文案')
        return 'invalid'
      }

      target.value = text
      notify(
        silent ? '已自动填入剪贴板内容' : '已填入剪贴板内容',
        '点「解析」开始提取无水印文件',
        'success',
        'i-lucide-check'
      )
      return 'filled'
    }
    catch {
      // NotAllowedError / SecurityError：无权限、非安全上下文、或用户拒绝
      if (!silent) {
        notify(
          '无法读取剪贴板',
          '请在浏览器地址栏的权限里允许剪贴板访问，或直接手动粘贴',
          'error',
          'i-lucide-triangle-alert'
        )
      }
      return 'denied'
    }
    finally {
      busy.value = false
    }
  }

  /** 输入框已有内容就不动它 */
  function tryAutofill() {
    if (!import.meta.client) return
    if (target.value.trim()) return
    void attempt(true)
  }

  if (import.meta.client) {
    onMounted(tryAutofill)

    // 从别的标签页切回来时再试一次：此时往往刚复制完链接
    const onWindowFocus = () => tryAutofill()
    window.addEventListener('focus', onWindowFocus)

    // 首次交互后（有了用户手势，Chrome 才允许读）
    const onFirstGesture = () => tryAutofill()
    document.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true })

    onBeforeUnmount(() => {
      window.removeEventListener('focus', onWindowFocus)
      document.removeEventListener('pointerdown', onFirstGesture, true)
    })
  }

  return { readFromClipboard, clipboardBusy: busy }
}
