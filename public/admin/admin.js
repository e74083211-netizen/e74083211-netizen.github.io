// 管理后台：需要用管理员账号登录。所有权限都在服务器上再检查一次。
import { $, $$, h, api, formatDate } from '/js/util.js';
import { openPasswordSheet } from '/js/account.js';

const loginBox = $('[data-login]');
const notAdmin = $('[data-not-admin]');
const views = $('[data-views]');
const panels = { accounts: $('[data-accounts-panel]'), album: $('[data-album-panel]'), messages: $('[data-panel]') };
const logoutBtn = $('[data-logout]');
const pwBtn = $('[data-password]');
const who = $('[data-who]');
const globalStatus = $('[data-global-status]');
let me = null;
let view = 'accounts';
let users = [];

function status(msg, ok = false) {
  globalStatus.textContent = msg || '';
  globalStatus.classList.toggle('is-ok', ok);
}
const onAuthError = (err) => {
  if (err.status === 401) return showLogin(), true;
  if (err.status === 403) return showNotAdmin(), true;
  return false;
};

async function boot() {
  try {
    const [s, health] = await Promise.all([api('/api/auth/me'), api('/api/health').catch(() => ({}))]);
    $('[data-mode]').textContent =
      health.moderation === 'pre' ? '当前模式：先审后发（新留言需要你点「显示」后才会公开）' : '当前模式：直接公开（可随时隐藏或删除）';
    me = s.user;
    if (!me) showLogin();
    else if (me.role !== 'admin') showNotAdmin();
    else showPanel();
  } catch (e) {
    status(e.code === 'no_backend' ? '需要后端服务才能使用后台（请用 npm run dev 或部署后的网址）' : e.message);
  }
}

function hideAll() {
  loginBox.hidden = notAdmin.hidden = views.hidden = true;
  Object.values(panels).forEach((p) => (p.hidden = true));
}

function showLogin() {
  me = null;
  hideAll();
  loginBox.hidden = false;
  logoutBtn.hidden = pwBtn.hidden = who.hidden = true;
  $('[data-login-form] [name=username]').focus();
}

function showNotAdmin() {
  hideAll();
  notAdmin.hidden = false;
  logoutBtn.hidden = false;
  pwBtn.hidden = true;
  setWho();
}

function setWho() {
  who.hidden = !me;
  if (me) who.textContent = `已登录：${me.displayName}（${me.username}）`;
}

function showPanel() {
  hideAll();
  logoutBtn.hidden = pwBtn.hidden = false;
  views.hidden = false;
  setWho();
  setView(view);
}

function setView(v) {
  view = v;
  $$('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  Object.entries(panels).forEach(([k, p]) => (p.hidden = k !== v));
  status('');
  if (v === 'accounts') loadAccounts();
  else if (v === 'album') loadAlbum();
  else load(true);
}
$$('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

$('[data-login-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const st = $('[data-login-status]');
  st.textContent = '';
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { username: f.username.value.trim(), password: f.password.value } });
    f.password.value = '';
    me = data.user;
    me.role === 'admin' ? showPanel() : showNotAdmin();
  } catch (err) {
    st.textContent = err.data?.retryAfter ? `尝试次数太多，请 ${Math.ceil(err.data.retryAfter / 60)} 分钟后再试` : err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
  ['[data-list]', '[data-album-list]', '[data-users]', '[data-invites]'].forEach((s) => $(s).replaceChildren());
  $('[data-link]').hidden = true;
  showLogin();
});
pwBtn.addEventListener('click', () => openPasswordSheet());

// ---------------- 账号与邀请 ----------------

const ROLE = { admin: '管理员', member: '成员' };
/** 绝对时间（用于“到什么时候有效”这类将来的时间） */
const until = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const linkFor = (token) => `${location.origin}/join/#${token}`;

function showLink(title, url, expiresAt, hint) {
  const box = $('[data-link]');
  const input = h('input', { type: 'text', readonly: true, value: url, 'aria-label': '链接' });
  const copy = h('button', { class: 'btn btn--primary', type: 'button' }, '复制链接');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = '已复制';
    } catch {
      input.select();
      copy.textContent = '请手动复制';
    }
    setTimeout(() => (copy.textContent = '复制链接'), 2500);
  });
  input.addEventListener('focus', () => input.select());
  box.replaceChildren(
    h('p', { class: 'admin__link-title', text: title }),
    h('div', { class: 'admin__link-row' }, input, copy),
    h('p', { class: 'admin__muted', text: `${until(expiresAt)} 之前有效，只能用一次。${hint}` }),
    h('p', { class: 'admin__muted admin__warn', text: '这个链接只显示这一次（服务器只保存它的摘要）。关掉之后如果没存下来，撤销它再生成一个新的就好。' }));
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('[data-invite-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  try {
    const data = await api('/api/admin/invites', { method: 'POST', body: { note: f.note.value, days: Number(f.days.value) } });
    showLink('邀请链接已生成', linkFor(data.invite.token), data.invite.expiresAt, '请单独发给要邀请的人，不要发到群里。');
    f.note.value = '';
    loadAccounts({ keepLink: true });
  } catch (err) {
    if (!onAuthError(err)) status(err.message);
  }
});

async function loadAccounts({ keepLink = false } = {}) {
  if (!keepLink) $('[data-link]').hidden = true;
  try {
    const data = await api('/api/admin/accounts');
    users = data.users;
    $('[data-users]').replaceChildren(...data.users.map(userItem));
    $('[data-invites]').replaceChildren(...data.invites.map(inviteItem));
    $('[data-invites-empty]').hidden = data.invites.length > 0;
  } catch (err) {
    if (!onAuthError(err)) status(err.message);
  }
}

function inviteItem(i) {
  const what = i.kind === 'reset' ? `重置密码链接 · ${i.forName || ''}` : `邀请注册 · ${ROLE[i.role] || i.role}`;
  const li = h('li', { class: 'admin__item card admin__item--row' },
    h('div', { class: 'admin__meta' },
      h('strong', { text: what }),
      i.note ? h('span', { text: i.note }) : null,
      h('span', { text: `${until(i.expiresAt)} 前有效` })),
    h('div', { class: 'admin__actions' },
      h('button', { class: 'btn btn--danger', type: 'button', onclick: revoke }, '撤销')));
  async function revoke() {
    if (!confirm('撤销之后，这个链接就不能再用了。确定吗？')) return;
    try {
      await api(`/api/admin/invites/${i.id}`, { method: 'DELETE' });
      li.remove();
      $('[data-invites-empty]').hidden = $('[data-invites]').children.length > 0;
      status('已撤销', true);
    } catch (err) {
      if (!onAuthError(err)) status(err.message);
    }
  }
  return li;
}

function userItem(u) {
  const self = me && u.id === me.id;
  const li = h('li', { class: `admin__item card${u.disabled ? ' is-hidden' : ''}` },
    h('div', { class: 'admin__meta' },
      h('strong', { text: u.displayName }),
      h('span', { text: u.username }),
      h('span', { class: `badge ${u.role === 'admin' ? 'badge--pending' : 'badge--visible'}`, text: ROLE[u.role] || u.role }),
      u.disabled ? h('span', { class: 'badge badge--hidden', text: '已停用' }) : null,
      self ? h('span', { class: 'badge', text: '你自己' }) : null),
    h('p', { class: 'admin__muted', text: `注册于 ${formatDate(u.createdAt)} · ${u.lastLoginAt ? `最近登录 ${formatDate(u.lastLoginAt)}` : '还没有登录过'} · 相册里 ${u.memories} 段回忆` }),
    h('div', { class: 'admin__actions' },
      u.disabled ? null : h('button', { class: 'btn btn--ghost', type: 'button', onclick: reset }, '生成重置密码链接'),
      self ? null : h('button', { class: u.disabled ? 'btn btn--ghost' : 'btn btn--danger', type: 'button', onclick: toggle }, u.disabled ? '重新启用' : '停用')));

  async function reset() {
    if (!confirm(`为「${u.displayName}」生成重置密码链接？\n对方用它设置新密码后，旧密码和所有设备上的登录都会失效。你不会看到对方的密码。`)) return;
    try {
      const data = await api(`/api/admin/users/${u.id}/reset`, { method: 'POST', body: {} });
      showLink(`「${u.displayName}」的重置密码链接`, linkFor(data.invite.token), data.invite.expiresAt, '请单独发给对方本人。');
      loadAccounts({ keepLink: true });
    } catch (err) {
      if (!onAuthError(err)) status(err.message);
    }
  }
  async function toggle() {
    const next = !u.disabled;
    if (next && !confirm(`停用「${u.displayName}」？\n对方会立刻在所有设备上退出，也不能再登录；已添加的相册内容会保留。之后可以重新启用。`)) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { disabled: next } });
      status(next ? '已停用' : '已重新启用', true);
      loadAccounts();
    } catch (err) {
      if (!onAuthError(err)) status(err.message);
    }
  }
  return li;
}

// ---------------- 共同相册 ----------------
let albumLimits = { title: 40, body: 800 };
const albumList = $('[data-album-list]');
const albumEmpty = $('[data-album-empty]');
$('[data-album-refresh]').addEventListener('click', () => loadAlbum());

async function loadAlbum() {
  try {
    const [data, acc] = await Promise.all([api('/api/admin/album'), api('/api/admin/accounts')]);
    users = acc.users;
    albumLimits = { ...albumLimits, ...(data.limits || {}) };
    albumList.replaceChildren(...data.memories.map(albumItem));
    albumEmpty.hidden = data.memories.length > 0;
    const photos = data.memories.reduce((n, m) => n + m.photos.length, 0);
    $('[data-album-count]').textContent = `共 ${data.memories.length} 段回忆，${photos} 张照片`;
    status('');
  } catch (err) {
    if (onAuthError(err)) return;
    albumList.replaceChildren();
    albumEmpty.hidden = true;
    status(err.code === 'album_unavailable' ? '相册存储还没有配置好（需要 R2 存储桶，见 README「共同相册」）。' : err.message);
  }
}

function albumItem(m) {
  const li = h('li', { class: 'admin__item card' });

  function show() {
    li.replaceChildren(
      h('div', { class: 'admin__meta' },
        h('strong', { text: m.title }),
        m.date ? h('span', { text: m.date }) : null,
        m.owner
          ? h('span', { class: 'badge badge--visible', text: `添加者：${m.owner.displayName}` })
          : h('span', { class: 'badge badge--pending', text: `未归属${m.legacyAuthor ? `（旧署名：${m.legacyAuthor}）` : ''}` }),
        h('span', { text: `#${m.id} · 添加于 ${formatDate(m.createdAt)}` })),
      m.photos.length
        ? h('div', { class: 'admin__thumbs' },
            m.photos.map((p, i) => h('a', { href: p.full, target: '_blank', rel: 'noopener', title: '在新标签页看大图' },
              h('img', { src: p.thumb, alt: `第 ${i + 1} 张照片`, loading: 'lazy' }))))
        : null,
      m.text ? h('p', { text: m.text }) : null,
      h('div', { class: 'admin__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: edit }, '修改文字'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: assign }, '指定归属'),
        h('button', { class: 'btn btn--danger', type: 'button', onclick: del }, '删除')));
  }

  function edit() {
    const title = h('input', { type: 'text', maxlength: albumLimits.title, value: m.title, required: true });
    const date = h('input', { type: 'date', value: m.date || '' });
    const text = h('textarea', { rows: 4, maxlength: albumLimits.body });
    text.value = m.text;
    const msg = h('p', { class: 'admin__status', role: 'status' });
    const field = (label, el) => h('label', { class: 'field' }, h('span', { class: 'field__label', text: label }), el);
    const form = h('form', { class: 'admin__edit', novalidate: true },
      field('标题', title), field('日期（可不填）', date), field('文字（可不填）', text), msg,
      h('div', { class: 'admin__actions' },
        h('button', { class: 'btn btn--primary', type: 'submit' }, '保存'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: show }, '取消')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      try {
        const data = await api(`/api/admin/album/${m.id}`, { method: 'PATCH', body: { title: title.value, date: date.value || null, text: text.value } });
        if (data.memory) Object.assign(m, data.memory);
        show();
        status('已保存', true);
      } catch (err) {
        if (!onAuthError(err)) msg.textContent = err.message;
      }
    });
    li.replaceChildren(form);
    title.focus();
  }

  function assign() {
    const select = h('select', {},
      h('option', { value: '', text: '未归属（只有管理员能管理）' }),
      users.map((u) => h('option', { value: u.id, text: `${u.displayName}（${u.username}）`, selected: m.owner?.id === u.id })));
    const msg = h('p', { class: 'admin__status', role: 'status' });
    const form = h('form', { class: 'admin__edit', novalidate: true },
      h('label', { class: 'field' }, h('span', { class: 'field__label', text: `把「${m.title}」交给：` }), select),
      h('p', { class: 'admin__muted', text: '请按你确实知道的情况指定，不要只凭署名猜测。指定之后，这个账号就可以修改和删除这段回忆。' }),
      msg,
      h('div', { class: 'admin__actions' },
        h('button', { class: 'btn btn--primary', type: 'submit' }, '确定'),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: show }, '取消')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const data = await api(`/api/admin/album/${m.id}/owner`, { method: 'PUT', body: { ownerId: select.value || null } });
        if (data.memory) Object.assign(m, data.memory);
        show();
        status('已更新归属', true);
      } catch (err) {
        if (!onAuthError(err)) msg.textContent = err.message;
      }
    });
    li.replaceChildren(form);
    select.focus();
  }

  async function del() {
    const n = m.photos.length;
    if (!confirm(`确定要永久删除「${m.title}」吗？${n ? `里面的 ${n} 张照片也会一起删除。` : ''}删除后无法恢复。`)) return;
    try {
      await api(`/api/admin/album/${m.id}`, { method: 'DELETE' });
      li.remove();
      albumEmpty.hidden = albumList.children.length > 0;
      status('已删除', true);
    } catch (err) {
      if (!onAuthError(err)) status(err.message);
    }
  }

  show();
  return li;
}

// ---------------- 公开留言 ----------------
const list = $('[data-list]');
const empty = $('[data-empty]');
const more = $('[data-more]');
const LABEL = { visible: '显示中', hidden: '已隐藏', pending: '待审核' };
let filter = '';
let cursor = null;

$$('[data-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    filter = b.dataset.filter;
    $$('[data-filter]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    load(true);
  })
);
$('[data-refresh]').addEventListener('click', () => load(true));
more.addEventListener('click', () => load(false));

async function load(reset) {
  if (reset) cursor = null;
  try {
    const q = new URLSearchParams();
    if (filter) q.set('status', filter);
    if (cursor) q.set('before', cursor);
    const data = await api(`/api/admin/messages?${q}`);
    if (reset) list.replaceChildren();
    data.messages.forEach((m) => list.append(item(m)));
    cursor = data.nextCursor;
    more.hidden = !cursor;
    empty.hidden = list.children.length > 0;
    const c = data.counts || {};
    $('[data-n="all"]').textContent = (c.visible || 0) + (c.hidden || 0) + (c.pending || 0);
    ['visible', 'hidden', 'pending'].forEach((k) => ($(`[data-n="${k}"]`).textContent = c[k] || 0));
    status('');
  } catch (err) {
    if (!onAuthError(err)) status(err.message);
  }
}

function item(m) {
  const li = h('li', { class: `admin__item card${m.status !== 'visible' ? ' is-hidden' : ''}` });
  const render = () => {
    li.className = `admin__item card${m.status !== 'visible' ? ' is-hidden' : ''}`;
    li.replaceChildren(
      h('div', { class: 'admin__meta' },
        h('strong', { text: m.nickname }),
        h('span', { text: formatDate(m.created_at) }),
        h('span', { class: `badge badge--${m.status}`, text: LABEL[m.status] || m.status }),
        h('span', { title: '同一访问者的匿名标识（加盐哈希）', text: `#${m.id} · 来源 ${m.sender || '-'}` })),
      h('p', { text: m.content }),
      h('div', { class: 'admin__actions' },
        m.status === 'visible'
          ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => setStatus('hidden') }, '隐藏')
          : h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => setStatus('visible') }, '显示'),
        h('button', { class: 'btn btn--danger', type: 'button', onclick: del }, '删除')));
  };
  async function setStatus(s) {
    try {
      await api(`/api/admin/messages/${m.id}`, { method: 'PATCH', body: { status: s } });
      m.status = s;
      render();
      status(s === 'visible' ? '已设为公开显示' : '已隐藏', true);
    } catch (err) {
      if (!onAuthError(err)) status(err.message);
    }
  }
  async function del() {
    if (!confirm(`确定要永久删除「${m.nickname}」的这条留言吗？删除后无法恢复。`)) return;
    try {
      await api(`/api/admin/messages/${m.id}`, { method: 'DELETE' });
      li.remove();
      empty.hidden = list.children.length > 0;
      status('已删除', true);
    } catch (err) {
      if (!onAuthError(err)) status(err.message);
    }
  }
  render();
  return li;
}

boot();
