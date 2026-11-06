// 留言管理后台：使用独立的 ADMIN_PASSWORD 和独立的 Cookie，与私密区域口令完全分开。
import { HttpError, json, fail, readJson, assertSameOrigin, sleep } from '../lib/http.js';
import {
  configStatus,
  issueToken,
  verifyToken,
  getCookie,
  buildCookie,
  clientId,
  rateStatus,
  rateHit,
  safeEqual,
} from '../lib/security.js';

const COOKIE = 'bd_admin';
const COOKIE_PATH = '/api/admin';
const SCOPE = 'admin';
const TTL = 4 * 3600;
const STATUSES = ['visible', 'hidden', 'pending'];

function requireConfigured(env) {
  if (!configStatus(env).admin) {
    throw new HttpError(
      503,
      'admin_not_configured',
      '后台未配置：需要设置 ADMIN_PASSWORD（至少 8 位，且不能与访问口令相同）和 SESSION_SECRET'
    );
  }
}

async function requireAdmin(request, env) {
  requireConfigured(env);
  const ok = await verifyToken(env, SCOPE, env.ADMIN_PASSWORD, getCookie(request, COOKIE));
  if (!ok) throw new HttpError(401, 'admin_required', '请先登录后台');
}

export async function login(request, env) {
  assertSameOrigin(request);
  requireConfigured(env);
  const cid = await clientId(request, env);
  const key = `admin:${cid}`;
  const s = await rateStatus(env.DB, key, 5);
  if (s.blocked) {
    return fail(429, 'rate_limited', '尝试次数太多了，请稍后再试', { retryAfter: s.retryAfter });
  }
  const body = await readJson(request, 1024);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password && (await safeEqual(password, env.ADMIN_PASSWORD))) {
    const token = await issueToken(env, SCOPE, env.ADMIN_PASSWORD, TTL);
    return json({ ok: true }, 200, {
      'Set-Cookie': buildCookie(request, COOKIE, token, { path: COOKIE_PATH, maxAge: TTL, sameSite: 'Strict' }),
    });
  }
  await rateHit(env.DB, key, 15 * 60_000);
  await sleep(400 + Math.random() * 300);
  return fail(401, 'wrong_password', '密码不正确');
}

export async function logout(request) {
  assertSameOrigin(request);
  return json({ ok: true }, 200, {
    'Set-Cookie': buildCookie(request, COOKIE, '', { path: COOKIE_PATH, maxAge: 0, sameSite: 'Strict' }),
  });
}

export async function session(request, env) {
  const status = configStatus(env);
  let loggedIn = false;
  if (status.admin) loggedIn = await verifyToken(env, SCOPE, env.ADMIN_PASSWORD, getCookie(request, COOKIE));
  return json({ ok: true, configured: status.admin, loggedIn, moderation: status.moderation });
}

export async function list(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const filter = STATUSES.includes(status) ? status : null;
  const before = parseInt(url.searchParams.get('before'), 10) || null;
  const { results } = await env.DB.prepare(
    `SELECT id, nickname, content, status, created_at, substr(ip_hash, 1, 6) AS sender
     FROM messages
     WHERE (?1 IS NULL OR status = ?1) AND (?2 IS NULL OR id < ?2)
     ORDER BY id DESC LIMIT 100`
  )
    .bind(filter, before)
    .all();
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM messages GROUP BY status').all();
  return json({
    ok: true,
    messages: results,
    counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])),
    nextCursor: results.length === 100 ? results[results.length - 1].id : null,
  });
}

function parseId(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'bad_id', '留言编号不正确');
  return id;
}

export async function update(request, env, rawId) {
  assertSameOrigin(request);
  await requireAdmin(request, env);
  const id = parseId(rawId);
  const body = await readJson(request, 512);
  if (!['visible', 'hidden'].includes(body.status)) throw new HttpError(400, 'bad_status', '状态不正确');
  const res = await env.DB.prepare('UPDATE messages SET status = ? WHERE id = ?').bind(body.status, id).run();
  if (!res.meta?.changes) throw new HttpError(404, 'not_found', '留言不存在');
  return json({ ok: true, id, status: body.status });
}

export async function remove(request, env, rawId) {
  assertSameOrigin(request);
  await requireAdmin(request, env);
  const id = parseId(rawId);
  const res = await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
  if (!res.meta?.changes) throw new HttpError(404, 'not_found', '留言不存在');
  return json({ ok: true, id });
}
