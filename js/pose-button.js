import * as THREE from 'three';
import { state } from './state.js';
import { editCam, vp } from './scene.js';
import { TYPES } from './types.js';
import { enterEdit } from './selection.js';

/* =====================================================================
   CHANGE POSTURE — a big button under the feet of the selected doll
   ===================================================================== */
const btn = document.createElement('button');
btn.id = 'btnPose';
btn.type = 'button';
btn.hidden = true;
btn.title = 'Change the posture (Enter, or double-click the doll)';
btn.textContent = 'Change posture';
vp.appendChild(btn);
btn.addEventListener('click', () => { if (state.selected?.kind === 'obj') enterEdit(state.selected.obj); btn.blur(); });

const bb = new THREE.Box3(), v = new THREE.Vector3();
export function updatePoseButton() {
  const o = state.selected?.kind === 'obj' && state.selected.obj;
  let show = !!o && !o.hidden && TYPES[o.type].poseable && state.mode === 'compose' && !state.cameraView;
  if (show) {
    bb.setFromObject(o.root);
    v.set((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2).project(editCam);
    show = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.4;
  }
  btn.hidden = !show;
  if (!show) return;
  const w = vp.clientWidth, h = vp.clientHeight, hw = btn.offsetWidth / 2, bh = btn.offsetHeight;
  const x = THREE.MathUtils.clamp((v.x + 1) / 2 * w, hw + 8, w - hw - 8);
  const y = THREE.MathUtils.clamp((1 - v.y) / 2 * h + 16, 8, h - bh - 52);   // stays above the bottom bar
  btn.style.transform = `translate(${(x - hw).toFixed(1)}px, ${y.toFixed(1)}px)`;
}
