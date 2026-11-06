// 通用 HTTP 工具

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

export function fail(status, code, message, extra = {}, headers = {}) {
  return json({ ok: false, error: code, message, ...extra }, status, headers);
}

export async function readJson(request, maxBytes = 4096) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'bad_content_type', '请求格式不正确');
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', '内容太长了');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_json', '请求格式不正确');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'bad_json', '请求格式不正确');
  }
  return value;
}

/** 简单的 CSRF 防护：浏览器发起的写请求必须来自同源页面。 */
export function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  const self = new URL(request.url).origin;
  if (origin && origin !== self) throw new HttpError(403, 'bad_origin', '请求来源不被允许');
  if (!origin && site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'bad_origin', '请求来源不被允许');
  }
}

export function isHttps(request) {
  return new URL(request.url).protocol === 'https:';
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
