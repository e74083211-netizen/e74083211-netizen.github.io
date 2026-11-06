// Cloudflare Worker 入口：/api/* 走这里，其余请求交给 public/ 静态文件。
import { HttpError, json, fail } from './lib/http.js';
import { configStatus } from './lib/security.js';
import * as messages from './routes/messages.js';
import * as priv from './routes/private.js';
import * as admin from './routes/admin.js';

async function route(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;
  const is = (m, p) => method === m && pathname === p;

  if (is('GET', '/api/health')) {
    let dbOk = false;
    if (env.DB) {
      try {
        await env.DB.prepare('SELECT 1 FROM messages LIMIT 1').all();
        dbOk = true;
      } catch {
        dbOk = false;
      }
    }
    return json({ ok: true, databaseReady: dbOk, ...configStatus(env) });
  }

  // 公开留言
  if (is('GET', '/api/messages')) return messages.listMessages(request, env);
  if (is('POST', '/api/messages')) return messages.createMessage(request, env);

  // 私密区域
  if (is('GET', '/api/private/session')) return priv.session(request, env);
  if (is('POST', '/api/private/unlock')) return priv.unlock(request, env);
  if (is('POST', '/api/private/lock')) return priv.lock(request, env);
  if (is('GET', '/api/private/content')) return priv.content(request, env);
  if (method === 'GET' && pathname.startsWith('/api/private/media/')) {
    return priv.media(request, env, decodeURIComponent(pathname.slice('/api/private/media/'.length)));
  }

  // 管理后台
  if (is('GET', '/api/admin/session')) return admin.session(request, env);
  if (is('POST', '/api/admin/login')) return admin.login(request, env);
  if (is('POST', '/api/admin/logout')) return admin.logout(request, env);
  if (is('GET', '/api/admin/messages')) return admin.list(request, env);
  const m = pathname.match(/^\/api\/admin\/messages\/([^/]+)$/);
  if (m && method === 'PATCH') return admin.update(request, env, m[1]);
  if (m && method === 'DELETE') return admin.remove(request, env, m[1]);

  return fail(404, 'not_found', '没有这个接口');
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) {
        const headers = err.extra?.retryAfter ? { 'Retry-After': String(err.extra.retryAfter) } : {};
        return fail(err.status, err.code, err.message, err.extra, headers);
      }
      console.error('Unhandled error', err && err.stack ? err.stack : err);
      return fail(500, 'server_error', '服务器开小差了，请稍后再试');
    }
  },
};
