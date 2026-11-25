// 音乐管理：背景音乐 + 生日歌，两者不会同时响。
// 只播放 public/audio/ 里真实存在的文件；缺文件时保持安静，不做任何替代。
import { C } from './util.js';

const cfg = C.audio || {};
const PREF_KEY = 'bd:sound';

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      muted: p.muted === true,
      volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : 1,
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}

async function probe(src) {
  if (!src) return false;
  try {
    const r = await fetch(src, { method: 'HEAD', cache: 'no-cache' });
    const type = r.headers.get('content-type') || '';
    return r.ok && !type.includes('text/html');
  } catch {
    return false;
  }
}

export class AudioManager {
  constructor() {
    const prefs = loadPrefs();
    this.state = {
      ready: false,
      bgAvailable: false,
      birthdayAvailable: false,
      bgPlaying: false,
      birthdayPlaying: false,
      muted: prefs.muted, // 记住访客上次的静音与音量选择
      volume: prefs.volume,
    };
    this.listeners = new Set();
    this.onBlocked = null; // 浏览器拒绝播放时的回调
    this.bgWanted = false; // 访客是否希望背景音乐开着
    this.ctx = null;
    this.master = null;
    this.gains = new Map();
    this.fades = new Map();
    this.bdToken = 0;
    this.ready = this.#init();
    document.addEventListener('visibilitychange', () => this.#onVisibility());
  }

  on(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }
  #emit(patch = {}) {
    Object.assign(this.state, patch);
    this.listeners.forEach((fn) => fn(this.state));
  }
  #savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ muted: this.state.muted, volume: this.state.volume }));
    } catch {
      /* 隐私模式下可能无法保存，忽略 */
    }
  }

  get hasAnyMusic() {
    return this.state.bgAvailable || this.state.birthdayAvailable;
  }

  async #init() {
    const [bg, bd] = await Promise.all([probe(cfg.background), probe(cfg.birthday)]);
    if (bg) this.bg = this.#makeEl(cfg.background, true, 'bgAvailable');
    if (bd) {
      this.bd = this.#makeEl(cfg.birthday, false, 'birthdayAvailable');
      this.bd.addEventListener('ended', () => this.#birthdayDone(this.bdToken));
    }
    this.#emit({ ready: true, bgAvailable: bg, birthdayAvailable: bd });
  }

  #makeEl(src, loop, flag) {
    const el = new Audio();
    el.preload = 'none';
    el.loop = loop;
    el.src = src;
    el.addEventListener(
      'error',
      () => {
        // 文件损坏或格式不支持：静默停用，不再重试
        if (flag === 'bgAvailable') {
          this.bg = null;
          this.#emit({ bgAvailable: false, bgPlaying: false });
        } else {
          this.bd = null;
          this.#emit({ birthdayAvailable: false });
          if (this.state.birthdayPlaying) this.#birthdayDone(this.bdToken);
        }
      },
      { once: true }
    );
    return el;
  }

  /** 必须在访客的点击中调用：创建/恢复 AudioContext，用来做平滑的音量渐变。 */
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.#masterLevel();
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        this.master = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  #masterLevel() {
    return this.state.muted ? 0 : this.state.volume;
  }

  #gainFor(el) {
    if (!this.ctx || !el) return null;
    if (!this.gains.has(el)) {
      try {
        const src = this.ctx.createMediaElementSource(el);
        const g = this.ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(this.master);
        this.gains.set(el, g);
      } catch {
        this.gains.set(el, null);
      }
    }
    return this.gains.get(el);
  }

  /** 平滑调整某一首的音量（0~1 的曲目音量，不含总音量）。 */
  #fade(el, to, ms) {
    if (!el) return Promise.resolve();
    el._level = to;
    const g = this.#gainFor(el);
    if (g) {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(to, t + ms / 1000);
      return new Promise((r) => setTimeout(r, ms));
    }
    // 没有 Web Audio 时退回到 element.volume（总音量也乘进去）
    cancelAnimationFrame(this.fades.get(el));
    const target = to * this.state.volume;
    const from = el.volume;
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const k = Math.min(1, (now - start) / ms);
        el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
        if (k < 1) this.fades.set(el, requestAnimationFrame(step));
        else resolve();
      };
      this.fades.set(el, requestAnimationFrame(step));
    });
  }

  #applyMaster() {
    if (this.master) this.master.gain.setTargetAtTime(this.#masterLevel(), this.ctx.currentTime, 0.06);
    [this.bg, this.bd].forEach((el) => {
      if (!el) return;
      if (this.gains.get(el)) {
        el.muted = false;
      } else {
        el.muted = this.state.muted;
        if (!el.paused) el.volume = Math.max(0, Math.min(1, (el._level ?? 1) * this.state.volume));
      }
    });
  }

  setMuted(muted) {
    this.unlock();
    this.#emit({ muted: !!muted });
    this.#applyMaster();
    this.#savePrefs();
  }

  setVolume(v) {
    const volume = Math.max(0, Math.min(1, Number(v) || 0));
    this.unlock();
    this.#emit({ volume });
    this.#applyMaster();
    this.#savePrefs();
  }

  /** 开始/恢复背景音乐。返回是否真的播起来了。 */
  async playBackground() {
    await this.ready;
    this.bgWanted = true;
    if (!this.bg) return false;
    if (this.state.birthdayPlaying) return true; // 生日歌唱完会自动接上
    this.unlock();
    try {
      if (!this.#gainFor(this.bg)) {
        this.bg.volume = 0;
        this.bg.muted = this.state.muted;
      }
      await this.bg.play();
      this.#emit({ bgPlaying: true });
      this.#fade(this.bg, cfg.backgroundVolume ?? 0.5, 1800);
      return true;
    } catch {
      this.bgWanted = false;
      this.#emit({ bgPlaying: false });
      this.onBlocked?.();
      return false;
    }
  }

  async pauseBackground({ remember = false } = {}) {
    if (!remember) this.bgWanted = false;
    if (!this.bg || this.bg.paused) {
      this.#emit({ bgPlaying: false });
      return;
    }
    this.#emit({ bgPlaying: false });
    await this.#fade(this.bg, 0, 700);
    // 渐弱期间如果又被要求播放，就不要暂停了
    if (!this.state.bgPlaying) this.bg.pause();
  }

  toggleBackground() {
    this.unlock();
    return this.state.bgPlaying ? this.pauseBackground() : this.playBackground();
  }

  /**
   * 播放生日歌：背景音乐先淡出暂停，唱完再按访客原来的选择恢复。
   * 没有生日歌文件时什么都不做（背景音乐照常）。可以重复调用。
   */
  async playBirthday() {
    await this.ready;
    if (!this.bd) return false;
    this.unlock();
    const token = ++this.bdToken;
    this.#emit({ birthdayPlaying: true });
    if (this.bg && !this.bg.paused) await this.pauseBackground({ remember: true });
    if (token !== this.bdToken) return false;
    try {
      this.bd.pause();
      this.bd.currentTime = 0;
      if (!this.#gainFor(this.bd)) {
        this.bd.volume = 0;
        this.bd.muted = this.state.muted;
      }
      await this.bd.play();
      this.#fade(this.bd, cfg.birthdayVolume ?? 0.9, 350);
      return true;
    } catch {
      if (token === this.bdToken) this.#birthdayDone(token);
      return false;
    }
  }

  /** 停止生日歌。resume=true 时按访客原来的选择恢复背景音乐。 */
  stopBirthday(resume = true) {
    if (!this.state.birthdayPlaying) return;
    const token = ++this.bdToken;
    const bd = this.bd;
    if (bd && !bd.paused) {
      this.#fade(bd, 0, 450).then(() => {
        if (token === this.bdToken) bd.pause();
      });
    }
    this.#emit({ birthdayPlaying: false });
    if (resume && this.bgWanted) setTimeout(() => token === this.bdToken && this.playBackground(), 500);
  }

  #birthdayDone(token) {
    if (token !== this.bdToken) return;
    this.#emit({ birthdayPlaying: false });
    if (this.bgWanted) setTimeout(() => token === this.bdToken && this.playBackground(), 600);
  }

  #onVisibility() {
    if (!this.bg) return;
    if (document.hidden && !this.bg.paused) {
      this.hiddenPaused = true;
      this.bg.pause();
    } else if (!document.hidden && this.hiddenPaused) {
      this.hiddenPaused = false;
      if (this.bgWanted && this.state.bgPlaying && !this.state.birthdayPlaying) this.bg.play().catch(() => {});
    }
  }
}
