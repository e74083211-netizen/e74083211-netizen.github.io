/**
 * ============================================================
 *  生日网站主控制器 — Birthday Website Main Application
 * ============================================================
 *  This is the main application controller that orchestrates
 *  all sections, interactions, animations, and state for the
 *  birthday website. It depends on:
 *    - CONFIG   (from config.js)  — all text and content data
 *    - Effects  (from effects.js) — visual effects (particles,
 *                                   starfield, confetti, fireworks)
 *    - AudioController (from audio.js) — background music control
 *
 *  Architecture: Module pattern via a single `App` object.
 *  Entry point:  DOMContentLoaded → App.init()
 * ============================================================
 */

const App = {

  /* ─────────────────────────────────────────────
   *  1. State Management
   * ───────────────────────────────────────────── */
  state: {
    currentSection: 'opening',    // Currently visible section id
    hasVisited: false,            // Returning visitor flag (localStorage)
    openingComplete: false,       // Opening animation finished
    sectionsVisible: new Set(),   // Track which sections have been revealed
    lightboxOpen: false,          // Lightbox overlay state
    lightboxIndex: 0,             // Current lightbox photo index
    letterModalOpen: false,       // Letter modal state
    storyModalOpen: false,        // Story detail modal state
    cakeState: 'initial',        // 'initial' | 'lit' | 'wishing' | 'blown' | 'celebrated'
    starsRevealed: new Set(),     // Set of revealed star indices
    finaleStarted: false,         // Finale text sequence started
    finaleGiftOpened: false,      // Gift button clicked
  },

  /** Active timers & listeners for cleanup on replay */
  _timers: [],
  _cleanupFns: [],

  /* ─────────────────────────────────────────────
   *  2. Init — Entry Point
   * ───────────────────────────────────────────── */

  /**
   * Boots the entire application. Called once on DOMContentLoaded.
   */
  init() {
    try {
      this._injectToastStyles();   // Dynamic CSS for toast notifications
      this.loadState();            // Check localStorage for returning visitor
      this.populateContent();      // Fill all text content from CONFIG
      this.setupSections();        // Intersection Observer for scroll animations
      this.setupNavigation();      // Side nav dots + progress bar
      this.setupOpening();         // Opening section logic
      this.setupHero();            // Hero section
      this.setupTimeline();        // Generate timeline items
      this._setupStoryModalControls(); // Wire up story modal controls
      this.setupGallery();         // Generate gallery + lightbox
      this.setupLetters();         // Generate letter envelopes + modal
      this.setupCake();            // Cake interaction state machine
      this.setupStarsky();         // Star wishes
      this.setupFinale();          // Final reveal sequence
      this.setupMusic();           // Music toggle
      this.setupEasterEggs();      // Hidden surprises
      this.setupAccessibility();   // Reduced motion, keyboard nav

      // Initialize global canvases for confetti and fireworks
      if (typeof Effects !== 'undefined') {
        if (Effects.confetti) Effects.confetti.init('confettiCanvas');
        if (Effects.fireworks) Effects.fireworks.init('finaleCanvas');
      }

      this.saveState();
    } catch (err) {
      console.error('[App] Initialization error:', err);
    }
  },

  /* ─────────────────────────────────────────────
   *  3. populateContent — Fill DOM from CONFIG
   * ───────────────────────────────────────────── */

  /**
   * Maps CONFIG text values to DOM element textContent.
   * Every user-facing string comes from config.js so
   * nothing is hard-coded in the template.
   */
  populateContent() {
    const mapping = {
      // Opening
      openingPreTitle:   CONFIG.opening.preTitle,
      openingSubtitle:   CONFIG.opening.subtitle,
      openBtnText:       CONFIG.opening.buttonText,
      // Hero
      heroLine1:         CONFIG.hero.titleLine1,
      heroLine2:         CONFIG.hero.titleLine2,
      heroSubtitle:      CONFIG.hero.subtitle,
      heroCtaText:       CONFIG.hero.ctaText,
      // Timeline
      timelineTitle:     CONFIG.timeline.sectionTitle,
      timelineSubtitle:  CONFIG.timeline.sectionSubtitle,
      // Gallery
      galleryTitle:      CONFIG.gallery.sectionTitle,
      gallerySubtitle:   CONFIG.gallery.sectionSubtitle,
      // Letters
      lettersTitle:      CONFIG.letters.sectionTitle,
      lettersSubtitle:   CONFIG.letters.sectionSubtitle,
      // Cake
      cakeTitle:         CONFIG.cake.sectionTitle,
      cakeSubtitle:      CONFIG.cake.sectionSubtitle,
      // Star sky
      starskyTitle:      CONFIG.starsky.sectionTitle,
      starskySubtitle:   CONFIG.starsky.sectionSubtitle,
      starskyCollectText:CONFIG.starsky.collectText,
      // Finale
      finaleGiftText:    CONFIG.finale.giftMessage,
      finaleReplayText:  CONFIG.finale.replayText,
    };

    Object.entries(mapping).forEach(([id, text]) => {
      const el = document.getElementById(id);
      if (el && text != null) {
        el.textContent = text;
      }
    });
  },

  /* ─────────────────────────────────────────────
   *  4. setupSections — Intersection Observer
   * ───────────────────────────────────────────── */

  /**
   * Uses IntersectionObserver to:
   * - Add `.visible` class when sections scroll into view
   * - Track current section for nav highlights
   * - Trigger section-specific entrance animations
   */
  setupSections() {
    const sections = document.querySelectorAll('.section');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        try {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            // Mark section as visible (entrance animation trigger)
            entry.target.classList.add('visible');
            this.state.sectionsVisible.add(id);
            this.state.currentSection = id;

            // Update navigation dots
            this._updateNavDots(id);

            // Stagger-reveal children with .stagger-item class
            const staggerItems = entry.target.querySelectorAll('.stagger-item');
            staggerItems.forEach((item, i) => {
              const tid = setTimeout(() => item.classList.add('visible'), i * 120);
              this._timers.push(tid);
            });

            // Section-specific triggers
            if (id === 'finale' && !this.state.finaleStarted) {
              this._startFinaleSequence();
            }
          }
        } catch (err) {
          console.error('[App] Section observer error:', err);
        }
      });
    }, { threshold: 0.2 });

    sections.forEach(section => observer.observe(section));
  },

  /* ─────────────────────────────────────────────
   *  5. setupNavigation — Progress bar & nav dots
   * ───────────────────────────────────────────── */

  /**
   * - Progress bar: scroll-linked width percentage
   * - Section nav dots: click → smooth scroll
   * - Active dot updates via IntersectionObserver callback
   */
  setupNavigation() {
    const progressBar = document.getElementById('progressBar');

    // Throttled scroll handler for progress bar
    const onScroll = this.throttle(() => {
      try {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        if (progressBar) {
          progressBar.style.width = pct + '%';
        }
      } catch (_) { /* silent */ }
    }, 50);

    window.addEventListener('scroll', onScroll, { passive: true });
    this._cleanupFns.push(() => window.removeEventListener('scroll', onScroll));

    // Section nav dot click handlers
    const navButtons = document.querySelectorAll('#sectionNav button');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const sectionId = btn.getAttribute('data-section');
        this.scrollTo(sectionId);
      });
    });
  },

  /**
   * Update the active state of navigation dots.
   * @param {string} activeId - The id of the currently visible section
   */
  _updateNavDots(activeId) {
    const navButtons = document.querySelectorAll('#sectionNav button');
    navButtons.forEach(btn => {
      const isActive = btn.getAttribute('data-section') === activeId;
      btn.classList.toggle('active', isActive);
    });
  },

  /* ─────────────────────────────────────────────
   *  6. setupOpening — Envelope invitation
   * ───────────────────────────────────────────── */

  /**
   * Opening sequence:
   * 1. Particle effect background on canvas
   * 2. Pre-title fades in
   * 3. Envelope appears with gentle float
   * 4. Click button → envelope opens → transition to hero
   *
   * Returning visitors get a subtle "欢迎回来" note.
   */
  setupOpening() {
    const envelope   = document.getElementById('envelope');
    const openBtn    = document.getElementById('openBtn');
    const openingEl  = document.getElementById('opening');
    const heroEl     = document.getElementById('hero');

    // Lock scroll on opening screen
    if (!this.state.openingComplete) {
      document.body.classList.add('opening-active');
    }

    // Initialize particles on the opening canvas
    if (typeof Effects !== 'undefined' && Effects.particles) {
      try { Effects.particles.init('openingCanvas'); } catch (_) { /* silent */ }
    }

    // Returning visitor note
    if (this.state.hasVisited) {
      try {
        const note = document.createElement('p');
        note.className = 'opening__welcome-back';
        note.textContent = '欢迎回来';
        note.style.cssText = 'font-size:12px;color:rgba(212,165,116,0.6);margin-top:10px;letter-spacing:2px;';
        const content = document.querySelector('.opening__content');
        if (content) content.appendChild(note);
      } catch (_) { /* silent */ }
    }

    // Open button click handler
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (this.state.openingComplete) return; // Prevent double-click

        // a. Open envelope flap (CSS handles animation)
        if (envelope) envelope.classList.add('opened');

        // b. After 600ms — particle burst at center
        const t1 = setTimeout(() => {
          if (typeof Effects !== 'undefined' && Effects.particles && Effects.particles.burst) {
            try {
              const rect = envelope ? envelope.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              Effects.particles.burst(cx, cy);
            } catch (_) { /* silent */ }
          }
        }, 600);
        this._timers.push(t1);

        // c. After 1200ms — fade out opening section
        const t2 = setTimeout(() => {
          if (openingEl) openingEl.classList.add('section-exit');
        }, 1200);
        this._timers.push(t2);

        // d. After 2000ms — reveal hero, cleanup opening, unlock scroll
        const t3 = setTimeout(() => {
          // Unlock body scroll
          document.body.classList.remove('opening-active');

          // Destroy opening particles
          if (typeof Effects !== 'undefined' && Effects.particles && Effects.particles.destroy) {
            try { Effects.particles.destroy(); } catch (_) { /* silent */ }
          }

          // Hide opening
          if (openingEl) openingEl.style.display = 'none';

          // Show hero
          if (heroEl) {
            heroEl.classList.remove('section--hidden');
            heroEl.classList.add('visible');
          }

          this.state.openingComplete = true;

          // Initialize audio controller (muted by default as required)
          if (typeof AudioController !== 'undefined' && AudioController.init) {
            try { AudioController.init(); } catch (_) { /* silent */ }
          }

          // Gentle hint for optional background music
          this.showToast('点击右下角 🎵 可开启背景音乐', 4000);
        }, 2000);
        this._timers.push(t3);
      });
    }
  },

  /* ─────────────────────────────────────────────
   *  7. setupHero — Main visual
   * ───────────────────────────────────────────── */

  /**
   * When the hero section becomes visible:
   * - Init starfield canvas
   * - Stagger title lines: line1 → line2 (gold) → subtitle → CTA
   * - CTA button scrolls to timeline section
   */
  setupHero() {
    const heroEl      = document.getElementById('hero');
    const ctaBtn      = document.getElementById('heroCta');
    const line1       = document.getElementById('heroLine1');
    const line2       = document.getElementById('heroLine2');
    const subtitle    = document.getElementById('heroSubtitle');

    // Observe hero for entrance
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Init starfield
          if (typeof Effects !== 'undefined' && Effects.starfield) {
            try { Effects.starfield.init('heroCanvas'); } catch (_) { /* silent */ }
          }

          // Staggered text reveal
          const t1 = setTimeout(() => { if (line1) line1.classList.add('visible'); }, 300);
          const t2 = setTimeout(() => { if (line2) line2.classList.add('visible'); }, 800);
          const t3 = setTimeout(() => { if (subtitle) subtitle.classList.add('visible'); }, 1300);
          const t4 = setTimeout(() => { if (ctaBtn) ctaBtn.classList.add('visible'); }, 1800);
          this._timers.push(t1, t2, t3, t4);

          observer.unobserve(entry.target); // Only once
        }
      });
    }, { threshold: 0.3 });

    if (heroEl) observer.observe(heroEl);

    // CTA click → scroll to timeline
    if (ctaBtn) {
      ctaBtn.addEventListener('click', () => this.scrollTo('timeline'));
    }
  },

  /* ─────────────────────────────────────────────
   *  8. setupTimeline — Generate timeline DOM
   * ───────────────────────────────────────────── */

  /**
   * Dynamically creates timeline cards from CONFIG.timeline.items.
   * Each card contains: marker dot, image area, date, title, and text.
   * Cards get staggered `.visible` via IntersectionObserver.
   */
  setupTimeline() {
    const container = document.getElementById('timelineItems');
    if (!container || !CONFIG.timeline || !CONFIG.timeline.items) return;

    const fragment = document.createDocumentFragment();

    CONFIG.timeline.items.forEach((item, index) => {
      // Compute a darker shade for the gradient
      const darkerShade = this._darkenColor(item.color, 30);

      // Timeline item wrapper
      const div = document.createElement('div');
      div.className = 'timeline__item';
      div.setAttribute('data-index', index);

      div.innerHTML = `
        <div class="timeline__marker">
          <div class="timeline__dot" style="background: ${this._escAttr(item.color)}"></div>
        </div>
        <div class="timeline__card" tabindex="0" role="button" aria-label="查看回忆：${this._escAttr(item.title)}">
          <div class="timeline__image" style="background: linear-gradient(135deg, ${this._escAttr(item.color)}, ${this._escAttr(darkerShade)})">
            ${item.image
              ? `<img src="${this._escAttr(item.image)}" alt="${this._escAttr(item.title)}" loading="lazy">`
              : `<span class="timeline__image-placeholder">${this._getTimelineIcon(index)}</span>`
            }
          </div>
          <div class="timeline__card-body">
            <span class="timeline__date">${this._escHtml(item.date)}</span>
            <h3 class="timeline__card-title">${this._escHtml(item.title)}</h3>
            <p class="timeline__card-text">${this._escHtml(item.text)}</p>
            <span style="display:inline-block;margin-top:10px;font-size:12px;color:var(--gold);font-weight:500;">点击查看完整故事 →</span>
          </div>
        </div>
      `;

      // Click card to open full memory story
      const card = div.querySelector('.timeline__card');
      if (card) {
        card.addEventListener('click', () => this._openStoryModal(index));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._openStoryModal(index);
          }
        });
      }

      fragment.appendChild(div);
    });

    container.appendChild(fragment);

    // Observe each timeline item for staggered reveal
    const items = container.querySelectorAll('.timeline__item');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

    items.forEach(item => observer.observe(item));
  },

  /**
   * Returns a tailored icon for each timeline milestone.
   * @param {number} index
   */
  _getTimelineIcon(index) {
    const icons = ['✨', '🍲', '☕', '🌊', '🍵', '🎓', '🎂'];
    return icons[index % icons.length];
  },

  /**
   * Opens the full memory story detail modal.
   * @param {number} index
   */
  _openStoryModal(index) {
    const modal     = document.getElementById('storyModal');
    const imageEl   = document.getElementById('storyModalImage');
    const dateEl    = document.getElementById('storyModalDate');
    const titleEl   = document.getElementById('storyModalTitle');
    const textEl    = document.getElementById('storyModalText');
    const likeBtn   = document.getElementById('storyModalLikeBtn');
    const likeCount = document.getElementById('storyModalLikeCount');
    if (!modal) return;

    const items = CONFIG.timeline.items;
    if (!items || index < 0 || index >= items.length) return;
    const item = items[index];

    if (dateEl)  dateEl.textContent = item.date || '';
    if (titleEl) titleEl.textContent = item.title || '';
    if (textEl)  textEl.textContent = item.detailedText || item.text || '';

    // Render image or tailored art banner
    if (imageEl) {
      if (item.image) {
        imageEl.innerHTML = `<img src="${this._escAttr(item.image)}" alt="${this._escAttr(item.title)}">`;
      } else {
        const darker = this._darkenColor(item.color, 35);
        imageEl.innerHTML = `
          <div style="width:100%;height:100%;background:linear-gradient(135deg, ${item.color}, ${darker});display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;">
            <span style="font-size:52px;margin-bottom:8px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.25));">${this._getTimelineIcon(index)}</span>
            <span style="font-size:13px;letter-spacing:3px;opacity:0.9;font-weight:600;">PRECIOUS MEMORY</span>
          </div>
        `;
      }
    }

    // Like count tracking in localStorage
    const storageKey = `birthday_story_likes_${index}`;
    let count = parseInt(localStorage.getItem(storageKey) || '0', 10);
    if (likeCount) likeCount.textContent = count;

    if (likeBtn) {
      likeBtn.onclick = () => {
        count++;
        try { localStorage.setItem(storageKey, count); } catch (_) {}
        if (likeCount) likeCount.textContent = count;
        likeBtn.classList.add('liked');
        setTimeout(() => likeBtn.classList.remove('liked'), 500);
        this.showToast('已珍藏这段回忆 ❤️');
      };
    }

    modal.removeAttribute('hidden');
    document.body.classList.add('no-scroll');
    this.state.storyModalOpen = true;
  },

  /**
   * Closes the memory story detail modal.
   */
  _closeStoryModal() {
    const modal = document.getElementById('storyModal');
    if (modal) modal.setAttribute('hidden', '');
    document.body.classList.remove('no-scroll');
    this.state.storyModalOpen = false;
  },

  /**
   * Sets up close and overlay click handlers for the story modal.
   */
  _setupStoryModalControls() {
    const modal = document.getElementById('storyModal');
    if (!modal) return;
    const closeBtn = modal.querySelector('.story-modal__close');
    const overlay  = modal.querySelector('.story-modal__overlay');
    if (closeBtn) closeBtn.addEventListener('click', () => this._closeStoryModal());
    if (overlay)  overlay.addEventListener('click', () => this._closeStoryModal());
  },

  /* ─────────────────────────────────────────────
   *  9. setupGallery — Photo grid + lightbox
   * ───────────────────────────────────────────── */

  /**
   * Generates gallery photo cards from CONFIG.gallery.photos.
   * Implements a full lightbox with:
   * - Open / close
   * - Prev / next navigation
   * - Keyboard (Escape, Arrow keys)
   * - Touch swipe on mobile
   */
  setupGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid || !CONFIG.gallery || !CONFIG.gallery.photos) return;

    // Gradient palette for placeholder images
    const gradients = [
      ['#6b8cce', '#4a6fa5'], ['#ce8a6b', '#a5694a'], ['#8a6bce', '#6b4aa5'],
      ['#6bceb8', '#4a98a5'], ['#ce6b8a', '#a54a69'], ['#b8ce6b', '#8fa54a'],
      ['#d4a574', '#b8845a'], ['#7c6f9c', '#5c5078'], ['#6bc1ce', '#4a98a5'],
    ];

    const photos = CONFIG.gallery.photos;
    const fragment = document.createDocumentFragment();

    photos.forEach((photo, index) => {
      const [g1, g2] = gradients[index % gradients.length];
      const div = document.createElement('div');
      div.className = 'gallery__photo';
      div.setAttribute('data-index', index);
      div.style.setProperty('--rotate', (photo.rotate || 0) + 'deg');
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', photo.caption || '');

      div.innerHTML = `
        <div class="gallery__photo-inner">
          <div class="gallery__photo-image" style="background: linear-gradient(135deg, ${this._escAttr(g1)}, ${this._escAttr(g2)})">
            ${photo.image
              ? `<img src="${this._escAttr(photo.image)}" alt="${this._escAttr(photo.caption)}" loading="lazy">`
              : this._getGalleryArtwork(index)
            }
          </div>
          <p class="gallery__photo-caption">${this._escHtml(photo.caption)}</p>
        </div>
      `;

      // Click → open lightbox
      div.addEventListener('click', () => this._openLightbox(index));
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._openLightbox(index);
        }
      });

      fragment.appendChild(div);
    });

    grid.appendChild(fragment);

    // Observe gallery items for staggered reveal
    const items = grid.querySelectorAll('.gallery__photo');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    items.forEach(item => observer.observe(item));

    // Setup lightbox controls
    this._setupLightboxControls();
  },

  /**
   * Open the lightbox at a given photo index.
   * @param {number} index - Photo index in CONFIG.gallery.photos
   */
  _openLightbox(index) {
    const lightbox   = document.getElementById('lightbox');
    const imgWrap    = document.getElementById('lightboxImage');
    const captionEl  = document.getElementById('lightboxCaption');
    if (!lightbox) return;

    const photos = CONFIG.gallery.photos;
    if (!photos || index < 0 || index >= photos.length) return;

    const photo = photos[index];
    this.state.lightboxIndex = index;
    this.state.lightboxOpen = true;

    // Gradient palette (same as gallery generation)
    const gradients = [
      ['#6b8cce', '#4a6fa5'], ['#ce8a6b', '#a5694a'], ['#8a6bce', '#6b4aa5'],
      ['#6bceb8', '#4a98a5'], ['#ce6b8a', '#a54a69'], ['#b8ce6b', '#8fa54a'],
      ['#d4a574', '#b8845a'], ['#7c6f9c', '#5c5078'], ['#6bc1ce', '#4a98a5'],
    ];
    const [g1, g2] = gradients[index % gradients.length];

    // Set lightbox content
    if (imgWrap) {
      if (photo.image) {
        imgWrap.innerHTML = `<img src="${this._escAttr(photo.image)}" alt="${this._escAttr(photo.caption)}" style="max-width:100%;max-height:80vh;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.4);">`;
      } else {
        imgWrap.innerHTML = `
          <div style="width:100%;max-width:640px;height:auto;aspect-ratio:3/2;border-radius:14px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.5);">
            ${this._getGalleryArtwork(index)}
          </div>
        `;
      }
    }
    if (captionEl) captionEl.textContent = photo.caption || '';

    // Show lightbox
    lightbox.removeAttribute('hidden');
    document.body.classList.add('no-scroll');
  },

  /**
   * Close the lightbox.
   */
  _closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) lightbox.setAttribute('hidden', '');
    document.body.classList.remove('no-scroll');
    this.state.lightboxOpen = false;
  },

  /**
   * Navigate the lightbox by delta (-1 = prev, +1 = next).
   * @param {number} delta
   */
  _navigateLightbox(delta) {
    const photos = CONFIG.gallery.photos;
    if (!photos || photos.length === 0) return;
    const newIndex = (this.state.lightboxIndex + delta + photos.length) % photos.length;
    this._openLightbox(newIndex);
  },

  /**
   * Wire up lightbox close, prev, next, keyboard, and touch swipe.
   */
  _setupLightboxControls() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;

    // Close button
    const closeBtn = lightbox.querySelector('.lightbox__close');
    if (closeBtn) closeBtn.addEventListener('click', () => this._closeLightbox());

    // Prev / Next buttons
    const prevBtn = lightbox.querySelector('.lightbox__prev');
    const nextBtn = lightbox.querySelector('.lightbox__next');
    if (prevBtn) prevBtn.addEventListener('click', () => this._navigateLightbox(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => this._navigateLightbox(1));

    // Click overlay to close (click on lightbox itself but not its content)
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) this._closeLightbox();
    });

    // Keyboard navigation (handled globally in setupAccessibility)
    // Touch swipe support
    let touchStartX = 0;
    let touchStartY = 0;

    lightbox.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      // Only register horizontal swipes (> 50px, mostly horizontal)
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) {
          this._navigateLightbox(-1); // swipe right → prev
        } else {
          this._navigateLightbox(1);  // swipe left → next
        }
      }
    }, { passive: true });
  },

  /**
   * Generates bespoke vector artworks for memory gallery cards.
   * @param {number} index
   */
  _getGalleryArtwork(index) {
    const artworks = [
      // 0: Autumn leaves & warm sun
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
          <linearGradient id="art0" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3d2a45"/><stop offset="100%" stop-color="#6b3a2a"/></linearGradient>
          <radialGradient id="sun0" cx="70%" cy="30%" r="50%"><stop offset="0%" stop-color="#ffd4a0" stop-opacity="0.8"/><stop offset="100%" stop-color="#ffd4a0" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="300" height="200" fill="url(#art0)"/>
        <circle cx="210" cy="60" r="45" fill="url(#sun0)"/>
        <path d="M40 180 Q80 140 120 160 T200 130 T280 170" fill="none" stroke="#d4a574" stroke-width="1.5" opacity="0.6"/>
        <path d="M110 80 Q130 60 140 85 Q125 100 110 80 Z" fill="#e89858" opacity="0.85"/>
        <path d="M180 110 Q200 95 205 115 Q190 125 180 110 Z" fill="#d47055" opacity="0.8"/>
        <path d="M70 120 Q85 105 90 120 Q80 130 70 120 Z" fill="#e8b878" opacity="0.75"/>
        <circle cx="150" cy="95" r="2" fill="#fff" opacity="0.9"/>
        <circle cx="230" cy="120" r="1.5" fill="#fff" opacity="0.8"/>
      </svg>`,

      // 1: Rainy window & coffee
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
          <linearGradient id="art1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1b2a47"/><stop offset="100%" stop-color="#2d3b55"/></linearGradient>
        </defs>
        <rect width="300" height="200" fill="url(#art1)"/>
        <line x1="80" y1="0" x2="80" y2="200" stroke="#4a5f80" stroke-width="2" opacity="0.4"/>
        <line x1="220" y1="0" x2="220" y2="200" stroke="#4a5f80" stroke-width="2" opacity="0.4"/>
        <line x1="0" y1="120" x2="300" y2="120" stroke="#4a5f80" stroke-width="2" opacity="0.4"/>
        <line x1="50" y1="30" x2="45" y2="55" stroke="#7ea2d6" stroke-width="1.2" opacity="0.5"/>
        <line x1="120" y1="20" x2="115" y2="50" stroke="#7ea2d6" stroke-width="1.2" opacity="0.6"/>
        <line x1="170" y1="60" x2="165" y2="90" stroke="#7ea2d6" stroke-width="1.2" opacity="0.5"/>
        <line x1="250" y1="40" x2="245" y2="70" stroke="#7ea2d6" stroke-width="1.2" opacity="0.6"/>
        <rect x="135" y="140" width="30" height="24" rx="4" fill="#faf3e8" opacity="0.9"/>
        <path d="M165 146 Q174 152 165 158" fill="none" stroke="#faf3e8" stroke-width="2" opacity="0.9"/>
        <path d="M145 134 Q148 126 145 120" fill="none" stroke="#d4a574" stroke-width="1.5" opacity="0.7"/>
        <path d="M155 132 Q158 124 155 118" fill="none" stroke="#d4a574" stroke-width="1.5" opacity="0.7"/>
      </svg>`,

      // 2: Ocean sunset
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
          <linearGradient id="art2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#2c1654"/><stop offset="50%" stop-color="#c17c74"/><stop offset="100%" stop-color="#182848"/></linearGradient>
        </defs>
        <rect width="300" height="200" fill="url(#art2)"/>
        <circle cx="150" cy="100" r="32" fill="#ffd59e" opacity="0.9"/>
        <rect x="0" y="115" width="300" height="85" fill="#152238" opacity="0.95"/>
        <line x1="120" y1="122" x2="180" y2="122" stroke="#ffd59e" stroke-width="1.5" opacity="0.7"/>
        <line x1="105" y1="130" x2="195" y2="130" stroke="#ffd59e" stroke-width="1.5" opacity="0.6"/>
        <line x1="85" y1="140" x2="215" y2="140" stroke="#ffd59e" stroke-width="1.2" opacity="0.5"/>
        <line x1="60" y1="152" x2="240" y2="152" stroke="#ffd59e" stroke-width="1" opacity="0.4"/>
      </svg>`,

      // 3: Tree-lined pathway & streetlamp
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
          <linearGradient id="art3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#141c3a"/><stop offset="100%" stop-color="#1e3240"/></linearGradient>
          <radialGradient id="lamp" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffe8a3" stop-opacity="0.9"/><stop offset="100%" stop-color="#ffe8a3" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="300" height="200" fill="url(#art3)"/>
        <path d="M110 200 L140 120 L160 120 L190 200 Z" fill="#2a3f4d" opacity="0.6"/>
        <line x1="175" y1="110" x2="175" y2="170" stroke="#8a9ba8" stroke-width="2"/>
        <circle cx="175" cy="108" r="5" fill="#ffe8a3"/>
        <circle cx="175" cy="108" r="26" fill="url(#lamp)"/>
        <circle cx="70" cy="110" r="30" fill="#0f192b" opacity="0.8"/>
        <circle cx="230" cy="115" r="28" fill="#0f192b" opacity="0.8"/>
      </svg>`,

      // 4: Constellation smile
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs><linearGradient id="art4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e1233"/><stop offset="100%" stop-color="#3d2454"/></linearGradient></defs>
        <rect width="300" height="200" fill="url(#art4)"/>
        <line x1="80" y1="80" x2="120" y2="70" stroke="#d4a574" stroke-width="1" opacity="0.6"/>
        <line x1="120" y1="70" x2="150" y2="90" stroke="#d4a574" stroke-width="1" opacity="0.6"/>
        <line x1="150" y1="90" x2="180" y2="70" stroke="#d4a574" stroke-width="1" opacity="0.6"/>
        <line x1="180" y1="70" x2="220" y2="80" stroke="#d4a574" stroke-width="1" opacity="0.6"/>
        <path d="M100 120 Q150 160 200 120" fill="none" stroke="#ffd59e" stroke-width="2" opacity="0.85"/>
        <circle cx="80" cy="80" r="3.5" fill="#fff"/>
        <circle cx="120" cy="70" r="3" fill="#fff"/>
        <circle cx="150" cy="90" r="4" fill="#ffd59e"/>
        <circle cx="180" cy="70" r="3" fill="#fff"/>
        <circle cx="220" cy="80" r="3.5" fill="#fff"/>
        <circle cx="100" cy="120" r="2.5" fill="#ffd59e"/>
        <circle cx="200" cy="120" r="2.5" fill="#ffd59e"/>
      </svg>`,

      // 5: Blue sky & paper plane
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs><linearGradient id="art5" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#4a7eb8"/><stop offset="100%" stop-color="#89b4d8"/></linearGradient></defs>
        <rect width="300" height="200" fill="url(#art5)"/>
        <ellipse cx="80" cy="140" rx="45" ry="22" fill="#fff" opacity="0.55"/>
        <ellipse cx="220" cy="110" rx="55" ry="26" fill="#fff" opacity="0.6"/>
        <ellipse cx="140" cy="160" rx="60" ry="24" fill="#fff" opacity="0.45"/>
        <path d="M170 50 L120 75 L138 82 L142 98 L152 86 L170 50 Z" fill="#faf3e8" opacity="0.95"/>
        <path d="M170 50 L138 82 L152 86 Z" fill="#e0d6c8" opacity="0.9"/>
        <path d="M90 100 Q110 85 130 80" fill="none" stroke="#fff" stroke-dasharray="3,3" stroke-width="1.5" opacity="0.8"/>
      </svg>`,

      // 6: Vintage camera
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs><linearGradient id="art6" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2a2035"/><stop offset="100%" stop-color="#151b2e"/></linearGradient></defs>
        <rect width="300" height="200" fill="url(#art6)"/>
        <rect x="90" y="70" width="120" height="75" rx="10" fill="#36394d"/>
        <rect x="90" y="70" width="120" height="22" rx="6" fill="#4d5168"/>
        <rect x="105" y="58" width="24" height="12" rx="3" fill="#656a85"/>
        <circle cx="150" cy="110" r="26" fill="#1e202c" stroke="#8a92b2" stroke-width="3"/>
        <circle cx="150" cy="110" r="16" fill="#12141c"/>
        <circle cx="156" cy="104" r="5" fill="#7cb6e8" opacity="0.7"/>
        <circle cx="190" cy="80" r="4" fill="#d4a574"/>
      </svg>`,

      // 7: Two companions stargazing
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs><linearGradient id="art7" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0a0e27"/><stop offset="100%" stop-color="#1f183d"/></defs>
        <rect width="300" height="200" fill="url(#art7)"/>
        <circle cx="50" cy="40" r="1.5" fill="#fff"/>
        <circle cx="95" cy="25" r="2" fill="#ffd4a0"/>
        <circle cx="160" cy="35" r="1.5" fill="#fff"/>
        <circle cx="210" cy="20" r="2" fill="#fff"/>
        <circle cx="260" cy="50" r="1.5" fill="#ffd4a0"/>
        <circle cx="130" cy="65" r="1" fill="#fff"/>
        <circle cx="185" cy="70" r="1.5" fill="#fff"/>
        <path d="M0 160 Q150 135 300 160 L300 200 L0 200 Z" fill="#080b18"/>
        <circle cx="140" cy="140" r="5" fill="#fff" opacity="0.9"/>
        <path d="M135 146 Q140 162 145 162" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
        <circle cx="156" cy="142" r="4.5" fill="#ffd4a0" opacity="0.9"/>
        <path d="M152 148 Q156 162 160 162" stroke="#ffd4a0" stroke-width="4.5" stroke-linecap="round" opacity="0.9"/>
      </svg>`,

      // 8: Birthday present box & sparkles
      `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
        <defs>
          <linearGradient id="art8" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#381b2a"/><stop offset="100%" stop-color="#1a1233"/></defs>
          <radialGradient id="boxGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#d4a574" stop-opacity="0.4"/><stop offset="100%" stop-color="#d4a574" stop-opacity="0"/></radialGradient>
        </defs>
        <rect width="300" height="200" fill="url(#art8)"/>
        <circle cx="150" cy="120" r="60" fill="url(#boxGlow)"/>
        <rect x="120" y="105" width="60" height="50" rx="4" fill="#c17c74"/>
        <rect x="115" y="95" width="70" height="14" rx="3" fill="#d88c84"/>
        <rect x="145" y="95" width="10" height="60" fill="#ffd59e"/>
        <rect x="120" y="125" width="60" height="10" fill="#ffd59e"/>
        <ellipse cx="140" cy="90" rx="8" ry="6" fill="#ffd59e" transform="rotate(-20 140 90)"/>
        <ellipse cx="160" cy="90" rx="8" ry="6" fill="#ffd59e" transform="rotate(20 160 90)"/>
        <circle cx="150" cy="92" r="3.5" fill="#e8b878"/>
        <path d="M90 70 L93 78 L101 81 L93 84 L90 92 L87 84 L79 81 L87 78 Z" fill="#ffd59e" opacity="0.9"/>
        <path d="M210 65 L212 71 L218 73 L212 75 L210 81 L208 75 L202 73 L208 71 Z" fill="#ffd59e" opacity="0.85"/>
      </svg>`
    ];

    return artworks[index % artworks.length];
  },

  /* ─────────────────────────────────────────────
   *  10. setupLetters — Envelope cards + modal
   * ───────────────────────────────────────────── */

  /**
   * Generates envelope cards from CONFIG.letters.items.
   * Clicking an envelope opens a modal with the letter content
   * and a typewriter-like text reveal.
   */
  setupLetters() {
    const grid = document.getElementById('lettersGrid');
    if (!grid || !CONFIG.letters || !CONFIG.letters.items) return;

    const fragment = document.createDocumentFragment();

    CONFIG.letters.items.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'letter-envelope';
      div.setAttribute('data-index', index);
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', item.envelope || '');

      div.innerHTML = `
        <div class="letter-envelope__seal" style="background: ${this._escAttr(item.color)}">✉</div>
        <p class="letter-envelope__label">${this._escHtml(item.envelope)}</p>
      `;

      div.addEventListener('click', () => this._openLetterModal(index));
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._openLetterModal(index);
        }
      });

      fragment.appendChild(div);
    });

    grid.appendChild(fragment);

    // Setup modal controls
    this._setupLetterModalControls();
  },

  /**
   * Open the letter modal for a given letter index.
   * Content line-breaks are rendered as <p> elements.
   * @param {number} index
   */
  _openLetterModal(index) {
    const modal      = document.getElementById('letterModal');
    const titleEl    = document.getElementById('letterModalTitle');
    const contentEl  = document.getElementById('letterModalContent');
    if (!modal) return;

    const items = CONFIG.letters.items;
    if (!items || index < 0 || index >= items.length) return;

    const item = items[index];

    if (titleEl) titleEl.textContent = item.envelope || '';

    // Convert content with \n into paragraphs
    if (contentEl) {
      contentEl.innerHTML = '';
      const paragraphs = (item.content || '').split('\n').filter(line => line.trim() !== '');
      paragraphs.forEach((para, i) => {
        const p = document.createElement('p');
        p.textContent = para;
        p.style.opacity = '0';
        p.style.transform = 'translateY(10px)';
        p.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        contentEl.appendChild(p);

        // Staggered typewriter-like reveal
        const tid = setTimeout(() => {
          p.style.opacity = '1';
          p.style.transform = 'translateY(0)';
        }, 200 + i * 300);
        this._timers.push(tid);
      });
    }

    modal.removeAttribute('hidden');
    document.body.classList.add('no-scroll');
    this.state.letterModalOpen = true;
  },

  /**
   * Close the letter modal.
   */
  _closeLetterModal() {
    const modal = document.getElementById('letterModal');
    if (modal) modal.setAttribute('hidden', '');
    document.body.classList.remove('no-scroll');
    this.state.letterModalOpen = false;
  },

  /**
   * Wire up modal close controls.
   */
  _setupLetterModalControls() {
    const modal = document.getElementById('letterModal');
    if (!modal) return;

    // Close button
    const closeBtn = modal.querySelector('.letter-modal__close');
    if (closeBtn) closeBtn.addEventListener('click', () => this._closeLetterModal());

    // Click overlay to close
    const overlay = modal.querySelector('.letter-modal__overlay');
    if (overlay) overlay.addEventListener('click', () => this._closeLetterModal());
  },

  /* ─────────────────────────────────────────────
   *  11. setupCake — Birthday cake state machine
   * ───────────────────────────────────────────── */

  /**
   * Generates candles and manages the cake interaction flow:
   * initial → lit → wishing → blown → celebrated
   *
   * Each state transition is triggered by a button click
   * and includes timed animations.
   */
  setupCake() {
    const candlesContainer = document.getElementById('cakeCandles');
    const lightBtn  = document.getElementById('cakeLightBtn');
    const wishBtn   = document.getElementById('cakeWishBtn');
    const blowBtn   = document.getElementById('cakeBlowBtn');
    const messageEl = document.getElementById('cakeMessage');

    if (!candlesContainer) return;

    const candleCount = (CONFIG.cake && CONFIG.cake.candleCount) || 5;

    // Generate candle DOM elements
    candlesContainer.innerHTML = '';
    for (let i = 0; i < candleCount; i++) {
      const candle = document.createElement('div');
      candle.className = 'candle';
      candle.setAttribute('data-index', i);
      candle.setAttribute('role', 'button');
      candle.setAttribute('tabindex', '0');
      candle.setAttribute('title', '点击点燃或吹灭蜡烛');
      candle.innerHTML = `
        <div class="candle__stick"></div>
        <div class="candle__flame"></div>
        <div class="candle__smoke"></div>
      `;

      // Direct interactive candle clicks
      candle.addEventListener('click', () => {
        if (this.state.cakeState === 'initial') {
          candle.classList.add('lit');
          const all = candlesContainer.querySelectorAll('.candle');
          const allLit = Array.from(all).every(c => c.classList.contains('lit'));
          if (allLit) {
            if (lightBtn) lightBtn.setAttribute('hidden', '');
            if (wishBtn) wishBtn.removeAttribute('hidden');
            this.state.cakeState = 'lit';
          }
        } else if (this.state.cakeState === 'wishing' || this.state.cakeState === 'lit') {
          candle.classList.remove('lit');
          candle.classList.add('blown');
          const all = candlesContainer.querySelectorAll('.candle');
          const allBlown = Array.from(all).every(c => !c.classList.contains('lit'));
          if (allBlown && this.state.cakeState !== 'celebrated') {
            this._celebrateCake();
          }
        }
      });

      candlesContainer.appendChild(candle);
    }

    // STATE: initial — "点燃蜡烛" button visible
    this.state.cakeState = 'initial';

    // Light candles handler
    if (lightBtn) {
      lightBtn.addEventListener('click', () => {
        if (this.state.cakeState !== 'initial') return;

        const candles = candlesContainer.querySelectorAll('.candle');
        // Sequentially light each candle
        candles.forEach((candle, i) => {
          const tid = setTimeout(() => {
            candle.classList.add('lit');
          }, i * 150);
          this._timers.push(tid);
        });

        // After all candles are lit
        const allLitTime = candles.length * 150 + 300;
        const t1 = setTimeout(() => {
          lightBtn.setAttribute('hidden', '');
          if (wishBtn) wishBtn.removeAttribute('hidden');
          this.state.cakeState = 'lit';
        }, allLitTime);
        this._timers.push(t1);
      });
    }

    // Wish handler
    if (wishBtn) {
      wishBtn.addEventListener('click', () => {
        if (this.state.cakeState !== 'lit') return;

        // Show wish prompt message
        if (messageEl) {
          messageEl.textContent = (CONFIG.cake && CONFIG.cake.wishPrompt) || '';
          messageEl.removeAttribute('hidden');
          messageEl.classList.add('visible');
        }

        // Dim the background slightly
        const stage = document.getElementById('cakeStage');
        if (stage) stage.classList.add('cake__stage--wishing');

        this.state.cakeState = 'wishing';

        // After 2 seconds: show blow button
        const t1 = setTimeout(() => {
          wishBtn.setAttribute('hidden', '');
          if (blowBtn) blowBtn.removeAttribute('hidden');
          if (messageEl) {
            messageEl.classList.remove('visible');
            messageEl.setAttribute('hidden', '');
          }
        }, 2500);
        this._timers.push(t1);
      });
    }

    // Blow candles handler
    if (blowBtn) {
      blowBtn.addEventListener('click', () => {
        if (this.state.cakeState !== 'wishing' && this.state.cakeState !== 'lit') return;

        const candles = candlesContainer.querySelectorAll('.candle');
        // Blow out candles with slightly randomized timing
        candles.forEach((candle, i) => {
          const randomDelay = i * 120 + Math.random() * 200;
          const tid = setTimeout(() => {
            candle.classList.remove('lit');
            candle.classList.add('blown');
          }, randomDelay);
          this._timers.push(tid);
        });

        const totalBlowTime = candles.length * 120 + 350;
        const t1 = setTimeout(() => {
          this._celebrateCake();
        }, totalBlowTime);
        this._timers.push(t1);
      });
    }
  },

  /**
   * Cake celebration trigger — confetti + message + reset button
   */
  _celebrateCake() {
    if (this.state.cakeState === 'celebrated') return;
    this.state.cakeState = 'celebrated';

    const blowBtn   = document.getElementById('cakeBlowBtn');
    const wishBtn   = document.getElementById('cakeWishBtn');
    const messageEl = document.getElementById('cakeMessage');
    const stage     = document.getElementById('cakeStage');

    if (stage) stage.classList.remove('cake__stage--wishing');
    if (blowBtn) blowBtn.setAttribute('hidden', '');
    if (wishBtn) wishBtn.setAttribute('hidden', '');

    // Show celebration message
    if (messageEl) {
      messageEl.textContent = (CONFIG.cake && CONFIG.cake.afterBlowMessage) || '愿望一定会实现的 ✨';
      messageEl.removeAttribute('hidden');
      messageEl.classList.add('visible');
    }

    // Launch confetti
    if (typeof Effects !== 'undefined' && Effects.confetti && Effects.confetti.launch) {
      try { Effects.confetti.launch(); } catch (_) { /* silent */ }
    }

    // Show "再来一次" reset button after a delay
    const t2 = setTimeout(() => {
      this._showCakeResetButton();
    }, 2500);
    this._timers.push(t2);
  },

  /**
   * Creates and shows a "再来一次" button to reset the cake.
   */
  _showCakeResetButton() {
    const controls = document.querySelector('.cake__controls');
    if (!controls) return;

    // Don't add duplicate
    if (controls.querySelector('.cake__btn--reset')) return;

    const resetBtn = document.createElement('button');
    resetBtn.className = 'cake__btn cake__btn--reset';
    resetBtn.textContent = '再来一次 🎂';
    controls.appendChild(resetBtn);

    resetBtn.addEventListener('click', () => {
      this._resetCake();
      resetBtn.remove();
    });
  },

  /**
   * Resets the cake to its initial state.
   */
  _resetCake() {
    const candlesContainer = document.getElementById('cakeCandles');
    const lightBtn  = document.getElementById('cakeLightBtn');
    const wishBtn   = document.getElementById('cakeWishBtn');
    const blowBtn   = document.getElementById('cakeBlowBtn');
    const messageEl = document.getElementById('cakeMessage');

    // Reset all candle classes
    if (candlesContainer) {
      const candles = candlesContainer.querySelectorAll('.candle');
      candles.forEach(c => {
        c.classList.remove('lit', 'blown');
      });
    }

    // Reset button visibility
    if (lightBtn)  lightBtn.removeAttribute('hidden');
    if (wishBtn)   wishBtn.setAttribute('hidden', '');
    if (blowBtn)   blowBtn.setAttribute('hidden', '');
    if (messageEl) {
      messageEl.setAttribute('hidden', '');
      messageEl.classList.remove('visible');
    }

    // Reset wishing dim
    const stage = document.getElementById('cakeStage');
    if (stage) stage.classList.remove('cake__stage--wishing');

    this.state.cakeState = 'initial';
  },

  /* ─────────────────────────────────────────────
   *  12. setupStarsky — Star wishes
   * ───────────────────────────────────────────── */

  /**
   * Creates interactive stars positioned pseudo-randomly in a grid layout.
   * Clicking a star reveals a wish message.
   * A "collect" button saves the moment to localStorage.
   */
  setupStarsky() {
    const wishesContainer = document.getElementById('starskyWishes');
    const revealedEl      = document.getElementById('starskyRevealed');
    const wishTextEl      = document.getElementById('starskyWishText');
    const collectBtn      = document.getElementById('starskyCollect');

    if (!wishesContainer || !CONFIG.starsky || !CONFIG.starsky.wishes) return;

    const wishes = CONFIG.starsky.wishes;
    const sizes = ['small', 'medium', 'large'];

    // Init nebula background canvas
    if (typeof Effects !== 'undefined') {
      if (Effects.stars && Effects.stars.initBackground) {
        try { Effects.stars.initBackground('starskyCanvas'); } catch (_) { /* silent */ }
      } else if (Effects.starfield) {
        try { Effects.starfield.init('starskyCanvas'); } catch (_) { /* silent */ }
      }
    }

    // Position stars in a grid to avoid overlap
    // Divide area into a grid with some randomness
    const cols = Math.ceil(Math.sqrt(wishes.length * 1.5));
    const rows = Math.ceil(wishes.length / cols);

    wishesContainer.innerHTML = '';
    this.state.starsRevealed = new Set();

    wishes.forEach((wish, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      // Calculate base position with padding from edges
      const cellWidth = 85 / cols;   // leave 15% margin total
      const cellHeight = 70 / rows;  // leave 30% margin (top has header)
      const baseX = 7.5 + col * cellWidth + Math.random() * (cellWidth * 0.6);
      const baseY = 15 + row * cellHeight + Math.random() * (cellHeight * 0.5);

      const size = sizes[index % sizes.length];

      const btn = document.createElement('button');
      btn.className = `star star--${size}`;
      btn.style.left = baseX + '%';
      btn.style.top = baseY + '%';
      btn.setAttribute('data-index', index);
      btn.setAttribute('aria-label', '点击查看祝福');

      btn.innerHTML = `<span class="star__glow"></span>`;

      btn.addEventListener('click', () => {
        // Mark as revealed
        btn.classList.add('star--revealed');
        this.state.starsRevealed.add(index);

        // Show wish text
        if (revealedEl) revealedEl.removeAttribute('hidden');
        if (wishTextEl) {
          wishTextEl.style.opacity = '0';
          wishTextEl.textContent = wish;
          // Fade in
          requestAnimationFrame(() => {
            wishTextEl.style.transition = 'opacity 0.6s ease';
            wishTextEl.style.opacity = '1';
          });
        }

        // Shooting star effect
        if (typeof Effects !== 'undefined' && Effects.stars && Effects.stars.shootingStar) {
          try { Effects.stars.shootingStar(); } catch (_) { /* silent */ }
        }
      });

      wishesContainer.appendChild(btn);
    });

    // Collect button handler
    if (collectBtn) {
      collectBtn.addEventListener('click', () => {
        // Brief celebration effect
        if (typeof Effects !== 'undefined' && Effects.confetti && Effects.confetti.launch) {
          try { Effects.confetti.launch(); } catch (_) { /* silent */ }
        }

        // Toast notification
        const msg = (CONFIG.starsky && CONFIG.starsky.collectMessage) || '已收藏 ✨';
        this.showToast(msg);

        // Save to localStorage
        try {
          localStorage.setItem('birthday_starsky_collected', 'true');
        } catch (_) { /* silent */ }
      });
    }
  },

  /* ─────────────────────────────────────────────
   *  13. setupFinale — Final blessing sequence
   * ───────────────────────────────────────────── */

  /**
   * Registers the finale section observer.
   * The actual text sequence is triggered by _startFinaleSequence()
   * when the section scrolls into view.
   */
  setupFinale() {
    const replayBtn = document.getElementById('finaleReplay');
    const giftBtn   = document.getElementById('finaleGiftBtn');

    // Gift button click
    if (giftBtn) {
      giftBtn.addEventListener('click', () => this._onFinaleGiftClick());
    }

    // Replay button
    if (replayBtn) {
      replayBtn.addEventListener('click', () => this._replayAll());
    }
  },

  /**
   * Starts the timed finale text reveal sequence.
   * Called when the finale section enters the viewport.
   */
  _startFinaleSequence() {
    if (this.state.finaleStarted) return;
    this.state.finaleStarted = true;

    const linesContainer = document.getElementById('finaleLines');
    const giftEl         = document.getElementById('finaleGift');
    if (!linesContainer || !CONFIG.finale || !CONFIG.finale.lines) return;

    linesContainer.innerHTML = '';
    const lines = CONFIG.finale.lines;
    let cumulativeDelay = 500; // initial delay

    lines.forEach((line, index) => {
      if (line === '') {
        // Empty line = extra pause (no DOM element)
        cumulativeDelay += 1000;
        return;
      }

      const p = document.createElement('p');
      p.className = 'finale-line';
      p.textContent = line;

      // Last line — special styling (larger, gold)
      if (index === lines.length - 1) {
        p.classList.add('finale-line--final');
      }

      linesContainer.appendChild(p);

      const tid = setTimeout(() => {
        p.classList.add('visible');
      }, cumulativeDelay);
      this._timers.push(tid);

      cumulativeDelay += 1500;
    });

    // After all lines shown, reveal the gift button
    const giftDelay = cumulativeDelay + 2000;
    const t1 = setTimeout(() => {
      if (giftEl) {
        giftEl.removeAttribute('hidden');
        giftEl.classList.add('visible');
      }
    }, giftDelay);
    this._timers.push(t1);
  },

  /**
   * Handles the gift button click in the finale.
   * Launches fireworks + confetti, reveals hidden message, shows replay.
   */
  _onFinaleGiftClick() {
    if (this.state.finaleGiftOpened) return;
    this.state.finaleGiftOpened = true;

    const hiddenEl  = document.getElementById('finaleHidden');
    const hiddenText = document.getElementById('finaleHiddenText');
    const replayBtn = document.getElementById('finaleReplay');

    // Launch fireworks on the finale canvas
    if (typeof Effects !== 'undefined' && Effects.fireworks && Effects.fireworks.launchShow) {
      try { Effects.fireworks.launchShow('finaleCanvas'); } catch (_) { /* silent */ }
    }

    // Launch confetti
    if (typeof Effects !== 'undefined' && Effects.confetti && Effects.confetti.launch) {
      try { Effects.confetti.launch(); } catch (_) { /* silent */ }
    }

    // After 1s — reveal hidden message
    const t1 = setTimeout(() => {
      if (hiddenEl && hiddenText) {
        // Convert \n in hidden message to separate lines
        const text = (CONFIG.finale && CONFIG.finale.hiddenMessage) || '';
        hiddenText.innerHTML = text.split('\n').map(line => this._escHtml(line)).join('<br>');
        hiddenEl.removeAttribute('hidden');
        hiddenEl.classList.add('visible');
      }
    }, 1000);
    this._timers.push(t1);

    // After 3s — show replay button
    const t2 = setTimeout(() => {
      if (replayBtn) {
        replayBtn.removeAttribute('hidden');
        replayBtn.classList.add('visible');
      }
    }, 3500);
    this._timers.push(t2);
  },

  /**
   * Replays the entire experience from the beginning.
   * Resets all state and scrolls to top.
   */
  _replayAll() {
    // Clear all pending timers
    this._timers.forEach(tid => clearTimeout(tid));
    this._timers = [];

    // Reset state
    this.state.openingComplete = false;
    this.state.sectionsVisible = new Set();
    this.state.lightboxOpen = false;
    this.state.lightboxIndex = 0;
    this.state.letterModalOpen = false;
    this.state.cakeState = 'initial';
    this.state.starsRevealed = new Set();
    this.state.finaleStarted = false;
    this.state.finaleGiftOpened = false;
    this.state.currentSection = 'opening';

    // Close any open modals
    this._closeLightbox();
    this._closeLetterModal();
    this._closeStoryModal();

    // Lock body scroll again for opening
    document.body.classList.add('opening-active');

    // Reset opening section
    const openingEl = document.getElementById('opening');
    const heroEl    = document.getElementById('hero');
    const envelope  = document.getElementById('envelope');

    if (openingEl) {
      openingEl.style.display = '';
      openingEl.classList.remove('section-exit');
    }
    if (envelope) envelope.classList.remove('opened');
    if (heroEl) {
      heroEl.classList.add('section--hidden');
      heroEl.classList.remove('visible');
    }

    // Reset hero text
    ['heroLine1', 'heroLine2', 'heroSubtitle', 'heroCta'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('visible');
    });

    // Reset all section visible classes
    document.querySelectorAll('.section').forEach(s => s.classList.remove('visible'));

    // Reset timeline items
    document.querySelectorAll('.timeline__item').forEach(item => item.classList.remove('visible'));

    // Reset gallery items
    document.querySelectorAll('.gallery__photo').forEach(item => item.classList.remove('visible'));

    // Reset cake
    this._resetCake();

    // Reset star sky
    const starskyRevealed = document.getElementById('starskyRevealed');
    if (starskyRevealed) starskyRevealed.setAttribute('hidden', '');
    document.querySelectorAll('.star').forEach(s => s.classList.remove('star--revealed'));

    // Reset finale
    const finaleLines = document.getElementById('finaleLines');
    if (finaleLines) finaleLines.innerHTML = '';
    const finaleGift = document.getElementById('finaleGift');
    if (finaleGift) {
      finaleGift.setAttribute('hidden', '');
      finaleGift.classList.remove('visible');
    }
    const finaleHidden = document.getElementById('finaleHidden');
    if (finaleHidden) {
      finaleHidden.setAttribute('hidden', '');
      finaleHidden.classList.remove('visible');
    }
    const finaleReplay = document.getElementById('finaleReplay');
    if (finaleReplay) {
      finaleReplay.setAttribute('hidden', '');
      finaleReplay.classList.remove('visible');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Re-initialize particles on opening canvas
    if (typeof Effects !== 'undefined' && Effects.particles) {
      try { Effects.particles.init('openingCanvas'); } catch (_) { /* silent */ }
    }

    // Mark opening section visible again
    const t1 = setTimeout(() => {
      if (openingEl) openingEl.classList.add('visible');
    }, 500);
    this._timers.push(t1);
  },

  /* ─────────────────────────────────────────────
   *  14. setupMusic — Background music toggle
   * ───────────────────────────────────────────── */

  /**
   * Hooks up the floating music toggle button.
   * Delegates play/pause to AudioController.
   */
  setupMusic() {
    const toggle = document.getElementById('musicToggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      if (typeof AudioController !== 'undefined') {
        try {
          AudioController.toggle();
          toggle.classList.toggle('playing', AudioController.isPlaying);
        } catch (_) { /* silent */ }
      }
    });
  },

  /* ─────────────────────────────────────────────
   *  15. setupEasterEggs — Hidden surprises
   * ───────────────────────────────────────────── */

  /**
   * Implements:
   * - Konami Code (↑↑↓↓←→←→BA)
   * - Hero title click counter
   * - Time-based midnight greeting
   */
  setupEasterEggs() {
    // ── Konami Code ──
    const konamiSequence = [
      'ArrowUp', 'ArrowUp',
      'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight',
      'ArrowLeft', 'ArrowRight',
      'b', 'a'
    ];
    let konamiIndex = 0;
    let konamiTriggered = false;

    const konamiHandler = (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === konamiSequence[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiSequence.length) {
          konamiIndex = 0;
          if (!konamiTriggered) {
            konamiTriggered = true;
            const msg = (CONFIG.easterEggs && CONFIG.easterEggs.konamiMessage) || '🎉';
            this.showToast(msg, 5000);
            // Confetti burst!
            if (typeof Effects !== 'undefined' && Effects.confetti && Effects.confetti.launch) {
              try { Effects.confetti.launch(); } catch (_) { /* silent */ }
            }
          }
        }
      } else {
        // Reset if wrong key
        konamiIndex = key === konamiSequence[0] ? 1 : 0;
      }
    };

    document.addEventListener('keydown', konamiHandler);
    this._cleanupFns.push(() => document.removeEventListener('keydown', konamiHandler));

    // ── Hero Title Click Counter ──
    const heroTitle = document.querySelector('.hero__title');
    const requiredClicks = (CONFIG.easterEggs && CONFIG.easterEggs.clickCount) || 7;
    let clickCount = 0;
    let clickTimer = null;
    let titleEggTriggered = false;

    if (heroTitle) {
      heroTitle.addEventListener('click', () => {
        if (titleEggTriggered) return;
        clickCount++;

        // Reset counter after 2s of inactivity
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { clickCount = 0; }, 2000);

        if (clickCount >= requiredClicks) {
          titleEggTriggered = true;
          clickCount = 0;
          const msg = (CONFIG.easterEggs && CONFIG.easterEggs.clickMessage) || '🎉';
          this.showToast(msg, 5000);
          // Brief confetti burst
          if (typeof Effects !== 'undefined' && Effects.confetti && Effects.confetti.launch) {
            try { Effects.confetti.launch(); } catch (_) { /* silent */ }
          }
        }
      });
    }

    // ── Midnight Greeting ──
    try {
      const hour = new Date().getHours();
      if (hour >= 23 || hour <= 1) {
        const t1 = setTimeout(() => {
          this.showToast('夜深了，谢谢你还在看这个网站 🌙', 5000);
        }, 5000);
        this._timers.push(t1);
      }
    } catch (_) { /* silent */ }
  },

  /* ─────────────────────────────────────────────
   *  16. setupAccessibility — Reduced motion & keyboard
   * ───────────────────────────────────────────── */

  /**
   * - Adds `reduced-motion` class when user prefers reduced motion
   * - Global keyboard handler for Escape (close modals),
   *   Arrow keys (lightbox navigation)
   */
  setupAccessibility() {
    // Check prefers-reduced-motion
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.classList.add('reduced-motion');
      }
    } catch (_) { /* silent */ }

    // Global keyboard navigation
    const keyHandler = (e) => {
      // Escape — close any open overlay
      if (e.key === 'Escape') {
        if (this.state.lightboxOpen) {
          this._closeLightbox();
          e.preventDefault();
        }
        if (this.state.letterModalOpen) {
          this._closeLetterModal();
          e.preventDefault();
        }
        if (this.state.storyModalOpen) {
          this._closeStoryModal();
          e.preventDefault();
        }
      }

      // Arrow keys — lightbox navigation
      if (this.state.lightboxOpen) {
        if (e.key === 'ArrowLeft') {
          this._navigateLightbox(-1);
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          this._navigateLightbox(1);
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', keyHandler);
    this._cleanupFns.push(() => document.removeEventListener('keydown', keyHandler));
  },

  /* ─────────────────────────────────────────────
   *  17. Helper Functions
   * ───────────────────────────────────────────── */

  /**
   * Show a toast notification at the bottom of the screen.
   * @param {string} message - Text to display
   * @param {number} [duration=3000] - Milliseconds before auto-dismiss
   */
  showToast(message, duration) {
    duration = duration || 3000;
    try {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      document.body.appendChild(toast);

      // Trigger entrance animation on next frame
      requestAnimationFrame(() => {
        toast.classList.add('visible');
      });

      // Auto-dismiss
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 350);
      }, duration);
    } catch (_) { /* silent */ }
  },

  /**
   * Smooth-scroll to a section by its id.
   * @param {string} sectionId
   */
  scrollTo(sectionId) {
    try {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } catch (_) { /* silent */ }
  },

  /**
   * Load persisted state from localStorage.
   */
  loadState() {
    try {
      this.state.hasVisited = localStorage.getItem('birthday_visited') === 'true';
    } catch (_) {
      this.state.hasVisited = false;
    }
  },

  /**
   * Persist visit flag to localStorage.
   */
  saveState() {
    try {
      localStorage.setItem('birthday_visited', 'true');
    } catch (_) { /* silent */ }
  },

  /**
   * Throttle a function so it fires at most once per `wait` ms.
   * @param {Function} fn
   * @param {number} wait - Minimum interval in ms
   * @returns {Function}
   */
  throttle(fn, wait) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, args);
      }
    };
  },

  /**
   * Darken a hex colour by a given amount.
   * @param {string} hex - e.g. '#6b8cce'
   * @param {number} amount - 0-255
   * @returns {string} Darker hex colour
   */
  _darkenColor(hex, amount) {
    try {
      hex = hex.replace('#', '');
      const r = Math.max(0, parseInt(hex.substring(0, 2), 16) - amount);
      const g = Math.max(0, parseInt(hex.substring(2, 4), 16) - amount);
      const b = Math.max(0, parseInt(hex.substring(4, 6), 16) - amount);
      return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      return hex;
    }
  },

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  _escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Escape a value for use in an HTML attribute.
   * @param {string} str
   * @returns {string}
   */
  _escAttr(str) {
    return this._escHtml(str);
  },

  /* ─────────────────────────────────────────────
   *  18. Dynamic CSS — Toast styles
   * ───────────────────────────────────────────── */

  /**
   * Injects toast notification CSS into the document head.
   * Called once during init so dynamically created toasts
   * are styled without requiring an external stylesheet rule.
   */
  _injectToastStyles() {
    // Guard against duplicate injection
    if (document.getElementById('app-toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'app-toast-styles';
    style.textContent = `
      .toast {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(212, 165, 116, 0.95);
        color: #0a0e27;
        padding: 14px 28px;
        border-radius: 30px;
        font-family: 'Noto Serif SC', serif;
        font-size: 14px;
        z-index: 10000;
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 20px rgba(212, 165, 116, 0.3);
        max-width: 90vw;
        text-align: center;
        line-height: 1.5;
      }
      .toast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  },
};


/* ═════════════════════════════════════════════════
 *  Bootstrap — Start the app when the DOM is ready
 * ═════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => App.init());
