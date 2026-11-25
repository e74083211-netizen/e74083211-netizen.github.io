# 背景美术素材

## 当前主背景：原创雨夜中文赛博都市

| 项目 | 内容 |
| --- | --- |
| 原图母版 | `art/source/cyber-city-master.jpg`（1376 × 768，16:9 原生分辨率，未作虚假放大） |
| 来源 | 本项目使用 Antigravity 内置图像生成能力原创生成 |
| 画面构图 | 略微抬升的雨夜都市峡谷街道视角，左右多层混凝土与钢架建筑夹道，远景天桥与巨构高塔隐入深蓝夜雾，中上部预留安静暗调区承载首屏标题，底部湿滑路面映射琥珀、青蓝与柔品红霓虹倒影 |
| 画面文字 | 仅包含三处准确简体中文环境灯牌：「晚安」（左下暖琥珀店招）、「今夜」（中左青蓝霓虹）、「星河」（中右柔品红霓虹）；远景两处极小光箱在构建时柔化为纯光斑，不含外文或伪字符 |

### 网站上用的版本（由脚本生成，请勿手动编辑）

`public/images/city/`

- `cyber-city-1376.avif` / `cyber-city-1376.webp`：桌面与高分屏主图（1376 × 768 原生分辨率）
- `cyber-city-960.avif` / `cyber-city-960.webp`：窄屏与移动设备用（960 × 536）
- `cyber-city-soft-640.webp`：后续阅读区用的柔焦底图（网页里再叠加模糊与暗调）

重新生成：

```bash
python3 art/grade.py --build
```

需要 Python 3 和 Pillow（本机已安装）。

---

## 保留的旧版回退背景（实拍街景）

原有 Pexels 实拍雨夜街景文件已完整保留作为加载失败时的自动回退：

| 项目 | 内容 |
| --- | --- |
| 原图 | `art/source/pexels-18867525-original.jpg`（3000 × 1688，未修改） |
| 网页文件 | `public/images/city/street-2560.*`、`street-1600.*`、`street-soft-640.webp` |
| 来源 | Pexels：“Night City Street after Rain Illuminated by Colorful Neon Signs Reflecting on a Wet Road” — https://www.pexels.com/photo/night-city-street-after-rain-illuminated-by-colorful-neon-signs-reflecting-on-a-wet-road-18867525/ |
| 许可 | Pexels License（https://www.pexels.com/license/）：可免费用于个人与商业用途，允许修改，不强制署名。 |

如需重建旧版回退图，可运行 `python3 art/grade.py --build-legacy`。

## 想换成别的背景图

1. 替换 `art/source/cyber-city-master.jpg`（推荐 16:9 横图：沿街纵深视角、两侧建筑立面丰富、中上部有较安静的夜雾/阴影区承载标题）。
2. 运行 `python3 art/grade.py --build`。
3. 打开 `public/js/city.js`，按新画面调整 `GLINTS` 里灯牌呼吸/微闪光晕的归一化坐标（0~1）。
