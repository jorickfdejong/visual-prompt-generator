import * as THREE from 'three';
import { $, state } from './state.js';
import { attachGizmo, detachGizmo, editCam, floor, gizmoDragging, gizmoHot, orbit, raycaster, rc, renderer, scene, setGizmoBlocker, showStretch, tc, vp } from './scene.js';
import { grid } from './room.js';
import { camModel, shotCam } from './camera.js';
import { TYPES } from './types.js';
import { scaleRange } from './objects.js';
import { canStretch, scaleLimits } from './stretch.js';
import { esc, renderContext, renderObjectList, syncTransformInputs } from './left-panel.js';
import { showTab } from './side-tabs.js';
import { inputIcon } from './input-icons.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   MODES & SELECTION
   ===================================================================== */
export let dimmed = false;
export function applyDim(on) {
  dimmed = on;
  for (const o of state.objects) {
    const dim = on && o !== state.editing;
    for (const m of o.mats) { m.opacity = dim ? 0.15 : 1; m.depthWrite = !dim; }
  }
}
const easyNav = () => document.body.classList.contains('nav-easy');
// joint dots: Pro has one per joint, Easy the ones that can be pulled. The active one is white.
let activeDot = null;
function showHandles() {
  const o = state.editing;
  if (!o) return;
  const key = easyNav() ? 'pulls' : 'handle', mine = (h) => !!state.joint && h.userData[key] === state.joint;
  const on = activeDot && o.handles.includes(activeDot) && mine(activeDot) ? activeDot : o.handles.find(mine);
  o.handles.forEach((h) => { h.visible = !!h.userData[key]; h.material.color.set(h === on ? '#ffffff' : '#ff9f43'); });
}
// the navigation mode changed
export function refreshPosing() {
  if (state.mode !== 'edit') return;
  showHandles(); updateGizmo(); renderContext();
}
// point the gizmo at whatever is selected: move + rotate together, or scale
export function updateGizmo() {
  if (state.cameraView) { detachGizmo(); return; }
  if (state.mode === 'edit' && state.joint && !easyNav()) {   // in Easy, limbs are pulled (pull-limb.js)
    rc.setSpace('local');
    attachGizmo(state.editing.joints[state.joint], { move: false });
    return;
  }
  if (state.mode === 'edit') { detachGizmo(); return; }   // posing: only a joint gets rings
  const camera = state.selected?.kind === 'camera';
  if (camera) state.tool = 'transform';   // the camera cannot be scaled
  const scaling = state.tool === 'scale';
  tc.setMode(scaling ? 'scale' : 'translate');
  showStretch(scaling && !!stretchTarget());
  rc.setSpace(camera ? 'local' : 'world');
  if (camera) attachGizmo(shotCam);
  else if (selObjs().some((o) => !o.hidden)) { placePivot(); attachGizmo(pivot, { turn: !scaling }); }
  else detachGizmo();
}
// every selected doll, whether one ('obj') or several ('multi')
export function selObjs() {
  const s = state.selected;
  return !s ? [] : s.kind === 'multi' ? s.objs : s.kind === 'obj' ? [s.obj] : [];
}
// The gizmo drives an invisible pivot at the centre of the selection; the objects follow it.
export const pivot = new THREE.Object3D();
scene.add(pivot);
export const groupRel = new Map();   // obj -> { rel: matrix relative to the pivot, p, s } captured at drag start
const scaleAnchor = new THREE.Vector3();
// centre of an object's body, measured in its own space so it does not shift when the object turns
export function objCentre(o) {
  o.root.updateWorldMatrix(true, true);
  const inv = o.root.matrixWorld.clone().invert(), all = new THREE.Box3(), b = new THREE.Box3(), m = new THREE.Matrix4();
  for (const mesh of o.meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    all.union(b.copy(mesh.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld)));
  }
  return all.isEmpty() ? o.root.position.clone() : all.getCenter(new THREE.Vector3()).applyMatrix4(o.root.matrixWorld);
}
// the single selected object whose sides can be pulled separately (the scale gizmo then turns along with it)
function stretchTarget() { const s = state.selected; return s?.kind === 'obj' && canStretch(s.obj) ? s.obj : null; }
// called every frame, so the gizmo stays centred when a value is typed or the object changes shape
export function placePivot() {
  const objs = selObjs();
  if (!objs.length || gizmoDragging()) return;
  pivot.position.set(0, 0, 0);
  objs.forEach((o) => pivot.position.add(objCentre(o)));
  pivot.position.divideScalar(objs.length);
  const st = state.tool === 'scale' && stretchTarget();
  if (st) pivot.quaternion.copy(st.root.quaternion); else pivot.quaternion.identity();
  pivot.scale.set(1, 1, 1);
  pivot.updateMatrixWorld(true);
}
export function selectMany(objs) {
  objs = [...new Set(objs)].filter((o) => !o.hidden && state.objects.includes(o));
  if (state.mode === 'edit' && !(objs.length === 1 && objs[0] === state.editing)) exitEdit({ restoreView: false });
  if (!objs.length) { deselect(); return; }
  if (objs.length === 1) { selectObject(objs[0]); return; }
  state.selected = { kind: 'multi', objs };
  updateGizmo();
  renderObjectList(); renderContext();
}
export function toggleInSelection(o) {
  const cur = selObjs();
  selectMany(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
}
// TransformControls rebuilds scale every frame as start × factor on the dragged axes only (the others reset to start),
// so the uniform value must be read relative to the drag-start scale, not the previous frame.
export let scaleStart = 1;
export function uniformScale(s) {
  return [s.x, s.y, s.z].reduce((a, b) => (Math.abs(b - scaleStart) > Math.abs(a - scaleStart) ? b : a), scaleStart);
}
function onDragStart(e) {
  const obj = e.target.object;
  if (!obj) return;
  scaleStart = obj.scale.x;
  if (obj !== pivot) return;
  pivot.updateMatrixWorld(true);
  const inv = pivot.matrixWorld.clone().invert(), objs = selObjs();
  groupRel.clear();
  scaleAnchor.set(0, 0, 0);
  for (const o of objs) {
    o.root.updateMatrixWorld(true);
    groupRel.set(o, { rel: inv.clone().multiply(o.root.matrixWorld), p: o.root.position.clone(), s: o.root.scale.clone() });
    scaleAnchor.add(o.root.position);
  }
  // scaling grows from the base (a single object) or the floor (several), so nothing sinks through the floor
  scaleAnchor.divideScalar(objs.length);
  if (objs.length > 1) scaleAnchor.y = 0;
}
for (const c of [tc, rc]) c.addEventListener('mouseDown', onDragStart);
export function applyGroupTransform() {
  if (tc.mode === 'scale') {
    if (tc.axis?.length === 1) {   // one side of a single object
      const k = tc.axis.toLowerCase();
      for (const [o, { s }] of groupRel) {
        const v = THREE.MathUtils.clamp(s[k] * pivot.scale[k], ...scaleRange(o));
        o.root.scale[k] = v;
        pivot.scale[k] = v / s[k];
      }
      return;
    }
    // uniform scale, clamped so every object stays within its type's range
    let lo = 0, hi = Infinity;
    for (const [o, { s }] of groupRel) { const [a, b] = scaleLimits(o, s); lo = Math.max(lo, a); hi = Math.min(hi, b); }
    const f = THREE.MathUtils.clamp(uniformScale(pivot.scale), lo, hi);
    pivot.scale.setScalar(f);
    for (const [o, { p, s }] of groupRel) {
      o.root.position.copy(p).sub(scaleAnchor).multiplyScalar(f).add(scaleAnchor);
      o.root.scale.copy(s).multiplyScalar(f);
    }
    return;
  }
  pivot.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  for (const [o, { rel, s }] of groupRel) {
    m.multiplyMatrices(pivot.matrixWorld, rel);
    m.decompose(o.root.position, o.root.quaternion, o.root.scale);
    o.root.scale.copy(s);
  }
}
export function selectObject(o) {
  if (state.mode === 'edit') {
    if (o === state.editing) return;
    exitEdit({ restoreView: false });   // no jump of the view while clicking another object
  }
  state.selected = { kind: 'obj', obj: o };
  updateGizmo();
  renderObjectList(); renderContext();
}
export function selectCamera() {
  if (state.mode === 'edit') exitEdit();
  state.selected = { kind: 'camera' };
  updateGizmo();
  renderObjectList(); renderContext();
}
export function deselect() {
  if (state.mode === 'edit') exitEdit();
  state.selected = null;
  detachGizmo();
  renderObjectList(); renderContext();
}
export let overviewView = null;   // editor camera before entering edit mode
export function setOverviewView(v) { overviewView = v; }
export function enterEdit(o) {
  if (!o || o.hidden || !TYPES[o.type].poseable) return;
  if (state.editing === o) return;
  if (state.mode === 'edit') exitEdit();
  state.selected = { kind: 'obj', obj: o };
  state.mode = 'edit';
  state.editing = o;
  showTab('scene');
  state.joint = null;
  updateGizmo();
  showHandles();
  applyDim(true);
  overviewView = { pos: editCam.position.clone(), target: orbit.target.clone() };   // restored on exit
  const c = new THREE.Vector3();
  o.joints.chest.getWorldPosition(c);
  const offset = editCam.position.clone().sub(orbit.target).setLength(2.6 * o.root.scale.x + 0.6);
  orbit.target.copy(c);
  editCam.position.copy(c).add(offset);
  updateModeBadge(); renderObjectList(); renderContext();
}
export function exitEdit({ restoreView = true } = {}) {
  const o = state.editing;
  if (!o) return;
  o.handles.forEach((h) => { h.visible = false; h.material.color.set('#ff9f43'); });
  applyDim(false);
  if (overviewView && restoreView) { editCam.position.copy(overviewView.pos); orbit.target.copy(overviewView.target); orbit.update(); }
  overviewView = null;
  state.mode = 'compose';
  state.editing = null;
  state.joint = null;
  detachGizmo();
  updateModeBadge();
  selectObject(o);
}
export function selectJoint(name, dot = null) {
  state.joint = name;
  activeDot = dot;
  showHandles();
  updateGizmo();
  renderContext();
}
export function setTool(t) {
  state.tool = t;
  if (state.joint) selectJoint(null);   // editing a posture: back to the whole puppet
  updateGizmo();
  renderContext();
}
export function updateModeBadge() {
  document.body.classList.toggle('editing', state.mode === 'edit' && !state.cameraView);
  renderHelp();
}

const TRACKPAD_KEYS = [['Two fingers', 'zoom'], ['Ctrl + Two fingers', 'orbit'], ['Shift + Two fingers', 'pan']];
const EASY_KEYS = [['Left mouse', 'drag on empty space: orbit'], ['Right mouse', 'drag: pan'], ['Wheel', 'zoom'], ...TRACKPAD_KEYS];
const PRO_KEYS = [['Middle mouse', 'drag: orbit'], ['Shift + Middle mouse', 'drag: pan'], ['Wheel', 'zoom'], ...TRACKPAD_KEYS];
/* Help: a "?" button in the viewport corner that opens the shortcuts and an explanation for the current mode */
export function renderHelp() {
  const easy = document.body.classList.contains('nav-easy');
  const rows = (list) => `<dl>${list.map(([k, t]) => `<dt>${inputIcon(k)}${k.split(' + ').map((x) => `<kbd>${x}</kbd>`).join(' + ')}</dt><dd>${t}</dd>`).join('')}</dl>`;
  const nav = rows(easy ? EASY_KEYS : PRO_KEYS);
  const html = state.mode === 'edit'
    ? `<h3>Edit mode — ${esc(state.editing.details.name)}</h3>
       <p>Change the posture: ${easy ? 'pull an orange dot or a body part' : 'click a joint (orange dot) or a body part and drag the rings to rotate it'}, or pick a preset. Everything else keeps working; click another object or empty space to stop.</p>
       <h4>Keys</h4>${rows([...(easy ? [['Drag', 'a dot to turn what it hangs from (the elbow swings the upper arm), or a body part']] : []), ['Click', 'select a joint; anything else: stop editing'], ['Ctrl + Z', 'undo'], ['Ctrl + Y', 'redo'], ['Esc', 'deselect the joint, press again to finish']])}
       <h4>View</h4>${nav}`
    : `<h3>Compose mode</h3>
       <button id="btnTutorial">Start the tutorial</button>
       <p>Arrange the objects and the shot camera. Spatial relations (left of, in front of, between…) are read from the camera's point of view on the grid and become prompt tuples in the Export window. Nothing is decided for you: every tuple can be switched off or overridden.</p>
       <p>With nothing selected the panel on the right edits the final image (visual style). The Environment tab edits the labels, background, floor and walls. Select an object or the camera to edit it, or type exact values.</p>
       <h4>Selecting</h4>${rows([['Click', 'select an object or the camera; a name above an object: change it'], [easy ? 'Shift + Drag' : 'Drag', 'box-select on empty space'], ['Shift + Click', 'add to the selection'], ['Ctrl + Click', 'toggle one object'], ['Ctrl + A', 'select all objects'], ['Esc', 'deselect']])}
       <h4>Transform</h4>${rows([['W', 'move and rotate (also R): drag an arrow or a ring'], ['Drag', 'an object to slide it over the floor'], ['← ↑ ↓ →', 'move over the floor, 0.5 m per press (smaller steps when scaled down)'], ['K', 'scale: the orange handle keeps the proportions, a coloured box stretches one side'], ['Drag X / Y / Z', 'in the panel to scrub a value (Shift = finer)']])}
       <h4>Standard views</h4>${rows([['1', 'front'], ['2', 'back'], ['3', 'left'], ['4', 'right'], ['5', 'above']])}
       <h4>Objects</h4>${rows([['A', 'open the add menu'], ['N', 'show or hide object names'], ['Enter', 'change the posture of a puppet (also double-click)'], ['Ctrl + C', 'copy'], ['Ctrl + X', 'cut'], ['Ctrl + V', 'paste'], ['Ctrl + D', 'duplicate'], ['Del', 'delete']])}
       <h4>History</h4>${rows([['Ctrl + Z', 'undo'], ['Ctrl + Y', 'redo (also Ctrl + Shift + Z)']])}
       <h4>View</h4>${nav}
       <h4>File</h4>${rows([['Ctrl + S', 'save the scene as a .json file'], ['Ctrl + O', 'open a scene file (or drop it on the page)'], ['Drop', 'JPG / PNG files on the page to add them as images']])}`;
  $('#helpPanel').innerHTML = html + `<p class="foot">Press <kbd>?</kbd> to open or close this panel.</p>`;
}
export function toggleHelp(open = $('#helpPanel').hidden) {
  $('#helpPanel').hidden = !open;
  $('#btnHelp').classList.toggle('active', open);
  $('#btnHelp').setAttribute('aria-expanded', open);
}
$('#btnHelp').addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(); });
document.addEventListener('pointerdown', (e) => { if (!$('#helpPanel').hidden && !e.target.closest('#help')) toggleHelp(false); });

// dragging up or down: objects stick to the floor when they come close to it
const FLOOR_SNAP = 0.12;
// an upright object stands on its origin; a tilted one rests on its lowest point
function bottomOf(o) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(o.root.quaternion);
  if (up.y > 0.999) return o.root.position.y;
  o.root.updateMatrixWorld(true);
  const b = new THREE.Box3();
  o.meshes.forEach((m) => b.expandByObject(m, true));
  return b.min.y;
}
function snapToFloor() {
  if (tc.mode !== 'translate' || !tc.axis?.includes('Y')) return;
  const objs = selObjs();
  const low = Math.min(...objs.map(bottomOf));
  if (Math.abs(low) >= FLOOR_SNAP) return;
  objs.forEach((o) => { o.root.position.y -= low; });
  pivot.position.y -= low;
}
export function onGizmoChange(e) {
  const obj = e.target.object;
  if (!obj) return;
  if (obj === pivot) { applyGroupTransform(); snapToFloor(); }
  markDirty();
  syncTransformInputs();
}

// picking
export const ndc = new THREE.Vector2();
export function rayFrom(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, editCam);
}
export function pickCompose(e) {
  rayFrom(e);
  const targets = state.objects.filter((o) => !o.hidden).flatMap((o) => o.meshes).concat(camModel.children);
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit) return null;
  if (hit.object.userData.isCamera) return { camera: true, point: hit.point };
  return { point: hit.point, obj: state.objects.find((o) => o.id === hit.object.userData.objId) };
}
// the joint dot under the pointer (they are drawn on top of everything), and the joint it turns
export function pickDot(e) {
  rayFrom(e);
  return raycaster.intersectObjects(state.editing.handles.filter((h) => h.visible), false)[0]?.object || null;
}
export function pickHandle(e) {
  return pickDot(e)?.userData[easyNav() ? 'pulls' : 'handle'] || null;
}
export function pickJoint(e) {
  const h = pickHandle(e);
  if (h) return h;
  const o = state.editing;
  const m = raycaster.intersectObjects(o.meshes, false)[0];
  return m ? m.object.userData.joint : null;
}
// in edit mode the joint dots lie on top of the gizmo: they win
let lastMove = null;
renderer.domElement.addEventListener('pointermove', (e) => { lastMove = e; }, true);
renderer.domElement.addEventListener('pointerdown', (e) => { lastMove = e; }, true);
setGizmoBlocker(() => state.mode === 'edit' && !state.joint && !!lastMove && !!pickHandle(lastMove));
export let downPos = null;
// Box select (Compose mode): left-drag on empty space draws a rectangle; every doll it touches gets selected.
// Shift adds to the current selection (drag or click), Ctrl/Cmd-click toggles one doll.
export let box = null;   // { x0, y0, add } while a box drag may start
export const boxEl = document.createElement('div');
boxEl.id = 'selBox';
vp.appendChild(boxEl);
renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = [e.clientX, e.clientY];
  box = null;
  if (e.button !== 0 || state.cameraView || gizmoHot()) return;
  if (document.body.classList.contains('nav-easy') && !e.shiftKey) return;   // dragging orbits there
  if ((state.mode === 'edit' && pickHandle(e)) || pickCompose(e)) return;   // starting on a doll or the camera = a click, not a box
  box = { x0: e.clientX, y0: e.clientY, add: e.shiftKey };
});
window.addEventListener('pointermove', (e) => {
  if (!box || !(e.buttons & 1)) return;
  if (Math.hypot(e.clientX - box.x0, e.clientY - box.y0) <= 4) return;
  const r = vp.getBoundingClientRect();
  const x = Math.min(e.clientX, box.x0) - r.left, y = Math.min(e.clientY, box.y0) - r.top;
  Object.assign(boxEl.style, { display: 'block', left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - box.x0) + 'px', height: Math.abs(e.clientY - box.y0) + 'px' });
});
export function objsInBox(x0, y0, x1, y1) {
  const r = renderer.domElement.getBoundingClientRect();
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  const bb = new THREE.Box3(), v = new THREE.Vector3();
  return state.objects.filter((o) => {
    if (o.hidden) return false;
    bb.setFromObject(o.root);
    // screen-space rectangle of the doll's bounding box
    let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity, front = false;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(editCam);
      if (v.z < 1) front = true;
      const px = r.left + (v.x + 1) / 2 * r.width, py = r.top + (1 - v.y) / 2 * r.height;
      sx0 = Math.min(sx0, px); sx1 = Math.max(sx1, px); sy0 = Math.min(sy0, py); sy1 = Math.max(sy1, py);
    }
    return front && sx1 >= minX && sx0 <= maxX && sy1 >= minY && sy0 <= maxY;
  });
}
window.addEventListener('pointerup', (e) => {
  if (!box) return;
  const b = box; box = null;
  const dragged = boxEl.style.display === 'block';
  boxEl.style.display = 'none';
  if (!dragged || e.button !== 0) return;
  const hits = objsInBox(b.x0, b.y0, e.clientX, e.clientY);
  selectMany(b.add ? [...selObjs(), ...hits] : hits);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos || e.button !== 0) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 4;
  downPos = null;
  if (moved || e.onName || state.cameraView || gizmoDragging() || gizmoHot()) return;
  const joint = state.mode === 'edit' && pickJoint(e);
  if (joint) { selectJoint(joint); return; }   // anything else leaves edit mode
  const hit = pickCompose(e);
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  if (!hit) { if (!add) deselect(); }
  else if (hit.camera) selectCamera();
  else if (add) toggleInSelection(hit.obj);
  else selectObject(hit.obj);
});
renderer.domElement.addEventListener('dblclick', (e) => {
  if (state.cameraView) return;
  if (state.mode === 'edit' && pickJoint(e)) return;
  const hit = pickCompose(e);
  // the gizmo covers much of a selected puppet: near it counts as on it
  const sel = !hit && state.selected?.kind === 'obj' && state.selected.obj;
  const near = sel && objsInBox(e.clientX, e.clientY, e.clientX, e.clientY).includes(sel) ? sel : null;
  if (hit?.obj || near) enterEdit(hit?.obj || near);
});

// gizmo drags (the gizmo itself is created in scene.js)
for (const c of [tc, rc]) c.addEventListener('objectChange', onGizmoChange);
