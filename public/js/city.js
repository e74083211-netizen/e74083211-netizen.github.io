// 雨夜未来都市背景：原创赛博中文都市雨夜概念美术作为画面主体（public/images/city/cyber-city-*），
// 保留原有 street-* 作为加载失败时的回退图。
// 画面上方只叠加非常克制的动态氛围：稀疏细雨、轻柔漂移的远景薄雾、中文灯牌的缓呼吸与偶发微闪、湿滑路面微光。
// 首屏呈现清晰建筑纵深；进入后续阅读区后平稳切换为同画面的柔焦暗版，保证长文与相册清晰易读。
//
// 素材来源与构建脚本见 art/README.md。替换 art/source/cyber-city-master.jpg 后运行 `python3 art/grade.py --build`，
// 并按新画面调整下面 GLINTS 的归一化坐标（0~1）。
import { reducedMotion } from './util.js';

const IMG = '/images/city/cyber-city';
const FALLBACK_IMG = '/images/city/street';

/** 灯牌光晕：x、y 为在原图中的归一化位置（0~1），r 为半径（相对图片宽度），mode 为动画方式 */
const GLINTS = [
  { x: 0.656, y: 0.461, r: 0.068, color: '255, 115, 178', mode: 'breathe' }, // 右侧「星河」柔品红霓虹
  { x: 0.388, y: 0.242, r: 0.054, color: '110, 232, 255', mode: 'flicker' }, // 左侧「今夜」青蓝霓虹
  { x: 0.211, y: 0.496, r: 0.064, color: '255, 184, 102', mode: 'steady' },  // 左下「晚安」暖琥珀店招
];

function startRain(canvas) {
  const ctx = canvas.getContext('2d');
  let W, H, drops = [], raf, last = 0;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 稀疏克制的雨丝，避免遮挡建筑细节
    const n = Math.min(68, Math.round((W * H) / 24000));
    drops = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      l: 12 + Math.random() * 20, v: 9 + Math.random() * 7, a: 0.04 + Math.random() * 0.09,
    }));
  };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (const d of drops) {
      d.y += d.v;
      d.x -= d.v * 0.1;
      if (d.y > H + 30) { d.y = -30; d.x = Math.random() * (W + 60); }
      ctx.strokeStyle = `rgba(195, 224, 255, ${d.a})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.l * 0.1, d.y - d.l);
      ctx.stroke();
    }
  };
  resize();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(frame);
  });
  raf = requestAnimationFrame(frame);
}

/**
 * 在页面最底层放上雨夜未来都市背景。
 * @param {{rain?: boolean, lit?: boolean}} opts lit=true 时直接显示（没有开场的页面用）
 */
export function initCity({ rain = true, lit = false } = {}) {
  const root = document.createElement('div');
  root.className = 'city';
  root.setAttribute('aria-hidden', 'true');
  const glints = GLINTS.map((g) =>
    `<i class="city__glint city__glint--${g.mode}" style="left:${g.x * 100}%;top:${g.y * 100}%;width:${g.r * 200}%;--c:${g.color}"></i>`
  ).join('');
  root.innerHTML = `
    <div class="city__frame">
      <picture>
        <source type="image/avif" srcset="${IMG}-960.avif 960w, ${IMG}-1376.avif 1376w" sizes="max(100vw, 180vh)">
        <source type="image/webp" srcset="${IMG}-960.webp 960w, ${IMG}-1376.webp 1376w" sizes="max(100vw, 180vh)">
        <img class="city__photo" src="${IMG}-1376.webp" alt="" decoding="async" fetchpriority="high">
      </picture>
      <div class="city__mist"></div>
      ${glints}
      <i class="city__wet"></i>
    </div>
    <img class="city__soft" src="${IMG}-soft-640.webp" alt="" decoding="async" loading="lazy">
    <div class="city__warm"></div>
    <canvas class="city__rain"></canvas>
    <div class="city__veil"></div>`;
  document.body.prepend(root);

  const photo = root.querySelector('.city__photo');
  const soft = root.querySelector('.city__soft');
  const show = () => root.classList.add('is-loaded');
  if (photo.complete && photo.naturalWidth) show();
  else photo.addEventListener('load', show, { once: true });

  // 主图异常时自动回退到保留的旧街景图
  let usedFallback = false;
  photo.addEventListener('error', () => {
    if (!usedFallback) {
      usedFallback = true;
      root.querySelectorAll('.city__frame source').forEach((s) => s.remove());
      photo.src = `${FALLBACK_IMG}-1600.webp`;
      return;
    }
    root.classList.add('is-missing');
  });
  soft.addEventListener('error', () => {
    if (!soft.dataset.fallback) {
      soft.dataset.fallback = '1';
      soft.src = `${FALLBACK_IMG}-soft-640.webp`;
    }
  });

  if (rain && !reducedMotion()) startRain(root.querySelector('.city__rain'));
  if (lit || reducedMotion()) root.classList.add('is-on');
  return {
    el: root,
    /** 开场结束：城市夜景从暗处亮起 */
    powerOn: () => root.classList.add('is-on'),
  };
}
