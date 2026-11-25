#!/usr/bin/env node
// 对正在运行的本地站点做端到端检查：npm run test:smoke [-- http://localhost:8787] [--rate]
// 会临时创建几个以 smoke_ 开头的测试账号和一条测试留言 / 回忆，结束时全部删除。
// 只能对本地预览使用（测试管理员通过本地数据库直接创建）。
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8787';
const RATE = process.argv.includes('--rate');
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
const send = (method, path, body, cookie, extra = {}) =>
  req(path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (path, body, cookie, extra) => send('POST', path, body, cookie, extra);
const get = (path, cookie) => req(path, { headers: cookie ? { Cookie: cookie } : {} });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

function d1(sql) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'birthday-db', '--local', '--json', '--command', sql], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`d1 失败：${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout)[0]?.results || [];
}
/** 直接在本地数据库里放一个邀请（模拟 npm run admin:setup） */
function plantInvite({ role = 'member', kind = 'register', expiresIn = 3600_000 } = {}) {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  d1(`INSERT INTO invites (id, token_hash, kind, role, note, created_at, expires_at) VALUES ('${randomUUID()}', '${hash}', '${kind}', '${role}', 'smoke', ${Date.now()}, ${Date.now() + expiresIn})`);
  return token;
}
const tag = randomBytes(3).toString('hex');
const ADMIN = { username: `smoke_a${tag}`, displayName: '测试管理员', password: `Adm!n-${tag}-pass` };
const MEMBER = { username: `smoke_m${tag}`, displayName: '测试成员', password: `Mem-${tag}-secret` };
let adminC = '', memberC = '';

try {
  // ---------- 公开页面 ----------
  const home = await req('/');
  const html = await home.text();
  ok(home.status === 200, '首页可访问');
  ok(!!home.headers.get('content-security-policy'), '静态页面带 CSP 安全头');
  const pub = await Promise.all(['/js/private.js', '/js/main.js', '/js/join.js', '/js/album.js', '/site.config.js', '/admin/admin.js'].map((p) => req(p).then((r) => r.text())));
  const secrets = Object.values(vars).filter((v) => v && v.length >= 8);
  ok(secrets.every((s) => ![html, ...pub].some((t) => t.includes(s))), '页面和前端脚本中不含任何密钥');
  for (const p of ['/private-assets/content.json', '/.dev.vars', '/wrangler.jsonc', '/src/worker.js', '/migrations/0003_accounts.sql']) {
    ok((await req(p)).status === 404, `无法直接访问 ${p}`);
  }

  // ---------- 旧的共用口令 / 后台密码入口已经不存在 ----------
  ok((await post('/api/private/unlock', { password: vars.ACCESS_PASSWORD || 'x' })).status === 404, '旧的共用口令入口已移除');
  ok((await post('/api/admin/login', { password: vars.ADMIN_PASSWORD || 'x' })).status === 404, '旧的后台密码入口已移除');
  if (vars.ACCESS_PASSWORD) {
    ok((await post('/api/auth/login', { username: 'admin', password: vars.ACCESS_PASSWORD })).status === 401, '旧口令不能当作任何账号的密码');
  }

  // ---------- 未登录 ----------
  for (const p of ['/api/private/content', '/api/private/album', '/api/private/media/memories/memory-01.jpg', '/api/admin/messages', '/api/admin/album', '/api/admin/accounts']) {
    ok((await get(p)).status === 401, `未登录访问 ${p} 返回 401`);
  }
  ok((await get('/api/private/content', 'bd_session=forged-token-forged-token-forged')).status === 401, '伪造的会话被拒绝');
  ok((await post('/api/auth/register', { token: 'nope-nope-nope-nope-nope', username: 'hacker', displayName: 'x', password: 'whatever123' })).status === 410, '没有邀请不能注册');

  // ---------- 管理员：只能通过本地数据库放置的邀请创建 ----------
  const adminToken = plantInvite({ role: 'admin' });
  const info = await (await post('/api/auth/invite', { token: adminToken })).json();
  ok(info.kind === 'register' && info.role === 'admin', '邀请链接可以被识别');
  const weak = await post('/api/auth/register', { token: adminToken, ...ADMIN, password: '12345678' });
  ok(weak.status === 400, '太简单的密码被拒绝');
  const reg = await post('/api/auth/register', { token: adminToken, ...ADMIN });
  adminC = cookieOf(reg);
  const sc = reg.headers.get('set-cookie') || '';
  ok(reg.status === 201 && adminC.startsWith('bd_session='), '凭邀请注册管理员账号，注册后自动登录');
  ok(/HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc) && /Path=\/api/i.test(sc), '会话 Cookie 为 HttpOnly、SameSite=Lax、仅限 /api');
  ok((await post('/api/auth/register', { token: adminToken, ...ADMIN, username: `${ADMIN.username}x` })).status === 410, '同一个邀请链接不能用第二次');
  const expired = plantInvite({ expiresIn: -1000 });
  ok((await post('/api/auth/invite', { token: expired })).status === 410, '过期的邀请链接不能用');
  const stored = d1(`SELECT password_hash FROM users WHERE username = '${ADMIN.username}'`)[0]?.password_hash || '';
  ok(stored.startsWith('pbkdf2-sha256$100000$') && !stored.includes(ADMIN.password), '数据库里只有 PBKDF2 哈希，没有明文密码');

  // ---------- 管理员生成成员邀请 ----------
  ok((await post('/api/admin/invites', { days: 7 }, adminC, { Origin: 'https://evil.example' })).status === 403, '跨站请求不能生成邀请（即使带着管理员 Cookie）');
  const invRes = await post('/api/admin/invites', { days: 7, note: 'smoke' }, adminC);
  const memberToken = (await invRes.json()).invite?.token;
  ok(invRes.status === 201 && !!memberToken, '管理员可以生成邀请链接');
  ok((await post('/api/auth/register', { token: memberToken, ...MEMBER, username: ADMIN.username.toUpperCase() })).status === 409, '用户名不能重复（不区分大小写）');
  const mreg = await post('/api/auth/register', { token: memberToken, ...MEMBER });
  memberC = cookieOf(mreg);
  const mdata = await mreg.json();
  ok(mreg.status === 201 && mdata.user.role === 'member', '成员凭邀请自己设置用户名、称呼和密码');

  // ---------- 权限分离 ----------
  ok((await get('/api/private/content', memberC)).status === 200, '成员可以看私密内容');
  ok((await get('/api/admin/accounts', memberC)).status === 403, '成员不能进入后台（403）');
  ok((await post('/api/admin/invites', { days: 1 }, memberC)).status === 403, '成员不能生成邀请');
  const acc = await (await get('/api/admin/accounts', adminC)).json();
  ok(!JSON.stringify(acc).includes('pbkdf2') && !JSON.stringify(acc).includes(MEMBER.password), '后台的账号列表里看不到任何密码或哈希');

  // ---------- 退出 / 登录 ----------
  const me1 = await (await get('/api/auth/me', memberC)).json();
  ok(me1.user?.username === MEMBER.username, '/api/auth/me 返回当前账号');
  await post('/api/auth/logout', {}, memberC);
  ok((await get('/api/private/content', memberC)).status === 401, '退出后旧会话失效');
  ok((await post('/api/auth/login', { username: MEMBER.username, password: 'wrong-password' })).status === 401, '密码错误不能登录');
  ok((await post('/api/auth/login', { username: 'smoke_nobody', password: 'wrong-password' })).status === 401, '不存在的用户名和错误密码返回同样的结果');
  const li = await post('/api/auth/login', { username: MEMBER.username.toUpperCase(), password: MEMBER.password });
  memberC = cookieOf(li);
  ok(li.status === 200 && (await get('/api/private/content', memberC)).status === 200, '用户名 + 密码登录成功（用户名不区分大小写）');

  // ---------- 回忆收藏（小星星）----------
  const mems = (await (await get('/api/private/content', memberC)).json()).memories || [];
  if (mems.length) {
    const mid = mems[0].id;
    const before = mems[0].likes?.count ?? 0;
    ok((await post('/api/private/likes', { memoryId: mid, liked: true })).status === 401, '未登录不能收藏回忆');
    ok((await post('/api/private/likes', { memoryId: mid, liked: true }, memberC, { Origin: 'https://evil.example' })).status === 403, '跨站请求不能收藏');
    ok((await post('/api/private/likes', { memoryId: 'no-such-memory', liked: true }, memberC)).status === 404, '不存在的回忆不能收藏');
    const on = await (await post('/api/private/likes', { memoryId: mid, liked: true }, memberC)).json();
    ok(on.likes?.mine === true && on.likes.count === before + 1 && on.likes.by.includes(MEMBER.displayName), '收藏成功，并显示是谁收藏的');
    const again = await (await post('/api/private/likes', { memoryId: mid, liked: true }, memberC)).json();
    ok(again.likes?.count === before + 1, '重复收藏不会重复计数');
    const seen = (await (await get('/api/private/content', memberC)).json()).memories.find((m) => m.id === mid);
    ok(seen?.likes?.mine === true, '刷新后收藏状态还在');
    const off = await (await post('/api/private/likes', { memoryId: mid, liked: false }, memberC)).json();
    ok(off.likes?.mine === false && off.likes.count === before, '取消收藏');
  }

  // ---------- 共同相册：归属与权限 ----------
  const health = await (await req('/api/health')).json();
  if (health.albumStorage) {
    const TEST_JPEG = Buffer.from(
      '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABAQEBAQEBgQEBgkGBgYJDAkJCQkMDwwMDAwMDxIPDw8PDw8SEhISEhISEhUVFRUVFRkZGRkZHBwcHBwcHBwcHP/bAEMBBAUFBwcHDAcHDB0UEBQdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHf/dAAQAAf/aAAwDAQACEQMRAD8A7yiiivzM+8P/2Q==',
      'base64'
    );
    const form = () => {
      const fd = new FormData();
      fd.append('full', new Blob([TEST_JPEG], { type: 'image/jpeg' }), 'a.jpg');
      fd.append('thumb', new Blob([TEST_JPEG], { type: 'image/jpeg' }), 'b.jpg');
      return fd;
    };
    const upload = (cookie, extra = {}) => req('/api/private/album/photos', { method: 'POST', headers: { Cookie: cookie, ...extra }, body: form() });

    ok((await req('/api/private/album/photos', { method: 'POST', body: form() })).status === 401, '未登录不能上传照片');
    ok((await upload(memberC, { Origin: 'https://evil.example' })).status === 403, '跨站上传被拒绝');
    const up = await (await upload(memberC)).json();
    const adminUp = await (await upload(adminC)).json();
    const stolen = await post('/api/private/album/memories', { title: '偷用别人的照片', photoIds: [adminUp.photo.id] }, memberC);
    ok(stolen.status === 409, '不能把别人上传的照片挂到自己的回忆里');
    const made = await post('/api/private/album/memories', { title: '成员的回忆', text: '<b>纯文本</b>', author: '冒充的署名', photoIds: [up.photo.id] }, memberC);
    const mem = (await made.json()).memory;
    ok(made.status === 201 && mem.owner?.id === mdata.user.id && mem.owner.displayName === MEMBER.displayName, '回忆记在添加者的账号 ID 下（忽略自己填写的署名）');
    const adminMade = await (await post('/api/private/album/memories', { title: '管理员的回忆', photoIds: [adminUp.photo.id] }, adminC)).json();

    const seenByAdmin = await (await get('/api/private/album', adminC)).json();
    const seenMem = seenByAdmin.memories.find((m) => m.id === mem.id);
    ok(!!seenMem && seenMem.canEdit && !seenMem.mine, '另一个账号能看到这条回忆；管理员可以管理');
    const seenByMember = await (await get('/api/private/album', memberC)).json();
    const adminsMem = seenByMember.memories.find((m) => m.id === adminMade.memory.id);
    ok(!!adminsMem && adminsMem.canEdit === false, '成员能看到管理员的回忆，但没有修改权限');
    ok((await send('PATCH', `/api/private/album/memories/${adminMade.memory.id}`, { title: '改别人的' }, memberC)).status === 403, '成员不能修改别人的回忆（服务器拒绝）');
    ok((await send('DELETE', `/api/private/album/memories/${adminMade.memory.id}`, undefined, memberC)).status === 403, '成员不能删除别人的回忆（服务器拒绝）');
    ok((await send('PATCH', `/api/private/album/memories/${mem.id}`, { title: '成员改过的标题', text: '' }, memberC)).status === 200, '成员可以修改自己的回忆');
    const photoUrl = seenMem.photos[0].full;
    const img = await get(photoUrl, adminC);
    const bytes = Buffer.from(await img.arrayBuffer());
    ok(img.status === 200 && !bytes.includes('Exif'), '照片可以被登录的账号查看，且已去掉 EXIF');
    ok((await get(photoUrl)).status === 401, '未登录拿不到相册照片');
    ok((await send('DELETE', `/api/private/album/memories/${mem.id}`, undefined, memberC)).status === 200, '成员可以删除自己的回忆');
    ok((await get(photoUrl, adminC)).status === 404, '删除后照片也被移除');
    ok((await send('DELETE', `/api/admin/album/${adminMade.memory.id}`, undefined, adminC)).status === 200, '管理员可以在后台删除回忆（测试数据已清理）');
  } else {
    console.log('· 跳过相册测试：没有配置 ALBUM_BUCKET');
  }

  // ---------- 修改密码 ----------
  const other = cookieOf(await post('/api/auth/login', { username: MEMBER.username, password: MEMBER.password }));
  ok((await post('/api/auth/password', { current: 'wrong', next: 'Another-pass-123' }, memberC)).status === 401, '修改密码时必须输入正确的旧密码');
  const newPw = `New-${tag}-password`;
  ok((await post('/api/auth/password', { current: MEMBER.password, next: newPw }, memberC)).status === 200, '修改密码成功');
  ok((await get('/api/private/content', memberC)).status === 200, '当前设备保持登录');
  ok((await get('/api/private/content', other)).status === 401, '其他设备上的登录自动失效');
  ok((await post('/api/auth/login', { username: MEMBER.username, password: MEMBER.password })).status === 401, '旧密码不能再登录');

  // ---------- 管理员发重置链接 ----------
  const memberId = mdata.user.id;
  const rs = await (await post(`/api/admin/users/${memberId}/reset`, {}, adminC)).json();
  const rinfo = await (await post('/api/auth/invite', { token: rs.invite.token })).json();
  ok(rinfo.kind === 'reset' && rinfo.account.username === MEMBER.username, '重置链接可以识别要重置的账号');
  const resetPw = `Reset-${tag}-password`;
  const rr = await post('/api/auth/reset', { token: rs.invite.token, password: resetPw });
  ok(rr.status === 200, '用重置链接设置了新密码');
  ok((await get('/api/private/content', memberC)).status === 401, '重置后所有旧登录失效');
  ok((await post('/api/auth/reset', { token: rs.invite.token, password: 'Yet-another-1' })).status === 410, '重置链接只能用一次');
  memberC = cookieOf(await post('/api/auth/login', { username: MEMBER.username, password: resetPw }));
  ok(!!memberC && (await get('/api/private/content', memberC)).status === 200, '用新密码可以登录');

  // ---------- 停用账号 ----------
  ok((await send('PATCH', `/api/admin/users/${memberId}`, { disabled: true }, adminC)).status === 200, '管理员可以停用账号');
  ok((await get('/api/private/content', memberC)).status === 401, '停用后立刻失去访问权限');
  ok((await post('/api/auth/login', { username: MEMBER.username, password: resetPw })).status === 401, '停用的账号不能登录');

  // ---------- 公开留言 ----------
  const nick = `测试${tag}`;
  ok((await post('/api/messages', { nickname: '', content: 'hi' })).status === 400, '空昵称被拒绝');
  ok((await post('/api/messages', { nickname: 'a', content: 'x'.repeat(301) })).status === 400, '超长留言被拒绝');
  const xss = '<img src=x onerror=alert(1)> 生日快乐';
  const created = await post('/api/messages', { nickname: nick, content: xss, elapsed: 5000 });
  const cdata = await created.json();
  ok(created.status === 201, '公开留言不需要登录');
  const listed = await (await req('/api/messages')).json();
  ok(listed.messages.some((m) => m.nickname === nick && m.content === xss), '留言已保存并原样返回（前端以纯文本显示）');
  ok((await send('DELETE', `/api/admin/messages/${cdata.message.id}`, undefined, adminC)).status === 200, '管理员可以删除留言（测试留言已清理）');

  // ---------- 登录限流 ----------
  if (RATE) {
    let last;
    for (let i = 0; i < 11; i++) last = await post('/api/auth/login', { username: `smoke_rate${tag}`, password: `wrong-${i}-xxxx` });
    ok(last.status === 429, '多次登录失败后触发限流（429）');
  }
} finally {
  // ---------- 清理测试账号 ----------
  try {
    d1(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\')`);
    d1(`DELETE FROM invites WHERE note = 'smoke' OR user_id IN (SELECT id FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\') OR created_by IN (SELECT id FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\')`);
    d1(`DELETE FROM album_photos WHERE owner_id IN (SELECT id FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\')`);
    d1(`DELETE FROM memory_likes WHERE user_id NOT IN (SELECT id FROM users WHERE username NOT LIKE 'smoke\\_%' ESCAPE '\\')`);
    d1(`DELETE FROM users WHERE username LIKE 'smoke\\_%' ESCAPE '\\'`);
    d1(`DELETE FROM rate_limits WHERE key LIKE 'login:%' OR key LIKE 'invite:%' OR key LIKE 'pwchange:%' OR key LIKE 'album:%' OR key LIKE 'msg:%' OR key LIKE 'like:%'`);
    console.log('· 测试账号和临时数据已清理');
  } catch (e) {
    console.log(`⚠ 清理测试数据时出错：${e.message}`);
  }
}

console.log(`\n${pass} 项通过，${failCount} 项失败`);
process.exit(failCount ? 1 : 0);
