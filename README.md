# AI 生图去水印

粘贴 AI 生图的分享链接，解析出云端保存的**无水印原图**并下载。Nuxt 4 + Nuxt UI 4 实现，无第三方抓取依赖。

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # 生产构建
pnpm typecheck  # 类型检查
```

## 核心原理

AI 生图平台在 CDN 上通常同时保存两份文件：一份是展示用的**带水印**版本，一份是**未压缩、无水印的原始文件**。去水印的本质不是修图，而是把后者的地址取出来。

以豆包为例，同一张图有多个模板变体：

| 字段 | URL 模板 | 说明 |
| --- | --- | --- |
| `image_ori_raw` | `~tplv-xxx-image_raw.png` | 无水印原图（目标） |
| `image_ori` | `~tplv-xxx-cdld_wm3.png` | 带水印（wm = watermark） |
| `image_preview` | `~tplv-xxx-cpreview_wm1.png` | 带水印预览图 |
| `image_thumb` | `~tplv-xxx-cthumb_wm1.png` | 带水印缩略图 |

这些签名地址就藏在分享页内嵌的 SSR 数据里。

## 数据流

```
浏览器                     服务端                         目标平台
  │ POST /api/parse  {url}    │                              │
  ├──────────────────────────►│ 1. 校验链接，选择平台适配器      │
  │                           │ 2. 拉取分享页 HTML ──────────►│
  │                           │ 3. 提取内嵌 SSR 数据           │
  │                           │ 4. 遍历找图片、取无水印地址      │
  │◄──────────────────────────┤ 5. 归一化成 ParsedImage[]     │
  │                           │                              │
  │ GET /api/proxy?url=&download=1                           │
  ├──────────────────────────►│ 补 Referer 转发 ─────────────►│ 图床有防盗链
  │◄──────────────────────────┤ Content-Disposition: attachment
  │                           │
  │ POST /api/zip  {files[]}  │
  ├──────────────────────────►│ 逐张下载 + 内存打包 zip
  │◄──────────────────────────┤ application/zip
```

## 目录结构

```
shared/types/            前后端共享的数据契约（唯一事实来源）
server/
  api/
    parse.post.ts        POST /api/parse    解析链接
    proxy.get.ts         GET  /api/proxy    代下载（绕防盗链 + 强制附件下载）
    zip.post.ts          POST /api/zip      批量打包下载
    platforms.get.ts     GET  /api/platforms 平台清单
  utils/
    platform/
      types.ts           PlatformAdapter 接口
      index.ts           适配器注册表 + 链接校验
      doubao.ts          豆包适配器
    http.ts              HTML 抓取 / 实体解码 / SSR 数据提取
    security.ts          域名白名单（SSRF 防护）、文件名清洗
    zip.ts               store 模式 ZIP 打包（零依赖）
    errors.ts            可预期的解析错误
app/
  pages/index.vue        主页面
  components/
    ParseForm.vue        链接输入
    ImageCard.vue        单图卡片（下载 / 复制 / 水印对比）
  composables/
    useImageParser.ts    解析状态 + 下载动作
  utils/download.ts      浏览器下载工具
```

## 新增一个平台

1. 在 `server/utils/platform/` 下新建 `<platform>.ts`，实现 `PlatformAdapter`：

```ts
export const xxxAdapter: PlatformAdapter = {
  id: 'xxx',
  name: '某某',
  example: 'https://xxx.com/share/abc',
  match: url => url.hostname.endsWith('xxx.com'),
  async parse(url) {
    const html = await fetchHtml(url.href)
    // 提取图片，产出 ParsedImage[]（url 指向无水印原图）
    return { platform: {...}, sourceUrl: url.href, images, parsedAt: new Date().toISOString() }
  }
}
```

2. 注册到 `server/utils/platform/index.ts` 的 `platformAdapters` 数组。

3. 补充 `server/utils/security.ts` 里的 `ALLOWED_IMAGE_HOSTS` 图床域名。

前端、API 路由、下载逻辑都不用改。

## 说明

- 解析的是平台云端已存在的原始文件，不是对带水印图片做修补。若作者上传时就只有带水印版本，卡片会标注「仅水印版」。
- `data-fn-args` 属性值和 `_ROUTER_DATA` 两种 SSR 数据来源都会尝试；遍历时不写死 JSON 路径，并自动解包被二次编码的 JSON 字符串，以适应页面结构变化。
- `/api/proxy` 与 `/api/zip` 只允许白名单域名，避免被当作任意 URL 代理。
