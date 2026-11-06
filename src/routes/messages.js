// 公开留言墙：任何人都可以读取已公开的留言、提交新留言（无需登录）
import { HttpError, json, readJson, assertSameOrigin } from '../lib/http.js';
import { clientId, enforceRate, rateHit } from '../lib/security.js';

export const LIMITS = { nickname: 20, content: 300, minContent: 2 };

const len = (s) => [...s].length;

/** 去掉控制字符和零宽字符，统一空白。 */
function clean(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC').replace(/[​-‏‪-‮⁠-⁤﻿]/g, '');
  if (multiline) {
    s = s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ');
    s = s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
    s = s.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  }
  return s.trim();
}

function requireDb(env) {
  if (!env.DB) throw new HttpError(503, 'db_unavailable', '留言墙的数据库还没有配置好');
  return env.DB;
}

export async function listMessages(request, env) {
  const db = requireDb(env);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 24, 1), 50);
  const before = parseInt(url.searchParams.get('before'), 10) || null;

  const { results } = await db
    .prepare(
      `SELECT id, nickname, content, created_at FROM messages
       WHERE status = 'visible' AND (?1 IS NULL OR id < ?1)
       ORDER BY id DESC LIMIT ?2`
    )
    .bind(before, limit)
    .all();

  let total;
  if (!before) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'visible'`).first();
    total = row?.n ?? 0;
  }

  return json({
    ok: true,
    messages: results,
    nextCursor: results.length === limit ? results[results.length - 1].id : null,
    total,
  });
}

export async function createMessage(request, env) {
  assertSameOrigin(request);
  const db = requireDb(env);
  const body = await readJson(request, 4096);

  // 蜜罐字段：正常用户看不到这个输入框，机器人往往会填。假装成功，但不保存。
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true, status: 'visible', message: null });
  }
  // 填写时间过短，多半是脚本
  if (typeof body.elapsed === 'number' && body.elapsed < 1500) {
    throw new HttpError(400, 'too_fast', '写得太快啦，慢一点再提交吧');
  }

  const nickname = clean(body.nickname);
  const content = clean(body.content, { multiline: true });

  if (!nickname) throw new HttpError(400, 'nickname_required', '请写一个昵称');
  if (len(nickname) > LIMITS.nickname) throw new HttpError(400, 'nickname_too_long', `昵称最多 ${LIMITS.nickname} 个字`);
  if (len(content) < LIMITS.minContent) throw new HttpError(400, 'content_required', '祝福至少写两个字吧');
  if (len(content) > LIMITS.content) throw new HttpError(400, 'content_too_long', `祝福最多 ${LIMITS.content} 个字`);
  if ((content.match(/https?:\/\/|www\./gi) || []).length > 1) {
    throw new HttpError(400, 'too_many_links', '祝福里的链接太多了');
  }

  const cid = await clientId(request, env);
  const tooMany = '留言有点频繁，休息一下再来吧';
  await enforceRate(db, `msg:10m:${cid}`, 3, tooMany);
  await enforceRate(db, `msg:1d:${cid}`, 20, tooMany);
  await enforceRate(db, 'msg:1h:global', 300, '现在留言的人太多了，请稍后再试');

  const now = Date.now();
  const dup = await db
    .prepare('SELECT 1 FROM messages WHERE ip_hash = ? AND content = ? AND created_at > ? LIMIT 1')
    .bind(cid, content, now - 86_400_000)
    .first();
  if (dup) throw new HttpError(409, 'duplicate', '这条祝福已经提交过了');

  const status = env.MESSAGE_MODERATION === 'pre' ? 'pending' : 'visible';
  const res = await db
    .prepare('INSERT INTO messages (nickname, content, status, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(nickname, content, status, cid, now)
    .run();

  await Promise.all([
    rateHit(db, `msg:10m:${cid}`, 600_000),
    rateHit(db, `msg:1d:${cid}`, 86_400_000),
    rateHit(db, 'msg:1h:global', 3_600_000),
  ]);

  return json(
    {
      ok: true,
      status,
      message: { id: res.meta?.last_row_id ?? null, nickname, content, created_at: now },
    },
    201
  );
}
