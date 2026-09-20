// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/seo'],
  css: ['~/assets/css/main.css'],

  /**
   * 服务端私有配置。「联系作者适配」提交后通过 PushPlus 推送到作者微信。
   * 生产环境建议用 NUXT_PUSHPLUS_TOKEN 覆盖，避免 token 硬编码进仓库。
   */
  runtimeConfig: {
    pushplusToken: process.env.NUXT_PUSHPLUS_TOKEN || 'c25423061d04431fb9bf8df073ed8e39'
  },

  // 实验目录只用于「先隔离验证」，不参与构建，也不要被 dev watcher 跟踪
  // （里面会有 mp4 / html 抓包产物，跟踪会拖慢甚至触发反复重载）
  ignore: ['experiments/**'],

  /**
   * nuxt-site-config —— 所有 SEO 模块的共享基础信息。
   * v5 起不再从 package.json / 目录名推断，必须显式配置。
   * 线上务必设环境变量 NUXT_SITE_URL，否则 canonical / sitemap 会指向 localhost。
   */
  site: {
    url: process.env.NUXT_SITE_URL || 'http://localhost:3000',
    name: '去水印',
    description: '粘贴分享链接，一键取回豆包 / 抖音 / 小红书 / 千问的无水印原图与原视频，支持批量打包下载。',
    defaultLocale: 'zh-CN'
  },

  // 站点级默认 meta（每页可在页面里用 useSeoMeta 覆盖）
  seo: {
    meta: {
      titleTemplate: '%s',
      twitterCard: 'summary_large_image'
    }
  },

  // robots.txt：默认全站允许；预览环境可用环境变量整体切到禁止索引
  robots: {
    disallow: process.env.NUXT_SITE_INDEXABLE === 'false' ? ['/'] : []
  },

  // sitemap.xml：本项目只有首页一条静态路由
  sitemap: {
    exclude: ['/api/**']
  },

  /**
   * og-image 默认要在构建期解析字体（会走 Google Fonts，本环境不可达、
   * 之前实测 10s 超时），本项目也不生成动态社交图，按官方建议直接关掉。
   * 将来要做社交卡片，再配上本地字体文件把它打开。
   */
  ogImage: {
    enabled: false
  },

  // 图标使用本地安装的 @iconify-json 集合，不依赖 Iconify 在线 API
  icon: {
    serverBundle: 'local'
  },

  // 国内网络访问不到 Google Fonts（本项目实测 10s 超时），直接关闭对应 provider，
  // 使用系统字体栈：ui-sans-serif / PingFang SC / Microsoft YaHei
  fonts: {
    providers: {
      google: false,
      googleicons: false
    }
  }
})
