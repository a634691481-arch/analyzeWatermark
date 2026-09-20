# 哔哩哔哩适配 · 实验结论台账

## 用例台账

| 类型 | 分享链接 | BV 号 | 结果 |
|---|---|---|---|
| 普通投稿（单P） | `https://b23.tv/BV1uDe16vE51` | `BV1uDe16vE51` | ✅ 已验证（720P 单文件 mp4，205.7s） |

## 请求契约

B 站的接口**不需要登录**，但要带 `Referer: https://www.bilibili.com/`，
不带会被接口拒绝或拿到降级结果。

```
1) GET {短链}                                  → 跟跳转拿到 /video/BVxxx/
   b23.tv 有两种形态：
     https://b23.tv/BV1uDe16vE51   路径本身就是 BV 号
     https://b23.tv/xxxxxxx        纯短码，必须跟跳转
   → 统一「跟着跳转走到终点，再从路径里抠 BV/av 号」

2) GET https://api.bilibili.com/x/web-interface/view?bvid=BVxxx
   → { bvid, aid, cid, title, duration, pic(封面), owner, pages[](分P), dimension }

3) GET https://api.bilibili.com/x/player/playurl?bvid=BVxxx&cid=xxx&qn=127&fnval=0&fourk=1
   → durl[]（音视频合一的 mp4）
```

## 关键一：走 durl，不要走 dash

同一个 playurl 接口，`fnval` 决定返回形态，实测差异很大：

| fnval | 返回 | 结果 |
|---|---|---|
| **不带 / `0` / `1`** | `durl` | **单文件 mp4，音视频合一，quality=64（720P），9.5MB** ✅ |
| `16` / `80` / `4048` | `dash` | 音视频**分离**的 m4s，最高只有 852x480 ❌ |

dash 的问题是浏览器直接下只有画面没声音，必须服务端 ffmpeg mux —— 而本项目部署环境
不保证有 ffmpeg。而 durl 不但省掉 mux，清晰度还更高（720P > 480P）。

所以适配器**固定用 `fnval=0`**。

未登录下 durl 的清晰度实测：

| 请求 qn | 实得 quality | format | 大小 |
|---|---|---|---|
| 127 / 120 / 116 / 112 / 80 / 64 | 64（720P） | mp4720 | 9.5MB |
| 32 / 16 | 16（360P） | mp4 | 4.4MB |

即**未登录封顶 720P**（接口 accept_quality 里虽然列了 1080P+，但实际不给）。

下载后 ffprobe 复核：

```
0,h264,video,1280,720
1,aac,audio
>>> 含视频轨: true | 含音频轨: true | 音视频合一 ✅
```

## 关键二：CDN 校验 Referer

| 资源 | 不带 Referer | 带 Referer |
|---|---|---|
| durl mp4（bilivideo.com） | **HTTP 403** | HTTP 200 |
| dash 视频 m4s（bilivideo.com） | **HTTP 403** | HTTP 200 |
| dash 音频 m4s（mcdn.bilivideo.cn） | 200 | 200 |
| 封面（hdslb.com） | 200 | 200 |

所以 `server/utils/security.ts` 加了 `refererForHost()`，
在代理解析层按域名补 `https://www.bilibili.com/`。
**只有 bilivideo / hdslb / bilibili 这三个域名需要**，不是一律带 referer。

Range 支持正常：`Range: bytes=0-1023` → `206` + `Content-Range: bytes 0-1023/10004037`，
配合代理的 Range 透传，播放器可以拖动进度条。

## 关于「水印」

B 站**不对普通投稿视频烧角标水印**。播放器上看到的 UP 主信息和 bilibili logo
是 UI 层，不在视频流里。

实测验证（抽 5 帧看四角的跨帧方差）：

| 区域 | 跨帧方差 | 平均亮度 |
|---|---|---|
| 左上 | 3825.4 | 173.8 |
| 右上 | 4708.0 | 189.6 |
| 左下 | 5104.8 | 156.5 |
| 右下 | 5993.2 | 160.8 |

四个角方差都很大 → 画面在变，是视频内容；如果是静态叠加的水印 logo，
方差会接近 0。所以这条流没有烧录水印。

⚠️ 两点如实说明：
- **UP 主自己烧进画面的水印去不掉**，也不在本工具范围内。
- 番剧 / 影视类内容 B 站可能会加角标，适配器统一标 `watermarkFree: true`
  是按「普通投稿」的情况处理的。

## 分P 支持

`view.pages[]` 有多个时，每个分P 单独请求一次 playurl，产出多条媒体：

```
filename: bilibili_{BV号}_p{序号}.mp4
id:       {BV号}_p{序号}
```

单次解析上限 20 个分P（`MAX_PAGES`），避免一个请求打太多接口。

## 可选：更高清晰度

未登录封顶 720P。若设置环境变量 `BILIBILI_SESSDATA`（用户自己的 B 站 Cookie），
适配器会把它作为 `cookie: SESSDATA=...` 透传给接口，可解锁更高清晰度。
只透传、不落日志。

## 代理白名单域名

```
bilibili.com   b23.tv   bilivideo.com   bilivideo.cn   hdslb.com
```
