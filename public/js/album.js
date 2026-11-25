// 共同相册：解锁私密区域后，可以在网页里直接添加照片和回忆。
// 这里没有任何相册内容——全部在解锁后由服务器返回；照片在上传前先在浏览器里压缩并去掉拍摄信息。
import { h, api, ApiError, get, reveal, reducedMotion, icon, toast } from './util.js';

const FULL_SIDE = 2400;
const THUMB_SIDE = 900;
const t = (key, fallback) => get(`album.${key}`, fallback);

function formatDay(value) {
  if (!value) return '';
  const [y, m, d] = String(value).split('-').map(Number);
  return y && m && d ? `${y} 年 ${m} 月 ${d} 日` : '';
}

// ---------- 在浏览器里处理照片：按方向摆正、缩小、重新编码（顺带去掉地点等拍摄信息）----------
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* 换一种方式再试 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('decode'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function render(source, maxSide, quality) {
  const sw = source.width || source.naturalWidth;
  const sh = source.height || source.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const hgt = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 透明背景的图片铺白底
  ctx.fillRect(0, 0, w, hgt);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, hgt);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res({ blob: b, width: w, height: hgt }) : rej(new Error('encode'))), 'image/jpeg', quality)
  );
}

async function prepare(file, limits) {
  const source = await decode(file);
  try {
    let full = await render(source, FULL_SIDE, 0.86);
    if (limits?.fullBytes && full.blob.size > limits.fullBytes) full = await render(source, 1800, 0.8);
    const thumb = await render(source, THUMB_SIDE, 0.8);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, url: URL.createObjectURL(thumb.blob) };
  } finally {
    source.close?.();
  }
}

function upload(item, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('full', item.full, 'full.jpg');
    fd.append('thumb', item.thumb, 'thumb.jpg');
    const x = new XMLHttpRequest();
    x.open('POST', '/api/private/album/photos');
    x.responseType = 'json';
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      const data = x.response;
      if (x.status < 300 && data?.ok) resolve(data.photo);
      else reject(new ApiError(data?.message || '上传没有成功', x.status, data));
    };
    x.onerror = () => reject(new ApiError('网络好像断开了', 0));
    x.ontimeout = () => reject(new ApiError('上传超时了', 0));
    x.timeout = 120000;
    x.send(fd);
  });
}

/**
 * 创建相册区域。
 * @param {object} o
 * @param {(items: {src:string, caption:string}[], index:number) => void} o.openViewer 打开大图
 * @param {{id:string, displayName:string, role:string}} o.user 当前登录的账号
 * @param {() => void} o.onLocked 会话失效时的回调
 */
export function createAlbum({ user, openViewer, onLocked }) {
  const listEl = h('div', { class: 'album__list' });
  const stateEl = h('div', { class: 'album__state', role: 'status' });
  const addBtn = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openComposer() },
    h('span', { 'aria-hidden': 'true', text: '＋ ' }), t('add', '添加回忆'));
  const section = h('section', { class: 'album', 'aria-labelledby': 'album-title' },
    h('div', { class: 'subhead', 'data-reveal': '' },
      h('p', { class: 'eyebrow', text: 'Our album' }),
      h('h3', { id: 'album-title', text: t('title', '一起写的相册') }),
      h('p', { class: 'album__sub', text: t('subtitle', '') })),
    h('div', { class: 'album__bar', 'data-reveal': '' }, addBtn),
    stateEl, listEl);

  let limits = { title: 40, body: 800, photosPerMemory: 6 };
  let available = true;

  function setState(kind, message) {
    stateEl.replaceChildren();
    if (kind === 'loading') stateEl.append(h('p', { class: 'album__hint', text: '正在翻开相册…' }));
    if (kind === 'empty') stateEl.append(h('div', { class: 'album__empty' }, t('empty', '相册还是空的，来放第一张照片吧。')));
    if (kind === 'error') {
      stateEl.append(h('div', { class: 'album__empty' },
        h('div', { text: message }),
        available ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: load }, '再试一次') : null));
    }
  }

  function entry(m, isNew = false) {
    const photos = m.photos || [];
    const items = photos.map((p) => ({ src: p.full, caption: [formatDay(m.date), m.title].filter(Boolean).join(' · ') }));
    const shown = photos.slice(0, 4);
    const extra = photos.length - shown.length;
    const single = photos.length === 1 ? photos[0] : null;
    const portrait = single && single.height > single.width * 1.05;

    const grid = photos.length
      ? h('div', { class: `entry__photos${portrait ? ' is-portrait' : ''}`, 'data-n': String(Math.min(photos.length, 4)) },
          shown.map((p, i) => {
            const img = h('img', { src: p.thumb, alt: `${m.title}（第 ${i + 1} 张）`, loading: 'lazy', decoding: 'async', width: p.width, height: p.height });
            img.addEventListener('load', () => img.classList.add('is-loaded'));
            img.addEventListener('error', () => img.replaceWith(h('span', { class: 'entry__broken', text: '这张照片暂时没能显示' })));
            // 只有一张时按原始比例显示，不裁掉画面；多张时裁成整齐的格子，点开看完整大图
            const ratio = photos.length === 1 && p.width && p.height ? { 'aspect-ratio': `${p.width} / ${p.height}` } : null;
            return h('button', { class: 'entry__photo', type: 'button', style: ratio, 'aria-label': `看大图：${m.title}，第 ${i + 1} 张，共 ${photos.length} 张`, onclick: () => openViewer(items, i) },
              img, i === 3 && extra > 0 ? h('span', { class: 'entry__more', text: `+${extra}` }) : null);
          }))
      : null;

    // 添加者来自账号（服务器给出），不是自己填写的署名
    const by = m.owner ? m.owner.displayName : m.legacyAuthor ? `${m.legacyAuthor}（早期添加）` : '';
    const el = h('article', { class: `entry paper${photos.length ? '' : ' entry--text'}${isNew ? ' is-new' : ''}`, 'data-reveal': '', 'data-id': m.id });
    const tools = m.canEdit
      ? h('span', { class: 'entry__tools' },
          h('button', { type: 'button', onclick: () => openEditor(m, el), 'aria-label': `修改「${m.title}」` }, '修改'),
          h('button', { type: 'button', class: 'is-danger', onclick: () => removeEntry(m, el), 'aria-label': `删除「${m.title}」` }, '删除'))
      : null;
    el.append(grid || '',
      h('div', { class: 'entry__body' },
        m.date ? h('p', { class: 'entry__date', text: formatDay(m.date) }) : null,
        h('h4', { class: 'entry__title' }, m.title, m.mine ? h('span', { class: 'entry__mine', text: '我添加的' }) : null),
        m.text ? h('p', { class: 'entry__text', text: m.text }) : null,
        by || tools ? h('div', { class: 'entry__foot' }, tools || h('span'), by ? h('p', { class: 'entry__author', text: by }) : null) : null));
    return el;
  }

  async function removeEntry(m, el) {
    const n = (m.photos || []).length;
    if (!confirm(`确定要删除「${m.title}」吗？${n ? `里面的 ${n} 张照片也会一起删除，` : ''}删除后无法恢复。`)) return;
    try {
      await api(`/api/private/album/memories/${m.id}`, { method: 'DELETE' });
      el.remove();
      if (!listEl.children.length) setState('empty');
      toast('已经删除了');
    } catch (err) {
      if (err.status === 401) return onLocked?.();
      toast(err.message);
    }
  }

  /** 修改自己的一条回忆（文字部分）。权限由服务器再判断一次。 */
  function openEditor(m, el) {
    if (composer) return;
    const lastFocus = document.activeElement;
    const title = h('input', { type: 'text', maxlength: limits.title, required: true, value: m.title, autocomplete: 'off' });
    const date = h('input', { type: 'date', value: m.date || '' });
    const text = h('textarea', { rows: 5, maxlength: limits.body });
    text.value = m.text || '';
    const status = h('p', { class: 'composer__status', role: 'status', 'aria-live': 'polite' });
    const submit = h('button', { class: 'btn btn--ink', type: 'submit' }, '保存修改');
    const field = (label, control, hint) => h('label', { class: 'pfield' },
      h('span', { class: 'pfield__label' }, h('span', { text: label }), hint ? h('em', { class: 'pfield__count', text: hint }) : null), control);
    const form = h('form', { class: 'composer paper', novalidate: true },
      h('div', { class: 'composer__head' },
        h('h3', { id: 'editor-title', text: '修改这段回忆' }),
        h('button', { class: 'composer__close', type: 'button', 'aria-label': '关闭', onclick: () => close() }, icon.close())),
      h('div', { class: 'composer__scroll' },
        field(t('titleLabel', '标题'), title),
        field(t('dateLabel', '日期'), date, '可不填'),
        field(t('textLabel', '想说的话'), text, '可不填'),
        (m.photos || []).length ? h('p', { class: 'composer__note', text: '照片不能单独修改；如果想换照片，可以删除这段回忆后重新添加。' }) : null),
      h('div', { class: 'composer__foot' }, status,
        h('div', { class: 'composer__actions' }, h('button', { class: 'btn btn--plain', type: 'button', onclick: () => close() }, '取消'), submit)));
    const overlay = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'editor-title' }, form);
    composer = overlay;
    forceClose = () => close();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!title.value.trim()) {
        status.textContent = '标题不能空着';
        status.className = 'composer__status is-error';
        return title.focus();
      }
      submit.disabled = true;
      submit.classList.add('is-busy');
      try {
        const data = await api(`/api/private/album/memories/${m.id}`, {
          method: 'PATCH',
          body: { title: title.value, date: date.value || null, text: text.value },
        });
        close();
        if (data.memory) {
          const fresh = entry(data.memory);
          fresh.classList.add('is-visible');
          el.replaceWith(fresh);
        }
        toast('已经保存了');
      } catch (err) {
        if (err.status === 401) { close(); return onLocked?.(); }
        status.textContent = err.message;
        status.className = 'composer__status is-error';
      } finally {
        submit.disabled = false;
        submit.classList.remove('is-busy');
      }
    });
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      overlay.remove();
      composer = null;
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', onKey);
      lastFocus?.focus?.({ preventScroll: true });
    }
    overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    document.body.classList.add('is-locked');
    title.focus();
  }

  async function load() {
    setState('loading');
    try {
      const data = await api('/api/private/album');
      limits = { ...limits, ...(data.limits || {}) };
      listEl.replaceChildren(...data.memories.map((m) => entry(m)));
      setState(data.memories.length ? '' : 'empty');
      reveal(section);
    } catch (err) {
      if (err.status === 401) return onLocked?.();
      available = err.code !== 'album_unavailable' && err.code !== 'no_backend';
      addBtn.hidden = !available;
      setState('error', available ? `相册暂时打不开：${err.message}` : '相册暂时用不了，晚一点再来看看吧。');
    }
  }

  // ---------------- “添加回忆”窗口 ----------------
  let composer = null;
  let forceClose = null;

  function openComposer() {
    if (composer) return;
    const lastFocus = document.activeElement;
    const items = []; // { file, full, thumb, url, id?, el }
    let busy = false;
    let failed = false;

    const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
    const previews = h('ul', { class: 'composer__previews', 'aria-label': '已选的照片' });
    const pickBtn = h('button', { class: 'composer__pick', type: 'button', onclick: () => fileInput.click() },
      icon.photo(), h('span', { text: t('pick', '选择照片') }), h('em', { text: t('pickHint', '') }));
    const pickNote = h('p', { class: 'composer__note', role: 'status' });

    const title = h('input', { type: 'text', name: 'title', maxlength: limits.title, required: true, placeholder: t('titlePlaceholder', ''), autocomplete: 'off' });
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = h('input', { type: 'date', name: 'date', max: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` });
    const text = h('textarea', { name: 'text', rows: 4, maxlength: limits.body, placeholder: t('textPlaceholder', '') });

    const bar = h('div', { class: 'composer__progress', hidden: true }, h('i'));
    const status = h('p', { class: 'composer__status', role: 'status', 'aria-live': 'polite' });
    const submit = h('button', { class: 'btn btn--ink', type: 'submit' }, h('span', { text: t('save', '放进相册') }));
    const cancel = h('button', { class: 'btn btn--plain', type: 'button', onclick: () => close() }, '取消');

    const field = (label, control, hint) => h('label', { class: 'pfield' },
      h('span', { class: 'pfield__label' }, h('span', { text: label }), hint ? h('em', { class: 'pfield__count', text: hint }) : null), control);

    const form = h('form', { class: 'composer paper', novalidate: true },
      h('div', { class: 'composer__head' },
        h('h3', { id: 'composer-title', text: t('add', '添加回忆') }),
        h('button', { class: 'composer__close', type: 'button', 'aria-label': '关闭', onclick: () => close() }, icon.close())),
      h('div', { class: 'composer__scroll' },
        fileInput, pickBtn, pickNote, previews,
        field(t('titleLabel', '标题'), title),
        field(t('dateLabel', '日期'), date, '可不填'),
        field(t('textLabel', '想说的话'), text, '可不填'),
        h('p', { class: 'composer__note', text: t('ownerNote', '').replace('{me}', user?.displayName || '你') })),
      h('div', { class: 'composer__foot' }, bar, status, h('div', { class: 'composer__actions' }, cancel, submit)));

    const overlay = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'composer-title' }, form);
    composer = overlay;
    forceClose = () => close(true);

    const setStatus = (msg, kind = '') => {
      status.textContent = msg || '';
      status.className = `composer__status${kind ? ` is-${kind}` : ''}`;
    };
    const setProgress = (p) => {
      bar.hidden = p == null;
      if (p != null) bar.firstChild.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
    };
    function setBusy(b) {
      busy = b;
      [title, date, text, pickBtn, cancel].forEach((el) => (el.disabled = b));
      submit.disabled = b;
      submit.classList.toggle('is-busy', b);
      previews.classList.toggle('is-locked', b);
    }
    function refreshPick() {
      const left = limits.photosPerMemory - items.length;
      pickBtn.hidden = left <= 0;
      pickBtn.classList.toggle('is-small', items.length > 0);
      pickBtn.querySelector('span').textContent = items.length ? t('pickMore', '再加几张') : t('pick', '选择照片');
    }

    async function addFiles(files) {
      const list = [...files].filter((f) => f && f.size > 0);
      if (!list.length) return;
      const room = limits.photosPerMemory - items.length;
      const problems = [];
      if (list.length > room) problems.push(`一段回忆最多放 ${limits.photosPerMemory} 张照片，多出来的没有加进去。`);
      for (const file of list.slice(0, Math.max(0, room))) {
        const li = h('li', { class: 'composer__thumb is-working' }, h('span', { class: 'composer__spinner', 'aria-label': '正在处理' }));
        previews.append(li);
        const item = { file, el: li };
        items.push(item);
        refreshPick();
        try {
          Object.assign(item, await prepare(file, limits));
          if (!composer) return;
          li.classList.remove('is-working');
          li.classList.toggle('is-portrait', item.height > item.width);
          li.replaceChildren(
            h('img', { src: item.url, alt: '已选的照片' }),
            h('span', { class: 'composer__tick', 'aria-hidden': 'true', text: '✓' }),
            h('button', { class: 'composer__remove', type: 'button', 'aria-label': '去掉这张', onclick: () => remove(item) }, icon.close()));
        } catch {
          items.splice(items.indexOf(item), 1);
          li.remove();
          refreshPick();
          problems.push(`「${file.name}」打不开。常见的 JPG、PNG、WebP 都可以；iPhone 的 HEIC 原图请在 iPhone 上直接选，或者先转成 JPG。`);
        }
      }
      pickNote.textContent = problems.join('\n');
    }
    function remove(item) {
      if (busy) return;
      const i = items.indexOf(item);
      if (i < 0) return;
      items.splice(i, 1);
      item.el.remove();
      if (item.url) URL.revokeObjectURL(item.url);
      refreshPick();
    }

    fileInput.addEventListener('change', () => {
      addFiles(fileInput.files);
      fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) => form.addEventListener(ev, (e) => {
      if (busy || !e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      form.classList.add('is-drop');
    }));
    ['dragleave', 'drop'].forEach((ev) => form.addEventListener(ev, () => form.classList.remove('is-drop')));
    form.addEventListener('drop', (e) => {
      if (busy || !e.dataTransfer?.files?.length) return;
      e.preventDefault();
      addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      if (items.some((it) => !it.full)) return setStatus('照片还在处理，稍等一下再点', 'error');
      const tv = title.value.trim();
      if (!tv) {
        setStatus('给这段回忆起个标题吧', 'error');
        title.focus();
        return;
      }
      if (!items.length && !text.value.trim()) {
        setStatus('至少放一张照片，或者写几句话', 'error');
        return;
      }
      setBusy(true);
      failed = false;
      try {
        const todo = items.filter((it) => !it.id);
        const doneBefore = items.length - todo.length;
        for (let i = 0; i < todo.length; i++) {
          const it = todo[i];
          const n = doneBefore + i;
          setStatus(`正在上传第 ${n + 1} / ${items.length} 张…`);
          it.el.classList.add('is-uploading');
          const photo = await upload(it, (p) => setProgress((n + p) / (items.length + 0.3)));
          it.id = photo.id;
          it.el.classList.remove('is-uploading');
          it.el.classList.add('is-done');
        }
        setProgress(items.length ? items.length / (items.length + 0.3) : 0.5);
        setStatus('正在保存…');
        const data = await api('/api/private/album/memories', {
          method: 'POST',
          body: { title: tv, date: date.value || null, text: text.value, photoIds: items.map((it) => it.id) },
        });
        setProgress(1);
        close(true);
        toast(t('saved', '已经放进相册了'));
        if (data.memory) {
          stateEl.replaceChildren();
          const el = entry(data.memory, true);
          listEl.prepend(el);
          reveal(section);
          el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        } else {
          load();
        }
      } catch (err) {
        items.forEach((it) => it.el.classList.remove('is-uploading'));
        setBusy(false);
        setProgress(null);
        if (err.status === 401) {
          setStatus('登录已经过期了，请重新登录后再添加。', 'error');
          return;
        }
        if (err.code === 'photo_gone') items.forEach((it) => { delete it.id; it.el.classList.remove('is-done'); });
        failed = true;
        const done = items.filter((it) => it.id).length;
        const kept = done ? `（已传好的 ${done} 张不用重传）` : '';
        setStatus(`没有成功：${err.message}${kept}`, 'error');
        submit.querySelector('span').textContent = '重试';
      }
    });

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        const focusable = [...form.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([type="file"]), textarea:not([disabled])')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    function close(force = false) {
      if (!composer) return;
      if (busy && !force) return;
      const dirty = items.length || title.value.trim() || text.value.trim();
      if (!force && dirty && !confirm(failed ? '还没有保存成功，确定不要了吗？' : '写了一半的内容不会保留，确定关闭吗？')) return;
      items.forEach((it) => it.url && URL.revokeObjectURL(it.url));
      overlay.remove();
      composer = null;
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', onKey, true);
      lastFocus?.focus?.({ preventScroll: true });
    }

    overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    document.body.classList.add('is-locked');
    refreshPick();
    pickBtn.focus({ preventScroll: true });
  }

  load();
  return { el: section, close: () => composer && forceClose?.() };
}
