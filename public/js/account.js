// 账号相关的小组件：修改密码窗口、带“显示/隐藏”的密码输入框。
import { h, api, toast } from './util.js';

const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M4 4l16 16"/></svg>';

/** 密码输入框 + 显示/隐藏按钮。返回 { wrap, input }。 */
export function passwordInput(attrs = {}) {
  const input = h('input', { type: 'password', autocomplete: 'new-password', autocapitalize: 'off', spellcheck: 'false', ...attrs });
  const eye = h('button', { class: 'pw__eye', type: 'button', 'aria-label': '显示密码', 'aria-pressed': 'false' });
  eye.innerHTML = EYE;
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    input.focus();
  });
  return { wrap: h('span', { class: 'pw' }, input, eye), input };
}

/** 前端先做一遍和服务器相同的基本检查，给出即时提示（服务器仍会再检查一次）。 */
export function passwordProblem(pw, confirm, username = '') {
  if ([...pw].length < 8) return '密码至少要 8 位';
  if ([...pw].length > 128) return '密码太长了（最多 128 位）';
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return '密码里不要包含用户名';
  if (/^(.)\1+$/.test(pw)) return '这个密码太简单了';
  if (confirm !== undefined && pw !== confirm) return '两次输入的密码不一样';
  return '';
}

export function openPasswordSheet() {
  if (document.querySelector('.sheet')) return;
  const lastFocus = document.activeElement;
  const cur = passwordInput({ autocomplete: 'current-password', required: true });
  const next = passwordInput({ required: true });
  const again = passwordInput({ required: true });
  const status = h('p', { class: 'composer__status', role: 'status', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn btn--ink', type: 'submit' }, '保存新密码');
  const field = (label, ctl, hint) => h('label', { class: 'pfield' },
    h('span', { class: 'pfield__label' }, h('span', { text: label }), hint ? h('em', { class: 'pfield__count', text: hint }) : null), ctl);

  const form = h('form', { class: 'composer composer--small paper', novalidate: true },
    h('div', { class: 'composer__head' },
      h('h3', { id: 'pw-title', text: '修改密码' }),
      h('button', { class: 'composer__close', type: 'button', 'aria-label': '关闭', onclick: () => close() },
        h('span', { 'aria-hidden': 'true', text: '×' }))),
    h('div', { class: 'composer__scroll' },
      field('现在的密码', cur.wrap),
      field('新密码', next.wrap, '至少 8 位'),
      field('再输一次新密码', again.wrap),
      h('p', { class: 'composer__note', text: '改好之后，其他手机或电脑上的登录会自动退出，需要用新密码重新登录。' })),
    h('div', { class: 'composer__foot' }, status,
      h('div', { class: 'composer__actions' },
        h('button', { class: 'btn btn--plain', type: 'button', onclick: () => close() }, '取消'), submit)));
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pw-title' }, form);

  const setStatus = (m, kind = 'error') => {
    status.textContent = m || '';
    status.className = `composer__status${m ? ` is-${kind}` : ''}`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!cur.input.value) return setStatus('先填写现在的密码'), cur.input.focus();
    const problem = passwordProblem(next.input.value, again.input.value);
    if (problem) return setStatus(problem), next.input.focus();
    submit.disabled = true;
    submit.classList.add('is-busy');
    setStatus('');
    try {
      await api('/api/auth/password', { method: 'POST', body: { current: cur.input.value, next: next.input.value } });
      close();
      toast('密码已经改好了');
    } catch (err) {
      setStatus(err.status === 429 ? '尝试次数太多了，请 15 分钟后再试' : err.message);
    } finally {
      submit.disabled = false;
      submit.classList.remove('is-busy');
    }
  });

  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    sheet.remove();
    document.body.classList.remove('is-locked');
    document.removeEventListener('keydown', onKey);
    lastFocus?.focus?.({ preventScroll: true });
  }
  sheet.addEventListener('mousedown', (e) => e.target === sheet && close());
  document.addEventListener('keydown', onKey);
  document.body.append(sheet);
  document.body.classList.add('is-locked');
  cur.input.focus();
}
