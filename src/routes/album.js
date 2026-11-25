// 共同相册：登录的账号都可以查看和添加；每个人可以修改、删除自己添加的内容，管理员可以管理全部。
// 每条回忆和照片都记录添加者的账号 ID（owner_id），而不是自己填写的署名。
// 照片存在私有 R2 存储桶（ALBUM_BUCKET），元数据存在 D1。照片只通过下面这些需要登录的接口读取。
import { HttpError, json, readJson, assertSameOrigin } from '../lib/http.js';
import { enforceRate, rateHit } from '../lib/security.js';
import { requireUser, requireAdmin } from '../lib/auth.js';

export const ALBUM_LIMITS = {
  title: 40,
  body: 800,
  photosPerMemory: 6,
  fullBytes: 6 * 1024 * 1024, // 单张大图上限
  thumbBytes: 800 * 1024, // 单张缩略图上限
  maxSide: 6000, // 最长边像素上限
  totalPhotos: 3000, // 整个相册的照片总数上限（保护免费额度）
  pendingTtl: 6 * 3600_000, // 上传后没有归入回忆的照片，超过这个时间会被清理
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const len = (s) => [...s].length;

function requireStore(env) {
  if (!env.DB || !env.ALBUM_BUCKET) {
    throw new HttpError(503, 'album_unavailable', '相册暂时用不了，晚一点再试试吧');
  }
}

const requireMember = (request, env) => requireUser(request, env);
const canManage = (user, ownerId) => user.role === 'admin' || (!!ownerId && ownerId === user.id);

function cleanText(value, { multiline = false } = {}) {
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

function cleanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1900 || t > Date.now() + 2 * 86_400_000) return null;
  return value;
}

function readFields(body) {
  const title = cleanText(body.title);
  const text = cleanText(body.text, { multiline: true });
  if (!title) throw new HttpError(400, 'title_required', '给这段回忆起个标题吧');
  if (len(title) > ALBUM_LIMITS.title) throw new HttpError(400, 'title_too_long', `标题最多 ${ALBUM_LIMITS.title} 个字`);
  if (len(text) > ALBUM_LIMITS.body) throw new HttpError(400, 'text_too_long', `文字最多 ${ALBUM_LIMITS.body} 个字`);
  let date = null;
  if (body.date) {
    date = cleanDate(body.date);
    if (!date) throw new HttpError(400, 'bad_date', '日期好像不太对');
  }
  return { title, text, date };
}

/**
 * 检查这确实是一张 JPEG，并去掉 EXIF（含拍摄地点）、XMP、备注等附加信息。
 * 只保留解码必需的数据段和色彩配置（JFIF / ICC / Adobe）。返回干净的字节和图片尺寸。
 */
export function sanitizeJpeg(buf) {
  const bad = () => new HttpError(400, 'bad_image', '这张照片没能通过检查，请换一张再试');
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw bad();
  const parts = [buf.subarray(0, 2)];
  let i = 2, width = 0, height = 0, sawScan = false;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw bad();
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; } // 填充字节
    if (m === 0xda) {
      // 图像数据开始：保留到最后一个结束标记为止，结束标记之后的多余内容丢掉
      let end = buf.length;
      for (let j = buf.length - 2; j > i; j--) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) { end = j + 2; break; }
      }
      parts.push(buf.subarray(i, end));
      sawScan = true;
      break;
    }
    if (m === 0xd9) break;
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { parts.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const size = (buf[i + 2] << 8) | buf[i + 3];
    if (size < 2 || i + 2 + size > buf.length) throw bad();
    const seg = buf.subarray(i, i + 2 + size);
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof && size >= 7) {
      height = (buf[i + 5] << 8) | buf[i + 6];
      width = (buf[i + 7] << 8) | buf[i + 8];
    }
    const isApp = m >= 0xe0 && m <= 0xef;
    const isIcc = m === 0xe2 && size > 14 && String.fromCharCode(...seg.subarray(4, 15)) === 'ICC_PROFILE';
    const keep = !(isApp || m === 0xfe) || m === 0xe0 || m === 0xee || isIcc;
    if (keep) parts.push(seg);
    i += 2 + size;
  }
  if (!sawScan || !width || !height) throw bad();
  if (width > ALBUM_LIMITS.maxSide || height > ALBUM_LIMITS.maxSide) {
    throw new HttpError(400, 'image_too_large', '这张照片的尺寸太大了');
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return { bytes: out, width, height };
}

const key = (id, kind) => `album/${id}/${kind}.jpg`;
const photoUrls = (id, base = '/api/private/album/photo') => ({ full: `${base}/${id}/full`, thumb: `${base}/${id}/thumb` });

async function deletePhotoFiles(env, ids) {
  if (!ids.length) return;
  await env.ALBUM_BUCKET.delete(ids.flatMap((id) => [key(id, 'full'), key(id, 'thumb')]));
}

/** 清理“上传了但没有保存成回忆”的照片（比如中途关掉了页面）。 */
async function cleanupPending(env) {
  const { results } = await env.DB.prepare(
    'SELECT id FROM album_photos WHERE memory_id IS NULL AND created_at < ? LIMIT 20'
  ).bind(Date.now() - ALBUM_LIMITS.pendingTtl).all();
  if (!results.length) return;
  const ids = results.map((r) => r.id);
  await deletePhotoFiles(env, ids);
  await env.DB.batch(ids.map((id) => env.DB.prepare('DELETE FROM album_photos WHERE id = ? AND memory_id IS NULL').bind(id)));
}

async function loadMemories(env, viewer, base) {
  const [mem, pho] = await Promise.all([
    env.DB.prepare(
      `SELECT m.id, m.title, m.happened_on, m.body, m.author, m.owner_id, m.created_at, m.updated_at, u.display_name AS owner_name
       FROM album_memories m LEFT JOIN users u ON u.id = m.owner_id
       ORDER BY COALESCE(m.happened_on, strftime('%Y-%m-%d', m.created_at / 1000, 'unixepoch')) DESC, m.id DESC LIMIT 500`
    ).all(),
    env.DB.prepare(
      'SELECT id, memory_id, width, height FROM album_photos WHERE memory_id IS NOT NULL ORDER BY memory_id, position'
    ).all(),
  ]);
  const byMemory = new Map();
  for (const p of pho.results) {
    if (!byMemory.has(p.memory_id)) byMemory.set(p.memory_id, []);
    byMemory.get(p.memory_id).push({ id: p.id, width: p.width, height: p.height, ...photoUrls(p.id, base) });
  }
  return mem.results.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.happened_on || null,
    text: m.body || '',
    // 添加者：来自账号的显示名称（不是自己填写的署名）
    owner: m.owner_id ? { id: m.owner_id, displayName: m.owner_name || '已删除的账号' } : null,
    // 旧版本里自己填写的署名，只用于“未归属”的早期内容，仅作参考
    legacyAuthor: m.owner_id ? '' : m.author || '',
    mine: !!m.owner_id && m.owner_id === viewer.id,
    canEdit: canManage(viewer, m.owner_id),
    createdAt: m.created_at,
    updatedAt: m.updated_at || null,
    photos: byMemory.get(m.id) || [],
  }));
}

// ---------------- 登录的账号 ----------------

export async function list(request, env) {
  const user = await requireMember(request, env);
  requireStore(env);
  return json({ ok: true, memories: await loadMemories(env, user), limits: ALBUM_LIMITS });
}

async function readImagePart(form, name, maxBytes) {
  const file = form.get(name);
  if (!file || typeof file === 'string') throw new HttpError(400, 'file_required', '没有收到照片');
  if (file.size > maxBytes) throw new HttpError(413, 'file_too_large', '这张照片太大了');
  return sanitizeJpeg(new Uint8Array(await file.arrayBuffer()));
}

export async function uploadPhoto(request, env) {
  assertSameOrigin(request);
  const user = await requireMember(request, env);
  requireStore(env);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > ALBUM_LIMITS.fullBytes + ALBUM_LIMITS.thumbBytes + 64 * 1024) {
    throw new HttpError(413, 'file_too_large', '这张照片太大了');
  }
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(415, 'bad_content_type', '上传格式不正确');
  }

  const cid = user.id;
  await enforceRate(env.DB, `album:photo:1h:${cid}`, 80, '上传得有点多了，过一会儿再继续吧');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM album_photos').first();
  if ((count?.n ?? 0) >= ALBUM_LIMITS.totalPhotos) throw new HttpError(507, 'album_full', '相册已经放满了');

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'bad_upload', '上传中断了，请再试一次');
  }
  const full = await readImagePart(form, 'full', ALBUM_LIMITS.fullBytes);
  const thumb = await readImagePart(form, 'thumb', ALBUM_LIMITS.thumbBytes);

  const id = crypto.randomUUID(); // 文件名由服务器生成，不使用访客的原始文件名
  const put = (kind, bytes) =>
    env.ALBUM_BUCKET.put(key(id, kind), bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  try {
    await Promise.all([put('full', full.bytes), put('thumb', thumb.bytes)]);
    await env.DB.prepare(
      'INSERT INTO album_photos (id, memory_id, position, width, height, size, owner_id, created_at) VALUES (?, NULL, 0, ?, ?, ?, ?, ?)'
    ).bind(id, full.width, full.height, full.bytes.length, user.id, Date.now()).run();
  } catch (err) {
    await deletePhotoFiles(env, [id]).catch(() => {});
    throw err;
  }
  await rateHit(env.DB, `album:photo:1h:${cid}`, 3_600_000);
  if (Math.random() < 0.2) await cleanupPending(env).catch(() => {});

  return json({ ok: true, photo: { id, width: full.width, height: full.height } }, 201);
}

export async function createMemory(request, env) {
  assertSameOrigin(request);
  const user = await requireMember(request, env);
  requireStore(env);
  const body = await readJson(request, 16 * 1024);
  const f = readFields(body);

  const ids = Array.isArray(body.photoIds) ? [...new Set(body.photoIds)] : [];
  if (ids.length > ALBUM_LIMITS.photosPerMemory) {
    throw new HttpError(400, 'too_many_photos', `一段回忆最多放 ${ALBUM_LIMITS.photosPerMemory} 张照片`);
  }
  if (ids.some((id) => typeof id !== 'string' || !UUID.test(id))) throw new HttpError(400, 'bad_photo', '照片信息不正确');
  if (!ids.length && !f.text) throw new HttpError(400, 'empty', '至少放一张照片，或者写几句话');

  const cid = user.id;
  await enforceRate(env.DB, `album:mem:1h:${cid}`, 30, '添加得有点多了，过一会儿再继续吧');

  for (const id of ids) {
    const row = await env.DB.prepare('SELECT memory_id, owner_id FROM album_photos WHERE id = ?').bind(id).first();
    // 只能使用自己刚上传、还没归入任何回忆的照片
    if (!row || row.memory_id !== null || row.owner_id !== user.id) {
      throw new HttpError(409, 'photo_gone', '有照片需要重新上传，请再试一次');
    }
  }

  const now = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO album_memories (title, happened_on, body, author, owner_id, created_at) VALUES (?, ?, ?, '', ?, ?)"
  ).bind(f.title, f.date, f.text, user.id, now).run();
  const memoryId = res.meta.last_row_id;
  if (ids.length) {
    await env.DB.batch(
      ids.map((id, i) =>
        env.DB.prepare('UPDATE album_photos SET memory_id = ?, position = ? WHERE id = ? AND memory_id IS NULL AND owner_id = ?').bind(memoryId, i, id, user.id)
      )
    );
  }
  await rateHit(env.DB, `album:mem:1h:${cid}`, 3_600_000);

  const all = await loadMemories(env, user);
  return json({ ok: true, memory: all.find((m) => m.id === memoryId) || null }, 201);
}

async function sendPhoto(request, env, id, kind) {
  requireStore(env);
  if (!UUID.test(id) || (kind !== 'full' && kind !== 'thumb')) throw new HttpError(404, 'not_found', '没有这张照片');
  const row = await env.DB.prepare('SELECT 1 FROM album_photos WHERE id = ? AND memory_id IS NOT NULL').bind(id).first();
  if (!row) throw new HttpError(404, 'not_found', '没有这张照片');
  const obj = await env.ALBUM_BUCKET.get(key(id, kind));
  if (!obj) throw new HttpError(404, 'not_found', '没有这张照片');
  const headers = {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, no-cache', // 每次都要回来验证会话，锁上之后不能再从缓存里看
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    ETag: obj.httpEtag,
  };
  if (request.headers.get('If-None-Match') === obj.httpEtag) {
    obj.body.cancel?.();
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
}

export async function photo(request, env, id, kind) {
  await requireMember(request, env);
  return sendPhoto(request, env, id, kind);
}

function parseId(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'bad_id', '编号不正确');
  return id;
}

async function loadOwned(env, user, rawId) {
  const id = parseId(rawId);
  const row = await env.DB.prepare('SELECT id, owner_id FROM album_memories WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'not_found', '这段回忆不存在');
  // 权限在服务器上判断：只有添加者本人或管理员可以修改 / 删除
  if (!canManage(user, row.owner_id)) throw new HttpError(403, 'not_owner', '只能修改或删除你自己添加的回忆');
  return row;
}

async function update(request, env, rawId, user, base) {
  assertSameOrigin(request);
  requireStore(env);
  const row = await loadOwned(env, user, rawId);
  const f = readFields(await readJson(request, 16 * 1024));
  await env.DB.prepare('UPDATE album_memories SET title = ?, happened_on = ?, body = ?, updated_at = ? WHERE id = ?')
    .bind(f.title, f.date, f.text, Date.now(), row.id)
    .run();
  const all = await loadMemories(env, user, base);
  return json({ ok: true, memory: all.find((m) => m.id === row.id) || null });
}

async function remove(request, env, rawId, user) {
  assertSameOrigin(request);
  requireStore(env);
  const row = await loadOwned(env, user, rawId);
  const { results } = await env.DB.prepare('SELECT id FROM album_photos WHERE memory_id = ?').bind(row.id).all();
  await deletePhotoFiles(env, results.map((r) => r.id));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM album_photos WHERE memory_id = ?').bind(row.id),
    env.DB.prepare('DELETE FROM album_memories WHERE id = ?').bind(row.id),
  ]);
  return json({ ok: true, id: row.id });
}

export async function updateMemory(request, env, rawId) {
  return update(request, env, rawId, await requireMember(request, env));
}
export async function deleteMemory(request, env, rawId) {
  return remove(request, env, rawId, await requireMember(request, env));
}

// ---------------- 管理员 ----------------

const ADMIN_BASE = '/api/admin/album/photo';

export async function adminList(request, env) {
  const admin = await requireAdmin(request, env);
  requireStore(env);
  return json({ ok: true, memories: await loadMemories(env, admin, ADMIN_BASE), limits: ALBUM_LIMITS });
}

export async function adminPhoto(request, env, id, kind) {
  await requireAdmin(request, env);
  return sendPhoto(request, env, id, kind);
}

export async function adminUpdate(request, env, rawId) {
  return update(request, env, rawId, await requireAdmin(request, env), ADMIN_BASE);
}

export async function adminDelete(request, env, rawId) {
  return remove(request, env, rawId, await requireAdmin(request, env));
}

/** 管理员把一条回忆（包括其中的照片）指定给某个账号；用于早期“未归属”的内容。 */
export async function adminAssign(request, env, rawId) {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, env);
  requireStore(env);
  const id = parseId(rawId);
  const body = await readJson(request, 256);
  const ownerId = body.ownerId === null ? null : String(body.ownerId || '');
  if (ownerId !== null) {
    const u = await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(ownerId).first();
    if (!u) throw new HttpError(400, 'bad_owner', '没有这个账号');
  }
  const res = await env.DB.batch([
    env.DB.prepare('UPDATE album_memories SET owner_id = ? WHERE id = ?').bind(ownerId, id),
    env.DB.prepare('UPDATE album_photos SET owner_id = ? WHERE memory_id = ?').bind(ownerId, id),
  ]);
  if (!res[0].meta?.changes) throw new HttpError(404, 'not_found', '这段回忆不存在');
  const all = await loadMemories(env, admin, ADMIN_BASE);
  return json({ ok: true, memory: all.find((m) => m.id === id) || null });
}
