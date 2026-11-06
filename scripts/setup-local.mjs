#!/usr/bin/env node
// 一键准备本地预览：生成 .dev.vars、准备 private-assets/、建表、导入私密内容。
import { existsSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
};
const rand = (n) => randomBytes(n).toString('base64url');

if (!existsSync('.dev.vars')) {
  const access = `gift-${rand(4)}`;
  const admin = `admin-${rand(9)}`;
  writeFileSync(
    '.dev.vars',
    `# 本地开发用的机密（已被 Git 忽略）。线上请用 npx wrangler secret put 设置。\n` +
      `ACCESS_PASSWORD=${access}\nADMIN_PASSWORD=${admin}\nSESSION_SECRET=${rand(48)}\n`
  );
  console.log('✔ 已生成 .dev.vars（里面有本地预览用的访问口令和后台密码）');
} else {
  const vars = readFileSync('.dev.vars', 'utf8');
  if (!/^SESSION_SECRET=.{32,}/m.test(vars)) console.warn('⚠ .dev.vars 中 SESSION_SECRET 少于 32 个字符，私密区域将无法使用');
  console.log('· .dev.vars 已存在，保持不变');
}

if (!existsSync('private-assets')) {
  cpSync('private-assets.example', 'private-assets', { recursive: true });
  console.log('✔ 已从模板创建 private-assets/（已被 Git 忽略）');
}

run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'birthday-db', '--local']);
run('node', ['scripts/import-private.mjs', '--local']);
console.log('\n全部就绪：运行 npm run dev，然后打开 http://localhost:8787\n');
