// 登录、退出、修改密码、通过邀请链接注册、通过重置链接设置新密码。
// 只能凭邀请注册；邀请和重置链接都是一次性、会过期的，服务器只保存令牌摘要。
import { HttpError, json, fail, readJson, assertSameOrigin, sleep } from '../lib/http.js';
import { clientId, rateStatus, rateHit } from '../lib/security.js';
import { hashPassword, verifyPassword, burnTime } from '../lib/password.js';
import {
  requireDb, startSession, endSession, endUserSessions, clearSessionCookie,
  currentUser, requireUser, sha256Hex, publicUser,
} from '../lib/auth.js';

const WINDOW = 15 * 60_000;
export const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/;
const COMMON = new Set(['12345678', '123456789', '1234567890', '87654321', '11111111', '88888888', '00000000', 'password', 'password1', 'qwertyui', 'qwerty123', 'abcdefgh', 'abc12345', 'iloveyou', 'a1234567', '1qaz2wsx', 'woaini1314', '5201314a']);
const len = (s) => [...s].length;

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, '').replace(/\s+/g, ' ').trim();
}

export function checkPassword(password, username = '') {
  if (typeof password !== 'string' || len(password) < 8) throw new HttpError(400, 'weak_password', '密码至少要 8 位');
  if (len(password) > 128) throw new HttpError(400, 'weak_password', '密码太长了（最多 128 位）');
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    throw new HttpError(400, 'weak_password', '密码里不要包含用户名');
  }
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
    throw new HttpError(400, 'weak_password', '这个密码太常见了，换一个只有你知道的吧');
  }
}

function readAccountFields(body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const displayName = cleanName(body.displayName);
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'bad_username', '用户名要 3–20 位，只能用英文字母、数字和 _ . -，并以字母或数字开头');
  }
  if (!displayName) throw new HttpError(400, 'name_required', '写一个想让大家看到的称呼吧');
  if (len(displayName) > 20) throw new HttpError(400, 'name_too_long', '称呼最多 20 个字');
  checkPassword(body.password, username);
  return { username, displayName, password: body.password };
}

async function guard(env, keys, message) {
  const states = await Promise.all(keys.map(([k, limit]) => rateStatus(env.DB, k, limit)));
  const blocked = states.filter((s) => s.blocked);
  if (blocked.length) {
    const retryAfter = Math.max(...blocked.map((s) => s.retryAfter || 0));
    throw new HttpError(429, 'rate_limited', message, { retryAfter });
  }
}
const hitAll = (env, keys) => Promise.all(keys.map(([k]) => rateHit(env.DB, k, WINDOW)));

// ---------------- 当前状态 ----------------

export async function me(request, env) {
  const user = await currentUser(request, env);
  return json({ ok: true, configured: !!env.DB, user: publicUser(user) });
}

// ---------------- 登录 / 退出 ----------------

export async function login(request, env) {
  assertSameOrigin(request);
  const db = requireDb(env);
  const body = await readJson(request, 1024);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return fail(400, 'missing', '请填写用户名和密码');

  const cid = await clientId(request, env);
  const keys = [[`login:ip:${cid}`, 10], [`login:user:${username.toLowerCase().slice(0, 40)}`, 10], ['login:global', 200]];
  await guard(env, keys, '尝试次数太多了，请 15 分钟后再试');

  const user = await db
    .prepare('SELECT id, username, display_name, role, password_hash, disabled FROM users WHERE username = ? COLLATE NOCASE')
    .bind(username)
    .first();
  const ok = user ? await verifyPassword(password, user.password_hash) : (await burnTime(password), false);

  if (!ok || user.disabled) {
    await hitAll(env, keys);
    await sleep(250 + Math.random() * 250);
    // 不区分“用户名不存在”和“密码错误”，避免被用来探测账号
    return fail(401, 'bad_login', user?.disabled && ok ? '这个账号已被停用，请联系网站作者' : '用户名或密码不对');
  }

  await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  const cookie = await startSession(request, env, user.id);
  return json(
    { ok: true, user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } },
    200,
    { 'Set-Cookie': cookie }
  );
}

export async function logout(request, env) {
  assertSameOrigin(request);
  await endSession(request, env);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
}

// ---------------- 修改密码 ----------------

export async function changePassword(request, env) {
  assertSameOrigin(request);
  const me = await requireUser(request, env);
  const body = await readJson(request, 1024);
  const keys = [[`pwchange:${me.id}`, 5]];
  await guard(env, keys, '尝试次数太多了，请 15 分钟后再试');

  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(me.id).first();
  if (!row || !(await verifyPassword(String(body.current || ''), row.password_hash))) {
    await hitAll(env, keys);
    throw new HttpError(401, 'bad_current', '现在的密码不对');
  }
  checkPassword(body.next, me.username);
  if (body.next === body.current) throw new HttpError(400, 'same_password', '新密码和现在的一样');

  await env.DB.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?')
    .bind(await hashPassword(body.next), Date.now(), me.id)
    .run();
  // 其它设备上的登录全部失效，只保留当前这一个
  await endUserSessions(env, me.id, request);
  return json({ ok: true });
}

// ---------------- 邀请 / 重置链接 ----------------

async function findInvite(env, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const row = await env.DB.prepare(
    `SELECT i.id, i.kind, i.role, i.user_id, i.expires_at, i.used_at, u.username, u.display_name, u.disabled
     FROM invites i LEFT JOIN users u ON u.id = i.user_id
     WHERE i.token_hash = ?`
  ).bind(await sha256Hex(token)).first();
  if (!row) return null;
  if (row.used_at || row.expires_at <= Date.now()) return { ...row, invalid: row.used_at ? 'used' : 'expired' };
  if (row.kind === 'reset' && (!row.user_id || !row.username || row.disabled)) return { ...row, invalid: 'gone' };
  return row;
}

async function resolveInvite(request, env, token, kind) {
  const cid = await clientId(request, env);
  const keys = [[`invite:ip:${cid}`, 20]];
  await guard(env, keys, '尝试次数太多了，请 15 分钟后再试');
  const inv = await findInvite(env, token);
  if (!inv || inv.invalid || (kind && inv.kind !== kind)) {
    if (!inv) await hitAll(env, keys);
    const msg = inv?.invalid === 'used' ? '这个链接已经用过了。如果需要，请向网站作者要一个新的。'
      : inv?.invalid === 'expired' ? '这个链接已经过期了，请向网站作者要一个新的。'
      : '这个链接无效。请确认复制完整，或者向网站作者要一个新的。';
    throw new HttpError(410, 'invite_invalid', msg);
  }
  return inv;
}

/** 打开链接时先检查是否有效，告诉页面该显示“注册”还是“设置新密码”。 */
export async function inspectInvite(request, env) {
  assertSameOrigin(request);
  requireDb(env);
  const body = await readJson(request, 1024);
  const inv = await resolveInvite(request, env, body.token);
  return json({
    ok: true,
    kind: inv.kind,
    role: inv.role,
    expiresAt: inv.expires_at,
    account: inv.kind === 'reset' ? { username: inv.username, displayName: inv.display_name } : null,
  });
}

export async function register(request, env) {
  assertSameOrigin(request);
  const db = requireDb(env);
  const body = await readJson(request, 2048);
  const inv = await resolveInvite(request, env, body.token, 'register');
  const f = readAccountFields(body);

  const taken = await db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(f.username).first();
  if (taken) throw new HttpError(409, 'username_taken', '这个用户名已经有人用了，换一个吧');

  const id = crypto.randomUUID();
  const now = Date.now();
  const hash = await hashPassword(f.password);
  let results;
  try {
    // 同一个事务里：只有邀请仍然有效时才建号，并把邀请标记为已使用（防止同一链接被并发用两次）
    results = await db.batch([
      db.prepare(
        `INSERT INTO users (id, username, display_name, password_hash, role, created_at, password_changed_at, last_login_at)
         SELECT ?, ?, ?, ?, role, ?, ?, ? FROM invites WHERE id = ? AND kind = 'register' AND used_at IS NULL AND expires_at > ?`
      ).bind(id, f.username, f.displayName, hash, now, now, now, inv.id, now),
      db.prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL').bind(now, id, inv.id),
    ]);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) throw new HttpError(409, 'username_taken', '这个用户名已经有人用了，换一个吧');
    throw err;
  }
  if (!results[0].meta?.changes) throw new HttpError(410, 'invite_invalid', '这个链接刚刚已经被用过了，请向网站作者要一个新的。');

  const cookie = await startSession(request, env, id);
  return json(
    { ok: true, user: { id, username: f.username, displayName: f.displayName, role: inv.role } },
    201,
    { 'Set-Cookie': cookie }
  );
}

export async function resetPassword(request, env) {
  assertSameOrigin(request);
  const db = requireDb(env);
  const body = await readJson(request, 1024);
  const inv = await resolveInvite(request, env, body.token, 'reset');
  checkPassword(body.password, inv.username);

  const now = Date.now();
  const hash = await hashPassword(body.password);
  const results = await db.batch([
    db.prepare(
      `UPDATE users SET password_hash = ?, password_changed_at = ?
       WHERE id = ? AND disabled = 0 AND EXISTS (SELECT 1 FROM invites WHERE id = ? AND used_at IS NULL AND expires_at > ?)`
    ).bind(hash, now, inv.user_id, inv.id, now),
    db.prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL').bind(now, inv.user_id, inv.id),
    // 重置密码后，所有设备上的旧登录都失效
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(inv.user_id),
  ]);
  if (!results[0].meta?.changes) throw new HttpError(410, 'invite_invalid', '这个链接刚刚已经被用过了，请向网站作者要一个新的。');

  const cookie = await startSession(request, env, inv.user_id);
  return json(
    { ok: true, user: { id: inv.user_id, username: inv.username, displayName: inv.display_name } },
    200,
    { 'Set-Cookie': cookie }
  );
}
