#!/usr/bin/env node
// 把 private-assets/ 里的私密文字和照片导入 Cloudflare KV（私有存储）。
//
//   npm run import:local     导入到本地预览环境
//   npm run import:remote    导入到线上（需先 npx wrangler login 并配置好 KV id）
//
// 选项：--dir <文件夹>   默认 private-assets
//       --no-resize      不压缩照片（默认在 macOS 上用系统自带 sips 压缩并生成缩略图）
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, extname, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, platform } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const mode = args.includes('--remote') ? 'remote' : args.includes('--local') ? 'local' : null;
const dirIdx = args.indexOf('--dir');
const root = resolve(dirIdx >= 0 ? args[dirIdx + 1] : 'private-assets');
const wantResize = !args.includes('--no-resize');

const say = (...m) => console.log(...m);
const die = (m) => {
  console.error(`\n✖ ${m}\n`);
  process.exit(1);
};

if (!mode) die('请指定 --local（本地预览）或 --remote（线上）');
if (!existsSync(root)) {
  die(`找不到 ${root}\n  先复制模板：cp -R private-assets.example private-assets`);
}

// ---------- 1. 私密文字 ----------
const contentPath = join(root, 'content.json');
if (!existsSync(contentPath)) die(`缺少 ${contentPath}（可从 private-assets.example/content.json 复制）`);
let content;
try {
  content = JSON.parse(readFileSync(contentPath, 'utf8'));
} catch (e) {
  die(`content.json 不是合法的 JSON：${e.message}\n  常见原因：多了/少了逗号，或用了中文引号。`);
}
delete content._说明;

// ---------- 2. 照片 ----------
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.avif']);
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.heic': 'image/heic', '.heif': 'image/heif',
};
const FOLDERS = ['memories', 'surprise'];
const ASCII_OK = /^[a-z0-9][a-z0-9-]*$/;
/** 照片可以用中文文件名；存储时换成一个由文件名算出的英文键，文件名本身不变 */
const storageKey = (stem) => (ASCII_OK.test(stem) ? stem : `p-${createHash('sha1').update(stem).digest('hex').slice(0, 12)}`);
const normName = (name) => basename(name, extname(name)).normalize('NFC').toLowerCase();
const hasSips = platform() === 'darwin' && spawnSync('which', ['sips']).status === 0;
const work = mkdtempSync(join(tmpdir(), 'bd-import-'));

function dims(file) {
  if (!hasSips) return {};
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
    return { w: +out.match(/pixelWidth: (\d+)/)?.[1] || undefined, h: +out.match(/pixelHeight: (\d+)/)?.[1] || undefined };
  } catch {
    return {};
  }
}

// 优先用 Python + Pillow：按拍摄方向摆正、去掉 EXIF（含 GPS 定位）。没有 Pillow 时退回到 macOS 的 sips。
const pyPrep = join(dirname(fileURLToPath(import.meta.url)), 'prep-image.py');
const hasPillow = spawnSync('python3', ['-I', '-c', 'import PIL']).status === 0;

/** 返回 { file, ext, w, h }：把照片转为适合网页的 JPEG（或 PNG）。 */
function prepare(src, stem, maxSide, suffix) {
  const ext = extname(src).toLowerCase();
  if (wantResize && hasPillow && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const out = join(work, `${stem}${suffix}.jpg`);
    const r = spawnSync('python3', ['-I', pyPrep, src, out, String(maxSide)], { encoding: 'utf8' });
    if (r.status === 0) {
      const [w, h] = r.stdout.trim().split(/\s+/).map(Number);
      return { file: out, ext: '.jpg', w, h };
    }
    say(`  ⚠ ${basename(src)} 用 Pillow 处理失败，改用系统工具：${(r.stderr || '').trim().split('\n').pop()}`);
  }
  const d = dims(src);
  const convertible = ['.jpg', '.jpeg', '.heic', '.heif', '.png'].includes(ext);
  if (!wantResize || !hasSips || !convertible) {
    if (['.heic', '.heif'].includes(ext)) say(`  ⚠ ${basename(src)} 是 HEIC，部分浏览器无法显示，建议转成 JPG`);
    return { file: src, ext: ext === '.jpeg' ? '.jpg' : ext, ...d };
  }
  const outExt = ext === '.png' ? '.png' : '.jpg';
  const out = join(work, `${stem}${suffix}${outExt}`);
  const sipsArgs = outExt === '.jpg' ? ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82'] : ['-s', 'format', 'png'];
  if (Math.max(d.w || 0, d.h || 0) > maxSide) sipsArgs.push('-Z', String(maxSide));
  execFileSync('sips', [...sipsArgs, src, '--out', out], { stdio: 'ignore' });
  return { file: out, ext: outExt, ...dims(out) };
}

const entries = [];
const manifest = { generatedAt: new Date().toISOString(), media: {} };
const found = [];

for (const folder of FOLDERS) {
  const dir = join(root, folder);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).sort()) {
    const src = join(dir, name);
    const ext = extname(name).toLowerCase();
    if (name.startsWith('.') || !statSync(src).isFile()) continue;
    if (!IMAGE_EXT.has(ext)) {
      say(`  · 跳过非图片文件 ${folder}/${name}`);
      continue;
    }
    const stem = normName(name);
    const skey = storageKey(stem);
    const full = prepare(src, `${folder}-${skey}`, 2400, '');
    const thumb = (hasPillow || hasSips) && wantResize ? prepare(src, `${folder}-${skey}`, 960, '.thumb') : full;
    const pieces = { full, thumb };
    const record = { w: full.w, h: full.h };
    for (const [kind, p] of Object.entries(pieces)) {
      const buf = readFileSync(p.file);
      if (buf.length > 24 * 1024 * 1024) die(`${folder}/${name} 超过 24MB，请先压缩`);
      const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16);
      const key = `media/${folder}/${skey}${kind === 'thumb' && p !== full ? '.thumb' : ''}${p.ext}`;
      record[kind] = key;
      if (kind === 'thumb' && p === full) continue;
      entries.push({ key, value: buf.toString('base64'), base64: true, metadata: { type: MIME[p.ext] || 'application/octet-stream', hash } });
    }
    manifest.media[`${folder}/${stem}`] = record;
    found.push(`${folder}/${stem}`);
  }
}

entries.push({ key: 'content.json', value: JSON.stringify(content) });
entries.push({ key: 'manifest', value: JSON.stringify(manifest) });

// ---------- 3. 报告 ----------
const memories = Array.isArray(content.memories) ? content.memories : [];
say(`\n私密文字：${memories.length} 段回忆，${content.letter ? '有' : '没有'}信，${content.surprise ? '有' : '没有'}最后的惊喜`);
say(`照片：${found.length} 张${found.length && (hasPillow || hasSips) && wantResize ? `（已压缩、生成缩略图${hasPillow ? '、按拍摄方向摆正、去掉了定位等拍摄信息' : ''}）` : ''}`);
// 每段回忆想要的照片：photos 数组（可多张、可中文名）> photo 字符串 > 默认 memory-01 这种命名
const wanted = (m, i) =>
  Array.isArray(m.photos) ? m.photos : m.photo === null ? [] : [m.photo || `memory-${String(i + 1).padStart(2, '0')}`];
const used = new Set();
const missing = [];
memories.forEach((m, i) => {
  for (const p of wanted(m, i)) {
    const n = normName(String(p));
    used.add(`memories/${n}`);
    if (!manifest.media[`memories/${n}`]) missing.push(`memories/${p}`);
  }
});
if (missing.length) say(`  · 文案里写了、但文件夹里找不到的照片（会显示占位框）：${missing.join('、')}`);
const unused = found.filter((f) => f.startsWith('memories/') && !used.has(f));
if (unused.length) say(`  · 文件夹里有、但文案没有用到的照片（已导入，暂不显示）：${unused.join('、')}`);
const examples = JSON.stringify(content).includes('【示例】');
if (examples) say('  · 提示：内容里还有【示例】文字，记得替换成真实内容');

// ---------- 4. 写入 KV（按大小分批，每批 < 40MB）----------
const batches = [[]];
let size = 0;
for (const e of entries) {
  const s = e.value.length;
  if (size + s > 40 * 1024 * 1024 && batches.at(-1).length) {
    batches.push([]);
    size = 0;
  }
  batches.at(-1).push(e);
  size += s;
}

try {
  batches.forEach((batch, i) => {
    const file = join(work, `bulk-${i}.json`);
    writeFileSync(file, JSON.stringify(batch));
    say(`\n→ 写入 ${mode === 'remote' ? '线上' : '本地'} KV（第 ${i + 1}/${batches.length} 批，${batch.length} 项）…`);
    // 本地预览读的是 wrangler.jsonc 里的 preview_id，所以本地导入要加 --preview
    const where = mode === 'local' ? ['--local', '--preview'] : ['--remote'];
    const r = spawnSync('npx', ['wrangler', 'kv', 'bulk', 'put', file, '--binding', 'PRIVATE_KV', ...where], {
      stdio: 'inherit',
    });
    if (r.status !== 0) die('wrangler 写入失败，请检查上面的错误信息（线上导入需要先 npx wrangler login）');
  });
} finally {
  rmSync(work, { recursive: true, force: true }); // 临时文件里有私密内容，用完即删
}

say(`\n✔ 导入完成。${mode === 'local' ? '刷新本地预览页面即可看到。' : '线上已生效（KV 全球同步可能需要几十秒）。'}\n`);
