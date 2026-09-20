# 无水印下载工具

粘贴分享链接，解析出平台云端保存的**无水印原图 / 原视频**并下载。Nuxt 4 + Nuxt UI 4，无第三方抓取依赖。

## 已支持平台

| 平台 | 单视频 | 图文/图集 | 提取方式 |
| --- | --- | --- | --- |
| 豆包 | — | ✅ | `image_ori_raw` 模板 |
| 抖音 | ✅ | ✅ | 视频 `playwm`→`play`；图片 `url_list` |
| 小红书 | ⚠️ 未验证 | ✅ | `nd_dft_*` 模板（`h5_*` 带水印） |
| 千问 | ✅ | ✅ | `display_list` 的 `image` / `video` 字段 |
| 哔哩哔哩 | ✅ | — | `playurl` 的 `durl`（音视频合一单文件），含分P |
| 快手 | ✅ | ✅（图集） | SSR `INIT_STATE` 的 `photo.mainMvUrls[0].url`（前端字段名即 `srcNoMark`）；图集走 `photo.atlas` |
| 微博 | ✅ | — | 组件接口 `Component_Play_Playinfo.urls` / 正文接口 `page_info.media_info`（访客 Cookie） |

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # 生产构建
pnpm typecheck  # 类型检查
```

## 核心原理

AI 生图与短视频平台在 CDN 上通常同时保存两份文件：一份是展示用的**带水印**版本，一份是**未压缩、无水印的原始文件**。去水印的本质不是修图，而是把后者的地址取出来。

各平台的具体形态：

| 平台 | 带水印 | 无水印 |
| --- | --- | --- |
| 豆包 | `~tplv-xxx-cdld_wm3` / `cpreview_wm1` | `~tplv-xxx-image_raw` |
| 抖音视频 | `/aweme/v1/playwm/` | `/aweme/v1/play/` |
| 抖音图片 | `~tplv-...-new-water:...` | `~tplv-...-new:...` |
| 小红书视频 | `media.stream.h264[].masterUrl` | `sns-video-bd/{originVideoKey}` |
| 小红书图片 | `!h5_1080jpg` / `!h5_1080webp` | `!nd_dft_*` 模板，或 `{fileId}` 源文件 |
| 千问图片 | `watermark_image[]` | `image[]` |
| 千问视频 | `download_video[]` | `video[]` |
| 哔哩哔哩视频 | 平台不烧角标 | `playurl` 的 `durl[]`（`fnval=0`） |
| 快手视频 | App 端另做水印，不在 H5 流里 | `photo.mainMvUrls[0].url`（前端字段名就是 `srcNoMark`） |
| 快手图集 | — | `photo.atlas.cdnList[0].cdn` + `list[]` |
| 微博视频 | 播放器 UI 角标，不在流里 | 微博只下发一份文件；`Component_Play_Playinfo.urls` / `page_info.media_info` |

## 数据流

```
浏览器                     服务端                         目标平台
  │ POST /api/parse  {url}    │                              │
  ├──────────────────────────►│ 1. 校验链接，选择平台适配器      │
  │                           │ 2. 拉取分享页 HTML ──────────►│
  │                           │ 3. 提取内嵌 SSR 数据           │
  │                           │ 4. 遍历找媒体、取无水印地址      │
  │◄──────────────────────────┤ 5. 归一化成 ParsedMedia[]     │
  │                           │                              │
  │ GET /api/proxy?url=&download=1                           │
  ├──────────────────────────►│ 转发 + Content-Disposition ──►│
  │◄──────────────────────────┤ attachment（视频才不会被内联播放）
  │                           │
  │ POST /api/zip  {files[]}  │
  ├──────────────────────────►│ 逐个下载 + 内存打包 zip
  │◄──────────────────────────┤ application/zip
```

## 目录结构

```
shared/types/            前后端共享的数据契约（唯一事实来源）
server/
  api/
    parse.post.ts        POST /api/parse     解析链接
    proxy.get.ts         GET  /api/proxy     代下载（绕防盗链 + 强制附件下载）
    zip.post.ts          POST /api/zip       批量打包下载
    platforms.get.ts     GET  /api/platforms 平台清单
  utils/
    platform/
      types.ts           PlatformAdapter 接口
      index.ts           适配器注册表 + 链接校验
      doubao.ts          豆包
      douyin.ts          抖音
      xiaohongshu.ts     小红书
      qianwen.ts         千问
      bilibili.ts        哔哩哔哩
      kuaishou.ts        快手
      weibo.ts           微博
    http.ts              HTML 抓取 / 实体解码 / SSR 字面量提取
    json-walk.ts         通用 JSON 深度遍历（自动解包嵌套 JSON 字符串）
    security.ts          域名白名单（SSRF 防护）、UA、文件名清洗
    zip.ts               store 模式 ZIP 打包（零依赖）
    errors.ts            可预期的解析错误
app/
  pages/index.vue        主页面
  components/
    ParseForm.vue        链接输入
    MediaCard.vue        单个媒体卡片（图片/视频自适应、下载、放大预览）
    MediaPreview.vue     点击放大预览（左右方向键切换、Esc 关闭）
    BackToTop.vue        悬浮回到顶部按钮
  composables/
    useMediaParser.ts    解析状态 + 下载动作
  utils/
    download.ts          浏览器下载 / 代理地址工具
    format.ts            时长格式化
experiments/             每个平台的「先隔离验证」脚本与结论台账
```

## 新增一个平台

先把链接跑通再动主流程，具体做法见 `experiments/douyin/NOTES.md` 与
`experiments/xiaohongshu/NOTES.md`（里面记录了每个平台的请求契约、
水印地址差异、以及踩过的坑）。

合并步骤：

1. 在 `server/utils/platform/` 下新建 `<platform>.ts`，实现 `PlatformAdapter`：

```ts
export const xxxAdapter: PlatformAdapter = {
  id: 'xxx',
  name: '某某',
  example: 'https://xxx.com/share/abc',
  match: url => url.hostname.endsWith('xxx.com'),
  async parse(url) {
    const html = await fetchHtml(url.href)
    // 提取媒体，产出 ParsedMedia[]（url 指向无水印文件）
    return { platform: {...}, sourceUrl: url.href, media, parsedAt: new Date().toISOString() }
  }
}
```

2. 注册到 `server/utils/platform/index.ts` 的 `platformAdapters` 数组。

3. 把该平台的资源域名加进 `server/utils/security.ts` 的 `ALLOWED_MEDIA_HOSTS`。

前端、API 路由、下载逻辑都不用改。

## 设计要点

- **不写死 JSON 路径**：各平台会调整 SSR 字段层级（抖音图文与视频的
  loaderData key 就不同），所以用 `findFirstNode` / `forEachNode` 递归遍历，
  并自动解包「被二次编码成字符串的 JSON」。
- **诚实标注**：拿不到真正无水印文件时回退到带水印版本，并把
  `watermarkFree` 置为 `false`，卡片会显示「仅水印版」。
- **要验证水印本身，不能只看地址形态**：小红书同一张图有 `h5_*` 与 `nd_dft_*`
  两族模板，两族都能 200、尺寸也对，但只有 `nd_dft_*` 不带水印。
  判定方法是把两族缩放到同尺寸做**带符号**亮度差：只亮不暗、
  且差异呈细笔划分布，才是服务端叠加的水印层（详见
  `experiments/xiaohongshu/NOTES.md`）。
- **源文件另开一栏**：主下载地址优先选通用格式（JPEG/MP4）；像小红书原图是
  iPhone HEIC 这种不通用格式，用 `originalUrl` 单独挂一枚按钮由用户自选。
- **代理层保持平台无关**：代理只做「白名单校验 + 补 UA + attachment 响应」。
  唯一的例外是 Referer：极少数 CDN 会校验它（B 站的 `bilivideo` 不带就 403），
  所以 `server/utils/security.ts` 里有 `refererForHost()` 做**按域名的精确规则**，
  而不是一律带 referer。

## PWA

用官方的 [`@vite-pwa/nuxt`](https://vite-pwa-org.netlify.app/frameworks/nuxt)，目标是
**可安装 + 静态资源离线可用**。

| 能力 | 实现 |
| --- | --- |
| 可安装 | `manifest.webmanifest` + 192/512/maskable 图标 + `display: standalone` |
| 离线外壳 | Workbox 预缓存 24 项（JS/CSS/图标/manifest） |
| 自动更新 | `registerType: 'autoUpdate'` + 每小时检查 |
| iOS | `apple-touch-icon` + `apple-mobile-web-app-*` meta |

### ⚠️ 必须显式写 `navigateFallback: null`

`@vite-pwa/nuxt` 的逻辑是「**只要 `workbox` 里没有 `navigateFallback` 这个 key，
就自动塞 `nuxt.options.app.baseURL`（即 `/`）**」，于是生成：

```js
registerRoute(new NavigationRoute(createHandlerBoundToURL("/")))
```

后果很严重：这条规则注册在**所有规则之前**、劫持全部导航，而它的 handler 绑定的是
预缓存里的 `/` —— 本项目是 SSR，构建产物里根本没有静态 HTML。结果就是整站导航
全部失效。`.output/public/sw.js` 里出现 `NavigationRoute` 就是中招了。

显式传 `null`（key 存在但为假）workbox 就会跳过，导航交给我们自己配的
`NetworkFirst` 规则（并排除 `/api/**`、`/__sitemap__/**`）。

### 缓存策略

```
导航（非 /api）      NetworkFirst，4s 超时，回落 pages 缓存
/_nuxt/*.js|css|字体 CacheFirst，30 天
图片                 CacheFirst，30 天
```

**刻意不缓存解析出来的媒体**：代理出的原图动辄 6MB+，缓存会瞬间撑爆配额，
而且 `/api/proxy` 还要支持 Range 请求。

### 图标

生成源是 `experiments/pwa/icon-source.html`（可用 `?pad=0.5~0.64` 调留白）：

```
public/pwa-192x192.png            192×192
public/pwa-512x512.png            512×512
public/maskable-icon-512x512.png  512×512（20% 安全留白，避免被裁）
public/apple-touch-icon.png       180×180
```

用浏览器按目标尺寸渲染后截图即可重新生成。

### 验证

```bash
NODE_ENV=production node .output/server/index.mjs
node experiments/pwa/verify-pwa.mjs

# 另外务必确认 sw.js 里没有 NavigationRoute（有就是踩了上面的坑）
node -e "console.log(require('fs').readFileSync('.output/public/sw.js','utf8').includes('NavigationRoute'))"
```

> 目前没做「安装到桌面」的按钮，浏览器自带的安装入口（地址栏图标 /
> 添加到主屏幕）就能装。要自定义按钮的话，模块已经通过
> `client.installPrompt: true` 暴露了 `$pwa.showInstallPrompt()`，
> 加一个小按钮调用即可。

## 说明

- 解析的是平台云端已存在的原始文件，不是对带水印素材做修补。
- `/api/proxy` 与 `/api/zip` 只允许白名单域名，避免被当作任意 URL 代理。

## SEO

接入官方的 [`@nuxtjs/seo`](https://nuxtseo.com)（别名聚合模块），一次装齐 7 个子模块：

| 子模块 | 作用 | 本项目用法 |
| --- | --- | --- |
| `nuxt-site-config` | 全站共享信息（url / name / description / locale） | `nuxt.config.ts` 的 `site`，是所有模块的基础 |
| `nuxt-seo-utils` | meta 默认值、canonical、og/twitter 标签、`useSeoMeta` 增强 | 页面里写 `useSeoMeta`，canonical / og:url 自动补 |
| `@nuxtjs/sitemap` | 生成 `/sitemap.xml` | 自动，静态路由无需配置 |
| `@nuxtjs/robots` | 生成 `/robots.txt` + `X-Robots-Tag` + `<meta name="robots">` | 生产环境自动带 `Sitemap:` 行 |
| `nuxt-schema-org` | JSON-LD 结构化数据 | `useSchemaOrg` 输出 WebSite / WebPage / SoftwareApplication |
| `nuxt-link-checker` | 构建期检查坏链 | 自动 |
| `nuxt-og-image` | 动态社交预览图 | **已关闭**，见下方说明 |

### 使用方式

页面级 meta 与结构化数据写在 `app/pages/index.vue`：

```ts
useSeoMeta({ title, description, ogTitle, ogDescription, ... })

useSchemaOrg([
  defineWebSite({ name: '去水印', inLanguage: 'zh-CN' }),
  defineSoftwareApp({ name: '无水印下载工具', applicationCategory: 'MultimediaApplication', ... })
])
```

> 注意：可用的 schema-org helper 是 `defineWebSite` / `defineWebPage` / `defineSoftwareApp` /
> `defineOrganization` / `definePerson` / `defineArticle`，**没有** `defineWebApplication`。
> `keywords` 也不在 `useSeoMeta` 的类型里，要单独用 `useHead({ meta: [...] })` 挂。

### 平台落地页（长尾流量）

首页只有一个 URL，长尾词（「抖音去水印」「小红书原图下载」…）没有落点。
所以每个平台一个独立页面：

```
/qsy.mooon.vip/doubao   /douyin   /xiaohongshu   /qianwen   /bilibili   /kuaishou   /weibo
```

- 路由是 `app/pages/[platform].vue`，**平台 id 直接取自适配器注册表**，
  新增平台自动多出一个落地页，不用改代码。
- 每个页面有独立的 title / description / H1 / 正文 / 三步说明，
  避免「薄内容」与「重复内容」两个 SEO 坑。
- 页面底部「其它已支持的平台」做**站内互链**，利于抓取与权重传递。
- 带 **FAQPage 结构化数据**，有机会在搜索结果里出折叠问答。
- 不是已知平台的路径直接 **404**，不会被当成有效页面收录。

### OG 社交预览图

`public/og.png`（1200×630，164KB）。生成源是 `experiments/seo/og-card.html`，
用浏览器按 1200×630 渲染后截图即可重新生成。页面里用相对路径 `/og.png` 声明，
`seo-utils` 会拼成 `site.url` 下的绝对地址。

### 三个必须知道的点

1. **`site.url` 必须对**：它同时决定 canonical、`og:url`、`og:image`、
   sitemap 的 `<loc>`、`robots.txt` 里的 `Sitemap:` 行、以及 JSON-LD 的 `@id`。
   默认值已写死为线上域名 `https://qsy.mooon.vip`，多环境部署用 `NUXT_SITE_URL` 覆盖：

   ```bash
   NUXT_SITE_URL=https://your-domain.com node .output/server/index.mjs
   ```

   > 曾经因为没设这个，线上 canonical 一度是 `http://localhost:3000/` ——
   > 那等于告诉搜索引擎「真正的页面在本地」，整站可能被踢出索引。改动前后务必核对。

2. **robots 只在生产环境放开索引**：非生产（含 `nuxt dev`）会输出
   `Disallow: /`，属模块的安全默认行为。用构建产物启动时要带上 `NODE_ENV=production`
   才会变成 `indexable`。

3. **og-image 模块是关掉的**：它默认在构建期解析字体、会走 Google Fonts，本环境不可达
   （实测 10s 超时）。这里用静态 `public/og.png` 代替，不依赖动态生成。

### 验证

```bash
# 起生产产物（robots 才会是 indexable）
NODE_ENV=production node .output/server/index.mjs

node experiments/seo/verify-seo.mjs      # 首页 + 7 个落地页 + 404 + robots + sitemap + og.png
node experiments/seo/check-head.mjs      # 单个页面的 title / meta / canonical
node experiments/seo/check-jsonld.mjs    # JSON-LD 各节点
node experiments/seo/check-live.mjs      # 体检线上站点（改完记得复查）
```
