import * as THREE from 'three';
import { state } from './state.js';
import { editCam, gizmoDragging, hitsRotationRing, raycaster, renderer, vp } from './scene.js';
import { pickDot, rayFrom, selectJoint } from './selection.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   PULLING LIMBS — direct posture editing: drag a dot and the limb that ends there follows the pointer (the elbow
   dot turns the shoulder), or drag a body part to turn it around its own joint. Whatever it hangs from stays put.
   ===================================================================== */
const canvas = renderer.domElement;
const THRESHOLD = 4;
const MIN_REACH = 0.07;   // grabbed closer to the joint than this: pull at the tip instead, or it would spin
const TIPS = { pelvis: [0, 0.3, 0], spine: [0, 0.2, 0], chest: [0, 0.27, 0], neck: [0, 0.15, 0], head: [0, 0.2, 0], shoulder: [0, -0.29, 0], elbow: [0, -0.26, 0],
  wrist: [0, -0.12, 0], hip: [0, -0.43, 0], knee: [0, -0.41, 0], ankle: [0, -0.02, 0.14] };
let pull = null;   // { id, x, y, o, name, joint, grab (in the joint's space), plane, from, goal }
const pivot = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
const turn = new THREE.Quaternion(), parentQ = new THREE.Quaternion();

vp.addEventListener('pointerdown', (e) => {
  if (pull || e.button !== 0 || e.target !== canvas || state.mode !== 'edit' || state.cameraView || gizmoDragging()) return;
  if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
  const o = state.editing;
  const dot = pickDot(e);
  const body = dot ? null : raycaster.intersectObjects(o.meshes, false)[0];
  const clickedJoint = dot?.userData.handle || body?.object.userData.joint;
  const name = dot?.userData.pulls || clickedJoint;
  // Over the doll, only the visible ring gets priority over a body drag.
  if (!name || hitsRotationRing(raycaster)) return;
  e.stopImmediatePropagation();   // no orbiting and no sliding the whole doll
  const joint = o.joints[name];
  o.root.updateWorldMatrix(true, true);
  const at = dot ? dot.getWorldPosition(new THREE.Vector3()) : body.point;
  const grab = joint.worldToLocal(at.clone());
  if (grab.length() < MIN_REACH) grab.fromArray(TIPS[name.replace(/[LR]$/, '')]);
  // the pointer moves in a plane facing the view
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(editCam.getWorldDirection(new THREE.Vector3()), at);
  const from = raycaster.ray.intersectPlane(plane, new THREE.Vector3()) || at;
  pull = { id: e.pointerId, x: e.clientX, y: e.clientY, o, name, clickedJoint, dot, joint, grab, plane, from, goal: joint.localToWorld(grab.clone()) };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}, true);
window.addEventListener('pointermove', (e) => {
  if (!pull || e.pointerId !== pull.id) return;
  if (state.editing !== pull.o) { end(e); return; }
  if (!pull.started) {
    if (Math.hypot(e.clientX - pull.x, e.clientY - pull.y) <= THRESHOLD) return;
    pull.started = true;
    selectJoint(pull.name, pull.dot);
    document.body.classList.add('dragging-obj');
  }
  rayFrom(e);
  const { joint, grab, plane, from, goal } = pull;
  if (!raycaster.ray.intersectPlane(plane, b)) return;
  b.sub(from).add(goal);
  joint.getWorldPosition(pivot);
  joint.localToWorld(a.copy(grab)).sub(pivot);
  b.sub(pivot);
  if (b.length() < a.length() * 0.1) return;   // on the joint itself: no direction
  turn.setFromUnitVectors(a.normalize(), b.normalize());
  // the turn is in world space; the joint's own rotation is relative to its parent
  joint.parent.getWorldQuaternion(parentQ);
  joint.quaternion.premultiply(parentQ).premultiply(turn).premultiply(parentQ.invert()).normalize();
  joint.updateWorldMatrix(false, true);
  markDirty();
});
function end(e) {
  if (!pull || e.pointerId !== pull.id) return;
  const { started, o, clickedJoint, dot } = pull;
  pull = null;
  document.body.classList.remove('dragging-obj');
  if (!started && e.type === 'pointerup' && state.editing === o) selectJoint(clickedJoint, dot);   // a click selects the joint for the rings
}
window.addEventListener('pointerup', end);
window.addEventListener('pointercancel', end);
