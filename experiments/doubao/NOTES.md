# 豆包适配 · 实验结论台账

样本：`https://www.doubao.com/thread/xTOlFYCgraKkBExtJ`（「怀远三绝创新产品摄影」，3 张图）

## 结论速览

| 项 | 结论 |
| --- | --- |
| 分享页可直抓 | ✅ 桌面 UA 直接 200，180KB HTML，无需 cookie / 签名 / 无头浏览器 |
| 数据位置 | `data-fn-args` 属性（2 个）+ `_ROUTER_DATA = {...}` 字面量，三份 payload 内容重叠 |
| 无水印字段 | `image_ori_raw`（模板 `image_raw_hflow`） |
| 带水印字段 | `image_ori` / `image_preview`（模板 `cgen_lwm3_hflow`）、`image_thumb`（`cthumb_lwm3`） |
| 视频 | 该样本无视频；豆包视频生成走另一套字段，未验证 |

## 请求契约

```
GET https://www.doubao.com/thread/<id>
UA: 桌面 Chrome 131 即可（与抖音不同，这里不要求移动端 UA）
Referer: https://www.doubao.com/   ← 可带可不带，实测都 200
```

字段层级（`forEachNode` 递归即可命中，不必写死路径）：

```
data.message_snapshot.message_list[1]
  .content[json][2].content.creation_block.creations[0].image   ← 图片对象
```

`message_list` 只有 2 条（1 用户 + 1 助手），助手一轮生成 3 张图，SSR 已给全，无分页。

## 水印验证（像素级，不是看地址形态）

三份文件同尺寸 2720×1520，**不能靠尺寸判断**。做法是把 `image_ori_raw` 与
`image_ori` 转成 int16 做**带符号亮度差**：

```
changed px: 8084 (0.196%)
bbox: x[2449..2687] y[1436..1491]      ← 右下角 238×55
mean signed delta: +14.1（只亮不暗为主）
九宫格分布：只有右下块有差异（8084），其余 8 块全 0
```

结论：`image_ori_raw` 与 `image_ori` 画面完全一致，差异仅水印层 → raw 是真无水印。
`image_thumb` 是 384×215 真缩略图，比例一致但没有对比意义。

## 踩过的坑

1. **`image_preview` 不再是预览图**。旧注释写 `cpreview_wm1`，现在它与 `image_ori`
   同一模板、同尺寸、同 5MB。拿它当 `thumbnailUrl`，首屏 3 张卡要多下 15MB。
   必须优先 `image_thumb`（148KB，省 97%）。
2. **扩展名不能按 key 猜**。源 key 是 `.jpeg`，模板名后拼 `.png`，CDN 返回
   `image/png`。按 key 会把 jpeg 后缀写进 PNG 文件。按 URL 末尾后缀取才对。
3. **模板名会漂移**。早期 `cdld_wm3` / `cpreview_wm1`，现在 `cgen_lwm3_hflow` /
   `cthumb_lwm3`。语义不变：`raw` = 原图，`wm`/`lwm` = 水印版。
4. **同一张图会重复出现 4 次**（raw/ori/preview/thumb 各一份 + 多 payload 重叠），
   必须按 `key` 去重，否则 3 张图会解析成 12 条。

## 附带修复：分享文案的中文粘连（影响全部平台）

App 复制出来的文案里，链接后面常常**紧跟中文且没有空格**：

```
https://www.doubao.com/thread/xTOlFYCgraKkBExtJ，复制本条信息
```

原提取正则是 `https?:\/\/[^\s]+`，会把「，复制本条信息」一起吞进 URL；
`new URL()` 再把中文百分号编码，`pathname` 变成 `/thread/xxxx%EF%BC%8C…`，
所有基于 pathname 的 `match()` 全部失效 —— 用户看到的是「暂不支持该平台」。
小红书 `http://xhslink.com/a/xxxx，复制本条信息` 同理。

改为只取可见 ASCII：`/https?:\/\/[\x21-\x7E]+/gi`，中文与全角标点自然成为边界。
修复后回归：豆包整段文案、小红书、抖音、无协议裸域名全部能进到对应适配器
（见 `07-url-extract-cases.mjs`）。


## 验证脚本

```bash
node experiments/doubao/01-probe.mjs      # 页面可达性 + SSR 标记
node experiments/doubao/02-extract.mjs    # 复刻提取逻辑，列图片清单
node experiments/doubao/03-variants.mjs   # 下载各变体，看 content-type / 体积
node experiments/doubao/04-diff.py        # 像素级带符号亮度差（需 Pillow）
node experiments/doubao/05-structure.mjs  # 消息条数 / 字段层级
node experiments/doubao/06-parse-cases.mjs       # 端到端：纯链接 / 带 query / 整段文案
node experiments/doubao/07-url-extract-cases.mjs # 跨平台链接提取回归

# 全链路（dev server 已起）
curl -s -X POST localhost:3000/api/parse -H "content-type: application/json" \
  -d '{"url":"https://www.doubao.com/thread/xTOlFYCgraKkBExtJ"}'
```

实测：解析 0.5~0.7s（首次请求含 dev 编译会到 40s+，属正常），
代理下载原图 5MB / 1.07s，缩略图 148KB / 0.10s。
