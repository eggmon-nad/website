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
     - slime squish: normal mascot click
     - AAAAUUUGHHHH: every 10th click as a meme milestone
     ===================================================== */
  const audioPools = new Map();

  function makeAudio(src, volume) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = volume;
    return audio;
  }

  function getPool(name, src, volume, size = 4) {
    if (!audioPools.has(name)) {
      audioPools.set(name, {
        index: 0,
        items: Array.from({ length: size }, () => makeAudio(src, volume)),
      });
    }
    return audioPools.get(name);
  }

  function playOneShot(name) {
    const config = {
      slime: { src: './sounds/slime-squish.mp3', volume: 0.64, size: 5 },
      augh:  { src: './sounds/augh-meme.mp3',    volume: 0.48, size: 2 },
    }[name];
    if (!config) return;

    const pool = getPool(name, config.src, config.volume, config.size);
    const audio = pool.items[pool.index];
    pool.index = (pool.index + 1) % pool.items.length;

    try {
      audio.pause();
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
    } catch (_) {}
  }

  function playEggSound(nextCount) {
    playOneShot('slime');
    if (nextCount > 0 && nextCount % 10 === 0) {
      setTimeout(() => playOneShot('augh'), 110);
    }
  }

  /* =====================================================
     CLICK HANDLER on the mascot
     ===================================================== */
  const mascot = document.getElementById('mascot');
  const countEl = document.getElementById('count');
  const prompt = document.getElementById('prompt');
  const EMOJIS = ['💦', '🥚', '🤤', '😩', '💧', '🫠', '👅'];

  let count = 0;
  let lastPointerAt = 0;

  function createEmoji(x, y) {
    const emoji = document.createElement('div');
    emoji.className = 'pop-emoji';
    emoji.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    emoji.style.left = `${x + rand(-42, 42)}px`;
    emoji.style.top = `${y - rand(8, 28)}px`;
    document.body.appendChild(emoji);
    setTimeout(() => emoji.remove(), 1200);
  }

  function spawnLiquidFromMouth() {
    const rect = mascot.getBoundingClientRect();

    // Tuned to this mascot image: center of the lips/mouth opening.
    const mouthX = rect.left + rect.width * 0.505;
    const mouthY = rect.top + rect.height * 0.305;
    const reduced = prefersReducedMotion.matches;
    const isSmallScreen = innerWidth <= 600;

    bursts.push(new LiquidBurst(mouthX, mouthY, isSmallScreen ? 20 : 28, reduced ? 0.18 : 0.34));
    bursts.push(new LiquidBurst(mouthX + rand(-6, 6), mouthY + rand(5, 12), isSmallScreen ? 14 : 20, reduced ? 0.16 : 0.28));

    const stringCount = reduced ? 1 : (isSmallScreen ? 2 : 3);
    for (let i = 0; i < stringCount; i++) {
      strings.push(new LiquidString(mouthX + rand(-8, 8), mouthY + rand(2, 7)));
    }

    const dropCount = reduced ? 8 : (isSmallScreen ? 24 : 34);
    for (let i = 0; i < dropCount; i++) {
      drops.push(new LiquidDrop(
        mouthX + rand(-12, 12),
        mouthY + rand(-6, 10),
        reduced,
      ));
    }

    createEmoji(rect.left + rect.width * 0.5, rect.top + rect.height * 0.18);
    requestFxLoop();
  }

  function bumpCounter() {
    count++;
    countEl.textContent = count.toLocaleString();
    countEl.classList.remove('is-popping');
    void countEl.offsetWidth;
    countEl.classList.add('is-popping');
    if (count === 1 && prompt) prompt.classList.add('is-hidden');
    return count;
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

    spawnLiquidFromMouth();
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
     COPY CONTRACT ADDRESS
     ===================================================== */
  const copyBtn = document.getElementById('copy');
  const copyMobileBtn = document.getElementById('copyMobile');
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

  if (copyMobileBtn) {
    copyMobileBtn.addEventListener('click', async () => {
      await copyContract(copyMobileBtn);
    });
  }

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
