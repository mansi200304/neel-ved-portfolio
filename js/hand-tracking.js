/* ══════════════════════════════════════════════════════════
   HAND TRACKING — MediaPipe Hands
   Controls:
     ✋ Open palm    → rotate hero scene (via mouse event dispatch)
     👆 Index point  → highlight nearest nav section
     🤏 Pinch        → click / activate hovered element
   ══════════════════════════════════════════════════════════ */

const HAND_LABEL  = document.getElementById('hand-label');
const HAND_STATUS = document.getElementById('hand-status');
const HAND_BTN    = document.getElementById('btn-hand');
const HAND_CANVAS = document.getElementById('hand-canvas');
const HAND_VIDEO  = document.getElementById('hand-video');
const CTX         = HAND_CANVAS.getContext('2d');

let trackingEnabled = false;
let handsInstance   = null;
let cameraInstance  = null;

/* Smoothing buffers */
const smooth = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

/* ── Gesture Detection ──────────────────────────────────── */
function getPinchDistance(landmarks) {
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dx = thumb.x - index.x;
  const dy = thumb.y - index.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isOpenPalm(landmarks) {
  const tips = [8, 12, 16, 20];
  const mcp  = [6, 10, 14, 18];
  let extended = 0;
  tips.forEach((tip, i) => {
    if (landmarks[tip].y < landmarks[mcp[i]].y) extended++;
  });
  return extended >= 3;
}

function isPointing(landmarks) {
  const indexTip  = landmarks[8];
  const indexMCP  = landmarks[6];
  const middleTip = landmarks[12];
  const middleMCP = landmarks[10];
  const indexUp   = indexTip.y < indexMCP.y;
  const middleIn  = middleTip.y >= middleMCP.y;
  return indexUp && middleIn;
}

/* ── Resize canvas to window ────────────────────────────── */
function resizeHandCanvas() {
  HAND_CANVAS.width  = window.innerWidth;
  HAND_CANVAS.height = window.innerHeight;
}
resizeHandCanvas();
window.addEventListener('resize', resizeHandCanvas);

/* ── Draw skeleton overlay ──────────────────────────────── */
function drawHand(landmarks, gesture) {
  CTX.clearRect(0, 0, HAND_CANVAS.width, HAND_CANVAS.height);

  const W = HAND_CANVAS.width;
  const H = HAND_CANVAS.height;

  /* Connections */
  const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17],
  ];

  CTX.strokeStyle = gesture === 'pinch' ? '#ff6b00' : '#00d4ff';
  CTX.lineWidth   = 1.5;
  CTX.globalAlpha = 0.7;

  CONNECTIONS.forEach(([a, b]) => {
    const la = landmarks[a], lb = landmarks[b];
    CTX.beginPath();
    CTX.moveTo((1 - la.x) * W, la.y * H);
    CTX.lineTo((1 - lb.x) * W, lb.y * H);
    CTX.stroke();
  });

  /* Joints */
  landmarks.forEach((lm, i) => {
    const x = (1 - lm.x) * W;
    const y = lm.y * H;
    const isTip = [4, 8, 12, 16, 20].includes(i);
    CTX.globalAlpha = 1;
    CTX.beginPath();
    CTX.arc(x, y, isTip ? 5 : 3, 0, Math.PI * 2);
    CTX.fillStyle = isTip ? (gesture === 'pinch' ? '#ff6b00' : '#00d4ff') : '#ffffff';
    CTX.fill();
  });

  /* Gesture label */
  if (gesture) {
    const icons = { pinch: '🤏', palm: '✋', point: '👆', idle: '' };
    const labels = { pinch: 'PINCH', palm: 'PALM', point: 'POINT', idle: '' };
    CTX.globalAlpha = 0.9;
    CTX.font = '13px "Share Tech Mono", monospace';
    CTX.fillStyle = '#00d4ff';
    CTX.fillText(`${icons[gesture]} ${labels[gesture]}`, 16, HAND_CANVAS.height - 20);
  }

  CTX.globalAlpha = 1;
}

/* ── Dispatch synthetic mouse event ────────────────────── */
function dispatchPointer(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  const ev = new MouseEvent('mousemove', {
    clientX: x, clientY: y, bubbles: true,
  });
  document.dispatchEvent(ev);
}

let lastPinch = false;

function onResults(results) {
  CTX.clearRect(0, 0, HAND_CANVAS.width, HAND_CANVAS.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    HAND_LABEL.textContent = 'NO HAND DETECTED';
    return;
  }

  const landmarks = results.multiHandLandmarks[0];
  const pinchDist = getPinchDistance(landmarks);
  const pinching  = pinchDist < 0.06;
  const palm      = isOpenPalm(landmarks);
  const pointing  = isPointing(landmarks);

  let gesture = 'idle';
  if (pinching)     gesture = 'pinch';
  else if (palm)    gesture = 'palm';
  else if (pointing) gesture = 'point';

  drawHand(landmarks, gesture);

  /* Map index finger tip to screen coordinates */
  const ix = (1 - landmarks[8].x) * window.innerWidth;
  const iy = landmarks[8].y * window.innerHeight;

  /* Smoothing */
  smooth.x += (ix - smooth.x) * 0.2;
  smooth.y += (iy - smooth.y) * 0.2;

  /* Drive mouse-based interactions */
  dispatchPointer(smooth.x, smooth.y);

  /* Pinch = click */
  if (pinching && !lastPinch) {
    const el = document.elementFromPoint(smooth.x, smooth.y);
    if (el) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: smooth.x, clientY: smooth.y }));
      /* Visual flash */
      CTX.beginPath();
      CTX.arc(smooth.x, smooth.y, 22, 0, Math.PI * 2);
      CTX.fillStyle = 'rgba(255,107,0,0.45)';
      CTX.fill();
    }
  }
  lastPinch = pinching;

  /* Update status label */
  const gestureText = {
    idle:  'HAND DETECTED',
    pinch: 'PINCH — CLICK',
    palm:  'OPEN PALM — NAVIGATE',
    point: 'POINTING — HOVER',
  };
  HAND_LABEL.textContent = gestureText[gesture];
}

/* ── Start tracking ─────────────────────────────────────── */
async function startTracking() {
  if (typeof Hands === 'undefined') {
    notify('⚠ MediaPipe not loaded. Check your connection.');
    return;
  }

  handsInstance = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`,
  });

  handsInstance.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.6,
  });
  handsInstance.onResults(onResults);

  cameraInstance = new Camera(HAND_VIDEO, {
    onFrame: async () => { await handsInstance.send({ image: HAND_VIDEO }); },
    width: 640,
    height: 480,
  });

  await cameraInstance.start();
  HAND_STATUS.classList.add('visible');
  HAND_LABEL.textContent = 'INITIALIZING…';
}

/* ── Stop tracking ──────────────────────────────────────── */
function stopTracking() {
  if (cameraInstance) cameraInstance.stop();
  if (handsInstance)  handsInstance.close();
  cameraInstance = null;
  handsInstance  = null;
  CTX.clearRect(0, 0, HAND_CANVAS.width, HAND_CANVAS.height);
  HAND_STATUS.classList.remove('visible');
}

/* ── Toggle button ──────────────────────────────────────── */
function notify(msg) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

HAND_BTN?.addEventListener('click', async () => {
  trackingEnabled = !trackingEnabled;
  HAND_BTN.classList.toggle('active-track', trackingEnabled);

  if (trackingEnabled) {
    notify('✋ Requesting camera for hand tracking…');
    try {
      await startTracking();
      notify('✓ Hand tracking active!');
    } catch (err) {
      trackingEnabled = false;
      HAND_BTN.classList.remove('active-track');
      notify(`⚠ Camera access denied: ${err.message}`);
    }
  } else {
    stopTracking();
    notify('Hand tracking disabled.');
  }
});
