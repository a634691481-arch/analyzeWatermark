"""探针 4：像素级对比 image_ori_raw 与 image_ori / image_preview，判断水印层位置与强度。

判定思路（同小红书那套）：
  同一画面两份文件，若其中一份多出的是一层「只亮不暗、细笔划」的像素，
  那就是服务端叠加的水印，而不是重新编码产生的噪声。
"""
from PIL import Image, ImageChops
import numpy as np

base = Image.open("experiments/doubao/out/image_ori_raw.png").convert("RGB")
for name in ["image_ori", "image_preview", "image_thumb"]:
    other = Image.open(f"experiments/doubao/out/{name}.png").convert("RGB")
    print(f"\n=== raw vs {name} ===")
    print("size:", base.size, other.size)
    if base.size != other.size:
        other = other.resize(base.size)
    a = np.asarray(base, dtype=np.int16)
    b = np.asarray(other, dtype=np.int16)
    diff = b - a                      # 带符号：>0 表示 other 更亮
    lum = diff.mean(axis=2)
    changed = np.abs(lum) > 8
    print(f"changed px: {changed.sum()} ({changed.mean() * 100:.3f}%)")
    if changed.any():
        ys, xs = np.nonzero(changed)
        print(f"bbox: x[{xs.min()}..{xs.max()}] y[{ys.min()}..{ys.max()}]  img={base.size}")
        print(f"mean signed delta on changed: {lum[changed].mean():+.1f}")
        print(f"brighter(>8): {(lum > 8).sum()}  darker(<-8): {(lum < -8).sum()}")
        # 分块统计，看水印集中在哪
        h, w = lum.shape
        for ry in range(3):
            row = []
            for rx in range(3):
                block = lum[ry * h // 3:(ry + 1) * h // 3, rx * w // 3:(rx + 1) * w // 3]
                row.append(f"{(np.abs(block) > 8).sum():>8d}")
            print("  block:", " ".join(row))
