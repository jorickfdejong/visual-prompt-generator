import { $, ACCENTS, DOLL_HEIGHT, state } from './state.js';
import { scene } from './scene.js';
import { TYPES } from './types.js';
import { deselect, exitEdit, selectMany, selectObject, selObjs } from './selection.js';
import { renderContext, renderObjectList } from './left-panel.js';
import { markDirty } from './prompt-panel.js';
import { toast } from './clipboard.js';

/* =====================================================================
   OBJECTS
   ===================================================================== */
export let idCounter = 1;
export function uniqueName(base) {
  const names = new Set(state.objects.map((o) => o.details.name));
  if (!names.has(base)) return base;
  // "doll1" → "doll2", "chair" → "chair2": count up the trailing number instead of appending one
  const m = base.match(/^(.*?)(\d+)$/);
  const stem = m ? m[1] : base;
  let i = m ? +m[2] + 1 : 2;
  while (names.has(stem + i)) i++;
  return stem + i;
}
export function nextName(base = 'doll') {
  let i = 1;
  const names = new Set(state.objects.map((o) => o.details.name));
  while (names.has(base + i)) i++;
  return base + i;
}
export function scaleRange(o) { return TYPES[o.type].scaleRange || [0.3, 3]; }
export function objHeight(o) { return (TYPES[o.type].height?.(o) ?? DOLL_HEIGHT) * o.root.scale.x; }
export function freeSpot() {
  // side by side along x first (0, 1, -1, 2, -2, …), then further rows back
  const taken = state.objects.map((o) => o.root.position);
  for (const z of [0, -1, -2, 1]) for (let i = 0; i < 13; i++) {
    const x = i % 2 ? (i + 1) / 2 : -i / 2;
    if (!taken.some((p) => Math.hypot(p.x - x, p.z - z) < 0.6)) return [x, 0, z];
  }
  return [0, 0, 0];
}

export function addObject(type, data = {}) {
  const T = TYPES[type];
  const accent = data.accent || ACCENTS[state.objects.length % ACCENTS.length];
  const parts = T.create(accent);
  const obj = { id: data.id || 'o' + Date.now().toString(36) + (idCounter++), type, accent, hidden: !!data.hidden, details: { ...T.defaultDetails(), ...(data.details || {}) }, ...parts };
  obj.details.custom = (obj.details.custom || []).map((c) => ({ ...c }));
  if (!obj.details.name) obj.details.name = nextName(T.baseName);
  obj.meshes.forEach((m) => { m.userData.objId = obj.id; });
  obj.root.position.set(...(data.pos || freeSpot()));
  if (data.quat) obj.root.quaternion.set(...data.quat);
  obj.root.scale.setScalar(data.scale || 1);
  obj.root.userData.prevS = data.scale || 1;
  obj.root.visible = !obj.hidden;
  T.applyExtra(obj, data);
  scene.add(obj.root);
  state.objects.push(obj);
  return obj;
}
export function serializeObject(o) {
  return {
    id: o.id, type: o.type, accent: o.accent, hidden: o.hidden,
    details: JSON.parse(JSON.stringify(o.details)),
    pos: o.root.position.toArray().map((v) => +v.toFixed(4)),
    quat: o.root.quaternion.toArray().map((v) => +v.toFixed(5)),
    scale: +o.root.scale.x.toFixed(3),
    ...TYPES[o.type].serializeExtra(o),
  };
}
export function removeObject(o) {
  if (state.editing === o) exitEdit();
  if (state.selected?.obj === o) deselect();
  else if (state.selected?.kind === 'multi' && state.selected.objs.includes(o)) {
    state.objects = state.objects.filter((x) => x !== o);   // so selectMany drops it
    selectMany(state.selected.objs.filter((x) => x !== o));
  }
  scene.remove(o.root);
  o.mats.forEach((m) => m.dispose());
  o.handles.forEach((h) => h.material.dispose());
  o.parts?.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });   // image cards own their geometry
  state.objects = state.objects.filter((x) => x !== o);
  renderObjectList(); renderContext(); markDirty();
}
export function duplicateObject(o, select = true) {
  const d = serializeObject(o);
  delete d.id; delete d.accent;
  d.details.name = uniqueName(o.details.name);
  d.pos = [d.pos[0] + 1, d.pos[1], d.pos[2]];
  const n = addObject(o.type, d);
  if (select) selectObject(n);
  renderObjectList(); markDirty();
  return n;
}
export function duplicateSelection() {
  const objs = selObjs();
  if (objs.length === 1) duplicateObject(objs[0]);
  else if (objs.length > 1) selectMany(objs.map((o) => duplicateObject(o, false)));
}
export function deleteSelection() { [...selObjs()].forEach(removeObject); }

// copy / paste (internal clipboard; each paste lands one cell further along X)
export let clip = null, pasteCount = 0;
export function copySelection() {
  const objs = selObjs();
  if (!objs.length) return false;
  clip = objs.map(serializeObject);
  pasteCount = 0;
  toast(objs.length === 1 ? `Copied “${objs[0].details.name}”` : `Copied ${objs.length} objects`);
  return true;
}
export function cutSelection() { if (copySelection()) deleteSelection(); }
export function pasteClipboard() {
  if (!clip?.length) { toast('Nothing to paste: select an object and press Ctrl+C first'); return; }
  pasteCount++;
  const step = Math.max(state.settings.cell, 0.5) * 2 * pasteCount;
  const made = clip.filter((d) => TYPES[d.type]).map((src) => {
    const d = JSON.parse(JSON.stringify(src));
    delete d.id; delete d.accent;
    d.hidden = false;
    d.details.name = uniqueName(d.details.name);
    d.pos = [d.pos[0] + step, d.pos[1], d.pos[2]];
    return addObject(d.type, d);
  });
  selectMany(made);
  renderObjectList(); markDirty();
}
