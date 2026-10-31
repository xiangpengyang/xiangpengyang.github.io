(() => {
  'use strict';
  const trigger = document.getElementById('infinity-demo');
  const demo = window.INFINITY_HOME_DEMO;
  if (!trigger || !demo || !window.InfinityViewer) return;

  const preview = trigger.querySelector('.infinity-demo-video');
  const timeline = trigger.querySelector('.infinity-demo-timeline');
  const dialog = document.querySelector('.iv-dialog');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shots = demo.shots || [];
  let activeShot = -1;
  let inView = true;
  let opening = false;

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
  preview.addEventListener('timeupdate', syncTimeline);
  preview.addEventListener('seeked', syncTimeline);
  preview.addEventListener('loadedmetadata', syncTimeline);
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
  syncTimeline();
  syncPlayback();
})();
