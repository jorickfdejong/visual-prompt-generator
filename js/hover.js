import { state } from './state.js';
import { gizmoDragging, gizmoHot, renderer } from './scene.js';
import { pickCompose } from './selection.js';
import { easyTool, isEasy } from './nav-mode.js';

/* =====================================================================
   HOVER — the object under the pointer gets an outline (outline.js) and its name (labels.js)
   ===================================================================== */
const canvas = renderer.domElement;
let over = null, last = null, queued = false;
export function hovered() {
  return over && !over.hidden && state.objects.includes(over) && state.mode === 'compose' && !state.cameraView ? over : null;
}
function update() {
  queued = false;
  const off = !last || last.buttons || state.mode !== 'compose' || state.cameraView || gizmoDragging() || gizmoHot() || (isEasy() && easyTool() !== 'select');
  const hit = off ? null : pickCompose(last);
  over = hit?.obj || null;
  canvas.classList.toggle('hovering', !!hit);
}
canvas.addEventListener('pointermove', (e) => {
  last = e;
  if (!queued) { queued = true; requestAnimationFrame(update); }
});
canvas.addEventListener('pointerleave', () => { last = null; update(); });
