// 私密区域：口令解锁 → 签名会话 Cookie → 才能读取私密文字和照片。
// 私密内容只存在于 KV（由 scripts/import-private.mjs 导入），从不进入 public/ 或前端代码。
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

const COOKIE = 'bd_private';
const COOKIE_PATH = '/api/private';
const SCOPE = 'private';
const MAX_FAILS = 5; // 每个访问者 15 分钟内最多失败 5 次
const GLOBAL_MAX_FAILS = 60; // 全站 15 分钟内最多失败 60 次（防分布式猜测）
const WINDOW = 15 * 60_000;

function requireConfigured(env) {
  if (!configStatus(env).privateArea) {
    throw new HttpError(503, 'private_not_configured', '私密区域还没有配置好，请联系网站作者');
  }
}

function ttl(env) {
  const hours = Math.min(Math.max(parseFloat(env.PRIVATE_SESSION_HOURS) || 12, 0.25), 24 * 30);
  return Math.round(hours * 3600);
}

export async function isUnlocked(request, env) {
  if (!configStatus(env).privateArea) return false;
  return verifyToken(env, SCOPE, env.ACCESS_PASSWORD, getCookie(request, COOKIE));
}

async function requireUnlocked(request, env) {
  requireConfigured(env);
  if (!(await isUnlocked(request, env))) {
    throw new HttpError(401, 'locked', '需要先输入口令');
  }
}

export async function unlock(request, env) {
  assertSameOrigin(request);
  requireConfigured(env);
  if (!env.DB) throw new HttpError(503, 'db_unavailable', '服务暂时不可用');

  const cid = await clientId(request, env);
  const key = `unlock:${cid}`;
  const [mine, all] = await Promise.all([
    rateStatus(env.DB, key, MAX_FAILS),
    rateStatus(env.DB, 'unlock:global', GLOBAL_MAX_FAILS),
  ]);
  if (mine.blocked || all.blocked) {
    const retryAfter = Math.max(mine.retryAfter || 0, all.retryAfter || 0);
    return fail(429, 'rate_limited', '尝试次数太多了，请稍后再试', { retryAfter }, { 'Retry-After': String(retryAfter) });
  }

  const body = await readJson(request, 1024);
  const password = typeof body.password === 'string' ? body.password.trim() : '';
  if (!password || password.length > 200) {
    return fail(400, 'password_required', '请输入口令');
  }

  if (await safeEqual(password, env.ACCESS_PASSWORD.trim())) {
    const token = await issueToken(env, SCOPE, env.ACCESS_PASSWORD, ttl(env));
    return json({ ok: true }, 200, {
      'Set-Cookie': buildCookie(request, COOKIE, token, { path: COOKIE_PATH, maxAge: ttl(env), sameSite: 'Lax' }),
    });
  }

  await Promise.all([rateHit(env.DB, key, WINDOW), rateHit(env.DB, 'unlock:global', WINDOW)]);
  await sleep(350 + Math.random() * 300);
  const remaining = Math.max(0, mine.remaining - 1);
  return fail(401, 'wrong_password', remaining > 0 ? '口令不太对，再想想？' : '尝试次数太多了，请稍后再试', {
    remaining,
  });
}

export async function lock(request) {
  assertSameOrigin(request);
  return json({ ok: true }, 200, {
    'Set-Cookie': buildCookie(request, COOKIE, '', { path: COOKIE_PATH, maxAge: 0 }),
  });
}

export async function session(request, env) {
  const status = configStatus(env);
  return json({ ok: true, configured: status.privateArea, unlocked: await isUnlocked(request, env) });
}

async function readManifest(env) {
  return (await env.PRIVATE_KV.get('manifest', 'json')) || { media: {} };
}

function mediaRef(manifest, name) {
  const m = name && manifest.media?.[name];
  if (!m) return null;
  const url = (key) => `/api/private/media/${key.replace(/^media\//, '')}`;
  return { full: url(m.full), thumb: url(m.thumb || m.full), width: m.w || null, height: m.h || null };
}

export async function content(request, env) {
  await requireUnlocked(request, env);
  const [data, manifest] = await Promise.all([env.PRIVATE_KV.get('content.json', 'json'), readManifest(env)]);
  if (!data) {
    return json({ ok: true, imported: false });
  }

  const memories = (Array.isArray(data.memories) ? data.memories : []).map((m, i) => {
    const photo = typeof m.photo === 'string' && m.photo ? m.photo : `memory-${String(i + 1).padStart(2, '0')}`;
    const name = photo.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
    return { ...m, photo: name, image: mediaRef(manifest, `memories/${name}`) };
  });

  let surprise = data.surprise || null;
  if (surprise) {
    const name = (surprise.photo || 'surprise').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
    surprise = { ...surprise, image: mediaRef(manifest, `surprise/${name}`) };
  }

  return json({
    ok: true,
    imported: true,
    importedAt: manifest.generatedAt || null,
    intro: data.intro || null,
    memories,
    letter: data.letter || null,
    surprise,
  });
}

const SAFE_PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9._-]*)+$/;

export async function media(request, env, path) {
  await requireUnlocked(request, env);
  if (!SAFE_PATH.test(path) || path.includes('..')) throw new HttpError(404, 'not_found', '没有这个文件');
  const key = `media/${path}`;

  const manifest = await readManifest(env);
  const known = Object.values(manifest.media || {}).some((m) => m.full === key || m.thumb === key);
  if (!known) throw new HttpError(404, 'not_found', '没有这个文件');

  const { value, metadata } = await env.PRIVATE_KV.getWithMetadata(key, { type: 'stream' });
  if (!value) throw new HttpError(404, 'not_found', '没有这个文件');

  const etag = metadata?.hash ? `"${metadata.hash}"` : null;
  const headers = {
    'Content-Type': metadata?.type || 'application/octet-stream',
    // no-cache：浏览器每次都必须回来验证会话，锁定后无法再从缓存直接显示
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  if (etag) {
    headers.ETag = etag;
    if (request.headers.get('If-None-Match') === etag) {
      value.cancel?.();
      return new Response(null, { status: 304, headers });
    }
  }
  return new Response(value, { headers });
}
