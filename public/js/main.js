// 入口：填充文案、开场、章节导航、滚动动画、声音控制
import { C, $, $$, h, get, fill, birthday, reveal, reducedMotion, wait, feature, toast } from './util.js';
import { AudioManager } from './audio.js';
import { celebrate } from './effects.js';
import { initCity } from './city.js';
import { initCake } from './cake.js';
import { initWall } from './wall.js';
import { initPrivate } from './private.js';

const audio = new AudioManager();
const city = feature('cityScene') ? initCity({ rain: feature('rain') }) : null;
if (!city) document.documentElement.classList.add('no-city');
document.body.dataset.scene = 'hero';
const name = C.recipient?.name || '';
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八'];

function daysToBirthday() {
  const bd = birthday();
  if (!bd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((bd - today) / 86400000);
}

// ---------- 文案 ----------
function applyText() {
  document.title = `生日快乐，${name}`;
  $$('[data-c]').forEach((el) => {
    el.textContent = fill(get(el.dataset.c) || '');
    if (el.tagName === 'P' && !el.textContent.trim()) el.hidden = true; // 配置里留空的段落直接不显示
  });
  $$('[data-ph]').forEach((el) => (el.placeholder = fill(get(el.dataset.ph))));

  // 首屏名字：逐字出现
  const heroName = $('[data-hero-name]');
  heroName.setAttribute('aria-label', name);
  [...name].forEach((ch, i) => heroName.append(h('span', { class: 'ch', 'aria-hidden': 'true', style: { '--i': i }, text: ch })));

  const bd = birthday();
  const count = $('[data-countdown]');
  if (bd) {
    const pad = (n) => String(n).padStart(2, '0');
    const text = `${bd.getFullYear()} · ${pad(bd.getMonth() + 1)} · ${pad(bd.getDate())}`;
    $$('[data-date]').forEach((el) => (el.textContent = text));
    const days = daysToBirthday();
    count.textContent =
      days > 0 ? fill(get('hero.before'), { days }) : days === 0 ? get('hero.today') : fill(get('hero.after') || '', { days: -days });
    // 生日过后没写 after，或者已经过去很久，就不显示天数
    if (!count.textContent.trim() || days < -60) count.hidden = true;
  } else {
    count.hidden = true;
  }

  // 祝愿
  const list = $('[data-wishes]');
  get('wishes.items', []).forEach((w, i) => {
    list.append(
      h('li', { class: 'wishline', 'data-reveal': '', style: { '--d': `${(i % 2) * 0.14}s` } },
        h('span', { class: 'wishline__no', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') }),
        h('div', {},
          h('h3', { class: 'wishline__title', text: fill(w.title) }),
          w.text ? h('p', { class: 'wishline__text', text: fill(w.text) }) : null))
    );
  });

  // 功能开关
  $$('[data-feature]').forEach((el) => (el.hidden = !feature(el.dataset.feature)));
  if (!feature('filmGrain')) document.documentElement.classList.add('no-grain');

  // 幕次编号 + 右侧章节导航
  const rail = $('[data-rail]');
  let n = 0;
  $$('[data-act]').forEach((sec) => {
    if (sec.hidden) return;
    const no = $('[data-act-no]', sec);
    if (no) no.textContent = `第${CN_NUM[n++] || n}幕`;
    const label = get(`acts.${sec.dataset.act}`);
    if (label) rail.append(h('a', { href: `#${sec.id}`, 'data-rail-link': sec.id }, h('span', { text: label }), h('i', { 'aria-hidden': 'true' })));
  });

  // 可选首屏背景图（公开图片）
  const bg = get('hero.backgroundImage');
  if (bg) {
    const img = new Image();
    img.onload = () => {
      const el = $('.hero__image');
      el.style.backgroundImage = `url("${encodeURI(bg)}")`;
      el.classList.add('is-loaded');
    };
    img.src = bg;
  }
}

// ---------- 开场 ----------
function initOpening() {
  const opening = $('#opening');
  const hero = $('#hero');
  let done = false;

  async function enter(withSound) {
    if (done) return;
    done = true;
    audio.unlock();
    if (withSound) {
      // 明确选择了“打开声音”：即使上次静音过，这次也把声音打开
      if (audio.state.muted) audio.setMuted(false);
      audio.playBackground();
    }
    opening.classList.add('is-opening');
    // 很短的“信号接入”：三行日志 + 进度条，不到一秒；系统设置减少动态效果时直接跳过
    if (!reducedMotion()) {
      const log = $('[data-opening-log]', opening);
      for (const line of ['握手中…', '正在解码…', '已接入']) {
        log.textContent = line;
        await wait(260);
      }
    }
    city?.powerOn();
    opening.classList.add('is-gone');
    document.body.classList.remove('is-locked');
    hero.classList.add('hero--in');
    entered = true;
    syncDock();
    $('[data-rail]').hidden = false;
    $('#hero-name').focus({ preventScroll: true });
    setTimeout(() => opening.remove(), 1400);
    // 从注册页 / 登录后跳回来时，直接带到私密区域
    if (location.hash === '#private') setTimeout(() => $('#private')?.scrollIntoView({ behavior: 'auto', block: 'start' }), 600);
    // 生日当天，进门先撒一点彩纸
    if (daysToBirthday() === 0 && feature('confetti')) setTimeout(() => celebrate(), 1800);
  }

  // 一首音乐都没有时：只保留一个“拆开邀请”按钮
  audio.ready.then(() => {
    if (done || audio.hasAnyMusic) return;
    const primary = $('[data-enter="sound"] span', opening);
    if (primary) primary.textContent = get('opening.enterNoSound', '拆开邀请');
    const quiet = $('[data-enter="quiet"]', opening);
    if (quiet) quiet.hidden = true;
  });

  $$('[data-enter]', opening).forEach((b) => b.addEventListener('click', () => enter(b.dataset.enter === 'sound')));
  // 按 Esc 直接静音进入
  opening.addEventListener('keydown', (e) => e.key === 'Escape' && enter(false));
  $('[data-enter="sound"]', opening).focus({ preventScroll: true });
}

// ---------- 声音控制 ----------
let entered = false;
/** 进入网站后才显示声音控制；一首音乐都没有时完全不显示。 */
function syncDock() {
  $('[data-sound]').hidden = !entered || !audio.state.ready || !audio.hasAnyMusic;
}

let noteTimer;
function note(text) {
  const el = $('[data-sound-note]');
  el.textContent = text;
  el.classList.add('is-shown');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.remove('is-shown'), 3400);
}

function initSoundDock() {
  const dock = $('[data-sound]');
  const toggle = $('[data-sound-toggle]', dock);
  const mute = $('[data-sound-mute]', dock);
  const vol = $('[data-sound-volume]', dock);

  audio.on((st) => {
    syncDock();
    const playing = st.bgPlaying || st.birthdayPlaying;
    dock.classList.toggle('is-playing', playing);
    dock.classList.toggle('is-muted', st.muted);
    toggle.disabled = st.ready && !st.bgAvailable && !st.birthdayPlaying;
    const label = st.birthdayPlaying ? '停止生日歌' : !st.bgAvailable ? '还没有背景音乐' : st.bgPlaying ? '暂停背景音乐' : '播放背景音乐';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    mute.setAttribute('aria-pressed', String(st.muted));
    mute.setAttribute('aria-label', st.muted ? '取消静音' : '静音');
    mute.title = mute.getAttribute('aria-label');
    const v = Math.round(st.volume * 100);
    if (document.activeElement !== vol) vol.value = v;
    vol.style.setProperty('--v', `${v}%`);
    vol.setAttribute('aria-valuetext', `${v}%`);
  });

  audio.onBlocked = () => note('浏览器没有允许播放，点一下播放键试试');

  toggle.addEventListener('click', () => {
    if (audio.state.birthdayPlaying) {
      // 访客主动按了停止：生日歌停下，背景音乐也不自动回来
      audio.bgWanted = false;
      audio.stopBirthday(false);
      return;
    }
    audio.toggleBackground();
  });
  mute.addEventListener('click', () => {
    audio.setMuted(!audio.state.muted);
    note(audio.state.muted ? '已静音' : '声音已打开');
  });
  vol.addEventListener('input', () => {
    const v = Number(vol.value) / 100;
    audio.setVolume(v);
    // 拖动音量条视为想听声音：从静音中恢复
    if (v > 0 && audio.state.muted) audio.setMuted(false);
  });

  // 片尾的音乐署名（只有真的有音乐时才显示）
  audio.ready.then(() => {
    const credits = get('audio.credits', []);
    const box = $('[data-credits]');
    if (!box || !audio.hasAnyMusic || !Array.isArray(credits) || !credits.length) return;
    credits.forEach((c) => box.append(h('li', { text: c })));
    box.hidden = false;
  });
}

// ---------- 章节导航高亮 ----------
function initRail() {
  const links = new Map($$('[data-rail-link]').map((a) => [a.dataset.railLink, a]));
  if (!links.size || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        // 每一幕有自己的主光色：城市背景随之缓慢变色
        document.body.dataset.scene = e.target.id;
        links.forEach((a, id) => {
          const cur = id === e.target.id;
          a.classList.toggle('is-current', cur);
          cur ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current');
        });
      }
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );
  links.forEach((_, id) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
}

// ---------- 其它 ----------
function initProgress() {
  const bar = $('.scroll-progress span');
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

function initEasterEgg() {
  const target = $('#hero-name');
  const need = get('easterEgg.clicks', 5);
  let count = 0, timer;
  target.addEventListener('click', () => {
    count++;
    clearTimeout(timer);
    timer = setTimeout(() => (count = 0), 1500);
    if (count >= need) {
      count = 0;
      toast(fill(get('easterEgg.message')), 6000);
    }
  });
}

function initReplay() {
  $('[data-replay]').addEventListener('click', () => {
    const hero = $('#hero');
    hero.classList.remove('hero--in');
    scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setTimeout(() => hero.classList.add('hero--in'), reducedMotion() ? 0 : 700);
  });
}

applyText();
initOpening();
initSoundDock();
initRail();
initProgress();
initEasterEgg();
initReplay();
reveal();
initCake(audio);
if (feature('wishesWall')) initWall();
if (feature('privateArea')) initPrivate();
