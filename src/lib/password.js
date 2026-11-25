// 密码哈希：使用平台内置的 Web Crypto PBKDF2-HMAC-SHA256（标准算法，不自制加密）。
// 存储格式：pbkdf2-sha256$<迭代次数>$<盐 base64url>$<摘要 base64url>
// Cloudflare Workers 对 PBKDF2 的迭代次数上限是 100,000，所以这里取上限。
import { b64url, b64urlDecode } from './security.js';

const enc = new TextEncoder();
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return ['pbkdf2-sha256', PBKDF2_ITERATIONS, b64url(salt), b64url(hash)].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  const hash = await derive(password, b64urlDecode(parts[2]), iterations);
  return equalBytes(hash, b64urlDecode(parts[3]));
}

// 用户不存在时也做一次同样耗时的计算，避免通过响应时间判断用户名是否存在
let dummy;
export async function burnTime(password) {
  dummy ||= await hashPassword('timing-equalizer');
  await verifyPassword(password || 'x', dummy);
}
