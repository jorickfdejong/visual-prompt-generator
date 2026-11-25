import * as THREE from 'three';
import { $, ACCENTS, state } from './state.js';
import { editCam, orbit, raycaster, renderer, scene, setHelper, vp } from './scene.js';
import { TYPES } from './types.js';
import { addObject } from './objects.js';
import { deselect, exitEdit, rayFrom } from './selection.js';
import { exitCameraView } from './camera.js';
import { renderObjectList } from './left-panel.js';
import { namingObject, requireName, whenNamed } from './naming.js';
import { orbitBy, panBy } from './nav.js';
import { isEasy } from './nav-mode.js';
import { showTab } from './side-tabs.js';
import { flushPendingSave, markDirty } from './prompt-panel.js';

/* =====================================================================
   PLACING — a new object first follows the pointer as a see-through ghost; a click puts it down, then it gets its name.
   The ghost is on the helper layer and not in state.objects: never in a shot, the prompt, a file or the history.
   ===================================================================== */
const canvas = renderer.domElement;
const THRESHOLD = 4, OPACITY = 0.45;
let ghost = null;   // { type, data, obj, aim: {clientX, clientY} | null, objs }
let left = null, right = null;   // presses on the canvas while placing: { id, x, y, moved, ... }

const hint = document.createElement('div');
hint.id = 'placeHint';
hint.setAttribute('role', 'status');
hint.hidden = true;
hint.textContent = 'Click to place · Esc to cancel';
vp.appendChild(hint);

export const placing = () => !!ghost;

/* ---------- where the pointer meets the floor ---------- */
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p = new THREE.Vector3(), flat = new THREE.Vector3();
const overCanvas = (e) => { const r = canvas.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
function centre() { const r = canvas.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; }
// e: anything with clientX / clientY (outside the view: its centre). Towards the horizon or the sky it stays in reach.
export function floorPoint(e) {
  rayFrom(e && overCanvas(e) ? e : centre());
  const { origin, direction } = raycaster.ray;
  const reach = Math.max(12, editCam.position.distanceTo(orbit.target) * 2.5);
  const hit = raycaster.ray.intersectPlane(plane, p);
  flat.copy(hit ? p.sub(origin) : direction).setY(0);
  if (hit) flat.clampLength(0, reach);
  else if (flat.length() < 1e-3) return new THREE.Vector3(orbit.target.x, 0, orbit.target.z);
  else flat.setLength(reach);
  return new THREE.Vector3(origin.x + flat.x, 0, origin.z + flat.z);
}

/* ---------- the ghost ---------- */
function makeGhost(type, data, accent) {
  const T = TYPES[type];
  const o = { id: 'ghost', type, accent, details: { ...T.defaultDetails() }, ...T.create(accent) };
  T.applyExtra(o, data);
  for (const m of o.mats) { m.transparent = true; m.opacity = OPACITY; m.depthWrite = false; }
  o.meshes.forEach((m) => { m.castShadow = m.receiveShadow = false; });
  setHelper(o.root);
  scene.add(o.root);
  return o;
}
function dropGhost() {
  const { obj } = ghost;
  ghost = left = right = null;
  scene.remove(obj.root);
  obj.mats.forEach((m) => m.dispose());
  obj.handles.forEach((h) => h.material.dispose());
  obj.parts?.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });   // puppets share theirs
  hint.hidden = true;
  document.body.classList.remove('placing');
}
export async function startPlacing(type, data = {}) {
  while (namingObject()) await whenNamed();   // a picked image can arrive late
  cancelPlacing();
  if (state.cameraView) exitCameraView();
  if (state.mode === 'edit') exitEdit();
  deselect();   // no gizmo in the way
  showTab('scene');
  const accent = data.accent || ACCENTS[state.objects.length % ACCENTS.length];
  ghost = { type, data: { ...data, accent }, obj: makeGhost(type, data, accent), aim: null, objs: state.objects };
  document.body.classList.add('placing');
  hint.hidden = false;
  follow();
}
export function cancelPlacing() { if (ghost) dropGhost(); }
// something else took over: another selection, the camera view, the export window, a loaded scene, a removed object
const overtaken = () => state.selected || state.mode === 'edit' || state.cameraView || namingObject() || ghost.objs !== state.objects || !$('#exportModal').hidden;
function follow() {
  const g = ghost;
  if (!g) return;
  if (overtaken()) { cancelPlacing(); return; }
  g.obj.root.position.copy(floorPoint(g.aim));
  requestAnimationFrame(() => { if (ghost === g) follow(); });
}
function put() {
  if (overtaken()) { cancelPlacing(); return; }
  const { type, data, aim } = ghost, pos = floorPoint(aim).toArray();
  cancelPlacing();
  flushPendingSave();   // an earlier change keeps its own undo step
  addNamed(type, { ...data, pos });
}
// adds a real object and asks for its name
export function addNamed(type, data) {
  const o = addObject(type, data);
  showTab('scene'); renderObjectList(); markDirty();
  return requireName(o);   // selects it
}

/* ---------- pointer: caught on the window before anything else sees it ---------- */
const stop = (e) => { e.stopImmediatePropagation(); };
window.addEventListener('pointermove', (e) => {
  if (!ghost) return;
  if (e.target === canvas) ghost.aim = { clientX: e.clientX, clientY: e.clientY };
  for (const d of [left, right]) if (d?.id === e.pointerId) d.moved ||= Math.hypot(e.clientX - d.x, e.clientY - d.y) > THRESHOLD;
  if (left?.id !== e.pointerId) return;
  const dx = e.clientX - left.lx, dy = e.clientY - left.ly;
  if (!left.moved) return;   // the press may still be a click
  left.lx = e.clientX; left.ly = e.clientY;
  if (left.drag === 'pan') panBy(dx, dy); else if (left.drag === 'orbit') orbitBy(dx, dy);
}, true);
window.addEventListener('pointerdown', (e) => {
  if (!ghost || e.target !== canvas) return;
  const d = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  if (e.button === 2) { right = d; return; }   // still pans
  if (e.button !== 0) return;
  stop(e);
  document.activeElement?.blur?.();
  ghost.aim = { clientX: e.clientX, clientY: e.clientY };
  left = { ...d, drag: vp.classList.contains('nav-space') ? 'pan' : isEasy() || e.altKey ? 'orbit' : null };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}, true);
window.addEventListener('pointerup', (e) => {
  if (!ghost) return;
  if (left?.id === e.pointerId && e.button === 0) {
    stop(e);
    const d = left; left = null;
    if (!d.moved && d.drag !== 'pan') { ghost.aim = { clientX: e.clientX, clientY: e.clientY }; put(); }
  } else if (right?.id === e.pointerId && e.button === 2) {
    const d = right; right = null;
    if (!d.moved) setTimeout(cancelPlacing);   // after OrbitControls let go
  }
}, true);
window.addEventListener('pointercancel', () => { left = right = null; }, true);
for (const t of ['dblclick', 'click']) window.addEventListener(t, (e) => { if (ghost && e.target === canvas) stop(e); }, true);
$('#btnExport').addEventListener('click', cancelPlacing);

/* ---------- keys ---------- */
window.addEventListener('keydown', (e) => {
  if (!ghost || namingObject()) return;
  if (e.target.isContentEditable || e.target.closest?.('input, textarea, select') || document.querySelector('#navAsk')) return;
  if (!$('#addDrop').hidden || !$('#fileDrop').hidden) return;   // an open menu owns the keyboard
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (k === 'escape' || k === 'delete' || k === 'backspace' || (ctrl && k === 'z')) { e.preventDefault(); stop(e); cancelPlacing(); }
  else if (k === 'enter' && !e.repeat && !(e.target.tagName === 'BUTTON' && e.target.offsetParent)) { e.preventDefault(); stop(e); put(); }
  else if (ctrl && 'yxvda'.includes(k)) cancelPlacing();   // these change the scene or the selection
}, true);
