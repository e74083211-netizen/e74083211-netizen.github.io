/**
 * ============================================================
 *  生日网站配置文件 — Birthday Website Configuration
 * ============================================================
 *  修改这个文件即可自定义网站的所有内容。
 *  To personalize this website, edit the values below.
 *
 *  - 所有文字、日期、图片路径都集中在这里。
 *  - 图片请放在 assets/images/ 目录下。
 *  - 不需要懂代码，只需要修改引号里的文字即可。
 * ============================================================
 */

const CONFIG = {

  /* ── 基本信息 ── */
  name: '董庆鑫',                    // 寿星姓名
  nameEn: 'Dongqingxin',             // 英文名或拼音
  birthday: '2026-11-15',            // 生日日期 (YYYY-MM-DD)
  year: 2026,                        // 年份
  zodiac: '♏',                       // 星座符号（可选）

  /* ── 开场 ── */
  opening: {
    preTitle: '今天，有一些特别的话想对你说。',
    subtitle: '请点击打开这封信',
    buttonText: '开启惊喜',
  },

  /* ── 主视觉 ── */
  hero: {
    titleLine1: 'Happy Birthday,',
    titleLine2: 'My Favorite Person.',
    subtitle: '很开心，在这个世界上遇见你。',
    ctaText: '开始我们的故事',
  },

  /* ── 回忆时间线 ── */
  timeline: {
    sectionTitle: '我们的故事',
    sectionSubtitle: '那些值得被记住的时刻',
    items: [
      {
        date: '2023 年 9 月',
        title: '第一次相遇',
        text: '那天阳光很好，你穿着白色的T恤，笑起来眼睛弯弯的。我们在图书馆门口擦肩而过，你手里抱着一摞书，差点撞到我。你说了句"抱歉"，声音很轻很好听。',
        image: null, // 替换为: 'assets/images/memory-1.jpg'
        color: '#6b8cce',
      },
      {
        date: '2023 年 12 月',
        title: '第一次一起吃火锅',
        text: '期末考试结束那天，我们一群人去吃火锅。你坐在我对面，一直帮大家涮菜，自己却没怎么吃。后来你偷偷跟我说其实你不太能吃辣，但因为大家都想吃辣锅你就没说。',
        image: null,
        color: '#ce8a6b',
      },
      {
        date: '2024 年 3 月',
        title: '那个下雨的下午',
        text: '我们在咖啡店避雨，你拿着一杯拿铁在窗边看雨。我们聊了很多，关于未来、关于梦想、关于那些说不清的感受。窗外的雨一直下，但那个下午好像过得特别慢。',
        image: null,
        color: '#8a6bce',
      },
      {
        date: '2024 年 7 月',
        title: '第一次一起旅行',
        text: '去海边那次，你兴奋得像个小孩。赤脚踩在沙滩上，追着浪花跑，头发被风吹得乱七八糟但你一点也不在意。晚上坐在礁石上看星星，你说"要是时间能停在这一刻就好了"。',
        image: null,
        color: '#6bceb8',
      },
      {
        date: '2025 年 2 月',
        title: '你生病的那一周',
        text: '你发高烧那几天我才发现，原来一个人也可以那么让人心疼。我给你送粥的时候，你烧得迷迷糊糊，却还记得说谢谢。好了以后你请我吃饭，说要"报答救命之恩"。',
        image: null,
        color: '#ce6b8a',
      },
      {
        date: '2025 年 8 月',
        title: '那张特别的合照',
        text: '毕业季那天，所有人都在拍照。你拉着我说"我们也拍一张吧"。阳光正好，快门声响起的那一刻，你笑得特别真。这张照片后来成了我手机里最喜欢的一张。',
        image: null,
        color: '#b8ce6b',
      },
      {
        date: '2026 年 11 月',
        title: '今天，属于你的生日',
        text: '所有的故事都走到了今天。感谢每一个和你一起度过的日子。今天是你的生日，我想用这个网站告诉你，你很重要，你值得被记住，值得所有美好。',
        image: null,
        color: '#d4a574',
      },
    ],
  },

  /* ── 照片墙 ── */
  gallery: {
    sectionTitle: '那些瞬间',
    sectionSubtitle: '每一张照片都是一句没说出口的话',
    photos: [
      { image: null, caption: '第一次见面的那个秋天', rotate: -3 },
      { image: null, caption: '咖啡店窗边的下午', rotate: 2 },
      { image: null, caption: '海边的夕阳', rotate: -1.5 },
      { image: null, caption: '一起走过的路', rotate: 3 },
      { image: null, caption: '你笑起来的样子', rotate: -2 },
      { image: null, caption: '那天的天空很蓝', rotate: 1.5 },
      { image: null, caption: '偷拍的日常', rotate: -2.5 },
      { image: null, caption: '最喜欢的一张合照', rotate: 2.5 },
      { image: null, caption: '值得纪念的时刻', rotate: -1 },
    ],
  },

  /* ── 没说出口的话（信件） ── */
  letters: {
    sectionTitle: '那些没有说出口的话',
    sectionSubtitle: '有些话，写下来比说出来更勇敢',
    items: [
      {
        envelope: '给第一次相遇的你',
        content: '其实第一次见到你的时候，我就觉得你很特别。不是那种让人一见钟情的特别，是那种让人忍不住多看一眼、然后开始期待下次相遇的特别。\n\n后来我们真的成了朋友，我常常觉得运气很好。世界那么大，能遇到一个让自己觉得"幸好你在"的人，真的很难得。\n\n谢谢你出现在我的生命里。',
        color: '#6b8cce',
      },
      {
        envelope: '给一直努力的你',
        content: '我知道你总是很努力，甚至有时候努力到忘了照顾自己。\n\n你会在深夜还在看书，会为了一个小目标反复尝试，会在觉得累的时候咬咬牙继续往前走。你总觉得自己做得不够好，但在我看来，你已经很棒了。\n\n新的一岁，希望你能对自己更温柔一点。不是所有事情都要做到完美，有时候"已经很好了"本身就是一种完美。',
        color: '#ce8a6b',
      },
      {
        envelope: '给偶尔难过的你',
        content: '你很少在别人面前表现出脆弱，但我知道你也有难过的时候。\n\n那些你一个人默默消化的情绪、那些你笑着带过的不容易，我都看在眼里。我没有每次都说出来，但我一直在。\n\n如果有一天你觉得撑不住了，记得你不需要一个人扛。你可以来找我，可以什么都不说，只是坐在旁边，我也会陪着你。',
        color: '#8a6bce',
      },
      {
        envelope: '给未来某一天的你',
        content: '我不知道未来会怎样，我们会不会还像现在这样。但我希望多年以后翻到这个网站的时候，你会笑着想起现在的我们。\n\n希望那时候的你，过着自己喜欢的生活，身边有喜欢的人，做着让自己开心的事。\n\n不管那时候我们在哪里，我都祝你一切都好。\n\n这是我最真心的祝愿。',
        color: '#6bceb8',
      },
    ],
  },

  /* ── 生日蛋糕 ── */
  cake: {
    sectionTitle: '为你准备了一个蛋糕',
    sectionSubtitle: '点燃蜡烛，许个愿望吧',
    wishPrompt: '闭上眼睛，心里想着你的愿望',
    blowText: '吹灭蜡烛',
    afterBlowMessage: '愿望一定会实现的 ✨',
    candleCount: 5,
  },

  /* ── 星空心愿 ── */
  starsky: {
    sectionTitle: '星空里的祝福',
    sectionSubtitle: '每颗星星都藏着一句话',
    wishes: [
      '愿你每天都能睡个好觉',
      '愿你吃到想吃的东西的时候，刚好不用排队',
      '愿你的快乐是真实的，不需要演给任何人看',
      '愿你想见的人恰好也在想你',
      '愿你的勇敢多过犹豫',
      '愿你被这个世界温柔对待',
      '愿你始终相信美好的事情会发生',
      '愿新的一岁，一切都是你喜欢的样子',
      '愿你永远不丢失好奇心',
      '愿你回头看的时候，觉得一切都值得',
      '愿你的笑容越来越多',
      '愿你自由且丰盛',
    ],
    collectText: '收藏这个瞬间',
    collectMessage: '这份祝福已存入你的星空 ✨',
  },

  /* ── 最后的祝福 ── */
  finale: {
    lines: [
      '世界很大。',
      '但有些相遇，真的很特别。',
      '认识你，是我这几年最幸运的事。',
      '希望新的一岁，',
      '你仍然勇敢、自由、闪闪发光。',
      '',
      '生日快乐。',
    ],
    giftMessage: '🎁 点击打开你的生日礼物',
    hiddenMessage: '谢谢你一直都在，谢谢你是你。\n这个网站是我能想到的，最认真的一份礼物。\n希望你喜欢。',
    replayText: '从头再看一遍',
  },

  /* ── 背景音乐 ── */
  music: {
    enabled: true,
    // 设置为音频文件路径，如 'assets/audio/bgm.mp3'
    // 为 null 时使用 Web Audio API 生成简单旋律
    src: null,
    buttonLabel: '🎵',
  },

  /* ── 隐藏彩蛋 ── */
  easterEggs: {
    konamiMessage: '你发现了隐藏彩蛋！🎉 你真的很用心在看这个网站呢。',
    clickCount: 7, // 连续点击标题 N 次触发彩蛋
    clickMessage: '被你发现了！这是一个用心做的网站，就像用心交的朋友。',
  },

  /* ── 设计系统 ── */
  design: {
    colors: {
      midnight: '#0a0e27',
      deepBlue: '#0f1538',
      gold: '#d4a574',
      cream: '#faf3e8',
      softPurple: '#7c6f9c',
      rose: '#c17c74',
      darkText: '#1a1a2e',
      lightText: '#e8e0d4',
    },
  },
};
