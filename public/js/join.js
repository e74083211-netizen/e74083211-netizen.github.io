// 邀请注册 / 重置密码页面。链接形如 /join/#<令牌>：
// 令牌放在 # 后面，不会出现在服务器日志或来源（Referer）里；打开后立刻从地址栏抹掉。
import { C, $, h, api } from './util.js';
import { passwordInput, passwordProblem } from './account.js';
import { initCity } from './city.js';

// 和主页同一座城市，直接亮灯（不需要开场）
if (C.features?.cityScene !== false) initCity({ rain: C.features?.rain !== false, lit: true });

const card = $('[data-card]');
const KEY = 'bd:join-token';
const name = C.recipient?.name || '';
$('[data-seal]').textContent = C.recipient?.sealLetter || '✦';

function takeToken() {
  const fromHash = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
  if (fromHash) {
    try { sessionStorage.setItem(KEY, fromHash); } catch { /* 忽略 */ }
    history.replaceState(null, '', location.pathname);
    return fromHash;
  }
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}
const forgetToken = () => { try { sessionStorage.removeItem(KEY); } catch { /* 忽略 */ } };

function show(...children) {
  card.replaceChildren(h('div', { class: 'gate__seal', 'aria-hidden': 'true' }, h('span', { text: C.recipient?.sealLetter || '✦' })), ...children);
}

function problem(title, text) {
  show(
    h('p', { class: 'join__eyebrow', text: 'Oops' }),
    h('h1', { text: title }),
    h('p', { class: 'join__lead', text }),
    h('div', { class: 'join__done' }, h('a', { class: 'btn btn--ink', href: '/' }, '回到生日页面')));
}

const fmt = (ms) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function field(label, control, hint) {
  const err = h('p', { class: 'join__err', role: 'alert' });
  const el = h('label', { class: 'pfield' },
    h('span', { class: 'pfield__label' }, h('span', { text: label }), hint ? h('em', { class: 'join__hint', text: hint }) : null),
    control);
  return { el: h('div', {}, el, err), err };
}

function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}
function meterFor(input) {
  const bar = h('i');
  const meter = h('div', { class: 'join__meter', 'aria-hidden': 'true' }, bar);
  const colors = ['#c9a78a', '#c98a6a', '#d4a24e', '#8ea66a', '#55703a'];
  input.addEventListener('input', () => {
    const s = input.value ? strength(input.value) : 0;
    bar.style.setProperty('--w', `${input.value ? (s + 1) * 20 : 0}%`);
    bar.style.setProperty('--c', colors[s]);
  });
  return meter;
}

function done(user, role) {
  forgetToken();
  const admin = role === 'admin' || user?.role === 'admin';
  show(
    h('p', { class: 'join__eyebrow', text: 'All set' }),
    h('h1', { text: `好了，${user?.displayName || ''}` }),
    h('p', { class: 'join__lead', text: admin
      ? '你的管理员账号已经建好，也已经登录了。\n以后用刚才设置的用户名和密码登录就可以。'
      : '账号已经建好，也已经登录了。\n以后再来，用刚才设置的用户名和密码登录就可以。' }),
    h('div', { class: 'join__done' },
      admin ? h('a', { class: 'btn btn--ink', href: '/admin/' }, '进入管理后台') : null,
      h('a', { class: admin ? 'btn btn--plain' : 'btn btn--ink', href: '/#private' }, admin ? '去看生日页面' : '进去看看')));
}

function registerForm(info, token) {
  const admin = info.role === 'admin';
  const username = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', maxlength: 20, required: true, placeholder: '例如 xiaoming' });
  const display = h('input', { type: 'text', autocomplete: 'nickname', maxlength: 20, required: true, placeholder: '例如 小林' });
  const pw = passwordInput({ required: true, placeholder: '至少 8 位' });
  const pw2 = passwordInput({ required: true, placeholder: '再输一次' });
  const f1 = field('用户名', username, '登录时用');
  const f2 = field('称呼', display, '相册里显示的名字');
  const f3 = field('密码', h('div', {}, pw.wrap, meterFor(pw.input)));
  const f4 = field('确认密码', pw2.wrap);
  const status = h('p', { class: 'join__status', role: 'status' });
  const submit = h('button', { class: 'btn btn--ink', type: 'submit' }, admin ? '创建管理员账号' : '创建账号并进入');
  const form = h('form', { class: 'join__form', novalidate: true }, f1.el, f2.el, f3.el, f4.el, status, submit);

  const clear = () => [f1, f2, f3, f4].forEach((f) => (f.err.textContent = ''));
  function check() {
    clear();
    let ok = true;
    const u = username.value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/.test(u)) {
      f1.err.textContent = '3–20 位，只能用英文字母、数字和 _ . -，并以字母或数字开头';
      ok = false;
    }
    if (!display.value.trim()) { f2.err.textContent = '写一个想让大家看到的称呼吧'; ok = false; }
    const p = passwordProblem(pw.input.value, undefined, u);
    if (p) { f3.err.textContent = p; ok = false; }
    else if (pw.input.value !== pw2.input.value) { f4.err.textContent = '两次输入的密码不一样'; ok = false; }
    return ok;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    if (!check()) return form.querySelector('.join__err:not(:empty)')?.previousElementSibling?.querySelector('input')?.focus();
    submit.disabled = true;
    submit.classList.add('is-busy');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: { token, username: username.value.trim(), displayName: display.value.trim(), password: pw.input.value },
      });
      done(data.user, info.role);
    } catch (err) {
      if (err.code === 'username_taken') { f1.err.textContent = err.message; username.focus(); }
      else if (err.code === 'weak_password') { f3.err.textContent = err.message; pw.input.focus(); }
      else if (err.code === 'invite_invalid') problem('这个链接不能用了', err.message);
      else status.textContent = err.message;
    } finally {
      submit.disabled = false;
      submit.classList.remove('is-busy');
    }
  });

  show(
    h('p', { class: 'join__eyebrow', text: admin ? 'Set up' : 'Welcome' }),
    h('h1', { text: admin ? '设置你的管理员账号' : name ? `欢迎来到 ${name} 的生日` : '欢迎你' }),
    h('p', { class: 'join__lead', text: admin
      ? '这是网站作者专用的账号，可以管理留言、相册和邀请。\n用户名和密码由你自己决定，任何人（包括网站本身）都看不到你的密码。'
      : '这里有一些只给你们看的照片和文字。\n给自己设一个账号吧——以后用它登录，就能看到这些内容，也能往相册里添照片。' }),
    form,
    h('p', { class: 'join__foot' }, `这个邀请链接只能用一次，${fmt(info.expiresAt)} 前有效。`));
  username.focus();
}

function resetForm(info, token) {
  const pw = passwordInput({ required: true, placeholder: '至少 8 位' });
  const pw2 = passwordInput({ required: true, placeholder: '再输一次' });
  const f1 = field('新密码', h('div', {}, pw.wrap, meterFor(pw.input)));
  const f2 = field('确认新密码', pw2.wrap);
  const status = h('p', { class: 'join__status', role: 'status' });
  const submit = h('button', { class: 'btn btn--ink', type: 'submit' }, '设置新密码并进入');
  const form = h('form', { class: 'join__form', novalidate: true },
    h('input', { type: 'text', autocomplete: 'username', value: info.account.username, hidden: true, readonly: true }),
    f1.el, f2.el, status, submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f1.err.textContent = f2.err.textContent = status.textContent = '';
    const p = passwordProblem(pw.input.value, undefined, info.account.username);
    if (p) return (f1.err.textContent = p), pw.input.focus();
    if (pw.input.value !== pw2.input.value) return (f2.err.textContent = '两次输入的密码不一样'), pw2.input.focus();
    submit.disabled = true;
    submit.classList.add('is-busy');
    try {
      const data = await api('/api/auth/reset', { method: 'POST', body: { token, password: pw.input.value } });
      done(data.user);
    } catch (err) {
      if (err.code === 'weak_password') f1.err.textContent = err.message;
      else if (err.code === 'invite_invalid') problem('这个链接不能用了', err.message);
      else status.textContent = err.message;
    } finally {
      submit.disabled = false;
      submit.classList.remove('is-busy');
    }
  });

  show(
    h('p', { class: 'join__eyebrow', text: 'New password' }),
    h('h1', { text: `给「${info.account.displayName}」设置新密码` }),
    h('p', { class: 'join__lead', text: `用户名还是 ${info.account.username}，只换密码。\n设置好之后，其他设备上的旧登录会自动退出。` }),
    form,
    h('p', { class: 'join__foot' }, `这个链接只能用一次，${fmt(info.expiresAt)} 前有效。`));
  pw.input.focus();
}

async function start() {
  const token = takeToken();
  if (!token) {
    problem('没有找到邀请', '请直接点开网站作者发给你的完整链接。\n如果是复制的，请确认 # 后面的部分也一起复制了。');
    return;
  }
  try {
    const info = await api('/api/auth/invite', { method: 'POST', body: { token } });
    info.kind === 'reset' ? resetForm(info, token) : registerForm(info, token);
  } catch (err) {
    if (err.code === 'invite_invalid') forgetToken();
    problem(err.code === 'invite_invalid' ? '这个链接不能用了' : '暂时打不开', err.message);
  }
}

start();
