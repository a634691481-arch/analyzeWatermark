// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/seo', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],

  // iOS 加到主屏时用这张图标；地址栏配色跟主题一致
  // manifest 的 link 由 @vite-pwa/nuxt 的运行时组件注入，实测没进 SSR head，
  // 所以这里显式声明一份，保证首屏就有（可安装性的必要条件）
  app: {
    head: {
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ],
      meta: [
        { name: 'theme-color', content: '#10b981' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: '去水印' }
      ]
    }
  },

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
   *
   * 这里的 url 会被 canonical / og:url / sitemap / robots.txt 的 Sitemap 行
   * 和 JSON-LD 的 @id 一起用。默认值就是线上域名，环境变量可覆盖
   * （多环境部署时用 NUXT_SITE_URL 指定）。
   * ⚠️ 曾经因为忘了设这个，线上 canonical 一度是 http://localhost:3000/。
   */
  site: {
    url: process.env.NUXT_SITE_URL || 'https://qsy.mooon.vip',
    name: '去水印',
    description: '粘贴分享链接，一键取回豆包 / 抖音 / 小红书 / 千问 / 哔哩哔哩 / 快手 / 微博的无水印原图与原视频，支持批量打包下载。',
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

  // sitemap.xml：首页 + 各平台落地页（落地页清单来自 /api/__sitemap__/urls）
  sitemap: {
    exclude: ['/api/**'],
    sources: ['/api/__sitemap__/urls']
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
    serverBundle: 'local',
    clientBundle: {
      /**
       * 平台图标来自 /api/platforms 的接口数据（写在 server 的适配器里），
       * 扫描器看不到这些动态字符串，所以必须显式列出来打进客户端包，
       * 否则首屏会闪一下再补上。
       */
      icons: [
        'lucide:bot',
        'simple-icons:tiktok',
        'simple-icons:xiaohongshu',
        'simple-icons:qwen',
        'simple-icons:bilibili',
        'simple-icons:kuaishou',
        'simple-icons:sinaweibo'
      ]
    }
  },

  /**
   * PWA（@vite-pwa/nuxt）
   *
   * 目标是「可安装 + 静态资源离线可用」。注意本工具的核心功能（解析、下载）
   * 天然需要联网，所以 offine 只能保证打开已访问过的页面外壳。
   */
  pwa: {
    // 新版本部署后自动接管，下次进入即生效
    registerType: 'autoUpdate',

    manifest: {
      name: '无水印下载工具',
      short_name: '去水印',
      description: '粘贴分享链接，取回豆包 / 抖音 / 小红书 / 千问 / 哔哩哔哩 / 快手 / 微博的无水印原图与原视频。',
      lang: 'zh-CN',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#10b981',
      background_color: '#ffffff',
      categories: ['utilities', 'multimedia'],
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        // maskable 带 20% 安全留白，Android 自适应图标不会被裁掉
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },

    workbox: {
      /**
       * 必须显式写 null。
       *
       * @vite-pwa/nuxt 的逻辑是「只要 workbox 里没有 navigateFallback 这个 key，
       * 就自动塞 nuxt 的 baseURL（即 "/"）」，于是会生成：
       *   registerRoute(new NavigationRoute(createHandlerBoundToURL("/")))
       * 这条规则排在所有规则之前、劫持全部导航，而它的 handler 绑定的是
       * 预缓存里的 "/" —— SSR 应用根本没有静态 HTML，这条会把整站打死。
       * 传 null（key 存在但为假）workbox 就会跳过它。
       */
      navigateFallback: null,

      // 预缓存构建产物 + 图标
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      // 单文件上限调大一点，避免 512 图标等被跳过
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      // og.png 只给爬虫看，没必要占缓存配额
      globIgnores: ['**/og.png'],

      runtimeCaching: [
        {
          /**
           * 页面导航：网络优先，失败回落缓存。
           *
           * 这里**刻意不设 navigateFallback** —— SSR 应用的 HTML 是每次请求
           * 动态生成的，而 navigateFallback 会把所有导航都指向那个预缓存文件
           * （等于永远不再请求服务端），会把整站 SSR 打死。
           */
          urlPattern: ({ request, url }) =>
            request.mode === 'navigate'
            && !url.pathname.startsWith('/api/')
            && !url.pathname.startsWith('/__sitemap__/'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pages',
            networkTimeoutSeconds: 4,
            expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 }
          }
        },
        {
          // 构建产物带 hash，缓存优先即可
          urlPattern: /\/_nuxt\/.*\.(?:js|css|woff2?)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'static-assets',
            expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 }
          }
        },
        {
          urlPattern: /\.(?:png|ico|svg)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'images',
            expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 }
          }
        }
      ]
    },

    client: {
      installPrompt: true,
      // 每小时检查一次更新
      periodicSyncForUpdates: 3600
    },

    // dev 下不开 SW：会干扰 HMR，也让调试变复杂
    devOptions: {
      enabled: false,
      type: 'module'
    }
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
