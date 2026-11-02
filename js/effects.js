/* ═══════════════════════════════════════════════════════════════════
 *  effects.js — Visual Effects Engine for Birthday Website
 *  
 *  Provides particle systems, starfields, confetti, fireworks,
 *  and interactive star-sky effects. All rendering uses vanilla
 *  Canvas 2D or DOM manipulation — zero external dependencies.
 *
 *  Exposed as a single global: `Effects`
 * ═══════════════════════════════════════════════════════════════════ */

const Effects = (function () {
  'use strict';

  /* ─────────────────────────────────────────────
   *  Utility helpers shared across all sub-systems
   * ───────────────────────────────────────────── */
  const utils = {
    /** Linear interpolation between a and b at factor t */
    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    /** Random float in [min, max) */
    random(min, max) {
      return Math.random() * (max - min) + min;
    },

    /** Random integer in [min, max] inclusive */
    randomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1) + min);
    },

    /** True when the user has enabled "prefers reduced motion" */
    prefersReducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /**
     * Resize a canvas element so it matches its CSS-layout size
     * while accounting for devicePixelRatio (retina displays).
     * Returns true if the canvas was actually resized.
     */
    resizeCanvas(canvas) {
      if (!canvas) return false;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
      }
      return false;
    },

    /** Pick a random element from an array */
    pick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },
  };


  /* ═══════════════════════════════════════════════════════════════════
   *  1. Particle System — floating light motes for the opening section
   *     Canvas: #openingCanvas
   * ═══════════════════════════════════════════════════════════════════ */
  const particles = {
    canvas: null,
    ctx: null,
    particles: [],
    burstParticles: [],
    animationId: null,
    _resizeHandler: null,

    /* ── Colour palette for ambient particles ── */
    COLORS: ['#d4a574', '#faf3e8', '#7c6f9c'],

    /* ── Colour palette for burst particles ── */
    BURST_COLORS: ['#d4a574', '#ffffff', '#ffe8c8', '#fffbe6'],

    /**
     * Initialise the particle system on the given canvas.
     * Creates initial particles and starts the render loop.
     */
    init(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      utils.resizeCanvas(this.canvas);

      /* Create initial set of ambient particles */
      const count = utils.randomInt(40, 60);
      this.particles = [];
      for (let i = 0; i < count; i++) {
        this.particles.push(this._createParticle());
      }

      /* Listen for resize */
      this._resizeHandler = () => utils.resizeCanvas(this.canvas);
      window.addEventListener('resize', this._resizeHandler);

      /* Start loop */
      if (!utils.prefersReducedMotion()) {
        this._loop();
      }
    },

    /**
     * Create a single ambient particle with random properties.
     * Particles float upward with a sine-wave horizontal drift.
     */
    _createParticle(fromBottom) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: utils.random(0, rect.width),
        y: fromBottom ? rect.height + 10 : utils.random(0, rect.height),
        radius: utils.random(1, 3),
        color: utils.pick(this.COLORS),
        speedY: utils.random(-0.3, -0.1),           // float upward
        driftAmp: utils.random(0.3, 1.0),            // sine amplitude
        driftFreq: utils.random(0.005, 0.02),        // sine frequency
        phase: utils.random(0, Math.PI * 2),         // sine phase
        opacityBase: utils.random(0.3, 0.7),
        opacityAmp: utils.random(0.1, 0.3),
        opacityFreq: utils.random(0.01, 0.03),
        age: 0,
      };
    },

    /**
     * Create a burst of particles radiating outward from (x, y).
     * Used when the envelope is opened.
     */
    burst(x, y) {
      const count = utils.randomInt(80, 100);
      for (let i = 0; i < count; i++) {
        const angle = utils.random(0, Math.PI * 2);
        const speed = utils.random(2, 8);
        this.burstParticles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: utils.random(1.5, 3.5),
          color: utils.pick(this.BURST_COLORS),
          life: 1.0,                                  // normalised 1 → 0
          decay: utils.random(0.008, 0.02),           // per frame
          friction: 0.97,
        });
      }
      /* Make sure the loop is running */
      if (!this.animationId) this._loop();
    },

    /** Main render / update loop */
    _loop() {
      this.animationId = requestAnimationFrame(() => this._loop());
      if (!this.ctx) return;

      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      this.ctx.clearRect(0, 0, w, h);

      /* ── Ambient particles ── */
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age++;
        p.y += p.speedY;
        p.x += Math.sin(p.age * p.driftFreq + p.phase) * p.driftAmp;

        const opacity = p.opacityBase + Math.sin(p.age * p.opacityFreq) * p.opacityAmp;

        /* Draw glowing dot */
        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = p.radius * 4;
        this.ctx.fill();
        this.ctx.restore();

        /* Recycle if off-screen */
        if (p.y < -20 || p.x < -20 || p.x > w + 20) {
          this.particles[i] = this._createParticle(true);
        }
      }

      /* ── Burst particles ── */
      for (let i = this.burstParticles.length - 1; i >= 0; i--) {
        const p = this.burstParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.friction;
        p.vy *= p.friction;
        p.life -= p.decay;

        if (p.life <= 0) {
          this.burstParticles.splice(i, 1);
          continue;
        }

        this.ctx.save();
        this.ctx.globalAlpha = p.life;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = p.radius * 6 * p.life;
        this.ctx.fill();
        this.ctx.restore();
      }
    },

    /** Tear down the particle system and free resources */
    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      this.particles = [];
      this.burstParticles = [];
      this.ctx = null;
      this.canvas = null;
    },
  };


  /* ═══════════════════════════════════════════════════════════════════
   *  2. Starfield — twinkling stars for the hero section background
   *     Canvas: #heroCanvas
   * ═══════════════════════════════════════════════════════════════════ */
  const starfield = {
    canvas: null,
    ctx: null,
    stars: [],
    shootingStars: [],
    animationId: null,
    _resizeHandler: null,
    _lastShootingTime: 0,
    _nextShootingDelay: 5000,
    _startTime: 0,

    /* Star colours */
    COLORS: ['#ffffff', '#c8d8ff', '#fff8dc', '#e8e0f0'],

    /**
     * Initialise the starfield on the given canvas.
     */
    init(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      utils.resizeCanvas(this.canvas);

      /* Populate stars */
      this._createStars(utils.randomInt(150, 200));

      this._startTime = performance.now();
      this._lastShootingTime = this._startTime;
      this._nextShootingDelay = utils.random(5000, 8000);

      this._resizeHandler = () => {
        utils.resizeCanvas(this.canvas);
        /* Re-distribute stars across the new dimensions */
        const rect = this.canvas.getBoundingClientRect();
        this.stars.forEach((s) => {
          s.x = utils.random(0, rect.width);
          s.y = utils.random(0, rect.height);
        });
      };
      window.addEventListener('resize', this._resizeHandler);

      if (!utils.prefersReducedMotion()) {
        this._loop();
      } else {
        /* Draw a single static frame */
        this._drawStatic();
      }
    },

    /**
     * Create `count` background star objects with random position,
     * size, colour and twinkle parameters.
     */
    _createStars(count) {
      const rect = this.canvas.getBoundingClientRect();
      this.stars = [];
      for (let i = 0; i < count; i++) {
        this.stars.push({
          x: utils.random(0, rect.width),
          y: utils.random(0, rect.height),
          radius: utils.random(0.5, 2.5),
          color: utils.pick(this.COLORS),
          twinklePhase: utils.random(0, Math.PI * 2),
          twinkleSpeed: utils.random(0.005, 0.025),
          baseOpacity: utils.random(0.4, 0.9),
          twinkleAmp: utils.random(0.1, 0.4),
        });
      }
    },

    /** Spawn a shooting star */
    _spawnShootingStar() {
      const rect = this.canvas.getBoundingClientRect();
      const startX = utils.random(0, rect.width * 0.8);
      const startY = utils.random(0, rect.height * 0.4);
      const angle = utils.random(Math.PI * 0.1, Math.PI * 0.35); // heading lower-right
      const speed = utils.random(8, 14);
      this.shootingStars.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: utils.random(0.015, 0.03),
        length: utils.random(60, 120),
      });
    },

    /** Draw a single static frame (for reduced-motion) */
    _drawStatic() {
      if (!this.ctx) return;
      const rect = this.canvas.getBoundingClientRect();
      this.ctx.clearRect(0, 0, rect.width, rect.height);
      this.stars.forEach((s) => {
        this.ctx.save();
        this.ctx.globalAlpha = s.baseOpacity;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = s.color;
        this.ctx.fill();
        this.ctx.restore();
      });
    },

    /** Main animation loop */
    _loop() {
      this.animationId = requestAnimationFrame(() => this._loop());
      if (!this.ctx) return;

      const now = performance.now();
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const elapsed = (now - this._startTime) / 1000; // seconds

      this.ctx.clearRect(0, 0, w, h);

      /* ── Background stars ── */
      for (const s of this.stars) {
        const twinkle = Math.sin(elapsed * s.twinkleSpeed * 60 + s.twinklePhase);
        const opacity = s.baseOpacity + twinkle * s.twinkleAmp;

        /* Very subtle parallax drift based on time */
        const driftX = Math.sin(elapsed * 0.05 + s.twinklePhase) * 0.3;
        const driftY = Math.cos(elapsed * 0.03 + s.twinklePhase) * 0.15;

        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0.05, Math.min(1, opacity));
        this.ctx.beginPath();
        this.ctx.arc(s.x + driftX, s.y + driftY, s.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = s.color;
        this.ctx.shadowColor = s.color;
        this.ctx.shadowBlur = s.radius * 2;
        this.ctx.fill();
        this.ctx.restore();
      }

      /* ── Shooting stars (spawn check) ── */
      if (now - this._lastShootingTime > this._nextShootingDelay) {
        this._spawnShootingStar();
        this._lastShootingTime = now;
        this._nextShootingDelay = utils.random(5000, 8000);
      }

      /* ── Render shooting stars ── */
      for (let i = this.shootingStars.length - 1; i >= 0; i--) {
        const ss = this.shootingStars[i];
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life -= ss.decay;

        if (ss.life <= 0) {
          this.shootingStars.splice(i, 1);
          continue;
        }

        /* Tail end position */
        const tailX = ss.x - (ss.vx / Math.hypot(ss.vx, ss.vy)) * ss.length * ss.life;
        const tailY = ss.y - (ss.vy / Math.hypot(ss.vx, ss.vy)) * ss.length * ss.life;

        const grad = this.ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, 'rgba(255,255,255,' + ss.life + ')');

        this.ctx.save();
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = 1.5;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(tailX, tailY);
        this.ctx.lineTo(ss.x, ss.y);
        this.ctx.stroke();

        /* Bright head */
        this.ctx.globalAlpha = ss.life;
        this.ctx.beginPath();
        this.ctx.arc(ss.x, ss.y, 1.5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#ffffff';
        this.ctx.shadowBlur = 8;
        this.ctx.fill();
        this.ctx.restore();
      }
    },

    /** Cleanup */
    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      this.stars = [];
      this.shootingStars = [];
      this.ctx = null;
      this.canvas = null;
    },
  };


  /* ═══════════════════════════════════════════════════════════════════
   *  3. Interactive Star Sky — DOM-based clickable wish-stars
   *     Also renders a nebula canvas background (#starskyCanvas).
   *     Container: #starskyWishes
   * ═══════════════════════════════════════════════════════════════════ */
  const stars = {
    container: null,
    starElements: [],
    _bgCanvas: null,
    _bgCtx: null,
    _bgAnimId: null,
    _bgStars: [],
    _resizeHandler: null,
    _startTime: 0,

    /**
     * Initialise the star-sky section.
     * @param {string} containerId  – DOM id of the star container (e.g. "starskyWishes")
     * @param {Array}  wishes       – Array of wish strings
     */
    init(containerId, wishes) {
      this.container = document.getElementById(containerId);
      if (!this.container) return;

      wishes = wishes || [];
      this._startTime = performance.now();

      /* ── Build DOM stars ── */
      this.starElements = [];
      const sizes = [8, 12, 16];
      const positions = this._generatePositions(wishes.length);

      wishes.forEach((wish, idx) => {
        const el = document.createElement('div');
        el.className = 'star';
        el.setAttribute('data-index', idx);
        el.setAttribute('data-wish', wish);
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', '星星 ' + (idx + 1));

        const size = utils.pick(sizes);
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        el.style.left = positions[idx].x + '%';
        el.style.top = positions[idx].y + '%';
        el.style.position = 'absolute';
        el.style.borderRadius = '50%';
        el.style.background = '#fff';
        el.style.cursor = 'pointer';
        el.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        el.style.zIndex = '2';

        /* Glow animation delay based on index for variation */
        el.style.boxShadow = '0 0 ' + (size * 0.8) + 'px ' + (size * 0.3) + 'px rgba(255,255,255,0.6)';
        el.style.animation = 'starGlow ' + utils.random(2, 4).toFixed(1) + 's ease-in-out infinite alternate';
        el.style.animationDelay = utils.random(0, 3).toFixed(1) + 's';

        this.container.appendChild(el);
        this.starElements.push(el);
      });

      /* Inject the starGlow keyframes if not already present */
      if (!document.getElementById('starGlowStyle')) {
        const style = document.createElement('style');
        style.id = 'starGlowStyle';
        style.textContent = [
          '@keyframes starGlow {',
          '  0%   { box-shadow: 0 0 4px 2px rgba(255,255,255,0.4); opacity: 0.7; }',
          '  100% { box-shadow: 0 0 12px 6px rgba(255,255,255,0.9); opacity: 1; }',
          '}',
        ].join('\n');
        document.head.appendChild(style);
      }

      /* ── Background canvas (nebula + deep stars) ── */
      this._initBgCanvas();

      /* ── Resize ── */
      this._resizeHandler = () => {
        if (this._bgCanvas) utils.resizeCanvas(this._bgCanvas);
      };
      window.addEventListener('resize', this._resizeHandler);
    },

    /**
     * Generate non-overlapping percentage positions for `count` stars.
     * Uses a simple grid-jitter approach to avoid clumping.
     */
    _generatePositions(count) {
      const positions = [];
      const cols = Math.ceil(Math.sqrt(count * 1.5));
      const rows = Math.ceil(count / cols);
      const cellW = 90 / cols; // leave 5% margin on each side
      const cellH = 70 / rows; // leave some vertical margin

      let idx = 0;
      for (let r = 0; r < rows && idx < count; r++) {
        for (let c = 0; c < cols && idx < count; c++) {
          positions.push({
            x: 5 + c * cellW + utils.random(cellW * 0.15, cellW * 0.85),
            y: 15 + r * cellH + utils.random(cellH * 0.15, cellH * 0.85),
          });
          idx++;
        }
      }
      /* Shuffle to remove grid patterns */
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = positions[i];
        positions[i] = positions[j];
        positions[j] = tmp;
      }
      return positions;
    },

    /** Initialise the background nebula canvas (#starskyCanvas) */
    _initBgCanvas(canvasId) {
      this._bgCanvas = document.getElementById(canvasId || 'starskyCanvas');
      if (!this._bgCanvas) return;
      this._bgCtx = this._bgCanvas.getContext('2d');
      utils.resizeCanvas(this._bgCanvas);

      /* Create deep-field stars */
      const rect = this._bgCanvas.getBoundingClientRect();
      const starCount = utils.randomInt(250, 350);
      this._bgStars = [];
      for (let i = 0; i < starCount; i++) {
        this._bgStars.push({
          x: utils.random(0, rect.width),
          y: utils.random(0, rect.height),
          radius: utils.random(0.3, 1.8),
          color: utils.pick(['#ffffff', '#c8d8ff', '#fff8dc', '#e8e0f0', '#d8d0f8']),
          twinklePhase: utils.random(0, Math.PI * 2),
          twinkleSpeed: utils.random(0.003, 0.015),
          baseOpacity: utils.random(0.3, 0.8),
          twinkleAmp: utils.random(0.1, 0.35),
        });
      }

      if (!utils.prefersReducedMotion()) {
        this._bgLoop();
      } else {
        this._drawBgStatic();
      }
    },

    /** Draw static background frame (reduced-motion fallback) */
    _drawBgStatic() {
      if (!this._bgCtx) return;
      const rect = this._bgCanvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      this._bgCtx.clearRect(0, 0, w, h);
      this._drawNebula(w, h);
      this._bgStars.forEach((s) => {
        this._bgCtx.save();
        this._bgCtx.globalAlpha = s.baseOpacity;
        this._bgCtx.beginPath();
        this._bgCtx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        this._bgCtx.fillStyle = s.color;
        this._bgCtx.fill();
        this._bgCtx.restore();
      });
    },

    /** Draw subtle nebula gradients */
    _drawNebula(w, h) {
      const ctx = this._bgCtx;

      /* Deep purple nebula cloud - lower left */
      const g1 = ctx.createRadialGradient(w * 0.2, h * 0.7, 0, w * 0.2, h * 0.7, w * 0.45);
      g1.addColorStop(0, 'rgba(90, 50, 140, 0.12)');
      g1.addColorStop(0.5, 'rgba(60, 30, 100, 0.06)');
      g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      /* Blue nebula cloud - upper right */
      const g2 = ctx.createRadialGradient(w * 0.75, h * 0.3, 0, w * 0.75, h * 0.3, w * 0.4);
      g2.addColorStop(0, 'rgba(40, 70, 160, 0.1)');
      g2.addColorStop(0.5, 'rgba(30, 50, 120, 0.05)');
      g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      /* Subtle teal accent - center */
      const g3 = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.35);
      g3.addColorStop(0, 'rgba(50, 80, 130, 0.06)');
      g3.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, w, h);
    },

    /** Background canvas animation loop */
    _bgLoop() {
      this._bgAnimId = requestAnimationFrame(() => this._bgLoop());
      if (!this._bgCtx) return;

      const now = performance.now();
      const elapsed = (now - this._startTime) / 1000;
      const rect = this._bgCanvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      this._bgCtx.clearRect(0, 0, w, h);

      /* Nebula background (slight opacity variation) */
      this._drawNebula(w, h);

      /* Stars */
      for (const s of this._bgStars) {
        const twinkle = Math.sin(elapsed * s.twinkleSpeed * 60 + s.twinklePhase);
        const opacity = s.baseOpacity + twinkle * s.twinkleAmp;

        /* Very slow drift */
        const driftX = Math.sin(elapsed * 0.02 + s.twinklePhase) * 0.2;
        const driftY = Math.cos(elapsed * 0.015 + s.twinklePhase) * 0.1;

        this._bgCtx.save();
        this._bgCtx.globalAlpha = Math.max(0.05, Math.min(1, opacity));
        this._bgCtx.beginPath();
        this._bgCtx.arc(s.x + driftX, s.y + driftY, s.radius, 0, Math.PI * 2);
        this._bgCtx.fillStyle = s.color;
        this._bgCtx.fill();
        this._bgCtx.restore();
      }
    },

    /**
     * Reveal a star at the given index with a glow burst.
     * Shows the wish text in a floating bubble nearby.
     */
    revealStar(index) {
      const el = this.starElements[index];
      if (!el) return;

      /* Glow burst */
      el.style.transform = 'scale(2.5)';
      el.style.boxShadow = '0 0 30px 15px rgba(255,255,200,0.9)';

      setTimeout(() => {
        el.style.transform = 'scale(1.8)';
        el.style.boxShadow = '0 0 20px 10px rgba(255,255,200,0.7)';
      }, 400);

      /* Show wish bubble */
      const wish = el.getAttribute('data-wish');
      if (!wish) return;

      let bubble = el.querySelector('.star-bubble');
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'star-bubble';
        bubble.style.cssText = [
          'position: absolute;',
          'left: 50%;',
          'bottom: 120%;',
          'transform: translateX(-50%) scale(0);',
          'background: rgba(20, 15, 40, 0.85);',
          'backdrop-filter: blur(8px);',
          'color: #faf3e8;',
          'padding: 8px 14px;',
          'border-radius: 10px;',
          'font-size: 13px;',
          'white-space: nowrap;',
          'pointer-events: none;',
          'border: 1px solid rgba(255,255,255,0.15);',
          'transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease;',
          'opacity: 0;',
          'z-index: 10;',
        ].join('');
        bubble.textContent = wish;
        el.style.overflow = 'visible';
        el.appendChild(bubble);
      }

      requestAnimationFrame(() => {
        bubble.style.transform = 'translateX(-50%) scale(1)';
        bubble.style.opacity = '1';
      });
    },

    /**
     * Create a shooting star that streaks across the starsky section.
     */
    createShootingStar() {
      if (!this.container) {
        this.container = document.getElementById('starskyWishes') || document.getElementById('starsky');
      }
      if (!this.container) return;

      const star = document.createElement('div');
      star.style.cssText = [
        'position: absolute;',
        'width: 3px;',
        'height: 3px;',
        'background: #fff;',
        'border-radius: 50%;',
        'box-shadow: 0 0 6px 3px rgba(255,255,255,0.8);',
        'pointer-events: none;',
        'z-index: 3;',
      ].join('');

      const startX = utils.random(-5, 60);
      const startY = utils.random(5, 30);
      star.style.left = startX + '%';
      star.style.top = startY + '%';

      /* Create a CSS trail */
      star.style.transition = 'left 0.6s linear, top 0.6s linear, opacity 0.6s ease';
      this.container.appendChild(star);

      requestAnimationFrame(() => {
        star.style.left = (startX + utils.random(30, 55)) + '%';
        star.style.top = (startY + utils.random(15, 35)) + '%';
        star.style.opacity = '0';
      });

      setTimeout(() => {
        if (star.parentNode) star.parentNode.removeChild(star);
      }, 700);
    },

    /** Alias for createShootingStar */
    shootingStar() {
      return this.createShootingStar();
    },

    /** Initialise only the background nebula canvas */
    initBackground(canvasId) {
      this._initBgCanvas(canvasId);
    },

    /** Cleanup */
    destroy() {
      if (this._bgAnimId) {
        cancelAnimationFrame(this._bgAnimId);
        this._bgAnimId = null;
      }
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      this.starElements.forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      this.starElements = [];
      this._bgStars = [];
      this._bgCtx = null;
      this._bgCanvas = null;
      this.container = null;
    },
  };


  /* ═══════════════════════════════════════════════════════════════════
   *  4. Confetti System — celebratory confetti bursts
   *     Canvas: #confettiCanvas (fixed, full-viewport overlay)
   * ═══════════════════════════════════════════════════════════════════ */
  const confetti = {
    canvas: null,
    ctx: null,
    pieces: [],
    animationId: null,
    active: false,
    _resizeHandler: null,
    _startTime: 0,

    /* Confetti colour palette */
    COLORS: ['#d4a574', '#c17c74', '#7c6f9c', '#faf3e8', '#6b8cce'],

    /**
     * Initialise the confetti canvas (does NOT launch confetti yet).
     */
    init(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      utils.resizeCanvas(this.canvas);

      this._resizeHandler = () => utils.resizeCanvas(this.canvas);
      window.addEventListener('resize', this._resizeHandler);
    },

    /**
     * Launch a burst of 150 confetti pieces from the top of the screen.
     * Can be called repeatedly for successive bursts.
     */
    launch() {
      if (!this.ctx) {
        this.init('confettiCanvas');
      }
      if (!this.ctx) return;
      if (utils.prefersReducedMotion()) return;

      this._startTime = performance.now();
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;

      for (let i = 0; i < 150; i++) {
        const shapeRand = Math.random();
        let shape;
        if (shapeRand < 0.6) shape = 'rect';
        else if (shapeRand < 0.85) shape = 'circle';
        else shape = 'strip';

        this.pieces.push({
          x: utils.random(w * 0.1, w * 0.9),
          y: utils.random(-40, -10),
          width: shape === 'strip' ? utils.random(2, 4) : utils.random(6, 12),
          height: shape === 'strip' ? utils.random(12, 22) : utils.random(6, 10),
          color: utils.pick(this.COLORS),
          shape: shape,
          /* Physics */
          vx: utils.random(-2, 2),
          vy: utils.random(1, 4),
          gravity: utils.random(0.03, 0.06),
          drag: utils.random(0.97, 0.995),
          /* Rotation (simulated via scale oscillation) */
          rotateSpeed: utils.random(0.02, 0.08),
          rotatePhase: utils.random(0, Math.PI * 2),
          scaleX: 1,
          /* Horizontal sine drift */
          driftAmp: utils.random(0.5, 2.0),
          driftFreq: utils.random(0.02, 0.06),
          driftPhase: utils.random(0, Math.PI * 2),
          /* Lifecycle */
          life: 1.0,
          decay: utils.random(0.002, 0.005),       // fades over ~4-5 seconds
          age: 0,
        });
      }

      this.active = true;
      if (!this.animationId) this._loop();
    },

    /** Render / update loop */
    _loop() {
      this.animationId = requestAnimationFrame(() => this._loop());
      if (!this.ctx) return;

      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      this.ctx.clearRect(0, 0, w, h);

      for (let i = this.pieces.length - 1; i >= 0; i--) {
        const p = this.pieces[i];
        p.age++;

        /* Physics */
        p.vy += p.gravity;          // gravity
        p.vy *= p.drag;             // air resistance
        p.vx *= p.drag;
        p.x += p.vx + Math.sin(p.age * p.driftFreq + p.driftPhase) * p.driftAmp;
        p.y += p.vy;

        /* Rotation simulation */
        p.scaleX = Math.cos(p.age * p.rotateSpeed + p.rotatePhase);

        /* Lifecycle */
        p.life -= p.decay;

        if (p.life <= 0 || p.y > h + 30) {
          this.pieces.splice(i, 1);
          continue;
        }

        /* Draw */
        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, p.life);
        this.ctx.translate(p.x, p.y);
        this.ctx.scale(p.scaleX, 1);
        this.ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
          this.ctx.fill();
        } else {
          /* Rectangle or strip */
          this.ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        }

        this.ctx.restore();
      }

      /* Stop the loop if all pieces are gone */
      if (this.pieces.length === 0) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
        this.active = false;
        /* Clear canvas one last time */
        this.ctx.clearRect(0, 0, w, h);
      }
    },

    /** Stop confetti and clear all pieces */
    stop() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      this.pieces = [];
      this.active = false;
      if (this.ctx) {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
      }
    },

    /** Full teardown */
    destroy() {
      this.stop();
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      this.ctx = null;
      this.canvas = null;
    },
  };


  /* ═══════════════════════════════════════════════════════════════════
   *  5. Firework Bursts — rockets that explode into particle showers
   *     Canvas: #confettiCanvas or #finaleCanvas
   * ═══════════════════════════════════════════════════════════════════ */
  const fireworks = {
    canvas: null,
    ctx: null,
    rockets: [],
    explosions: [],
    animationId: null,
    _resizeHandler: null,

    /* Firework colour palette */
    COLORS: ['#d4a574', '#c17c74', '#7c6f9c', '#6b8cce', '#faf3e8', '#f0c27a', '#ff9a9e'],

    /**
     * Initialise the fireworks system on the given canvas.
     */
    init(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');

      utils.resizeCanvas(this.canvas);

      this._resizeHandler = () => utils.resizeCanvas(this.canvas);
      window.addEventListener('resize', this._resizeHandler);
    },

    /**
     * Launch a single firework rocket that will explode at (x, y).
     * If y is not provided, the rocket targets a random upper-screen position.
     */
    launch(x, y) {
      if (!this.ctx) {
        this.init('finaleCanvas');
      }
      if (!this.ctx) return;
      if (utils.prefersReducedMotion()) return;

      const rect = this.canvas.getBoundingClientRect();
      const launchX = x !== undefined ? x : utils.random(rect.width * 0.15, rect.width * 0.85);
      const targetY = y !== undefined ? y : utils.random(rect.height * 0.1, rect.height * 0.35);
      const color = utils.pick(this.COLORS);

      this.rockets.push({
        x: launchX,
        y: rect.height,
        targetY: targetY,
        vy: utils.random(-10, -7),
        color: color,
        trail: [],
        trailLength: 12,
        exploded: false,
      });

      if (!this.animationId) this._loop();
    },

    /**
     * Launch a dazzling show of 5-8 fireworks in sequence.
     */
    launchShow(canvasId) {
      if (!this.ctx) {
        this.init(canvasId || 'finaleCanvas');
      }
      if (utils.prefersReducedMotion()) return;

      const count = utils.randomInt(5, 8);
      for (let i = 0; i < count; i++) {
        setTimeout(() => this.launch(), i * utils.randomInt(400, 800));
      }
    },

    /**
     * Explode a rocket into 60-80 particles.
     */
    _explode(rocket) {
      const particleCount = utils.randomInt(60, 80);
      const particles = [];
      for (let i = 0; i < particleCount; i++) {
        const angle = utils.random(0, Math.PI * 2);
        const speed = utils.random(1, 6);
        particles.push({
          x: rocket.x,
          y: rocket.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: utils.random(1, 3),
          color: rocket.color,
          life: 1.0,
          decay: utils.random(0.01, 0.025),
          gravity: 0.04,
        });
      }
      this.explosions.push(particles);
    },

    /** Animation loop */
    _loop() {
      this.animationId = requestAnimationFrame(() => this._loop());
      if (!this.ctx) return;

      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      /* Semi-transparent clear for trail afterglow */
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.restore();

      /* ── Rockets ── */
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i];

        /* Store trail position */
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > r.trailLength) r.trail.shift();

        /* Move rocket */
        r.y += r.vy;
        r.x += utils.random(-0.4, 0.4); // slight wobble

        /* Draw trail */
        for (let t = 0; t < r.trail.length; t++) {
          const alpha = (t / r.trail.length) * 0.6;
          const size = (t / r.trail.length) * 2;
          this.ctx.save();
          this.ctx.globalAlpha = alpha;
          this.ctx.beginPath();
          this.ctx.arc(r.trail[t].x, r.trail[t].y, size, 0, Math.PI * 2);
          this.ctx.fillStyle = r.color;
          this.ctx.fill();
          this.ctx.restore();
        }

        /* Draw rocket head */
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.shadowColor = r.color;
        this.ctx.shadowBlur = 12;
        this.ctx.fill();
        this.ctx.restore();

        /* Check if reached target */
        if (r.y <= r.targetY) {
          this._explode(r);
          this.rockets.splice(i, 1);
        }
      }

      /* ── Explosions ── */
      for (let e = this.explosions.length - 1; e >= 0; e--) {
        const particles = this.explosions[e];
        let alive = false;

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;  // gravity pulls particles down
          p.vx *= 0.99;       // friction
          p.vy *= 0.99;
          p.life -= p.decay;

          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }

          alive = true;

          this.ctx.save();
          this.ctx.globalAlpha = p.life;
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
          this.ctx.fillStyle = p.color;
          this.ctx.shadowColor = p.color;
          this.ctx.shadowBlur = 6;
          this.ctx.fill();
          this.ctx.restore();
        }

        if (!alive) {
          this.explosions.splice(e, 1);
        }
      }

      /* Stop loop when nothing is left to render */
      if (this.rockets.length === 0 && this.explosions.length === 0) {
        /* Final clear to remove afterglow residue */
        this.ctx.clearRect(0, 0, w, h);
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    },

    /** Stop all fireworks */
    stop() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      this.rockets = [];
      this.explosions = [];
      if (this.ctx) {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
      }
    },

    /** Full teardown */
    destroy() {
      this.stop();
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      this.ctx = null;
      this.canvas = null;
    },
  };


  /* ═══════════════════════════════════════════════════════════════════
   *  Public API
   * ═══════════════════════════════════════════════════════════════════ */
  return {
    particles: particles,
    starfield: starfield,
    stars: stars,
    confetti: confetti,
    fireworks: fireworks,
    utils: utils,
  };

})();
