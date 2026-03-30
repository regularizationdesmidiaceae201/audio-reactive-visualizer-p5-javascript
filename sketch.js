let defaultSong = null; // bundled asset
let song = null; // currently active sound (default or custom)
let fft = null;
let amp = null;
let peak = null;
let customSong = null; // loaded custom sound (if any)

const radBase = 70;
let rad = radBase;
let rOuter = 200;
let rotation = 0;
let particles = [];

let playerFileInputEl, demoTrackBtn, chooseTrackBtn, localFileName, playerErrorEl, replaceTrackBtn;
let playerPanel, playerClose, playPauseBtn, restartBtn, volRange, seekRange;
let muteBtn, fullscreenBtn, volumeControl;
let infoModalOverlayEl, infoModalEl, infoModalCloseBtn, infoBtn;
let sliderHideTimeoutId = null;
let volWrapEl = null;
let audioReady = false;
let selectedFile = null;
let selectedFileURL = null;
let currentVolume = 1;
let previousVolume = 1;
let isMuted = false;
let isSeeking = false;
let defaultLoadFailed = false;
let loopEnabled = false;
let loopStart = 0;
let loopEnd = null;
let draggingLoopMarker = null; // 'start', 'end', or 'region'
let isDraggingLoopMarker = false;
let activePointerId = null;
let loopRegionDragStartX = null;
let loopRegionDragStartS = null;
let loopRegionDragStartE = null;
let loopToggle, loopStartMarker, loopEndMarker, seekContainer, loopRegionEl;
// Seek position chosen while paused.
let deferredSeek = null;
// Pending start time used to keep the UI in sync when resuming from paused seek.
let pendingStartTime = null;
let pendingStartSince = null;
// track previous playing state to detect natural end-of-track transitions
let lastWasPlaying = false;
// Separate audible output from analysis so volume changes do not affect visuals.
let masterOutputGain = null;
let analysisInputGain = null;

function setup(){
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  colorMode(HSB, 360, 100, 100, 255);

  // Create analyzers and bind them after the source is ready.
  fft = new p5.FFT(0.9, 1024);
  amp = new p5.Amplitude();
  peak = new p5.PeakDetect(20, 20000, 0.15, 20);

  // Route audio through separate gains for playback and analysis.
  try{
    masterOutputGain = new p5.Gain();
    analysisInputGain = new p5.Gain();
    // Keep the analysis path silent.
    try{ analysisInputGain.disconnect(); }catch(_){ }
    // Connect the audible output gain and set its initial level.
    try{ masterOutputGain.connect(); masterOutputGain.amp(currentVolume); }catch(_){ }
  }catch(_){ masterOutputGain = null; analysisInputGain = null; }

  playerFileInputEl = document.getElementById('playerFileInput');
  demoTrackBtn = document.getElementById('demoTrackBtn');
  chooseTrackBtn = document.getElementById('chooseTrackBtn');
  localFileName = document.getElementById('localFileName');
  playerErrorEl = document.getElementById('playerError');

  replaceTrackBtn = document.getElementById('replaceTrackBtn');

  playerPanel = document.getElementById('playerPanel');
  playerClose = document.getElementById('playerClose');
  playPauseBtn = document.getElementById('playPauseBtn');
  restartBtn = document.getElementById('restartBtn');
  volRange = document.getElementById('volRange');
  muteBtn = document.getElementById('muteBtn');
  fullscreenBtn = document.getElementById('fullscreenBtn');
  volumeControl = document.getElementById('volumeControl');
  seekRange = document.getElementById('seekRange');

  playerFileInputEl && playerFileInputEl.addEventListener('change', onPlayerFileSelected);
  demoTrackBtn && demoTrackBtn.addEventListener('click', (e)=>{ e.stopPropagation(); e.currentTarget.blur && e.currentTarget.blur(); switchActiveSource('bundled'); });
  chooseTrackBtn && chooseTrackBtn.addEventListener('click', (e)=>{ e.stopPropagation(); e.currentTarget.blur && e.currentTarget.blur(); if (customSong){ switchActiveSource('local'); } else if (playerFileInputEl){ playerFileInputEl.value = ''; playerFileInputEl.click(); } });

  replaceTrackBtn && replaceTrackBtn.addEventListener('click', (e)=>{ e.stopPropagation(); e.currentTarget.blur && e.currentTarget.blur(); if (playerFileInputEl){ playerFileInputEl.value = ''; playerFileInputEl.click(); } });

  playerClose && playerClose.addEventListener('click', (e)=>{ e.stopPropagation(); hidePlayer(); });
  playerPanel && playerPanel.addEventListener('click', (e)=>{ e.stopPropagation(); });
  playPauseBtn && playPauseBtn.addEventListener('click', (e)=>{ e.stopPropagation(); if (typeof hideInfoModal === 'function') hideInfoModal(); togglePlayPause(); });
  restartBtn && restartBtn.addEventListener('click', (e)=>{ e.stopPropagation(); restartSong(); });

  volRange && volRange.addEventListener('input', (e)=>{ e.stopPropagation(); const v = parseFloat(e.target.value); changeVolume(v); if (v > 0 && isMuted){ isMuted = false; updateMuteUI(); } if (v === 0 && !isMuted){ isMuted = true; updateMuteUI(); } });
  muteBtn && muteBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleMute(); showVolumeSliderTemporary(); });
  fullscreenBtn && fullscreenBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFullscreen(); });

  infoModalOverlayEl = document.getElementById('infoModalOverlay');
  infoModalEl = document.getElementById('infoModal');
  infoModalCloseBtn = document.getElementById('infoModalClose');
  infoBtn = document.getElementById('infoBtn');

  if (infoBtn) infoBtn.addEventListener('click', (e)=>{ e.stopPropagation(); showInfoModal(); });
  if (infoModalOverlayEl){
    infoModalOverlayEl.addEventListener('click', (e)=>{ e.stopPropagation(); hideInfoModal(); });
    if (infoModalEl) infoModalEl.addEventListener('click', (e)=>{ e.stopPropagation(); });
  }
  if (infoModalCloseBtn) infoModalCloseBtn.addEventListener('click', (e)=>{ e.stopPropagation(); hideInfoModal(); });

  if (seekRange){
    seekRange.addEventListener('pointerdown', (e)=>{ e.stopPropagation(); isSeeking = true; });
    seekRange.addEventListener('input', (e)=>{
      e.stopPropagation();
      const v = parseFloat(e.target.value);
      if (isSeeking){
        previewSeekTime(v);
      } else {
        seekTo(v);
      }
    });
    seekRange.addEventListener('pointerup', (e)=>{ e.stopPropagation(); if (isSeeking){ isSeeking = false; seekTo(parseFloat(e.target.value)); } });
    window.addEventListener('pointerup', (e)=>{ if (isSeeking && !isDraggingLoopMarker){ isSeeking = false; if (seekRange) seekTo(parseFloat(seekRange.value)); } });
  }

  document.addEventListener('click', onDocumentClick);

  loopToggle = document.getElementById('loopToggle');
  loopStartMarker = document.getElementById('loopStartMarker');
  loopEndMarker = document.getElementById('loopEndMarker');
  seekContainer = document.querySelector('.seek-container');

  if (loopToggle) loopToggle.addEventListener('click', (e)=>{ e.stopPropagation(); toggleLoop(); });

  document.addEventListener('fullscreenchange', ()=>{
    if (!fullscreenBtn) return;
    const isFS = !!document.fullscreenElement;
    fullscreenBtn.setAttribute('aria-pressed', isFS ? 'true' : 'false');
    updateFullscreenIcon(isFS);
    updateFullscreenLabel(isFS);
  });

  updateMuteUI();
  updatePlayUI();
  updateFullscreenIcon(!!document.fullscreenElement);
  updateFullscreenLabel(!!document.fullscreenElement);
  if (loopToggle) updateLoopIcon(!!loopEnabled);
  if (restartBtn) restartBtn.innerHTML = restartIconSVG();

  volWrapEl = document.querySelector('.volume-slider-wrap');
  if (volWrapEl){
    volWrapEl.addEventListener('pointerdown', (ev)=>{ ev.stopPropagation(); showVolumeSliderTemporary(); });
    volWrapEl.addEventListener('pointerup', (ev)=>{ ev.stopPropagation(); scheduleHideSlider(1200); });
  }

  const onMarkerPointerDown = (e)=>{
    // only allow dragging when loop mode is enabled
    if (!loopEnabled) return;
    e.stopPropagation(); e.preventDefault();
    draggingLoopMarker = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.marker;
    isDraggingLoopMarker = true;
    // pause seek syncing while dragging a loop marker
    isSeeking = true;
    activePointerId = e.pointerId;
    try{ e.currentTarget.setPointerCapture(activePointerId); }catch(_){ }
  };
  if (loopStartMarker) loopStartMarker.addEventListener('pointerdown', onMarkerPointerDown);
  if (loopEndMarker) loopEndMarker.addEventListener('pointerdown', onMarkerPointerDown);

  // Loop region element: allow dragging the whole block
  loopRegionEl = document.getElementById('loopRegion');
  if (loopRegionEl){
    loopRegionEl.addEventListener('pointerdown', (e)=>{
      if (!loopEnabled) return;
      e.stopPropagation(); e.preventDefault();
      draggingLoopMarker = 'region';
      isDraggingLoopMarker = true;
      isSeeking = true;
      activePointerId = e.pointerId;
      loopRegionDragStartX = e.clientX;
      loopRegionDragStartS = loopStart;
      loopRegionDragStartE = loopEnd;
      loopRegionEl.classList.add('dragging');
      try{ loopRegionEl.setPointerCapture(activePointerId); }catch(_){ }
    });
  }

  window.addEventListener('pointermove', (e)=>{
    if (!isDraggingLoopMarker || !draggingLoopMarker || !seekContainer) return;
    const rect = seekContainer.getBoundingClientRect();
    const d = (song && typeof song.duration === 'function') ? song.duration() : null;
    if (!d || isNaN(d)) return;

    if (draggingLoopMarker === 'region'){
      // drag the whole loop block, preserving duration
      const duration = loopRegionDragStartE - loopRegionDragStartS;
      const deltaX = e.clientX - loopRegionDragStartX;
      const deltaFrac = deltaX / rect.width;
      const deltaTime = deltaFrac * d;
      let newStart = loopRegionDragStartS + deltaTime;
      let newEnd = loopRegionDragStartE + deltaTime;
      // clamp within track bounds
      if (newStart < 0){ newStart = 0; newEnd = duration; }
      if (newEnd > d){ newEnd = d; newStart = d - duration; }
      loopStart = Math.max(0, newStart);
      loopEnd = Math.min(d, newEnd);
    } else {
      let frac = (e.clientX - rect.left) / rect.width;
      frac = Math.max(0, Math.min(1, frac));
      const t = frac * d;
      if (draggingLoopMarker === 'start'){
        loopStart = Math.min(t, loopEnd || d);
        if (loopStart < 0) loopStart = 0;
      } else {
        loopEnd = Math.max(t, loopStart || 0);
        if (loopEnd > d) loopEnd = d;
      }
    }
    syncLoopUI();
  });

  window.addEventListener('pointerup', (e)=>{
    if (!isDraggingLoopMarker) return;
    try{
      if (draggingLoopMarker === 'start' && loopStartMarker) loopStartMarker.releasePointerCapture(activePointerId);
      if (draggingLoopMarker === 'end' && loopEndMarker) loopEndMarker.releasePointerCapture(activePointerId);
      if (draggingLoopMarker === 'region' && loopRegionEl){ loopRegionEl.releasePointerCapture(activePointerId); loopRegionEl.classList.remove('dragging'); }
    }catch(_){ }
    isDraggingLoopMarker = false;
    isSeeking = false;
    draggingLoopMarker = null;
    activePointerId = null;
    loopRegionDragStartX = null;
    loopRegionDragStartS = null;
    loopRegionDragStartE = null;
    // After finishing a loop drag, ensure the current position lies inside
    // the newly-edited loop. If it is outside, move to `loopStart` once.
    try{ enforceLoopContainment(); }catch(_){ }
  });

  strokeCap(ROUND);

  // load bundled audio; allow custom file as fallback
  loadSound('assets/audio/song.mp3', (s) => {
    defaultSong = s;
    // do not auto-loop or auto-play; make bundled track available as default source
    if (!song){
      song = defaultSong;
      // route the loaded song through our gain nodes and point analyzers
      connectSongToGains(song);
      applyCurrentVolumeToSong();
      try{ loopEnabled = false; resetLoopRangeForTrack(song.duration()); }catch(_){ }
      updateSourceOptions();
    }
    audioReady = true;
  }, (err) => {
    console.error('Audio load failed', err);
    defaultLoadFailed = true;
    if (playerErrorEl){ playerErrorEl.textContent = 'Failed to load bundled audio. You can choose a local file.'; playerErrorEl.classList.remove('hidden'); }
  });

  // precompute loose particle positions for spread effect
  buildParticles();

  updateRadii();

  // revoke any created object URLs on page unload to be defensive
  window.addEventListener('beforeunload', ()=>{
    // attempt a safe cleanup of any custom audio resources and object URLs
    try{ cleanupCustomAudioResources(true); }catch(e){}
  });

  // prevent spacebar page scroll and wire robust toggling
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space'){
      // always prevent default page scroll for space
      e.preventDefault();
      // ignore auto-repeated keydown events while the key is held
      if (e.repeat) return;
      handleSpaceToggle();
    }
  }, {passive:false});
  // ensure the player is visible and open on initial load
  showPlayer();
  // show introductory info modal on initial load
  try{ showInfoModal(); }catch(_){ }
  // align UI anchors and size the seek track to match the compact time display
  try{ alignPlayingWithPlayButton(); updateSeekWidth(); watchTimeDisplay(); }catch(_){ }
}

// Safely dispose a p5.SoundFile.
function safeDisposeSoundFile(sf){
  if (!sf) return;
  try{ if (sf.isPlaying && sf.isPlaying()) sf.stop(); }catch(e){}
  try{ if (typeof sf.disconnect === 'function') sf.disconnect(); }catch(e){}
  try{ if (typeof sf.dispose === 'function') sf.dispose(); }catch(e){}
}

// Cleanup custom audio and revoke object URL.
function cleanupCustomAudioResources(revokeURL = true){
  if (customSong){
    try{ safeDisposeSoundFile(customSong); }catch(e){}
    customSong = null;
  }
  if (revokeURL && selectedFileURL){
    try{ URL.revokeObjectURL(selectedFileURL); }catch(e){}
    selectedFileURL = null;
    selectedFile = null;
  }
  try{ updateSourceOptions(); }catch(e){}
  // reset loop state when custom audio resources are removed
  loopEnabled = false;
  loopStart = 0;
  loopEnd = null;
  // clear any pending deferred seek when audio resources change
  deferredSeek = null;
  try{ syncLoopUI(); }catch(_){ }
}

// Route audio through separate gains for playback and analysis.
function connectSongToGains(s){
  if (!s) return;
  try{ s.disconnect(); }catch(_){ }
  try{
    if (masterOutputGain && typeof s.connect === 'function') s.connect(masterOutputGain);
    if (analysisInputGain && typeof s.connect === 'function') s.connect(analysisInputGain);
  }catch(_){ }
  // point analyzers to the analysis input so visuals ignore master volume
  try{ if (fft && analysisInputGain) fft.setInput(analysisInputGain); }catch(_){ }
  try{ if (amp && analysisInputGain) amp.setInput(analysisInputGain); }catch(_){ }
}

// Update player source buttons and displayed filename.
function updateSourceOptions(){
  const demoBtn = document.getElementById('demoTrackBtn');
  const chooseBtn = document.getElementById('chooseTrackBtn');
  const replaceBtn = document.getElementById('replaceTrackBtn');
  const ln = document.getElementById('localFileName');
  if (!demoBtn || !chooseBtn || !ln) return;
  // disable demo when bundled audio unavailable
  demoBtn.disabled = !!defaultLoadFailed || !defaultSong;
  // Compose a friendly "Playing:" label based on the currently active source (`song`)
  const activeDemo = (song === defaultSong);
  const activeLocal = (song === customSong);
  if (activeDemo){
    ln.textContent = 'Playing: Demo Track';
    ln.title = 'Demo Track';
  } else if (activeLocal && selectedFile && selectedFile.name){
    const display = friendlyTrackLabel(selectedFile.name);
    ln.textContent = 'Playing: ' + display;
    ln.title = selectedFile.name;
  } else {
    // No active known source — show a neutral placeholder
    ln.textContent = 'Playing: --';
    ln.title = '';
  }
  // reflect active selection in segmented control
  chooseBtn.classList.toggle('active', activeLocal);
  chooseBtn.setAttribute('aria-pressed', activeLocal ? 'true' : 'false');
  demoBtn.classList.toggle('active', activeDemo);
  demoBtn.setAttribute('aria-pressed', activeDemo ? 'true' : 'false');
  // show/hide replace affordance
  if (replaceBtn){ if (customSong) replaceBtn.classList.remove('hidden'); else replaceBtn.classList.add('hidden'); }
  // ensure timeline width and left anchors update when source text or layout changes
  try{ updateSeekWidth(); alignPlayingWithPlayButton(); }catch(_){ }
}

// Handle player file selection (loads custom file but does not autoplay)
function onPlayerFileSelected(e){
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  selectedFile = f;
  if (selectedFileURL) try{ URL.revokeObjectURL(selectedFileURL); }catch(_){ }
  selectedFileURL = URL.createObjectURL(f);
  // dispose previous customSong if present and not active
  if (customSong && customSong !== song){ try{ safeDisposeSoundFile(customSong); }catch(_){ } customSong = null; }
  if (playerErrorEl) playerErrorEl.classList.add('hidden');
  // preload the custom file so duration and analysis are available
  loadSound(selectedFileURL, (s) => {
    // assign the loaded file as the custom song and make it the active source
    customSong = s;
    audioReady = true;
    // stop any currently playing active song so the newly selected file becomes the active, paused source
    try{ if (song && song.isPlaying && song.isPlaying()) song.stop(); }catch(_){ }
    song = customSong;
    // reconnect the newly-loaded song through our routing so analysis
    // reads the raw signal while master output controls loudness
    connectSongToGains(song);
    applyCurrentVolumeToSong();
    // Reset loop mode when a new track is loaded so each new track
    // starts with loop disabled by default and a sensible range.
    try{
      const d = song.duration && song.duration();
      loopEnabled = false;
      resetLoopRangeForTrack(d);
    }catch(_){ }
    updateSourceOptions();
    // reflect the change in the UI immediately (remain paused)
    syncPlaybackUIState();
    // ensure loop icon and local display updated
    updateLoopIcon(loopEnabled);
    try{ enforceLoopContainment(); }catch(_){ }
  }, (err) => {
    console.error('Failed to load custom file', err);
    if (playerErrorEl){ playerErrorEl.textContent = 'Failed to load selected file.'; playerErrorEl.classList.remove('hidden'); }
    if (selectedFileURL){ try{ URL.revokeObjectURL(selectedFileURL); }catch(_){ } selectedFileURL = null; selectedFile = null; }
    updateSourceOptions();
  });
}

// Switch active source (bundled/local); stays paused.
function switchActiveSource(src){
  if (src === 'local'){
    if (!customSong){ if (playerErrorEl){ playerErrorEl.textContent = 'No local file selected.'; playerErrorEl.classList.remove('hidden'); } updateSourceOptions(); return; }
    try{ if (song && song.isPlaying && song.isPlaying()) song.stop(); }catch(_){ }
    song = customSong;
    connectSongToGains(song);
    applyCurrentVolumeToSong();
    try{ loopEnabled = false; resetLoopRangeForTrack(song.duration()); }catch(_){ }
  } else {
    if (!defaultSong){ if (playerErrorEl){ playerErrorEl.textContent = 'Bundled track unavailable.'; playerErrorEl.classList.remove('hidden'); } updateSourceOptions(); return; }
    try{ if (song && song.isPlaying && song.isPlaying()) song.stop(); }catch(_){ }
    song = defaultSong;
    connectSongToGains(song);
    applyCurrentVolumeToSong();
    try{ loopEnabled = false; resetLoopRangeForTrack(song.duration()); }catch(_){ }
  }
  // remain paused by default after switching; user must press Play
  syncPlaybackUIState();
  updateSourceOptions();
  // ensure loop and loop icon updated
  updateLoopIcon(loopEnabled);
  try{ enforceLoopContainment(); }catch(_){ }
}
function applyCurrentVolumeToSong(){
  if (volRange) volRange.value = currentVolume;
  // Apply volume to master output gain or per-file fallback.
  if (masterOutputGain && typeof masterOutputGain.amp === 'function'){
    try{
      if (isMuted){ masterOutputGain.amp(0); } else { masterOutputGain.amp(currentVolume); }
    }catch(e){}
  } else if (song && typeof song.setVolume === 'function'){
    try{ if (isMuted) song.setVolume(0); else song.setVolume(currentVolume); }catch(e){}
  }
}

// Format seconds into MM:SS or HH:MM:SS
function formatTime(sec){
  if (!sec || isNaN(sec) || sec < 0) return '00:00';
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = m < 10 ? '0'+m : ''+m;
  const ss = s < 10 ? '0'+s : ''+s;
  if (h > 0){
    const hh = h < 10 ? '0'+h : ''+h;
    return hh+':'+mm+':'+ss;
  }
  return mm+':'+ss;
}

function updateTimeDisplay(){
  const el = document.getElementById('timeDisplay');
  if (!el || !song || typeof song.currentTime !== 'function' || typeof song.duration !== 'function') return;
  // Prefer deferred/pending seek positions for UI display.
  let c;
  try{
    const isPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
    // If a pending start exists (we just invoked play from a deferred
    // seek), keep the UI tied to that pending start until the audio's
    // reported currentTime advances to the requested point or a short
    // timeout elapses to avoid flicker.
    if (pendingStartTime !== null){
      c = pendingStartTime;
      try{
        const cur = song.currentTime();
        if (!isNaN(cur) && song.isPlaying && song.isPlaying() && cur >= pendingStartTime - 0.05){
          // audio has caught up — stop pinning UI
          pendingStartTime = null;
          pendingStartSince = null;
          c = cur;
        } else if (pendingStartSince && (millis() - pendingStartSince) > 500){
          // safety: clear pending after a short timeout to avoid stuck UI
          pendingStartTime = null;
          pendingStartSince = null;
        }
      }catch(_){ }
    } else if (deferredSeek !== null && !isPlaying){
      c = deferredSeek;
    } else {
      c = song.currentTime();
    }
  }catch(_){ c = song.currentTime(); }
  const d = song.duration();
  if (d && !isNaN(c)){
    el.textContent = formatTime(c) + ' / ' + formatTime(d);
  } else {
    el.textContent = formatTime(c) + ' / --:--';
  }
}

// Preview a seek position (used while dragging the seek slider)
function previewSeekTime(norm){
  const el = document.getElementById('timeDisplay');
  if (!el || !song || typeof song.duration !== 'function') return;
  const d = song.duration();
  if (!d || isNaN(d)){
    el.textContent = '00:00 / --:--';
    return;
  }
  const t = constrain(norm, 0, 1) * d;
  el.textContent = formatTime(t) + ' / ' + formatTime(d);
  // Set deferred seek when paused so Play resumes from selected position.
  const isPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
  if (!isPlaying){
    deferredSeek = t;
    if (seekRange) seekRange.value = constrain(norm, 0, 1);
  }
}

// --- Loop helpers -------------------------------------------------------
function resetLoopRangeForTrack(d){
  if (!d || isNaN(d) || d <= 0){
    loopStart = 0;
    loopEnd = null;
  } else {
    loopStart = 0;
    loopEnd = d;
  }
  syncLoopUI();
}

function syncLoopUI(){
  if (!seekContainer || !loopStartMarker || !loopEndMarker) return;
  const d = (song && typeof song.duration === 'function') ? song.duration() : null;
  const loopRegion = document.getElementById('loopRegion');
  if (!d || isNaN(d) || !loopEnd || !loopEnabled){
    loopStartMarker.style.display = 'none';
    loopEndMarker.style.display = 'none';
    if (loopRegion) loopRegion.style.display = 'none';
  } else {
    loopStartMarker.style.display = 'block';
    loopEndMarker.style.display = 'block';
    if (loopRegion) loopRegion.style.display = 'block';
    const sPct = (loopStart / d) * 100;
    const ePct = (loopEnd / d) * 100;
    loopStartMarker.style.left = sPct + '%';
    loopEndMarker.style.left = ePct + '%';
    if (loopRegion){ loopRegion.style.left = sPct + '%'; loopRegion.style.width = (ePct - sPct) + '%'; }
  }
  if (loopToggle){
    // use icon-based loop control
    updateLoopIcon(loopEnabled);
  }
}

// --- UI icons/helpers -------------------------------------------------
function playIconSVG(){
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
}
function pauseIconSVG(){
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect></svg>';
}
function volumeIconSVG(){
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="currentColor"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/></svg>';
}
function volumeLowIconSVG(){
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="currentColor"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/></svg>';
}
function mutedIconSVG(){
  // Balanced speaker + X (keeps the same base speaker path as unmuted)
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">'
    + '<path d="M3 9v6h4l5 5V4L7 9H3z" fill="currentColor"/>'
    // repositioned X so it is visually centered relative to the speaker tip
    + '<line x1="15" y1="9" x2="19" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    + '<line x1="19" y1="9" x2="15" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  + '</svg>';
}
function fullscreenEnterSVG(){
  // outward-facing rounded corner brackets (enter fullscreen)
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3H3v3"/><path d="M18 3h3v3"/><path d="M6 21H3v-3"/><path d="M18 21h3v-3"/></g></svg>';
}
function fullscreenExitSVG(){
  // inward-facing rounded corner brackets (exit fullscreen)
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h3V3"/><path d="M21 6h-3V3"/><path d="M3 18h3v3"/><path d="M21 18h-3v3"/></g></svg>';
}

function loopIconSVG(active){
  // single repeat icon geometry for both states; color/state is indicated by the button styling only
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">'
    + '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zM17 17H7v-3l-4 4 4 4v-3h12v-6h-2z" fill="currentColor"/>'
  + '</svg>';
}

function restartIconSVG(){
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor"/></svg>';
}

// Show the horizontal volume slider temporarily (used when mute/volume button clicked)
function showVolumeSliderTemporary(){
  if (!volumeControl) return;
  volumeControl.classList.add('show-slider');
  if (sliderHideTimeoutId) clearTimeout(sliderHideTimeoutId);
  sliderHideTimeoutId = setTimeout(()=>{ volumeControl.classList.remove('show-slider'); sliderHideTimeoutId = null; }, 3500);
}

function scheduleHideSlider(delay=900){ if (sliderHideTimeoutId) clearTimeout(sliderHideTimeoutId); sliderHideTimeoutId = setTimeout(()=>{ if (volumeControl) volumeControl.classList.remove('show-slider'); sliderHideTimeoutId = null; }, delay); }

function updateMuteUI(){
  if (!muteBtn) return;
  let icon;
  if (isMuted || currentVolume === 0) icon = mutedIconSVG();
  else if (currentVolume < 0.5) icon = volumeLowIconSVG();
  else icon = volumeIconSVG();
  muteBtn.innerHTML = icon;
  muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
  // Accessible label and title reflect current toggle state
  try{ muteBtn.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute'); muteBtn.title = isMuted ? 'Unmute' : 'Mute'; }catch(_){ }
}

// Derive display-friendly track name.
function friendlyTrackLabel(filename){
  if (!filename || typeof filename !== 'string') return '';
  // strip any path segments just in case
  const base = filename.split('/').pop().split('\\').pop();
  // remove only the last extension (e.g. name.mp3 -> name)
  const idx = base.lastIndexOf('.');
  if (idx > 0) return base.substring(0, idx);
  return base;
}

function toggleMute(){
  isMuted = !isMuted;
  if (isMuted){
    previousVolume = currentVolume > 0 ? currentVolume : previousVolume;
    try{
      if (masterOutputGain && typeof masterOutputGain.amp === 'function') masterOutputGain.amp(0);
      else if (song && typeof song.setVolume === 'function') song.setVolume(0);
    }catch(_){ }
  } else {
    currentVolume = previousVolume || currentVolume || 1;
    try{
      if (masterOutputGain && typeof masterOutputGain.amp === 'function') masterOutputGain.amp(currentVolume);
      else if (song && typeof song.setVolume === 'function') song.setVolume(currentVolume);
    }catch(_){ }
    if (volRange) volRange.value = currentVolume;
  }
  updateMuteUI();
}

async function toggleFullscreen(){
  try{
    if (!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }catch(err){ console.warn('Fullscreen toggle failed', err); }
}

function updatePlayUI(){
  if (!playPauseBtn) return;
  const isPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
  playPauseBtn.innerHTML = isPlaying ? pauseIconSVG() : playIconSVG();
  playPauseBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
  playPauseBtn.title = isPlaying ? 'Pause' : 'Play';
  // Accessible label reflects current action
  try{ playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play'); }catch(_){ }
}

function updateFullscreenIcon(isFS){ if (!fullscreenBtn) return; fullscreenBtn.innerHTML = isFS ? fullscreenExitSVG() : fullscreenEnterSVG(); }

// update fullscreen ARIA label
function updateFullscreenLabel(isFS){
  if (!fullscreenBtn) return;
  try{
    const label = isFS ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenBtn.setAttribute('aria-label', label);
    fullscreenBtn.title = label;
  }catch(_){ }
}

// update loop icon to reflect active state
function updateLoopIcon(active){
  if (!loopToggle) return;
  const label = active ? 'Disable loop' : 'Enable loop';
  loopToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
  loopToggle.title = label;
  try{ loopToggle.setAttribute('aria-label', label); }catch(_){ }
  loopToggle.innerHTML = loopIconSVG(!!active);
}

function toggleLoop(){
  loopEnabled = !loopEnabled;
  // initialize sensible defaults when enabling
  if (loopEnabled && (!loopEnd || isNaN(loopEnd))){
    const d = (song && typeof song.duration === 'function') ? song.duration() : null;
    if (d && !isNaN(d)){
      loopStart = 0;
      loopEnd = d;
    }
  }
  syncLoopUI();
  updateLoopIcon(loopEnabled);
  // If loop was enabled, ensure the current position is inside it.
  if (loopEnabled) try{ enforceLoopContainment(); }catch(_){ }
}

function applyLoopIfNeeded(){
  // Handle automatic loop jumps when reaching loop end; skip while dragging.
  if (isDraggingLoopMarker) return;
  if (!loopEnabled || !song || typeof song.currentTime !== 'function' || !loopEnd) return;
  const c = song.currentTime();
  if (isNaN(c)) return;
  // small epsilon to avoid precision issues
  if (c >= loopEnd - 0.04){
    try{
      if (typeof song.jump === 'function'){
        song.jump(loopStart);
      } else {
        song.stop();
        if (typeof song.play === 'function') song.play();
      }
    }catch(e){ console.warn('Loop jump failed', e); }
    syncPlaybackUIState();
  }
}

// Ensure playback position is within loop; reposition once if outside.
function enforceLoopContainment(){
  if (!loopEnabled || !song || typeof song.currentTime !== 'function' || !loopEnd) return;
  try{
    const c = song.currentTime();
    if (isNaN(c)) return;
    if (c < loopStart || c > loopEnd){
      const wasPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
      if (!wasPlaying){
        // Keep paused: update deferred seek and UI immediately
        deferredSeek = loopStart;
        syncPlaybackUIState();
      } else {
        // While playing, do a single minimal reposition to loopStart
        try{
          if (typeof song.jump === 'function'){
            song.jump(loopStart);
          } else if (typeof song.play === 'function'){
            // Fallback: attempt a play cue at the requested time
            song.stop();
            // Use unity amplitude here; masterOutputGain controls audible level
            song.play(0, 1, 1, loopStart);
          }
        }catch(e){ console.warn('Loop reposition failed', e); }
        syncPlaybackUIState();
      }
    }
  }catch(_){ }
}

// Start flows removed: playback starts only from the player Play button.

// Player show/hide and controls ------------------------------------------
function onDocumentClick(e){
  if (!playerPanel) return;
  const playerOpen = playerPanel && !playerPanel.classList.contains('hidden');
  if (playerOpen){
    if (!e.target.closest || !e.target.closest('#playerPanel')){
      hidePlayer();
    }
    return;
  }
  // Do not open player when clicking interactive UI elements
  if (e.target.closest && (
    e.target.closest('.player-controls') ||
    e.target.closest('.range-wrap') ||
    e.target.closest('button') ||
    e.target.closest('input') ||
    e.target.closest('label') ||
    e.target.closest('.source-controls')
  )) return;
  // otherwise open player
  showPlayer();
}

function showPlayer(){
  if (!playerPanel) return;
  playerPanel.classList.remove('hidden');
  playerPanel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('player-open');
  syncPlaybackUIState();
}

function hidePlayer(){
  if (!playerPanel) return;
  playerPanel.classList.add('hidden');
  playerPanel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('player-open');
  syncPlaybackUIState();
}
// Info modal show/hide helpers
function showInfoModal(){
  if (!infoModalOverlayEl) infoModalOverlayEl = document.getElementById('infoModalOverlay');
  if (!infoModalEl) infoModalEl = document.getElementById('infoModal');
  if (!infoModalOverlayEl) return;
  infoModalOverlayEl.classList.remove('hidden');
  infoModalOverlayEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('info-open');
  // Intentionally avoid auto-focusing the close button on initial load
}
function hideInfoModal(){
  const overlay = infoModalOverlayEl || document.getElementById('infoModalOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('info-open');
}
function syncPlaybackUIState(){
  if (!playPauseBtn) return;
  const isPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
  // play/pause icon
  updatePlayUI();
  // body class for cursor behavior (cursor hidden only when playing and player closed)
  if (isPlaying) document.body.classList.add('playing'); else document.body.classList.remove('playing');
  // volume
  if (volRange) volRange.value = currentVolume;
  updateMuteUI();
  // seek: only update when user is not actively dragging the slider
  if (!isSeeking && seekRange && song && typeof song.duration === 'function' && typeof song.currentTime === 'function'){
    const d = song.duration();
    // Prioritize any pending start time (we're transitioning from a
    // paused seek into playback) so the handle doesn't briefly snap
    // back to an old paused position.
    if (pendingStartTime !== null && d && !isNaN(pendingStartTime)){
      seekRange.value = constrain(pendingStartTime / d, 0, 1);
    } else if (deferredSeek !== null && !isPlaying && d && !isNaN(deferredSeek)){
      seekRange.value = constrain(deferredSeek / d, 0, 1);
    } else {
      const c = song.currentTime();
      if (d && !isNaN(c)){
        seekRange.value = constrain(c / d, 0, 1);
      }
    }
  }
  // update compact time display unless user is previewing via drag
  if (!isSeeking) updateTimeDisplay();
  // keep loop UI in sync
  try{ syncLoopUI(); }catch(_){ }
}

async function togglePlayPause(){
  if (!song){
    // no active song yet
    if (defaultSong) song = defaultSong; else return;
  }
  if (song.isPlaying && song.isPlaying()){
    try{ song.pause(); }catch(_){ }
    syncPlaybackUIState();
    return;
  }
  // ensure audio context is resumed by a user gesture
  try{ await userStartAudio(); }catch(_){ }
  // If the user previously sought while paused, start playback directly
  // from that stored position in one coherent step to avoid racey
  // jump(...)+play() sequences which can reset the intended position.
  if (deferredSeek !== null){
    // If loop is enabled, ensure the deferred seek lies inside the loop
    try{
      if (loopEnabled && loopEnd && typeof loopStart === 'number'){
        if (deferredSeek < loopStart || deferredSeek > loopEnd - 0.04){
          deferredSeek = loopStart;
        }
      }
    }catch(_){ }

    try{
      // We intentionally do not pass user audible volume into the
      // SoundFile play call. The masterOutputGain controls loudness.
      // Mark the requested start time as pending so the UI doesn't
      // briefly read back the old paused currentTime.
      pendingStartTime = deferredSeek;
      pendingStartSince = millis();
      // Clear any old paused playback state so the upcoming play/loop
      // call cannot resume from a stale position. Stopping the sound
      // ensures the new cueStart will be honored reliably.
      if (song && typeof song.stop === 'function'){
        try{ song.stop(); }catch(_){ }
      }
      if (loopEnabled && typeof song.loop === 'function'){
        song.loop(0, 1, 1, deferredSeek);
      } else if (typeof song.play === 'function'){
        song.play(0, 1, 1, deferredSeek);
      } else if (typeof song.jump === 'function'){
        // Fallback: position then resume playback
        try{ song.jump(deferredSeek); }catch(_){ }
        if (typeof song.play === 'function') song.play();
        else if (typeof song.loop === 'function') song.loop();
      }
    }catch(e){ console.warn('Applying deferred seek failed', e); }

    // clear the paused deferred seek (we now have a pending start)
    deferredSeek = null;
    syncPlaybackUIState();
    return;
  }

  // No deferred seek: resume normal playback
  try{ if (typeof song.play === 'function') song.play(); else if (typeof song.loop === 'function') song.loop(); }catch(e){ console.warn('Play failed', e); }
  syncPlaybackUIState();
}

function restartSong(){
  if (!song) return;
  const wasPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
  const target = (loopEnabled && typeof loopStart === 'number') ? loopStart : 0;
  // If paused: treat Restart as a position reset (do not play).
  if (!wasPlaying){
    deferredSeek = target;
    // clear any pending play-from-deferred marker
    pendingStartTime = null;
    pendingStartSince = null;
    // update the seek UI immediately
    try{
      const d = song.duration && song.duration();
      if (d && !isNaN(d) && seekRange) seekRange.value = constrain(deferredSeek / d, 0, 1);
    }catch(_){ }
    updateTimeDisplay();
    syncPlaybackUIState();
    return;
  }
  // If playing: reposition immediately and keep playing.
  try{
    if (typeof song.jump === 'function'){
      song.jump(target);
    } else {
      // fallback: use play cue at requested time with unity amplitude
      song.stop();
      if (typeof song.play === 'function'){
        if (loopEnabled && typeof song.loop === 'function') song.loop(0, 1, 1, target);
        else song.play(0, 1, 1, target);
      }
    }
  }catch(e){
    try{ song.stop(); if (typeof song.play === 'function') song.play(); }catch(_e){}
  }
  syncPlaybackUIState();
}

function changeVolume(v){
  currentVolume = parseFloat(v);
  if (!isNaN(currentVolume) && currentVolume > 0) previousVolume = currentVolume;
  // update the master output gain; this leaves analysis input untouched
  if (masterOutputGain && typeof masterOutputGain.amp === 'function'){
    try{ if (isMuted) masterOutputGain.amp(0); else masterOutputGain.amp(currentVolume); }catch(e){}
  } else if (song && typeof song.setVolume === 'function'){
    try{ if (isMuted) song.setVolume(0); else song.setVolume(currentVolume); }catch(e){}
  }
}

function seekTo(norm){
  if (!song) return;
  // preserve current play state across seeks
  const wasPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
  if (typeof song.duration === 'function'){
    const d = song.duration();
    if (d && !isNaN(norm)){
      const t = constrain(norm, 0, 1) * d;
      // If the track was paused, defer applying the position to the audio
      // engine until the user resumes playback. This avoids starting/stopping
      // audio while paused and keeps the UI responsive.
      if (!wasPlaying){
        deferredSeek = t;
        // reflect the requested seek in the UI immediately
        if (seekRange) seekRange.value = constrain(norm, 0, 1);
        updateTimeDisplay();
      } else {
        // currently playing: apply immediately and preserve play state
        deferredSeek = null;
        if (typeof song.jump === 'function'){
          try{
            song.jump(t);
          }catch(e){
            try{ song.stop(); if (wasPlaying) song.play(); else song.pause && song.pause(); }catch(_e){}
          }
        } else {
          // fallback: try to reposition using play() with cue start
          try{
            song.stop();
            // Use unity amplitude here; audible level is handled via masterOutputGain
            if (wasPlaying){ song.play(0, 1, 1, t); }
            else { song.play(0, 1, 1, t); if (song.pause) song.pause(); }
          }catch(_e){}
        }
      }
    }
  }
  syncPlaybackUIState();
}

function draw(){
  // soft semi-transparent background for subtle trails
  // draw fade with intended RGB-like color even while in HSB mode
  push();
  // draw full-canvas rect centered; switch to RGB color mode temporarily
  colorMode(RGB, 255);
  noStroke();
  fill(26, 31, 24, 200);
  rectMode(CORNER);
  rect(0, 0, width, height);
  pop();
  // restore HSB for the rest of the sketch
  colorMode(HSB, 360, 100, 100, 255);

  if (!audioReady){
    // idle subtle animation while loading
    push();
    translate(width/2, height/2);
    noStroke();
    fill(200, 10, 20, 30);
    ellipse(0,0, radBase*2.6, radBase*2.6);
    pop();
    return;
  }

  fft.analyze();
  const waveform = fft.waveform();
  peak.update(fft);
  const level = amp.getLevel();

  // update player seek UI occasionally
  if (seekRange && song && typeof song.duration === 'function' && typeof song.currentTime === 'function'){
    if (frameCount % 4 === 0){
      const d = song.duration();
      const c = song.currentTime();
      // Prefer any pending start time (when transitioning from paused
      // deferred seek into playback) or a deferred paused seek. Only
      // fall back to the actual audio position when appropriate.
      if (!isSeeking && d){
        const isPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
        if (pendingStartTime !== null && !isNaN(pendingStartTime)){
          seekRange.value = constrain(pendingStartTime / d, 0, 1);
        } else if (deferredSeek !== null && !isPlaying && !isNaN(deferredSeek)){
          seekRange.value = constrain(deferredSeek / d, 0, 1);
        } else if (!isNaN(c)){
          seekRange.value = constrain(c / d, 0, 1);
        }
      }
      // update textual time display periodically when not actively dragging
      if (!isSeeking) updateTimeDisplay();
      // apply custom loop region if enabled
      try{ applyLoopIfNeeded(); }catch(_){ }

      // Detect natural end-of-track when loop is OFF. When playback
      // reaches the track's natural end, reset position to start and
      // leave the player paused with UI updated (seek handle -> start,
      // time display -> 00:00, play UI -> paused). This preserves the
      // existing loop behavior (handled in applyLoopIfNeeded).
      try{
        if (!loopEnabled && d && !isNaN(c)){
          const isPlaying = song && typeof song.isPlaying === 'function' && song.isPlaying();
          const eps = 0.05;
          const reachedEndNow = (isPlaying && c >= d - eps) || (!isPlaying && lastWasPlaying && c >= d - eps);
          if (reachedEndNow){
            try{ if (song && typeof song.stop === 'function') song.stop(); }catch(_){ }
            // keep paused at start
            deferredSeek = 0;
            pendingStartTime = null;
            pendingStartSince = null;
            if (seekRange) seekRange.value = 0;
            try{ updateTimeDisplay(); }catch(_){ }
            syncPlaybackUIState();
          }
          lastWasPlaying = isPlaying;
        } else {
          lastWasPlaying = (song && typeof song.isPlaying === 'function' && song.isPlaying()) || false;
        }
      }catch(_){ }
    }
  }

  // center circle behavior: shrink on detected peak, otherwise relax back
  if (peak.isDetected){
    rad = max(radBase * 0.45, rad * 0.9);
  } else {
    rad = lerp(rad, radBase, 0.1);
  }

  push();
  translate(width/2, height/2);

  // outer reactive lines (sample-driven radial lines)
  strokeWeight(1);
  const len = waveform.length;
  const step = Math.max(1, Math.floor(len / 220));
  for (let i = 0; i < len; i += step){
    const sample = waveform[i];
    const angle = map(i, 0, len, 0, TWO_PI);
    const baseR = rOuter;
    const extra = sample * (rOuter * 0.7);
    const x1 = baseR * cos(angle);
    const y1 = baseR * sin(angle);
    const x2 = (baseR + extra) * cos(angle);
    const y2 = (baseR + extra) * sin(angle);
    const hue = (i / len) * 160 + (frameCount * 0.08);
    stroke(hue % 360, 70, 92, 160);
    line(x1, y1, x2, y2);
  }

  // central circle
  noFill();
  stroke(0, 0, 95, 220);
  strokeWeight(2);
  ellipse(0, 0, rad * 2, rad * 2);

  // spread effects (many small ellipses, loose/rotative)
  rotation += 0.006 + level * 0.03;
  push();
  // add a gentle global rotation so particles sweep around
  rotate(rotation);
  for (let i = 0; i < particles.length; i++){
    const p = particles[i];
    // compute a slowly changing angle per particle for looser diagonal motion
    const t = frameCount * (0.003 + p.speed);
    const ang = p.baseAngle + t * p.spin + p.offset * 0.4;
    const wobble = sin(t + p.phase) * p.wobble;
    const px = cos(ang) * (p.dist + wobble) + sin(ang * 1.13) * (p.dist * 0.06);
    const py = sin(ang) * (p.dist + wobble * 0.6) + cos(ang * 1.07) * (p.dist * 0.04);
    const s = p.size * (1 + level * 8);
    noStroke();
    const hue = (p.hue + rotation * 18) % 360;
    fill(hue, 58, 92, constrain(160 - s * 2, 30, 200));
    ellipse(px, py, s, s);
  }
  pop();

  pop();
}


function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  updateRadii();
  buildParticles();
  try{ alignPlayingWithPlayButton(); updateSeekWidth(); }catch(_){ }
}

function updateRadii(){
  rOuter = min(windowWidth, windowHeight) * 0.32;
}

// Build particle field sized to viewport for balanced performance
function buildParticles(){
  particles = [];
  const area = max(windowWidth, windowHeight) * min(windowWidth, windowHeight);
  // base density: about 1 particle per ~6000 px, clamped
  const count = floor(constrain(area / 6000, 80, 220));
  const maxD = max(windowWidth, windowHeight) * 0.7;
  const minD = min(windowWidth, windowHeight) * 0.12;
  for (let i = 0; i < count; i++){
    const baseAngle = random(TWO_PI);
    const dist = random(minD, maxD) * random(0.6, 1.0);
    particles.push({
      baseAngle,
      dist,
      phase: random(1000),
      size: random(1.6, 7.2),
      wobble: random(8, 32),
      speed: random(0.0005, 0.004) * (random() < 0.5 ? -1 : 1),
      spin: random(0.2, 1.1),
      offset: random(-0.4, 0.4),
      hue: random(20, 220)
    });
  }
}

// Keep the seek range visually aligned with the compact time display.
function updateSeekWidth(){
  const seek = document.getElementById('seekRange');
  const container = document.querySelector('.seek-container');
  const timeEl = document.getElementById('timeDisplay');
  if (!seek || !container || !timeEl) return;
  // Keep the seek input full-width of the seek container so its right edge
  // aligns with the time display (time display is absolutely positioned
  // to the container's right edge). Using 100% keeps layout responsive
  // and ensures loop markers (percent-based) align with the visible bar.
  seek.style.width = '100%';
}

// Align the Playing label and the timeline left anchor to the exact left column used by the Play button.
function alignPlayingWithPlayButton(){
  const play = document.getElementById('playPauseBtn');
  const localWrap = document.getElementById('localFileWrap');
  const timeline = document.querySelector('.player-timeline');
  const container = document.querySelector('.player-inner');
  if (!play || !localWrap || !container) return;
  const cRect = container.getBoundingClientRect();
  const pRect = play.getBoundingClientRect();
  // account for the container's internal left padding so we don't double-offset
  const cs = window.getComputedStyle(container);
  const paddingLeft = parseFloat(cs.paddingLeft) || 0;
  const rawOffset = pRect.left - cRect.left;
  const anchor = Math.max(0, Math.round(rawOffset - paddingLeft));
  // apply exact pixel alignment so the Playing label and timeline share the same left anchor
  localWrap.style.marginLeft = anchor + 'px';
  if (timeline) timeline.style.paddingLeft = anchor + 'px';
}

// Observe changes to the time text and adjust seek width when the text length (and width) change.
function watchTimeDisplay(){
  const timeEl = document.getElementById('timeDisplay');
  if (!timeEl) return;
  let last = timeEl.textContent;
  const mo = new MutationObserver(() => {
    if (timeEl.textContent !== last){
      last = timeEl.textContent;
      updateSeekWidth();
    }
  });
  mo.observe(timeEl, { characterData: true, childList: true, subtree: true });
}

// Handle space toggling robustly from page keydown listener
function handleSpaceToggle(){
  if (!audioReady || !song) return;
  // Toggle via the same player control (ensures audio context is resumed on first play)
  togglePlayPause();
}
