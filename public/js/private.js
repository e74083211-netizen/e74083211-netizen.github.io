// 私密区域。这里没有任何私密内容——所有文字和照片都在解锁后由服务器返回。
import { $, $$, h, api, get, reveal, reducedMotion, wait, icon, toast } from './util.js';
import { sparkle } from './effects.js';

export function initPrivate() {
  const section = $('#private');
  if (!section) return;
  const gate = $('[data-gate]', section);
  const form = $('[data-gate-form]', section);
  const input = form.elements.password;
  const statusEl = $('[data-gate-status]', section);
  const vault = $('[data-vault]', section);
  const btn = form.querySelector('[type="submit"]');

  const setStatus = (t) => (statusEl.textContent = t || '');

  async function checkSession() {
    try {
      const s = await api('/api/private/session');
      if (!s.configured) setStatus('私密区域还没有配置好（需要在服务器上设置口令）');
      if (s.unlocked) await open(false);
    } catch (e) {
      if (e.code === 'no_backend') setStatus('私密区域需要后端服务（当前是静态预览模式）');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = input.value.trim();
    if (!password) {
      setStatus('请输入口令');
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.classList.add('is-busy');
    setStatus('');
    try {
      await api('/api/private/unlock', { method: 'POST', body: { password } });
      input.value = '';
      await open(true);
    } catch (err) {
      let msg = err.message;
      if (err.code === 'rate_limited' && err.data.retryAfter) msg = `尝试次数太多了，请 ${Math.ceil(err.data.retryAfter / 60)} 分钟后再试`;
      else if (err.code === 'wrong_password' && err.data.remaining > 0 && err.data.remaining <= 2) msg += `（还可以试 ${err.data.remaining} 次）`;
      setStatus(msg);
      gate.classList.remove('is-shake');
      void gate.offsetWidth;
      gate.classList.add('is-shake');
      input.select();
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  });

  async function open(animate) {
    let data;
    try {
      data = await api('/api/private/content');
    } catch (err) {
      if (err.status === 401) return;
      setStatus(`内容加载失败：${err.message}`);
      return;
    }
    if (animate && !reducedMotion()) {
      gate.classList.add('is-opening');
      await wait(800);
    }
    gate.hidden = true;
    gate.classList.remove('is-opening');
    vault.replaceChildren(...render(data));
    vault.hidden = false;
    reveal(vault);
    if (animate) {
      vault.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      $('h2', vault)?.focus({ preventScroll: true });
    }
  }

  async function leave() {
    try {
      await api('/api/private/lock', { method: 'POST', body: {} });
    } catch {
      /* 即使网络失败也清除页面上的内容 */
    }
    closeLightbox();
    vault.replaceChildren();
    vault.hidden = true;
    gate.hidden = false;
    setStatus('');
    gate.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    toast('已离开私密区域');
    input.focus({ preventScroll: true });
  }

  // ---------------- 渲染 ----------------
  function render(data) {
    const bar = h('div', { class: 'vault__bar' },
      h('span', { text: '已进入私密区域' }),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: leave }, get('private.leave', '离开')));

    if (!data.imported) {
      return [bar, h('div', { class: 'vault__notice card' },
        h('h2', { tabindex: '-1', text: '这里还是空的' }),
        h('p', { text: '私密内容还没有导入。网站作者需要把文字和照片放进 private-assets/ 并运行导入脚本。' }))];
    }

    const intro = data.intro || {};
    const head = h('header', { class: 'section__head', 'data-reveal': '' },
      h('p', { class: 'eyebrow', text: intro.eyebrow || 'Private' }),
      h('h2', { tabindex: '-1', text: intro.title || '' }),
      intro.text ? h('p', { class: 'section__sub', text: intro.text }) : null);

    const out = [bar, head];
    const memories = data.memories || [];
    if (memories.length) out.push(renderMemories(memories));
    if (data.letter) out.push(renderLetter(data.letter));
    if (data.surprise) out.push(renderSurprise(data.surprise));
    return out;
  }

  let gallery = [];

  function renderMemories(memories) {
    gallery = memories.filter((m) => m.image).map((m) => ({ src: m.image.full, caption: [m.date, m.title].filter(Boolean).join(' · ') }));
    return h('ol', { class: 'timeline', 'aria-label': '回忆' },
      memories.map((m, i) => {
        const frame = photoFrame(m.image, m.photo, m.title, gallery.findIndex((g) => g.src === m.image?.full));
        return h('li', { class: 'memory' },
          h('figure', { class: 'memory__photo', 'data-reveal': '', style: { '--r': `${i % 2 ? 1.6 : -1.8}deg` } },
            frame,
            h('figcaption', { class: 'memory__caption', text: m.date || '' })),
          h('div', { class: 'memory__text', 'data-reveal': '', style: { '--d': '.15s' } },
            m.date ? h('p', { class: 'memory__date', text: m.date }) : null,
            h('h3', { class: 'memory__title', text: m.title || '' }),
            m.text ? h('p', { class: 'memory__body', text: m.text }) : null));
      }));
  }

  function photoFrame(image, name, alt, index) {
    if (!image) {
      return h('div', { class: 'memory__frame' },
        h('div', { class: 'placeholder' }, icon.photo(),
          h('span', {}, '照片待添加'),
          h('code', { text: `memories/${name}.jpg` })));
    }
    const portrait = image.width && image.height && image.height > image.width * 1.05;
    const img = h('img', { src: image.thumb, alt: alt || '回忆照片', loading: 'lazy', decoding: 'async', width: image.width, height: image.height });
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'placeholder' }, icon.photo(), h('span', {}, '照片加载失败'))));
    return h('button', { class: `memory__frame${portrait ? ' is-portrait' : ''}`, type: 'button', 'aria-label': `查看大图：${alt || ''}`, onclick: () => openLightbox(index) },
      img, h('span', { class: 'memory__zoom', 'aria-hidden': 'true' }, icon.zoom()));
  }

  function renderLetter(letter) {
    const wrap = h('section', { class: 'letter', 'aria-labelledby': 'letter-title' });
    const head = h('div', { class: 'subhead', 'data-reveal': '' },
      h('p', { class: 'eyebrow', text: 'A letter' }),
      h('h3', { id: 'letter-title', text: letter.envelopeLabel || '一封信' }));

    const envelope = h('button', { class: 'letter__envelope', type: 'button', 'data-reveal': '', 'aria-label': '拆开这封信' },
      h('span', { class: 'letter__seal', 'aria-hidden': 'true', text: '✦' }),
      h('span', { class: 'letter__label', text: '轻点，拆开' }));

    envelope.addEventListener('click', async () => {
      const paras = [
        letter.salutation && h('p', { class: 'letter__salutation', text: letter.salutation }),
        ...(letter.paragraphs || []).map((t) => h('p', { text: t })),
        letter.closing && h('p', { class: 'letter__closing', text: letter.closing }),
        letter.signature && h('p', { class: 'letter__sign', text: letter.signature }),
        letter.date && h('p', { class: 'letter__date', text: letter.date }),
      ].filter(Boolean);
      const paper = h('article', { class: 'letter__paper', tabindex: '-1', 'aria-label': '信的内容' }, paras);
      let skipped = false;
      const skip = h('button', { class: 'btn btn--text letter__skip', type: 'button', onclick: () => { skipped = true; paras.forEach((p) => p.classList.add('is-shown')); skip.remove(); } }, '直接显示全文');
      envelope.replaceWith(paper);
      wrap.append(skip);
      paper.focus({ preventScroll: true });
      if (reducedMotion()) {
        paras.forEach((p) => p.classList.add('is-shown'));
        skip.remove();
        return;
      }
      await wait(1100);
      for (const p of paras) {
        if (skipped) break;
        p.classList.add('is-shown');
        // 按字数决定停留时间，像慢慢读出来
        await wait(Math.min(2600, 700 + [...p.textContent].length * 28));
      }
      skip.remove();
    });

    wrap.append(head, envelope);
    return wrap;
  }

  function renderSurprise(sp) {
    const wrap = h('section', { class: 'gift', 'aria-labelledby': 'gift-title' });
    const head = h('div', { class: 'subhead', 'data-reveal': '' },
      h('p', { class: 'eyebrow', text: 'One more thing' }),
      h('h3', { id: 'gift-title', text: sp.teaser || '最后，还有一样东西' }));
    const box = h('button', { class: 'gift__box', type: 'button', 'aria-label': sp.buttonText || '拆开礼物', 'data-reveal': '' },
      h('span', { class: 'gift__glow' }),
      h('span', { class: 'gift__body' }),
      h('span', { class: 'gift__lid' }, h('span', { class: 'gift__bow' })));
    const hint = h('p', { class: 'gift__teaser', text: sp.buttonText || '拆开它' });

    box.addEventListener('click', async () => {
      if (wrap.classList.contains('is-open')) return;
      wrap.classList.add('is-open');
      sparkle(box);
      await wait(reducedMotion() ? 0 : 900);
      let photo = null;
      if (sp.image) {
        const idx = gallery.push({ src: sp.image.full, caption: sp.title || '' }) - 1;
        photo = h('button', { class: 'gift__photo', type: 'button', 'aria-label': '查看大图', onclick: () => openLightbox(idx) },
          h('img', { src: sp.image.thumb, alt: sp.title || '礼物照片', decoding: 'async' }));
      }
      const card = h('div', { class: 'gift__reveal paper', tabindex: '-1' },
        photo,
        h('h4', { text: sp.title || '' }),
        h('p', { text: sp.text || '' }),
        sp.link && /^https:\/\//.test(sp.link)
          ? h('a', { class: 'btn btn--primary gift__link', href: sp.link, target: '_blank', rel: 'noopener noreferrer' }, sp.linkText || '打开')
          : null);
      box.hidden = true;
      hint.replaceWith(card);
      card.focus({ preventScroll: true });
      card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    });

    wrap.append(head, box, hint);
    return wrap;
  }

  // ---------------- 灯箱 ----------------
  let lb = null;
  let lbIndex = 0;
  let lastFocus = null;

  function openLightbox(i) {
    if (i < 0 || !gallery[i]) return;
    lastFocus = document.activeElement;
    lbIndex = i;
    const img = h('img', { alt: '' });
    const cap = h('p', { class: 'lightbox__caption' });
    const close = h('button', { class: 'lightbox__btn lightbox__close', type: 'button', 'aria-label': '关闭', onclick: closeLightbox }, icon.close());
    const prev = h('button', { class: 'lightbox__btn lightbox__prev', type: 'button', 'aria-label': '上一张', onclick: () => go(-1) }, icon.prev());
    const next = h('button', { class: 'lightbox__btn lightbox__next', type: 'button', 'aria-label': '下一张', onclick: () => go(1) }, icon.next());
    lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': '查看照片' }, img, cap, close, prev, next);
    lb.addEventListener('click', (e) => e.target === lb && closeLightbox());
    let x0 = null;
    lb.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      x0 = null;
    });
    const show = () => {
      const g = gallery[lbIndex];
      img.src = g.src;
      img.alt = g.caption || '照片';
      cap.textContent = g.caption || '';
      prev.hidden = next.hidden = gallery.length < 2;
      img.style.animation = 'none';
      void img.offsetWidth;
      img.style.animation = '';
    };
    const go = (d) => {
      lbIndex = (lbIndex + d + gallery.length) % gallery.length;
      show();
    };
    lb._go = go;
    show();
    document.body.append(lb);
    document.body.classList.add('is-locked');
    close.focus();
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!lb) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lb._go(-1);
    else if (e.key === 'ArrowRight') lb._go(1);
    else if (e.key === 'Tab') {
      const items = $$('button:not([hidden])', lb);
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  }

  function closeLightbox() {
    if (!lb) return;
    lb.remove();
    lb = null;
    document.body.classList.remove('is-locked');
    document.removeEventListener('keydown', onKey);
    lastFocus?.focus?.({ preventScroll: true });
  }

  checkSession();
}
