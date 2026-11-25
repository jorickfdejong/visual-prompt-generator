import * as THREE from 'three';
import { state } from './state.js';
import { gizmoDragging } from './scene.js';
import { TYPES } from './types.js';
import { commonFront } from './group.js';
import { addObject, removeObject, serializeObject, uniqueName } from './objects.js';
import { deselect, selectMany, selectObject, selObjs } from './selection.js';
import { esc, renderObjectList } from './left-panel.js';
import { exportOpen } from './export-modal.js';
import { typeWord } from './details.js';
import { requireName } from './naming.js';
import { flushPendingSave, markDirty } from './prompt-panel.js';
import { toast } from './clipboard.js';

/* =====================================================================
   GROUP / UNGROUP — Ctrl+G makes the selected objects one object (group.js), Ctrl+Shift+G brings them back
   ===================================================================== */
// why these objects cannot be grouped ('' = they can)
export function groupProblem(objs = selObjs()) {
  if (state.mode === 'edit') return 'Finish changing the posture first';
  if (objs.length < 2) return 'Select two or more objects to group them';
  const dolls = objs.filter((o) => o.type === 'mannequin').map((o) => o.details.name);
  return dolls.length ? `Dolls can’t be grouped: take ${dolls.join(', ')} out of the selection` : '';
}
// put objects at this place in the list instead of at its end
function moveTo(objs, i) {
  state.objects = state.objects.filter((o) => !objs.includes(o));
  state.objects.splice(i, 0, ...objs);
}
export function group(objs = selObjs()) {
  const problem = groupProblem(objs);
  if (problem) { toast(problem); return null; }
  flushPendingSave();   // grouping is its own undo step
  objs = state.objects.filter((o) => objs.includes(o));   // in the order of the list
  const box = new THREE.Box3();
  for (const o of objs) { o.root.updateWorldMatrix(true, true); o.meshes.forEach((m) => box.expandByObject(m, true)); }
  const at = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3()).setY(box.min.y);
  const front = commonFront(objs);   // a group faces the way its members do
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), front ? Math.atan2(...front) : 0);
  const back = turn.clone().invert();
  const members = objs.map((o) => ({
    ...serializeObject(o),
    pos: o.root.position.clone().sub(at).applyQuaternion(back).toArray(),
    quat: back.clone().multiply(o.root.quaternion).toArray(),
    scale: o.root.scale.toArray(),
  }));
  const i = state.objects.indexOf(objs[0]), accent = objs[0].accent;
  deselect();
  objs.forEach(removeObject);
  const g = addObject('group', { accent, pos: at.toArray(), quat: turn.toArray(), members });
  moveTo([g], i);
  selectObject(g);
  markDirty();
  requireName(g, { remove: ungroup, removeLabel: 'Ungroup' });
  return g;
}
// the members come back as they were, moved, turned and scaled along with the group
function release(g) {
  const i = state.objects.indexOf(g), { position, quaternion, scale } = g.root;
  removeObject(g);
  const made = g.members.filter((d) => TYPES[d.type]).map((d) => {
    const s = new THREE.Vector3().fromArray([d.scale].flat().length === 3 ? d.scale : [d.scale, d.scale, d.scale]);
    return addObject(d.type, {
      ...d,
      id: state.objects.some((o) => o.id === d.id) ? undefined : d.id,   // a copy of the group came back before
      hidden: g.hidden,
      details: { ...d.details, name: uniqueName(d.details.name) },
      pos: new THREE.Vector3().fromArray(d.pos).multiply(scale).applyQuaternion(quaternion).add(position).toArray(),
      quat: quaternion.clone().multiply(new THREE.Quaternion().fromArray(d.quat)).toArray(),
      scale: s.multiply(scale).toArray(),
    });
  });
  moveTo(made, i);
  return made;
}
export function ungroup(g) { ungroupAll([g]); }
function ungroupAll(groups) {
  groups = groups.filter((g) => g.type === 'group' && state.objects.includes(g));
  if (!groups.length) return;
  flushPendingSave();
  deselect();
  selectMany(groups.flatMap(release));
  renderObjectList(); markDirty();
}

/* ---------- in the object panel ---------- */
export function groupHTML(objs) {
  const problem = groupProblem(objs);
  return `<div class="groupBox"><button id="btnGroup" ${problem ? 'disabled aria-describedby="groupWhy"' : ''}>Group <kbd>Ctrl + G</kbd></button>
    <p class="hint" id="groupWhy">${problem ? `${esc(problem)}.` : 'Makes them one object with one name and one set of details.'}</p></div>`;
}
const memberText = (d) => esc(d.details.name) + (d.type === 'group' ? ` (group of ${d.members.length})` : d.details.name.startsWith(typeWord(d)) ? '' : ` (${typeWord(d)})`);
export function ungroupHTML(o) {
  return `<div class="groupBox"><p class="hint">Contains ${o.members.length} objects: ${o.members.filter((d) => TYPES[d.type]).map(memberText).join(', ')}. They get their own names and details back when you ungroup.</p>
    <button id="btnUngroup">Ungroup <kbd>Ctrl + Shift + G</kbd></button></div>`;
}
export function bindGrouping(el) {
  el.querySelector('#btnGroup')?.addEventListener('click', () => group());
  el.querySelector('#btnUngroup')?.addEventListener('click', () => ungroupAll(selObjs()));
}

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'g' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  e.preventDefault();   // the browser's find
  if (e.repeat || state.cameraView || exportOpen() || gizmoDragging() || document.querySelector('#navAsk')) return;
  if (document.body.matches('.placing, .naming, .dragging-obj, .scrubbing')) return;
  if (e.target.isContentEditable || e.target.closest?.('input, textarea, select, #addDrop, #fileDrop')) return;
  if (!e.shiftKey) group();
  else if (selObjs().some((o) => o.type === 'group')) ungroupAll(selObjs());
  else toast('Select a group to ungroup it');
});
