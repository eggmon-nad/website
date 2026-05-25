/* =========================================================
   EGGMON — script.js
   - smooth time-based liquid engine
   - MP3 sound effects with lightweight one-shot pools
   - click handler, counter, copy-to-clipboard
   ========================================================= */

(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =====================================================
     LIQUID EFFECT SYSTEM
     - uses viewport CSS pixels, canvas handles DPR internally
     - RAF only runs while there is visible liquid on screen
     ===================================================== */
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

  let dpr = 1;
  let viewW = 0;
  let viewH = 0;
  let resizeFrame = null;
  let fxFrame = null;
  let lastFrameTime = 0;

  const drops = [];
  const splats = [];
  const bursts = [];
  const strings = [];

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function resizeNow() {
    const isSmall = innerWidth <= 700;
    dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), isSmall ? 1.5 : 2);
    viewW = Math.max(document.documentElement.clientWidth || innerWidth, 1);
    viewH = Math.max(window.innerHeight || document.documentElement.clientHeight, 1);

    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
  }

  function resize() {
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      resizeNow();
    });
  }

  resizeNow();
  addEventListener('resize', resize, { passive: true });
  addEventListener('orientationchange', resize, { passive: true });

  class LiquidBurst {
    constructor(x, y, size = 24, duration = 0.34) {
      this.x = x;
      this.y = y;
      this.size = size;
      this.duration = duration;
      this.age = 0;
      this.angle = rand(-0.35, 0.35);
      this.blobs = Array.from({ length: 7 }, (_, i) => ({
        ox: Math.cos((i / 7) * Math.PI * 2) * rand(0.1, 0.7),
        oy: Math.sin((i / 7) * Math.PI * 2) * rand(0.05, 0.45),
        rx: rand(0.25, 0.62),
        ry: rand(0.20, 0.55),
      }));
    }

    update(dt) {
      this.age += dt / 60;
    }

    get alive() {
      return this.age < this.duration;
    }

    draw() {
      const t = clamp(this.age / this.duration, 0, 1);
      const grow = 0.35 + easeOutCubic(t) * 1.4;
      const alpha = Math.pow(1 - t, 1.25);

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fffdf0';
      ctx.strokeStyle = 'rgba(70, 55, 90, 0.35)';
      ctx.lineWidth = 1.5;

      for (const b of this.blobs) {
        ctx.beginPath();
        ctx.ellipse(
          b.ox * this.size * grow,
          b.oy * this.size * grow,
          b.rx * this.size * grow,
          b.ry * this.size * grow,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
      }

      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(-this.size * 0.18 * grow, -this.size * 0.12 * grow, this.size * 0.18 * grow, this.size * 0.10 * grow, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class LiquidString {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.age = 0;
      this.duration = rand(0.34, 0.48);
      this.length = rand(34, 70);
      this.wobble = rand(-18, 18);
      this.width = rand(4.5, 8);
    }

    update(dt) {
      this.age += dt / 60;
    }

    get alive() {
      return this.age < this.duration;
    }

    draw() {
      const t = clamp(this.age / this.duration, 0, 1);
      const alpha = Math.sin((1 - t) * Math.PI * 0.5);
      const len = this.length * easeOutCubic(t);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#fffdf0';
      ctx.lineWidth = this.width * (1 - t * 0.55);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.bezierCurveTo(
        this.x + this.wobble * 0.4,
        this.y + len * 0.25,
        this.x + this.wobble,
        this.y + len * 0.65,
        this.x + this.wobble * 0.55,
        this.y + len,
      );
      ctx.stroke();

      ctx.fillStyle = '#fffdf0';
      ctx.beginPath();
      ctx.ellipse(this.x + this.wobble * 0.55, this.y + len, this.width * 0.65, this.width * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class LiquidDrop {
    constructor(x, y, reduced = false) {
      const angle = Math.PI / 2 + rand(-0.58, 0.58);
      const speed = reduced ? rand(3.5, 5.5) : rand(5.0, 9.5);
      this.x = x;
      this.y = y;
      this.oldX = x;
      this.oldY = y;
      this.vx = Math.cos(angle) * speed + rand(-1.2, 1.2);
      this.vy = Math.sin(angle) * speed + rand(-0.6, 1.4);
      this.radius = reduced ? rand(4, 8) : rand(5, 13);
      this.life = reduced ? rand(0.40, 0.58) : rand(0.72, 1.05);
      this.floorY = viewH - rand(8, 42);
      this.rotation = rand(-Math.PI, Math.PI);
    }

    update(dt) {
      this.oldX = this.x;
      this.oldY = this.y;

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 0.34 * dt;
      this.vx *= Math.pow(0.989, dt);
      this.rotation += 0.08 * dt;
      this.life -= 0.0085 * dt;

      if (this.y >= this.floorY && this.vy > 0) {
        splats.push(new LiquidSplat(this.x, this.floorY, this.radius * rand(1.4, 2.1)));
        this.life = 0;
      }
    }

    get alive() {
      return this.life > 0 && this.y < viewH + 80;
    }

    draw() {
      if (!this.alive) return;
      const alpha = clamp(this.life * 1.3, 0, 1);
      const stretch = clamp(1 + Math.abs(this.vy) * 0.045, 1, 1.75);

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.strokeStyle = 'rgba(255,253,240,0.62)';
      ctx.lineWidth = Math.max(2, this.radius * 0.45);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.oldX, this.oldY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();

      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2 + this.rotation * 0.04);
      ctx.fillStyle = '#fffdf0';
      ctx.beginPath();
      ctx.ellipse(0, 0, this.radius * 0.82, this.radius * stretch, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(-this.radius * 0.22, -this.radius * 0.42, this.radius * 0.22, this.radius * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(80,60,95,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.radius * 0.82, this.radius * stretch, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  class LiquidSplat {
    constructor(x, y, size) {
      this.x = x;
      this.y = Math.min(y, viewH - 4);
      this.size = size;
      this.life = rand(0.82, 1.08);
      this.age = 0;
      this.blobs = Array.from({ length: 5 + Math.floor(Math.random() * 5) }, () => ({
        ox: rand(-size * 1.35, size * 1.35),
        oy: rand(-size * 0.22, size * 0.28),
        rx: size * rand(0.20, 0.60),
        ry: size * rand(0.12, 0.34),
      }));
    }

    update(dt) {
      this.age += dt / 60;
      this.life -= 0.0045 * dt;
    }

    get alive() {
      return this.life > 0;
    }

    draw() {
      if (!this.alive) return;
      const expand = 0.75 + easeOutCubic(clamp(this.age / 0.24, 0, 1)) * 0.35;
      const alpha = clamp(this.life * 1.15, 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fffdf0';
      ctx.strokeStyle = 'rgba(75, 55, 95, 0.20)';
      ctx.lineWidth = 1;

      for (const b of this.blobs) {
        ctx.beginPath();
        ctx.ellipse(this.x + b.ox * expand, this.y + b.oy, b.rx * expand, b.ry * expand, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, viewW, viewH);
  }

  function requestFxLoop() {
    if (fxFrame !== null) return;
    fxFrame = requestAnimationFrame(loop);
  }

  function stopFxLoop({ clear = false } = {}) {
    if (fxFrame !== null) {
      cancelAnimationFrame(fxFrame);
      fxFrame = null;
    }
    lastFrameTime = 0;
    if (clear) {
      drops.length = 0;
      splats.length = 0;
      bursts.length = 0;
      strings.length = 0;
      clearCanvas();
    }
  }

  function loop(now) {
    fxFrame = null;
    if (!lastFrameTime) lastFrameTime = now;
    const dt = clamp((now - lastFrameTime) / 16.667, 0.5, 2.2);
    lastFrameTime = now;

    clearCanvas();

    for (let i = splats.length - 1; i >= 0; i--) {
      splats[i].update(dt);
      splats[i].draw();
      if (!splats[i].alive) splats.splice(i, 1);
    }

    for (let i = strings.length - 1; i >= 0; i--) {
      strings[i].update(dt);
      strings[i].draw();
      if (!strings[i].alive) strings.splice(i, 1);
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      bursts[i].update(dt);
      bursts[i].draw();
      if (!bursts[i].alive) bursts.splice(i, 1);
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      drops[i].update(dt);
      drops[i].draw();
      if (!drops[i].alive) drops.splice(i, 1);
    }

    if (drops.length > 120) drops.splice(0, drops.length - 120);
    if (splats.length > 140) splats.splice(0, splats.length - 140);
    if (bursts.length > 14) bursts.splice(0, bursts.length - 14);
    if (strings.length > 18) strings.splice(0, strings.length - 18);

    if (drops.length || splats.length || bursts.length || strings.length) {
      requestFxLoop();
    } else {
      lastFrameTime = 0;
      clearCanvas();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFxLoop({ clear: true });
  });

  /* =====================================================
     SOUND EFFECTS
     - slime stacks on every mascot click using a small audio pool
     - augh triggers every 10 clicks and is never cut off/restarted
     ===================================================== */
  const SLIME_SRC = './sounds/slime-squish.mp3';
  const AUGH_SRC = './sounds/augh-meme.mp3';
  const HYPER_ORGASM_SRC = './sounds/hyper-orgasm.mp3';
  const MAX_ACTIVE_SLIMES = 12;
  const activeSlimes = new Set();

  function createAudio(src, volume) {
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audio.volume = volume;
    return audio;
  }

  function playSlimeStacked() {
    try {
      // Use a fresh instance per click so the slime never gets restarted/cut by rapid clicking.
      const audio = createAudio(SLIME_SRC, 0.48);
      activeSlimes.add(audio);

      const cleanup = () => {
        activeSlimes.delete(audio);
        audio.removeEventListener('ended', cleanup);
        audio.removeEventListener('error', cleanup);
      };
      audio.addEventListener('ended', cleanup);
      audio.addEventListener('error', cleanup);

      if (activeSlimes.size > MAX_ACTIVE_SLIMES) {
        const oldest = activeSlimes.values().next().value;
        if (oldest && oldest !== audio) {
          try { oldest.pause(); } catch (_) {}
          activeSlimes.delete(oldest);
        }
      }

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(cleanup);
    } catch (_) {}
  }

  function playAughFull() {
    try {
      const audio = createAudio(AUGH_SRC, 0.42);
      const cleanup = () => {
        audio.removeEventListener('ended', cleanup);
        audio.removeEventListener('error', cleanup);
      };
      audio.addEventListener('ended', cleanup);
      audio.addEventListener('error', cleanup);

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(cleanup);
    } catch (_) {}
  }

  function playHyperOrgasmOnce() {
    try {
      const audio = createAudio(HYPER_ORGASM_SRC, 0.74);
      audio.loop = false;
      audio.currentTime = 0;

      const cleanup = () => {
        audio.removeEventListener('ended', cleanup);
        audio.removeEventListener('error', cleanup);
      };
      audio.addEventListener('ended', cleanup);
      audio.addEventListener('error', cleanup);

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(cleanup);
    } catch (_) {}
  }

  let audioWarmed = false;

  function warmAudio() {
    if (audioWarmed) return;
    audioWarmed = true;
    // Browsers unlock audio on user gesture; metadata preloading avoids the worst first-play lag.
    createAudio(SLIME_SRC, 0.48).load();
    createAudio(AUGH_SRC, 0.42).load();
    createAudio(HYPER_ORGASM_SRC, 0.74).load();
  }

  window.addEventListener('pointerdown', warmAudio, { once: true, passive: true });

  function playEggSound(nextCount) {
    playSlimeStacked();
    if (nextCount > 0 && nextCount % 10 === 0) {
      window.setTimeout(playAughFull, 80);
    }
  }

  /* =====================================================
     CLICK HANDLER on the mascot
     ===================================================== */
  const mascot = document.getElementById('mascot');
  const countEl = document.getElementById('count');
  const prompt = document.getElementById('prompt');
  const EMOJIS = ['💦', '🥚', '🤤', '😩', '💧', '👅'];
  const COUNTER_API = `${window.location.origin}/api/count`;
  const LOCAL_COUNTER_KEY = 'eggmon-local-clicks-v1';
  const TOKEN_ADDRESS = '0xD10cf12099f5Fb424Bc77401DF49f0c785657777';
  const TOKEN_SYMBOL = 'EGG';
  const TOKEN_DECIMALS = 18;
  const TOKEN_IMAGE_URL = `${window.location.origin}/favicon.png`;
  const DEXSCREENER_PAIR_API = 'https://api.dexscreener.com/latest/dex/pairs/monad/0xd57e82e32ff8bdb26d5984e4e73c14c2145d8ed4';
  const MARKET_REFRESH_MS = 60_000;
  const BLAST_MIN = 133;
  const BLAST_MAX = 333;
  const BLAST_STEPS = BLAST_MAX - BLAST_MIN + 1;

  const marketEls = {
    status: document.getElementById('market-status'),
    price: document.getElementById('market-price'),
    cap: document.getElementById('market-cap'),
    volume: document.getElementById('market-volume'),
    liquidity: document.getElementById('market-liquidity'),
    change: document.getElementById('market-change'),
  };

  const blastEls = {
    status: document.getElementById('blast-status'),
    fill: document.getElementById('blast-meter-fill'),
    detail: document.getElementById('blast-detail'),
  };

  let count = 0;
  let lastPointerAt = 0;
  let globalCounterOnline = false;
  let warnedCounterOffline = false;

  function parseCounterValue(value) {
    const parsed = Number.parseInt(String(value ?? '0'), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function readLocalCount() {
    try {
      return parseCounterValue(localStorage.getItem(LOCAL_COUNTER_KEY));
    } catch (_) {
      return 0;
    }
  }

  function writeLocalCount(value) {
    try {
      localStorage.setItem(LOCAL_COUNTER_KEY, String(parseCounterValue(value)));
    } catch (_) {}
  }

  function formatUsd(value, { compact = true, maxFractionDigits = 2 } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: maxFractionDigits,
    }).format(number);
  }

  function formatTokenPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '--';
    if (number < 0.000001) return `$${number.toExponential(2)}`;
    if (number < 0.01) return `$${number.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
    return formatUsd(number, { compact: false, maxFractionDigits: 6 });
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    const sign = number > 0 ? '+' : '';
    return `${sign}${number.toFixed(2)}%`;
  }

  function setMarketStatus(text, mode = '') {
    if (!marketEls.status) return;
    marketEls.status.textContent = text;
    marketEls.status.classList.toggle('is-live', mode === 'live');
    marketEls.status.classList.toggle('is-error', mode === 'error');
  }

  async function fetchMarketStats() {
    if (!marketEls.price) return;
    setMarketStatus('Updating');

    try {
      const response = await fetch(DEXSCREENER_PAIR_API, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) throw new Error(`Dexscreener returned ${response.status}`);

      const data = await response.json();
      const pair = data.pair || (Array.isArray(data.pairs) ? data.pairs[0] : null);
      if (!pair) throw new Error('No $EGG pair found');

      const marketCap = pair.marketCap || pair.fdv;
      marketEls.price.textContent = formatTokenPrice(pair.priceUsd);
      marketEls.cap.textContent = formatUsd(marketCap);
      marketEls.volume.textContent = formatUsd(pair.volume?.h24);
      marketEls.liquidity.textContent = formatUsd(pair.liquidity?.usd);
      marketEls.change.textContent = formatPercent(pair.priceChange?.h24);
      setMarketStatus('Live', 'live');
    } catch (error) {
      console.warn('[EGGMON] Market stats unavailable:', error);
      setMarketStatus('Retrying', 'error');
      marketEls.price.textContent = marketEls.price.textContent === '--' ? 'Stats sleeping' : marketEls.price.textContent;
    }
  }

  function getBlastState(total) {
    const safeTotal = parseCounterValue(total);
    const offset = safeTotal % BLAST_STEPS;
    const cycleCount = BLAST_MIN + offset;
    const rawProgress = ((cycleCount - BLAST_MIN) / (BLAST_MAX - BLAST_MIN)) * 100;
    const progress = cycleCount === BLAST_MIN ? 2 : Math.max(2, Math.min(100, rawProgress));

    let label = 'WARMING UP';
    if (progress >= 99) label = '💦 FULL RELEASE';
    else if (progress >= 88) label = '🚨 RELEASE IMMINENT';
    else if (progress >= 66) label = 'DANGEROUSLY LOADED';
    else if (progress >= 33) label = 'PRESSURE RISING';

    return { cycleCount, progress, label, isRelease: cycleCount === BLAST_MAX };
  }

  function updateBlastStatus(total) {
    if (!blastEls.status || !blastEls.fill || !blastEls.detail) return;
    const state = getBlastState(total);
    blastEls.status.textContent = state.label;
    blastEls.fill.style.width = `${state.progress}%`;
    blastEls.detail.textContent = `${state.cycleCount.toLocaleString()} / ${BLAST_MAX.toLocaleString()} pressure built`;
  }

  function setCounter(value, { localFallback = false } = {}) {
    count = parseCounterValue(value);
    if (countEl) {
      countEl.textContent = count.toLocaleString();
      countEl.title = localFallback
        ? 'Local fallback count. Global backend is not syncing yet.'
        : 'Global click count';
      countEl.dataset.counterMode = localFallback ? 'local' : 'global';
    }
    updateBlastStatus(count);
    if (count > 0 && prompt) prompt.classList.add('is-hidden');
  }

  function popCounter() {
    if (!countEl) return;
    countEl.classList.remove('is-popping');
    void countEl.offsetWidth;
    countEl.classList.add('is-popping');
  }

  async function readCounterResponse(response) {
    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error(`Counter API returned non-JSON response: ${text.slice(0, 80)}`);
    }

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Counter API returned ${response.status}`);
    }

    return data;
  }

  let pendingClicks = 0;
  let pendingOptimisticCount = 0;
  let syncTimer = null;
  let syncInFlight = false;

  function buildCounterUrl(delta = 0) {
    const url = new URL(COUNTER_API);
    if (delta > 1) url.searchParams.set('delta', String(delta));
    return url.toString();
  }

  async function fetchGlobalCount() {
    const localCount = readLocalCount();
    if (localCount > 0) setCounter(localCount, { localFallback: true });

    try {
      const response = await fetch(COUNTER_API, {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
      });

      const data = await readCounterResponse(response);
      globalCounterOnline = true;
      setCounter(data.total);
    } catch (error) {
      globalCounterOnline = false;
      console.warn('[EGGMON] Global counter unavailable:', error);
    }
  }

  function scheduleGlobalSync() {
    if (syncTimer !== null || syncInFlight) return;
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      flushGlobalClicks();
    }, 420);
  }

  async function flushGlobalClicks({ keepalive = false } = {}) {
    if (syncInFlight || pendingClicks <= 0) return;

    const delta = clamp(pendingClicks, 1, 25);
    const optimisticCount = pendingOptimisticCount || count;
    pendingClicks -= delta;
    syncInFlight = true;

    try {
      const response = await fetch(buildCounterUrl(delta), {
        method: 'POST',
        cache: 'no-store',
        keepalive,
        headers: { 'Accept': 'application/json' },
      });

      const data = await readCounterResponse(response);
      const serverCount = parseCounterValue(data.total);
      globalCounterOnline = true;
      warnedCounterOffline = false;

      // Avoid older, slower responses rolling the UI backwards after fast clicks.
      if (serverCount >= count || count <= optimisticCount) {
        setCounter(serverCount);
        writeLocalCount(serverCount);
      }
    } catch (error) {
      globalCounterOnline = false;
      console.warn('[EGGMON] Could not sync global click:', error);

      if (!warnedCounterOffline) {
        warnedCounterOffline = true;
        showToast('GLOBAL COUNTER NOT SYNCING — LOCAL MODE');
      }

      setCounter(optimisticCount, { localFallback: true });
    } finally {
      syncInFlight = false;
      if (pendingClicks > 0) scheduleGlobalSync();
    }
  }

  function syncGlobalClick(optimisticCount) {
    writeLocalCount(optimisticCount);
    pendingClicks += 1;
    pendingOptimisticCount = optimisticCount;
    scheduleGlobalSync();
  }

  fetchGlobalCount();
  updateBlastStatus(count);
  fetchMarketStats();
  window.setInterval(fetchMarketStats, MARKET_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushGlobalClicks({ keepalive: true });
  });

  window.addEventListener('pagehide', () => {
    flushGlobalClicks({ keepalive: true });
  });


  function createEmoji(x, y) {
    const emoji = document.createElement('div');
    emoji.className = 'pop-emoji';
    emoji.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    emoji.style.left = `${x}px`;
    emoji.style.top = `${y}px`;
    document.body.appendChild(emoji);
    setTimeout(() => emoji.remove(), 1200);
  }

  function spawnEmojisAroundMascot(rect, isSmallScreen) {
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.48;
    const radiusX = rect.width * 0.58 + (isSmallScreen ? 14 : 24);
    const radiusY = rect.height * 0.54 + (isSmallScreen ? 10 : 18);
    const emojiCount = isSmallScreen ? 2 : 3;
    const usedAngles = [];

    for (let i = 0; i < emojiCount; i++) {
      let angle = rand(0, Math.PI * 2);

      for (let tries = 0; tries < 6; tries++) {
        const tooClose = usedAngles.some((a) => Math.abs(a - angle) < 0.9);
        if (!tooClose) break;
        angle = rand(0, Math.PI * 2);
      }

      usedAngles.push(angle);

      const x = centerX + Math.cos(angle) * radiusX + rand(-8, 8);
      const y = centerY + Math.sin(angle) * radiusY + rand(-8, 8);
      createEmoji(x, y);
    }
  }

  function spawnLiquidFromHead() {
    const rect = mascot.getBoundingClientRect();

    // Source point anchored at the top-center of Eggmon's head.
    const headX = rect.left + rect.width * 0.505;
    const headY = rect.top + rect.height * 0.055;
    const reduced = prefersReducedMotion.matches;
    const isSmallScreen = innerWidth <= 600;

    bursts.push(new LiquidBurst(headX, headY, isSmallScreen ? 20 : 28, reduced ? 0.18 : 0.34));
    bursts.push(new LiquidBurst(headX + rand(-8, 8), headY + rand(8, 18), isSmallScreen ? 14 : 20, reduced ? 0.16 : 0.28));

    const stringCount = reduced ? 1 : (isSmallScreen ? 2 : 3);
    for (let i = 0; i < stringCount; i++) {
      strings.push(new LiquidString(headX + rand(-10, 10), headY + rand(4, 12)));
    }

    const dropCount = reduced ? 6 : (isSmallScreen ? 14 : 28);
    for (let i = 0; i < dropCount; i++) {
      drops.push(new LiquidDrop(
        headX + rand(-14, 14),
        headY + rand(-4, 12),
        reduced,
      ));
    }

    spawnEmojisAroundMascot(rect, isSmallScreen);
    requestFxLoop();
  }

  let hyperBlastTimer = null;

  function triggerHyperBlast() {
    document.querySelectorAll('.hyper-blast').forEach((node) => node.remove());
    window.clearTimeout(hyperBlastTimer);

    const blast = document.createElement('div');
    blast.className = 'hyper-blast';
    blast.setAttribute('aria-hidden', 'true');

    const wash = document.createElement('div');
    wash.className = 'hyper-blast__wash';
    blast.appendChild(wash);

    const foam = document.createElement('div');
    foam.className = 'hyper-blast__foam';
    blast.appendChild(foam);

    const blobCount = innerWidth <= 640 ? 16 : 28;
    for (let i = 0; i < blobCount; i++) {
      const blob = document.createElement('span');
      blob.className = 'hyper-blast__blob';
      blob.style.setProperty('--x', String(rand(-6, 100)));
      blob.style.setProperty('--s', `${rand(42, innerWidth <= 640 ? 130 : 210)}px`);
      blob.style.setProperty('--d', `${rand(1.45, 2.35)}s`);
      blob.style.setProperty('--delay', `${rand(0, 0.42)}s`);
      blob.style.setProperty('--r', `${rand(-28, 28)}deg`);
      blast.appendChild(blob);
    }

    document.body.appendChild(blast);
    document.body.classList.add('is-hyper-blasting');
    playHyperOrgasmOnce();

    if ('vibrate' in navigator) {
      try { navigator.vibrate([60, 40, 90, 40, 140]); } catch (_) {}
    }

    hyperBlastTimer = window.setTimeout(() => {
      document.body.classList.remove('is-hyper-blasting');
      blast.remove();
    }, 3600);
  }

  function bumpCounter() {
    const optimisticCount = count + 1;
    setCounter(optimisticCount);
    popCounter();
    syncGlobalClick(optimisticCount);

    if (getBlastState(optimisticCount).isRelease) {
      triggerHyperBlast();
    }

    return optimisticCount;
  }

  function vibrate() {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(22); } catch (_) {}
    }
  }

  function handleInteract(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const now = performance.now();
    if (e && e.type === 'click' && now - lastPointerAt < 550) return;
    if (e && e.type === 'pointerdown') lastPointerAt = now;

    mascot.classList.remove('is-jolting');
    void mascot.offsetWidth;
    mascot.classList.add('is-jolting');

    spawnLiquidFromHead();
    const nextCount = bumpCounter();
    playEggSound(nextCount);
    vibrate();
  }

  mascot.addEventListener('pointerdown', handleInteract, { passive: false });
  mascot.addEventListener('click', handleInteract, { passive: false });
  mascot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleInteract(e);
    }
  });

  /* =====================================================
     TOKEN INFO MODAL
     ===================================================== */
  const tokenInfoOpen = document.getElementById('token-info-open');
  const tokenInfoModal = document.getElementById('token-info-modal');
  const tokenInfoDialog = document.getElementById('token-info');
  const tokenInfoCloseTriggers = document.querySelectorAll('[data-token-info-close]');
  let lastTokenInfoFocus = null;

  function isTokenInfoOpen() {
    return tokenInfoModal && tokenInfoModal.classList.contains('is-open');
  }

  function openTokenInfo() {
    if (!tokenInfoModal || !tokenInfoDialog) return;
    tokenInfoModal.hidden = false;
    tokenInfoOpen?.setAttribute('aria-expanded', 'true');
    lastTokenInfoFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tokenInfoModal.classList.add('is-open');
    tokenInfoModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-token-info-modal');
    requestAnimationFrame(() => tokenInfoDialog.focus({ preventScroll: true }));
  }

  function closeTokenInfo() {
    if (!tokenInfoModal || !tokenInfoDialog) return;
    tokenInfoModal.classList.remove('is-open');
    tokenInfoModal.setAttribute('aria-hidden', 'true');
    tokenInfoOpen?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-token-info-modal');
    window.setTimeout(() => {
      if (!tokenInfoModal.classList.contains('is-open')) tokenInfoModal.hidden = true;
    }, 160);
    if (lastTokenInfoFocus && typeof lastTokenInfoFocus.focus === 'function') {
      lastTokenInfoFocus.focus({ preventScroll: true });
    }
  }

  function trapTokenInfoFocus(e) {
    if (!isTokenInfoOpen() || e.key !== 'Tab' || !tokenInfoDialog) return;
    const focusable = Array.from(tokenInfoDialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (tokenInfoOpen) {
    tokenInfoOpen.addEventListener('click', openTokenInfo);
  }

  tokenInfoCloseTriggers.forEach((trigger) => {
    trigger.addEventListener('click', closeTokenInfo);
  });

  document.addEventListener('keydown', (e) => {
    if (!isTokenInfoOpen()) return;
    if (e.key === 'Escape') closeTokenInfo();
    trapTokenInfoFocus(e);
  });

  /* =====================================================
     FAQ MODAL
     ===================================================== */
  const faqOpen = document.getElementById('faq-open');
  const faqModal = document.getElementById('faq-modal');
  const faqDialog = document.getElementById('faq-dialog');
  const faqCloseTriggers = document.querySelectorAll('[data-faq-close]');
  let lastFaqFocus = null;

  function isFaqOpen() {
    return faqModal && faqModal.classList.contains('is-open');
  }

  function openFaq() {
    if (!faqModal || !faqDialog) return;
    faqModal.hidden = false;
    faqOpen?.setAttribute('aria-expanded', 'true');
    lastFaqFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    faqModal.classList.add('is-open');
    faqModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-token-info-modal');
    requestAnimationFrame(() => faqDialog.focus({ preventScroll: true }));
  }

  function closeFaq() {
    if (!faqModal || !faqDialog) return;
    faqModal.classList.remove('is-open');
    faqModal.setAttribute('aria-hidden', 'true');
    faqOpen?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-token-info-modal');
    window.setTimeout(() => {
      if (!faqModal.classList.contains('is-open')) faqModal.hidden = true;
    }, 160);
    if (lastFaqFocus && typeof lastFaqFocus.focus === 'function') {
      lastFaqFocus.focus({ preventScroll: true });
    }
  }

  function trapFaqFocus(e) {
    if (!isFaqOpen() || e.key !== 'Tab' || !faqDialog) return;
    const focusable = Array.from(faqDialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (faqOpen) faqOpen.addEventListener('click', openFaq);
  faqCloseTriggers.forEach((trigger) => trigger.addEventListener('click', closeFaq));

  document.addEventListener('keydown', (e) => {
    if (!isFaqOpen()) return;
    if (e.key === 'Escape') closeFaq();
    trapFaqFocus(e);
  });

  /* =====================================================
     COPY CONTRACT ADDRESS
     ===================================================== */
  const copyBtn = document.getElementById('copy');
  const caText = document.getElementById('ca');
  const caBar = document.querySelector('.ca-bar');
  const toast = document.getElementById('toast');
  let toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 1800);
  }

  async function addEggToWallet() {
    const provider = window.ethereum;
    if (!provider || typeof provider.request !== 'function') {
      showToast('OPEN IN A WEB3 WALLET TO ADD $EGG');
      return;
    }

    try {
      const wasAdded = await provider.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: TOKEN_ADDRESS,
            symbol: TOKEN_SYMBOL,
            decimals: TOKEN_DECIMALS,
            image: TOKEN_IMAGE_URL,
          },
        },
      });
      showToast(wasAdded ? '$EGG ADDED TO WALLET' : 'WALLET DID NOT ADD $EGG');
    } catch (error) {
      console.warn('[EGGMON] Could not add token to wallet:', error);
      showToast('WALLET ADD FAILED — COPY CA INSTEAD');
    }
  }

  const addWalletBtn = document.getElementById('add-wallet');
  if (addWalletBtn) addWalletBtn.addEventListener('click', addEggToWallet);

  async function copyContract(triggerBtn) {
    const text = caText.textContent.trim();
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (_) {}

    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }

    showToast(ok ? 'CA COPIED — VERIFY BEFORE BUYING' : 'COPY FAILED — TRY AGAIN');

    if (triggerBtn) {
      const original = triggerBtn.dataset.originalText || triggerBtn.textContent;
      triggerBtn.dataset.originalText = original;
      triggerBtn.textContent = ok ? 'COPIED ✓' : 'OOPS';
      triggerBtn.classList.add('is-copied');
      setTimeout(() => {
        triggerBtn.textContent = original;
        triggerBtn.classList.remove('is-copied');
      }, 1400);
    }
  }

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await copyContract(copyBtn);
  });


  if (caBar) {
    caBar.addEventListener('click', async (e) => {
      if (e.target.closest('button')) return;
      await copyContract(copyBtn);
    });
    caBar.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        await copyContract(copyBtn);
      }
    });
  }
})();
