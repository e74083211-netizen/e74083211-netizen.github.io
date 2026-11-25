#!/usr/bin/env python3
"""导入私密照片时用：按拍摄方向摆正、缩小、去掉 EXIF（含 GPS 定位）后另存。原图不改动。

用法：python3 -I scripts/prep-image.py <原图> <输出.jpg> <最长边像素>
输出：一行 "宽 高"
"""
import sys
from PIL import Image, ImageOps

src, out, max_side = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)
icc = im.info.get('icc_profile')
im = ImageOps.exif_transpose(im)  # 按拍摄方向摆正
if im.mode not in ('RGB', 'L'):
    im = im.convert('RGB')
if max(im.size) > max_side:
    im.thumbnail((max_side, max_side), Image.LANCZOS)
# 不带 EXIF 保存：拍摄地点、设备信息都不会留在网站用的文件里；保留色彩配置
im.save(out, 'JPEG', quality=86, optimize=True, progressive=True, **({'icc_profile': icc} if icc else {}))
print(im.size[0], im.size[1])
