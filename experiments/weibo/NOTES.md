# 微博（weibo.com / video.weibo.com）

## 结论速览

| 项 | 结果 |
| --- | --- |
| 分享链接形态 | `video.weibo.com/show?fid=1034:xxx`、`weibo.com/tv/show/1034:xxx`、`weibo.com/{uid}/{mblogid}`、`m.weibo.cn/status/xxx` |
| 能否匿名 | 能，但接口要「访客身份」（SUB/SUBP cookie），否则 302 到 Sina Visitor System |
| 媒体字段 | oid 形态走 `Component_Play_Playinfo.urls`；正文形态走 `page_info.media_info` |
| 水印 | 微博只下发**一份**文件，上面所有字段指向同一个 `f.video.weibocdn.com/o0/*.mp4`，不存在带/不带水印两份 |
| 下载 | `f.video.weibocdn.com` 不校验登录，但校验 **Referer**，不带直接 403 |

## 踩坑记录

### 1. 直连分享页拿不到数据

```
GET https://video.weibo.com/show?fid=1034:5342648219926608
→ 302 passport.weibo.com/visitor/visitor?...（Sina Visitor System）
→ 9KB 的指纹页，HTML 里没有任何媒体地址
```

分享页是 SPA，媒体全靠接口下发，所以必须走 API。

### 2. 访客身份两步握手

```
GET passport.weibo.com/visitor/genvisitor?cb=gen_callback&fp={os,browser,fonts,screenInfo,plugins}
→ gen_callback({"data":{"tid":"01ASlq-..."}})

GET passport.weibo.com/visitor/visitor?a=incarnate&t={tid}&w=2&c=095&gc=&cb=cross_domain&from=weibo&_rand=..&ua=php-sso_sdk_client-0.6.36
→ Set-Cookie: SUB=... / SUBP=...
```

SUB/SUBP 有效期一年，适配器里缓存 6 小时；接口若 302 就重取一次身份再试。

### 3. 组件接口要同时带 `page` 和 `data`

```
GET weibo.com/tv/api/component
    ?page=%2Ftv%2Fshow%2F1034%3A5342648219926608
    &data={"Component_Play_Playinfo":{"oid":"1034:5342648219926608"}}
→ {"code":"100000","data":{"Component_Play_Playinfo":{...}}}
```

只有 `page` 时返回 `{"code":"100001","msg":"miss param"}`；`data` 传 `{}` 时返回空数组。
`page` 用 `/tv/show/{oid}`，`data` 里必须带同一个 oid。

组件里的清晰度是中文键：

```
urls: { "高清 720P": "...template=720x1280...", "标清 480P": "...template=540x960..." }
stream_url: 与 480P 同一条
```

按 `template=宽x高` 估像素量排序取最高；HEVC 降权保证兼容性。

### 4. 正文 id 形态

```
GET weibo.com/ajax/statuses/show?id={id}
```

`id` 传数字 id（`5342648383832336`）和 base62 的 `mblogid`（`RhTtIg4XS`）都认。
返回的 `page_info.media_info` 里 `stream_url / stream_url_hd / mp4_720p_mp4 / mp4_hd_url / h265_*`
**全部指向同一个 URL**，再次说明微博没有「带水印版」。

> 传 `1034:5342648219926608`（带冒号的 oid）会返回 `参数错误`；传 media_id
> `5342648219926608` 会返回 `该微博不存在`。这两个都不是正文 id。

### 5. 下载必须带 Referer

```
GET f.video.weibocdn.com/o0/....mp4         → 403 text/html（146 字节）
GET f.video.weibocdn.com/o0/....mp4 + Referer: https://weibo.com/  → 200 video/mp4
```

`sinaimg.cn` 的封面图同理。两条都已经加进 `server/utils/security.ts` 的
`REFERER_RULES`，代理层自动补。

### 6. 水印验证

微博返回的只有一份文件，无从「两份对比」。改用时间维度：

- 720P：`h264 720x1280`，37.106s，5,620,914 字节
- 每 3 秒抽一帧共 12 帧，缩到 90x160 灰度后逐像素算时间方差
- 全图 std 均值 **44.68**；四角 20x30 区域 std 均值：左上 52.04 / 右上 50.20 / 左下 31.44 / 右下 43.15

四个角都在剧烈变化，没有「低方差的静态叠加块」。即：播放器上看到的
「微博」角标是 UI 层，流本身是干净的原片。所以 `watermarkFree: true`。

## 文件

| 文件 | 作用 |
| --- | --- |
| `lib.mjs` | 访客身份握手 + 带 cookie 的请求头 |
| `01-probe-api.mjs` | 探测 tv/component 各参数组合 |
| `02-structure.mjs` | 落盘组件接口结构，找 `stream_url` / `urls` |
| `03-verify.mjs` | 下载 720P/480P 并抽帧 |
| `04-other-api.mjs` | 正文接口 `ajax/statuses/show` 结构 |
| `05-mblogid.mjs` | 验证 mblogid 也能查 |
| `06-watermark-check.mjs` | 逐像素时间方差，判断有无静态水印层 |
| `_component.json` / `_ajax-mid.json` | 接口原始返回留档 |
