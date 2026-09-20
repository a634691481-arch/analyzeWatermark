import type { PlatformInfo } from '#shared/types'
import { supportedPlatforms } from '../utils/platform'

/** GET /api/platforms —— 把已接入的平台清单暴露给前端，保证前后端只有一份事实 */
export default defineEventHandler((): PlatformInfo[] => {
  return supportedPlatforms()
})
