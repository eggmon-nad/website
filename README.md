# EGGMON Site

The official site for **$EGGMON** — the only egg on Monad.

A single-page, dependency-free static site. No build step. Drop it on any host.

## Project structure

```
eggmon-site/
├── index.html              # markup
├── styles.css              # all styles and responsive polish
├── script.js               # particle FX, MP3 sounds, click/copy handlers
├── eggmon.png              # mascot PNG fallback
├── eggmon.webp             # optimized mascot source
├── favicon.png             # browser tab icon
├── og-image.jpg            # lighter social-share preview image
├── sounds/
│   ├── slime-squish.mp3
│   └── augh-meme.mp3
└── README.md
```

Keep your existing `R3tards-Regular.otf` in the project root. The CSS still expects it there.

## Run locally

Open `index.html` directly in any modern browser. Done.

If the font or image misbehaves due to local-file restrictions, serve the folder over HTTP:

```bash
# Python (built-in)
python3 -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

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
