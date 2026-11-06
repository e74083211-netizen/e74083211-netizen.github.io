# 私密素材模板

把整个文件夹复制成 `private-assets/`（已被 Git 忽略，不会上传到 GitHub）：

```
private-assets/
├── content.json          ← 私密文字：回忆、信、最后的惊喜
├── memories/
│   ├── memory-01.jpg     ← 对应 content.json 里 "photo": "memory-01"
│   ├── memory-02.heic    ← iPhone 照片也可以（macOS 上会自动转成 JPG）
│   └── ...
└── surprise/
    └── surprise.jpg      ← 最后惊喜里的照片（可选）
```

- 文件名只用小写字母、数字和 `-`，扩展名支持 jpg / jpeg / png / webp / gif / heic / avif。
- 照片不需要统一尺寸，网页会自动裁切显示，点开可看完整大图。
- 改完后运行 `npm run import:local`（本地预览）或 `npm run import:remote`（线上）。
