import { $, $$, h, api, formatDate } from '/js/util.js';

const loginBox = $('[data-login]');
const panel = $('[data-panel]');
const logoutBtn = $('[data-logout]');
const list = $('[data-list]');
const empty = $('[data-empty]');
const more = $('[data-more]');
const globalStatus = $('[data-global-status]');
let filter = '';
let cursor = null;

const LABEL = { visible: '显示中', hidden: '已隐藏', pending: '待审核' };

function status(msg, ok = false) {
  globalStatus.textContent = msg || '';
  globalStatus.classList.toggle('is-ok', ok);
}

async function boot() {
  try {
    const s = await api('/api/admin/session');
    if (!s.configured) {
      status('后台未配置：请设置 ADMIN_PASSWORD（至少 8 位，且与访问口令不同）和 SESSION_SECRET。');
      return;
    }
    $('[data-mode]').textContent =
      s.moderation === 'pre' ? '当前模式：先审后发（新留言需要你点「显示」后才会公开）' : '当前模式：直接公开（可随时隐藏或删除）';
    s.loggedIn ? showPanel() : showLogin();
  } catch (e) {
    status(e.code === 'no_backend' ? '需要后端服务才能使用后台（请用 npm run dev 或部署后的网址）' : e.message);
  }
}

function showLogin() {
  loginBox.hidden = false;
  panel.hidden = true;
  logoutBtn.hidden = true;
  $('[data-login-form] input').focus();
}

function showPanel() {
  loginBox.hidden = true;
  panel.hidden = false;
  logoutBtn.hidden = false;
  load(true);
}

$('[data-login-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = e.target.elements.password;
  const st = $('[data-login-status]');
  st.textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: { password: input.value } });
    input.value = '';
    showPanel();
  } catch (err) {
    st.textContent = err.data?.retryAfter ? `尝试次数太多，请 ${Math.ceil(err.data.retryAfter / 60)} 分钟后再试` : err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
  list.replaceChildren();
  showLogin();
});

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
    if (err.status === 401) return showLogin();
    status(err.message);
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
        h('button', { class: 'btn btn--danger', type: 'button', onclick: del }, '删除'))
    );
  };
  async function setStatus(s) {
    try {
      await api(`/api/admin/messages/${m.id}`, { method: 'PATCH', body: { status: s } });
      m.status = s;
      render();
      status(s === 'visible' ? '已设为公开显示' : '已隐藏', true);
    } catch (err) {
      if (err.status === 401) return showLogin();
      status(err.message);
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
      if (err.status === 401) return showLogin();
      status(err.message);
    }
  }
  render();
  return li;
}

boot();
