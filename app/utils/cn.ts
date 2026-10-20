type ClassValue
  = | string
    | number
    | null
    | undefined
    | false
    | ClassValue[]
    | Record<string, boolean>

/**
 * 极简 class 拼接。
 *
 * Inspira UI 的组件默认依赖 `@inspira-ui/plugins` 的 cn（clsx + tailwind-merge）。
 * 本项目没有同类名冲突的合并需求，所以只做「过滤 + 拼接」，
 * 避免为了一个函数多引两个依赖。
 */
export function cn(...inputs: ClassValue[]): string {
  const output: string[] = []

  for (const input of inputs) {
    if (!input) continue

    if (typeof input === 'string' || typeof input === 'number') {
      output.push(String(input))
      continue
    }

    if (Array.isArray(input)) {
      const nested = cn(...input)
      if (nested) output.push(nested)
      continue
    }

    for (const [key, value] of Object.entries(input)) {
      if (value) output.push(key)
    }
  }

  return output.join(' ')
}
