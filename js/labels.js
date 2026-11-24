import * as THREE from 'three';
import { $, state } from './state.js';
import { editCam, vp } from './scene.js';
import { hovered } from './hover.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   OBJECT NAMES — HTML labels above the objects in the editor view (so never in the exported image)
   ===================================================================== */
const layer = document.createElement('div');
layer.id = 'nameLayer';
vp.appendChild(layer);
const els = new Map();   // object -> label element
const bb = new THREE.Box3(), v = new THREE.Vector3();

export function toggleNames() {
  state.settings.showNames = !state.settings.showNames;
  markDirty();
}
export function updateLabels() {
  const on = !!state.settings.showNames && !state.cameraView;
  $('#btnNames').classList.toggle('active', !!state.settings.showNames);
  $('#btnNames').setAttribute('aria-pressed', !!state.settings.showNames);
  const hov = hovered();
  layer.hidden = !on && !hov;
  for (const [o, el] of els) if (!state.objects.includes(o)) { el.remove(); els.delete(o); }
  if (layer.hidden) return;
  const w = vp.clientWidth, h = vp.clientHeight, vr = vp.getBoundingClientRect(), ir = $('#inset').getBoundingClientRect();
  for (const o of state.objects) {
    let el = els.get(o);
    if (!el) { el = document.createElement('div'); layer.appendChild(el); els.set(o, el); }
    bb.setFromObject(o.root);
    v.set((bb.min.x + bb.max.x) / 2, bb.max.y + 0.08, (bb.min.z + bb.max.z) / 2).project(editCam);
    const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
    const underInset = x > ir.left - vr.left - 20 && y < ir.bottom - vr.top + 20;
    el.hidden = (!on && o !== hov) || o.hidden || v.z > 1 || v.z < -1 || underInset;
    if (el.hidden) continue;
    if (el.textContent !== o.details.name) el.textContent = o.details.name;
    el.classList.toggle('hover', o === hov);
    el.style.borderColor = o.accent;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }
}
