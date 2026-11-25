// 私密区域：必须用个人账号登录后才能读取私密文字和照片（不再有共用口令）。
// 私密内容只存在于 KV（由 scripts/import-private.mjs 导入），从不进入 public/ 或前端代码。
import { HttpError, json } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';

async function requireMember(request, env) {
  if (!env.PRIVATE_KV) throw new HttpError(503, 'private_not_configured', '这里暂时还打不开，晚一点再来吧');
  return requireUser(request, env);
}

async function readManifest(env) {
  return (await env.PRIVATE_KV.get('manifest', 'json')) || { media: {} };
}

function mediaRef(manifest, name) {
  const m = name && manifest.media?.[name];
  if (!m) return null;
  const url = (key) => `/api/private/media/${key.replace(/^media\//, '')}`;
  return { full: url(m.full), thumb: url(m.thumb || m.full), width: m.w || null, height: m.h || null };
}

/** 照片名（可以是中文、可以带扩展名）→ manifest 里的名字 */
const photoName = (p) => String(p).normalize('NFC').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
/** 每段回忆想要的照片：photos 数组（可多张）> photo 字符串 > 默认 memory-01 这种命名；photo: null 表示没有照片 */
function wantedPhotos(m, i) {
  if (Array.isArray(m.photos)) return m.photos.filter((p) => typeof p === 'string' && p);
  if (m.photo === null) return [];
  return [typeof m.photo === 'string' && m.photo ? m.photo : `memory-${String(i + 1).padStart(2, '0')}`];
}
/** 回忆的稳定编号（用于收藏）：优先 content.json 里的 id，否则按顺序 */
export const memoryId = (m, i) => (typeof m.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(m.id) ? m.id : String(i + 1).padStart(2, '0'));

export async function readMemoryIds(env) {
  const data = await env.PRIVATE_KV.get('content.json', 'json');
  return new Set((Array.isArray(data?.memories) ? data.memories : []).map(memoryId));
}

/** 每段回忆被谁收藏了：{ [memoryId]: { count, mine, by: [称呼] } } */
async function loadLikes(env, user) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare(
      `SELECT l.memory_id, l.user_id, u.display_name FROM memory_likes l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at`
    ).all();
    const out = {};
    for (const r of results) {
      const e = (out[r.memory_id] ||= { count: 0, mine: false, by: [] });
      e.count++;
      if (r.user_id === user.id) e.mine = true;
      if (r.display_name) e.by.push(r.display_name);
    }
    return out;
  } catch {
    return {}; // 收藏表还没建好时，不影响看回忆
  }
}

export async function content(request, env) {
  const user = await requireMember(request, env);
  const [data, manifest] = await Promise.all([env.PRIVATE_KV.get('content.json', 'json'), readManifest(env)]);
  if (!data) {
    return json({ ok: true, imported: false });
  }

  // 本机预览时保留【示例】内容方便作者看版式；正式访问时，示例内容一律不展示给访客。
  const preview = isLocalPreview(request);
  const keep = (v) => (typeof v === 'string' && (preview || !isExample(v)) ? v : '');
  const likes = await loadLikes(env, user);

  const memories = (Array.isArray(data.memories) ? data.memories : [])
    .map((m, i) => {
      const id = memoryId(m, i);
      const names = wantedPhotos(m, i);
      const images = names.map((p) => mediaRef(manifest, `memories/${photoName(p)}`)).filter(Boolean);
      const missing = names.filter((p) => !mediaRef(manifest, `memories/${photoName(p)}`));
      return {
        id,
        photo: preview && missing.length ? String(missing[0]) : undefined, // 仅本机预览：提示缺哪张
        date: keep(m.date),
        title: keep(m.title),
        text: keep(m.text),
        image: images[0] || null,
        images,
        likes: likes[id] || { count: 0, mine: false, by: [] },
      };
    })
    .filter((m) => m.image || m.title || m.text);

  let letter = null;
  if (data.letter && typeof data.letter === 'object') {
    const paragraphs = (Array.isArray(data.letter.paragraphs) ? data.letter.paragraphs : []).map(keep).filter(Boolean);
    if (paragraphs.length) {
      letter = {
        envelopeLabel: keep(data.letter.envelopeLabel),
        salutation: keep(data.letter.salutation),
        paragraphs,
        closing: keep(data.letter.closing),
        signature: keep(data.letter.signature),
        date: keep(data.letter.date),
      };
    }
  }

  let surprise = null;
  if (data.surprise && typeof data.surprise === 'object') {
    const s = data.surprise;
    const name = (s.photo || 'surprise').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
    const image = mediaRef(manifest, `surprise/${name}`);
    const title = keep(s.title);
    const text = keep(s.text);
    if (title || text || image) {
      surprise = {
        teaser: keep(s.teaser),
        buttonText: keep(s.buttonText),
        title,
        text,
        image,
        link: typeof s.link === 'string' ? s.link : null,
        linkText: keep(s.linkText),
      };
    }
  }

  const intro = data.intro && typeof data.intro === 'object'
    ? { eyebrow: keep(data.intro.eyebrow), title: keep(data.intro.title), text: keep(data.intro.text) }
    : null;

  return json({
    ok: true,
    imported: true,
    preview,
    hasExamples: preview && JSON.stringify(data).includes(EXAMPLE_MARK),
    intro,
    memories,
    letter,
    surprise,
  });
}

const EXAMPLE_MARK = '【示例】';
const isExample = (v) => typeof v === 'string' && v.includes(EXAMPLE_MARK);

function isLocalPreview(request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

const SAFE_PATH = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9._-]*)+$/;

export async function media(request, env, path) {
  await requireMember(request, env);
  if (!SAFE_PATH.test(path) || path.includes('..')) throw new HttpError(404, 'not_found', '没有这个文件');
  const key = `media/${path}`;

  const manifest = await readManifest(env);
  const known = Object.values(manifest.media || {}).some((m) => m.full === key || m.thumb === key);
  if (!known) throw new HttpError(404, 'not_found', '没有这个文件');

  const { value, metadata } = await env.PRIVATE_KV.getWithMetadata(key, { type: 'stream' });
  if (!value) throw new HttpError(404, 'not_found', '没有这个文件');

  const etag = metadata?.hash ? `"${metadata.hash}"` : null;
  const headers = {
    'Content-Type': metadata?.type || 'application/octet-stream',
    // no-cache：浏览器每次都必须回来验证会话，锁定后无法再从缓存直接显示
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  if (etag) {
    headers.ETag = etag;
    if (request.headers.get('If-None-Match') === etag) {
      value.cancel?.();
      return new Response(null, { status: 304, headers });
    }
  }
  return new Response(value, { headers });
}
