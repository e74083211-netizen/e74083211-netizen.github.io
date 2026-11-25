#!/usr/bin/env node
// 在你自己的电脑上，通过 Cloudflare 命令行直接写入数据库，生成：
//   · 管理员注册链接（第一次设置管理员账号时用）
//   · 某个账号的重置密码链接（管理员自己忘了密码时用）
// 网页上没有任何“谁先来谁当管理员”的入口，只有能操作你的 Cloudflare 数据库的人才能运行这个脚本。
//
//   npm run admin:setup                      本地预览：生成管理员注册链接
//   npm run admin:setup:remote -- --base https://你的网址   线上：生成管理员注册链接
//   npm run admin:reset -- 用户名              本地：给这个账号生成重置密码链接
//   npm run admin:reset:remote -- 用户名 --base https://你的网址
//
// 链接 24 小时内有效、只能用一次。数据库里只保存令牌的摘要，链接只会显示这一次。
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const args = process.argv.slice(2);
const mode = args.includes('--remote') ? 'remote' : 'local';
const baseIdx = args.indexOf('--base');
const base = (baseIdx >= 0 ? args[baseIdx + 1] : mode === 'local' ? 'http://localhost:8787' : '').replace(/\/+$/, '');
const resetIdx = args.indexOf('--reset');
const resetUser = resetIdx >= 0 ? args[resetIdx + 1] : null;
const force = args.includes('--force');

const die = (m) => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};

function d1(sql) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'birthday-db', `--${mode}`, '--json', '--command', sql], {
    encoding: 'utf8',
  });
  if (r.status !== 0) die(`数据库操作失败：\n${(r.stderr || r.stdout || '').slice(-600)}`);
  try {
    return JSON.parse(r.stdout)[0]?.results || [];
  } catch {
    die('无法读取数据库返回的结果');
  }
}

if (mode === 'remote' && !/^https:\/\//.test(base)) {
  die('线上模式请加上你的网址，例如：npm run admin:setup:remote -- --base https://birthday-site.xxx.workers.dev');
}

const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
const id = randomUUID();
const now = Date.now();
const expires = now + 24 * 3600_000;

if (resetUser) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/.test(resetUser)) die('用户名格式不对');
  const rows = d1(`SELECT id, display_name, disabled FROM users WHERE username = '${resetUser}' COLLATE NOCASE`);
  if (!rows.length) die(`没有找到用户名为「${resetUser}」的账号`);
  const user = rows[0];
  if (user.disabled) die('这个账号已被停用');
  d1(
    `DELETE FROM invites WHERE kind = 'reset' AND user_id = '${user.id}' AND used_at IS NULL; ` +
      `INSERT INTO invites (id, token_hash, kind, role, user_id, note, created_at, expires_at) ` +
      `VALUES ('${id}', '${hash}', 'reset', 'member', '${user.id}', '命令行生成', ${now}, ${expires});`
  );
  console.log(`\n已为「${user.display_name}」（${resetUser}）生成重置密码链接，24 小时内有效、只能用一次：\n`);
} else {
  const admins = d1(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`)[0]?.n ?? 0;
  if (admins > 0 && !force) {
    die(
      '已经有管理员账号了。\n' +
        '  · 忘了密码：npm run admin:reset -- 你的用户名\n' +
        '  · 确实要再建一个管理员：在命令末尾加 --force'
    );
  }
  d1(
    `INSERT INTO invites (id, token_hash, kind, role, note, created_at, expires_at) ` +
      `VALUES ('${id}', '${hash}', 'register', 'admin', '管理员（命令行生成）', ${now}, ${expires});`
  );
  console.log('\n已生成管理员注册链接，24 小时内有效、只能用一次。用浏览器打开它，设置你自己的用户名和密码：\n');
}

console.log(`   ${base}/join/#${token}\n`);
console.log('这个链接就像一把钥匙：不要发到群里或公开的地方。用过之后它会自动作废。\n');
