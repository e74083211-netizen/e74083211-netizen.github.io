// Cloudflare Worker 入口：/api/* 走这里，其余请求交给 public/ 静态文件。
import { HttpError, json, fail } from './lib/http.js';
import { configStatus } from './lib/security.js';
import * as messages from './routes/messages.js';
import * as priv from './routes/private.js';
import * as admin from './routes/admin.js';
import * as album from './routes/album.js';
import * as auth from './routes/auth.js';
import * as accounts from './routes/accounts.js';
import * as likes from './routes/likes.js';

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

  // 账号：登录 / 退出 / 修改密码 / 邀请注册 / 重置密码
  if (is('GET', '/api/auth/me')) return auth.me(request, env);
  if (is('POST', '/api/auth/login')) return auth.login(request, env);
  if (is('POST', '/api/auth/logout')) return auth.logout(request, env);
  if (is('POST', '/api/auth/password')) return auth.changePassword(request, env);
  if (is('POST', '/api/auth/invite')) return auth.inspectInvite(request, env);
  if (is('POST', '/api/auth/register')) return auth.register(request, env);
  if (is('POST', '/api/auth/reset')) return auth.resetPassword(request, env);

  // 私密区域（需要登录）
  if (is('GET', '/api/private/content')) return priv.content(request, env);
  if (is('POST', '/api/private/likes')) return likes.toggle(request, env);
  if (method === 'GET' && pathname.startsWith('/api/private/media/')) {
    return priv.media(request, env, decodeURIComponent(pathname.slice('/api/private/media/'.length)));
  }

  // 共同相册（需要登录；修改 / 删除只限本人或管理员）
  if (is('GET', '/api/private/album')) return album.list(request, env);
  if (is('POST', '/api/private/album/photos')) return album.uploadPhoto(request, env);
  if (is('POST', '/api/private/album/memories')) return album.createMemory(request, env);
  const pm = pathname.match(/^\/api\/private\/album\/memories\/(\d+)$/);
  if (pm && method === 'PATCH') return album.updateMemory(request, env, pm[1]);
  if (pm && method === 'DELETE') return album.deleteMemory(request, env, pm[1]);
  const ph = pathname.match(/^\/api\/private\/album\/photo\/([^/]+)\/(full|thumb)$/);
  if (ph && method === 'GET') return album.photo(request, env, ph[1], ph[2]);

  // 管理后台（需要管理员账号）：留言
  if (is('GET', '/api/admin/messages')) return admin.list(request, env);
  const m = pathname.match(/^\/api\/admin\/messages\/([^/]+)$/);
  if (m && method === 'PATCH') return admin.update(request, env, m[1]);
  if (m && method === 'DELETE') return admin.remove(request, env, m[1]);

  // 管理后台：相册
  if (is('GET', '/api/admin/album')) return album.adminList(request, env);
  const aph = pathname.match(/^\/api\/admin\/album\/photo\/([^/]+)\/(full|thumb)$/);
  if (aph && method === 'GET') return album.adminPhoto(request, env, aph[1], aph[2]);
  const am = pathname.match(/^\/api\/admin\/album\/(\d+)$/);
  if (am && method === 'PATCH') return album.adminUpdate(request, env, am[1]);
  if (am && method === 'DELETE') return album.adminDelete(request, env, am[1]);
  const ao = pathname.match(/^\/api\/admin\/album\/(\d+)\/owner$/);
  if (ao && method === 'PUT') return album.adminAssign(request, env, ao[1]);

  // 管理后台：账号与邀请
  if (is('GET', '/api/admin/accounts')) return accounts.overview(request, env);
  if (is('POST', '/api/admin/invites')) return accounts.createInvite(request, env);
  const inv = pathname.match(/^\/api\/admin\/invites\/([^/]+)$/);
  if (inv && method === 'DELETE') return accounts.revokeInvite(request, env, inv[1]);
  const ur = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset$/);
  if (ur && method === 'POST') return accounts.createReset(request, env, ur[1]);
  const ud = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (ud && method === 'PATCH') return accounts.setDisabled(request, env, ud[1]);

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
