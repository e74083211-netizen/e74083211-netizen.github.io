# 🎂 Happy Birthday — 沉浸式生日惊喜网站

一个精心设计的互动式生日网站，作为送给重要的人的特别礼物。

## ✨ 特色功能

- 🎬 **沉浸式开场** — 信封打开动画，粒子光效
- 🌟 **星空主视觉** — 流星、星空背景
- 📖 **回忆时间线** — 可交互的故事时间线
- 📸 **照片画廊** — 拍立得风格照片墙 + 灯箱查看
- 💌 **私密信件** — 可打开的信封，每封都有不同的话
- 🎂 **互动蛋糕** — 点蜡烛、许愿、吹灭的完整交互
- ⭐ **星空祝福** — 点击星星发现隐藏祝福
- 🎁 **结尾惊喜** — 文字揭示 + 烟花庆祝
- 🎵 **背景音乐** — Web Audio API 生成的柔和旋律
- 🥚 **隐藏彩蛋** — 等你发现

## 🚀 本地预览

无需安装任何依赖，直接在浏览器中打开即可：

```bash
# 方法一：直接打开
open index.html

# 方法二：使用本地服务器（推荐，支持完整功能）
python3 -m http.server 8000
# 然后访问 http://localhost:8000

# 方法三：使用 Node.js
npx serve .
```

## 🎨 自定义内容

所有可定制的内容都集中在 **`js/config.js`** 文件中。

### 修改姓名和日期

```javascript
name: '你的名字',
nameEn: 'YourName',
birthday: '2026-01-01',
```

### 修改回忆时间线

在 `timeline.items` 数组中修改或添加项目：

```javascript
{
  date: '2024 年 3 月',
  title: '你的回忆标题',
  text: '这里写回忆的故事...',
  image: 'assets/images/your-photo.jpg',  // 或者设为 null 使用默认占位
  color: '#6b8cce',
}
```

### 添加真实照片

1. 将照片放入 `assets/images/` 目录
2. 在 `config.js` 中将 `image: null` 改为 `image: 'assets/images/你的照片.jpg'`

### 修改信件内容

在 `letters.items` 中编辑每封信：

```javascript
{
  envelope: '信封上的标题',
  content: '信的内容...\n第二段...',
  color: '#8a6bce',
}
```

### 修改星空祝福

在 `starsky.wishes` 数组中添加或修改祝福语。

### 修改结尾文字

在 `finale.lines` 数组中编辑逐行展示的文字。

### 添加背景音乐

将 MP3 文件放入项目，然后修改配置：

```javascript
music: {
  enabled: true,
  src: 'assets/audio/bgm.mp3',  // 设置音频文件路径
}
```

## 📁 项目结构

```
.
├── index.html          # 主页面
├── CNAME              # 自定义域名配置
├── css/
│   └── style.css      # 所有样式
├── js/
│   ├── config.js      # 📝 内容配置（修改这个文件！）
│   ├── app.js         # 主应用逻辑
│   ├── effects.js     # 粒子、星空、烟花等视觉效果
│   └── audio.js       # 背景音乐控制器
├── assets/
│   └── images/        # 存放照片
└── README.md          # 本文件
```

## 🌐 部署到 GitHub Pages

### 方法一：直接推送到 GitHub

```bash
# 如果还没有初始化 Git
git init
git remote add origin https://github.com/你的用户名/你的仓库名.github.io.git

# 推送代码
git add .
git commit -m "🎂 Birthday website"
git push -u origin main
```

### 方法二：GitHub Pages 设置

1. 登录 GitHub，进入仓库设置（Settings）
2. 左侧找到 Pages
3. Source 选择 `Deploy from a branch`
4. Branch 选择 `main`，文件夹选择 `/ (root)`
5. 保存，等待几分钟即可访问

### 自定义域名

CNAME 文件已配置为 `happybirthdaydongqingxin.me`。

在 Namecheap 中设置 DNS：
1. 登录 Namecheap
2. 进入域名管理 → Advanced DNS
3. 添加以下记录：
   - Type: `A`, Host: `@`, Value: `185.199.108.153`
   - Type: `A`, Host: `@`, Value: `185.199.109.153`
   - Type: `A`, Host: `@`, Value: `185.199.110.153`
   - Type: `A`, Host: `@`, Value: `185.199.111.153`
   - Type: `CNAME`, Host: `www`, Value: `你的用户名.github.io`

## 📱 兼容性

- ✅ Chrome / Edge (推荐)
- ✅ Safari / iOS Safari
- ✅ Firefox
- ✅ 手机 / 平板 / 电脑
- ✅ 支持 `prefers-reduced-motion` 无障碍设置

## 📄 License

This project is a personal gift. Feel free to fork and customize for your own use.
