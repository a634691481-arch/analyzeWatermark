# 小红书适配 · 实验结论台账

## 用例台账

| 类型 | 分享短链 | noteId | 结果 |
|---|---|---|---|
| 图文（5 图） | `https://xhslink.cn/o/3iRd5juLzyP` | `6aaf7c260000000026039298` | ✅ 已验证 |
| 视频 | 待补充 | — | ⚠️ 未验证 |

> 视频分支代码已按结构实现，但**没有真实视频分享链接可验证**。
> 缺 `xsec_token` 时页面会 302 到 `/404/sec_xxx`，无法用裸 noteId 拼出来。

## 请求契约

```
1) GET  https://xhslink.cn/o/xxxx          → 302 到
   https://www.xiaohongshu.com/discovery/item/{noteId}?xsec_token=xxx&xsec_source=app_share
2) GET  {该地址}  （必须带移动端 UA）        → HTML 内联 __INITIAL_STATE__
```

### 三条硬约束（都实测过）

| 约束 | 现象 |
|---|---|
| **必须带 `xsec_token`** | 去掉后 302 到 `www.xiaohongshu.com/404/sec_xxx?source=xhs_sec_server` |
| **必须用移动端 UA** | 桌面 UA 直接 302 到 `/login?redirectPath=...`，拿不到数据 |
| **`__INITIAL_STATE__` 不是严格 JSON** | 里面混着 JS 的裸 `undefined` 字面量，直接 `JSON.parse` 会炸，要先洗成 `null` |

数据路径（**不是** `note.noteDetailMap`，那是旧版结构）：

```
state.noteData.data.noteData → { noteId, type, title, desc, user, imageList[], video }
```

`type` 取值：`normal` = 图文，`video` = 视频。

## 图片：无水印地址怎么来

`imageList[]` 每一项里有 `fileId`（TOS 对象键，形如 `note_pre_post_uhdr/xxxx`），
通过 `!` 后缀选 CDN 模板。实测（同一 fileId）：

| 地址 | 返回 | 尺寸 | 结论 |
|---|---|---|---|
| `sns-img-bd.xhscdn.com/{fileId}!nd_dft_wlteh_jpg_3` | JPEG 232KB | 1080x1440 | **主下载地址**（无水印、通用格式） |
| `sns-img-bd.xhscdn.com/{fileId}!nd_dft_wgth_webp_3` | WEBP 153KB | 810x1080 | **占位小图**（无水印） |
| `sns-img-bd.xhscdn.com/{fileId}` | HEIC 2624KB | 4284x5712 | **源文件**（iPhone Ultra HDR） |
| `!h5_1080jpg` | JPEG 309KB | 1080x1440 | ❌ **带水印** |
| `!h5_1080webp` | WEBP 237KB | 1080x1440 | ❌ **带水印** |

### ⚠️ 踩过的坑：水印只加在 `h5_*` 一族上

第一版按 `!h5_1080jpg` 做主下载地址，结果列表里看到的图**是带水印的**。

模板实际分两族，且各自内部像素级一致：

```
h5_1080jpg  == h5_1080webp                       (0% 差异)
nd_dft_wlteh_jpg == nd_dft_wgth_webp == nd_dft_wlteh_webp == nd_dft_wgth_jpg  (0% 差异)
h5_*  vs  nd_*    → 有差异，且差异集中在固定位置
```

判定方法（探针 10）：两族缩放到同尺寸做**带符号**亮度差（而不是绝对值）。

```
h5_1080jpg - nd_wlteh_jpg :  更亮 572 像素，更暗 0 像素
nd_wlteh_jpg - h5_1080jpg :  更亮 0 像素，更暗 572 像素
```

只亮不暗 = h5 版多了一层**半透明白色叠加**。再看差异形态：
只有 18 行有差异，每行 3~7 段、最长连续 17px —— **细笔划，是文字不是噪点**。

5 张图逐一验证（探针 11），结论完全一致：

| 图 | h5更亮 | h5更暗 | 差异行区间 |
|---|---|---|---|
| #1 | 572 | 0 | 351-368 |
| #2 | 589 | 0 | 351-368 |
| #3 | 596 | 0 | 351-368 |
| #4 | 513 | 0 | 351-368 |
| #5 | 593 | 0 | 351-368 |

5 张不同的图，水印都落在**完全相同的行区间**，这只能是服务端叠加的固定水印层。

**所以：不要用 `imageList[].url` / `infoList` 里的预览地址（都属于 h5_* 一族），
必须按 `fileId` 重建 `nd_dft_*` 地址。**

其它结论：

1. **源文件只有 HEIC**，穷举了 20 个模板都拿不到大尺寸 JPEG，最大的 JPEG 就是 1080 宽。
2. 所以主地址给 1080 JPEG（Windows/安卓都能直接打开），
   源文件单独放一枚「原图(HEIC)」按钮，由用户自选。
3. `sns-img-bd.xhscdn.com/{fileId}` 这条路径**没有日期/签名段**，
   是长期有效的；而页面里 `imageList[].url` 带 `/202609201439/{hash}/` 前缀（会过期），
   本来也不该拿来当下载地址。

## 视频（未验证，按结构实现）

```
watermarked : video.media.stream.h264[0].masterUrl
clean       : https://sns-video-bd.xhscdn.com/{video.consumer.originVideoKey}
```

`originVideoKey` 是原始对象键，拼 CDN 即无水印原片；`masterUrl` 是带水印转码流。
拿不到 `originVideoKey` 时会回退到 `masterUrl` 并如实标注 `watermarkFree: false`。

## 代理白名单域名

```
xiaohongshu.com   xhslink.cn   xhslink.com   xhscdn.com
```
