// 入口：填充文案、开场、滚动动画、声音控制
import { C, $, $$, h, get, fill, birthday, reveal, reducedMotion, wait, feature, toast } from './util.js';
import { AudioManager } from './audio.js';
import { startDust } from './effects.js';
import { initCake } from './cake.js';
import { initWall } from './wall.js';
import { initPrivate } from './private.js';

const audio = new AudioManager();
const name = C.recipient?.name || '';

// ---------- 文案 ----------
function applyText() {
  document.title = `生日快乐，${name}`;
  $$('[data-c]').forEach((el) => (el.textContent = fill(get(el.dataset.c))));
  $$('[data-ph]').forEach((el) => (el.placeholder = fill(get(el.dataset.ph))));
  $$('[data-name]').forEach((el) => (el.textContent = name));

  const bd = birthday();
  if (bd) {
    const text = `${bd.getFullYear()} · ${String(bd.getMonth() + 1).padStart(2, '0')} · ${String(bd.getDate()).padStart(2, '0')}`;
    $$('[data-date]').forEach((el) => (el.textContent = text));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((bd - today) / 86400000);
    const countdown = $('[data-countdown]');
    countdown.textContent =
      days > 0 ? fill(get('hero.before'), { days }) : days === 0 ? get('hero.today') : fill(get('hero.after'), { days: -days });
  } else {
    $('[data-countdown]').hidden = true;
  }

  // 祝愿卡片
  const items = get('wishes.items', []);
  const grid = $('[data-wishes]');
  items.forEach((w, i) => {
    grid.append(
      h('article', { class: 'wish paper', 'data-reveal': '', style: { '--d': `${i * 0.12}s`, '--r': `${[-1.2, 0.9, -0.6, 1.3][i % 4]}deg` } },
        h('p', { class: 'wish__no', text: `No.${String(i + 1).padStart(2, '0')}` }),
        h('h3', { class: 'wish__title', text: fill(w.title) }),
        h('p', { class: 'wish__text', text: fill(w.text) }))
    );
  });

  // 功能开关
  $$('[data-feature]').forEach((el) => (el.hidden = !feature(el.dataset.feature)));
  if (!feature('filmGrain')) document.documentElement.classList.add('no-grain');

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
    if (withSound) audio.playBackground();
    opening.classList.add('is-opening');
    await wait(reducedMotion() ? 0 : 1500);
    opening.classList.add('is-gone');
    document.body.classList.remove('is-locked');
    hero.classList.add('hero--in');
    $('[data-sound]').hidden = false;
    $('#hero-name').focus({ preventScroll: true });
    setTimeout(() => opening.remove(), 1400);
    if (withSound && !audio.state.bgAvailable) {
      await audio.ready;
      if (!audio.state.bgAvailable) note('还没有添加背景音乐');
    }
  }

  $$('[data-enter]', opening).forEach((b) => b.addEventListener('click', () => enter(b.dataset.enter === 'sound')));
  $('[data-enter="sound"]', opening).focus();
}

// ---------- 声音控制 ----------
let noteTimer;
function note(text) {
  const el = $('[data-sound-note]');
  el.textContent = text;
  el.classList.add('is-shown');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.remove('is-shown'), 3200);
}

function initSoundDock() {
  const dock = $('[data-sound]');
  const toggle = $('[data-sound-toggle]', dock);
  const mute = $('[data-sound-mute]', dock);
  audio.on((st) => {
    dock.classList.toggle('is-playing', st.bgPlaying || st.birthdayPlaying);
    dock.classList.toggle('is-muted', st.muted);
    toggle.disabled = st.ready && !st.bgAvailable;
    toggle.setAttribute('aria-label', !st.bgAvailable ? '背景音乐未添加' : st.bgPlaying ? '暂停背景音乐' : '播放背景音乐');
    toggle.title = toggle.getAttribute('aria-label');
    mute.setAttribute('aria-pressed', String(st.muted));
    mute.setAttribute('aria-label', st.muted ? '取消静音' : '静音');
    mute.title = mute.getAttribute('aria-label');
  });
  toggle.addEventListener('click', () => {
    if (audio.state.birthdayPlaying) {
      audio.stopBirthday();
      return;
    }
    audio.toggleBackground();
  });
  mute.addEventListener('click', () => {
    audio.setMuted(!audio.state.muted);
    note(audio.state.muted ? '已静音' : '声音已打开');
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
    scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    const hero = $('#hero');
    hero.classList.remove('hero--in');
    void hero.offsetWidth;
    setTimeout(() => hero.classList.add('hero--in'), reducedMotion() ? 0 : 500);
  });
}

applyText();
initOpening();
initSoundDock();
initProgress();
initEasterEgg();
initReplay();
reveal();
if (feature('floatingDust')) startDust($('.dust'));
initCake(audio);
if (feature('wishesWall')) initWall();
if (feature('privateArea')) initPrivate();
