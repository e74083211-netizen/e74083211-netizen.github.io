// 私人回忆的收藏（小星星）：只有登录的账号可以收藏，收藏记录在账号名下，换设备也在。
import { HttpError, json, readJson, assertSameOrigin } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { enforceRate, rateHit } from '../lib/security.js';
import { readMemoryIds } from './private.js';

export async function toggle(request, env) {
  assertSameOrigin(request);
  const user = await requireUser(request, env);
  if (!env.DB || !env.PRIVATE_KV) throw new HttpError(503, 'unavailable', '暂时没法收藏，稍后再试');
  const body = await readJson(request, 512);
  const memoryId = typeof body.memoryId === 'string' ? body.memoryId : '';
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(memoryId)) throw new HttpError(400, 'bad_id', '这段回忆不存在');
  if (!(await readMemoryIds(env)).has(memoryId)) throw new HttpError(404, 'not_found', '这段回忆不存在');

  await enforceRate(env.DB, `like:${user.id}`, 120, '点得有点快啦，歇一下再点');
  const liked = body.liked === true;
  if (liked) {
    await env.DB.prepare('INSERT OR IGNORE INTO memory_likes (memory_id, user_id, created_at) VALUES (?, ?, ?)')
      .bind(memoryId, user.id, Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM memory_likes WHERE memory_id = ? AND user_id = ?').bind(memoryId, user.id).run();
  }
  await rateHit(env.DB, `like:${user.id}`, 60_000);

  const { results } = await env.DB.prepare(
    `SELECT l.user_id, u.display_name FROM memory_likes l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.memory_id = ? ORDER BY l.created_at`
  ).bind(memoryId).all();
  return json({
    ok: true,
    memoryId,
    likes: {
      count: results.length,
      mine: results.some((r) => r.user_id === user.id),
      by: results.map((r) => r.display_name).filter(Boolean),
    },
  });
}
