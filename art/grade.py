import sys, numpy as np
from PIL import Image

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def grade(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    L = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
    # 霓虹高光：把纯红推向品红，把橙色保留为琥珀
    hsv = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).convert('HSV')).astype(np.float32)
    h = hsv[..., 0] / 255 * 360
    s = hsv[..., 1] / 255
    v = hsv[..., 2] / 255
    red = ((h >= 340) | (h <= 14)).astype(np.float32)
    h2 = (h - 26 * red) % 360
    neon = np.asarray(Image.fromarray(np.stack([h2 / 360 * 255, s * 255, v * 255], -1).clip(0, 255).astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255.0
    # 暗部与中间调：去饱和后染成深蓝 / 青
    grey = np.repeat(L, 3, -1)
    deep = np.array([0.035, 0.07, 0.16])
    teal = np.array([0.09, 0.34, 0.46])
    cool = deep + (teal - deep) * smooth(0.05, 0.55, L)
    cool = cool * (0.42 + 1.45 * L)  # 保留明暗结构与暗部细节
    cool = cool * 0.75 + grey * 0.12 + neon * 0.13
    # 高亮区域（灯牌、积水反光）保留霓虹原色
    sat_light = smooth(0.58, 0.92, (s * v)[..., None])  # 只有真正鲜艳的灯牌保留原色
    keep = np.maximum(smooth(0.45, 0.85, L) * (0.55 + 0.45 * s[..., None]), sat_light * 0.6)
    out = cool * (1 - keep) + neon * keep
    out = np.clip(out, 0, 1) ** 1.08
    return Image.fromarray((out * 255).clip(0, 255).astype(np.uint8))

if __name__ == '__main__' and '--build' not in sys.argv:
    src, dst, w = sys.argv[1], sys.argv[2], int(sys.argv[3])
    im = Image.open(src)
    if w and im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    g = grade(im)
    g.save(dst, quality=88)


# ---------------------------------------------------------------
# 生成网站用的背景：python3 art/grade.py --build
# 输入 art/source/pexels-18867525-original.jpg（原图，不改动）
# 输出 public/images/city/ 下的 AVIF / WebP（调色 + 柔化右侧品牌标志）
# ---------------------------------------------------------------
def soften_logo(im):
    from PIL import ImageFilter, ImageDraw
    W, H = im.size
    box = (int(W * 0.855), int(H * 0.265), int(W * 0.94), int(H * 0.42))
    blurred = im.filter(ImageFilter.GaussianBlur(radius=W / 260))
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=int(W * 0.02), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=W / 300))
    return Image.composite(blurred, im, mask)


def soften_distant_panels(im):
    """将远景天桥下极小的两处远方灯箱柔化为纯光斑，避免出现难以辨识的微小笔画感。"""
    from PIL import ImageFilter, ImageDraw
    W, H = im.size
    blurred = im.filter(ImageFilter.GaussianBlur(radius=max(1.4, W / 820)))
    mask = Image.new('L', im.size, 0)
    draw = ImageDraw.Draw(mask)
    for (x0, y0, x1, y1) in (
        (0.453, 0.562, 0.471, 0.628),
        (0.540, 0.540, 0.558, 0.598),
    ):
        draw.rounded_rectangle(
            (int(W * x0), int(H * y0), int(W * x1), int(H * y1)),
            radius=max(2, int(W * 0.003)),
            fill=255,
        )
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(1.0, W / 1100)))
    return Image.composite(blurred, im, mask)


def polish_cyber(im):
    """对生成的赛博都市母版做克制影调微调：保持原生材质、清晰汉字与暗部细节，轻微加深午夜蓝层次。"""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    # 轻微加深暗部与中间调的电影对比度，避免整体发灰，同时保留暗部建筑结构
    a = np.clip(a, 0.0, 1.0) ** 1.05
    # 极轻微微调暗部偏向深午夜蓝，高光暖琥珀/品红/青蓝原样保留
    L = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])[..., None]
    shadow = 1.0 - smooth(0.18, 0.58, L)
    tint = np.array([0.96, 0.99, 1.04], dtype=np.float32)
    a = a * (1.0 - shadow * 0.25) + (a * tint) * (shadow * 0.25)
    return Image.fromarray((np.clip(a, 0.0, 1.0) * 255).astype(np.uint8))


def build_cyber():
    """从 art/source/cyber-city-master.jpg 导出原生清晰度（1376×768）及适配尺寸的 AVIF / WebP，保留旧 street-* 回退文件。"""
    import os
    src = os.path.join(os.path.dirname(__file__), 'source', 'cyber-city-master.jpg')
    out = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'city')
    os.makedirs(out, exist_ok=True)
    base = polish_cyber(soften_distant_panels(Image.open(src).convert('RGB')))
    native_w = base.width
    for w in (native_w, 960):
        im = base.resize((w, round(base.height * w / base.width)), Image.LANCZOS) if base.width > w else base
        im.save(os.path.join(out, f'cyber-city-{w}.avif'), quality=68 if w == native_w else 64, speed=5)
        im.save(os.path.join(out, f'cyber-city-{w}.webp'), quality=86 if w == native_w else 84, method=6)
    small = base.resize((640, round(base.height * 640 / base.width)), Image.LANCZOS)
    small.save(os.path.join(out, 'cyber-city-soft-640.webp'), quality=74, method=6)
    for f in sorted(os.listdir(out)):
        if f.startswith('cyber-city'):
            print(f, os.path.getsize(os.path.join(out, f)) // 1024, 'KB')


def build_legacy():
    import os
    src = os.path.join(os.path.dirname(__file__), 'source', 'pexels-18867525-original.jpg')
    out = os.path.join(os.path.dirname(__file__), '..', 'public', 'images', 'city')
    os.makedirs(out, exist_ok=True)
    base = grade(soften_logo(Image.open(src).convert('RGB')))
    for w in (2560, 1600):
        im = base.resize((w, round(base.height * w / base.width)), Image.LANCZOS) if base.width > w else base
        im.save(os.path.join(out, f'street-{w}.avif'), quality=58, speed=6)
        im.save(os.path.join(out, f'street-{w}.webp'), quality=80, method=6)
    # 给后面阅读区用的小图：本来就会被模糊，640 宽足够
    small = base.resize((640, round(base.height * 640 / base.width)), Image.LANCZOS)
    small.save(os.path.join(out, 'street-soft-640.webp'), quality=70, method=6)
    for f in sorted(os.listdir(out)):
        print(f, os.path.getsize(os.path.join(out, f)) // 1024, 'KB')


if __name__ == '__main__' and '--build' in sys.argv:
    build_cyber()
elif __name__ == '__main__' and '--build-legacy' in sys.argv:
    build_legacy()
