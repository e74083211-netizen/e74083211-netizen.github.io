# Birthday site — public wishes + invitation‑only private memories

A warm, cinematic birthday gift website (Chinese UI), staged like a short film in acts:

**序幕 邀请函 → 第一幕 祝愿 → 第二幕 烛光（点蜡烛、许愿、吹灭、庆祝）→ 第三幕 留言墙 → 第四幕 珍藏（账号登录：回忆、信、共同相册、最后的礼物）→ 片尾**

Design language — **“雨夜琥珀城” (a rainy amber city)**: a cinematic, original cyberpunk night city. Deep blue‑black base; three restrained light sources — **amber** (warmth, the birthday, the gift), **cyan** (the city’s signals, the private archive) and a little **magenta** (the wishes wall). Each act has one dominant light colour and the whole city slowly shifts to it as you scroll.

- **The city** is a real, licensed high‑resolution photograph of a rainy neon street (Pexels, see `art/README.md`), colour‑graded to deep blue/cyan with magenta and a little amber kept in the brightest signs, and served as AVIF/WebP (≈110–230 KB). It is cropped like `object-fit: cover` with the focal point on the street's vanishing point. On top of it there is only: light rain, a slow breathing glow on one sign and an occasional short flicker on another, and a gentle sheen moving across the wet road. Text gets a soft local veil only where it sits. After the first screen the page switches to a soft‑focus, darker version of the same street so long text stays readable; the ending returns to the sharp street. Original and processing script live in `art/`.
- **Opening**: a short “signal handshake” (握手中… / 正在解码… / 已接入, under one second, Esc enters silently), then the city lights up layer by layer.
- **First screen**: the name as a hanging neon sign that flickers on, “Happy Birthday” as a cyan hologram with a projector beam, an LED date, puddle reflections.
- **Cake**: a neon‑tube cake on a holographic platform with a spinning ring; real warm flames. Blowing out: the city blacks out → the cake flashes → the city relights in three beats → light‑sliver confetti.
- **Private archive**: an archive terminal for login; memories as framed image records (“ARCHIVE 01 / 04”) shown at their **original aspect ratio** — never cropped — with designed “影像待补充” placeholders; the letter arrives as an **encrypted message** that decrypts and then unfolds as the one warm, real paper object in the city; the final gift is a glowing core that charges, the city goes quiet, then turns to a warm amber “dawn”.
- The admin page uses the same colours but no scene or animation, for clarity.
- All of this respects `prefers-reduced-motion` (no rain, flicker, fog drift or spinning rings).

The public part (including the wishes wall) works on its own without any login. The private part (photos, stories, letter, shared album, final surprise) only reaches the browser after someone logs in with **their own account** — and accounts can only be created through an invitation link you generate.

Small touches worth knowing about:
- Lighting the candles dims the whole page; when they go out the city goes dark and relights.
- While wishing, the visitor may type a wish. It never leaves their screen — it floats away with the smoke.
- The celebration, the letter (“折好，放回信封”) and the opening hero can all be replayed (“重新加密收好” closes the letter again).
- On the birthday itself, entering the site drops a little confetti.

---

## Architecture (and why not GitHub Pages)

This repository used to be a GitHub Pages site. **GitHub Pages only serves static files**, so on its own it cannot:

- check a password on a server (any password in page JavaScript can be read by anyone),
- store a shared wishes wall that persists across devices,
- keep private photos private (everything in the published repo/folder is publicly downloadable).

So the site now runs on **Cloudflare Workers** (free tier is enough for a project like this):

| Piece | Service | Purpose |
| --- | --- | --- |
| `public/` | Workers static assets | Public pages, CSS, JS, decorative images, music |
| `src/worker.js` | Worker (`/api/*`) | Accounts, invitations, sessions, rate limiting, wishes / album / admin APIs |
| D1 (SQLite) | `DB` binding | Accounts, sessions, invitations, wishes, album metadata, rate‑limit counters |
| Workers KV | `PRIVATE_KV` binding | Curated private text (`content.json`) and photos you import from `private-assets/` |
| R2 (private bucket) | `ALBUM_BUCKET` binding | Photos uploaded through the website’s shared album (metadata in D1) |

## Accounts (账号) — how access works

There is **no shared password** any more. Everyone who sees the private area has their own account.

| Who | Public pages & wishes wall | Private area & album | Add to album | Edit / delete album entries | `/admin/` |
| --- | --- | --- | --- | --- | --- |
| Public visitor (not logged in) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Member (e.g. the birthday person) | ✓ | ✓ | ✓ | **own entries only** | ✗ (403) |
| Administrator (you) | ✓ | ✓ | ✓ | all entries | ✓ |

**Only invited people can register.** Registration needs a one‑time invitation link (`/join/#…`). Links expire (1–14 days, your choice), work exactly once, and are checked on the server. The server stores only a SHA‑256 digest of each link, so a link is shown once when created and can never be looked up again. Nobody can register by just visiting the site.

**Your administrator account** is created with a command you run on your own computer (it writes the invitation straight into your Cloudflare database). There is no “first visitor becomes admin” page. See §2.

**Passwords** are chosen by each person on the website. They are hashed with **PBKDF2‑HMAC‑SHA256 via the platform’s built‑in Web Crypto API** (100,000 iterations — the maximum Cloudflare Workers allows — and a random 16‑byte salt per password). No plaintext is ever stored or logged, and administrators cannot see anyone’s password. Rules: at least 8 characters, must not contain the username, very common passwords are refused.

**Sessions** are random 256‑bit tokens in an `HttpOnly`, `SameSite=Lax` cookie limited to `/api` (`Secure` on HTTPS), valid for 30 days. The database keeps only a digest of each token, so sessions can be revoked on the server:
- 退出登录 ends that session;
- 修改密码 logs out every *other* device;
- a password reset or disabling an account logs out every device immediately.

**Request protection:** every state‑changing request (login, register, upload, edit, delete, admin actions) must come from the site itself (`Origin`/`Sec-Fetch-Site` check), so other websites cannot act with someone’s cookie. Permissions are enforced on the server for every request — hiding a button is never the only protection.

**Rate limits:** failed logins 10 per visitor and 10 per username per 15 minutes (plus a site‑wide cap); invitation/reset link checks 20 per visitor per 15 minutes; wrong “current password” on change‑password 5 per 15 minutes. The login error never reveals whether a username exists.

**Forgotten password (account recovery):** no email is needed. In `/admin/` → 账号与邀请, click **生成重置密码链接** next to the person; send them the link privately; they choose a new password (24‑hour, single‑use link). If *you* forget the admin password: `npm run admin:reset -- 你的用户名` (or `admin:reset:remote` for the live site).

**Ownership in the shared album:** each memory and photo stores the creator’s **account ID** (`owner_id`). The name shown under a memory is the account’s 称呼, not something typed into the form. Items created before accounts existed have no owner (“未归属”); only the administrator can manage them, and you can hand one to a specific account with **指定归属** in `/admin/` → 共同相册 — please do that only based on what you actually know, not by guessing from an old typed name. (On this machine the album was empty when accounts were introduced, so nothing needed assigning.)

**Migration from the shared password:** the old `/api/private/unlock` and `/api/admin/login` endpoints are gone (404), and `ACCESS_PASSWORD` / `ADMIN_PASSWORD` are no longer read anywhere, so they cannot be used as a bypass. You can delete those two lines from your local `.dev.vars`; on Cloudflare, if you ever set them, remove them with `npx wrangler secret delete ACCESS_PASSWORD` and `… ADMIN_PASSWORD`. Your imported private memories, letter, surprise, photos, music and the wishes wall are untouched.

> A note on Cloudflare’s free plan: hashing a password takes noticeably more CPU than other requests. Login, registration and password changes may occasionally exceed the free plan’s 10 ms CPU limit and fail with an error; if that happens repeatedly, the Workers Paid plan (5 USD/month at the time of writing) removes the problem. Everything else is unaffected. This could not be tested locally — the local simulator has no CPU limit.

No build step: the frontend is plain HTML/CSS/ES modules; `wrangler` bundles the Worker on deploy.

---

## 1. Run and preview locally

Requirements: Node.js 18+ (installed via Homebrew on this machine).

```bash
npm install
```

```bash
npm run setup
```

`npm run setup` does everything once:
- creates `.dev.vars` with a random local `SESSION_SECRET`,
- copies `private-assets.example/` → `private-assets/` (git‑ignored),
- creates the local D1 tables,
- imports private content into the local KV.

Then start the site:

```bash
npm run dev
```

Open http://localhost:8787 (admin: http://localhost:8787/admin/).

Automated checks against the running dev server (auth blocking, cookies, wishes, admin; leaves no test data behind):

```bash
npm run test:smoke
```

The test creates throwaway accounts named `smoke_…` and deletes them (and everything they created) at the end. Add `-- --rate` to also test the login rate limit.

A plain static server (e.g. `python3 -m http.server --directory public`) also shows the public pages; the wishes wall and private area then display a clear “backend not connected” message instead of pretending to work.

---

## 2. Accounts, invitations, name, birthday and texts

**Public content** — edit [`public/site.config.js`](public/site.config.js):
- `recipient.name`, `recipient.birthday` (`YYYY-MM-DD`), `recipient.sealLetter` (the character on the wax seal).
  ⚠ The name `董庆鑫` and birthday `2026-11-15` were carried over from the previous site’s config — please confirm them.
- Texts for every section (`opening`, `hero`, `wishes`, `cake`, `wall`, `private`, `footer`, `easterEgg`) and the chapter names (`acts`). `{name}` is replaced automatically.
- `cake.candles` — number of candles (1–12).
- `features` — switches: wishes wall, private area, microphone blowing, the optional “write your wish” field, confetti, the city scene (`cityScene`), rain (`rain`), film grain.
- `audio` — file paths, per‑track volume, and `credits` (attribution lines shown at the bottom of the page).
- `hero.backgroundImage` — optional public mood image, e.g. `/images/hero.jpg`.

This file is public. Don’t put private text in it.

**Set up your administrator account (once)**

With `npm run dev` running, in a second terminal:

```bash
npm run admin:setup
```

It prints a link like `http://localhost:8787/join/#…`. Open it, choose your username, 称呼 and password — done; you are logged in as administrator. The link works once and expires after 24 hours. Once an admin exists, the command refuses to create another one (add `--force` if you really want a second admin).

For the live site, after deploying: `npm run admin:setup:remote -- --base https://你的网址`.

**Invite the birthday person**

1. Open `/admin/` → **账号与邀请** → 邀请一个人. Optionally add a note (只有你看得到), choose how long the link is valid, click **生成邀请链接**.
2. Click **复制链接** and send it to them privately (e.g. a WeChat private chat — not a group). The link is shown only this once; if you lose it, 撤销 it and generate a new one.
3. They open the link and see a welcome card: they choose their own **用户名** (used to log in), **称呼** (shown in the album) and **密码**. After 创建账号并进入 they land in the private area, already logged in.
4. Next time they scroll to 第四幕 珍藏 and log in with that username and password.

**Change, reset, disable**
- Anyone can change their own password: in the private area, **修改密码** (needs the current password).
- Forgotten password: `/admin/` → 生成重置密码链接 (see “Accounts” above).
- `/admin/` → 停用 immediately logs a person out everywhere and blocks login; their album entries stay. 重新启用 undoes it.

## 3. Photos and private content

### Folder structure and naming

```
public/images/                 ← PUBLIC decorative images only (anyone can download these)
  favicon.svg
  hero.jpg                     ← optional, set hero.backgroundImage to '/images/hero.jpg'

private-assets/                ← PRIVATE, git-ignored, never published as static files
  content.json                 ← memories, letter, final surprise (text)
  memories/
    first-day.jpg              ← any name, Chinese is fine: "photos": ["first-day.jpg"]
    照片一.jpg, 照片二.jpg       ← several photos for one memory: "photos": ["照片一.jpg", "照片二.jpg"]
    memory-03.heic             ← iPhone HEIC works on macOS (auto-converted to JPG)
    ...
  surprise/
    surprise.jpg               ← optional photo inside the final gift
```

Rules: any file name (Chinese included; letter case and the extension don't matter when matching); extensions jpg/jpeg/png/webp/gif/heic/avif. Do **not** put real photos in `private-assets.example/` — that folder is committed to the public repo. Any size or orientation is fine — the page crops without stretching, detects portrait photos, and opens the full image in a lightbox (tap/click; arrows, Esc, swipe; “2 / 5” counter). Originals in `private-assets/` are never modified; optimized copies go to KV.

**What visitors see when something is missing**
- A memory without a photo is shown as a text‑only note (no broken image, no filename).
- Anything still containing `【示例】` is **never sent to visitors on the deployed site** — example memories, letter paragraphs and the example gift are dropped by the server. If nothing real is left, the private area shows “这里还在准备中”.
- On `localhost` only, examples and “照片待添加” placeholders (with the expected filename) stay visible, with a dashed “本机预览提示” banner, so you can check the layout.

### Edit the private text

[`private-assets.example/content.json`](private-assets.example/content.json) is the committed **example** (every example line is marked `【示例】`). Your real version is `private-assets/content.json` (git‑ignored). It contains:
- `intro` — heading of the private area
- `memories[]` — `id`, `photos` (list of file names, `[]` for a text‑only memory), `date`, `title`, `text` (as many as you like). The older single `"photo": "memory-01"` form still works; without either, `memory-01`, `memory-02`, … by position. `id` (letters, digits, `-`, `_`) is what stars are saved under — keep it stable when you reorder or edit memories, or existing stars are lost.

**完整版 + 收藏小星星:** on the timeline each memory shows its first photo with a “点击展开完整版” chip (and “共 N 张” when there are several), a shortened text, a ☆ 收藏 button and “展开完整版 ›”. Opening it shows a large photo (thumbnails to switch, 看原图 for the lightbox) next to the full story, with ‹ 上一段 / 下一段 › (also ← → keys, Esc to close). The star is saved per account on the server (D1 table `memory_likes`), so it survives reloads and other devices, and shows who else starred it (“你和 小明 都收藏了”).
- `letter` — `envelopeLabel`, `salutation`, `paragraphs[]`, `closing`, `signature`, `date` (paragraphs unfold one by one)
- `surprise` — `teaser`, `buttonText`, `photo`, `title`, `text`, optional `link` (https only) + `linkText`

### Import (local or production)

```bash
npm run import:local
```

```bash
npm run import:remote
```

The import script validates JSON and filenames, reports which photos are still missing and which photos are not used by any memory, resizes photos to max 2400px plus 960px thumbnails (with Python + Pillow if installed: turned upright by their orientation tag and saved **without EXIF, so no GPS location**; otherwise with macOS `sips`), converts HEIC → JPG, and uploads everything to KV. Re‑run it any time you change text or photos — no code or URL editing. Use `--no-resize` to upload originals. Temporary files are deleted after upload.

---

## 4. Music

Put two files here (exact names), then reload — no code change needed:

```
public/audio/background.mp3    gentle background music, loops
public/audio/birthday.mp3      birthday song after the candles go out
```

Behaviour:
- Nothing plays until the visitor clicks “拆开 · 打开声音” (browser autoplay rules). “先不开声音” enters silently.
- Bottom‑right dock: play/pause, mute, and (on desktop) a volume slider. Mute and volume are remembered in the visitor’s browser; a remembered mute is only lifted when the visitor explicitly chooses “打开声音”, clicks unmute, or drags the volume.
- When the birthday song starts, the background music fades out and pauses; it comes back after the song ends (only if the visitor had it on). Tracks never overlap. Replaying the celebration restarts the song cleanly. Pressing the dock button during the song stops it and leaves everything quiet.
- If the browser refuses playback, the dock shows a short hint instead of failing silently.
- Missing files: the site checks once and keeps working (one 404 per missing file in the console, no retries). Missing `background.mp3` greys out the play button; missing `birthday.mp3` means the cake celebration is silent and the background music simply keeps playing.
- With **neither** file present, the sound dock is hidden and the opening shows a single “拆开邀请” button.
- There is **no synthesized or generated substitute**: only real files in `public/audio/` are ever played.

Current status and licenses (keep this table up to date; `audio.credits` in `site.config.js` is what the site shows at the very bottom of the page):

| File | Status | Title / author | Source | License |
| --- | --- | --- | --- | --- |
| background.mp3 | **added** (your own music, ~3 min, loops through the whole page) | your choice | provided by you | yours — no attribution shown |
| birthday.mp3 | **added** (your own music, ~3.7 min) | your choice | provided by you | yours — no attribution shown |

Both files are your own music (the earlier placeholder track and its footer credit were removed at your request). After the candles are blown out the background music fades out and the birthday song plays; a small “生日歌播放中 · 不想听就点这里关掉” button appears under the cake while it plays. Closing it (or the song ending) brings the background music back, unless the visitor chose to enter silently. Only use music you have the right to use. If your music's license requires attribution, add a line to `audio.credits`; otherwise leave it as `[]` and nothing is shown at the bottom of the page.

---

## 4½. Shared album (共同相册) — adding memories from the website

Inside the private area there is a second album, **“一起写的相册”**, that people can fill **directly in the browser** — no project files, no import command. It sits after your curated memories and before the letter; your curated memories and the `private-assets/` import workflow are unchanged.

**Who can do what:** every logged‑in account can view the album and add memories. Each person sees 修改 / 删除 on **their own** entries (marked 我添加的) and can change the title, date and text or delete the entry (with confirmation; its photos are deleted too). The administrator can do this for every entry, from the album itself or from `/admin/` → 共同相册. The server checks ownership on every edit/delete; a member who calls the API directly for someone else’s entry gets 403. A member can also only attach photos they uploaded themselves.

The name under each memory comes from the creator’s account, not from the form, so it cannot be faked by typing a different name.

**How adding works (for the people using it)**
1. Open the private area → 「＋ 添加回忆」.
2. 选择照片 — from the computer, the phone’s photo library or camera; or drag photos onto the window. Up to 6 photos per memory, previews appear immediately, any one can be removed before saving.
3. Fill in 标题 (required), 是哪一天 / 想说的话 (optional). Text‑only memories are allowed. The window says whose name it will be saved under.
4. 放进相册 — a progress bar and “正在上传第 2 / 3 张…” show progress. On failure the window stays open with the reason and a **重试** button; photos that already uploaded are not uploaded again.
5. The new memory appears at the top of the album and is immediately visible to every other account, on any device.

**What happens to a photo**
- **Formats:** whatever the visitor’s browser can open — JPG, PNG, WebP and GIF everywhere; AVIF in current browsers; **HEIC only in Safari** (iPhone/Mac). The iPhone photo picker normally hands over JPEG anyway; on Windows/Android Chrome a raw `.heic` file is refused with a clear message. Animated GIFs become a still image.
- In the browser each photo is rotated upright using its orientation tag, scaled to at most 2400 px (plus a 900 px thumbnail) and re‑encoded as JPEG. This removes EXIF data, including **GPS location**, camera details and timestamps.
- The server then **checks the bytes really are a JPEG** (not just the file name or MIME type), strips any remaining EXIF/XMP/comment segments as a second line of defence, enforces ≤ 6 MB per photo and ≤ 6000 px per side, and stores it under a random UUID name in the private R2 bucket. Original files never leave the visitor’s device.
- Photos are served only to logged‑in accounts, with `Cache-Control: private, no-cache`. Portrait photos get a taller frame; every photo opens full size in the lightbox (keyboard ← → Esc, swipe, “1 / 3”).
- **Incomplete uploads** (photo uploaded but the memory never saved, e.g. the tab was closed) are not shown to anyone and are deleted automatically after 6 hours.

**Limits (in `src/routes/album.js`, `ALBUM_LIMITS`)**: title ≤ 40 characters, text ≤ 800; 6 photos per memory; 80 photo uploads and 30 memories per account per hour; 3000 photos in total. All uploads and saves require a logged‑in session **and** a same‑origin request (cross‑site requests are rejected even with the cookie).

**Turning it off:** `features.sharedAlbum: false` in `site.config.js` hides it. Text strings are under `album` in the same file.

**Local development:** nothing to set up — `npm run dev` simulates R2 and D1 on your machine (`.wrangler/`). Run `npm run db:migrate:local` once after updating so the new tables exist (already done on this machine).

**Production setup — needs your decision:** R2 must be **activated on your Cloudflare account, and Cloudflare asks for a payment method (card or PayPal) to activate R2 even if you stay within the free allowance.** The free allowance is currently 10 GB of storage plus generous monthly read/write operations — far more than a birthday album needs — but check Cloudflare’s current R2 pricing page before enabling. If you do not want to add a payment method:
- set `features.sharedAlbum: false`, **and**
- delete the `r2_buckets` block from `wrangler.jsonc` (deploy fails if a configured bucket does not exist).
Everything else keeps working without R2.

---

## 5. Database and backend services

Schema: [`migrations/0001_init.sql`](migrations/0001_init.sql) — `messages(id, nickname, content, status, ip_hash, created_at)` and `rate_limits`; [`migrations/0002_album.sql`](migrations/0002_album.sql) — `album_memories` and `album_photos` (photo files themselves are in R2); [`migrations/0003_accounts.sql`](migrations/0003_accounts.sql) — `users`, `sessions`, `invites`, and an `owner_id` column on the album tables; [`migrations/0004_memory_likes.sql`](migrations/0004_memory_likes.sql) — `memory_likes(memory_id, user_id, created_at)` for the stars on private memories.

Settings in [`wrangler.jsonc`](wrangler.jsonc):
- `MESSAGE_MODERATION`: `"off"` (wishes appear immediately; you can hide/delete later) or `"pre"` (new wishes wait for your approval).

Secrets (never commit; see [`.dev.vars.example`](.dev.vars.example)):
- `SESSION_SECRET` — ≥ 32 random chars (`openssl rand -base64 48`); used to salt the anonymous visitor hash on the wishes wall.

There are no passwords in configuration at all: account passwords live only as hashes in D1.

---

## 6. Manage public wishes and the shared album

Open `/admin/` (linked as 管理后台 in the private area when you are logged in as administrator; members get a polite “不是管理员” page). Tabs: **账号与邀请** (see §2), **共同相册** — every memory with its owner and photos; **修改文字**, **指定归属**, or **删除** after a confirmation that says how many photos will be removed — and **公开留言**:
- filter: all / visible / hidden / pending,
- **Hide** or **Show** a wish, **Delete** permanently (with confirmation),
- an anonymous sender tag (first characters of a salted IP hash) helps spot spam from the same visitor.

Wishes wall protections: nickname ≤ 20 chars, message 2–300 chars, control/zero‑width characters stripped, at most one link, honeypot field, minimum fill time, duplicate detection, 3 wishes / 10 min and 20 / day per visitor, global cap 300 / hour. All text is rendered with `textContent` (no HTML injection). No email/phone is collected; raw IPs are not stored.

---

## 7. Deploy (Cloudflare) — what you need to do

You need a free Cloudflare account. Workers, D1 and KV are on the free plan. The shared album additionally needs **R2, which requires adding a payment method to activate** (see “Shared album” above) — or switch the album off. I have **not** deployed, pushed, or created any cloud resources.

```bash
npx wrangler login
```

```bash
npx wrangler d1 create birthday-db
```

```bash
npx wrangler kv namespace create PRIVATE_KV
```

Copy the two printed IDs into `wrangler.jsonc` (`REPLACE_WITH_D1_DATABASE_ID`, `REPLACE_WITH_KV_NAMESPACE_ID`). For the shared album, activate R2 in the dashboard (R2 Object Storage), then create the private bucket — keep it private, don’t enable public access or an r2.dev URL:

```bash
npx wrangler r2 bucket create birthday-album
```

Then:

```bash
npm run db:migrate:remote
```

```bash
npx wrangler secret put SESSION_SECRET
```

```bash
npm run import:remote
```

```bash
npm run deploy
```

The site is then live at `https://birthday-site.<your-subdomain>.workers.dev`. Create your administrator account on the live site (replace the address with yours), open the printed link, and then invite the birthday person from `/admin/`:

```bash
npm run admin:setup:remote -- --base https://birthday-site.<your-subdomain>.workers.dev
```

Local accounts and live accounts are separate databases: the account you create in local preview does not exist on the live site, and vice versa.

**Custom domain `happybirthdaydongqingxin.me`:** add the domain to Cloudflare (change the nameservers at your registrar to Cloudflare’s), then in the Cloudflare dashboard → Workers & Pages → `birthday-site` → Settings → Domains & Routes → Add custom domain. Afterwards turn off GitHub Pages for this repo (Settings → Pages), otherwise GitHub keeps serving the repo (it would now just show this README). The `CNAME` file is only used by GitHub Pages and can be deleted once you move.

**Public repo reminder:** this repository is public on GitHub. Everything committed is visible — that’s why real photos/text live only in git‑ignored `private-assets/` and in KV. Check `git status` before committing; `.dev.vars` and `private-assets/` should never appear.

---

## Project structure

```
public/                    static, public
  index.html               all sections
  site.config.js           public content config
  css/main.css             layout and components
  css/cyber.css            cyberpunk theme: colour tokens, per-act lighting, city, neon, archive, letter, gift
  js/main.js               boot, opening, chapter rail, sound dock, reveals, easter egg
  js/cake.js               SVG cake, candles, wish flow, microphone blowing, replayable celebration
  js/audio.js              background/birthday audio, fades, volume, remembered preferences
  js/wall.js               wishes wall
  js/private.js            login form, memories, lightbox, letter, gift
  js/account.js            password field, change-password window
  js/join.js               invitation registration / password reset page (public/join/)
  js/album.js              shared album: list, “添加回忆” window, in-browser resize/EXIF removal, upload with progress/retry
  js/city.js               photographic street backdrop (layout, glints, rain)
  js/effects.js            confetti, sparkles
  admin/                   admin page: accounts & invitations, shared album, wishes moderation
  _headers                 security headers (CSP etc.)
src/                       Worker backend
  worker.js, routes/, lib/
migrations/                D1 schema
art/                       background photo original, licence notes, grading script (art/grade.py)
scripts/
  setup-local.mjs          one-time local setup
  import-private.mjs       private-assets → KV
  smoke-test.mjs           end-to-end API checks
  admin-invite.mjs         create the admin invitation / an admin password-reset link from the command line
private-assets.example/    committed template (examples only)
private-assets/            your real private files (git-ignored)
```

## Accessibility & motion

Keyboard: every control is a real button (candles too: Tab + Enter/Space); lightbox supports Esc/arrows and keeps focus inside; visible focus rings. `prefers-reduced-motion` disables confetti, dust, grain motion, flicker and long transitions. The microphone is only requested after the visitor clicks “对着麦克风吹气”; if permission is denied the button/candle taps still work.

## Previous version

The old static site is preserved on the local branch `backup/pre-redesign-2026-11-06` (and in Git history).
