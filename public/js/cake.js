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
  const defs = s('defs', {},
    grad('tierA', '#fbf1e2', '#e9d4b8'),
    grad('tierB', '#f4e4cd', '#dcc19e'),
    grad('glazeRose', '#e6afa5', '#c9877e'),
    grad('plate', '#f2e8da', '#cbb89d'),
    s('linearGradient', { id: 'flameFill', x1: 0, y1: 1, x2: 0, y2: 0 },
      s('stop', { offset: '0', 'stop-color': '#fff7dc' }),
      s('stop', { offset: '.45', 'stop-color': '#ffd27a' }),
      s('stop', { offset: '1', 'stop-color': '#f08a3a' })),
    s('radialGradient', { id: 'flameGlow' },
      s('stop', { offset: '0', 'stop-color': 'rgba(255,205,130,.55)' }),
      s('stop', { offset: '1', 'stop-color': 'rgba(255,205,130,0)' })),
    stripe('stripeRose', '#f7ecdb', '#d79a92'),
    stripe('stripeSage', '#f7ecdb', '#a9b597'),
    stripe('stripeGold', '#f7ecdb', '#e2b56c')
  );

  const svg = s('svg', { viewBox: '0 0 320 300', role: 'img', 'aria-label': '一个两层的生日蛋糕' }, defs);

  // 盘子与阴影
  svg.append(
    s('ellipse', { cx: 160, cy: 266, rx: 138, ry: 18, fill: 'rgba(0,0,0,.35)' }),
    s('ellipse', { cx: 160, cy: 262, rx: 134, ry: 17, fill: 'url(#plate)' }),
    s('ellipse', { cx: 160, cy: 258, rx: 126, ry: 13, fill: '#f6eee2' })
  );

  // 下层
  svg.append(
    s('path', { d: 'M54 180 v70 a106 12 0 0 0 212 0 v-70 z', fill: 'url(#tierB)' }),
    s('path', { d: 'M54 226 a106 12 0 0 0 212 0', fill: 'none', stroke: '#e3bd7c', 'stroke-width': 1.4, opacity: 0.8 }),
    s('ellipse', { cx: 160, cy: 180, rx: 106, ry: 14, fill: 'url(#glazeRose)' }),
    s('path', { d: dripPath(160, 180, 106, 14, 13, [14, 22, 10, 26, 16, 12, 24, 18]), fill: 'url(#glazeRose)' })
  );
  // 下层底部奶油珠
  for (let i = 0; i <= 20; i++) {
    const t = Math.PI - (i / 20) * Math.PI;
    svg.append(s('circle', { cx: 160 + 104 * Math.cos(t), cy: 250 + 12 * Math.sin(t), r: 4.2, fill: '#fbf3e7', stroke: 'rgba(160,120,80,.18)', 'stroke-width': 0.6 }));
  }

  // 上层
  svg.append(
    s('path', { d: 'M90 122 v58 a70 9 0 0 0 140 0 v-58 z', fill: 'url(#tierA)' }),
    s('path', { d: 'M90 160 a70 9 0 0 0 140 0', fill: 'none', stroke: '#e3bd7c', 'stroke-width': 1.2, opacity: 0.8 }),
    s('ellipse', { cx: 160, cy: 122, rx: 70, ry: 9, fill: '#fffaf1' }),
    s('path', { d: dripPath(160, 122, 70, 9, 10, [10, 16, 8, 18, 12, 9, 15]), fill: '#fffaf1' })
  );
  // 上层底部奶油珠
  for (let i = 0; i <= 14; i++) {
    const t = Math.PI - (i / 14) * Math.PI;
    svg.append(s('circle', { cx: 160 + 69 * Math.cos(t), cy: 181 + 9 * Math.sin(t), r: 3.4, fill: '#fffaf1', stroke: 'rgba(160,120,80,.18)', 'stroke-width': 0.5 }));
  }
  // 莓果与叶子
  [[-88, 188], [-62, 193], [62, 193], [88, 188]].forEach(([dx, y], i) => {
    svg.append(
      s('ellipse', { cx: 160 + dx + (i % 2 ? 8 : -8), cy: y - 1, rx: 5, ry: 2.4, fill: '#8f9f73', transform: `rotate(${i % 2 ? 25 : -25} ${160 + dx} ${y})` }),
      s('circle', { cx: 160 + dx, cy: y, r: 5.4, fill: '#b5473f' }),
      s('circle', { cx: 160 + dx - 1.8, cy: y - 2, r: 1.5, fill: 'rgba(255,255,255,.55)' })
    );
  });

  // 蜡烛
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
  const patterns = ['stripeRose', 'stripeSage', 'stripeGold'];
  const candles = positions.map(({ x, y }, i) => {
    const hgt = 40;
    const top = y - hgt;
    const g = s('g', { class: 'candle', tabindex: '0', role: 'button', 'aria-label': `第 ${i + 1} 根蜡烛` },
      s('rect', { x: x - 12, y: top - 34, width: 24, height: hgt + 38, fill: 'transparent' }),
      s('ellipse', { cx: x, cy: y, rx: 6, ry: 2, fill: 'rgba(0,0,0,.12)' }),
      s('rect', { class: 'candle__body', x: x - 4, y: top, width: 8, height: hgt, rx: 2, fill: `url(#${patterns[i % 3]})` }),
      s('line', { x1: x, y1: top, x2: x, y2: top - 5, stroke: '#4a3a2e', 'stroke-width': 1.3, 'stroke-linecap': 'round' }),
      s('g', { transform: `translate(${x} ${top - 4})` },
        s('circle', { class: 'flame__glow', cx: 0, cy: -10, r: 28, fill: 'url(#flameGlow)' }),
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
  function stripe(id, a, b) {
    return s('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' },
      s('rect', { width: 6, height: 6, fill: a }), s('rect', { width: 2.4, height: 6, fill: b }));
  }
}

export function initCake(audio) {
  const section = $('#cake');
  const stage = $('.cake__stage', section);
  const stepEl = $('[data-cake-step]', section);
  const hintEl = $('[data-cake-hint]', section);
  const primary = $('[data-cake-primary]', section);
  const micBtn = $('[data-cake-mic-btn]', section);
  const micBox = $('[data-cake-mic]', section);
  const meter = $('.cake__meter i', section);
  const revealCard = $('[data-cake-reveal]', section);
  const again = $('[data-cake-again]', section);

  const { svg, candles } = buildSvg(get('cake.candles', 5));
  $('[data-cake-svg]', section).append(svg);

  const micSupported =
    feature('microphoneBlow') && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  let state = 'idle';
  let mic = null;

  const lit = () => candles.filter((c) => c.classList.contains('is-lit')).length;
  const setGlow = () => stage.style.setProperty('--glow', String(lit() / candles.length));

  async function setStep(text) {
    if (stepEl.textContent === text) return;
    if (!reducedMotion()) {
      stepEl.classList.add('is-changing');
      await wait(250);
    }
    stepEl.textContent = text;
    stepEl.classList.remove('is-changing');
  }

  function setState(next) {
    state = next;
    const st = STEPS();
    section.classList.toggle('is-wishing', next === 'wish');
    micBtn.hidden = true;
    primary.hidden = false;
    primary.disabled = false;
    hintEl.textContent = '';
    if (next === 'idle') {
      setStep(st.light);
      primary.textContent = st.lightButton;
      hintEl.textContent = st.tapHint || '';
    } else if (next === 'lighting') {
      primary.disabled = true;
    } else if (next === 'wish') {
      setStep(st.wish);
      primary.textContent = st.wishButton;
    } else if (next === 'ready') {
      setStep(st.blow);
      primary.textContent = st.blowButton;
      hintEl.textContent = st.tapHint || '';
      if (micSupported) {
        micBtn.hidden = false;
        micBtn.textContent = st.micButton;
      }
    } else if (next === 'listening') {
      setStep(st.micListening);
      primary.textContent = st.blowButton;
      micBtn.hidden = false;
      micBtn.textContent = '取消';
    } else if (next === 'out') {
      primary.hidden = true;
      setStep('生日快乐！');
    }
  }

  async function lightAll() {
    audio.unlock();
    setState('lighting');
    setStep('…');
    for (const c of candles) {
      if (!c.classList.contains('is-lit')) {
        c.classList.add('is-lit');
        setGlow();
        await wait(reducedMotion() ? 0 : 220);
      }
    }
    await wait(300);
    setState('wish');
  }

  function blowOne(c) {
    if (!c.classList.contains('is-lit')) return;
    c.classList.remove('is-lit');
    c.classList.remove('is-smoking');
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

  async function finish() {
    if (state === 'out') return;
    setState('out');
    section.classList.add('is-dark');
    await wait(reducedMotion() ? 0 : 700);
    section.classList.remove('is-dark');
    audio.playBirthday();
    if (feature('confetti')) celebrate();
    revealCard.hidden = false;
    revealCard.focus({ preventScroll: true });
    revealCard.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }

  function reset() {
    audio.stopBirthday();
    revealCard.hidden = true;
    candles.forEach((c) => c.classList.remove('is-lit', 'is-smoking'));
    setGlow();
    setState('idle');
    primary.focus();
  }

  // 点击单根蜡烛：没点着就点亮，点着了就吹灭
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

  micBtn.addEventListener('click', () => (state === 'listening' ? (stopMic(), setState('ready')) : startMic()));
  again.addEventListener('click', reset);

  // ---------- 麦克风吹气检测（仅在用户点击后请求权限）----------
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
          meter.parentElement.style.setProperty('--level', Math.min(1, rms / threshold).toFixed(3));
          above = rms > threshold ? above + dt : Math.max(0, above - dt * 0.5);
          if (above > 280) return blowAll();
        }
        if (now - started > 20000) {
          stopMic();
          setState('ready');
          hintEl.textContent = '好像没有听到吹气声，点按钮也可以吹灭';
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
  setGlow();
}
