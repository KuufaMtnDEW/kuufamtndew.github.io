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

  // ---- glitch on .glitch title now runs entirely via CSS (continuous loop) ----

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

  // ---- custom video player (own-hosted mp4s, no third-party embeds) ----
  const players = document.querySelectorAll('.vplayer');
  if (players.length) {
    const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    const ICON_VOL = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z"/></svg>';
    const ICON_MUTE = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.59 2 2.71 2.71-1.41 1.41L15.18 13.4l-2.71 2.72-1.41-1.41L13.76 12l-2.7-2.71 1.41-1.41 2.71 2.7 2.71-2.7 1.41 1.41L16.59 12z"/></svg>';
    const ICON_FS = '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';

    function fmtTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    }

    players.forEach((wrap) => {
      const video = wrap.querySelector('.vplayer__video');
      const overlay = wrap.querySelector('.vplayer__overlay');
      const playIcon = wrap.querySelector('.vplayer__playicon');
      const playBtn = wrap.querySelector('[data-vplayer-play]');
      const muteBtn = wrap.querySelector('[data-vplayer-mute]');
      const fsBtn = wrap.querySelector('[data-vplayer-fullscreen]');
      const progress = wrap.querySelector('.vplayer__progress');
      const progressFill = wrap.querySelector('.vplayer__progress-fill');
      const progressThumb = wrap.querySelector('.vplayer__progress-thumb');
      const timeEl = wrap.querySelector('[data-vplayer-time]');
      if (!video) return;

      playIcon.innerHTML = ICON_PLAY;
      if (playBtn) playBtn.innerHTML = ICON_PAUSE;
      if (muteBtn) muteBtn.innerHTML = ICON_VOL;
      if (fsBtn) fsBtn.innerHTML = ICON_FS;

      video.addEventListener('error', () => wrap.classList.add('has-error'));

      // match the player frame to the real aspect ratio of the file
      // (falls back to the 16:9 default in CSS if metadata never loads)
      video.addEventListener('loadedmetadata', () => {
        if (video.videoWidth && video.videoHeight) {
          wrap.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
          // portrait/square clips would otherwise inherit the 420px width cap
          // and end up very tall — cap by height too and let width follow
          const MAX_W = 420, MAX_H = 560;
          const ratio = video.videoWidth / video.videoHeight;
          let w = Math.min(MAX_W, MAX_H * ratio);
          wrap.style.maxWidth = Math.round(w) + 'px';
        }
        if (timeEl) timeEl.textContent = `${fmtTime(0)} / ${fmtTime(video.duration)}`;
      });

      function togglePlay() {
        if (video.paused) { video.play().catch(() => {}); }
        else { video.pause(); }
      }
      function syncPlayState() {
        wrap.classList.toggle('is-paused', video.paused);
        if (playBtn) playBtn.innerHTML = video.paused ? ICON_PLAY : ICON_PAUSE;
      }
      video.addEventListener('play', syncPlayState);
      video.addEventListener('pause', syncPlayState);
      syncPlayState();

      if (overlay) overlay.addEventListener('click', togglePlay);
      if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });

      if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          video.muted = !video.muted;
          muteBtn.innerHTML = video.muted ? ICON_MUTE : ICON_VOL;
        });
      }

      if (fsBtn) {
        fsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
          else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        });
      }

      function paintProgress(ratio) {
        progressFill.style.width = (ratio * 100) + '%';
        if (progressThumb) progressThumb.style.left = (ratio * 100) + '%';
      }

      video.addEventListener('timeupdate', () => {
        if (!video.duration) return;
        paintProgress(video.currentTime / video.duration);
        if (timeEl) timeEl.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
      });

      function ratioFromEvent(e) {
        const rect = progress.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      }

      if (progress) {
        let scrubbing = false;
        progress.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          scrubbing = true;
          wrap.classList.add('is-scrubbing');
          if (video.duration) video.currentTime = ratioFromEvent(e) * video.duration;
        });
        window.addEventListener('pointermove', (e) => {
          if (!scrubbing || !video.duration) return;
          const ratio = ratioFromEvent(e);
          video.currentTime = ratio * video.duration;
          paintProgress(ratio);
        });
        window.addEventListener('pointerup', () => {
          if (!scrubbing) return;
          scrubbing = false;
          wrap.classList.remove('is-scrubbing');
        });
      }
    });
  }

  // ---- sitewide background music (persists mute/volume/position via localStorage) ----
  (function initBgm() {
    const AUDIO_SRC = 'audio/background.mp3';
    const KEY_MUTED = 'kuufa-bgm-muted';
    const KEY_VOLUME = 'kuufa-bgm-volume';
    const KEY_TIME = 'kuufa-bgm-time';

    const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
    const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>';

    let audio = document.getElementById('bgm-audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'bgm-audio';
      audio.src = AUDIO_SRC;
      audio.loop = true;
      audio.preload = 'auto';
      document.body.appendChild(audio);
    }

    let storedMuted = false;
    let storedVolume = 0.5;
    let storedTime = 0;
    try {
      storedMuted = localStorage.getItem(KEY_MUTED) === '1';
      const v = parseFloat(localStorage.getItem(KEY_VOLUME));
      if (!isNaN(v)) storedVolume = v;
      const t = parseFloat(localStorage.getItem(KEY_TIME));
      if (!isNaN(t)) storedTime = t;
    } catch (e) { /* localStorage unavailable — fall back to defaults */ }

    audio.volume = storedVolume;
    audio.muted = storedMuted;

    audio.addEventListener('loadedmetadata', () => {
      if (storedTime > 0 && storedTime < audio.duration) {
        try { audio.currentTime = storedTime; } catch (e) {}
      }
    });

    function attemptPlay() {
      audio.play().catch(() => {
        // autoplay blocked — start on first user interaction instead
        const startOnGesture = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click', startOnGesture);
          document.removeEventListener('keydown', startOnGesture);
        };
        document.addEventListener('click', startOnGesture, { once: true });
        document.addEventListener('keydown', startOnGesture, { once: true });
      });
    }
    attemptPlay();

    setInterval(() => {
      if (!audio.paused) {
        try { localStorage.setItem(KEY_TIME, String(audio.currentTime)); } catch (e) {}
      }
    }, 3000);

    // ---- floating widget ----
    const widget = document.createElement('div');
    widget.className = 'bgm-widget';
    widget.innerHTML = `
      <button class="bgm-widget__btn" data-bgm-toggle aria-label="Звук фоновой музыки"></button>
      <input class="bgm-widget__volume" type="range" min="0" max="1" step="0.05" data-bgm-volume>
    `;
    document.body.appendChild(widget);

    const toggleBtn = widget.querySelector('[data-bgm-toggle]');
    const volumeSlider = widget.querySelector('[data-bgm-volume]');
    volumeSlider.value = String(storedVolume);

    function syncWidget() {
      const silent = audio.muted || audio.volume === 0;
      toggleBtn.innerHTML = silent ? ICON_OFF : ICON_ON;
      widget.classList.toggle('is-playing', !audio.paused && !silent);
    }
    syncWidget();

    toggleBtn.addEventListener('click', () => {
      audio.muted = !audio.muted;
      try { localStorage.setItem(KEY_MUTED, audio.muted ? '1' : '0'); } catch (e) {}
      syncWidget();
    });

    volumeSlider.addEventListener('input', () => {
      const v = parseFloat(volumeSlider.value);
      audio.volume = v;
      if (v > 0 && audio.muted) { audio.muted = false; try { localStorage.setItem(KEY_MUTED, '0'); } catch (e) {} }
      try { localStorage.setItem(KEY_VOLUME, String(v)); } catch (e) {}
      syncWidget();
    });

    audio.addEventListener('play', syncWidget);
    audio.addEventListener('pause', syncWidget);
  })();
})();
