import { tryParseJsonString } from './http'

const MAX_WALK_DEPTH = 18

/**
 * 深度优先遍历一份 JSON 结构，返回第一个满足条件的对象节点。
 *
 * 两个关键设计：
 *  1. 不写死 JSON 路径 —— 平台会调整字段层级，路径写死容易失效
 *  2. 遇到「JSON 字符串」自动解包 —— 服务端常把 JSON 再包一层字符串下发，
 *     不解包就看不到真实数据
 */
export function findFirstNode(
  root: unknown,
  predicate: (node: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
  const visited = new WeakSet<object>()

  const visit = (node: unknown, depth: number): Record<string, unknown> | undefined => {
    if (depth > MAX_WALK_DEPTH || node === null || node === undefined) return undefined

    // JSON 字符串：解开后继续往里找
    if (typeof node === 'string') {
      const nested = tryParseJsonString(node)
      return nested === undefined ? undefined : visit(nested, depth + 1)
    }

    if (typeof node !== 'object' || visited.has(node)) return undefined
    visited.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item, depth + 1)
        if (hit) return hit
      }
      return undefined
    }

    const record = node as Record<string, unknown>
    if (predicate(record)) return record

    for (const value of Object.values(record)) {
      const hit = visit(value, depth + 1)
      if (hit) return hit
    }
    return undefined
  }

  return visit(root, 0)
}

/** 遍历所有对象节点（不返回值，用于收集） */
export function forEachNode(root: unknown, visit: (node: Record<string, unknown>) => void): void {
  const visited = new WeakSet<object>()

  const walk = (node: unknown, depth: number) => {
    if (depth > MAX_WALK_DEPTH || node === null || node === undefined) return

    if (typeof node === 'string') {
      const nested = tryParseJsonString(node)
      if (nested !== undefined) walk(nested, depth + 1)
      return
    }

    if (typeof node !== 'object' || visited.has(node)) return
    visited.add(node)

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }

    visit(node as Record<string, unknown>)
    for (const value of Object.values(node as Record<string, unknown>)) walk(value, depth + 1)
  }

  walk(root, 0)
}
