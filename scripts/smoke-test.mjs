#!/usr/bin/env node
// 对正在运行的站点做冒烟测试：npm run test:smoke [-- http://localhost:8787]
// 会读取 .dev.vars 中的口令（仅用于本地测试）。会写入一条测试留言并在结束时删除。
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8787';
const vars = existsSync('.dev.vars')
  ? Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  : {};
let pass = 0, failCount = 0;
const ok = (cond, label) => {
  cond ? pass++ : failCount++;
  console.log(`${cond ? '✔' : '✖'} ${label}`);
};
const req = (path, opts = {}) =>
  fetch(BASE + path, { redirect: 'manual', ...opts, headers: { Origin: BASE, ...(opts.headers || {}) } });
const post = (path, body, headers = {}) =>
  req(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

// 公开页面
const home = await req('/');
const html = await home.text();
ok(home.status === 200, '首页可访问');
ok(!!home.headers.get('content-security-policy'), '静态页面带 CSP 安全头');

// 私密内容不在公开文件里
const pub = await Promise.all(['/js/private.js', '/js/main.js', '/site.config.js'].map((p) => req(p).then((r) => r.text())));
const secrets = [vars.ACCESS_PASSWORD, vars.ADMIN_PASSWORD, vars.SESSION_SECRET].filter(Boolean);
ok(secrets.every((s) => ![html, ...pub].some((t) => t.includes(s))), '页面源码与前端脚本中不含任何口令/密钥');
for (const p of ['/private-assets/content.json', '/private-assets/memories/memory-01.jpg', '/.dev.vars', '/wrangler.jsonc', '/src/worker.js']) {
  const r = await req(p);
  ok(r.status === 404, `无法直接访问 ${p}（${r.status}）`);
}

// 未授权访问私密 API
ok((await req('/api/private/content')).status === 401, '未解锁时 /api/private/content 返回 401');
ok((await req('/api/private/media/memories/memory-01.jpg')).status === 401, '未解锁时私密照片返回 401');
ok((await req('/api/private/content', { headers: { Cookie: 'bd_private=forged.token' } })).status === 401, '伪造的会话 Cookie 被拒绝');
ok((await post('/api/private/unlock', { password: 'x' }, { Origin: 'https://evil.example' })).status === 403, '跨站请求解锁被拒绝');

// 错误口令
const wrong = await post('/api/private/unlock', { password: 'definitely-wrong' });
ok(wrong.status === 401, '错误口令返回 401');

// 正确口令
if (vars.ACCESS_PASSWORD) {
  const right = await post('/api/private/unlock', { password: vars.ACCESS_PASSWORD });
  const c = cookieOf(right);
  const sc = right.headers.get('set-cookie') || '';
  ok(right.status === 200 && c.startsWith('bd_private='), '正确口令解锁成功');
  ok(/HttpOnly/i.test(sc) && /Path=\/api\/private/i.test(sc), '会话 Cookie 为 HttpOnly 且仅限 /api/private');
  const content = await req('/api/private/content', { headers: { Cookie: c } });
  const data = await content.json();
  ok(content.status === 200 && data.ok, '解锁后可读取私密内容');
  const withPhoto = data.memories?.find((m) => m.image);
  if (withPhoto) {
    const img = await req(withPhoto.image.thumb, { headers: { Cookie: c } });
    ok(img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/'), '解锁后可读取私密照片');
    ok(/no-cache/.test(img.headers.get('cache-control') || ''), '私密照片要求每次重新验证（private, no-cache）');
  }
  ok((await req('/api/private/media/../../wrangler.jsonc', { headers: { Cookie: c } })).status === 404, '路径穿越被拒绝');
  ok((await req('/api/admin/messages', { headers: { Cookie: c.replace('bd_private', 'bd_admin') } })).status === 401, '私密区域会话不能用作后台会话');
  const lock = await post('/api/private/lock', {}, { Cookie: c });
  ok(/Max-Age=0/.test(lock.headers.get('set-cookie') || ''), '离开私密区域会清除 Cookie');
}

// 留言墙
const nick = `测试${Date.now() % 10000}`;
const bad = await post('/api/messages', { nickname: '', content: 'hi' });
ok(bad.status === 400, '空昵称被拒绝');
const long = await post('/api/messages', { nickname: 'a', content: 'x'.repeat(301) });
ok(long.status === 400, '超长留言被拒绝');
const xss = '<img src=x onerror=alert(1)> 生日快乐';
const created = await post('/api/messages', { nickname: nick, content: xss, elapsed: 5000 });
const createdData = await created.json();
ok(created.status === 201, '留言提交成功');
const listed = await (await req('/api/messages')).json();
const mine = listed.messages.find((m) => m.nickname === nick);
ok(!!mine && mine.content === xss, '留言已持久保存并可被读取（原样存储，前端以纯文本渲染）');
const dup = await post('/api/messages', { nickname: nick, content: xss, elapsed: 5000 });
ok(dup.status === 409 || dup.status === 429, '重复留言被拦截');

// 后台
ok((await req('/api/admin/messages')).status === 401, '未登录无法访问后台接口');
ok((await post('/api/admin/login', { password: vars.ACCESS_PASSWORD || 'x' })).status === 401, '私密区域口令不能登录后台');
if (vars.ADMIN_PASSWORD) {
  const login = await post('/api/admin/login', { password: vars.ADMIN_PASSWORD });
  const ac = cookieOf(login);
  ok(login.status === 200, '管理员登录成功');
  const id = createdData.message?.id;
  const hide = await req(`/api/admin/messages/${id}`, { method: 'PATCH', headers: { Cookie: ac, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'hidden' }) });
  ok(hide.status === 200, '管理员可以隐藏留言');
  const after = await (await req('/api/messages')).json();
  ok(!after.messages.some((m) => m.id === id), '隐藏后公开列表不再显示');
  const del = await req(`/api/admin/messages/${id}`, { method: 'DELETE', headers: { Cookie: ac } });
  ok(del.status === 200, '管理员可以删除留言（测试留言已清理）');
}

// 限流（放在最后：会暂时锁住本机的口令尝试 15 分钟）
if (process.argv.includes('--rate')) {
  let last;
  for (let i = 0; i < 6; i++) last = await post('/api/private/unlock', { password: `wrong-${i}` });
  ok(last.status === 429, '多次错误口令后触发限流（429）');
}

console.log(`\n${pass} 项通过，${failCount} 项失败`);
process.exit(failCount ? 1 : 0);
