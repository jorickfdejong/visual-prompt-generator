import { $, ENV_DEFAULT, state, STORE_SCENE } from './state.js';
import { editCam, floor, orbit, scene } from './scene.js';
import { imageStore } from './images.js';
import { applyRoom, rebuildGrid, ROOM_DEFAULT } from './room.js';
import { applyCamera, resetCamera, shotCam } from './camera.js';
import { TYPES } from './types.js';
import { addObject, serializeObject } from './objects.js';
import { deselect, enterEdit, exitEdit, overviewView, selectCamera, selectJoint, selectMany, selObjs, setOverviewView } from './selection.js';
import { renderContext, renderObjectList, renderWorldPanel } from './left-panel.js';
import { flushPendingSave, markDirty, renderIncludes } from './prompt-panel.js';
import { toast } from './clipboard.js';

/* =====================================================================
   PERSISTENCE
   ===================================================================== */
// images used by objects and room surfaces (left out of undo snapshots: the store keeps them for the session)
export function usedImages() {
  const R = state.settings.room, ids = new Set(state.objects.map((o) => o.imageId).filter(Boolean));
  for (const c of [R.floor, R.walls]) if (c.pattern === 'image' && c.imageId) ids.add(c.imageId);
  return Object.fromEntries([...ids].filter((id) => imageStore[id]).map((id) => [id, imageStore[id]]));
}
export function serializeScene({ images = true } = {}) {
  return {
    v: 1,
    ...(images ? { images: usedImages() } : {}),
    name: state.fileName || '',
    objects: state.objects.map(serializeObject),
    camera: { pos: shotCam.position.toArray(), quat: shotCam.quaternion.toArray(), focal: state.camera.focal, aspect: state.camera.aspect },
    notes: state.notes,
    environment: { ...state.environment },
    visualStyle: state.visualStyle,
    settings: JSON.parse(JSON.stringify(state.settings)),
    overrides: JSON.parse(JSON.stringify(state.overrides)),
    custom: JSON.parse(JSON.stringify(state.custom)),
  };
}
export function clearScene() {
  if (state.mode === 'edit') exitEdit();
  deselect();
  [...state.objects].forEach((o) => { scene.remove(o.root); o.mats.forEach((m) => m.dispose()); });
  state.objects = [];
}
export function deserializeScene(s) {
  clearScene();
  state.camera = { focal: s.camera?.focal ?? 35, aspect: s.camera?.aspect ?? '16:9' };
  if (s.camera?.pos) { shotCam.position.fromArray(s.camera.pos); shotCam.quaternion.fromArray(s.camera.quat); } else resetCamera();
  state.fileName = s.name || ''; renderSceneName();
  state.notes = s.notes || '';
  if (s.images) Object.assign(imageStore, s.images);
  const room = ROOM_DEFAULT(), sr = s.settings?.room || {};
  const fam = { ...(s.settings?.families || {}) };
  // older scenes had one switch for each of these pairs
  for (const [from, to] of [['size', 'sizeRel'], ['facing', 'facingRel']]) if (from in fam && !(to in fam)) fam[to] = fam[from];
  state.settings = {
    ...state.settings, reference: 'clay', ...(s.settings || {}),
    families: { ...state.settings.families, ...fam },
    room: { ...room, ...sr, floor: { ...room.floor, ...(sr.floor || {}) }, walls: { ...room.walls, ...(sr.walls || {}) }, light: { ...room.light, ...(sr.light && 'shadows' in sr.light ? { shadows: sr.light.shadows } : {}) } },
  };
  delete state.settings.snap;   // the snap setting no longer exists
  state.environment = { ...ENV_DEFAULT(), ...(s.environment || {}) };
  state.visualStyle = s.visualStyle ?? state.environment.visualStyle ?? '';
  delete state.environment.visualStyle;   // it was an environment label for a short while
  state.overrides = s.overrides || {};
  state.custom = s.custom || [];
  for (const o of s.objects || []) if (TYPES[o.type]) addObject(o.type, o);
  syncSettingsUI();
  applyCamera(); rebuildGrid(); applyRoom(); renderWorldPanel();
  renderObjectList(); renderContext(); renderIncludes();
  markDirty(true);
}
export function syncSettingsUI() {
  $('#notes').value = state.notes;
  $('#visualStyle').value = state.visualStyle;
  $('#format').value = state.settings.format || 'both';
  $('#reference').value = state.settings.reference || 'clay';
}
export let warnedImgStore = false;
export function saveScene() {
  try { sessionStorage.setItem(STORE_SCENE, JSON.stringify(serializeScene())); return; } catch { /* probably too big with the images */ }
  try {
    sessionStorage.setItem(STORE_SCENE, JSON.stringify(serializeScene({ images: false })));
    if (!warnedImgStore) { warnedImgStore = true; toast('Images are too big to autosave: save the scene to a file (Ctrl S) to keep them'); }
  } catch { toast('Could not autosave: browser storage is full or blocked'); }
}

/* ---------- undo / redo: whole-scene snapshots ---------- */
export const HISTORY_MAX = 100;
export const undoHist = { stack: [], idx: -1 };
export function commitHistory() {
  const snap = JSON.stringify(serializeScene({ images: false }));
  if (snap === undoHist.stack[undoHist.idx]) return;
  undoHist.stack.length = undoHist.idx + 1;          // drop the redo branch
  undoHist.stack.push(snap);
  if (undoHist.stack.length > HISTORY_MAX) undoHist.stack.shift();
  undoHist.idx = undoHist.stack.length - 1;
}
export function stepHistory(dir) {
  flushPendingSave();   // keep a pending change
  const to = undoHist.idx + dir;
  if (to < 0 || to >= undoHist.stack.length) { toast(dir < 0 ? 'Nothing to undo' : 'Nothing to redo'); return; }
  undoHist.idx = to;
  restoreSnapshot(JSON.parse(undoHist.stack[to]));
  toast(dir < 0 ? 'Undo' : 'Redo');
}
export function restoreSnapshot(snap) {
  // remember what was selected / being edited (by id) and where the view was
  const editId = state.editing?.id, joint = state.joint;
  const selIds = selObjs().map((o) => o.id), camSel = state.selected?.kind === 'camera';
  const view = { pos: editCam.position.clone(), target: orbit.target.clone() };
  const overview = overviewView && { pos: overviewView.pos.clone(), target: overviewView.target.clone() };
  deserializeScene(snap);
  const byId = (id) => state.objects.find((o) => o.id === id);
  const ed = editId && byId(editId);
  if (ed && !ed.hidden) {
    enterEdit(ed);
    if (overview) setOverviewView(overview);
    editCam.position.copy(view.pos); orbit.target.copy(view.target); orbit.update();
    if (joint && ed.joints[joint]) selectJoint(joint);
  } else {
    if (editId) { editCam.position.copy(overview?.pos || view.pos); orbit.target.copy(overview?.target || view.target); orbit.update(); }
    else { editCam.position.copy(view.pos); orbit.target.copy(view.target); orbit.update(); }
    if (camSel) selectCamera();
    else selectMany(selIds.map(byId).filter(Boolean));
  }
}

export function loadStored(key) {
  try {
    let s = sessionStorage.getItem(key);
    if (!s) {   // one-time move from the old shared slot, so the first tab keeps the existing scene
      s = localStorage.getItem(key);
      if (s) localStorage.removeItem(key);
    }
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
// scene name shown in the File pill and the browser tab
export function renderSceneName() {
  $('#sceneName').textContent = state.fileName || 'Untitled';
  $('#sceneName').classList.toggle('untitled', !state.fileName);
  document.title = state.fileName || 'Untitled';   // browser tab shows just the scene name
}
