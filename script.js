// ============================================================
// KUUFA — shared behaviour: nav state, particle trail,
// looping glitch flicker, pinned hero crossfade
// ============================================================

(function () {
  // ---- active nav link ----
  const page = document.body.dataset.page;
  if (page) {
    const link = document.querySelector(`.nav__links a[data-page="${page}"]`);
    if (link) link.setAttribute('aria-current', 'page');
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- lightweight particle trail canvas ----
  const canvas = document.getElementById('fx');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5); // capped for performance
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#B8FF3D', '#FF3B8D'];
    const MAX_PARTICLES = 140; // capped so it never becomes an FPS drain
    let particles = [];
    let lastSpawn = 0;

    function spawn(x, y, count) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x * dpr,
          y: y * dpr,
          vx: (Math.random() - 0.5) * 1.2 * dpr,
          vy: (Math.random() - 1.1) * 1.2 * dpr,
          r: (Math.random() * 2 + 1) * dpr,
          life: 1,
          decay: 0.018 + Math.random() * 0.014,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      if (particles.length > MAX_PARTICLES) particles = particles.slice(-MAX_PARTICLES);
    }

    function pointerSpawn(cx, cy) {
      const now = performance.now();
      if (now - lastSpawn < 40) return; // throttle spawn rate
      lastSpawn = now;
      spawn(cx, cy, 1);
    }

    window.addEventListener('mousemove', (e) => pointerSpawn(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!e.touches.length) return;
      pointerSpawn(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // gentle ambient particles so the background feels alive at rest
    setInterval(() => spawn(Math.random() * window.innerWidth, window.innerHeight + 10, 1), 900);

    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.01 * dpr;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- looping automatic glitch flicker on the hero title (fixed pace, not random) ----
  const glitchEls = document.querySelectorAll('.glitch');
  if (glitchEls.length && !reduceMotion) {
    const LOOP_MS = 5200;   // pause between flickers
    const FLICKER_MS = 340; // how long each flicker lasts
    glitchEls.forEach((el) => {
      setInterval(() => {
        el.classList.add('auto-glitch');
        setTimeout(() => el.classList.remove('auto-glitch'), FLICKER_MS);
      }, LOOP_MS);
    });
  }

  // ---- pinned hero: crossfade scene-1 -> scene-2 while scrolling ----
  const heroPin = document.querySelector('.hero-pin');
  const scene1 = document.querySelector('.scene-1');
  const scene2 = document.querySelector('.scene-2');
  const scrollHint = document.querySelector('.scroll-hint');

  if (heroPin && scene1 && scene2) {
    function clamp01(v) { return Math.min(Math.max(v, 0), 1); }

    function update() {
      const total = heroPin.offsetHeight - window.innerHeight;
      const rect = heroPin.getBoundingClientRect();
      const scrolled = clamp01(total > 0 ? -rect.top / total : 0);

      // scene 1 fades out across the first 55% of the pin range
      const p1 = clamp01(scrolled / 0.55);
      // scene 2 fades in across the last 55% (short overlap in the middle)
      const p2 = clamp01((scrolled - 0.45) / 0.55);

      // base translateY(-50%) keeps each scene vertically centred;
      // the extra offset is layered on top via calc()
      scene1.style.opacity = String(1 - p1);
      scene1.style.transform = `translateY(calc(-50% - ${p1 * 30}px))`;

      scene2.style.opacity = String(p2);
      scene2.style.transform = `translateY(calc(-50% + ${(1 - p2) * 30}px))`;

      if (scrollHint) scrollHint.style.opacity = String(1 - clamp01(scrolled / 0.12));
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }
})();
