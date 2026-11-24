import * as THREE from 'three';
import { state } from './state.js';
import { editCam, gizmoDragging } from './scene.js';
import { shotCam } from './camera.js';
import { selObjs } from './selection.js';
import { sizeOf } from './stretch.js';
import { exportOpen } from './export-modal.js';
import { syncTransformInputs } from './left-panel.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   ARROW KEYS — move the selection over the floor, half a metre per press (less when it is scaled down).
   The direction follows the view: up is away from you, along the nearest floor axis.
   ===================================================================== */
const STEP = 0.5;
const KEYS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };   // right, away
const v = new THREE.Vector3();

window.addEventListener('keydown', (e) => {
  const k = KEYS[e.key];
  if (!k || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (state.cameraView || gizmoDragging() || exportOpen() || document.querySelector('#navAsk')) return;
  if (e.target.isContentEditable || e.target.closest?.('input, textarea, select, #navWidget, #addDrop, #fileDrop, #helpPanel')) return;
  const camera = state.selected?.kind === 'camera', objs = selObjs();
  if (!camera && !objs.length) return;
  e.preventDefault();
  // the floor axis that points most to the right of the screen (also right when looking straight down)
  v.setFromMatrixColumn(editCam.matrixWorld, 0);
  const [rx, rz] = Math.abs(v.x) >= Math.abs(v.z) ? [Math.sign(v.x) || 1, 0] : [0, Math.sign(v.z)];
  const step = camera ? STEP : STEP * Math.min(1, ...objs.map(sizeOf));
  const dx = (k[0] * rx + k[1] * rz) * step, dz = (k[0] * rz - k[1] * rx) * step;
  for (const t of camera ? [shotCam] : objs.map((o) => o.root)) {
    t.position.x += dx; t.position.z += dz;
    t.updateMatrixWorld(true);
  }
  markDirty();
  syncTransformInputs();
});
