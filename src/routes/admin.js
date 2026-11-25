// 留言管理：只有管理员账号可以操作（不再有单独的后台密码）。
import { HttpError, json, readJson, assertSameOrigin } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';

const STATUSES = ['visible', 'hidden', 'pending'];

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
