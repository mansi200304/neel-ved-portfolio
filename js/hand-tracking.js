/* ══════════════════════════════════════════════════════════
   HAND TRACKING — MediaPipe Hands
   
   WHAT IT DOES:
   ✋ Open Palm  → Drives camera parallax in hero (dispatches
                   mouse-move events from index-finger position)
   👆 Index Point → Moves custom cursor + hovers elements
   🤏 Pinch        → Triggers click on the element under cursor
                     + spawns orange burst particles

   The Gesture HUD (bottom-left) shows which gesture is active
   and what it's currently controlling.
   ══════════════════════════════════════════════════════════ */

import { registerHandler, unregisterHandler } from './camera-manager.js';

const HAND_CANVAS = document.getElementById('hand-canvas');
const CTX         = HAND_CANVAS.getContext('2d');
const BTN         = document.getElementById('btn-hand');
const HUD         = document.getElementById('gesture-hud');
const CURSOR_DOT  = document.getElementById('cursor-dot');
const CURSOR_RING = document.getElementById('cursor-ring');

let handsInstance = null;
let active        = false;
let lastPinch     = false;

/* Smoothing */
const smooth = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

/* Pop particles for pinch */
const pops = [];

/* ── Canvas resize ──────────────────────────────────────── */
function resize() {
  HAND_CANVAS.width  = window.innerWidth;
  HAND_CANVAS.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

/* ── Gesture detection helpers ──────────────────────────── */
function pinchDist(lm) {
  const dx = lm[4].x - lm[8].x;
  const dy = lm[4].y - lm[8].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isOpenPalm(lm) {
  const tips = [8, 12, 16, 20];
  const mcps = [6, 10, 14, 18];
  return tips.filter((t, i) => lm[t].y < lm[mcps[i]].y).length >= 3;
}

function isPointing(lm) {
  return lm[8].y < lm[6].y && lm[12].y >= lm[10].y;
}

/* ── HUD update ─────────────────────────────────────────── */
function setHUDGesture(gesture) {
  HUD.querySelectorAll('.ghud-item').forEach(el => {
    el.classList.toggle('active', el.dataset.g === gesture);
  });
}

/* ── Pinch particle burst ───────────────────────────────── */
function spawnPinchBurst(x, y) {
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    pops.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.04 + Math.random() * 0.04,
      size: 2 + Math.random() * 4,
    });
  }
}

function updatePops() {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.vx *= 0.96;
    p.life -= p.decay;
    if (p.life <= 0) pops.splice(i, 1);
  }
}

function drawPops() {
  pops.forEach(p => {
    CTX.globalAlpha = p.life * 0.9;
    CTX.fillStyle   = '#ff6b00';
    CTX.beginPath();
    CTX.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    CTX.fill();
  });
}

/* ── Draw hand skeleton ─────────────────────────────────── */
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];

function drawSkeleton(lm, gesture) {
  const W = HAND_CANVAS.width;
  const H = HAND_CANVAS.height;
  const isPinch = gesture === 'pinch';
  const lineColor = isPinch ? 'rgba(255,107,0,0.75)' : 'rgba(0,212,255,0.65)';

  CTX.lineWidth = 1.5;
  CTX.strokeStyle = lineColor;
  CONNECTIONS.forEach(([a, b]) => {
    const la = lm[a], lb = lm[b];
    CTX.beginPath();
    CTX.moveTo((1 - la.x) * W, la.y * H);
    CTX.lineTo((1 - lb.x) * W, lb.y * H);
    CTX.stroke();
  });

  const TIPS = [4, 8, 12, 16, 20];
  lm.forEach((p, i) => {
    const x = (1 - p.x) * W;
    const y = p.y * H;
    const isTip = TIPS.includes(i);
    CTX.globalAlpha = 1;
    CTX.beginPath();
    CTX.arc(x, y, isTip ? 5.5 : 2.5, 0, Math.PI * 2);
    CTX.fillStyle = isTip ? (isPinch ? '#ff6b00' : '#00d4ff') : '#ffffff';
    CTX.fill();

    if (isTip) {
      CTX.beginPath();
      CTX.arc(x, y, 9, 0, Math.PI * 2);
      CTX.strokeStyle = isPinch ? 'rgba(255,107,0,0.3)' : 'rgba(0,212,255,0.3)';
      CTX.lineWidth = 1;
      CTX.stroke();
    }
  });
}

/* ── Draw cursor ring around index tip ──────────────────── */
function drawCursorAura(x, y, gesture) {
  CTX.globalAlpha = 0.55;
  CTX.beginPath();
  CTX.arc(x, y, gesture === 'pinch' ? 18 : 12, 0, Math.PI * 2);
  CTX.strokeStyle = gesture === 'pinch' ? '#ff6b00' : '#00d4ff';
  CTX.lineWidth = 1.5;
  CTX.stroke();
  CTX.globalAlpha = 1;
}

/* ── Draw gesture label ─────────────────────────────────── */
function drawLabel(gesture) {
  const labels = {
    palm: '✋ PALM → CAMERA PARALLAX',
    point: '👆 POINTING → HOVER',
    pinch: '🤏 PINCH → CLICK',
    idle: 'HAND DETECTED',
  };
  CTX.globalAlpha = 0.85;
  CTX.font = '12px "Share Tech Mono", monospace';
  CTX.fillStyle = gesture === 'pinch' ? '#ff6b00' : '#00d4ff';
  CTX.fillText(labels[gesture] || '', 16, HAND_CANVAS.height - 36);
  CTX.globalAlpha = 1;
}

/* ── Dispatch synthetic mouse move ─────────────────────── */
function drive(x, y) {
  document.dispatchEvent(new MouseEvent('mousemove', {
    clientX: x, clientY: y, bubbles: true,
  }));
  /* Move custom cursor */
  if (CURSOR_DOT) {
    CURSOR_DOT.style.left = x + 'px';
    CURSOR_DOT.style.top  = y + 'px';
  }
}

/* ── Main results handler ───────────────────────────────── */
function onResults(results) {
  CTX.clearRect(0, 0, HAND_CANVAS.width, HAND_CANVAS.height);
  updatePops();
  drawPops();

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    setHUDGesture(null);
    lastPinch = false;
    return;
  }

  const lm      = results.multiHandLandmarks[0];
  const W       = HAND_CANVAS.width;
  const H       = HAND_CANVAS.height;
  const pinching = pinchDist(lm) < 0.065;
  const palm     = isOpenPalm(lm);
  const pointing = isPointing(lm);

  const gesture = pinching ? 'pinch' : palm ? 'palm' : pointing ? 'point' : 'idle';
  setHUDGesture(gesture);

  /* Screen coords of index tip (mirrored) */
  const ix = (1 - lm[8].x) * W;
  const iy = lm[8].y * H;
  smooth.x += (ix - smooth.x) * 0.22;
  smooth.y += (iy - smooth.y) * 0.22;

  /* Draw */
  drawSkeleton(lm, gesture);
  drawCursorAura(smooth.x, smooth.y, gesture);
  drawLabel(gesture);

  /* Drive interactions */
  drive(smooth.x, smooth.y);

  /* Pinch = click + burst */
  if (pinching && !lastPinch) {
    spawnPinchBurst(smooth.x, smooth.y);
    const el = document.elementFromPoint(smooth.x, smooth.y);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: smooth.x, clientY: smooth.y }));
    notify('🤏 Pinch click!');
  }
  lastPinch = pinching;
}

/* ── Frame handler (passed to CameraManager) ────────────── */
async function frameHandler(video) {
  if (handsInstance) await handsInstance.send({ image: video });
}

/* ── Start / Stop ───────────────────────────────────────── */
async function start() {
  if (typeof Hands === 'undefined') throw new Error('MediaPipe Hands not loaded');

  handsInstance = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}`,
  });
  handsInstance.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.6,
  });
  handsInstance.onResults(onResults);

  await registerHandler('hands', frameHandler);
  HUD.classList.add('visible');
}

function stop() {
  unregisterHandler('hands');
  if (handsInstance) { handsInstance.close(); handsInstance = null; }
  CTX.clearRect(0, 0, HAND_CANVAS.width, HAND_CANVAS.height);
  HUD.classList.remove('visible');
  setHUDGesture(null);
  lastPinch = false;
}

/* ── Button toggle ──────────────────────────────────────── */
function notify(msg, d = 2500) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), d);
}

BTN?.addEventListener('click', async () => {
  active = !active;
  BTN.classList.toggle('active-track', active);

  if (active) {
    notify('✋ Requesting camera for hand tracking…');
    try {
      await start();
      notify('✓ Hand tracking active! Try ✋ palm, 👆 point, 🤏 pinch');
    } catch (err) {
      active = false;
      BTN.classList.remove('active-track');
      notify(`⚠ ${err.message}`);
    }
  } else {
    stop();
    notify('Hand tracking off.');
  }
});
