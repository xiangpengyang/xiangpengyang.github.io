(() => {
  'use strict';
  const trigger = document.getElementById('infinity-demo');
  const demo = window.INFINITY_HOME_DEMO;
  if (!trigger || !demo || !window.InfinityViewer) return;

  const preview = trigger.querySelector('.infinity-demo-video');
  const shotLabel = trigger.querySelector('.infinity-demo-shot');
  const prompt = trigger.querySelector('.infinity-demo-prompt');
  const dialog = document.querySelector('.iv-dialog');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shots = demo.shots || [];
  let activeShot = -1;
  let inView = true;
  let opening = false;

  const stamp = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  const clean = text => String(text || '').replace(/^\s*<(?:shot|chunk)_\d+>\s*<[^>]+>\s*/, '');
  const syncPrompt = () => {
    const time = preview.currentTime || 0;
    const index = shots.findIndex((shot, i) => time >= shot.start && (time < shot.end || i === shots.length - 1));
    if (index < 0 || index === activeShot) return;
    activeShot = index;
    const shot = shots[index];
    shotLabel.textContent = `SHOT ${String(shot.index ?? index + 1).padStart(2, '0')} · ${stamp(shot.start)}–${stamp(shot.end)}`;
    prompt.textContent = clean(shot.prompt_en || shot.prompt_zh);
  };

  const syncPlayback = () => {
    if (motion.matches || document.hidden || !inView || opening || dialog?.open) {
      preview.pause();
      return;
    }
    preview.play().catch(() => {});
  };

  preview.muted = true;
  preview.autoplay = !motion.matches;
  preview.addEventListener('timeupdate', syncPrompt);
  preview.addEventListener('seeked', syncPrompt);
  preview.addEventListener('loadedmetadata', syncPrompt);
  document.addEventListener('visibilitychange', syncPlayback);
  motion.addEventListener('change', () => {
    preview.autoplay = !motion.matches;
    syncPlayback();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      syncPlayback();
    }, { threshold: 0.15 }).observe(trigger);
  }

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    opening = true;
    preview.pause();
    try {
      window.InfinityViewer.open(demo, { startTime: preview.currentTime || 0 });
    } finally {
      opening = false;
      if (!dialog?.open) syncPlayback();
    }
  });
  dialog?.addEventListener('close', syncPlayback);
  syncPrompt();
  syncPlayback();
})();
