// 公开留言墙：真实的共享数据库（Cloudflare D1），无需登录
import { $, h, api, get, fill, formatDate } from './util.js';

const MAX = { nickname: 20, content: 300 };
const len = (s) => [...s].length;

export function initWall() {
  const section = $('#wall');
  if (!section) return;
  const form = $('[data-wall-form]', section);
  const list = $('[data-wall-list]', section);
  const stateEl = $('[data-wall-state]', section);
  const meta = $('[data-wall-meta]', section);
  const more = $('[data-wall-more]', section);
  const statusEl = $('[data-wall-status]', section);
  const counter = $('[data-count]', section);
  const nick = form.elements.nickname;
  const text = form.elements.content;
  const submitBtn = form.querySelector('[type="submit"]');

  let cursor = null;
  let total = 0;
  let openedAt = 0;
  let backendOk = true;

  const rot = (id) => (((id * 37) % 7) - 3) * 0.35;

  function note(m, isNew = false, i = 0) {
    return h('li', { class: `note paper${isNew ? ' is-new' : ''}`, style: { '--r': `${rot(m.id || 1)}deg`, '--d': `${Math.min(i, 8) * 0.06}s` } },
      h('p', { class: 'note__text', text: m.content }),
      h('p', { class: 'note__meta' },
        h('span', { class: 'note__name', text: m.nickname }),
        h('time', { datetime: new Date(m.created_at).toISOString(), text: formatDate(m.created_at) })));
  }

  function setMeta() {
    meta.textContent = total ? `已经有 ${total} 句祝福` : '';
  }

  function showState(kind, message) {
    stateEl.replaceChildren();
    if (kind === 'loading') {
      list.replaceChildren(...Array.from({ length: 3 }, () => h('li', { class: 'skeleton', 'aria-hidden': 'true' })));
      return;
    }
    if (kind === 'empty') {
      stateEl.append(h('div', { class: 'card' }, h('p', { text: fill(get('wall.empty')) })));
    }
    if (kind === 'error') {
      stateEl.append(
        h('div', { class: 'card' },
          h('p', { text: message }),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => load(true) }, '重新加载'))
      );
    }
  }

  async function load(reset = false) {
    if (reset) {
      cursor = null;
      showState('loading');
    }
    more.disabled = true;
    try {
      const q = new URLSearchParams({ limit: '24' });
      if (cursor) q.set('before', cursor);
      const data = await api(`/api/messages?${q}`);
      backendOk = true;
      if (reset) {
        list.replaceChildren();
        total = data.total ?? 0;
      }
      stateEl.replaceChildren();
      data.messages.forEach((m, i) => list.append(note(m, false, i)));
      cursor = data.nextCursor;
      more.hidden = !cursor;
      if (!list.children.length) showState('empty');
      setMeta();
    } catch (e) {
      if (reset) list.replaceChildren();
      backendOk = e.code !== 'no_backend';
      showState('error', backendOk ? `祝福暂时加载不出来：${e.message}` : '留言墙需要后端服务才能使用。当前是静态预览模式，请用 npm run dev 启动完整版本。');
    } finally {
      more.disabled = false;
    }
  }

  function setStatus(msg, kind = '') {
    statusEl.textContent = msg;
    statusEl.className = `wall__status${kind ? ` is-${kind}` : ''}`;
  }

  function updateCount() {
    const n = len(text.value);
    counter.textContent = `${n} / ${MAX.content}`;
    counter.classList.toggle('is-over', n > MAX.content);
  }

  text.addEventListener('input', updateCount);
  [nick, text].forEach((el) => {
    el.addEventListener('focus', () => (openedAt ||= Date.now()), { once: true });
    el.addEventListener('input', () => el.removeAttribute('aria-invalid'));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = nick.value.trim();
    const content = text.value.trim();
    let problem = '';
    if (!nickname) { problem = '请写一个昵称'; nick.setAttribute('aria-invalid', 'true'); }
    else if (len(nickname) > MAX.nickname) { problem = `昵称最多 ${MAX.nickname} 个字`; nick.setAttribute('aria-invalid', 'true'); }
    else if (len(content) < 2) { problem = '祝福至少写两个字吧'; text.setAttribute('aria-invalid', 'true'); }
    else if (len(content) > MAX.content) { problem = `祝福最多 ${MAX.content} 个字`; text.setAttribute('aria-invalid', 'true'); }
    if (problem) {
      setStatus(problem, 'error');
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-busy');
    setStatus('正在送出…');
    try {
      const data = await api('/api/messages', {
        method: 'POST',
        body: { nickname, content, website: form.elements.website.value, elapsed: openedAt ? Date.now() - openedAt : undefined },
      });
      text.value = '';
      updateCount();
      if (data.status === 'pending') {
        setStatus(get('wall.pendingNotice'), 'ok');
      } else {
        setStatus('收到啦，谢谢你的祝福 ✦', 'ok');
        if (data.message) {
          stateEl.replaceChildren();
          list.prepend(note(data.message, true));
          total += 1;
          setMeta();
        }
      }
    } catch (err) {
      const wait = err.data?.retryAfter ? `（约 ${Math.ceil(err.data.retryAfter / 60)} 分钟后可再试）` : '';
      setStatus(err.code === 'no_backend' ? '当前是静态预览模式，留言需要后端服务' : `${err.message}${wait}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-busy');
    }
  });

  more.addEventListener('click', () => load(false));

  // 进入视口附近才加载（并设一个兜底：几秒后无论如何都加载）
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    io?.disconnect();
    load(true);
  };
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && start(), { rootMargin: '400px 0px' })
    : null;
  io ? io.observe(section) : start();
  setTimeout(start, 6000);
}
