// 账号会话：Cookie 里放随机令牌（HttpOnly），数据库只存它的 SHA-256 摘要。
// 可以随时在服务器端吊销（退出登录、修改密码、重置密码、停用账号）。
import { HttpError } from './http.js';
import { buildCookie, getCookie, b64url } from './security.js';

export const SESSION_COOKIE = 'bd_session';
const COOKIE_PATH = '/api';
const SESSION_DAYS = 30;
const TOUCH_EVERY = 6 * 3600_000;

const enc = new TextEncoder();
export async function sha256Hex(text) {
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

export function requireDb(env) {
  if (!env.DB) throw new HttpError(503, 'db_unavailable', '服务暂时不可用，请稍后再试');
  return env.DB;
}

/** 新建会话，返回要写入响应的 Set-Cookie 值。 */
export async function startSession(request, env, userId) {
  const db = requireDb(env);
  const token = newToken();
  const now = Date.now();
  const maxAge = SESSION_DAYS * 86400;
  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, now, now + maxAge * 1000, now)
    .run();
  if (Math.random() < 0.05) await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  return buildCookie(request, SESSION_COOKIE, token, { path: COOKIE_PATH, maxAge, sameSite: 'Lax' });
}

export function clearSessionCookie(request) {
  return buildCookie(request, SESSION_COOKIE, '', { path: COOKIE_PATH, maxAge: 0, sameSite: 'Lax' });
}

async function sessionId(request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length < 20 || token.length > 200) return null;
  return sha256Hex(token);
}

export async function endSession(request, env) {
  const id = await sessionId(request);
  if (id && env.DB) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}

/** 吊销某个账号的全部会话（可保留当前这一个）。 */
export async function endUserSessions(env, userId, exceptRequest = null) {
  const keep = exceptRequest ? await sessionId(exceptRequest) : null;
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').bind(userId, keep).run();
}

const cache = new WeakMap();

/** 当前登录的账号；没有登录、会话过期或账号被停用时返回 null。 */
export function currentUser(request, env) {
  if (!cache.has(request)) cache.set(request, lookup(request, env));
  return cache.get(request);
}

async function lookup(request, env) {
  if (!env.DB) return null;
  const id = await sessionId(request);
  if (!id) return null;
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT s.id AS sid, s.last_seen, u.id, u.username, u.display_name, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0`
  ).bind(id, now).first();
  if (!row) return null;
  if (now - row.last_seen > TOUCH_EVERY) {
    await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').bind(now, row.sid).run();
  }
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role };
}

export async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'login_required', '请先登录');
  return user;
}

export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== 'admin') throw new HttpError(403, 'admin_only', '只有管理员可以做这件事');
  return user;
}

export const publicUser = (u) => u && { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
