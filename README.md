# EGGMON Site

The official site for **$EGGMON** — the only egg on Monad.

A single-page site with one tiny Vercel Serverless Function for the global click counter.

## Project structure

```
eggmon-site/
├── index.html              # markup
├── styles.css              # all styles and responsive polish
├── script.js               # particle FX, MP3 sounds, click/copy handlers
├── api/
│   └── count.js            # Vercel Serverless Function for global click count
├── eggmon.png              # mascot PNG fallback
├── eggmon.webp             # optimized mascot source
├── favicon.png             # browser tab icon
├── og-image.jpg            # lighter social-share preview image
├── sounds/
│   ├── slime-squish.mp3
│   └── augh-meme.mp3
└── README.md
```

`R3tards-Regular.otf` is included in this package and must stay in the project root. The CSS expects it there.


## Global counter setup on Vercel

The click counter is now global across visitors. It uses the Vercel API route at:

```txt
/api/count
```

That API route stores the value in Upstash Redis using the REST API, so you need these Vercel Environment Variables:

```txt
UPSTASH_REDIS_REST_URL=your_upstash_https_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_standard_token
```

Optional custom key:

```txt
EGGMON_COUNTER_KEY=eggmon:global-clicks
```

### Setup steps

1. Create a free Upstash Redis database.
2. Copy the **REST URL** and **REST Token** from the database connection details.
3. In Vercel, open your project → **Settings → Environment Variables**.
4. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
5. Redeploy the project.

After redeploy, visit:

```txt
https://yourdomain.fun/api/count
```

You should see:

```json
{"total":0}
```

Then every mascot click will increment the same shared number for everyone.


## Counter troubleshooting

After deploying, open this exact URL in your browser:

```txt
https://yourdomain.fun/api/count
```

Healthy response:

```json
{"ok":true,"total":0,"key":"eggmon:global-clicks","storage":"upstash"}
```

If you see `404`, the `api/count.js` function was not deployed. Make sure the `api` folder is in the project root, not nested inside another folder. In Vercel, the project root should be the folder containing `index.html`, `script.js`, and `api/count.js`.

If you see `Counter backend is not configured`, add either:

```txt
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

or, if you used Vercel KV / Vercel Storage:

```txt
KV_REST_API_URL
KV_REST_API_TOKEN
```

Then redeploy. Vercel does not apply new environment variables to an already-built deployment until you redeploy.

If you see `Redis REST URL must start with https://`, you copied the wrong Upstash URL. Do not use the `rediss://...` Redis URL. Use the HTTPS REST URL from the REST API section.

If the page shows `LOCAL` next to the counter, clicks are working in-browser but the global API is not syncing yet. Check `/api/count` first.

## Run locally

For plain visual testing, you can still open `index.html` directly in a browser, but `/api/count` only works through Vercel or `vercel dev`.

If the font or image misbehaves due to local-file restrictions, serve the folder over HTTP:

```bash
# Python (built-in)
python3 -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

For local global-counter testing, install/use Vercel CLI and run:

```bash
vercel dev
```

You will need local env vars for the Upstash values.

## Deploy to GitHub Pages

GitHub Pages will host the static page, but it will **not** run `/api/count`. Use Vercel if you want the true global counter.

1. Create a new repo on GitHub.
2. Upload everything in this folder to the repo root (or drag-and-drop on github.com).
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)` → Save.
4. Wait a minute. Your site goes live at `https://<your-user>.github.io/<repo-name>/`.

Custom domain? Add a `CNAME` file with your domain, then point a DNS `CNAME` record at `<your-user>.github.io`.

## Deploy elsewhere

- **Vercel / Netlify / Cloudflare Pages**: connect the repo, no build command needed, publish directory `./`.
- **IPFS / Fleek**: same — flat static folder.

## Customize

### Colors

All colors live as CSS variables at the top of `styles.css`:

```css
:root {
  --bg:       #694b87;
  --text:     #000000;
  --mint:     #5feddf;
  --pink:     #ee93e3;
  --magenta:  #a0055d;
  ...
}
```

Change them in one place and the whole site re-themes.

### Links

In `index.html`, search for:

- `nad.fun/tokens/0xD10c…` — the buy button URL
- `x.com/eggmonad` — the Twitter link
- The contract address inside `<span id="ca">…</span>`

### Sound

The site now uses the optimized MP3 files in `/sounds/`:

- `slime-squish.mp3` plays on normal mascot clicks.
- `augh-meme.mp3` plays every 10th mascot click as a meme milestone.

To change the behavior, edit the `playEggSound()` function in `script.js`.

### Mascot mouth position

Inside `script.js`, `spawnFromMouth()`:

```js
const mouthX = rect.left + rect.width * 0.50;
const mouthY = rect.top  + rect.height * 0.24;
```

Tweak the `0.50` and `0.24` fractions to relocate the particle spawn point.

## Browser support

Modern evergreen browsers: Chrome, Firefox, Safari, Edge. iOS Safari 14+ and Android Chrome supported. Audio playback starts from direct user interaction on the mascot click.

## License

The site code is yours to do whatever with. The R3tards display font is by its respective author.


## 2026 UX/audio optimization pass

- Added compressed web sound effects in `/sounds/`.
- Mascot clicks now use the slime squish sound.
- Every 10th mascot click triggers the AAAAUUUGHHHH meme sound as a milestone.
- Added WebP mascot source with PNG fallback.
- Switched social preview metadata to the lighter `og-image.jpg`.
- Added extra reduced-motion and mobile performance safeguards.
- Kept the existing no-mute-button, no-how-to-buy, and `100x SOON` choices.

Note: keep `R3tards-Regular.otf` in the project root from your existing repo. This patch expects it there but does not need to change it.

## v4 patch

- Added larger, smoother drifting paths for the decorative background Eggmons.
- Rebuilt the mascot outer glow so it is no longer clipped by paint containment or hidden behind the image stack.
- Fixed a malformed duplicate `.mobile-buy-bar` CSS block from the previous build.

## Vercel runtime build error fix

If Vercel shows:

```txt
Error: Function Runtimes must have a valid version, for example `now-php@1.0.0`.
```

The problem is an invalid `functions.runtime` override in `vercel.json`.
This package removes that override and lets Vercel auto-detect the Node.js API route at `/api/count.js`.

The `api/count.js` file does not need a custom runtime entry in `vercel.json`.

After replacing `vercel.json`, commit and push, then redeploy.

## v11 readability + desktop background fix

- Increased font sizing across the page for better readability.
- Changed the main `EGGMON` title and subtitle color to `#5feddf`.
- Raised and strengthened the decorative floating Eggmon background layer on desktop while keeping it behind the main content.

## v12 notes

- Removed the sticky mobile bottom buttons (`BUY $EGG` and `COPY CA`).
- Reworked sound playback to use one clean, rate-limited channel per sound so rapid mascot clicks do not stack/glitch.


## v13 sound behavior fix

- Slime squish now plays on every mascot click.
- Slime clicks use a small audio pool, so rapid clicks can overlap naturally instead of being rate-limited.
- The AAAAUUUGHHHH milestone sound now triggers every 10 clicks and plays as a fresh full audio instance so it does not get cut off by later clicks.
