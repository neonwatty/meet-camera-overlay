/**
 * UI setup and interaction handlers for the unified effects prototype.
 */

import { extractContour } from './effects/utils.js';

// ============================================
// Status dots
// ============================================

export function updateStatusDot(id, status) {
  const dot = document.getElementById(id);
  if (!dot) return;
  dot.className = `dot ${status}`;
}

// ============================================
// Active effect display
// ============================================

export function updateActiveDisplay(manager) {
  const el = document.getElementById('active-effect');
  if (!el) return;
  const names = manager.getActiveEffectNames();
  el.textContent = names.length > 0 ? names.join(', ') : '--';
}

// ============================================
// Scanner sequence callbacks
// ============================================

export function setupScannerCallbacks(scannerSequence, manager, state, elements) {
  scannerSequence.onComplete = () => {
    manager.resetFirstSegmentation();
  };

  scannerSequence.onScan = () => {
    if (state.lastMask) {
      const contour = extractContour(
        state.lastMask, state.lastMaskW, state.lastMaskH,
        elements.canvas.width, elements.canvas.height
      );
      scannerSequence.setDetectionData({
        contour, mask: state.lastMask,
        maskW: state.lastMaskW, maskH: state.lastMaskH,
      });
    }
  };
}

// ============================================
// UI event binding
// ============================================

export function setupUI(manager, scannerSequence, state) {
  // Effect buttons
  document.querySelectorAll('.fx-btn[data-fx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fx = btn.dataset.fx;
      if (fx === 'scannerSequence') {
        scannerSequence.start();
        return;
      }
      manager.triggerEffect(fx, performance.now());
    });
  });

  // Settings toggles
  document.getElementById('toggle-occlusion')?.addEventListener('change', (e) => {
    state.segmentationEnabled = e.target.checked;
  });

  document.getElementById('toggle-stabilization')?.addEventListener('change', (e) => {
    state.stabilizationEnabled = e.target.checked;
    if (!e.target.checked && state.jiggle) {
      state.jiggle.reset();
      state.jiggleInitialized = false;
    }
  });

  // Region presets
  document.querySelectorAll('.preset-btn[data-count]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.onPresetChange(Number(btn.dataset.count));
    });
  });

  // Reset
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    manager.resetFirstSegmentation();
    state.faceLandmarks = null;
    state.poseLandmarks = null;
    state.jiggleInitialized = false;
    if (state.jiggle) state.jiggle.reset();
    state.onPresetChange(state.regionPresetCount);
  });

  // Play All Sequentially
  document.getElementById('btn-play-all')?.addEventListener('click', () => {
    const effectNames = [
      'meshShimmer', 'edgeWireframe',
      'ambientAura', 'depthParallax', 'smileWarmth', 'handHighlight', 'headTilt',
      'contourParticles', 'portalDissolve', 'wireframeMorph', 'environmentalGlow',
    ];
    let delay = 0;
    for (const name of effectNames) {
      setTimeout(() => manager.triggerEffect(name, performance.now()), delay);
      const effect = manager._effectMap[name];
      delay += (effect ? effect.duration : 5000) + 2000;
    }
  });

  // Random
  document.getElementById('btn-random')?.addEventListener('click', () => {
    const names = Object.keys(manager._effectMap);
    const name = names[Math.floor(Math.random() * names.length)];
    manager.triggerEffect(name, performance.now());
  });

  // Effect button progress bars
  setInterval(() => {
    document.querySelectorAll('.fx-btn[data-fx]').forEach((btn) => {
      const fx = btn.dataset.fx;
      const effect = manager._effectMap[fx];
      if (!effect) return;

      let progressBar = btn.querySelector('.fx-progress');

      if (effect.active) {
        btn.classList.add('active');
        if (!progressBar) {
          progressBar = document.createElement('div');
          progressBar.className = 'fx-progress';
          btn.appendChild(progressBar);
        }
        const elapsed = performance.now() - effect.startTime;
        const pct = Math.min(elapsed / effect.duration * 100, 100);
        progressBar.style.width = `${pct}%`;
      } else {
        btn.classList.remove('active');
        if (progressBar) progressBar.style.width = '0%';
      }
    });
  }, 50);
}
