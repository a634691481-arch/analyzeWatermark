# 千问适配 · 实验结论台账

## 用例台账

| 类型 | 分享链接 | 结果 |
|---|---|---|
| 图片 + 视频 | `https://qianwen.my.cn/share/chat/58c5c60a43164ccfbf6bb76715be1ba3` | ✅ 已验证（1 图 + 1 视频） |

## 请求契约

分享页是**纯前端 SPA**（`@ali/tongyi-app-share`，脚本都在 g.alicdn.com），
4KB 的 HTML 里没有任何数据，`__INITIAL_STATE__` / `__NEXT_DATA__` 全都没有。
所以只能走接口 —— 接口信息是从前端 bundle 里挖出来的。

```
POST https://chat2-api.qianwen.com/api/v1/share/info?pr=qwen&fr=mac
Content-Type: application/json

{"share_id": "58c5c60a43164ccfbf6bb76715be1ba3", "biz_id": "ai_qwen"}
```

响应：`{ code: 0, data: { title, session: { record_list: [...] }, expired } }`，约 138KB。

### 两个关键点（bundle 里挖到的）

bundle 片段（main.js @7565）：

```js
t = "".concat((0,c.i)(), "/api/v1/share/info?pr=qwen&fr=mac")   // base = chat2-api.qianwen.com
a = e.bizId || (0,i.sF)("biz_id") || c.z                        // 默认 biz_id = ai_qwen
...
fetch(e.url, {
  method: "POST",                                               // ← 必须 POST
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ share_id: e.shareId, biz_id: e.bizId }),
  credentials: "include"
})
```

1. **必须是 POST** —— 先用 GET 试，接口返回
   `{"status":405,"error":"Method Not Allowed","path":"/api/v1/share/info"}`，才回头去 bundle 里看调用方式。
2. **不需要 cookie**，`biz_id` 也可省（服务端会解析），实测带不带、填什么都返回同样数据。

## 媒体位置与去水印字段

```
data.session.record_list[].response_messages[].meta_data.multi_load[].content.display_list[]
```

`display_list[]` 每一项是一张卡片，字段名天然区分了带不带水印：

| 卡片 type | 无水印 ✅ | 带水印 ❌ | 其它 |
|---|---|---|---|
| `generate_image` | `image[]` | `watermark_image[]` | `thumbnail[]`（干净）、`ref_image_ids` |
| `generate_video` | `video[]` | `download_video[]` | `cover[]`（干净，当 poster） |

`type=ref_image` 是生成时喂进去的参考图（本例里就是那张生成图本身），不属于生成结果，跳过避免重复。

另有一处等价来源 `content.extra_info.content.extra.result_images[]`：

| 字段 | 对应 |
|---|---|
| `url` / `cdn_url` | = `image`（同一份干净文件，字节数一致 1908KB） |
| `download_url` | = `watermark_image`（1935KB） |
| `preview_url` / `thumbnail_url` | 干净的小图 |

## 水印验证（带符号亮度差）

同抖音/小红书那套：把两份缩放到同尺寸做**带符号**亮度差。
只亮不暗 + 差异固定在局部条带 = 服务端叠加的**白色**水印层。

图片（540x720）：

| 对照 | 更亮 | 更暗 | 差异行 |
|---|---|---|---|
| `watermark_image` - `image` | 1329 | **0** | 678-701 |
| `result.cdn_url` - `image` | 0 | 0 | — |
| `result.download_url` - `image` | 1329 | 0 | 678-701 |
| `thumbnail` - `image` | 0 | 0 | — |

视频（216x288，先做时间轴互相关对齐）：

```
最佳 offset = 0s (score 1.87)   次优 0.25s (score 20.08)  → 两条流同内容、逐帧对齐
t=1s  download_video - video : 更亮 192 / 更暗 0 / 差异行 271-280
t=2s  download_video - video : 更亮 240 / 更暗 0 / 差异行 271-280
t=3s  download_video - video : 更亮 245 / 更暗 0 / 差异行 271-280
t=4s  download_video - video : 更亮 240 / 更暗 0 / 差异行 271-280
```

4 个时间点水印都落在**完全相同的行区间**，确认是固定叠加层。

规格：图片 960x1280 PNG；视频 832x1108 h264，5.04s，5.39MB（无水印）vs 2.46MB（带水印）。

## 地址有效期

资源地址形如：

```
https://workspace-zb-cdn.qianwen.com/{hash}%2Fo%2F{ts}.png?auth_key=1792483980-0-0-{sign}
```

`auth_key` 第一段是过期的秒级时间戳，本例约 **1 个月**后失效。
过期后重新解析即可（不是永久地址，所以历史缓存那套已经不做了，没影响）。

## 代理白名单域名

```
qianwen.com       chat2-api / workspace-zb-cdn
qianwen.my.cn     分享页
quark.cn          quark-aistudio-cdn（备用 CDN）
```
