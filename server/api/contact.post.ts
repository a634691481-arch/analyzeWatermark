import type { H3Event } from 'h3'
import type { ApiErrorCode, ContactResponse } from '#shared/types'

/**
 * POST /api/contact
 * body: { contact: string, content: string }
 *
 * 用户没找到想用的平台时，留下自己的联系方式 + 适配需求，
 * 服务端把内容通过 PushPlus 推送给作者微信。
 */

const PUSHPLUS_ENDPOINT = 'https://www.pushplus.plus/send'
const MAX_CONTACT_LENGTH = 100
const MAX_CONTENT_LENGTH = 1000

/** 简单内存限流：同一 IP 每分钟最多提交 3 次，防止被刷 */
const RATE_WINDOW_MS = 60_000
const RATE_MAX_HITS = 3
const hits = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(time => now - time < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX_HITS) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

function fail(
  event: H3Event,
  status: number,
  code: ApiErrorCode,
  message: string
): ContactResponse {
  setResponseStatus(event, status)
  return { ok: false, error: { code, message } }
}

export default defineEventHandler(async (event): Promise<ContactResponse> => {
  const body = await readBody<{ contact?: unknown, content?: unknown }>(event).catch(() => null)

  const contact = typeof body?.contact === 'string' ? body.contact.trim() : ''
  const content = typeof body?.content === 'string' ? body.content.trim() : ''

  if (!contact || !content) {
    return fail(event, 400, 'BAD_REQUEST', '请填写联系方式和适配需求')
  }
  if (contact.length > MAX_CONTACT_LENGTH) {
    return fail(event, 400, 'BAD_REQUEST', `联系方式请控制在 ${MAX_CONTACT_LENGTH} 字以内`)
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return fail(event, 400, 'BAD_REQUEST', `需求描述请控制在 ${MAX_CONTENT_LENGTH} 字以内`)
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  if (isRateLimited(ip)) {
    return fail(event, 429, 'RATE_LIMITED', '提交太频繁了，请稍后再试')
  }

  const { pushplusToken } = useRuntimeConfig(event)
  if (!pushplusToken) {
    console.error('[api/contact] 未配置 PushPlus token')
    return fail(event, 500, 'INTERNAL', '推送服务未配置，请联系管理员')
  }

  const sentAt = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const text = [
    '【去水印】新的适配需求',
    '',
    `联系方式：${contact}`,
    `提交时间：${sentAt}`,
    '',
    '需求描述：',
    content
  ].join('\n')

  let response: Response
  try {
    response = await fetch(PUSHPLUS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: pushplusToken,
        title: '去水印 · 新的适配需求',
        content: text,
        template: 'txt',
        channel: 'wechat'
      }),
      signal: AbortSignal.timeout(10_000)
    })
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('[api/contact] 推送请求失败:', reason)
    return fail(event, 502, 'PUSH_FAILED', '推送失败，请稍后重试')
  }

  if (!response.ok) {
    console.error('[api/contact] PushPlus 返回 HTTP', response.status)
    return fail(event, 502, 'PUSH_FAILED', '推送失败，请稍后重试')
  }

  const payload = await response.json().catch(() => null) as { code?: number, msg?: string } | null
  if (!payload || payload.code !== 200) {
    console.error('[api/contact] PushPlus 业务错误:', payload?.code, payload?.msg)
    return fail(event, 502, 'PUSH_FAILED', payload?.msg || '推送失败，请稍后重试')
  }

  return { ok: true }
})
