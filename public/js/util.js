// 小工具函数
export const C = window.SITE_CONFIG || {};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const feature = (name) => C.features?.[name] !== false;

/** 读取配置：get('cake.steps.light') */
export function get(path, fallback = '') {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), C);
  return v == null ? fallback : v;
}

/** 文案模板：{name} 和任意 {key} */
export function fill(text, vars = {}) {
  const all = { name: C.recipient?.name || '', ...vars };
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in all ? all[k] : m));
}

/** 创建元素。文字一律走 textContent，避免注入。 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.code = data?.error;
    this.data = data || {};
  }
}

/** 调用后端 API。网络失败或后端不存在时给出友好的中文错误。 */
export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('网络好像断开了，请检查网络后再试', 0);
  }
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok || !data) {
    if (!isJson) throw new ApiError('后端服务没有连接（可能是静态预览模式）', res.status, { error: 'no_backend' });
    throw new ApiError(data?.message || '出了点问题，请稍后再试', res.status, data);
  }
  return data;
}

export function formatDate(ms) {
  const d = new Date(ms);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${sameYear ? '' : d.getFullYear() + '年'}${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

/** 生日日期（本地时区） */
export function birthday() {
  const [y, m, d] = String(C.recipient?.birthday || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

let toastTimer;
export function toast(text, ms = 4200) {
  const el = $('[data-toast]');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

/** 进入视口时添加 .is-visible */
let observer;
export function reveal(root = document) {
  const items = $$('[data-reveal]:not(.is-visible)', root);
  if (reducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  observer ||= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          observer.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );
  items.forEach((el) => observer.observe(el));
}

export const icon = {
  photo: () =>
    s('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' },
      s('rect', { x: 6, y: 10, width: 36, height: 28, rx: 3 }),
      s('circle', { cx: 17, cy: 20, r: 3.5 }),
      s('path', { d: 'm8 34 10-10 7 7 5-5 10 9' })),
  zoom: () =>
    s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      s('path', { d: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7' })),
  close: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M6 6l12 12M18 6 6 18' })),
  prev: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'm15 5-7 7 7 7' })),
  next: () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'm9 5 7 7-7 7' })),
};
