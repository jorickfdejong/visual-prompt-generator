import * as THREE from 'three';
import { state } from './state.js';
import { editCam, gizmoDragging, gizmoHot, orbit, raycaster, renderer, vp } from './scene.js';
import { pilot, shotCam } from './camera.js';
import { exitEdit, pickCompose, pickHandle, rayFrom, selectCamera, selectObject, selObjs } from './selection.js';
import { syncTransformInputs } from './left-panel.js';
import { isEasy } from './nav-mode.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   LEFT DRAG — on an object: slides it over the floor. Anywhere else: orbits in Easy mode, box-selects in Pro.
   (The gizmo's own listeners run first, so its handles win. Shift + drag on empty space box-selects.)
   ===================================================================== */
const canvas = renderer.domElement;
const THRESHOLD = 4, MAX_DIST = 60;
let drag = null;   // { id, x, y, hit, plane, from, flat, items }
const p = new THREE.Vector3(), n = new THREE.Vector3();

// orbiting is left to OrbitControls, so it is as smooth as the middle mouse in Pro: before it sees the press
// (capture), give it the left button or not
vp.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target !== canvas) return;
  let left = null;
  if (isEasy() && !(e.altKey || e.shiftKey || e.ctrlKey || e.metaKey || gizmoDragging() || gizmoHot())) {
    const joint = state.mode === 'edit' && !state.cameraView && pickHandle(e);
    if (state.cameraView || joint || !pickCompose(e)) left = THREE.MOUSE.ROTATE;
  }
  orbit.mouseButtons.LEFT = left;
  if (pilot) pilot.mouseButtons.LEFT = left;
}, true);
canvas.addEventListener('pointerdown', (e) => {
  if (drag || e.button !== 0 || e.altKey || gizmoDragging() || gizmoHot()) return;
  if (state.cameraView || (state.mode === 'edit' && pickHandle(e))) return;
  const hit = pickCompose(e);
  if (!hit || e.shiftKey || e.ctrlKey || e.metaKey) return;   // with a key held, clicks change the selection
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, hit, items: null };
  orbit.enabled = false;
});
function startObjectDrag() {
  const { hit } = drag;
  if (hit.camera) {
    if (state.selected?.kind !== 'camera') { if (state.mode === 'edit') exitEdit({ restoreView: false }); selectCamera(); }
  } else if (!selObjs().includes(hit.obj)) selectObject(hit.obj);
  // slide in the horizontal plane through the grabbed point; seen from the side, only left and right
  const dir = editCam.getWorldDirection(n);
  drag.flat = Math.abs(dir.y) < 0.12;
  if (drag.flat) dir.setY(0).normalize(); else dir.set(0, 1, 0);
  drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, hit.point);
  drag.from = hit.point.clone();
  drag.items = (hit.camera ? [shotCam] : selObjs().map((o) => o.root)).map((t) => ({ t, start: t.position.clone() }));
  document.body.classList.add('dragging-obj');
}
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <= THRESHOLD) return;
    drag.started = true;
    startObjectDrag();
  }
  rayFrom(e);
  if (!raycaster.ray.intersectPlane(drag.plane, p) || p.distanceTo(editCam.position) > MAX_DIST) return;
  p.sub(drag.from);
  if (drag.flat) p.y = 0;
  for (const { t, start } of drag.items) { t.position.set(start.x + p.x, start.y, start.z + p.z); t.updateMatrixWorld(true); }
  markDirty();
  syncTransformInputs();
});
const end = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!state.cameraView) orbit.enabled = true;
  drag = null;
  document.body.classList.remove('dragging-obj');
};
window.addEventListener('pointerup', end);
window.addEventListener('pointercancel', end);
// right drag pans (OrbitControls): show it
vp.addEventListener('pointerdown', (e) => { if (e.button === 2 && e.target === canvas) document.body.classList.add('panning'); }, true);
for (const t of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(t, () => document.body.classList.remove('panning'));
