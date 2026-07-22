// ============================================================
// KUUFA — shared behaviour: SPA-style nav (audio survives page
// changes), particle trail with a music-reactive background
// sparkle, glitch flicker, pinned hero crossfade, custom video
// player, sitewide background music
// ============================================================

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // cleanup handle for the hero-pin scroll listener, so re-mounting
  // a new page after a pjax navigation doesn't stack duplicate listeners
  let unmountHeroPin = null;

  // shared "how loud is the music right now" reading (0..1), used by the
  // background particle canvas to sparkle gently in time with the track
  const audioReactive = { level: 0 };

  // analyses the bgm <audio> element via the Web Audio API and keeps
  // audioReactive.level updated; safe to call once, no-ops if unsupported
  function setupAudioReactivity(audio) {
    if (reduceMotion) return;
    let analyser, dataArray, audioCtx, started = false;
    let runningPeak = 18; // seed value; adapts to the track's own loudness over time

    function setup() {
      if (started) return;
      started = true;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.78;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        tick();
      } catch (e) {
        // Web Audio unavailable — background just stays calm, no harm done
      }
    }

    function tick() {
      requestAnimationFrame(tick);
      // only a genuinely paused/stopped track counts as "idle" — muting or
      // pulling the volume down should still let the background sparkle,
      // since the track is still conceptually "playing"
      if (!analyser || audio.paused) { audioReactive.level = 0; return; }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      const bassBins = Math.min(10, dataArray.length);
      for (let i = 0; i < bassBins; i++) sum += dataArray[i];
      const avg = sum / bassBins;
      // auto-gain: track a slowly-decaying peak so the sparkle reacts to the
      // music's own dynamics, not to the (quiet) absolute volume setting
      runningPeak = Math.max(avg, runningPeak * 0.992);
      let level = runningPeak > 4 ? Math.min(1, avg / runningPeak) : 0;

      // safety net: some browsers zero the analyser data itself once the
      // element is muted, not just its audible output — in that case fall
      // back to a gentle synthetic drift so the sparkle never fully dies
      if (audio.muted || audio.volume === 0) {
        const drift = 0.18 + 0.12 * Math.sin(performance.now() / 2200);
        level = Math.max(level, drift);
      }
      audioReactive.level = level;
    }

    function resumeOnGesture() {
      setup();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      document.removeEventListener('click', resumeOnGesture);
      document.removeEventListener('keydown', resumeOnGesture);
    }
    document.addEventListener('click', resumeOnGesture);
    document.addEventListener('keydown', resumeOnGesture);
    audio.addEventListener('play', resumeOnGesture);
  }

  // ------------------------------------------------------------
  // per-page setup — re-run every time <main>/<nav> get swapped
  // ------------------------------------------------------------
  function mountPage() {
    setActiveNavLink();
    initNavDropdown();
    initHeroPin();
    initVideoPlayers();
    if (updateScrollColor) updateScrollColor();
  }

  function setActiveNavLink() {
    const page = document.body.dataset.page;
    if (!page) return;
    const link = document.querySelector(`.nav__links a[data-page="${page}"]`);
    if (link) {
      link.setAttribute('aria-current', 'page');
      const trigger = link.closest('.nav__dropdown')?.querySelector('.nav__dropdown-trigger');
      if (trigger) trigger.classList.add('is-active');
    }
  }

  function initNavDropdown() {
    const dropdown = document.querySelector('.nav__dropdown');
    if (!dropdown) return;
    const trigger = dropdown.querySelector('.nav__dropdown-trigger');
    if (!trigger) return;

    function closeDropdown() {
      dropdown.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
    function toggleDropdown(e) {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(isOpen));
    }
    trigger.addEventListener('click', toggleDropdown);
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) closeDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });
  }

  // ---- pinned hero: crossfade scene-1 -> scene-2 while scrolling ----
  function initHeroPin() {
    if (unmountHeroPin) { unmountHeroPin(); unmountHeroPin = null; }

    const heroPin = document.querySelector('.hero-pin');
    const scene1 = document.querySelector('.scene-1');
    const scene2 = document.querySelector('.scene-2');
    const scrollHint = document.querySelector('.scroll-hint');
    if (!heroPin || !scene1 || !scene2) return;

    function clamp01(v) { return Math.min(Math.max(v, 0), 1); }

    function update() {
      const total = heroPin.offsetHeight - window.innerHeight;
      const rect = heroPin.getBoundingClientRect();
      const scrolled = clamp01(total > 0 ? -rect.top / total : 0);

      const p1 = clamp01(scrolled / 0.55);
      const p2 = clamp01((scrolled - 0.45) / 0.55);

      scene1.style.opacity = String(1 - p1);
      scene1.style.transform = `translateY(calc(-50% - ${p1 * 30}px))`;

      scene2.style.opacity = String(p2);
      scene2.style.transform = `translateY(calc(-50% + ${(1 - p2) * 30}px))`;

      if (scrollHint) scrollHint.style.opacity = String(1 - clamp01(scrolled / 0.12));
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    unmountHeroPin = () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }

  // ---- custom video player (own-hosted mp4s, no third-party embeds) ----
  function initVideoPlayers() {
    const players = document.querySelectorAll('.vplayer');
    if (!players.length) return;

    const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    const ICON_VOL = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z"/></svg>';
    const ICON_MUTE = '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.59 2 2.71 2.71-1.41 1.41L15.18 13.4l-2.71 2.72-1.41-1.41L13.76 12l-2.7-2.71 1.41-1.41 2.71 2.7 2.71-2.7 1.41 1.41L16.59 12z"/></svg>';
    const ICON_FS = '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
    const ICON_UP = '<svg viewBox="0 0 24 24"><path d="M12 8l-6.5 6.5 1.4 1.4L12 10.8l5.1 5.1 1.4-1.4z"/></svg>';
    const ICON_DOWN = '<svg viewBox="0 0 24 24"><path d="M12 16l6.5-6.5-1.4-1.4L12 13.2l-5.1-5.1-1.4 1.4z"/></svg>';

    // volume/mute is remembered across clips and page reloads, same idea as the bgm widget
    const KEY_VOL = 'kuufa-video-volume';
    const KEY_VMUTED = 'kuufa-video-muted';
    let storedVideoVol = 1;
    let storedVideoMuted = false;
    try {
      const v = parseFloat(localStorage.getItem(KEY_VOL));
      if (!isNaN(v)) storedVideoVol = v;
      storedVideoMuted = localStorage.getItem(KEY_VMUTED) === '1';
    } catch (e) { /* localStorage unavailable — fall back to defaults */ }

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
      const volumeSlider = wrap.querySelector('[data-vplayer-volume]');
      const fsBtn = wrap.querySelector('[data-vplayer-fullscreen]');
      const progress = wrap.querySelector('.vplayer__progress');
      const progressFill = wrap.querySelector('.vplayer__progress-fill');
      const progressThumb = wrap.querySelector('.vplayer__progress-thumb');
      const timeEl = wrap.querySelector('[data-vplayer-time]');
      if (!video) return;

      playIcon.innerHTML = ICON_PLAY;
      if (playBtn) playBtn.innerHTML = ICON_PAUSE;
      if (fsBtn) fsBtn.innerHTML = ICON_FS;

      video.volume = storedVideoVol;
      video.muted = storedVideoMuted;
      if (volumeSlider) volumeSlider.value = String(storedVideoVol);

      function syncVolumeUI() {
        const silent = video.muted || video.volume === 0;
        if (muteBtn) muteBtn.innerHTML = silent ? ICON_MUTE : ICON_VOL;
      }
      syncVolumeUI();

      video.addEventListener('error', () => wrap.classList.add('has-error'));

      // ---- size the card to the clip's real aspect ratio (vertical, square,
      // landscape — whatever it actually is), instead of leaving it stuck in
      // the generic default ----
      let sized = false;
      function applyRealSize() {
        if (sized) return;
        if (!video.videoWidth || !video.videoHeight) return;
        sized = true;
        wrap.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        const MAX_W = 520, MAX_H = 640;
        const ratio = video.videoWidth / video.videoHeight;
        const w = Math.min(MAX_W, MAX_H * ratio);
        wrap.style.maxWidth = Math.round(w) + 'px';
      }
      video.addEventListener('loadedmetadata', () => {
        applyRealSize();
        if (timeEl) timeEl.textContent = `${fmtTime(0)} / ${fmtTime(video.duration)}`;
      });
      // some browsers only populate videoWidth/videoHeight a beat later than
      // loadedmetadata, or the metadata was already cached before this
      // listener was attached — cover both cases
      video.addEventListener('loadeddata', applyRealSize);
      if (video.readyState >= 1) applyRealSize();

      // ---- "focus zoom": pressing play visually lifts this clip above the
      // rest of the page; clicking anywhere outside it shrinks it back down,
      // but never pauses it — playback just continues at the smaller size.
      // Also makes sure only one clip plays at a time — starting this one
      // pauses whichever other clip was running ----
      video.addEventListener('play', () => {
        players.forEach((otherWrap) => {
          if (otherWrap === wrap) return;
          otherWrap.classList.remove('is-zoomed');
          const otherItem = otherWrap.parentElement;
          if (otherItem) otherItem.classList.remove('is-zoomed-item');
          const otherVideo = otherWrap.querySelector('.vplayer__video');
          if (otherVideo && !otherVideo.paused) otherVideo.pause();
        });
        wrap.classList.add('is-zoomed');
        const item = wrap.parentElement;
        if (item) item.classList.add('is-zoomed-item');
        setZoomBackdrop(true);
      });

      // ---- TikTok-style up/down arrows: switch to the neighbouring clip,
      // smooth-scroll the page to it, and start it playing right away so
      // the zoom-in/shape change happens while the scroll is still settling ----
      const item = wrap.closest('.video-list__item');
      if (item) {
        const nav = item.querySelector('.vplayer-nav');
        if (nav) {
          const prevBtn = nav.querySelector('[data-video-prev]');
          const nextBtn = nav.querySelector('[data-video-next]');
          if (prevBtn) prevBtn.innerHTML = ICON_UP;
          if (nextBtn) nextBtn.innerHTML = ICON_DOWN;

          function goToNeighbour(offset) {
            const items = Array.from(document.querySelectorAll('.video-list__item'));
            const idx = items.indexOf(item);
            const target = items[idx + offset];
            if (!target) return;
            const targetVideo = target.querySelector('.vplayer__video');
            if (!targetVideo) return;
            video.pause();
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetVideo.play().catch(() => {});
          }
          if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goToNeighbour(-1); });
          if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goToNeighbour(1); });
        }
      }

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
          try { localStorage.setItem(KEY_VMUTED, video.muted ? '1' : '0'); } catch (err) {}
          syncVolumeUI();
        });
      }

      if (volumeSlider) {
        volumeSlider.addEventListener('click', (e) => e.stopPropagation());
        volumeSlider.addEventListener('input', (e) => {
          e.stopPropagation();
          const v = parseFloat(volumeSlider.value);
          video.volume = v;
          storedVideoVol = v;
          if (v > 0 && video.muted) {
            video.muted = false;
            try { localStorage.setItem(KEY_VMUTED, '0'); } catch (err) {}
          }
          try { localStorage.setItem(KEY_VOL, String(v)); } catch (err) {}
          syncVolumeUI();
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

  // ------------------------------------------------------------
  // page-independent features — set up once, survive navigation
  // ------------------------------------------------------------

  // ---- lightweight particle trail canvas (kept deliberately subtle) ----
  function initParticles() {
    const canvas = document.getElementById('fx');
    if (!canvas || reduceMotion) return;

    const ctx = canvas.getContext('2d');
    let w, h, dpr;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#B8FF3D', '#FF3B8D'];
    const MAX_PARTICLES = 90;
    let particles = [];
    let lastSpawn = 0;
    let sparkleFrame = 0;

    function spawn(x, y, count, glow) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x * dpr,
          y: y * dpr,
          vx: (glow ? (Math.random() - 0.5) * 0.1 : (Math.random() - 0.5) * 1.1) * dpr,
          vy: (glow ? (Math.random() - 0.5) * 0.1 : (Math.random() - 1.1) * 1.1) * dpr,
          r: (glow ? Math.random() * 2.4 + 1.8 : Math.random() * 1.6 + 0.8) * dpr,
          life: 1,
          decay: (glow ? 0.009 : 0.022) + Math.random() * 0.012,
          color: colors[Math.floor(Math.random() * colors.length)],
          glow: !!glow,
        });
      }
      if (particles.length > MAX_PARTICLES) particles = particles.slice(-MAX_PARTICLES);
    }

    function pointerSpawn(cx, cy) {
      const now = performance.now();
      if (now - lastSpawn < 75) return; // throttled harder than before
      lastSpawn = now;
      spawn(cx, cy, 1);
    }

    window.addEventListener('mousemove', (e) => pointerSpawn(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!e.touches.length) return;
      pointerSpawn(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // sparse ambient drift so the background still feels alive at rest
    setInterval(() => spawn(Math.random() * window.innerWidth, window.innerHeight + 10, 1), 1700);

    function tick() {
      ctx.clearRect(0, 0, w, h);

      // music-reactive screen-wide sparkle — soft glowing dots that twinkle
      // in time with the bass, scattered anywhere on screen (not just near
      // the cursor). Stays calm and sparse even at full volume.
      sparkleFrame++;
      const level = audioReactive.level;
      if (level > 0.1 && sparkleFrame % 3 === 0) {
        spawn(Math.random() * window.innerWidth, Math.random() * window.innerHeight, level > 0.55 ? 2 : 1, true);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (!p.glow) p.vy -= 0.01 * dpr;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life * (p.glow ? 0.5 : 0.55);
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

  // ---- sitewide background music (persists mute/volume/position via localStorage) ----
  function initBgm() {
    const AUDIO_SRC = 'audio/background.mp3';
    const KEY_MUTED = 'kuufa-bgm-muted-v2';
    const KEY_VOLUME = 'kuufa-bgm-volume-v3';
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
      audio.crossOrigin = 'anonymous'; // needed so Web Audio can analyse same-origin audio safely
      document.body.appendChild(audio);
    }

    let storedMuted = false;
    let storedVolume = 0.07; // quieter default than before
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

    // ---- floating widget: mute button + volume slider ----
    let widget = document.querySelector('.bgm-widget');
    if (!widget) {
      widget = document.createElement('div');
      widget.className = 'bgm-widget';
      widget.innerHTML = `
        <button class="bgm-widget__btn" data-bgm-toggle aria-label="Звук фоновой музыки"></button>
        <input class="bgm-widget__volume" type="range" min="0" max="1" step="0.05" data-bgm-volume>
      `;
      document.body.appendChild(widget);
    }

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

    // feeds the background canvas sparkle (see initParticles) with the music level
    setupAudioReactivity(audio);
  }

  // ---- decorative side rails: make the marquee text long enough that it
  // never runs out mid-scroll (which is what caused the "jump back to
  // start" look), by repeating it and duplicating that into two identical
  // halves — a translateY(-50%) loop always lands on an identical repeat,
  // so the animation reads as one continuous scroll with no visible seam ----
  function initRails() {
    document.querySelectorAll('.rail__track').forEach((track) => {
      if (track.dataset.expanded) return; // rails live outside <main>, so this only needs to run once
      const unit = track.textContent.trim() + ' ';
      // 14 repeats comfortably outlasts even very tall/ultrawide viewports
      const half = unit.repeat(6);
      track.textContent = half + half;
      track.dataset.expanded = '1';
    });
  }

  // ---- scrollbar color: green at the top of the page, fading to magenta at the bottom ----
  let updateScrollColor = null;
  function initScrollColor() {
    const GREEN = [184, 255, 61];   // --accent
    const MAGENTA = [255, 59, 141]; // --glitch
    const root = document.documentElement;

    function update() {
      const max = root.scrollHeight - window.innerHeight;
      const t = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const r = Math.round(GREEN[0] + (MAGENTA[0] - GREEN[0]) * t);
      const g = Math.round(GREEN[1] + (MAGENTA[1] - GREEN[1]) * t);
      const b = Math.round(GREEN[2] + (MAGENTA[2] - GREEN[2]) * t);
      root.style.setProperty('--scroll-thumb', `rgba(${r}, ${g}, ${b}, 0.6)`);
      root.style.setProperty('--scroll-thumb-hover', `rgb(${r}, ${g}, ${b})`);
      root.style.setProperty('--scroll-thumb-glow', `rgba(${r}, ${g}, ${b}, 0.45)`);
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    updateScrollColor = update;
    update();
  }

  // ------------------------------------------------------------
  // SPA-style navigation: swaps <main>/<nav> via fetch instead of
  // a full page reload, so the <audio> element (and its playback
  // position) is never destroyed when moving between pages
  // ------------------------------------------------------------
  function initPjaxNav() {
    function currentFile() {
      const path = window.location.pathname;
      const file = path.substring(path.lastIndexOf('/') + 1);
      return file || 'index.html';
    }

    function isInternalHtmlLink(a) {
      if (!a || !a.getAttribute) return false;
      const href = a.getAttribute('href');
      if (!href) return false;
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return false;
      if (a.target === '_blank') return false;
      return href.endsWith('.html');
    }

    async function loadPage(url, push) {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('fetch failed: ' + res.status);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const newMain = doc.querySelector('main');
        const newNav = doc.querySelector('nav.nav');
        const newTitle = doc.querySelector('title');
        if (!newMain) { window.location.href = url; return; }

        document.title = newTitle ? newTitle.textContent : document.title;
        document.body.dataset.page = doc.body.dataset.page || '';

        const currentMain = document.querySelector('main');
        if (currentMain) currentMain.replaceWith(newMain);

        const currentNav = document.querySelector('nav.nav');
        if (newNav && currentNav) currentNav.replaceWith(newNav);

        if (push) history.pushState({ pjax: true }, '', url);

        window.scrollTo({ top: 0, behavior: 'auto' });
        mountPage();
      } catch (err) {
        // network hiccup or non-html response — fall back to a real navigation
        window.location.href = url;
      }
    }

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a || !isInternalHtmlLink(a)) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const href = a.getAttribute('href');
      e.preventDefault();
      if (href === currentFile()) return; // already on this page
      loadPage(href, true);
    });

    window.addEventListener('popstate', () => {
      loadPage(currentFile(), false);
    });

    history.replaceState({ pjax: true }, '', window.location.href);
  }

  // ---- shared dark backdrop that fades in behind a "zoomed" player ----
  function setZoomBackdrop(visible) {
    let backdrop = document.querySelector('.zoom-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'zoom-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.classList.toggle('is-visible', visible);
  }

  // ---- click outside a "zoomed" player shrinks it back down without
  // touching playback (delegated on document so it survives pjax swaps) ----
  function initVideoZoomOutsideClick() {
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.vplayer.is-zoomed').forEach((wrap) => {
        if (!wrap.contains(e.target)) {
          wrap.classList.remove('is-zoomed');
          const item = wrap.parentElement;
          if (item) item.classList.remove('is-zoomed-item');
        }
      });
      if (!document.querySelector('.vplayer.is-zoomed')) setZoomBackdrop(false);
    });
  }

  // ---- scrolling the page with the mouse wheel also shrinks a "zoomed"
  // player back down, same as clicking outside it — playback keeps going,
  // only the zoom/backdrop closes. Listens for 'wheel' specifically (not
  // 'scroll') so any programmatic/smooth scroll elsewhere on the page
  // doesn't trigger this — only an actual wheel spin from the user does ----
  function initVideoZoomWheelClose() {
    window.addEventListener('wheel', () => {
      let hadZoomed = false;
      document.querySelectorAll('.vplayer.is-zoomed').forEach((wrap) => {
        hadZoomed = true;
        wrap.classList.remove('is-zoomed');
        const item = wrap.parentElement;
        if (item) item.classList.remove('is-zoomed-item');
      });
      if (hadZoomed) setZoomBackdrop(false);
    }, { passive: true });
  }

  // ---- boot ----
  initRails();
  initParticles();
  initBgm();
  initScrollColor();
  initPjaxNav();
  initVideoZoomOutsideClick();
  initVideoZoomWheelClose();
  mountPage();
})();
