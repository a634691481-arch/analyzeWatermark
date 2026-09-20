import type { PlatformInfo } from '#shared/types'
import { supportedPlatforms } from '../../utils/platform'

/**
 * GET /api/__sitemap__/urls
 *
 * 给 @nuxtjs/sitemap 的动态数据源：把每个平台的落地页交给它。
 * loc 用相对路径即可，模块会拼上 site.url。
 * 新增平台时 sitemap 自动跟着变，不用手维护清单。
 */
export default defineEventHandler(() => {
  return [
    { loc: '/', changefreq: 'daily' as const, priority: 1 },
    ...supportedPlatforms().map((platform: PlatformInfo) => ({
      loc: `/${platform.id}`,
      changefreq: 'weekly' as const,
      priority: 0.8
    }))
  ]
})
