"""生成站点图标：深色底 + 绿色渐变下载箭头。

16px 下只有「箭头 + 托盘」的轮廓能看清，所以不放文字、粒子等细节。
4 倍超采样后缩小，保证小尺寸边缘干净。

输出：
  public/favicon.ico                 圆角版，多尺寸
  public/apple-touch-icon.png        180，方形满底（iOS 自己加圆角，不能留透明角）
  public/pwa-192x192.png             方形满底
  public/pwa-512x512.png             方形满底
  public/maskable-icon-512x512.png   图形缩到 62%，留 Android 裁切安全区
"""
from PIL import Image, ImageDraw

S = 4
BASE = 1024
SIZE = BASE * S

BG_TOP = (18, 34, 30)
BG_BOTTOM = (5, 7, 10)
GREEN_TOP = (52, 211, 153)
GREEN_BOTTOM = (5, 150, 105)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, top, bottom):
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        grad.putpixel((0, y), lerp(top, bottom, y / max(size - 1, 1)))
    return grad.resize((size, size), Image.NEAREST)


def render(rounded: bool) -> Image.Image:
    bg = vertical_gradient(SIZE, BG_TOP, BG_BOTTOM).convert("RGBA")

    # 设计稿按 1024 画，实际画布是 SIZE（4 倍超采样），所有坐标统一乘 S
    def px(value: int) -> int:
        return int(value * S)

    if rounded:
        mask = Image.new("L", (SIZE, SIZE), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, SIZE - 1, SIZE - 1], radius=px(56), fill=255
        )
    else:
        mask = Image.new("L", (SIZE, SIZE), 255)

    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    # 箭头 + 托盘（坐标按 1024 设计稿，px() 只负责超采样放大）
    shape = Image.new("L", (SIZE, SIZE), 0)
    sd = ImageDraw.Draw(shape)
    sd.rounded_rectangle([px(448), px(196), px(576), px(512)], radius=px(44), fill=255)   # 竖杆
    sd.polygon([(px(316), px(492)), (px(708), px(492)), (px(512), px(726))], fill=255)    # 箭头
    sd.rounded_rectangle([px(300), px(792), px(724), px(856)], radius=px(32), fill=255)   # 托盘

    green = vertical_gradient(SIZE, GREEN_TOP, GREEN_BOTTOM).convert("RGBA")
    icon.paste(green, (0, 0), shape)

    # 浅色背景下给轮廓一点暗边，避免边缘糊掉
    edge = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle(
        [0, 0, SIZE - 1, SIZE - 1],
        radius=px(56) if rounded else 0,
        outline=(255, 255, 255, 26),
        width=px(2),
    )
    return Image.alpha_composite(icon, edge).resize((BASE, BASE), Image.LANCZOS)


rounded_master = render(rounded=True)
square_master = render(rounded=False)

# favicon：圆角版
rounded_master.resize((256, 256), Image.LANCZOS).save("experiments/favicon/preview-256.png")
rounded_master.resize((256, 256), Image.LANCZOS).save(
    "public/favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

# iOS / PWA：方形满底
square_master.resize((180, 180), Image.LANCZOS).save("public/apple-touch-icon.png")
square_master.resize((192, 192), Image.LANCZOS).save("public/pwa-192x192.png")
square_master.resize((512, 512), Image.LANCZOS).save("public/pwa-512x512.png")

# maskable：图形本身只占画布一半，已在 Android 裁切安全区内，直接用方形满底
square_master.resize((512, 512), Image.LANCZOS).save("public/maskable-icon-512x512.png")

# 32px 最近邻放大，方便肉眼检查小尺寸可读性
rounded_master.resize((32, 32), Image.LANCZOS).resize((256, 256), Image.NEAREST).save(
    "experiments/favicon/preview-32x8.png"
)

print("ok: favicon.ico / apple-touch-icon.png / pwa-192 / pwa-512 / maskable")
