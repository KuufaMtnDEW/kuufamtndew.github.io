// ============================================================
// KUUFA — shared behaviour: nav state, cursor spotlight,
// particle trail, auto-glitch flicker, pinned hero crossfade
// ============================================================

(function () {
  // ---- active nav link ----
  const page = document.body.dataset.page;
  if (page) {
    const link = document.querySelector(`.nav__links a[data-page="${page}"]`);
    if (link) link.setAttribute('aria-current', 'page');
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- cursor-tracking spotlight (CSS custom properties) ----
  const root = document.documentElement;
  let targetX = 50, targetY = 40, curX = 50, curY = 40;

  function setTarget(xPct, yPct) {
    targetX = xPct;
    targetY = yPct;
  }

  window.addEventListener('mousemove', (e) => {
    setTarget((e.clientX / window.innerWidth) * 100, (e.clientY / window.innerHeight) * 100);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    setTarget((t.clientX / window.innerWidth) * 100, (t.clientY / window.innerHeight) * 100);
  }, { passive: true });

  function animateSpotlight() {
    curX += (targetX - curX) * 0.08;
    curY += (targetY - curY) * 0.08;
    root.style.setProperty('--mx', curX + '%');
    root.style.setProperty('--my', curY + '%');
    requestAnimationFrame(animateSpotlight);
  }
  if (!reduceMotion) requestAnimationFrame(animateSpotlight);

  // ---- particle trail canvas ----
  const canvas = document.getElementById('fx');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#B8FF3D', '#FF3B8D'];
    let particles = [];
    let lastSpawn = 0;

    function spawn(x, y, count) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x * dpr,
          y: y * dpr,
          vx: (Math.random() - 0.5) * 1.4 * dpr,
          vy: (Math.random() - 1.2) * 1.4 * dpr,
          r: (Math.random() * 2.2 + 1.2) * dpr,
          life: 1,
          decay: 0.012 + Math.random() * 0.012,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      if (particles.length > 260) particles = particles.slice(-260);
    }

    function pointerSpawn(cx, cy) {
      const now = performance.now();
      if (now - lastSpawn < 24) return;
      lastSpawn = now;
      spawn(cx, cy, 2);
    }

    window.addEventListener('mousemove', (e) => pointerSpawn(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!e.touches.length) return;
      pointerSpawn(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // gentle ambient particles so the background feels alive at rest
    function ambientSpawn() {
      spawn(Math.random() * window.innerWidth, window.innerHeight + 10, 1);
    }
    setInterval(ambientSpawn, 700);

    function tick() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.01 * dpr; // slight upward drift
        p.life -= p.decay;
        if (p.life <= 0) return;
        ctx.globalAlpha = Math.max(p.life, 0) * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      particles = particles.filter((p) => p.life > 0);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- periodic automatic glitch flicker on hero title ----
  const glitchEls = document.querySelectorAll('.glitch');
  if (glitchEls.length && !reduceMotion) {
    glitchEls.forEach((el) => {
      setInterval(() => {
        el.classList.add('auto-glitch');
        setTimeout(() => el.classList.remove('auto-glitch'), 260);
      }, 3200 + Math.random() * 2600);
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

      // scene 1 fades out across the first 60% of the pin range
      const p1 = clamp01(scrolled / 0.6);
      // scene 2 fades in across the last 60% (creates a short overlap)
      const p2 = clamp01((scrolled - 0.4) / 0.6);

      scene1.style.opacity = String(1 - p1);
      scene1.style.transform = `translateY(${-p1 * 36}px)`;

      scene2.style.opacity = String(p2);
      scene2.style.transform = `translateY(${(1 - p2) * 36}px)`;

      if (scrollHint) scrollHint.style.opacity = String(1 - clamp01(scrolled / 0.15));
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }
})();
