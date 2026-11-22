import * as THREE from 'three';
import { $, DEG, state } from './state.js';
import { editCam, floor, orbit, raycaster, renderer, scene, tc, vp } from './scene.js';
import { grid } from './room.js';
import { camModel, shotCam } from './camera.js';
import { TYPES } from './types.js';
import { scaleRange } from './objects.js';
import { esc, renderContext, renderObjectList, setTab, syncTransformInputs } from './left-panel.js';
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
export function configureGizmo(target) {
  const snap = state.settings.snap;
  if (target === 'joint') {
    tc.setMode('rotate'); tc.setSpace('local');
    tc.setRotationSnap(snap ? 15 * DEG : null); tc.setTranslationSnap(null); tc.setScaleSnap(null);
  } else if (target === 'camera') {
    if (state.tool === 'scale') state.tool = 'translate';
    tc.setMode(state.tool); tc.setSpace(state.tool === 'rotate' ? 'local' : 'world');
    tc.setRotationSnap(null); tc.setTranslationSnap(null);
  } else {
    tc.setMode(state.tool); tc.setSpace('world');
    tc.setTranslationSnap(snap ? state.settings.cell : null);
    tc.setRotationSnap(snap ? 15 * DEG : null);
    tc.setScaleSnap(snap ? 0.05 : null);
  }
}
// every selected doll, whether one ('obj') or several ('multi')
export function selObjs() {
  const s = state.selected;
  return !s ? [] : s.kind === 'multi' ? s.objs : s.kind === 'obj' ? [s.obj] : [];
}
// Multi-select: the gizmo drives an invisible pivot at the group's centre; the dolls follow it.
export const pivot = new THREE.Object3D();
scene.add(pivot);
export const groupRel = new Map();   // obj -> matrix relative to the pivot, captured at drag start
export function placePivot() {
  const objs = selObjs();
  if (!objs.length) return;
  const c = new THREE.Vector3();
  objs.forEach((o) => c.add(o.root.position));
  c.divideScalar(objs.length);
  c.y = 0;
  if (state.settings.snap) { const s = state.settings.cell; c.x = Math.round(c.x / s) * s; c.z = Math.round(c.z / s) * s; }
  pivot.position.copy(c); pivot.quaternion.identity(); pivot.scale.set(1, 1, 1);
  pivot.userData.prevS = 1;
  pivot.updateMatrixWorld(true);
}
export function selectMany(objs) {
  if (state.mode === 'edit') return;
  objs = [...new Set(objs)].filter((o) => !o.hidden && state.objects.includes(o));
  if (!objs.length) { deselect(); return; }
  if (objs.length === 1) { selectObject(objs[0]); return; }
  state.selected = { kind: 'multi', objs };
  configureGizmo('obj');
  placePivot();
  tc.attach(pivot);
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
tc.addEventListener('mouseDown', () => {
  if (tc.object) scaleStart = tc.object.scale.x;
  if (tc.object !== pivot) return;
  pivot.updateMatrixWorld(true);
  const inv = pivot.matrixWorld.clone().invert();
  groupRel.clear();
  for (const o of selObjs()) { o.root.updateMatrixWorld(true); groupRel.set(o, inv.clone().multiply(o.root.matrixWorld)); }
});
tc.addEventListener('mouseUp', () => { if (tc.object === pivot) placePivot(); });
export function applyGroupTransform() {
  if (tc.mode === 'scale') {
    // uniform scale, clamped so every object stays within its type's range
    let v = uniformScale(pivot.scale);
    let lo = 0, hi = Infinity;
    for (const [o, m] of groupRel) { const s0 = new THREE.Vector3().setFromMatrixScale(m).x, [a, b] = scaleRange(o); lo = Math.max(lo, a / s0); hi = Math.min(hi, b / s0); }
    v = THREE.MathUtils.clamp(v, lo, hi);
    pivot.scale.setScalar(v);
    pivot.userData.prevS = v;
  }
  pivot.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  for (const [o, rel] of groupRel) {
    m.multiplyMatrices(pivot.matrixWorld, rel);
    m.decompose(o.root.position, o.root.quaternion, o.root.scale);
    o.root.scale.setScalar(o.root.scale.x);
  }
}
export function selectObject(o) {
  if (state.mode === 'edit') return;
  state.selected = { kind: 'obj', obj: o };
  configureGizmo('obj');
  if (o.hidden) tc.detach(); else tc.attach(o.root);
  renderObjectList(); renderContext();
}
export function selectCamera() {
  if (state.mode === 'edit') exitEdit();
  state.selected = { kind: 'camera' };
  setTab('edit');   // camera settings live in the Edit tab
  configureGizmo('camera');
  tc.attach(shotCam);
  renderObjectList(); renderContext();
}
export function deselect() {
  state.selected = null;
  tc.detach();
  renderObjectList(); renderContext();
}
export let overviewView = null;   // editor camera before entering edit mode
export function setOverviewView(v) { overviewView = v; }
export function enterEdit(o) {
  if (!o || o.hidden || !TYPES[o.type].poseable) return;
  if (state.mode === 'edit') exitEdit();
  state.selected = { kind: 'obj', obj: o };
  state.mode = 'edit';
  state.editing = o;
  state.joint = null;
  tc.detach();
  o.handles.forEach((h) => { h.visible = true; });
  applyDim(true);
  overviewView = { pos: editCam.position.clone(), target: orbit.target.clone() };   // restored on exit
  const c = new THREE.Vector3();
  o.joints.chest.getWorldPosition(c);
  const offset = editCam.position.clone().sub(orbit.target).setLength(2.6 * o.root.scale.x + 0.6);
  orbit.target.copy(c);
  editCam.position.copy(c).add(offset);
  updateModeBadge(); renderObjectList(); renderContext();
}
export function exitEdit() {
  const o = state.editing;
  if (!o) return;
  o.handles.forEach((h) => { h.visible = false; h.material.color.set('#ff9f43'); });
  applyDim(false);
  if (overviewView) { editCam.position.copy(overviewView.pos); orbit.target.copy(overviewView.target); orbit.update(); overviewView = null; }
  state.mode = 'compose';
  state.editing = null;
  state.joint = null;
  tc.detach();
  updateModeBadge();
  selectObject(o);
}
export function selectJoint(name) {
  const o = state.editing;
  state.joint = name;
  o.handles.forEach((h) => h.material.color.set(h.userData.handle === name ? '#ffffff' : '#ff9f43'));
  if (name) { configureGizmo('joint'); tc.attach(o.joints[name]); } else tc.detach();
  renderContext();
}
export function setTool(t) {
  state.tool = t;
  if (state.mode === 'compose' && state.selected) configureGizmo(state.selected.kind === 'camera' ? 'camera' : 'obj');
  if (state.selected?.kind === 'multi') placePivot();
  renderContext();
}
export function updateModeBadge() {
  document.body.classList.toggle('editing', state.mode === 'edit' && !state.cameraView);
  renderHelp();
}

/* Help: a "?" button in the viewport corner that opens the shortcuts and an explanation for the current mode */
export function renderHelp() {
  const rows = (list) => `<dl>${list.map(([k, t]) => `<dt>${k.split(' + ').map((x) => `<kbd>${x}</kbd>`).join(' + ')}</dt><dd>${t}</dd>`).join('')}</dl>`;
  const nav = rows([['Middle mouse', 'orbit the view'], ['Shift + Middle mouse', 'pan'], ['Wheel', 'zoom']]);
  const html = state.mode === 'edit'
    ? `<h3>Edit mode — ${esc(state.editing.details.name)}</h3>
       <p>Pose the doll: click a joint (orange dot) or a body part and drag the rings to rotate it, or pick a preset. Name and details are edited in the object panel when you select it.</p>
       <h4>Keys</h4>${rows([['Click', 'select a joint'], ['Ctrl + Z', 'undo'], ['Ctrl + Y', 'redo'], ['Esc', 'deselect the joint, press again to finish']])}
       <h4>View</h4>${nav}`
    : `<h3>Compose mode</h3>
       <p>Arrange the objects and the shot camera. Spatial relations (left of, in front of, between…) are read from the camera's point of view on the grid and become prompt tuples in the Export tab. Nothing is decided for you: every tuple can be switched off or overridden.</p>
       <p>With nothing selected the panel on the right edits the world: grid, background, floor and walls. Select an object or the camera to edit it, or type exact values.</p>
       <h4>Selecting</h4>${rows([['Click', 'select an object or the camera'], ['Drag', 'box-select on empty space'], ['Shift + Click', 'add to the selection'], ['Ctrl + Click', 'toggle one object'], ['Ctrl + A', 'select all objects'], ['Esc', 'deselect']])}
       <h4>Transform</h4>${rows([['W', 'move'], ['R', 'rotate'], ['E', 'scale'], ['Drag X / Y / Z', 'in the panel to scrub a value (Shift = finer)']])}
       <h4>Objects</h4>${rows([['A', 'open the add menu'], ['Enter', 'pose a doll (also double-click)'], ['Ctrl + C', 'copy'], ['Ctrl + X', 'cut'], ['Ctrl + V', 'paste'], ['Ctrl + D', 'duplicate'], ['Del', 'delete']])}
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

export function onGizmoChange() {
  const obj = tc.object;
  if (!obj) return;
  if (obj === pivot) { applyGroupTransform(); markDirty(); syncTransformInputs(); return; }
  if (state.selected?.kind === 'obj' && obj === state.selected.obj.root && tc.mode === 'scale') {
    // keep scale uniform, measured against the drag-start scale
    const v = THREE.MathUtils.clamp(uniformScale(obj.scale), ...scaleRange(state.selected.obj));
    obj.scale.setScalar(v);
    obj.userData.prevS = v;
  }
  if (obj === shotCam) obj.scale.set(1, 1, 1);
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
  if (hit.object.userData.isCamera) return { camera: true };
  return { obj: state.objects.find((o) => o.id === hit.object.userData.objId) };
}
export function pickJoint(e) {
  rayFrom(e);
  const o = state.editing;
  const h = raycaster.intersectObjects(o.handles, false)[0];
  if (h) return h.object.userData.handle;
  const m = raycaster.intersectObjects(o.meshes, false)[0];
  return m ? m.object.userData.joint : null;
}
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
  if (e.button !== 0 || state.cameraView || state.mode !== 'compose' || (tc.object && tc.axis)) return;
  if (pickCompose(e)) return;   // starting on a doll or the camera = a click, not a box
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
  if (moved || state.cameraView || tc.dragging || (tc.object && tc.axis)) return;
  if (state.mode === 'edit') { selectJoint(pickJoint(e)); return; }
  const hit = pickCompose(e);
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  if (!hit) { if (!add) deselect(); }
  else if (hit.camera) selectCamera();
  else if (add) toggleInSelection(hit.obj);
  else selectObject(hit.obj);
});
renderer.domElement.addEventListener('dblclick', (e) => {
  if (state.cameraView || state.mode === 'edit') return;
  const hit = pickCompose(e);
  if (hit?.obj) enterEdit(hit.obj);
});

// gizmo drags (the gizmo itself is created in scene.js)
tc.addEventListener('objectChange', onGizmoChange);
