// 音乐管理：背景音乐 + 生日歌，两者不会重叠。
// 文件缺失时自动降级（不反复报错）；生日歌缺失时可选用程序合成的音乐盒旋律（《生日快乐》旋律属公有领域）。
import { C, feature } from './util.js';

const cfg = C.audio || {};

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
    this.state = {
      ready: false,
      bgAvailable: false,
      birthdayAvailable: false,
      synthAvailable: feature('synthBirthdayFallback') && !!(window.AudioContext || window.webkitAudioContext),
      bgPlaying: false,
      birthdayPlaying: false,
      muted: false,
    };
    this.listeners = new Set();
    this.bgWanted = false;
    this.ctx = null;
    this.master = null;
    this.gains = new Map();
    this.fades = new Map();
    this.synthStop = null;
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

  async #init() {
    const [bg, bd] = await Promise.all([probe(cfg.background), probe(cfg.birthday)]);
    if (bg) this.bg = this.#makeEl(cfg.background, true, 'bgAvailable');
    if (bd) {
      this.bd = this.#makeEl(cfg.birthday, false, 'birthdayAvailable');
      this.bd.addEventListener('ended', () => this.#birthdayDone());
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
        if (flag === 'bgAvailable') this.bg = null;
        else this.bd = null;
        this.#emit({ [flag]: false, ...(flag === 'bgAvailable' ? { bgPlaying: false } : {}) });
      },
      { once: true }
    );
    return el;
  }

  /** 必须在用户点击中调用：创建/恢复 AudioContext，让 iOS 也能控制音量渐变。 */
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.state.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
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

  /** 平滑调整音量；返回 Promise，结束后 resolve。 */
  #fade(el, to, ms) {
    if (!el) return Promise.resolve();
    const g = this.#gainFor(el);
    if (g) {
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(to, t + ms / 1000);
      return new Promise((r) => setTimeout(r, ms));
    }
    // 没有 Web Audio 时退回到 element.volume
    cancelAnimationFrame(this.fades.get(el));
    const from = el.volume;
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const k = Math.min(1, (now - start) / ms);
        el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
        if (k < 1) this.fades.set(el, requestAnimationFrame(step));
        else resolve();
      };
      this.fades.set(el, requestAnimationFrame(step));
    });
  }

  async playBackground() {
    await this.ready;
    this.bgWanted = true;
    if (!this.bg || this.state.birthdayPlaying) return;
    this.unlock();
    try {
      if (!this.#gainFor(this.bg)) this.bg.volume = 0;
      await this.bg.play();
      this.#emit({ bgPlaying: true });
      await this.#fade(this.bg, cfg.backgroundVolume ?? 0.45, 1800);
    } catch {
      this.#emit({ bgPlaying: false });
    }
  }

  async pauseBackground({ remember = false } = {}) {
    if (!remember) this.bgWanted = false;
    if (!this.bg || this.bg.paused) return this.#emit({ bgPlaying: false });
    await this.#fade(this.bg, 0, 700);
    this.bg.pause();
    this.#emit({ bgPlaying: false });
  }

  toggleBackground() {
    this.unlock();
    return this.state.bgPlaying ? this.pauseBackground() : this.playBackground();
  }

  setMuted(muted) {
    this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.08);
    // 有 Web Audio 时统一由总音量控制；否则直接静音元素
    [this.bg, this.bd].forEach((el) => {
      if (el) el.muted = this.master ? false : muted;
    });
    this.#emit({ muted });
  }

  /** 播放生日歌：先把背景音乐淡出暂停，唱完再恢复。 */
  async playBirthday() {
    await this.ready;
    this.unlock();
    this.stopBirthday(false);
    const resumeBg = this.bgWanted;
    this.resumeAfter = resumeBg;
    this.#emit({ birthdayPlaying: true });
    if (this.bg && !this.bg.paused) await this.pauseBackground({ remember: true });

    if (this.bd) {
      try {
        this.bd.currentTime = 0;
        if (!this.#gainFor(this.bd)) this.bd.volume = cfg.birthdayVolume ?? 0.85;
        await this.bd.play();
        this.#fade(this.bd, cfg.birthdayVolume ?? 0.85, 400);
        return 'file';
      } catch {
        /* 继续尝试合成版本 */
      }
    }
    if (this.state.synthAvailable && this.ctx) {
      this.synthStop = playMusicBox(this.ctx, this.master, () => this.#birthdayDone());
      return 'synth';
    }
    this.#birthdayDone();
    return null;
  }

  stopBirthday(resume = true) {
    if (this.bd && !this.bd.paused) {
      this.#fade(this.bd, 0, 500).then(() => this.bd?.pause());
    }
    if (this.synthStop) {
      this.synthStop();
      this.synthStop = null;
    }
    if (this.state.birthdayPlaying && resume) this.#birthdayDone();
  }

  #birthdayDone() {
    this.synthStop = null;
    this.#emit({ birthdayPlaying: false });
    if (this.resumeAfter && this.bgWanted) setTimeout(() => this.playBackground(), 600);
  }

  #onVisibility() {
    if (!this.bg) return;
    if (document.hidden && !this.bg.paused) {
      this.hiddenPaused = true;
      this.bg.pause();
    } else if (!document.hidden && this.hiddenPaused) {
      this.hiddenPaused = false;
      if (this.bgWanted && !this.state.birthdayPlaying) this.bg.play().catch(() => {});
    }
  }

  get hasAnyMusic() {
    return this.state.bgAvailable || this.state.birthdayAvailable || this.state.synthAvailable;
  }
}

// ------------------------------------------------------------
// 程序合成的音乐盒版《生日快乐》（旋律为公有领域；非录音、非 AI 生成）
// ------------------------------------------------------------
function playMusicBox(ctx, out, onDone) {
  const N = { G3: 196, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, F3: 174.61, C3: 130.81, G2: 98 };
  const beat = 0.58;
  // [音高, 拍数]
  const melody = [
    ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
    ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
    ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2.5],
    ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3],
  ];
  // 每小节一个低音，增加一点温度
  const bass = [[1, 'C3'], [4, 'G2'], [7, 'G2'], [10, 'C3'], [13, 'C3'], [16, 'F3'], [19, 'C3'], [20.5, 'G2'], [22, 'C3']];

  const bus = ctx.createGain();
  bus.gain.value = 0.55;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.23;
  const fb = ctx.createGain();
  fb.gain.value = 0.22;
  bus.connect(lp).connect(out);
  lp.connect(delay).connect(fb).connect(delay);
  delay.connect(out);

  const nodes = [];
  const t0 = ctx.currentTime + 0.12;
  const note = (freq, at, dur, vol) => {
    [[1, vol], [2, vol * 0.28], [3.01, vol * 0.08]].forEach(([mul, v], i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = freq * mul;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(v, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0008, at + Math.max(0.6, dur * 1.6));
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + Math.max(0.7, dur * 1.7));
      nodes.push(o);
    });
  };

  let t = 0;
  for (const [n, beats] of melody) {
    note(N[n], t0 + t * beat, beats * beat, 0.32);
    t += beats;
  }
  for (const [b, n] of bass) note(N[n], t0 + b * beat, 1.5, 0.16);

  const total = (t * beat + 1.6) * 1000;
  const timer = setTimeout(onDone, total);
  return () => {
    clearTimeout(timer);
    const now = ctx.currentTime;
    bus.gain.setTargetAtTime(0, now, 0.1);
    setTimeout(() => nodes.forEach((o) => { try { o.stop(); } catch { /* ignore */ } }), 400);
  };
}
