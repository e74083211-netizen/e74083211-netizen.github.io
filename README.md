# Birthday site — public wishes + password‑protected memories

A warm, cinematic birthday gift website (Chinese UI by default):

**Opening invitation → Birthday wishes → Interactive cake (light, wish, blow) → Public wishes wall → Password‑unlocked memories → Unfolding letter → Final gift reveal**

The public part works on its own. The private part (photos, stories, letter, final surprise) only reaches the browser after the server has checked the access password.

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
| `src/worker.js` | Worker (`/api/*`) | Password check, sessions, rate limiting, wishes API, admin API |
| D1 (SQLite) | `DB` binding | Wishes wall messages + rate‑limit counters |
| Workers KV | `PRIVATE_KV` binding | Private text (`content.json`) and private photos |

How the private area is protected:

- The password lives only in a server secret (`ACCESS_PASSWORD`). It is never in HTML/JS.
- Unlocking sets an **HttpOnly, signed session cookie** (HMAC with `SESSION_SECRET`), limited to `/api/private`, `Secure` on HTTPS, valid for `PRIVATE_SESSION_HOURS` (default 12h). Changing the password invalidates all old sessions.
- Private text and photos are served only by `/api/private/content` and `/api/private/media/...`, which return **401** without a valid session. Photos use `Cache-Control: private, no-cache`, so the browser must re‑check the session every time.
- Failed password attempts are rate‑limited (5 per visitor per 15 min, plus a global cap of 60 per 15 min).
- “Leave private area” clears the cookie and removes the content from the page.
- `private-assets/` is git‑ignored and is **never** inside `public/`.
- The admin area uses a **different** password (`ADMIN_PASSWORD`) and a separate cookie; the private‑area password cannot log in to admin, and vice versa.

> The access password controls who can enter — anyone who knows it can see the private area. It does not prove that a specific person is the one visiting.

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
- creates `.dev.vars` with random **local** values for `ACCESS_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET` (open the file to see them),
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

Add `-- http://localhost:8787 --rate` to also test the password rate limit (this locks your local password attempts for 15 minutes; clear with `npx wrangler d1 execute birthday-db --local --command "DELETE FROM rate_limits"`).

A plain static server (e.g. `python3 -m http.server --directory public`) also shows the public pages; the wishes wall and private area then display a clear “backend not connected” message instead of pretending to work.

---

## 2. Change the name, birthday, texts, password

**Public content** — edit [`public/site.config.js`](public/site.config.js):
- `recipient.name`, `recipient.birthday` (`YYYY-MM-DD`), `recipient.sealLetter` (the character on the wax seal).
  ⚠ The name `董庆鑫` and birthday `2026-11-15` were carried over from the previous site’s config — please confirm them.
- Texts for every section (`opening`, `hero`, `wishes`, `cake`, `wall`, `private`, `footer`, `easterEgg`). `{name}` is replaced automatically.
- `cake.candles` — number of candles (1–12).
- `features` — switches: wishes wall, private area, microphone blowing, confetti, floating dust, film grain, synthesized birthday‑song fallback.
- `hero.backgroundImage` — optional public mood image, e.g. `/images/hero.jpg`.

This file is public. Don’t put private text in it.

**Access password**
- Local: edit `ACCESS_PASSWORD` in `.dev.vars`, restart `npm run dev`.
- Production: `npx wrangler secret put ACCESS_PASSWORD` (takes effect immediately; existing sessions are logged out).

---

## 3. Photos and private content

### Folder structure and naming

```
public/images/                 ← PUBLIC decorative images only (anyone can download these)
  favicon.svg
  hero.jpg                     ← optional, set hero.backgroundImage to '/images/hero.jpg'

private-assets/                ← PRIVATE, git-ignored, never published as static files
  content.json                 ← memories, letter, final surprise (text)
  memories/
    memory-01.jpg              ← shown with the 1st memory ("photo": "memory-01")
    memory-02.heic             ← iPhone HEIC works on macOS (auto-converted to JPG)
    memory-03.png
    ...
  surprise/
    surprise.jpg               ← optional photo inside the final gift
```

Rules: lowercase letters, numbers and `-` only; extensions jpg/jpeg/png/webp/gif/heic/avif. Any size or orientation is fine — the page crops nicely, detects portrait photos, and opens the full image in a lightbox (tap/click; arrows, Esc, swipe). Missing photos show a styled placeholder with the expected filename.

### Edit the private text

[`private-assets.example/content.json`](private-assets.example/content.json) is the committed **example** (every example line is marked `【示例】`). Your real version is `private-assets/content.json` (git‑ignored). It contains:
- `intro` — heading of the private area
- `memories[]` — `photo`, `date`, `title`, `text` (as many as you like; `photo` defaults to `memory-01`, `memory-02`, … by position)
- `letter` — `envelopeLabel`, `salutation`, `paragraphs[]`, `closing`, `signature`, `date` (paragraphs unfold one by one)
- `surprise` — `teaser`, `buttonText`, `photo`, `title`, `text`, optional `link` (https only) + `linkText`

### Import (local or production)

```bash
npm run import:local
```

```bash
npm run import:remote
```

The import script validates JSON and filenames, reports which photos are still missing, (on macOS) resizes photos to max 2400px plus 960px thumbnails using the built‑in `sips`, converts HEIC → JPG, and uploads everything to KV. Re‑run it any time you change text or photos — no code or URL editing. Use `--no-resize` to upload originals. Temporary files are deleted after upload.

---

## 4. Music

Put two files here (exact names), then reload — no code change needed:

```
public/audio/background.mp3    gentle background music, loops
public/audio/birthday.mp3      birthday song after the candles go out
```

Behaviour:
- Nothing plays until the visitor clicks “拆开邀请 · 打开声音” (browser autoplay rules). “安静地打开” enters without sound.
- Bottom‑right dock: play/pause background, mute.
- When the birthday song starts, the background music fades out and pauses; it fades back in after the song ends. Tracks never overlap. Background pauses while the tab is hidden.
- Missing files: the site checks once, greys out the play button, and keeps working (one 404 per missing file in the console, no retries).
- If `birthday.mp3` is missing, a **programmatically synthesized music‑box version** of “Happy Birthday” plays (Web Audio oscillators, not a recording and not AI‑generated; the melody is in the public domain). Turn it off with `features.synthBirthdayFallback: false`.

No audio files are included: I did not add tracks of unclear origin. Only use music you have the right to use (e.g. tracks explicitly licensed CC0/CC‑BY or royalty‑free for websites, or your own recording) and note the source/license here:

| File | Title / author | Source URL | License |
| --- | --- | --- | --- |
| background.mp3 | | | |
| birthday.mp3 | | | |

---

## 5. Database and backend services

Schema: [`migrations/0001_init.sql`](migrations/0001_init.sql) — `messages(id, nickname, content, status, ip_hash, created_at)` and `rate_limits`.

Settings in [`wrangler.jsonc`](wrangler.jsonc):
- `MESSAGE_MODERATION`: `"off"` (wishes appear immediately; you can hide/delete later) or `"pre"` (new wishes wait for your approval).
- `PRIVATE_SESSION_HOURS`: how long an unlock lasts (default 12).

Secrets (never commit; see [`.dev.vars.example`](.dev.vars.example)):
- `ACCESS_PASSWORD` — private area password
- `ADMIN_PASSWORD` — admin password, ≥ 8 chars, **must differ** from `ACCESS_PASSWORD`
- `SESSION_SECRET` — ≥ 32 random chars (`openssl rand -base64 48`)

If a secret is missing, the affected area shows “not configured” instead of falling back to anything insecure.

---

## 6. Manage public wishes

Open `/admin/` (not linked from the site), log in with `ADMIN_PASSWORD`:
- filter: all / visible / hidden / pending,
- **Hide** or **Show** a wish, **Delete** permanently (with confirmation),
- an anonymous sender tag (first characters of a salted IP hash) helps spot spam from the same visitor.

Wishes wall protections: nickname ≤ 20 chars, message 2–300 chars, control/zero‑width characters stripped, at most one link, honeypot field, minimum fill time, duplicate detection, 3 wishes / 10 min and 20 / day per visitor, global cap 300 / hour. All text is rendered with `textContent` (no HTML injection). No email/phone is collected; raw IPs are not stored.

---

## 7. Deploy (Cloudflare) — what you need to do

You need a free Cloudflare account. Nothing here costs money on the free plan for a site of this size (Workers, D1 and KV free tiers). I have **not** deployed, pushed, or created any cloud resources.

```bash
npx wrangler login
```

```bash
npx wrangler d1 create birthday-db
```

```bash
npx wrangler kv namespace create PRIVATE_KV
```

Copy the two printed IDs into `wrangler.jsonc` (`REPLACE_WITH_D1_DATABASE_ID`, `REPLACE_WITH_KV_NAMESPACE_ID`). Then:

```bash
npm run db:migrate:remote
```

```bash
npx wrangler secret put ACCESS_PASSWORD
```

```bash
npx wrangler secret put ADMIN_PASSWORD
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

The site is then live at `https://birthday-site.<your-subdomain>.workers.dev`.

**Custom domain `happybirthdaydongqingxin.me`:** add the domain to Cloudflare (change the nameservers at your registrar to Cloudflare’s), then in the Cloudflare dashboard → Workers & Pages → `birthday-site` → Settings → Domains & Routes → Add custom domain. Afterwards turn off GitHub Pages for this repo (Settings → Pages), otherwise GitHub keeps serving the repo (it would now just show this README). The `CNAME` file is only used by GitHub Pages and can be deleted once you move.

**Public repo reminder:** this repository is public on GitHub. Everything committed is visible — that’s why real photos/text live only in git‑ignored `private-assets/` and in KV. Check `git status` before committing; `.dev.vars` and `private-assets/` should never appear.

---

## Project structure

```
public/                    static, public
  index.html               all sections
  site.config.js           public content config
  css/main.css             visual design
  js/main.js               boot, opening, sound dock, reveals, easter egg
  js/cake.js               SVG cake, candles, wish flow, microphone blowing
  js/audio.js              background/birthday audio, fades, ducking, synth fallback
  js/wall.js               wishes wall
  js/private.js            password gate, memories, lightbox, letter, gift
  js/effects.js            dust, confetti, sparkles
  admin/                   moderation page
  _headers                 security headers (CSP etc.)
src/                       Worker backend
  worker.js, routes/, lib/
migrations/                D1 schema
scripts/
  setup-local.mjs          one-time local setup
  import-private.mjs       private-assets → KV
  smoke-test.mjs           end-to-end API checks
private-assets.example/    committed template (examples only)
private-assets/            your real private files (git-ignored)
```

## Accessibility & motion

Keyboard: every control is a real button (candles too: Tab + Enter/Space); lightbox supports Esc/arrows and keeps focus inside; visible focus rings. `prefers-reduced-motion` disables confetti, dust, grain motion, flicker and long transitions. The microphone is only requested after the visitor clicks “对着麦克风吹气”; if permission is denied the button/candle taps still work.

## Previous version

The old static site is preserved on the local branch `backup/pre-redesign-2026-11-06` (and in Git history).
