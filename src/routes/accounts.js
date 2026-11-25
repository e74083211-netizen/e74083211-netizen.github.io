// 管理员：管理账号、生成邀请链接和重置密码链接。
// 管理员永远看不到任何人的密码（数据库里本来就只有哈希）。
import { HttpError, json, readJson, assertSameOrigin } from '../lib/http.js';
import { requireAdmin, sha256Hex, newToken, endUserSessions } from '../lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = 86_400_000;

function cleanNote(v) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
}

export async function overview(request, env) {
  await requireAdmin(request, env);
  const now = Date.now();
  const [users, invites] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.disabled, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM album_memories m WHERE m.owner_id = u.id) AS memories
       FROM users u ORDER BY u.created_at`
    ).all(),
    env.DB.prepare(
      `SELECT i.id, i.kind, i.role, i.note, i.created_at, i.expires_at, u.display_name AS for_name
       FROM invites i LEFT JOIN users u ON u.id = i.user_id
       WHERE i.used_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC`
    ).bind(now).all(),
  ]);
  return json({
    ok: true,
    users: users.results.map((u) => ({
      id: u.id, username: u.username, displayName: u.display_name, role: u.role, disabled: !!u.disabled,
      createdAt: u.created_at, lastLoginAt: u.last_login_at, memories: u.memories,
    })),
    invites: invites.results.map((i) => ({
      id: i.id, kind: i.kind, role: i.role, note: i.note, forName: i.for_name, createdAt: i.created_at, expiresAt: i.expires_at,
    })),
  });
}

/** 生成邀请注册链接。令牌只在这一次返回，之后谁也看不到（数据库里只有摘要）。 */
export async function createInvite(request, env) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, env);
  const body = await readJson(request, 1024);
  const days = Math.min(Math.max(parseInt(body.days, 10) || 7, 1), 30);
  const token = newToken();
  const now = Date.now();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO invites (id, token_hash, kind, role, note, created_by, created_at, expires_at)
     VALUES (?, ?, 'register', 'member', ?, ?, ?, ?)`
  ).bind(id, await sha256Hex(token), cleanNote(body.note), admin.id, now, now + days * DAY).run();
  return json({ ok: true, invite: { id, token, kind: 'register', expiresAt: now + days * DAY } }, 201);
}

export async function revokeInvite(request, env, id) {
  assertSameOrigin(request);
  await requireAdmin(request, env);
  if (!UUID.test(id)) throw new HttpError(400, 'bad_id', '编号不正确');
  const res = await env.DB.prepare('DELETE FROM invites WHERE id = ? AND used_at IS NULL').bind(id).run();
  if (!res.meta?.changes) throw new HttpError(404, 'not_found', '这个链接不存在或已经用过了');
  return json({ ok: true });
}

/** 为某个账号生成重置密码链接（24 小时内有效，一次性）。旧的未用重置链接作废。 */
export async function createReset(request, env, userId) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, env);
  if (!UUID.test(userId)) throw new HttpError(400, 'bad_id', '编号不正确');
  const user = await env.DB.prepare('SELECT id, disabled FROM users WHERE id = ?').bind(userId).first();
  if (!user) throw new HttpError(404, 'not_found', '没有这个账号');
  if (user.disabled) throw new HttpError(400, 'disabled', '这个账号已停用，请先启用');
  const token = newToken();
  const now = Date.now();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM invites WHERE kind = 'reset' AND user_id = ? AND used_at IS NULL`).bind(userId),
    env.DB.prepare(
      `INSERT INTO invites (id, token_hash, kind, role, user_id, created_by, created_at, expires_at)
       VALUES (?, ?, 'reset', 'member', ?, ?, ?, ?)`
    ).bind(id, await sha256Hex(token), userId, admin.id, now, now + DAY),
  ]);
  return json({ ok: true, invite: { id, token, kind: 'reset', expiresAt: now + DAY } }, 201);
}

/** 停用 / 启用账号。停用会立刻让这个账号在所有设备上退出。 */
export async function setDisabled(request, env, userId) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, env);
  if (!UUID.test(userId)) throw new HttpError(400, 'bad_id', '编号不正确');
  if (userId === admin.id) throw new HttpError(400, 'self', '不能停用你自己的账号');
  const body = await readJson(request, 256);
  const disabled = body.disabled === true;
  const res = await env.DB.prepare('UPDATE users SET disabled = ? WHERE id = ?').bind(disabled ? 1 : 0, userId).run();
  if (!res.meta?.changes) throw new HttpError(404, 'not_found', '没有这个账号');
  if (disabled) await endUserSessions(env, userId);
  return json({ ok: true, disabled });
}
