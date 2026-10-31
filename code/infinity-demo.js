(() => {
  'use strict';
  const trigger = document.getElementById('infinity-demo');
  const demo = window.INFINITY_HOME_DEMO;
  if (!trigger || !demo) return;

  const preview = trigger.querySelector('.infinity-demo-video');
  const frame = trigger.querySelector('.infinity-demo-frame');
  const expand = trigger.querySelector('.infinity-demo-expand');
  const timeline = trigger.querySelector('.infinity-demo-timeline');
  const shotLabel = trigger.querySelector('.infinity-demo-shot');
  const prompt = trigger.querySelector('.infinity-demo-prompt');
  if (!preview || !frame) return;
  const dialog = document.querySelector('.iv-dialog');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shots = demo.shots || [];
  let activeShot = -1, inView = true, opening = false;
  let wantsPlayback = !motion.matches, userStarted = false;
  let managedPauses = 0, managedPlay = false, resumeAfterModal = false, scrubbing = false;
  const stamp = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  const clean = text => String(text || '').replace(/^\s*<(?:shot|chunk)_\d+>\s*<[^>]+>\s*/, '');
  const duration = () => Number.isFinite(preview.duration) ? preview.duration : Number(demo.duration) || 0;

  // Native controls remain the fallback until this compact control bar is ready.
  const icons = {
    play: ['M8 5l11 7-11 7z'],
    pause: ['M8 5v14M16 5v14'],
    mute: ['M11 5L6 9H3v6h3l5 4z', 'M16 9l5 6M21 9l-5 6'],
    sound: ['M11 5L6 9H3v6h3l5 4z', 'M15 8a6 6 0 010 8M18 5a10 10 0 010 14'],
    fullscreen: ['M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6'],
    exit: ['M3 9h6V3M15 3v6h6M9 21v-6H3M21 15h-6v6']
  };
  const makeButton = (name, label) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `infinity-demo-control infinity-demo-${name}`;
    button.setAttribute('aria-label', label); button.title = label;
    return button;
  };
  const setIcon = (button, name, label) => {
    if (button.dataset.icon !== name) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      for (const d of icons[name]) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d); svg.append(path);
      }
      button.replaceChildren(svg); button.dataset.icon = name;
    }
    button.setAttribute('aria-label', label); button.title = label;
  };
  const controls = document.createElement('div'); controls.className = 'infinity-demo-controls';
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Video controls');
  const play = makeButton('play', 'Pause video');
  const time = document.createElement('span'); time.className = 'infinity-demo-time'; time.setAttribute('aria-hidden', 'true');
  const seek = document.createElement('input'); seek.type = 'range'; seek.className = 'infinity-demo-seek';
  seek.min = '0'; seek.max = String(duration()); seek.step = '0.01'; seek.value = '0'; seek.disabled = true;
  seek.setAttribute('aria-label', 'Video progress');
  const mute = makeButton('mute', 'Unmute video');
  const fullscreen = makeButton('fullscreen', 'Enter fullscreen');
  controls.append(play, time, seek, mute, fullscreen);
  frame.append(controls);

  const segments = shots.map(shot => {
    const segment = document.createElement('span'); segment.className = 'infinity-demo-segment';
    segment.style.flexGrow = String(Math.max(0.01, Number(shot.end) - Number(shot.start)));
    timeline?.append(segment); return segment;
  });
  const syncTimeline = () => {
    const current = preview.currentTime || 0, total = duration();
    time.textContent = `${stamp(current)} / ${stamp(total)}`;
    seek.max = String(total);
    if (!scrubbing) seek.value = String(current);
    seek.setAttribute('aria-valuetext', `${stamp(current)} of ${stamp(total)}`);
    seek.style.setProperty('--progress', `${total ? current / total * 100 : 0}%`);
    const index = shots.findIndex((shot, i) => current >= shot.start && (current < shot.end || i === shots.length - 1));
    if (index < 0 || index === activeShot) return;
    activeShot = index;
    segments.forEach((segment, i) => segment.classList.toggle('is-active', i === index));
    const shot = shots[index], number = String(shot.index ?? index + 1).padStart(2, '0');
    if (shotLabel) { shotLabel.textContent = `S${number}`; shotLabel.title = `Shot ${number} · ${stamp(shot.start)}–${stamp(shot.end)}`; }
    if (prompt) { prompt.textContent = clean(shot.prompt_en || shot.prompt_zh); prompt.title = prompt.textContent; }
  };
  const syncControls = () => {
    setIcon(play, preview.paused ? 'play' : 'pause', preview.paused ? 'Play video' : 'Pause video');
    const silent = preview.muted || preview.volume === 0;
    setIcon(mute, silent ? 'mute' : 'sound', silent ? 'Unmute video' : 'Mute video');
    const expanded = document.fullscreenElement === trigger || document.webkitFullscreenElement === trigger;
    setIcon(fullscreen, expanded ? 'exit' : 'fullscreen', expanded ? 'Exit fullscreen' : 'Enter fullscreen');
  };
  const pausePreview = () => { if (!preview.paused) { managedPauses += 1; preview.pause(); } };
  const syncPlayback = () => {
    if ((motion.matches && !userStarted) || document.hidden || !inView || opening || dialog?.open) { pausePreview(); return; }
    if (!wantsPlayback || !preview.paused || managedPlay) return;
    managedPlay = true;
    preview.play().catch(() => {}).finally(() => { managedPlay = false; syncControls(); });
  };
  play.addEventListener('click', () => {
    if (preview.paused) {
      userStarted = true; wantsPlayback = true;
      preview.play().catch(() => {});
    } else { wantsPlayback = false; preview.pause(); }
  });
  mute.addEventListener('click', () => {
    const silent = preview.muted || preview.volume === 0;
    if (silent && preview.volume === 0) preview.volume = 1;
    preview.muted = !silent;
    syncControls();
  });
  seek.addEventListener('pointerdown', () => { scrubbing = true; });
  const endScrub = () => { scrubbing = false; syncTimeline(); };
  window.addEventListener('pointerup', endScrub);
  window.addEventListener('pointercancel', endScrub);
  seek.addEventListener('change', endScrub);
  seek.addEventListener('input', () => {
    if (preview.readyState < 1) return;
    // Seeking does not change play/pause intent, including keyboard adjustments.
    preview.currentTime = Math.min(duration(), Math.max(0, Number(seek.value)));
    syncTimeline();
  });
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === trigger) await document.exitFullscreen();
      else if (document.webkitFullscreenElement === trigger) document.webkitExitFullscreen();
      else if (trigger.requestFullscreen) await trigger.requestFullscreen();
      else if (trigger.webkitRequestFullscreen) trigger.webkitRequestFullscreen();
      else if (preview.webkitEnterFullscreen) preview.webkitEnterFullscreen();
      else await openExpanded();
    } catch {
      // Embedded browsers may deny fullscreen even after a control click.
      await openExpanded();
    }
  });
  fullscreen.hidden = !(trigger.requestFullscreen || trigger.webkitRequestFullscreen || preview.webkitEnterFullscreen || window.InfinityViewer);
  document.addEventListener('fullscreenchange', syncControls);
  document.addEventListener('webkitfullscreenchange', syncControls);

  preview.muted = true; preview.autoplay = false;
  preview.addEventListener('play', () => {
    if (!managedPlay) { wantsPlayback = true; userStarted = true; }
    syncControls();
  });
  preview.addEventListener('pause', () => {
    if (managedPauses > 0) managedPauses -= 1; else wantsPlayback = false;
    syncControls();
  });
  preview.addEventListener('volumechange', syncControls);
  preview.addEventListener('timeupdate', syncTimeline);
  preview.addEventListener('seeked', syncTimeline);
  const metadata = () => {
    if (preview.videoWidth && preview.videoHeight) frame.style.aspectRatio = `${preview.videoWidth} / ${preview.videoHeight}`;
    seek.disabled = preview.readyState < 1; syncTimeline();
  };
  preview.addEventListener('loadedmetadata', metadata);
  preview.addEventListener('durationchange', syncTimeline);
  document.addEventListener('visibilitychange', syncPlayback);
  motion.addEventListener('change', syncPlayback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncPlayback(); }, { threshold: 0.15 }).observe(trigger);
  }
  async function openExpanded() {
    if (!window.InfinityViewer || opening || dialog?.open) return;
    resumeAfterModal = !preview.paused; opening = true; pausePreview();
    try {
      try {
        if (document.fullscreenElement === trigger) await document.exitFullscreen();
        else if (document.webkitFullscreenElement === trigger) document.webkitExitFullscreen();
      } catch { /* The accessible expanded viewer remains available. */ }
      window.InfinityViewer.open(demo, { startTime: preview.currentTime || 0 });
    } finally { opening = false; if (!dialog?.open) syncPlayback(); }
  }
  expand?.addEventListener('click', event => {
    event.stopPropagation();
    openExpanded();
  });
  dialog?.addEventListener('close', () => { if (resumeAfterModal) syncPlayback(); resumeAfterModal = false; });
  metadata(); syncControls();
  preview.controls = false;
  trigger.classList.add('has-custom-controls');
  syncPlayback();
})();
