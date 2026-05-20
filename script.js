/* =========================================================
   EGGMON — script.js
   - optimized particle system
   - MP3 sound effects with lightweight one-shot pools
   - click handler, counter, copy-to-clipboard
   ========================================================= */

(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =====================================================
     PARTICLE SYSTEM (canvas overlay)
     ===================================================== */
  const canvas = document.getElementById('fx-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  let dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  let resizeFrame = null;

  function resizeNow() {
    dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    canvas.width  = Math.floor(innerWidth  * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width  = innerWidth  + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  /** Airborne drop */
  class Drop {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 5;
      this.vy = 2 + Math.random() * 6;
      this.size = 5 + Math.random() * 11;
      this.life = 1;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.45;
      this.vx *= 0.995;
      const floorY = innerHeight - 10 - Math.random() * 30;
      if (this.y > floorY) {
        splatters.push(new Splatter(this.x, this.y, this.size * 1.3));
        this.life = 0;
      }
      this.life -= 0.005;
    }
    draw() {
      if (this.life <= 0) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
      ctx.globalAlpha = Math.min(1, this.life * 1.4);
      ctx.fillStyle = '#fffdf0';
      ctx.beginPath();
      ctx.ellipse(0, 0, this.size * 0.85, this.size * 1.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(-this.size * 0.25, -this.size * 0.4, this.size * 0.25, this.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,210,180,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.size * 0.85, this.size * 1.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Pooled splatter on the floor */
  class Splatter {
    constructor(x, y, size) {
      this.x = x;
      this.y = Math.min(y, innerHeight - 4);
      this.size = size;
      this.life = 1;
      this.blobs = [];
      const n = 4 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        this.blobs.push({
          ox: (Math.random() - 0.5) * size * 2.5,
          oy: (Math.random() - 0.5) * size * 0.6,
          r:  size * (0.3 + Math.random() * 0.7),
        });
      }
    }
    update() { this.life -= 0.003; }
    draw() {
      if (this.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.life * 1.2);
      ctx.fillStyle = '#fffdf0';
      for (const b of this.blobs) {
        ctx.beginPath();
        ctx.ellipse(this.x + b.ox, this.y + b.oy, b.r, b.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  const particles = [];
  const splatters = [];
  let fxFrame = null;

  function requestFxLoop() {
    if (prefersReducedMotion) return;
    if (fxFrame === null) fxFrame = requestAnimationFrame(loop);
  }

  function stopFxLoop() {
    if (fxFrame !== null) {
      cancelAnimationFrame(fxFrame);
      fxFrame = null;
    }
    particles.length = 0;
    splatters.length = 0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  function loop() {
    fxFrame = null;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (let i = splatters.length - 1; i >= 0; i--) {
      splatters[i].update();
      splatters[i].draw();
      if (splatters[i].life <= 0) splatters.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw();
      if (particles[i].life <= 0) particles.splice(i, 1);
    }

    if (particles.length > 90) particles.splice(0, particles.length - 90);
    if (splatters.length > 120) splatters.splice(0, splatters.length - 120);

    if (particles.length || splatters.length) {
      requestFxLoop();
    } else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFxLoop();
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
    audio.crossOrigin = 'anonymous';
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
      slime: { src: './sounds/slime-squish.mp3', volume: 0.58, size: 5 },
      augh:  { src: './sounds/augh-meme.mp3',    volume: 0.46, size: 2 },
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
      setTimeout(() => playOneShot('augh'), 120);
    }
  }

  /* =====================================================
     CLICK HANDLER on the mascot
     ===================================================== */
  const mascot   = document.getElementById('mascot');
  const countEl  = document.getElementById('count');
  const prompt   = document.getElementById('prompt');
  const EMOJIS   = ['💦', '🥚', '🤤', '😩', '💧', '🫠', '👅'];

  let count = 0;

  function spawnFromMouth() {
    if (prefersReducedMotion) return;

    const rect = mascot.getBoundingClientRect();
    const mouthX = rect.left + rect.width * 0.50;
    const mouthY = rect.top  + rect.height * 0.24;
    const isSmallScreen = innerWidth <= 600;
    const n = (isSmallScreen ? 14 : 20) + Math.floor(Math.random() * (isSmallScreen ? 10 : 12));

    for (let i = 0; i < n; i++) {
      particles.push(new Drop(
        mouthX + (Math.random() - 0.5) * 12,
        mouthY + (Math.random() - 0.5) * 8,
      ));
    }
    requestFxLoop();

    const emoji = document.createElement('div');
    emoji.className = 'pop-emoji';
    emoji.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    emoji.style.left = (rect.left + rect.width * 0.5 + (Math.random() - 0.5) * 80) + 'px';
    emoji.style.top  = (rect.top  + rect.height * 0.18) + 'px';
    document.body.appendChild(emoji);
    setTimeout(() => emoji.remove(), 1200);
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
      try { navigator.vibrate(25); } catch (_) {}
    }
  }

  function handleInteract(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    mascot.classList.remove('is-jolting');
    void mascot.offsetWidth;
    mascot.classList.add('is-jolting');
    spawnFromMouth();
    const nextCount = bumpCounter();
    playEggSound(nextCount);
    vibrate();
  }

  mascot.addEventListener('pointerdown', handleInteract, { passive: false });
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
  const caText  = document.getElementById('ca');
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
