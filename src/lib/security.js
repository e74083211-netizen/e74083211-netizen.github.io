// 会话令牌、Cookie、常量时间比较、限流
import { HttpError, isHttps } from './http.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const keyCache = new Map();
async function hmacKey(secret) {
  if (!keyCache.has(secret)) {
    keyCache.set(
      secret,
      crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    );
  }
  return keyCache.get(secret);
}

export async function hmac(secret, data) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return b64url(new Uint8Array(sig));
}

async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(data)));
}

/** 常量时间比较：先哈希再逐字节比较，避免长度和内容泄露时间差。 */
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

// ---------- 配置检查 ----------

export function configStatus(env) {
  const secretOk = typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32;
  const accessOk = typeof env.ACCESS_PASSWORD === 'string' && env.ACCESS_PASSWORD.length >= 4;
  const adminOk =
    typeof env.ADMIN_PASSWORD === 'string' &&
    env.ADMIN_PASSWORD.length >= 8 &&
    env.ADMIN_PASSWORD !== env.ACCESS_PASSWORD;
  return {
    database: !!env.DB,
    privateStorage: !!env.PRIVATE_KV,
    privateArea: secretOk && accessOk && !!env.PRIVATE_KV,
    admin: secretOk && adminOk && !!env.DB,
    moderation: env.MESSAGE_MODERATION === 'pre' ? 'pre' : 'off',
  };
}

// ---------- 会话令牌 ----------
// 令牌 = base64url(payload) + "." + HMAC(SESSION_SECRET)。
// payload 中带有口令指纹：修改口令后，所有旧会话自动失效。

async function passwordFingerprint(env, scope, password) {
  return (await hmac(env.SESSION_SECRET, `pw:${scope}:${password}`)).slice(0, 16);
}

export async function issueToken(env, scope, password, ttlSeconds) {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(9)));
  const payload = {
    s: scope,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
    v: await passwordFingerprint(env, scope, password),
    n: nonce,
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await hmac(env.SESSION_SECRET, `${scope}.${body}`);
  return `${body}.${sig}`;
}

export async function verifyToken(env, scope, password, token) {
  if (!token || typeof token !== 'string' || token.length > 512) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = await hmac(env.SESSION_SECRET, `${scope}.${body}`);
  if (!(await safeEqual(expected, sig))) return false;
  let payload;
  try {
    payload = JSON.parse(dec.decode(b64urlDecode(body)));
  } catch {
    return false;
  }
  if (payload.s !== scope || typeof payload.e !== 'number') return false;
  if (payload.e < Math.floor(Date.now() / 1000)) return false;
  return payload.v === (await passwordFingerprint(env, scope, password));
}

// ---------- Cookie ----------

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function buildCookie(request, name, value, { path = '/', maxAge, sameSite = 'Lax' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', `SameSite=${sameSite}`];
  if (isHttps(request)) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

// ---------- 访问者标识（只保存加盐哈希）----------

export async function clientId(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return (await hmac(env.SESSION_SECRET || 'birthday-site-public-salt', `ip:${ip}`)).slice(0, 22);
}

// ---------- 基于 D1 的固定窗口限流 ----------

export async function rateStatus(db, key, limit) {
  const row = await db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').bind(key).first();
  const now = Date.now();
  if (!row || row.reset_at <= now) return { blocked: false, remaining: limit };
  const remaining = Math.max(0, limit - row.count);
  return {
    blocked: remaining === 0,
    remaining,
    retryAfter: Math.ceil((row.reset_at - now) / 1000),
  };
}

export async function rateHit(db, key, windowMs) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count    = CASE WHEN reset_at <= ?3 THEN 1  ELSE count + 1 END,
         reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at  END`
    )
    .bind(key, now + windowMs, now)
    .run();
  if (Math.random() < 0.05) {
    await db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now - 86_400_000).run();
  }
}

export async function enforceRate(db, key, limit, message) {
  const s = await rateStatus(db, key, limit);
  if (s.blocked) {
    throw new HttpError(429, 'rate_limited', message, { retryAfter: s.retryAfter });
  }
  return s;
}
