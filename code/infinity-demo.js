(() => {
  'use strict';
  const trigger = document.getElementById('infinity-demo');
  const demo = window.INFINITY_HOME_DEMO;
  if (!trigger || !demo || !window.InfinityViewer) return;

  const preview = trigger.querySelector('.infinity-demo-video');
  const expand = trigger.querySelector('.infinity-demo-expand');
  const timeline = trigger.querySelector('.infinity-demo-timeline');
  const shotLabel = trigger.querySelector('.infinity-demo-shot');
  const prompt = trigger.querySelector('.infinity-demo-prompt');
  const dialog = document.querySelector('.iv-dialog');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shots = demo.shots || [];
  let activeShot = -1;
  let inView = true;
  let opening = false;
  let wantsPlayback = !motion.matches;
  let userStarted = false;
  let managedPauses = 0;
  let managedPlay = false;
  let resumeAfterModal = false;

  const stamp = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  const clean = text => String(text || '').replace(/^\s*<(?:shot|chunk)_\d+>\s*<[^>]+>\s*/, '');

  const segments = shots.map(shot => {
    const segment = document.createElement('span');
    segment.className = 'infinity-demo-segment';
    segment.style.flexGrow = String(Math.max(0.01, Number(shot.end) - Number(shot.start)));
    timeline?.append(segment);
    return segment;
  });
  const syncTimeline = () => {
    const time = preview.currentTime || 0;
    const index = shots.findIndex((shot, i) => time >= shot.start && (time < shot.end || i === shots.length - 1));
    if (index < 0 || index === activeShot) return;
    activeShot = index;
    segments.forEach((segment, i) => segment.classList.toggle('is-active', i === index));
    const shot = shots[index];
    if (shotLabel) {
      const number = String(shot.index ?? index + 1).padStart(2, '0');
      shotLabel.textContent = `S${number}`;
      shotLabel.title = `Shot ${number} · ${stamp(shot.start)}–${stamp(shot.end)}`;
    }
    if (prompt) {
      prompt.textContent = clean(shot.prompt_en || shot.prompt_zh);
      prompt.title = prompt.textContent;
    }
  };

  const pausePreview = () => {
    if (preview.paused) return;
    managedPauses += 1;
    preview.pause();
  };
  const syncPlayback = () => {
    if ((motion.matches && !userStarted) || document.hidden || !inView || opening || dialog?.open) {
      pausePreview();
      return;
    }
    if (!wantsPlayback || !preview.paused || managedPlay) return;
    managedPlay = true;
    preview.play().catch(() => {}).finally(() => { managedPlay = false; });
  };

  preview.muted = true;
  // Drive automatic playback here so native pause and sound choices remain intact.
  preview.autoplay = false;
  preview.addEventListener('play', () => {
    if (!managedPlay) {
      wantsPlayback = true;
      userStarted = true;
    }
  });
  preview.addEventListener('pause', () => {
    if (managedPauses > 0) managedPauses -= 1;
    else wantsPlayback = false;
  });
  preview.addEventListener('timeupdate', syncTimeline);
  preview.addEventListener('seeked', syncTimeline);
  preview.addEventListener('loadedmetadata', syncTimeline);
  document.addEventListener('visibilitychange', syncPlayback);
  motion.addEventListener('change', syncPlayback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      syncPlayback();
    }, { threshold: 0.15 }).observe(trigger);
  }

  expand?.addEventListener('click', event => {
    event.stopPropagation();
    resumeAfterModal = !preview.paused;
    opening = true;
    pausePreview();
    try {
      window.InfinityViewer.open(demo, { startTime: preview.currentTime || 0 });
    } finally {
      opening = false;
      if (!dialog?.open) syncPlayback();
    }
  });
  dialog?.addEventListener('close', () => {
    if (resumeAfterModal) syncPlayback();
    resumeAfterModal = false;
  });
  syncTimeline();
  syncPlayback();
})();
