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
  return {
    database: !!env.DB,
    privateStorage: !!env.PRIVATE_KV,
    albumStorage: !!env.ALBUM_BUCKET,
    accounts: !!env.DB,
    moderation: env.MESSAGE_MODERATION === 'pre' ? 'pre' : 'off',
  };
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
