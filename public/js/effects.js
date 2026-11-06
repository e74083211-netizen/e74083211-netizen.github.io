// 视觉效果：漂浮光点、彩纸庆祝、光点迸发
import { reducedMotion } from './util.js';

const PALETTE = ['#f0b86e', '#f6d29b', '#df8a62', '#d39b91', '#f4ebdc', '#a3b094', '#e7c27d'];

/** 背景中缓慢漂浮的温暖光点（克制：数量少、速度慢、页面隐藏时暂停） */
export function startDust(canvas) {
  if (!canvas || reducedMotion()) return;
  const ctx = canvas.getContext('2d');
  let w, h, dpr, motes = [], raf, last = 0;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(48, Math.round((w * h) / 26000));
    motes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.08,
      vy: -0.04 - Math.random() * 0.12,
      a: 0.08 + Math.random() * 0.4,
      t: Math.random() * Math.PI * 2,
      s: 0.004 + Math.random() * 0.01,
    }));
  };

  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    if (now - last < 32) return; // ~30fps 足够，省电
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      m.t += m.s;
      m.x += m.vx + Math.sin(m.t) * 0.08;
      m.y += m.vy;
      if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; }
      if (m.x < -10) m.x = w + 10;
      if (m.x > w + 10) m.x = -10;
      const alpha = m.a * (0.6 + 0.4 * Math.sin(m.t * 1.7));
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
      g.addColorStop(0, `rgba(255, 214, 160, ${alpha})`);
      g.addColorStop(1, 'rgba(255, 214, 160, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  resize();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(draw);
  });
  raf = requestAnimationFrame(draw);
}

function overlayCanvas() {
  const c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '150' });
  document.body.append(c);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, ctx, w: innerWidth, h: innerHeight };
}

function run(particles, { c, ctx, w, h }, duration) {
  return new Promise((resolve) => {
    const start = performance.now();
    let prev = start;
    const frame = (now) => {
      const dt = Math.min(2, (now - prev) / 16.67);
      prev = now;
      const age = now - start;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const p of particles) {
        p.update(dt, age);
        if (p.y < h + 40 && p.life > 0) {
          alive++;
          p.draw(ctx);
        }
      }
      if (alive && age < duration) requestAnimationFrame(frame);
      else {
        c.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

/** 吹灭蜡烛后的彩纸 + 上升光点 */
export function celebrate() {
  if (reducedMotion()) return Promise.resolve();
  const stage = overlayCanvas();
  const { w, h } = stage;
  const pieces = [];
  const n = w < 600 ? 90 : 140;

  for (let i = 0; i < n; i++) {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -60 : -120) + (Math.random() - 0.5) * 40;
    const speed = 9 + Math.random() * 9;
    const rad = (angle * Math.PI) / 180;
    pieces.push({
      x: fromLeft ? -10 : w + 10,
      y: h * (0.65 + Math.random() * 0.2),
      vx: Math.cos(rad) * speed * (w < 600 ? 0.7 : 1),
      vy: Math.sin(rad) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      wob: Math.random() * 10,
      size: 6 + Math.random() * 7,
      color: PALETTE[i % PALETTE.length],
      round: Math.random() < 0.25,
      life: 1,
      delay: Math.random() * 260,
      update(dt, age) {
        if (age < this.delay) return;
        this.vy += 0.22 * dt;
        this.vx *= 0.985;
        this.vy *= 0.985;
        this.wob += 0.1 * dt;
        this.x += (this.vx + Math.sin(this.wob) * 0.6) * dt;
        this.y += this.vy * dt;
        this.rot += this.vr * dt;
        if (age > 4200) this.life -= 0.02 * dt;
      },
      draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life) * 0.95;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        if (this.round) {
          ctx.beginPath();
          ctx.arc(0, 0, this.size * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(this.wob));
          ctx.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2);
        }
        ctx.restore();
      },
    });
  }
  // 上升的柔和光点
  for (let i = 0; i < 36; i++) {
    pieces.push({
      x: w * (0.3 + Math.random() * 0.4),
      y: h * (0.55 + Math.random() * 0.3),
      vy: -0.6 - Math.random() * 1.2,
      vx: (Math.random() - 0.5) * 0.6,
      r: 1 + Math.random() * 2.4,
      life: 1,
      t: Math.random() * 6,
      update(dt) {
        this.t += 0.05 * dt;
        this.x += (this.vx + Math.sin(this.t) * 0.3) * dt;
        this.y += this.vy * dt;
        this.life -= 0.004 * dt;
      },
      draw(ctx) {
        const a = Math.max(0, this.life);
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 5);
        g.addColorStop(0, `rgba(255, 220, 160, ${a})`);
        g.addColorStop(1, 'rgba(255, 220, 160, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 5, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }
  return run(pieces, stage, 7000);
}

/** 从某个元素中心迸发的金色光点（用于最后的礼物） */
export function sparkle(el) {
  if (reducedMotion() || !el) return Promise.resolve();
  const stage = overlayCanvas();
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const parts = Array.from({ length: 60 }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 5;
    return {
      x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
      r: 0.8 + Math.random() * 2, life: 1,
      color: PALETTE[Math.floor(Math.random() * 3)],
      update(dt) {
        this.vx *= 0.96; this.vy = this.vy * 0.96 + 0.05 * dt;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.life -= 0.012 * dt;
      },
      draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      },
    };
  });
  return run(parts, stage, 3000);
}
