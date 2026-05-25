# EGGMON Site

Official site for **EGGMON ($EGG)** — a Monad-native community memecoin.

This version keeps the site as one main meme landing page while making it friendlier for GeckoTerminal / CoinGecko-style verification:

- Official contract address is visible and copyable on the homepage.
- GeckoTerminal is linked directly from the homepage with a normal dofollow link.
- Nad.fun, Dexscreener, X, and token info are all on the homepage.
- No separate CoinGecko-specific page is included.
- The meme essence stays intact.
- Financial-promise language is cleaned up: “NO PROMISES” and a basic memecoin disclaimer are present.

## Project structure

```txt
eggmon-site/
├── index.html              # main meme landing page + official token info
├── styles.css              # all styles and responsive polish
├── script.js               # particle FX, MP3 sounds, click/copy handlers
├── api/
│   └── count.js            # Vercel Serverless Function for global click count
├── eggmon.png              # mascot PNG fallback
├── eggmon.webp             # optimized mascot source
├── favicon.png             # browser tab icon
├── og-image.jpg            # social-share preview image
├── robots.txt              # crawler access
├── sitemap.xml             # homepage sitemap
├── sounds/
│   ├── slime-squish.mp3
│   └── augh-meme.mp3
└── README.md
```

`R3tards-Regular.otf` should remain in the project root.

## Links to check before deploy

In `index.html`, verify these are still correct:

```txt
Contract: 0xD10cf12099f5Fb424Bc77401DF49f0c785657777
Website:  https://eggmon.fun/
X:        https://x.com/eggmonad
Nad.fun:  https://nad.fun/tokens/0xD10cf12099f5Fb424Bc77401DF49f0c785657777
Dex:      https://dexscreener.com/monad/0xd57e82e32ff8bdb26d5984e4e73c14c2145d8ed4
Gecko:    https://www.geckoterminal.com/monad/tokens/0xd10cf12099f5fb424bc77401df49f0c785657777
```

## GeckoTerminal / CoinGecko listing prep

Use the homepage as the official source of truth. It now includes:

- Name: EGGMON
- Ticker: $EGG
- Chain: Monad
- Contract address
- Official X
- Nad.fun trading link
- Dexscreener chart link
- GeckoTerminal linkback
- Memecoin disclaimer

Before submitting any listing request, verify exact total supply, circulating supply, ownership status, and liquidity details directly from the contract, MonadScan, and active pools. The page intentionally does not invent those values.

## Global counter setup on Vercel

The click counter uses the Vercel API route at:

```txt
/api/count
```

It stores the value in Upstash Redis using the REST API, so you need these Vercel Environment Variables:

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
2. Copy the REST URL and REST Token from the database connection details.
3. In Vercel, open your project → Settings → Environment Variables.
4. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
5. Redeploy the project.

After redeploy, visit:

```txt
https://yourdomain.fun/api/count
```

Healthy response:

```json
{"ok":true,"total":0,"key":"eggmon:global-clicks","storage":"upstash"}
```

## Counter troubleshooting

If you see `404`, the `api/count.js` function was not deployed. Make sure the `api` folder is in the project root, not nested inside another folder.

If you see `Counter backend is not configured`, add:

```txt
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Then redeploy. Vercel does not apply new environment variables to an already-built deployment until you redeploy.

If you see `Redis REST URL must start with https://`, you copied the wrong Upstash URL. Use the HTTPS REST URL from the REST API section, not the `rediss://...` Redis URL.

If the page shows `LOCAL` next to the counter, clicks are working in-browser but the global API is not syncing yet. Check `/api/count` first.

## Run locally

For plain visual testing, open `index.html` directly in a browser.

For local global-counter testing, use Vercel CLI:

```bash
vercel dev
```

## Deploy

- Vercel / Netlify / Cloudflare Pages: connect the repo, no build command needed, publish directory `./`.
- GitHub Pages: works for the static page, but `/api/count` will not run there.
- IPFS / Fleek: same static-folder setup.

## Customize

Colors live as CSS variables at the top of `styles.css`.

Mascot mouth particle position lives in `script.js`, inside `spawnFromMouth()`:

```js
const mouthX = rect.left + rect.width * 0.50;
const mouthY = rect.top  + rect.height * 0.24;
```

## License

The site code is yours to do whatever with. The R3tards display font is by its respective author.

## CUM RETENTION leaderboard

The site now includes a CUM RETENTION leaderboard powered by `/api/retention`.
It reads EGGMON `Transfer` events where the receiver is the EGGMON time-lock contract, groups by sender wallet, and sums repeat sends into one score.

Set these Vercel Environment Variables before deploying the leaderboard live:

```txt
EGGMON_LOCK_ADDRESS=<deployed EGGMONTimeLock contract address>
EGGMON_LOCK_DEPLOY_BLOCK=<deployment block number>
MONAD_RPC_URL=<your Monad mainnet RPC URL>
```

`MONAD_RPC_URL` is optional because the API defaults to `https://rpc.monad.xyz`, but a dedicated RPC is better for reliability. `EGGMON_LOCK_DEPLOY_BLOCK` is required so the API scans only from the lock deployment onward.
