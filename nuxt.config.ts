// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // 实验目录只用于「先隔离验证」，不参与构建，也不要被 dev watcher 跟踪
  // （里面会有 mp4 / html 抓包产物，跟踪会拖慢甚至触发反复重载）
  ignore: ['experiments/**'],
  // 图标使用本地打包的 @iconify/json 集合，不依赖 Iconify 在线 API
  icon: {
    serverBundle: 'local'
  },
  // 国内网络访问不到 Google Fonts，直接关闭对应 provider，使用系统字体栈
  fonts: {
    providers: {
      google: false,
      googleicons: false
    }
  }
})
