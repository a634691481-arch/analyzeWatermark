# 抖音适配 · 实验结论台账

> 本文件记录「先隔离验证再合并」的过程证据。合并进主流程后可保留作为回归依据。

## 用例台账

| # | 分享短链 | 类型 | aweme_id | 路由 | SSR key |
|---|---|---|---|---|---|
| 1 | `https://v.douyin.com/PJIP6J56t8Y/` | 单视频 | `7686802947086257408` | `/share/video/{id}/` | `video_(id)/page` |
| 2 | `https://v.douyin.com/lZGNcAGUqsY/` | 图文 16 图 | `7677600660402119673` | `/share/note/{id}/` | `note_(id)/page` |

关键：**两类帖子的路由名和 SSR key 都不同，但内部都是 `xxx.page.videoInfoRes.item_list[0]`**。
→ 所以适配器不能写死路径，要用「递归遍历找 `item_list` / `images`」的方式（和豆包同一套思路）。

## 请求契约（纯协议，无需浏览器）

```
1) GET  https://v.douyin.com/xxxx/            → 302，Location 是完整的分享页 URL
2) GET  {Location}                            → Set-Cookie: ttwid=...   ← 风控会话票据
3) GET  {Location}  Cookie: ttwid=...         → HTML 里 SSR 含 videoInfoRes
```

### 为什么必须带 ttwid

不带 cookie 时分享页返回 34,586 字节，`play_addr` 命中 0 次；
带 `ttwid` 后返回 40,530 字节，出现 `videoInfoRes`。

**`ttwid` 是纯 HTTP 拿到的，不需要执行 JS。** 所以整个流程可以做到浏览器无关。

### 实测被墙的路径（不要走）

| 端点 | 结果 |
|---|---|
| `GET /web/api/v2/aweme/iteminfo/?item_ids=` | HTTP 200 但 **0 字节**（已废弃） |
| `GET /aweme/v1/web/aweme/detail/` | **403 `Blocked by ArgusSecurityPlugin Uifid Not Found`**（需 uifid + a_bogus 签名，signer-gated） |
| `GET www.douyin.com/video/{id}`（桌面） | 72KB HTML，不含任何视频数据 |

→ 结论：**不要碰 `/aweme/v1/web/aweme/detail/`**，走 `iesdouyin` 分享页 SSR 这条路。

## 无水印地址怎么来的

### 视频帖

```
play_addr.url_list[0] = https://aweme.snssdk.com/aweme/v1/playwm/?video_id={uri}&ratio=720p&line=0
                                                                 ^^^^^^ 带水印
```

把路径里的 `playwm` 换成 `play` → 无水印。`video_id` 就是 `video.play_addr.uri`。

实测两个流：

| | playwm | play |
|---|---|---|
| 大小 | 7,641,313 B | 5,807,052 B |
| 码率 | 1617 kbps | 1322 kbps |
| 时长 | 34.875s / 837 帧 | 31.875s / 765 帧 |
| 分辨率 | 1280x720 | 1280x720 |

时长差 3 秒（多出来的在尾部），所以**按同一时间戳抽帧比对会得到 91% 的假差异**。
正确做法是先做时间轴互相关对齐：

- 在 t = 5/10/15/20/25s 五个基准点上，最佳 offset 全部是 `0s`，meanAbsDiff 4~7
  → 证明两条流是**同一内容、逐帧对齐**
- 对齐后强差异（d>120/765）仅 **0.8% ~ 1.2%**，且**稳定集中在 y=135~180（底部 25% 条带）**
  → 这就是水印叠加层的位置

### 图文帖

图片对象里有两个数组，**同一个 `uri`，不同 CDN 模板**：

| 字段 | 模板 | 含义 |
|---|---|---|
| `images[].url_list` | `~tplv-dy-lqen-new:1440:2560:q80` | **无水印** ✅ |
| `images[].download_url_list` | `~tplv-dy-lqen-new-water:1440:2560:5oqW6Z-z5Y-377yaMTY2NjU3OTIz:q80` | 带水印 |

模板名里的 `-water` 就是水印标记。中间那段 base64 解码：

```
5oqW6Z-z5Y-377yaMTY2NjU3OTIz  →  抖音号：166657923
```

**水印文字直接写在 URL 里，这是结构性铁证。**

像素复核（1440x2560，两版尺寸一致）：

- 强差异像素占比 **0.365%**
- 纵向差异集中在 `y=600-640`（底部）
- 横向差异集中在 `x=80-280`（右下角，正好放得下 `抖音号：166657923`）

## 归一化映射

| 统一字段 | 抖音来源 |
|---|---|
| `type` | `item.images?.length` 有值 → `image`；否则 `video` |
| `url` | 视频：`play_addr.url_list[0]` 的 `playwm`→`play`；图片：`images[].url_list` 优先选 jpeg |
| `thumbnailUrl` | 视频：`video.cover`；图片：带水印的 `download_url_list`（当占位图） |
| `width/height` | `video.width/height` 或 `images[].width/height` |
| `duration` | `video.duration`（毫秒） |
| `author` | `item.author.nickname` |
| `title` | `item.desc` |
| `filename` | `douyin_{序号}_{aweme_id后8位}.mp4 / .jpeg` |

## URL 稳定性

| 地址 | 过期参数 | 结论 |
|---|---|---|
| 视频 `aweme.snssdk.com/aweme/v1/play/` | 无 | **长期有效**，只有 video_id/ratio/line |
| 图片 `p11-sign.douyinpic.com/...` | `x-expires=1792476000` | 约 2036 年，够用 |
| 分享页 `ie*p` v.douyin 短链 | `ts`/`share_sign` | 短链长期有效 |

→ 视频优先用无签名的 `aweme.snssdk.com` 地址，比带签名的 CDN 跳转地址更稳。

## 需要的代理白名单域名

```
douyin.com        iesdouyin.com    douyinpic.com
snssdk.com        douyinvod.com    jspcdn.cn
```
