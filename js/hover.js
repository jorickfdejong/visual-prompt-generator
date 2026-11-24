import { state } from './state.js';
import { gizmoDragging, gizmoHot, renderer } from './scene.js';
import { pickCompose, pickJoint } from './selection.js';

/* =====================================================================
   HOVER — the object under the pointer gets an outline (outline.js) and its name (labels.js)
   ===================================================================== */
const canvas = renderer.domElement;
let over = null, last = null, queued = false;
export function hovered() {
  return over && !over.hidden && state.objects.includes(over) && over !== state.editing && !state.cameraView ? over : null;
}
function update() {
  queued = false;
  const off = !last || last.buttons || state.cameraView || gizmoDragging() || gizmoHot();
  const hit = off ? null : pickCompose(last);
  over = hit?.obj || null;
  canvas.classList.toggle('hovering', !!hit);
  canvas.classList.toggle('joint', !off && state.mode === 'edit' && !!pickJoint(last));
  canvas.classList.toggle('gizmo-hot', !!last && !state.cameraView && (gizmoHot() || gizmoDragging()));
}
canvas.addEventListener('pointermove', (e) => {
  last = e;
  if (!queued) { queued = true; requestAnimationFrame(update); }
});
canvas.addEventListener('pointerleave', () => { last = null; update(); });
