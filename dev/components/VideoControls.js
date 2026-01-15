/**
 * Video Controls Component
 * Play/pause, seek, and time display for demo videos.
 */

let video = null;
let processor = null;
let seekBar = null;
let timeDisplay = null;
let playPauseBtn = null;

/**
 * Initialize video controls.
 * @param {HTMLVideoElement} videoElement - The demo video element
 * @param {DevVideoProcessor} videoProcessor - The video processor instance
 */
export function initVideoControls(videoElement, videoProcessor) {
  video = videoElement;
  processor = videoProcessor;

  seekBar = document.getElementById('seek-bar');
  timeDisplay = document.getElementById('time-display');
  playPauseBtn = document.getElementById('play-pause-btn');

  if (!seekBar || !timeDisplay || !playPauseBtn) return;

  // Play/Pause button
  playPauseBtn.addEventListener('click', togglePlayPause);

  // Seek bar interaction
  seekBar.addEventListener('input', () => {
    if (video.duration) {
      video.currentTime = (seekBar.value / 100) * video.duration;
    }
  });

  // Update UI on video events
  video.addEventListener('timeupdate', updateTimeDisplay);
  video.addEventListener('loadedmetadata', resetControls);
  video.addEventListener('play', () => {
    playPauseBtn.textContent = 'Pause';
  });
  video.addEventListener('pause', () => {
    playPauseBtn.textContent = 'Play';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

/**
 * Toggle video play/pause.
 */
function togglePlayPause() {
  if (!video) return;

  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

/**
 * Update time display and seek bar.
 */
function updateTimeDisplay() {
  if (!video || !video.duration) return;

  const current = video.currentTime;
  const duration = video.duration;

  // Update seek bar
  seekBar.value = (current / duration) * 100;

  // Update time display
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
}

/**
 * Reset controls when new video loads.
 */
function resetControls() {
  seekBar.value = 0;
  updateTimeDisplay();
}

/**
 * Format seconds to mm:ss.
 */
function formatTime(seconds) {
  if (!isFinite(seconds)) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Handle keyboard shortcuts.
 */
function handleKeyboard(e) {
  // Don't handle if in input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (video) video.currentTime = Math.max(0, video.currentTime - 5);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (video) video.currentTime = Math.min(video.duration, video.currentTime + 5);
      break;
  }
}
