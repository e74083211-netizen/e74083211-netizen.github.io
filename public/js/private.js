// 私密区域。这个文件里没有任何私密内容——文字和照片都在登录后由服务器返回。
import { C, $, $$, h, api, get, reveal, reducedMotion, wait, icon, toast, feature } from './util.js';
import { createAlbum } from './album.js';
import { openPasswordSheet } from './account.js';
import { sparkle } from './effects.js';

export function initPrivate() {
  const section = $('#private');
  if (!section) return;
  const gate = $('[data-gate]', section);
  const form = $('[data-gate-form]', section);
  const userInput = form.elements.username;
  const input = form.elements.password;
  const eye = $('[data-gate-eye]', section);
  const statusEl = $('[data-gate-status]', section);
  const vault = $('[data-vault]', section);
  const btn = form.querySelector('[type="submit"]');
  const seal = C.recipient?.sealLetter || '✦';
  let me = null;

  const setStatus = (t) => (statusEl.textContent = t || '');
  const smooth = () => (reducedMotion() ? 'auto' : 'smooth');

  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    input.focus({ preventScroll: true });
  });

  async function checkSession() {
    try {
      const s = await api('/api/auth/me');
      if (!s.configured) setStatus('这里暂时还打不开，晚一点再来吧。');
      if (s.user) {
        me = s.user;
        await open(false);
      }
    } catch (e) {
      if (e.code === 'no_backend') setStatus('这里暂时还打不开，晚一点再来吧。');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = userInput.value.trim();
    const password = input.value;
    if (!username) {
      setStatus('先填写用户名吧');
      userInput.focus();
      return;
    }
    if (!password) {
      setStatus('还要填写密码');
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.classList.add('is-busy');
    setStatus('');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      me = data.user;
      input.value = '';
      input.type = 'password';
      eye.setAttribute('aria-pressed', 'false');
      await open(true);
    } catch (err) {
      let msg = err.message;
      if (err.code === 'rate_limited' && err.data.retryAfter) msg = `试的次数有点多了，请 ${Math.ceil(err.data.retryAfter / 60)} 分钟后再来`;
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
      setStatus(`暂时取不出来：${err.message}`);
      return;
    }
    if (animate && !reducedMotion()) {
      gate.classList.add('is-opening');
      await wait(1150);
    }
    gate.hidden = true;
    gate.classList.remove('is-opening');
    vault.replaceChildren(...render(data));
    vault.hidden = false;
    reveal(vault);
    if (animate || location.hash === '#private') {
      vault.scrollIntoView({ behavior: animate ? smooth() : 'auto', block: 'start' });
      $('h2', vault)?.focus({ preventScroll: true });
    }
  }

  /** 退出登录（或会话失效）：清掉页面上的所有私密内容。 */
  async function leave({ expired = false } = {}) {
    if (!expired) {
      try {
        await api('/api/auth/logout', { method: 'POST', body: {} });
      } catch {
        /* 即使网络失败，也把页面上的内容清掉 */
      }
    }
    me = null;
    document.body.classList.remove('is-dawn', 'is-hush');
    closeLightbox();
    closeDetail();
    albumCtl?.close();
    albumCtl = null;
    gallery = [];
    vault.replaceChildren();
    vault.hidden = true;
    gate.hidden = false;
    setStatus(expired ? '登录已经过期了，请重新登录。' : '');
    gate.scrollIntoView({ behavior: smooth(), block: 'center' });
    if (!expired) toast(get('private.left', '已经退出登录了'));
    userInput.focus({ preventScroll: true });
  }

  // ---------------- 渲染 ----------------
  function render(data) {
    const bar = h('div', { class: 'vault__bar' },
      h('span', { class: 'vault__hello' }, '你好，', h('b', { text: me?.displayName || '' })),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => openPasswordSheet() }, '修改密码'),
      me?.role === 'admin' ? h('a', { class: 'btn btn--ghost', href: '/admin/' }, '管理后台') : null,
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => leave() }, get('private.leave', '退出登录')));

    const memories = data.memories || [];
    const albumOn = feature('sharedAlbum');
    const nothing = !data.imported || (!memories.length && !data.letter && !data.surprise);
    if (nothing && !albumOn) {
      return [bar, h('div', { class: 'vault__empty' },
        h('h2', { tabindex: '-1', text: get('private.emptyTitle', '这里还在准备中') }),
        h('p', { text: get('private.emptyText', '晚一点再来看看吧。') }))];
    }

    const out = [bar];
    if (data.preview && data.hasExamples) {
      // 只在作者本机预览时出现
      out.push(h('p', { class: 'vault__preview', text: '本机预览提示：带【示例】的文字和“影像待补充”的占位框只在你的电脑上显示；正式上线后，访客看不到它们。' }));
    }

    const intro = data.intro || {};
    out.push(h('header', { class: 'vault__head', 'data-reveal': '' },
      h('p', { class: 'eyebrow', text: intro.eyebrow || 'Only for you' }),
      h('h2', { tabindex: '-1', text: intro.title || get('private.title') }),
      intro.text ? h('p', { text: intro.text }) : null));

    gallery = [];
    if (memories.length) out.push(renderMemories(memories, data.preview));
    if (albumOn) {
      // 共同相册：解锁的人都可以在网页里直接添加照片和回忆
      albumCtl = createAlbum({ user: me, openViewer: (items, index) => openLightbox(index, items), onLocked: () => leave({ expired: true }) });
      out.push(albumCtl.el);
    }
    if (data.letter) out.push(renderLetter(data.letter));
    if (data.surprise) out.push(renderSurprise(data.surprise));
    out.push(h('p', { class: 'vault__end', 'aria-hidden': 'true', text: 'fin.' }));
    return out;
  }

  let gallery = [];
  let albumCtl = null;

  // ---------------- 回忆：时间线 + “展开完整版” + 收藏小星星 ----------------
  let memList = [];
  const starViews = new Map(); // memoryId → 所有显示这段回忆收藏状态的按钮
  const LONG_TEXT = 70; // 超过这么多字，时间线里只露出开头，完整内容在“完整版”里看

  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 5.9L12 16.8l-5.3 2.8 1.1-5.9L3.4 9.5l6-.8z"/></svg>';

  function likeLabel(l) {
    if (!l.count) return '收藏';
    return l.mine ? (l.count > 1 ? `已收藏 · ${l.count}` : '已收藏') : `收藏 · ${l.count}`;
  }
  function likeWho(l) {
    if (!l.by?.length) return '';
    const others = l.by.filter((n) => n !== me?.displayName);
    if (l.mine && others.length) return `你和 ${others.join('、')} 都收藏了`;
    if (l.mine) return '你收藏了这段回忆';
    return `${others.join('、')} 收藏了这段回忆`;
  }
  function paintStar(btn, l) {
    btn.classList.toggle('is-on', !!l.mine);
    btn.setAttribute('aria-pressed', String(!!l.mine));
    btn.querySelector('.star__label').textContent = likeLabel(l);
    btn.title = likeWho(l) || '收藏这段回忆';
    const who = btn.parentElement?.querySelector('.star__who');
    if (who) who.textContent = likeWho(l);
  }
  function starButton(m, { big = false } = {}) {
    const btn = h('button', { class: `star${big ? ' star--big' : ''}`, type: 'button', 'aria-label': `收藏「${m.title || '这段回忆'}」` });
    btn.innerHTML = STAR;
    btn.append(h('span', { class: 'star__label' }));
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLike(m, btn);
    });
    if (!starViews.has(m.id)) starViews.set(m.id, new Set());
    starViews.get(m.id).add(btn);
    paintStar(btn, m.likes);
    return btn;
  }
  async function toggleLike(m, btn) {
    const before = { ...m.likes, by: [...(m.likes.by || [])] };
    const next = !before.mine;
    // 先在界面上立刻变化，失败再改回来
    m.likes = {
      count: Math.max(0, before.count + (next ? 1 : -1)),
      mine: next,
      by: next ? [...before.by, me?.displayName].filter(Boolean) : before.by.filter((n) => n !== me?.displayName),
    };
    starViews.get(m.id)?.forEach((b) => b.isConnected && paintStar(b, m.likes));
    if (next && !reducedMotion()) {
      btn.classList.remove('is-pop');
      void btn.offsetWidth;
      btn.classList.add('is-pop');
    }
    try {
      const data = await api('/api/private/likes', { method: 'POST', body: { memoryId: m.id, liked: next } });
      m.likes = data.likes;
    } catch (err) {
      m.likes = before;
      if (err.status === 401) return leave({ expired: true });
      toast(err.message || '没能收藏成功，稍后再试');
    }
    starViews.get(m.id)?.forEach((b) => b.isConnected && paintStar(b, m.likes));
  }

  function renderMemories(memories, preview) {
    memList = memories;
    starViews.clear();
    const total = String(memories.length).padStart(2, '0');
    return h('ol', { class: 'timeline', 'aria-label': '回忆' },
      memories.map((m, i) => {
        const no = String(i + 1).padStart(2, '0');
        const long = [...(m.text || '')].length > LONG_TEXT;
        const text = h('div', { class: 'memory__text', 'data-reveal': '', style: { '--d': '.15s' } },
          h('p', { class: 'memory__code', 'aria-hidden': 'true', text: `ARCHIVE ${no} / ${total}` }),
          m.date ? h('p', { class: 'memory__date', text: m.date }) : null,
          m.title ? h('h3', { class: 'memory__title', text: m.title }) : null,
          m.text ? h('p', { class: `memory__body${long ? ' is-clamped' : ''}`, text: m.text }) : null,
          h('div', { class: 'memory__actions' },
            starButton(m),
            h('button', { class: 'memory__more', type: 'button', onclick: () => openDetail(i) }, long ? '展开完整版' : '打开这段回忆', h('span', { 'aria-hidden': 'true', text: ' ›' }))));

        const images = m.images?.length ? m.images : m.image ? [m.image] : [];
        // 灯箱用的图集
        m._gallery = images.map((img, k) => ({ src: img.full, caption: [m.title, images.length > 1 ? `${k + 1} / ${images.length}` : ''].filter(Boolean).join(' · ') }));
        images.forEach((img, k) => gallery.push(m._gallery[k]));

        let frame = null;
        if (images.length) {
          frame = photoFrame(images[0], m.title, () => openDetail(i), images.length);
        } else if (preview && m.photo) {
          // 只在作者本机预览时出现：标出缺哪张照片
          frame = h('div', { class: 'memory__frame' },
            h('div', { class: 'placeholder' }, icon.photo(),
              h('span', {}, '影像待补充'),
              h('code', { text: `memories/${m.photo}` })));
        }
        if (!frame) return h('li', { class: 'memory memory--textonly' }, text);

        return h('li', { class: 'memory' },
          h('figure', { class: 'memory__photo', 'data-reveal': '' },
            h('span', { class: 'memory__corners', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
            frame,
            h('figcaption', { class: 'memory__caption' }, h('span', { text: m.date || m.title || '' }), h('b', { text: `${no} / ${total}` }))),
          text);
      }));
  }

  /** 照片按原始比例显示，不裁掉画面里的人；上面写着“点击展开完整版”。 */
  function photoFrame(image, alt, onOpen, count = 1) {
    const ratio = image.width && image.height ? `${image.width} / ${image.height}` : null;
    const img = h('img', { src: image.thumb, alt: alt || '回忆里的照片', loading: 'lazy', decoding: 'async', width: image.width, height: image.height });
    img.addEventListener('load', () => img.classList.add('is-loaded'));
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'placeholder' }, icon.photo(), h('span', {}, '这张照片暂时没能显示'))));
    return h('button', {
      class: `memory__frame${ratio ? ' has-ratio' : ''}`,
      type: 'button',
      style: ratio ? { 'aspect-ratio': ratio } : null,
      'aria-label': `展开完整版${alt ? `：${alt}` : ''}`,
      onclick: onOpen,
    },
    img,
    count > 1 ? h('span', { class: 'memory__count', text: `共 ${count} 张` }) : null,
    h('span', { class: 'memory__open' }, icon.zoom(), h('span', { text: '点击展开完整版' })));
  }

  // ---------------- 回忆完整版（大图 + 完整故事）----------------
  let md = null;

  function openDetail(index) {
    if (md) return renderDetail(index);
    const lastFocusEl = document.activeElement;
    const box = h('div', { class: 'mdetail', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mdetail-title' });
    md = { box, index, photo: 0, lastFocusEl };
    box.addEventListener('click', (e) => e.target === box && closeDetail());
    let x0 = null;
    box.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
    box.addEventListener('touchend', (e) => {
      if (x0 == null || e.target.closest('.mdetail__body')) return (x0 = null);
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 60) stepPhotoOrMemory(dx < 0 ? 1 : -1);
    });
    document.body.append(box);
    document.body.classList.add('is-locked');
    document.addEventListener('keydown', onDetailKey);
    renderDetail(index);
  }

  function stepPhotoOrMemory(d) {
    const m = memList[md.index];
    const n = m.images?.length || 0;
    if (n > 1 && md.photo + d >= 0 && md.photo + d < n) return showPhoto(md.photo + d);
    stepMemory(d);
  }
  function stepMemory(d) {
    const n = memList.length;
    renderDetail((md.index + d + n) % n, d);
  }

  function renderDetail(index, dir = 0) {
    md.index = index;
    md.photo = 0;
    const m = memList[index];
    const total = String(memList.length).padStart(2, '0');
    const no = String(index + 1).padStart(2, '0');
    const images = m.images?.length ? m.images : m.image ? [m.image] : [];

    const stage = images.length
      ? h('div', { class: 'mdetail__stage' },
          h('img', { class: 'mdetail__img', alt: m.title || '回忆里的照片', decoding: 'async' }),
          h('button', { class: 'mdetail__full', type: 'button', onclick: () => openLightbox(md.photo, m._gallery) }, icon.zoom(), h('span', { text: '看原图' })),
          images.length > 1
            ? h('div', { class: 'mdetail__thumbs', role: 'tablist', 'aria-label': '这段回忆的照片' },
                images.map((img, k) => h('button', { class: 'mdetail__thumb', type: 'button', role: 'tab', 'aria-label': `第 ${k + 1} 张`, onclick: () => showPhoto(k) },
                  h('img', { src: img.thumb, alt: '' }))))
            : null)
      : null;

    const body = h('div', { class: 'mdetail__body' },
      h('p', { class: 'mdetail__code', text: `ARCHIVE ${no} / ${total}` }),
      m.date ? h('p', { class: 'memory__date', text: m.date }) : null,
      h('h3', { id: 'mdetail-title', class: 'mdetail__title', text: m.title || '一段回忆' }),
      m.text ? h('p', { class: 'mdetail__text', text: m.text }) : null,
      h('div', { class: 'mdetail__like' }, starButton(m, { big: true }), h('span', { class: 'star__who', text: likeWho(m.likes) })));

    const nav = h('div', { class: 'mdetail__nav' },
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => stepMemory(-1) }, '‹ 上一段'),
      h('span', { class: 'mdetail__pos', text: `${no} / ${total}` }),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => stepMemory(1) }, '下一段 ›'));

    const panel = h('article', { class: `mdetail__panel${images.length ? '' : ' is-textonly'}${dir ? (dir > 0 ? ' from-right' : ' from-left') : ''}` },
      h('span', { class: 'memory__corners', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
      h('button', { class: 'mdetail__close', type: 'button', 'aria-label': '关闭', onclick: closeDetail }, icon.close()),
      stage, body, nav);
    md.box.replaceChildren(panel);
    // 刷新星星：旧的面板已移除
    if (images.length) showPhoto(0, true);
    panel.querySelector('.mdetail__close').focus({ preventScroll: true });
  }

  function showPhoto(k, first = false) {
    const m = memList[md.index];
    const images = m.images?.length ? m.images : [m.image];
    const img = md.box.querySelector('.mdetail__img');
    if (!img || !images[k]) return;
    md.photo = k;
    const pick = images[k];
    img.classList.remove('is-ready');
    if (pick.width && pick.height) img.parentElement.style.setProperty('--ar', `${pick.width} / ${pick.height}`);
    // 先用缩略图占位，再换成大图，避免空白
    img.src = pick.thumb;
    const big = new Image();
    big.decoding = 'async';
    big.onload = () => { if (md && md.photo === k && img.isConnected) img.src = pick.full; };
    big.src = pick.full;
    requestAnimationFrame(() => img.classList.add('is-ready'));
    md.box.querySelectorAll('.mdetail__thumb').forEach((t, i) => t.setAttribute('aria-selected', String(i === k)));
    if (!first) img.animate?.([{ opacity: 0.2, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: reducedMotion() ? 0 : 420, easing: 'ease-out' });
  }

  function onDetailKey(e) {
    if (!md || document.querySelector('.lightbox')) return;
    if (e.key === 'Escape') closeDetail();
    else if (e.key === 'ArrowRight') stepPhotoOrMemory(1);
    else if (e.key === 'ArrowLeft') stepPhotoOrMemory(-1);
    else if (e.key === 'Tab') {
      const items = [...md.box.querySelectorAll('button:not([hidden])')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  }

  function closeDetail() {
    if (!md) return;
    const { box, lastFocusEl } = md;
    md = null;
    document.removeEventListener('keydown', onDetailKey);
    const done = () => {
      box.remove();
      if (!document.querySelector('.lightbox')) document.body.classList.remove('is-locked');
      lastFocusEl?.focus?.({ preventScroll: true });
    };
    if (reducedMotion()) return done();
    box.classList.add('is-closing');
    setTimeout(done, 260);
  }

  // ---------------- 信：一条加密讯息 ----------------
  const GLYPHS = '░▒▓█01ABCDEF#@*&%';
  function scramble(el, finalText, ms) {
    if (reducedMotion()) {
      el.textContent = finalText;
      return Promise.resolve();
    }
    const chars = [...finalText];
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = (now) => {
        const k = Math.min(1, (now - start) / ms);
        const done = Math.floor(chars.length * k);
        el.textContent = chars.map((c, i) => (i < done || c === ' ' ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join('');
        if (k < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  function renderLetter(letter) {
    const wrap = h('section', { class: 'letter', 'aria-labelledby': 'letter-title' });
    const label = letter.envelopeLabel || '给你的一封信';
    const head = h('div', { class: 'subhead', 'data-reveal': '' },
      h('p', { class: 'eyebrow', text: 'Encrypted message' }),
      h('h3', { id: 'letter-title', text: label }));
    const slot = h('div', { class: 'letter', style: { width: '100%' } });
    let run = 0;

    function showCapsule(focus) {
      run++;
      const title = h('span', { class: 'capsule__title', text: '1 条私人讯息 · 仅你可读' });
      const bar = h('span', { class: 'capsule__bar', 'aria-hidden': 'true' }, h('i'));
      const capsule = h('button', { class: 'capsule', type: 'button', 'aria-label': `解锁这条讯息：${label}` },
        h('span', { class: 'capsule__lock', 'aria-hidden': 'true' },
          h('span', { class: 'capsule__shackle' }), h('span', { class: 'capsule__body', text: seal })),
        h('span', { class: 'capsule__text' },
          h('span', { class: 'capsule__kicker', text: 'INCOMING · ENCRYPTED' }),
          title,
          bar,
          h('span', { class: 'capsule__hint', text: '轻点解锁' })));
      capsule.addEventListener('click', async () => {
        if (capsule.classList.contains('is-open')) return;
        capsule.classList.add('is-open');
        capsule.querySelector('.capsule__hint').textContent = '正在解密…';
        await scramble(title, label, 750);
        if (!reducedMotion()) await wait(250);
        showPaper();
      });
      slot.replaceChildren(capsule);
      if (focus) {
        capsule.focus({ preventScroll: true });
        head.scrollIntoView({ behavior: smooth(), block: 'start' });
      }
    }

    async function showPaper() {
      const mine = ++run;
      const paras = [
        letter.salutation && h('p', { class: 'letter__salutation', text: letter.salutation }),
        ...(letter.paragraphs || []).map((t) => h('p', { text: t })),
        letter.closing && h('p', { class: 'letter__closing', text: letter.closing }),
        letter.signature && h('p', { class: 'letter__sign', text: letter.signature }),
        letter.date && h('p', { class: 'letter__date', text: letter.date }),
      ].filter(Boolean);
      const paper = h('article', { class: 'letter__paper', tabindex: '-1', 'aria-label': '信的内容' },
        h('p', { class: 'letter__stamp', 'aria-hidden': 'true', text: 'DECRYPTED · 已解密' }), ...paras);
      const tools = h('div', { class: 'letter__tools' },
        h('button', { class: 'btn btn--quiet', type: 'button', onclick: () => showCapsule(true) }, '重新加密收好'));
      slot.replaceChildren(paper, tools);
      paper.focus({ preventScroll: true });
      if (reducedMotion()) {
        paras.forEach((p) => p.classList.add('is-shown'));
        return;
      }
      // 段落依次浮现，节奏轻快，不按字数等待
      await wait(450);
      for (const p of paras) {
        if (mine !== run) return;
        p.classList.add('is-shown');
        await wait(220);
      }
    }

    showCapsule(false);
    wrap.append(head, slot);
    return wrap;
  }

  // ---------------- 最后的信号 ----------------
  function renderSurprise(sp) {
    const wrap = h('section', { class: 'gift', 'aria-labelledby': 'gift-title' });
    const head = h('div', { class: 'subhead', 'data-reveal': '' },
      h('p', { class: 'eyebrow', text: 'One more thing' }),
      h('h3', { id: 'gift-title', text: sp.teaser || '最后，还有一样东西' }));
    const box = h('button', { class: 'gift__box gift__core', type: 'button', 'aria-label': sp.buttonText || '打开礼物', 'data-reveal': '' },
      h('span', { class: 'gift__ring' }), h('span', { class: 'gift__ring' }), h('span', { class: 'gift__ring' }),
      h('span', { class: 'gift__cube' }, h('span', { class: 'gift__ribbon' })),
      h('span', { class: 'gift__glow' }));
    const hint = h('p', { class: 'gift__teaser', text: sp.buttonText || '打开它' });

    box.addEventListener('click', async () => {
      if (wrap.classList.contains('is-open')) return;
      // 情绪推进：先充能（城市暗下来），再绽放，最后像天亮一样暖起来
      wrap.classList.add('is-charging');
      document.body.classList.add('is-hush');
      await wait(reducedMotion() ? 0 : 900);
      wrap.classList.add('is-open');
      sparkle(box);
      await wait(reducedMotion() ? 0 : 650);
      document.body.classList.remove('is-hush');
      document.body.classList.add('is-dawn');
      let photo = null;
      if (sp.image) {
        const idx = gallery.push({ src: sp.image.full, caption: sp.title || '' }) - 1;
        const ratio = sp.image.width && sp.image.height ? `${sp.image.width} / ${sp.image.height}` : null;
        photo = h('button', { class: 'gift__photo', type: 'button', style: ratio ? { 'aspect-ratio': ratio } : null, 'aria-label': '看大图', onclick: () => openLightbox(idx) },
          h('img', { src: sp.image.thumb, alt: sp.title || '礼物里的照片', decoding: 'async' }));
      }
      const card = h('div', { class: 'gift__reveal paper', tabindex: '-1' },
        photo,
        sp.title ? h('h4', { text: sp.title }) : null,
        sp.text ? h('p', { text: sp.text }) : null,
        sp.link && /^https:\/\//.test(sp.link)
          ? h('a', { class: 'btn btn--ink gift__link', href: sp.link, target: '_blank', rel: 'noopener noreferrer' }, sp.linkText || '打开看看')
          : null);
      box.hidden = true;
      hint.replaceWith(card);
      card.focus({ preventScroll: true });
      card.scrollIntoView({ behavior: smooth(), block: 'center' });
    });

    wrap.append(head, box, hint);
    return wrap;
  }

  // ---------------- 灯箱 ----------------
  let lb = null;
  let lbIndex = 0;
  let lastFocus = null;

  function openLightbox(i, list = gallery) {
    if (i < 0 || !list[i]) return;
    lastFocus = document.activeElement;
    lbIndex = i;
    const img = h('img', { alt: '' });
    const cap = h('p', { class: 'lightbox__caption' });
    const count = h('span', { class: 'lightbox__count', 'aria-hidden': 'true' });
    const close = h('button', { class: 'lightbox__btn lightbox__close', type: 'button', 'aria-label': '关闭', onclick: closeLightbox }, icon.close());
    const prev = h('button', { class: 'lightbox__btn lightbox__prev', type: 'button', 'aria-label': '上一张', onclick: () => go(-1) }, icon.prev());
    const next = h('button', { class: 'lightbox__btn lightbox__next', type: 'button', 'aria-label': '下一张', onclick: () => go(1) }, icon.next());
    lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': '查看照片' }, img, cap, count, close, prev, next);
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
      const g = list[lbIndex];
      img.src = g.src;
      img.alt = g.caption || '照片';
      cap.textContent = g.caption || '';
      const many = list.length > 1;
      prev.hidden = next.hidden = !many;
      count.textContent = many ? `${lbIndex + 1} / ${list.length}` : '';
      img.style.animation = 'none';
      void img.offsetWidth;
      img.style.animation = '';
    };
    const go = (d) => {
      if (list.length < 2) return;
      lbIndex = (lbIndex + d + list.length) % list.length;
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
    if (!md) document.body.classList.remove('is-locked');
    document.removeEventListener('keydown', onKey);
    lastFocus?.focus?.({ preventScroll: true });
  }

  checkSession();
}
