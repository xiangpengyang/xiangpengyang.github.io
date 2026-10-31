(() => {
  'use strict';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const button = (cls, text, action) => { const n = el('button', cls, text); n.type = 'button'; if (action) n.addEventListener('click', action); return n; };
  const stamp = (value, precise = false) => {
    const s = Math.max(0, Number(value) || 0), m = Math.floor(s / 60);
    return `${m}:${(precise ? (s % 60).toFixed(2) : Math.floor(s % 60).toString()).padStart(precise ? 5 : 2, '0')}`;
  };
  const clean = text => String(text || '').replace(/^\s*<(?:shot|chunk)_\d+>\s*<[^>]+>\s*/, '');
  const safeURL = value => { try { const u = new URL(value, document.baseURI); return ['http:', 'https:', 'file:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  let item, language = 'en', active = -1, entries = [], cards = [], segments = [], returnFocus, pendingSeek = null, previousOverflow = '';
  let overlayEnabled = true, modalSessionActive = false, loadController = null, loadVersion = 0, objectURL = null;
  let loadingPhase = '', loadingReceived = 0, loadingTotal = 0, pendingPlay = false;
  let scrubbing = false, scrubPointer = null, resumeAfterScrub = false;

  const dialog = el('dialog', 'iv-dialog');
  dialog.setAttribute('aria-labelledby', 'iv-title');
  const header = el('header', 'iv-header');
  const headingBlock = el('div', 'iv-heading');
  const eyebrow = el('div', 'iv-eyebrow');
  const title = el('h2', 'iv-title'); title.id = 'iv-title';
  headingBlock.append(eyebrow, title);
  const closeButton = button('iv-close', '×', () => dialog.close()); closeButton.setAttribute('aria-label', 'Close video and prompts');
  header.append(headingBlock, closeButton);

  const body = el('div', 'iv-body');
  const stage = el('section', 'iv-stage'); stage.setAttribute('aria-label', 'Video player');
  const videoWrap = el('div', 'iv-video-wrap');
  const video = el('video', 'iv-video'); video.controls = true; video.playsInline = true; video.preload = 'metadata';
  const overlay = el('div', 'iv-overlay');
  const overlayLabel = el('div', 'iv-overlay-label'); const overlayText = el('p', 'iv-overlay-text');
  overlay.append(overlayLabel, overlayText); videoWrap.append(video, overlay);
  const loading = el('div', 'iv-loading'); loading.hidden = true;
  const loadingText = el('span', 'iv-loading-text'); loadingText.setAttribute('role', 'status');
  const loadingProgress = el('progress', 'iv-loading-progress'); loadingProgress.max = 100; loadingProgress.setAttribute('aria-label', 'Video download progress');
  loading.append(loadingText, loadingProgress);
  const scrubRow = el('div', 'iv-scrub-row');
  const elapsed = el('span', 'iv-elapsed', '0:00'); elapsed.setAttribute('aria-hidden', 'true');
  const scrubber = el('input', 'iv-scrubber'); scrubber.type = 'range'; scrubber.min = '0'; scrubber.max = '1'; scrubber.step = '0.01'; scrubber.value = '0'; scrubber.disabled = true;
  scrubber.setAttribute('aria-label', 'Video progress');
  const totalTime = el('span', 'iv-total-time', '0:00'); totalTime.setAttribute('aria-hidden', 'true');
  scrubRow.append(elapsed, scrubber, totalTime);
  const timeline = el('div', 'iv-timeline'); timeline.setAttribute('aria-label', 'Prompt timeline');
  const playerMeta = el('div', 'iv-player-meta');
  const specs = el('span', 'iv-specs');
  const overlayLabelControl = el('label', 'iv-toggle');
  const overlayCheck = el('input'); overlayCheck.type = 'checkbox'; overlayCheck.checked = true;
  overlayLabelControl.append(overlayCheck, el('span', '', 'Prompt overlay'));
  overlayCheck.addEventListener('change', () => { overlayEnabled = overlayCheck.checked; overlay.hidden = !overlayEnabled || active < 0; });
  const fullLink = el('a', 'iv-open-link', 'Open video ↗'); fullLink.target = '_blank'; fullLink.rel = 'noopener';
  playerMeta.append(specs, overlayLabelControl, fullLink);
  const summary = el('p', 'iv-summary');
  const sourceNote = el('p', 'iv-source-note', 'Prompt timestamps; generated cuts may vary.');
  const playbackError = el('p', 'iv-playback-error'); playbackError.hidden = true; playbackError.setAttribute('role', 'status');
  stage.append(videoWrap, loading, playbackError, scrubRow, timeline, playerMeta, summary, sourceNote);

  const panel = el('aside', 'iv-panel'); panel.setAttribute('aria-label', 'Prompts');
  const panelHead = el('div', 'iv-panel-head');
  const panelTitle = el('h3', 'iv-panel-title', 'Shot prompts');
  const languageControl = el('div', 'iv-language'); languageControl.setAttribute('aria-label', 'Prompt language');
  const english = button('iv-language-button', 'EN', () => setLanguage('en'));
  const chinese = button('iv-language-button', '中文', () => setLanguage('zh'));
  languageControl.append(english, chinese); panelHead.append(panelTitle, languageControl);
  const list = el('div', 'iv-prompt-list');
  const fullDetails = el('details', 'iv-full-details');
  const fullSummary = el('summary', '', 'Full prompt');
  const fullDescription = el('p', 'iv-full-description');
  const copyRow = el('div', 'iv-copy-row');
  const copyButton = button('iv-copy-button', 'Copy full prompt', copyPrompt);
  const copyStatus = el('span', 'iv-copy-status'); copyStatus.setAttribute('role', 'status');
  copyRow.append(copyButton, copyStatus);
  const fullPrompt = el('pre', 'iv-full-prompt'); fullPrompt.tabIndex = 0;
  fullDetails.append(fullSummary, fullDescription, copyRow, fullPrompt);
  panel.append(panelHead, list, fullDetails); body.append(stage, panel); dialog.append(header, body);
  document.body.append(dialog);

  function textFor(entry) {
    if (language === 'zh') return entry.prompt_zh || entry.zh || entry.prompt_en || entry.generated_prompt_en || entry.text || entry.prompt || '';
    return entry.generated_prompt_en || entry.prompt_en || entry.en || entry.text || entry.prompt || entry.prompt_zh || '';
  }
  function previewFor(entry) {
    const summary = language === 'zh' ? entry.summary_zh : entry.summary_en;
    if (summary) return summary;
    const text = clean(textFor(entry));
    return item.chunks?.length && text.length > 450 ? text.slice(0,450).trimEnd() + '…' : text;
  }
  function exactPrompt() {
    return language === 'zh' ? item.prompt_zh || item.prompt_en || item.generated_prompt_en || item.prompt || '' : item.generated_prompt_en || item.prompt_en || item.prompt || item.prompt_zh || '';
  }
  function setLanguage(lang) {
    language = lang;
    english.setAttribute('aria-pressed', String(lang === 'en'));
    chinese.setAttribute('aria-pressed', String(lang === 'zh'));
    summary.textContent = lang === 'zh' ? item.summary_zh || item.summary_en || item.summary || '' : item.summary_en || item.summary || item.summary_zh || '';
    cards.forEach((card, i) => { card.querySelector('.iv-prompt-text').textContent = previewFor(entries[i]); const full = card.querySelector('.iv-chunk-full-text'); if(full) full.textContent = textFor(entries[i]); const label = card.querySelector('.iv-chunk-expand-label'); if(label) label.textContent = lang === 'zh' ? '展开本 chunk 的全部镜头 Prompt' : 'Read every shot prompt in this chunk'; });
    fullPrompt.textContent = exactPrompt();
    fullDescription.textContent = lang === 'zh' ? '原始完整场景 Prompt，包含共享上下文和镜头描述。' : 'Original full scene prompt, including shared context and shot descriptions.';
    sourceNote.textContent = lang === 'zh' && item.language_note_zh ? item.language_note_zh : item.prompt_source_note || (item.chunks?.length ? 'Select a chunk to jump to its prompt and video segment.' : 'Prompt timestamps; generated cuts may vary.');
    fullSummary.textContent = lang === 'zh' ? '完整 Prompt' : 'Full prompt';
    copyButton.textContent = lang === 'zh' ? '复制完整 Prompt' : 'Copy full prompt';
    copyStatus.textContent = '';
    if (active >= 0) overlayText.textContent = previewFor(entries[active]);
    renderLoading(); syncScrubber(scrubbing ? Number(scrubber.value) : pendingSeek ?? video.currentTime);
  }
  function updateActive(time) {
    let index = entries.findIndex((entry, i) => time >= Number(entry.start || 0) && (time < Number(entry.end) || i === entries.length - 1));
    if (index < 0 && entries.length && time < Number(entries[0].start || 0)) index = 0;
    if (index === active) return;
    active = index;
    cards.forEach((card, i) => { card.classList.toggle('is-active', i === index); card.setAttribute('aria-current', i === index ? 'true' : 'false'); });
    segments.forEach((segment, i) => { segment.classList.toggle('is-active', i === index); segment.setAttribute('aria-current', i === index ? 'true' : 'false'); });
    overlay.hidden = !overlayEnabled || index < 0;
    if (index >= 0) {
      overlayLabel.textContent = `${item.chunks?.length ? 'Chunk' : 'Shot'} ${String(entries[index].index ?? entries[index].shot_id ?? index + 1).padStart(2, '0')} · ${stamp(entries[index].start)}–${stamp(entries[index].end)}`;
      overlayText.textContent = previewFor(entries[index]);
    }
  }
  function hasMetadata() { return video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0; }
  function durationForDisplay() { return hasMetadata() ? video.duration : Math.max(0, Number(item?.duration || item?.provenance?.generated_duration) || 0); }
  function syncScrubber(time = video.currentTime) {
    const duration = durationForDisplay(), position = Math.min(Math.max(0, Number(time) || 0), duration);
    scrubber.disabled = !hasMetadata(); scrubber.max = String(duration || 1); scrubber.value = String(position);
    scrubber.style.setProperty('--iv-progress', `${duration ? position / duration * 100 : 0}%`);
    scrubber.setAttribute('aria-valuetext', `${stamp(position)} ${language === 'zh' ? '/' : 'of'} ${stamp(duration)}`);
    elapsed.textContent = stamp(position); totalTime.textContent = stamp(duration);
  }
  function seekTo(seconds, play = false) {
    const requested = Math.max(0, Number(seconds) || 0);
    const target = hasMetadata() ? Math.min(requested, video.duration) : requested;
    if (hasMetadata()) { video.currentTime = target; pendingSeek = null; }
    else pendingSeek = target;
    if (play) { pendingPlay = true; if (video.getAttribute('src')) video.play().catch(() => {}); }
    updateActive(target); syncScrubber(target);
  }
  function seek(index) { seekTo(entries[index].start, true); }
  function beginScrub(event) {
    if (scrubber.disabled || event.button !== 0 || scrubbing) return;
    scrubbing = true; scrubPointer = event.pointerId; resumeAfterScrub = !video.paused && !video.ended;
    video.pause();
  }
  function endScrub() {
    if (!scrubbing) return;
    const resume = resumeAfterScrub;
    seekTo(scrubber.value); scrubbing = false; scrubPointer = null; resumeAfterScrub = false;
    if (resume && dialog.open && Number(scrubber.value) < video.duration) video.play().catch(() => {});
  }
  scrubber.addEventListener('pointerdown', beginScrub);
  scrubber.addEventListener('input', () => seekTo(scrubber.value));
  scrubber.addEventListener('change', () => { if (scrubbing) endScrub(); else seekTo(scrubber.value); });
  document.addEventListener('pointerup', event => { if (event.pointerId === scrubPointer) endScrub(); });
  document.addEventListener('pointercancel', event => { if (event.pointerId === scrubPointer) endScrub(); });
  scrubber.addEventListener('blur', endScrub);

  function renderLoading() {
    loading.hidden = !loadingPhase;
    stage.setAttribute('aria-busy', String(Boolean(loadingPhase)));
    if (!loadingPhase) return;
    let text;
    if (loadingPhase === 'preparing') {
      text = language === 'zh' ? '正在准备播放…' : 'Preparing playback…'; loadingProgress.value = 100;
    } else if (loadingPhase === 'download' && loadingTotal > 0) {
      const percentage = Math.min(99, Math.floor(loadingReceived / loadingTotal * 100));
      text = `${language === 'zh' ? '正在加载视频' : 'Loading video'}… ${percentage}%`; loadingProgress.value = percentage;
    } else {
      text = language === 'zh' ? '正在加载视频…' : 'Loading video…'; loadingProgress.removeAttribute('value');
    }
    if (loadingText.textContent !== text) loadingText.textContent = text;
  }
  function setLoading(phase, received = 0, total = 0) {
    loadingPhase = phase; loadingReceived = received; loadingTotal = total; renderLoading();
  }
  function showPlaybackError(message) {
    setLoading(''); playbackError.textContent = message; playbackError.hidden = false;
  }
  function releaseMedia() {
    loadVersion++; loadController?.abort(); loadController = null;
    scrubbing = false; scrubPointer = null; resumeAfterScrub = false; pendingSeek = null; pendingPlay = false;
    video.pause(); video.removeAttribute('src'); video.load();
    if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; }
    setLoading(''); scrubber.disabled = true;
  }
  function attachSource(url, version) {
    if (version !== loadVersion || !dialog.open) return;
    setLoading('preparing'); video.src = url; video.load();
    if (pendingPlay) video.play().catch(() => {});
  }
  async function loadVideo(url, version) {
    if (!url) { showPlaybackError('The video link is unavailable. Please refresh this page and try again.'); return; }
    if (url.startsWith('file:')) { attachSource(url, version); return; }
    const controller = new AbortController(); loadController = controller;
    const current = () => version === loadVersion && dialog.open && !controller.signal.aborted;
    let response;
    try {
      // A range-capable host can stream directly. Otherwise reuse this one response
      // as a complete Blob, which makes arbitrary seeking available in every browser.
      response = await fetch(url, { headers: { Range: 'bytes=0-0' }, credentials: 'same-origin', signal: controller.signal });
    } catch (error) {
      if (!current()) return;
      // Direct media loading can still work when cross-origin fetch is restricted.
      attachSource(url, version); return;
    }
    try {
      if (!current()) { await response.body?.cancel(); return; }
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!response.ok || (type && !type.startsWith('video/') && !['application/octet-stream', 'binary/octet-stream', 'application/mp4'].includes(type))) {
        await response.body?.cancel();
        throw new Error('The video is unavailable. Please refresh this page, or try the Open video link below.');
      }
      if (response.status === 206) {
        await response.body?.cancel(); attachSource(url, version); return;
      }
      if (response.status !== 200) { await response.body?.cancel(); throw new Error('The video could not load. Please refresh this page and try again.'); }
      const total = Number(response.headers.get('content-length')) || 0;
      setLoading('download', 0, total);
      let blob;
      if (response.body?.getReader) {
        const reader = response.body.getReader(), chunks = []; let received = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (!current()) { await reader.cancel(); return; }
          if (done) break;
          if (!received && /^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(new TextDecoder().decode(value.subarray(0, 256)))) {
            await reader.cancel(); throw new Error('The video is unavailable. Please refresh this page, or try the Open video link below.');
          }
          chunks.push(value); received += value.byteLength; setLoading('download', received, total);
        }
        blob = new Blob(chunks, { type: type || 'video/mp4' });
      } else blob = await response.blob();
      if (!current()) return;
      if (!blob.size) throw new Error('The video could not load. Please refresh this page and try again.');
      objectURL = URL.createObjectURL(blob); attachSource(objectURL, version);
    } catch (error) {
      if (!current()) return;
      showPlaybackError(error.message || 'The video download was interrupted. Please reopen it to try again.');
    }
  }
  function populatePrompts() {
    list.replaceChildren(); timeline.replaceChildren(); cards = []; segments = []; active = -1;
    const isChunk = Boolean(item.chunks?.length);
    entries = (isChunk ? item.chunks : item.shots || []).map((entry, i) => ({ ...entry, index: entry.index ?? entry.shot_id ?? i + 1 }));
    panelTitle.textContent = isChunk ? item.chunk_label || 'Chunk prompts' : 'Shot prompts';
    panel.classList.toggle('iv-chunks-mode', isChunk);
    fullDetails.hidden = !(item.prompt_en || item.prompt_zh || item.generated_prompt_en || item.prompt);
    if (!entries.length) list.append(el('p', 'iv-empty', item.prompt_en || item.prompt_zh ? 'Read the complete scene description below.' : 'The original prompt is not available for this archived demonstration.'));
    for (const [i, entry] of entries.entries()) {
      const card = isChunk ? el('article','iv-prompt-card iv-chunk-card') : button('iv-prompt-card', null, () => seek(i));
      const seekButton = isChunk ? button('iv-chunk-seek',null,()=>seek(i)) : card;
      seekButton.setAttribute('aria-label', `${isChunk ? 'Chunk' : 'Shot'} ${entry.index}, seek to ${stamp(entry.start)}`);
      const cardHead = el('span', 'iv-prompt-card-head');
      cardHead.append(el('span', 'iv-shot-number', `${isChunk ? 'C' : 'S'}${String(entry.index).padStart(2, '0')}`), el('span', 'iv-time', `${stamp(entry.start, true)} — ${stamp(entry.end, true)}`), el('span', 'iv-seek-icon', '↗'));
      seekButton.append(cardHead);
      if(isChunk) seekButton.append(el('span','iv-chunk-kind',entry.summary_en ? 'PRESENTATION SUMMARY' : 'PROMPT EXCERPT'));
      seekButton.append(el('span', 'iv-prompt-text', previewFor(entry)));
      if(isChunk){card.append(seekButton);const detail=el('details','iv-chunk-details');const heading=el('summary','iv-chunk-expand-label','Read every shot prompt in this chunk');detail.append(heading,el('pre','iv-chunk-full-text',textFor(entry)));card.append(detail);}
      cards.push(card); list.append(card);
      const segment = button('iv-segment', '', () => seek(i));
      segment.style.flexGrow = String(Math.max(.1, Number(entry.end) - Number(entry.start)));
      segment.setAttribute('aria-label', `${isChunk ? 'Chunk' : 'Shot'} ${entry.index}: ${stamp(entry.start)} to ${stamp(entry.end)}`);
      segment.title = `${isChunk ? 'Chunk' : 'Shot'} ${entry.index} · ${stamp(entry.start)}–${stamp(entry.end)}`;
      segment.append(el('span', '', String(entry.index))); segments.push(segment); timeline.append(segment);
    }
    timeline.hidden = !entries.length;
    sourceNote.textContent = item.prompt_source_note || (isChunk ? 'Select a chunk to jump to its prompt and video segment.' : 'Prompt timestamps; generated cuts may vary.');
    setLanguage(language); updateActive(0);
  }
  async function copyPrompt() {
    const content = exactPrompt();
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(content);
      else {
        const field = el('textarea', 'iv-copy-fallback'); field.value = content; dialog.append(field); field.focus(); field.select();
        const success = document.execCommand('copy'); field.remove(); copyButton.focus(); if (!success) throw new Error('copy unavailable');
      }
      copyStatus.textContent = language === 'zh' ? '已复制' : 'Copied';
    } catch {
      fullDetails.open = true; fullPrompt.focus();
      const range = document.createRange(); range.selectNodeContents(fullPrompt); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      copyStatus.textContent = language === 'zh' ? '已选中，请按 ⌘/Ctrl+C' : 'Selected. Press ⌘/Ctrl+C.';
    }
  }
  function open(next, options = {}) {
    if (!next || !(next.video || next.src)) return;
    const requestedStart = Number(options?.startTime);
    const startTime = Number.isFinite(requestedStart) ? Math.max(0, requestedStart) : 0;
    const alreadyOpen = dialog.open;
    if (!modalSessionActive) { returnFocus = document.activeElement; previousOverflow = document.body.style.overflow; modalSessionActive = true; }
    releaseMedia();
    item = next; language = 'en'; pendingPlay = true;
    title.textContent = item.title || item.category_en || item.category_zh || item.category || 'Multi-shot sequence';
    eyebrow.textContent = ['INFINITY SHOTS', item.category_en, item.category_zh || item.category].filter(Boolean).join(' / ');
    const sourceURL = safeURL(item.video || item.src);
    video.poster = item.poster ? safeURL(item.poster) : '';
    video.setAttribute('aria-label', title.textContent); video.muted = false;
    fullLink.href = sourceURL;
    const width = item.width || item.provenance?.width, height = item.height || item.provenance?.height;
    specs.textContent = [width && height ? `${width} × ${height}` : null, item.fps || item.provenance?.fps ? `${item.fps || item.provenance.fps} fps` : null, Number(item.duration || item.provenance?.generated_duration) ? `${Number(item.duration || item.provenance.generated_duration).toFixed(1)} s` : null].filter(Boolean).join(' · ');
    fullDetails.open = false; playbackError.hidden = true; overlayCheck.checked = overlayEnabled;
    populatePrompts(); seekTo(startTime); document.body.style.overflow = 'hidden';
    if (!alreadyOpen) dialog.showModal();
    panel.scrollTop = 0; stage.scrollTop = 0; dialog.scrollTop = 0; closeButton.focus();
    setLoading('checking'); loadVideo(sourceURL, loadVersion);
  }
  dialog.addEventListener('close', () => {
    // A close event queued for a previous opening must not clear a newly opened film.
    if (dialog.open) return;
    releaseMedia(); document.body.style.overflow = previousOverflow; modalSessionActive = false;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  function syncPlayback() {
    if (!dialog.open || scrubbing) return;
    updateActive(video.currentTime); syncScrubber();
  }
  video.addEventListener('timeupdate', syncPlayback);
  video.addEventListener('seeked', syncPlayback);
  video.addEventListener('durationchange', () => { if (dialog.open && !scrubbing) syncScrubber(pendingSeek ?? video.currentTime); });
  video.addEventListener('loadedmetadata', () => {
    if (!dialog.open || !video.getAttribute('src') || !hasMetadata()) return;
    setLoading('');
    if (pendingSeek != null) seekTo(pendingSeek, pendingPlay);
    else syncPlayback();
  });
  video.addEventListener('error', () => {
    if (!dialog.open || !video.getAttribute('src') || !video.error) return;
    showPlaybackError('This video could not play. Try opening it directly using the Open video link below.');
  });
  window.InfinityViewer = { open, close: () => dialog.close() };
})();
