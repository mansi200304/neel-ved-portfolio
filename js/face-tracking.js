/* ══════════════════════════════════════════════════════════
   FACE TRACKING — MediaPipe FaceMesh
   "Digital Shadow" experiment

   WHAT IT DOES:
   • Uses 468 FaceMesh landmarks to build a real-time particle
     cloud that mirrors the user's face on screen.
   • A blue particle cloud = your live face silhouette.
   • An orange offset "shadow" = your digital echo, lagging
     slightly behind every movement.
   • When your face moves fast (high velocity), pop particles
     burst outward like your energy escaping into the page.

   WHY: As a 3D model developer, your viewers should feel like
   the portfolio literally *responds* to their physical presence.
   This is a taste of XR spatial awareness — no headset needed.
   ══════════════════════════════════════════════════════════ */

import { registerHandler, unregisterHandler } from './camera-manager.js';

const FACE_CANVAS  = document.getElementById('face-canvas');
const CTX          = FACE_CANVAS.getContext('2d');
const BTN          = document.getElementById('btn-face');
const LABEL        = document.getElementById('face-label');
const FACE_FPS     = document.getElementById('face-fps');
const FACE_STATUS  = document.getElementById('face-status');

let meshInstance  = null;
let active        = false;

/* ── Canvas resize ──────────────────────────────────────── */
function resize() {
  FACE_CANVAS.width  = window.innerWidth;
  FACE_CANVAS.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

/* ══════════════════════════════════════════════════════════
   SHADOW PARTICLE SYSTEM
   ══════════════════════════════════════════════════════════ */
/* Each rendered FaceMesh landmark becomes a "face particle" */
const SHADOW_OFFSET = { x: 18, y: 18 };
let   prevCenter    = null;
const popParticles  = [];

function spawnPopBurst(cx, cy, vMag) {
  const count = Math.min(Math.floor(vMag * 1.8), 30);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = vMag * 0.4 + Math.random() * 3;
    popParticles.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 1.0,
      decay: 0.025 + Math.random() * 0.035,
      size: 1.5 + Math.random() * 3.5,
      hue: Math.random() > 0.5 ? 'orange' : 'blue',
    });
  }
}

function tickPops() {
  for (let i = popParticles.length - 1; i >= 0; i--) {
    const p = popParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.vx *= 0.97;
    p.life -= p.decay;
    if (p.life <= 0) popParticles.splice(i, 1);
  }
}

function drawPops() {
  popParticles.forEach(p => {
    CTX.globalAlpha = p.life * 0.85;
    CTX.fillStyle   = p.hue === 'orange' ? '#ff6b00' : '#00d4ff';
    CTX.beginPath();
    CTX.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    CTX.fill();
  });
  CTX.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════════════
   FPS COUNTER
   ══════════════════════════════════════════════════════════ */
let fpsCount = 0, fpsLast = performance.now();
function tickFPS() {
  fpsCount++;
  const now = performance.now();
  if (now - fpsLast > 1000) {
    if (FACE_FPS) FACE_FPS.textContent = `${fpsCount}fps`;
    fpsCount = 0;
    fpsLast  = now;
  }
}

/* ══════════════════════════════════════════════════════════
   RENDER FACE LANDMARKS
   ══════════════════════════════════════════════════════════ */
function renderFace(landmarks) {
  const W  = FACE_CANVAS.width;
  const H  = FACE_CANVAS.height;

  /* Compute face bounding-box center (for velocity) */
  let sumX = 0, sumY = 0;
  landmarks.forEach(p => { sumX += p.x; sumY += p.y; });
  const cx = (1 - sumX / landmarks.length) * W;
  const cy = (sumY / landmarks.length) * H;

  /* Velocity-based pop burst */
  if (prevCenter) {
    const dx = cx - prevCenter.x;
    const dy = cy - prevCenter.y;
    const vMag = Math.sqrt(dx * dx + dy * dy);
    if (vMag > 4) spawnPopBurst(cx, cy, vMag);
  }
  prevCenter = { x: cx, y: cy };

  /* ── SHADOW (orange, offset, slightly larger) ── */
  landmarks.forEach(p => {
    const sx = (1 - p.x) * W + SHADOW_OFFSET.x;
    const sy = p.y * H + SHADOW_OFFSET.y;
    CTX.globalAlpha = 0.28;
    CTX.fillStyle = '#ff6b00';
    CTX.beginPath();
    CTX.arc(sx, sy, 1.6, 0, Math.PI * 2);
    CTX.fill();
  });

  /* ── LIVE FACE (blue particle cloud) ── */
  landmarks.forEach((p, i) => {
    const px = (1 - p.x) * W;
    const py = p.y * H;

    /* Vary size slightly by depth (z) for 3D feel */
    const depth  = (p.z || 0) + 0.5;
    const radius = Math.max(0.6, 1.4 - depth * 0.8);

    /* Subtle glow pulse: use landmark index for phase variety */
    const pulse = 0.55 + 0.2 * Math.sin(Date.now() * 0.001 + i * 0.05);

    CTX.globalAlpha = pulse;
    CTX.fillStyle   = '#00d4ff';
    CTX.beginPath();
    CTX.arc(px, py, radius, 0, Math.PI * 2);
    CTX.fill();
  });

  CTX.globalAlpha = 1;
}

/* ── Draw status label ──────────────────────────────────── */
function drawStatus(detected) {
  CTX.globalAlpha = 0.7;
  CTX.font = '11px "Share Tech Mono", monospace';
  CTX.fillStyle = '#ff6b00';
  const msg = detected
    ? `👤 DIGITAL SHADOW · ${popParticles.length} particles`
    : '👤 NO FACE DETECTED';
  CTX.fillText(msg, 16, FACE_CANVAS.height - 16);
  CTX.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════════════
   MEDIAPIPE RESULTS CALLBACK
   ══════════════════════════════════════════════════════════ */
function onResults(results) {
  CTX.clearRect(0, 0, FACE_CANVAS.width, FACE_CANVAS.height);
  tickPops();
  drawPops();
  tickFPS();

  const detected = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;

  if (detected) {
    renderFace(results.multiFaceLandmarks[0]);
  } else {
    prevCenter = null;
  }

  drawStatus(detected);

  if (LABEL) {
    LABEL.textContent = detected ? 'DIGITAL SHADOW ACTIVE' : 'LOOKING FOR FACE…';
  }
}

/* ── Frame handler ──────────────────────────────────────── */
async function frameHandler(video) {
  if (meshInstance) await meshInstance.send({ image: video });
}

/* ── Start / Stop ───────────────────────────────────────── */
async function start() {
  if (typeof FaceMesh === 'undefined') throw new Error('MediaPipe FaceMesh not loaded');

  meshInstance = new FaceMesh({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${f}`,
  });
  meshInstance.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  meshInstance.onResults(onResults);

  await registerHandler('face', frameHandler);
  if (LABEL) LABEL.textContent = 'DIGITAL SHADOW ACTIVE';
  FACE_STATUS?.classList.add('visible');
}

function stop() {
  unregisterHandler('face');
  if (meshInstance) { meshInstance.close(); meshInstance = null; }
  CTX.clearRect(0, 0, FACE_CANVAS.width, FACE_CANVAS.height);
  popParticles.length = 0;
  prevCenter = null;
  if (LABEL) LABEL.textContent = 'DIGITAL SHADOW OFF';
  if (FACE_FPS) FACE_FPS.textContent = '';
  FACE_STATUS?.classList.remove('visible');
}

/* ── Button toggle ──────────────────────────────────────── */
function notify(msg, d = 2800) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), d);
}

BTN?.addEventListener('click', async () => {
  active = !active;
  BTN.classList.toggle('active-face', active);

  if (active) {
    notify('👤 Enabling Digital Shadow…');
    try {
      await start();
      notify('✓ Digital Shadow on! Your face drives the particle cloud + pop bursts on movement');
    } catch (err) {
      active = false;
      BTN.classList.remove('active-face');
      notify(`⚠ ${err.message}`);
    }
  } else {
    stop();
    notify('Digital Shadow off.');
  }
});
