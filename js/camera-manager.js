/* ══════════════════════════════════════════════════════════
   CAMERA MANAGER
   Shared camera stream for hand tracking + face tracking.
   Both modules register a frame handler. One Camera instance
   is created and sends each video frame to all handlers.
   ══════════════════════════════════════════════════════════ */

const VIDEO = document.getElementById('shared-video');
const handlers = new Map();
let cameraInstance = null;
let running = false;

async function startCamera() {
  if (running) return;
  if (typeof Camera === 'undefined') {
    throw new Error('MediaPipe Camera utils not loaded');
  }
  cameraInstance = new Camera(VIDEO, {
    onFrame: async () => {
      for (const [, fn] of handlers) {
        await fn(VIDEO);
      }
    },
    width: 640,
    height: 480,
  });
  await cameraInstance.start();
  running = true;
  console.log('[CameraManager] Camera started');
}

function stopCamera() {
  if (cameraInstance) {
    cameraInstance.stop();
    cameraInstance = null;
  }
  running = false;
  console.log('[CameraManager] Camera stopped');
}

export async function registerHandler(key, fn) {
  handlers.set(key, fn);
  if (!running) await startCamera();
}

export function unregisterHandler(key) {
  handlers.delete(key);
  if (handlers.size === 0) stopCamera();
}

export { VIDEO };
