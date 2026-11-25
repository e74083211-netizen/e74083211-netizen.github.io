// 互动蛋糕：点蜡烛 → 许愿 → 吹灭（按钮 / 点蜡烛 / 麦克风）→ 庆祝
import { $, get, s, wait, feature, reducedMotion } from './util.js';
import { celebrate } from './effects.js';

const STEPS = () => get('cake.steps', {});

function dripPath(cx, cy, rx, ry, count, lens) {
  const edge = (x) => cy + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  const x1 = cx - rx;
  const step = (rx * 2) / count;
  let d = `M${x1},${cy}`;
  for (let i = 0; i < count; i++) {
    const a = x1 + i * step;
    const b = a + step;
    const m = (a + b) / 2;
    const L = lens[i % lens.length];
    const w = step * 0.3;
    d += ` L${m - w},${edge(m - w) + 2.5}`;
    d += ` C${m - w},${edge(m) + L} ${m + w},${edge(m) + L} ${m + w},${edge(m + w) + 2.5}`;
    d += ` L${b},${edge(b) + (i === count - 1 ? 0 : 2.5)}`;
  }
  return `${d} A${rx} ${ry} 0 0 1 ${x1} ${cy} Z`;
}

function buildSvg(count) {
  const AMBER = '#ffb25a';
  const WARM = '#ffd9a6';
  const MAGENTA = '#ff4d9d';
  const CYAN = '#4fe3ff';
  const defs = s('defs', {},
    // 霓虹灯管的光晕：一层模糊叠在原线条下面
    s('filter', { id: 'neon', x: '-40%', y: '-40%', width: '180%', height: '180%' },
      s('feGaussianBlur', { stdDeviation: '2.2', result: 'b' }),
      s('feMerge', {}, s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' }))),
    grad('tierA', '#1d2638', '#0c111c'),
    grad('tierB', '#182132', '#090d16'),
    s('linearGradient', { id: 'holoBeam', x1: 0, y1: 1, x2: 0, y2: 0 },
      s('stop', { offset: '0', 'stop-color': 'rgba(79,227,255,.38)' }),
      s('stop', { offset: '1', 'stop-color': 'rgba(79,227,255,0)' })),
    s('radialGradient', { id: 'holoFloor' },
      s('stop', { offset: '0', 'stop-color': 'rgba(79,227,255,.28)' }),
      s('stop', { offset: '1', 'stop-color': 'rgba(79,227,255,0)' })),
    s('linearGradient', { id: 'flameFill', x1: 0, y1: 1, x2: 0, y2: 0 },
      s('stop', { offset: '0', 'stop-color': '#fff7dc' }),
      s('stop', { offset: '.45', 'stop-color': '#ffd27a' }),
      s('stop', { offset: '1', 'stop-color': '#f08a3a' })),
    s('radialGradient', { id: 'flameGlow' },
      s('stop', { offset: '0', 'stop-color': 'rgba(255,190,110,.6)' }),
      s('stop', { offset: '1', 'stop-color': 'rgba(255,190,110,0)' }))
  );

  const svg = s('svg', { viewBox: '0 0 320 316', role: 'img', 'aria-label': '一个用霓虹灯管勾勒的两层生日蛋糕' }, defs);
  const tube = (attrs, color, w = 1.8) =>
    s('path', { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', filter: 'url(#neon)', class: 'neon', ...attrs });

  // 全息底座：光圈、旋转的刻度环、向上的光束
  svg.append(
    s('ellipse', { cx: 160, cy: 292, rx: 156, ry: 24, fill: 'url(#holoFloor)' }),
    s('path', { d: 'M44 292 L74 258 L246 258 L276 292 Z', fill: 'url(#holoBeam)', class: 'holo__beam' }),
    s('ellipse', { cx: 160, cy: 292, rx: 150, ry: 20, fill: 'none', stroke: CYAN, 'stroke-width': 1, opacity: 0.55, class: 'holo' }),
    s('ellipse', { cx: 160, cy: 292, rx: 122, ry: 15.5, fill: 'none', stroke: CYAN, 'stroke-width': 1.4, 'stroke-dasharray': '2 7', opacity: 0.8, class: 'holo holo__ring' }),
    s('ellipse', { cx: 160, cy: 292, rx: 90, ry: 11, fill: 'none', stroke: CYAN, 'stroke-width': 0.8, opacity: 0.5, class: 'holo' })
  );

  // 托盘
  svg.append(
    s('ellipse', { cx: 160, cy: 262, rx: 134, ry: 17, fill: '#070a12' }),
    tube({ d: 'M26 262 a134 17 0 0 0 268 0' }, WARM, 1.2)
  );

  // 下层：深色玻璃质感的蛋糕体 + 琥珀色灯管轮廓 + 品红色“奶油”滴落
  svg.append(
    s('path', { d: 'M54 180 v70 a106 12 0 0 0 212 0 v-70 z', fill: 'url(#tierB)' }),
    s('ellipse', { cx: 160, cy: 180, rx: 106, ry: 14, fill: '#1b2436' }),
    tube({ d: 'M54 182 v68 a106 12 0 0 0 212 0 v-68' }, AMBER),
    tube({ d: dripPath(160, 180, 106, 14, 13, [14, 22, 10, 26, 16, 12, 24, 18]) }, MAGENTA, 1.5),
    tube({ d: 'M54 180 a106 14 0 0 1 212 0' }, MAGENTA, 1.2)
  );
  // 下层的灯串
  for (let i = 0; i <= 22; i++) {
    const t = Math.PI - (i / 22) * Math.PI;
    svg.append(s('circle', { cx: 160 + 104 * Math.cos(t), cy: 236 + 12 * Math.sin(t), r: 1.5, fill: i % 2 ? WARM : AMBER, filter: 'url(#neon)', class: 'neon led' }));
  }
  // 蛋糕正面的小招牌
  svg.append(s('text', {
    x: 160, y: 222, 'text-anchor': 'middle', fill: '#fff2df', filter: 'url(#neon)', class: 'neon cake__word',
    'font-size': 15, 'font-weight': 700, 'letter-spacing': 6,
    'font-family': '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif',
  }, document.createTextNode('生日快乐')));

  // 上层
  svg.append(
    s('path', { d: 'M90 122 v58 a70 9 0 0 0 140 0 v-58 z', fill: 'url(#tierA)' }),
    s('ellipse', { cx: 160, cy: 122, rx: 70, ry: 9, fill: '#202b40' }),
    tube({ d: 'M90 124 v56 a70 9 0 0 0 140 0 v-56' }, WARM, 1.6),
    tube({ d: dripPath(160, 122, 70, 9, 10, [10, 16, 8, 18, 12, 9, 15]) }, AMBER, 1.3),
    tube({ d: 'M90 122 a70 9 0 0 1 140 0' }, AMBER, 1.1)
  );
  // 发光的“莓果”
  [[-88, 188], [-62, 193], [62, 193], [88, 188], [-40, 132], [40, 132]].forEach(([dx, y]) => {
    svg.append(s('circle', { cx: 160 + dx, cy: y, r: 3.4, fill: MAGENTA, filter: 'url(#neon)', class: 'neon berry' }));
  });

  // 蜡烛：彩色灯管 + 真实的暖色火焰
  const n = Math.min(12, Math.max(1, Number(count) || 5));
  const rows = n > 6 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
  const positions = [];
  rows.forEach((k, r) => {
    const y = rows.length === 1 ? 124 : r === 0 ? 119 : 128;
    const span = rows.length === 1 ? Math.min(96, 24 * (k - 1)) : r === 0 ? 92 : 80;
    for (let i = 0; i < k; i++) {
      const x = k === 1 ? 160 : 160 - span / 2 + (span * i) / (k - 1);
      positions.push({ x, y });
    }
  });
  positions.sort((a, b) => a.y - b.y);
  const tubes = [AMBER, MAGENTA, WARM, CYAN];
  const candles = positions.map(({ x, y }, i) => {
    const hgt = 40;
    const top = y - hgt;
    const c = tubes[i % tubes.length];
    const g = s('g', { class: 'candle', tabindex: '0', role: 'button', 'aria-label': `第 ${i + 1} 根蜡烛` },
      s('rect', { x: x - 12, y: top - 34, width: 24, height: hgt + 38, fill: 'transparent' }),
      s('rect', { class: 'candle__body', x: x - 3.5, y: top, width: 7, height: hgt, rx: 3.5, fill: 'rgba(255,255,255,.06)', stroke: c, 'stroke-width': 1.5, filter: 'url(#neon)' }),
      s('line', { x1: x, y1: top + 4, x2: x, y2: top + hgt - 4, stroke: '#fff', 'stroke-width': 0.8, opacity: 0.55, class: 'candle__core' }),
      s('line', { x1: x, y1: top, x2: x, y2: top - 5, stroke: '#9aa4b5', 'stroke-width': 1.2, 'stroke-linecap': 'round' }),
      s('g', { transform: `translate(${x} ${top - 4})` },
        s('circle', { class: 'flame__glow', cx: 0, cy: -10, r: 30, fill: 'url(#flameGlow)' }),
        s('g', { class: 'flame' },
          s('g', { class: 'flame__inner' },
            s('path', { d: 'M0,0 C-6.5,-3 -6,-13 0,-23 C6,-13 6.5,-3 0,0 Z', fill: 'url(#flameFill)' }),
            s('path', { d: 'M0,-1.5 C-2.6,-3 -2.6,-8 0,-12 C2.6,-8 2.6,-3 0,-1.5 Z', fill: '#fffbea', opacity: 0.9 }))),
        s('path', { class: 'smoke', d: 'M0,-3 c-4,-6 4,-9 0,-15 c-4,-6 4,-9 0,-15' }))
    );
    return g;
  });
  candles.forEach((c) => svg.append(c));
  return { svg, candles };

  function grad(id, a, b) {
    return s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: '0', 'stop-color': a }), s('stop', { offset: '1', 'stop-color': b }));
  }
}

export function initCake(audio) {
  const section = $('#cake');
  const stage = $('.cake__stage', section);
  const panel = $('[data-cake-panel]', section);
  const stepEl = $('[data-cake-step]', section);
  const hintEl = $('[data-cake-hint]', section);
  const primary = $('[data-cake-primary]', section);
  const micBtn = $('[data-cake-mic-btn]', section);
  const micBox = $('[data-cake-mic]', section);
  const meter = $('.cake__meter', section);
  const wishBox = $('[data-cake-wish]', section);
  const wishInput = $('input', wishBox);
  const wishFly = $('[data-cake-wishfly]', section);
  const revealCard = $('[data-cake-reveal]', section);
  const again = $('[data-cake-again]', section);
  const next = $('[data-cake-next]', section);
  const songBtn = $('[data-cake-song]', section);

  // 生日歌放着的时候才出现“关掉”按钮；关掉后接着放背景音乐（访客原本选了静音进入的话就保持安静）
  audio.on((st) => {
    songBtn.hidden = !st.birthdayPlaying;
  });
  songBtn.addEventListener('click', () => {
    audio.stopBirthday(true);
    revealCard.focus({ preventScroll: true });
  });

  const { svg, candles } = buildSvg(get('cake.candles', 5));
  $('[data-cake-svg]', section).append(svg);
  if (!feature('wishesWall')) next.hidden = true;

  const micSupported =
    feature('microphoneBlow') && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  const STEP_NO = { idle: 1, lighting: 1, wish: 2, ready: 3, listening: 3, out: 3 };
  let state = 'idle';
  let mic = null;
  let inView = false;

  const lit = () => candles.filter((c) => c.classList.contains('is-lit')).length;
  /** 烛光强度；蜡烛亮着且蛋糕在视野里时，整个页面暗下来。 */
  function setGlow() {
    stage.style.setProperty('--glow', String(lit() / candles.length));
    document.body.classList.toggle('is-candlelit', inView && lit() > 0 && state !== 'out');
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      setGlow();
    }, { threshold: 0.3 }).observe(section);
  } else {
    inView = true;
  }

  async function setStep(text) {
    if (stepEl.textContent === text) return;
    if (!reducedMotion() && stepEl.textContent) {
      stepEl.classList.add('is-changing');
      await wait(250);
    }
    stepEl.textContent = text;
    stepEl.classList.remove('is-changing');
  }

  function setState(nextState) {
    state = nextState;
    const st = STEPS();
    panel.dataset.step = STEP_NO[nextState];
    section.classList.toggle('is-wishing', nextState === 'wish');
    wishBox.hidden = !(nextState === 'wish' && feature('wishInput'));
    micBtn.hidden = true;
    primary.disabled = false;
    hintEl.textContent = '';
    if (nextState === 'idle') {
      setStep(st.light);
      primary.textContent = st.lightButton;
      hintEl.textContent = st.tapHint || '';
    } else if (nextState === 'lighting') {
      primary.disabled = true;
    } else if (nextState === 'wish') {
      setStep(st.wish);
      primary.textContent = st.wishButton;
    } else if (nextState === 'ready') {
      setStep(st.blow);
      primary.textContent = st.blowButton;
      hintEl.textContent = st.tapHint || '';
      if (micSupported) {
        micBtn.hidden = false;
        micBtn.textContent = st.micButton;
      }
    } else if (nextState === 'listening') {
      setStep(st.micListening);
      primary.textContent = st.blowButton;
      micBtn.hidden = false;
      micBtn.textContent = st.micCancel || '取消';
    }
    setGlow();
  }

  async function lightAll() {
    audio.unlock();
    setState('lighting');
    for (const c of candles) {
      if (!c.classList.contains('is-lit')) {
        c.classList.add('is-lit');
        setGlow();
        await wait(reducedMotion() ? 0 : 240);
      }
    }
    await wait(reducedMotion() ? 0 : 350);
    setState('wish');
  }

  function blowOne(c) {
    if (!c.classList.contains('is-lit')) return;
    c.classList.remove('is-lit', 'is-smoking');
    void c.getBBox();
    c.classList.add('is-smoking');
    setGlow();
  }

  async function blowAll() {
    stopMic();
    primary.disabled = true;
    for (const c of candles) {
      blowOne(c);
      await wait(reducedMotion() ? 0 : 90);
    }
    finish();
  }

  /** 把悄悄写下的愿望变成一缕光飘走（文字不会离开这台设备）。 */
  function releaseWish() {
    const text = wishInput.value.trim();
    wishInput.value = '';
    if (!text || reducedMotion()) return;
    wishFly.textContent = text;
    wishFly.classList.remove('is-flying');
    void wishFly.offsetWidth;
    wishFly.classList.add('is-flying');
    setTimeout(() => {
      wishFly.classList.remove('is-flying');
      wishFly.textContent = '';
    }, 3600);
  }

  async function finish() {
    if (state === 'out') return;
    state = 'out';
    setGlow();
    releaseWish();
    // 庆祝的灯光节奏：整座城熄灯 → 蛋糕底座先亮 → 城市三拍重新亮起 + 彩光
    const body = document.body;
    section.classList.add('is-dark');
    body.classList.add('is-blackout');
    await wait(reducedMotion() ? 0 : 750);
    section.classList.remove('is-dark');
    stage.classList.add('is-celebrate');
    body.classList.remove('is-blackout');
    body.classList.add('is-relight');
    setTimeout(() => body.classList.remove('is-relight'), 2200);
    setTimeout(() => stage.classList.remove('is-celebrate'), 4200);
    audio.playBirthday();
    if (feature('confetti')) setTimeout(() => celebrate(), reducedMotion() ? 0 : 350);
    panel.hidden = true;
    revealCard.hidden = false;
    revealCard.focus({ preventScroll: true });
    if (revealCard.getBoundingClientRect().bottom > innerHeight) {
      revealCard.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
  }

  function reset() {
    audio.stopBirthday();
    revealCard.hidden = true;
    panel.hidden = false;
    candles.forEach((c) => c.classList.remove('is-lit', 'is-smoking'));
    setState('idle');
    primary.focus({ preventScroll: true });
    if (stage.getBoundingClientRect().top < 0) {
      stage.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }
  }

  // 点单根蜡烛：没点着就点亮，点着了就吹灭
  candles.forEach((c) => {
    const act = () => {
      audio.unlock();
      if (state === 'idle') {
        c.classList.add('is-lit');
        setGlow();
        if (lit() === candles.length) setState('wish');
      } else if (state === 'wish' || state === 'ready' || state === 'listening') {
        blowOne(c);
        if (lit() === 0) {
          stopMic();
          finish();
        }
      }
    };
    c.addEventListener('click', act);
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        act();
      }
    });
  });

  primary.addEventListener('click', () => {
    if (state === 'idle') lightAll();
    else if (state === 'wish') setState('ready');
    else if (state === 'ready' || state === 'listening') blowAll();
  });
  wishInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && state === 'wish') {
      e.preventDefault();
      setState('ready');
      primary.focus({ preventScroll: true });
    }
  });

  micBtn.addEventListener('click', () => (state === 'listening' ? (stopMic(), setState('ready')) : startMic()));
  again.addEventListener('click', reset);

  // ---------- 麦克风吹气检测（只在访客点击后才请求权限）----------
  async function startMic() {
    audio.unlock();
    setState('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (state !== 'listening') {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const started = performance.now();
      let baseline = 0, samples = 0, above = 0, last = started, raf;
      micBox.hidden = false;
      mic = { stream, ctx, stop: () => cancelAnimationFrame(raf) };

      const loop = (now) => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        const dt = now - last;
        last = now;
        if (now - started < 500) {
          baseline = (baseline * samples + rms) / ++samples;
        } else {
          const threshold = Math.max(0.07, baseline * 4);
          meter.style.setProperty('--level', Math.min(1, rms / threshold).toFixed(3));
          above = rms > threshold ? above + dt : Math.max(0, above - dt * 0.5);
          if (above > 280) return blowAll();
        }
        if (now - started > 20000) {
          stopMic();
          setState('ready');
          hintEl.textContent = STEPS().micTimeout || '';
          return;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } catch {
      stopMic();
      setState('ready');
      hintEl.textContent = STEPS().micDenied || '';
    }
  }

  function stopMic() {
    micBox.hidden = true;
    if (!mic) return;
    mic.stop();
    mic.stream.getTracks().forEach((t) => t.stop());
    mic.ctx.close().catch(() => {});
    mic = null;
  }

  setState('idle');
}
