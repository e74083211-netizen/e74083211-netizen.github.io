/**
 * ================================================================
 *  公开内容配置（这个文件会公开发布，请不要写私密内容）
 * ================================================================
 *  · 名字、生日、各段文字、音乐路径、功能开关都在这里改。
 *  · 文字里的 {name} 会自动替换成下面的 recipient.name。
 *  · 私密的回忆、照片、信件在 private-assets/content.json，
 *    不在这里，也不会出现在网页源代码里。
 * ================================================================
 */
window.SITE_CONFIG = {
  /* ── 寿星 ─────────────────────────────────────────────── */
  recipient: {
    name: '董庆鑫',
    birthday: '2026-11-26', // YYYY-MM-DD
    sealLetter: '鑫', // 火漆印上的字，可改成一个字或字母
  },

  /* ── 功能开关 ─────────────────────────────────────────── */
  features: {
    wishesWall: true, // 公开留言墙
    privateArea: true, // 需要账号登录的私密区域（只能凭邀请链接注册）
    sharedAlbum: false, // 私密区域里的共同相册（需要先开通 Cloudflare R2，见 wrangler.jsonc 和 README）
    microphoneBlow: true, // 允许“对着麦克风吹蜡烛”（需访客主动点击并授权）
    wishInput: true, // 许愿时可以悄悄写下愿望（只留在访客自己的屏幕上，不保存、不发送）
    confetti: true, // 吹灭蜡烛后的彩纸
    cityScene: true, // 原创的雨夜未来城市背景（远中近三层建筑、薄雾、霓虹招牌）
    rain: true, // 背景里很轻的雨丝（系统开启“减少动态效果”时自动关闭）
    filmGrain: true, // 胶片颗粒质感
  },

  /* ── 音乐（把 MP3 放进 public/audio/，文件名对上即可，无需改代码）── */
  audio: {
    background: '/audio/background.mp3', // 全程背景音乐（循环）
    birthday: '/audio/birthday.mp3', // 吹蜡烛后的生日歌
    backgroundVolume: 0.5, // 0 ~ 1
    birthdayVolume: 0.9,
    // 片尾显示的音乐署名（只有音乐的许可要求署名时才需要填，例如 ['背景音乐：作者《曲名》']）；不需要就留空数组 []
    credits: [],
  },

  /* ── 章节名（右侧导航与每一幕的竖排标题）──────────────── */
  acts: {
    hero: '序幕',
    wishes: '祝愿',
    cake: '烛光',
    wall: '留言',
    private: '珍藏',
    ending: '片尾',
  },

  /* ── 开场邀请 ─────────────────────────────────────────── */
  opening: {
    to: '致 {name}',
    line: '这座城市今晚为你亮着灯。有一条讯息，等你接收。',
    cardTitle: '生日快乐',
    cardNote: '找一个安静的时刻，再打开它',
    enterWithSound: '接收讯息 · 打开声音',
    enterQuiet: '静音接收',
    enterNoSound: '接收讯息', // 一首音乐都没有时，开场只显示这一个按钮
  },

  /* ── 首屏 ─────────────────────────────────────────────── */
  hero: {
    dedication: '献给 {name}',
    script: 'Happy Birthday',
    lead: '愿今天的一切，都慢一点，温柔一点。',
    // 可选：一张公开的氛围背景图，放在 public/images/ 下，例如 '/images/hero.jpg'；留空则使用光影背景
    backgroundImage: '',
    scrollHint: '往下，慢慢看',
    // {days} 会被替换成天数
    before: '距离你的生日，还有 {days} 天',
    today: '就是今天 · 生日快乐',
    after: '', // 生日过后显示的话；留空 = 生日过后不显示天数
  },

  /* ── 第一幕：祝愿 ─────────────────────────────────────── */
  wishes: {
    title: '写给新的一岁',
    subtitle: '', // 留空 = 不显示副标题
    items: [
      // text 可以留空，只显示一句
      { title: '愿你在新的一岁里面平安快乐，事事顺心', text: '' },
      { title: '愿你肌肉越练越大，身体倍儿棒，吃嘛嘛香', text: '' },
      { title: '愿你舞技术大涨，变成编舞boy！', text: '' },
      { title: '愿我们友谊长存，继续乘风破浪', text: '' },
    ],
    quote: '新的一岁，愿你想要的，都在来的路上。',
  },

  /* ── 第二幕：蛋糕 ─────────────────────────────────────── */
  cake: {
    title: '蛋糕已经备好了',
    subtitle: '点亮蜡烛，许一个愿，再把它们吹灭。',
    candles: 5, // 蜡烛数量（1 ~ 12）
    steps: {
      light: '先把蜡烛点亮吧',
      lightButton: '点亮蜡烛',
      wish: '闭上眼睛，在心里许一个愿',
      wishPlaceholder: '也可以悄悄写在这里',
      wishNote: '写下的愿望只留在你的屏幕上，不会保存，也不会被任何人看到。',
      wishButton: '许好了',
      blow: '准备好了，就吹灭它们',
      blowButton: '吹灭蜡烛',
      micButton: '对着麦克风吹',
      micListening: '对着麦克风，轻轻吹一口气…',
      micCancel: '不吹了',
      micDenied: '没有麦克风也没关系，点一下按钮，或者直接点蜡烛。',
      micTimeout: '好像没听到吹气声，点一下按钮也可以。',
      tapHint: '也可以直接点每一根蜡烛',
    },
    reveal: {
      mark: 'for you',
      title: '愿望已经出发了',
      text: '听说蜡烛熄灭的那一刻，愿望会被悄悄听见。\n不用告诉任何人，记得它就好。',
      again: '再点一次蜡烛',
      next: '看看大家的祝福',
      // 生日歌播放时出现的按钮；点了就关掉生日歌，接着放背景音乐
      songStop: '生日歌播放中 · 不想听就点这里关掉',
    },
  },

  /* ── 第三幕：公开留言墙 ───────────────────────────────── */
  wall: {
    title: '大家想对你说',
    subtitle: '路过的朋友，也给 {name} 留一句吧。',
    formTitle: '写一张小卡片',
    notice: '卡片会公开贴在这面墙上，所有打开这个页面的人都能看到。写个昵称就好，请不要留手机号、地址这类个人信息。',
    nicknameLabel: '落款',
    nicknamePlaceholder: '你的昵称',
    contentLabel: '想说的话',
    contentPlaceholder: '想对 {name} 说的话…',
    submit: '贴到墙上',
    success: '贴好了，谢谢你的祝福。',
    empty: '墙上还空着，来贴第一张卡片吧。',
    pendingNotice: '收到了，稍后就会出现在墙上。',
    more: '再看一些',
  },

  /* ── 第四幕：私密区域入口 ─────────────────────────────── */
  private: {
    title: '只给你看的部分',
    text: '这里收着一些照片、一些旧时光，还有一封信。\n用你自己的账号登录后就能打开。',
    hint: '第一次来？请打开网站作者单独发给你的邀请链接，设置自己的用户名和密码。忘了密码也可以请作者发一个重置链接。',
    usernamePlaceholder: '用户名',
    passwordPlaceholder: '密码',
    button: '登录',
    leave: '退出登录',
    left: '已经退出登录了',
    emptyTitle: '这里还在准备中',
    emptyText: '里面的东西还没有放好，晚一点再来看看吧。',
  },

  /* ── 共同相册（在私密区域里，登录后才看得到）────────────── */
  album: {
    title: '一起写的相册',
    subtitle: '这一本是我们一起写的。想到什么，就往里添一页。',
    add: '添加回忆',
    empty: '相册还是空的，来放第一张照片吧。',
    pick: '选择照片',
    pickMore: '再加几张',
    pickHint: '可以一次选几张，也可以把照片拖到这里',
    titleLabel: '标题',
    titlePlaceholder: '给这段回忆起个名字',
    dateLabel: '是哪一天',
    textLabel: '想说的话',
    textPlaceholder: '那天发生了什么，或者现在想说的话…',
    ownerNote: '会以「{me}」的名义放进相册。之后你可以随时修改或删除自己添加的回忆。',
    save: '放进相册',
    saved: '已经放进相册了',
  },

  /* ── 片尾 ─────────────────────────────────────────────── */
  footer: {
    line: '生日快乐，{name}。',
    sub: '愿你今天，被很多很多的善意围绕！',
    replay: '从头再看一遍',
  },

  /* ── 小彩蛋：连续点击首屏名字 5 次 ───────────────────── */
  easterEgg: {
    clicks: 5,
    message: '被你发现了。\n会认真看到这里的人，一定也在认真生活。',
  },
};
