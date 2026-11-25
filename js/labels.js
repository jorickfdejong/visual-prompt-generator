import * as THREE from 'three';
import { $, state } from './state.js';
import { editCam, renderer, vp } from './scene.js';
import { hovered } from './hover.js';
import { selectObject, selObjs } from './selection.js';
import { detailList } from './details.js';
import { renderContext, renderObjectList, setName } from './left-panel.js';
import { namingObject } from './naming.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   OBJECT NAMES (selected objects: also their details) — HTML labels above the objects in the editor view (so never in the exported image)
   ===================================================================== */
const layer = document.createElement('div');
layer.id = 'nameLayer';
vp.appendChild(layer);
const els = new Map();   // object -> label element
const bb = new THREE.Box3(), v = new THREE.Vector3();

const GAP = 12;   // CSS px between the head and the label
const HEAD = { y: 0.12, r: 0.125 };   // head of the mannequin, in its joint
// screen position of the top of a puppet's head, or of the top of any other object
export function headTop(o, w, h) {
  let r = 0;
  if (o.joints?.head) {
    v.set(0, HEAD.y, 0);
    o.joints.head.updateWorldMatrix(true, false);
    o.joints.head.localToWorld(v);
    const depth = v.distanceTo(editCam.position);
    r = HEAD.r * o.root.scale.y / (depth * Math.tan(editCam.fov * Math.PI / 360)) * h / 2;
  } else {
    bb.setFromObject(o.root);
    v.set((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
  }
  v.project(editCam);
  return v.z > 1 || v.z < -1 ? null : { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h - r };
}
// type the name in the label itself (right after adding an object, or by clicking the name)
let naming = null;   // { o, input }
export function startNaming(o) {
  const input = document.createElement('input');
  input.type = 'text'; input.value = o.details.name; input.maxLength = 40; input.spellcheck = false;
  input.setAttribute('aria-label', 'Object name');
  naming = { o, input };
  const done = (keep) => {
    if (naming?.input !== input) return;
    naming = null;
    if (!keep || !state.objects.includes(o)) return;
    setName(o, input.value);
    renderObjectList(); renderContext();
  };
  input.addEventListener('blur', () => done(true));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();   // no shortcuts while typing
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') { done(false); input.blur(); }
  });
}
// Clicking a name edits it. The labels let the pointer through, so drags that start on one (orbit, gizmo, object) still work.
const canvas = renderer.domElement;
function nameAt(e) {
  if (layer.hidden || state.cameraView || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return null;
  let found = null;
  for (const [o, el] of els) {
    const b = el.hidden || naming?.o === o ? null : el.querySelector('b');
    if (!b) continue;
    const r = b.getBoundingClientRect();
    if (e.clientX < r.left - 6 || e.clientX > r.right + 6 || e.clientY < r.top - 3 || e.clientY > r.bottom + 3) continue;
    if (!found || el.classList.contains('sel')) found = o;
  }
  return found;
}
let down = null;
vp.addEventListener('pointerdown', (e) => { down = e.target === canvas && e.button === 0 ? { x: e.clientX, y: e.clientY, o: nameAt(e) } : null; }, true);
vp.addEventListener('pointerup', (e) => {
  const d = down; down = null;
  if (!d?.o || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 || nameAt(e) !== d.o) return;
  e.onName = true;   // selection.js leaves this click alone
  if (!selObjs().includes(d.o)) selectObject(d.o);
  startNaming(d.o);
}, true);
canvas.addEventListener('pointermove', (e) => { canvas.classList.toggle('over-name', !e.buttons && !!nameAt(e)); });
export function toggleNames() {
  state.settings.showNames = !state.settings.showNames;
  markDirty();
}
export function updateLabels() {
  const on = !!state.settings.showNames && !state.cameraView;
  $('#btnNames').classList.toggle('active', !!state.settings.showNames);
  $('#btnNames').setAttribute('aria-pressed', !!state.settings.showNames);
  const hov = hovered();
  const sel = state.cameraView ? [] : selObjs();
  layer.hidden = !on && !hov && !sel.length;
  for (const [o, el] of els) if (!state.objects.includes(o)) { el.remove(); els.delete(o); }
  if (layer.hidden) return;
  const w = vp.clientWidth, h = vp.clientHeight, vr = vp.getBoundingClientRect(), ir = $('#inset').getBoundingClientRect();
  for (const o of state.objects) {
    let el = els.get(o);
    if (!el) { el = document.createElement('div'); layer.appendChild(el); els.set(o, el); }
    const selected = sel.includes(o);
    el.hidden = (!on && o !== hov && !selected) || o.hidden || o === namingObject();
    if (el.hidden) continue;
    const top = headTop(o, w, h);
    el.hidden = !top || (!selected && top.x > ir.left - vr.left - 20 && top.y < ir.bottom - vr.top + 20);   // under the camera preview
    if (el.hidden) continue;
    const rows = selected ? detailList(o) : [];
    const typing = naming?.o === o ? naming.input : null;
    const key = JSON.stringify([o.details.name, rows, !!typing]);
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.replaceChildren(typing || Object.assign(document.createElement('b'), { textContent: o.details.name }),
        ...rows.map(([k, t]) => Object.assign(document.createElement('span'), { textContent: `${k}: ${t}` })));
      if (typing) { typing.focus(); typing.select(); }
    }
    el.classList.toggle('hover', o === hov && !selected);
    el.classList.toggle('sel', selected);
    el.style.borderColor = o.accent;
    // the bottom edge stays GAP px above the head, so a longer list grows upwards (a selected one never leaves the view)
    let { x, y } = top;
    y -= GAP;
    if (selected) {
      const hw = el.offsetWidth / 2;
      x = THREE.MathUtils.clamp(x, hw + 6, Math.max(hw + 6, w - hw - 6));
      y = THREE.MathUtils.clamp(y, el.offsetHeight + 6, Math.max(el.offsetHeight + 6, h - 6));
    }
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }
}
