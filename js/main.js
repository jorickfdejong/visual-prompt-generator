import { $, state, STORE_SCENE } from './state.js';
import { editCam, orbit, scene } from './scene.js';
import { imageStore, importImageFile, isImageFile, pickImage } from './images.js';
import { applyCamera, enterCameraView, exitCameraView, pilot, resetCamera, shotCam } from './camera.js';
import { addObject, copySelection, cutSelection, deleteSelection, duplicateSelection, pasteClipboard, uniqueName } from './objects.js';
import { deselect, enterEdit, exitEdit, placePivot, selectCamera, selectJoint, selectMany, selectObject, selObjs, setTool, toggleHelp, updateModeBadge } from './selection.js';
import { inset, render, resize, takeScreenshot } from './rendering.js';
import { PROPS } from './props.js';
import { camel, exportText } from './relations.js';
import { renderObjectList } from './left-panel.js';
import { closeExport, exportOpen, openExport, promptText } from './export-modal.js';
import { toggleNames } from './labels.js';
import { whenNamed } from './naming.js';
import { addNamed, cancelPlacing, floorPoint, startPlacing } from './placement.js';
import './nav.js';
import './easy-drag.js';
import './pull-limb.js';
import './arrow-keys.js'; import './views.js';
import './tooltips.js'; import './enter-next.js';
import { showTab } from './side-tabs.js';
import { addCustomTuple, flushPendingSave, markDirty, refreshDerived, takeDirty } from './prompt-panel.js';
import { download, downloadAll, toast } from './clipboard.js';
import './navigation-hints.js';
import { newFileWizard } from './new-file-wizard.js';
import { matchesShortcut } from './shortcut-presets.js';
import { startTutorial, tutorialDone } from './tutorial.js';
import { commitHistory, deserializeScene, loadStored, renderSceneName, serializeScene, stepHistory, undoHist } from './persistence.js';

/* =====================================================================
   WIRING
   ===================================================================== */
$('#camRow').onclick = selectCamera;
const addOne = (type) => startPlacing(type);   // the ghost follows the pointer until it is put down
function toggleAddMenu(open = $('#addDrop').hidden) {
  $('#addDrop').hidden = !open;
  $('#btnAdd').classList.toggle('open', open);
  $('#btnAdd').setAttribute('aria-expanded', open);
  if (open) $('#addDrop [role=menuitem]').focus();
}
$('#btnAdd').addEventListener('click', (e) => { e.stopPropagation(); toggleAddMenu(); });
$('#btnAddDoll').onclick = () => { toggleAddMenu(false); addOne('mannequin'); };
// wooden toys (under the doll) and shapes; Other stays at the bottom
for (const [group, title] of [['object', ''], ['geometry', 'Geometry']]) {
  if (title) {
    const h = document.createElement('div');
    h.className = 'dropTitle'; h.textContent = title;
    $('#addOther').before(h);
  }
  for (const p of PROPS.filter((x) => x.group === group)) {
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `<svg viewBox="0 0 24 24">${p.icon}</svg>${p.label}`;
    b.onclick = () => { toggleAddMenu(false); addOne(p.type); };
    $('#addOther').before(b);
  }
}
// image card: picked from disk or dropped on the page; the file name is its id until it is named
function imageData(id) {
  const e = imageStore[id];
  const base = camel((e?.name || '').replace(/\.[^.]+$/, '')).replace(/^\d+/, '') || 'image';
  return { imageId: id, details: { name: uniqueName(base) } };
}
$('#btnAddImage').onclick = async () => {
  toggleAddMenu(false);
  const id = await pickImage();
  if (id) startPlacing('image', imageData(id));
};
document.addEventListener('pointerdown', (e) => { if (!$('#addDrop').hidden && !e.target.closest('#btnAdd, #addDrop')) toggleAddMenu(false); });
$('#focal').addEventListener('input', (e) => { state.camera.focal = +e.target.value; applyCamera(); markDirty(); });
$('#aspect').addEventListener('change', (e) => { state.camera.aspect = e.target.value; applyCamera(); markDirty(); });
$('#btnCamView').onclick = enterCameraView;
$('#btnCamReset').onclick = () => { resetCamera(); markDirty(); };
inset.onclick = enterCameraView;
$('#btnBackEditor').onclick = exitCameraView;
$('#btnEditDone').onclick = exitEdit;
$('#btnAll').onclick = downloadAll;
$('#helpPanel').addEventListener('click', (e) => { if (e.target.id === 'btnTutorial') { toggleHelp(false); startTutorial(); } });
$('#notes').addEventListener('input', (e) => { state.notes = e.target.value; markDirty(); });
$('#btnAddTuple').onclick = addCustomTuple;
$('#customTuple').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustomTuple(); });
$('#btnExport').onclick = openExport;
$('#btnCloseExport').onclick = closeExport;
$('#exportModal').addEventListener('pointerdown', (e) => { if (e.target.id === 'exportModal') closeExport(); });
$('#exportModal').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeExport(); } });
$('#format').addEventListener('change', (e) => { state.settings.format = e.target.value; markDirty(); });
function newScene() {
  // a new browser tab with its own autosave; this one keeps its scene
  const u = new URL(location.href);
  u.searchParams.set('new', '1');
  window.open(u, '_blank', 'noopener');
}
async function saveSceneFile() {
  const json = JSON.stringify(serializeScene(), null, 2);
  const suggested = (state.fileName || 'scene') + '.json';
  // Chrome / Edge: the system "Save as" dialog (pick folder + name)
  if (window.showSaveFilePicker) {
    try {
      const h = await showSaveFilePicker({ suggestedName: suggested, types: [{ description: 'Scene file', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable(); await w.write(json); await w.close();
      setSceneName(h.name);
      toast(`Saved “${h.name}”`);
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;   // user cancelled
      // otherwise (e.g. blocked in an embedded page) fall through to a plain download
    }
  }
  let name = state.fileName || 'scene';
  try { const n = prompt('File name', name); if (n === null) return; name = n; } catch { /* prompt blocked: keep the default name */ }
  name = name.trim().replace(/\.json$/i, '').replace(/[\\/:*?"<>|]/g, '-') || 'scene';
  setSceneName(name);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  download(name + '.json', url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Saved “${name}.json” to your downloads`);
}
async function openSceneFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('That file is not valid JSON'); return; }
  if (!data || typeof data !== 'object' || !Array.isArray(data.objects)) { toast('That file is not a saved scene'); return; }
  if (state.mode === 'edit') exitEdit();
  if (state.cameraView) exitCameraView();
  deserializeScene(data);
  if (!data.name) setSceneName(file.name);   // older files have no name inside: use the file name
  toast(`Opened “${file.name}”`);
}
function toggleFileMenu(open = $('#fileDrop').hidden) {
  $('#fileDrop').hidden = !open;
  $('#btnFile').classList.toggle('active', open);
  $('#btnFile').setAttribute('aria-expanded', open);
}
$('#btnFile').addEventListener('click', (e) => { e.stopPropagation(); toggleFileMenu(); });
/* scene name: shown in the File pill, renamed inline (double-click the pill or File → Rename…) */
function setSceneName(name) {
  name = name.trim().replace(/\.json$/i, '');
  if (name === (state.fileName || '')) { renderSceneName(); return; }
  state.fileName = name;
  renderSceneName();
  markDirty();
}
function startSceneRename() {
  toggleFileMenu(false);
  const inp = $('#nameInput');
  inp.value = state.fileName || '';
  inp.style.width = Math.max(140, $('#btnFile').offsetWidth) + 'px';
  $('#btnFile').hidden = true; inp.hidden = false;
  inp.focus(); inp.select();
}
function endSceneRename(commit) {
  const inp = $('#nameInput');
  if (inp.hidden) return;
  inp.hidden = true; $('#btnFile').hidden = false;
  if (commit) setSceneName(inp.value);
}
$('#btnFile').addEventListener('dblclick', startSceneRename);
$('#btnRename').onclick = startSceneRename;
$('#nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); endSceneRename(true); }
  else if (e.key === 'Escape') { e.preventDefault(); endSceneRename(false); }
});
$('#nameInput').addEventListener('blur', () => endSceneRename(true));
document.addEventListener('pointerdown', (e) => { if (!$('#fileDrop').hidden && !e.target.closest('#fileMenu')) toggleFileMenu(false); });
$('#btnNewScene').onclick = () => { toggleFileMenu(false); newScene(); };
$('#btnSaveScene').onclick = () => { toggleFileMenu(false); saveSceneFile(); };
$('#btnOpenScene').onclick = () => { toggleFileMenu(false); $('#sceneFile').click(); };
$('#sceneFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openSceneFile(f); });
// drop a scene file anywhere on the page to open it, or JPG / PNG images to add them as image cards
window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  const imgs = files.filter(isImageFile);
  if (!imgs.length) { openSceneFile(files[0]); return; }
  const at = { clientX: e.clientX, clientY: e.clientY }, ids = [];
  for (const f of imgs) { const id = await importImageFile(f); if (id) ids.push(id); }
  if (!ids.length) return;
  await whenNamed();   // another object may have been placed meanwhile
  cancelPlacing();
  if (state.cameraView) exitCameraView();
  if (state.mode === 'edit') exitEdit();
  flushPendingSave();
  const pos = floorPoint(at).toArray();
  // side by side, then named one after another
  const before = state.objects.length, named = ids.map((id, i) => addNamed('image', { ...imageData(id), pos: [pos[0] + i * 1.2, 0, pos[2]] }));
  const made = state.objects.slice(before);
  await Promise.all(named);
  if (made.length > 1) selectMany(made);
});
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); saveSceneFile(); }
  else if (k === 'o') { e.preventDefault(); $('#sceneFile').click(); }
});

window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (document.querySelector('#navAsk')) return;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
  const k = e.key.toLowerCase();
  if (exportOpen()) { if (k === 'escape') closeExport(); return; }   // the modal owns the keyboard
  if (e.key === '?') { toggleHelp(); return; }
  if (k === 'escape') {
    if (!$('#fileDrop').hidden) toggleFileMenu(false);
    else if (!$('#addDrop').hidden) toggleAddMenu(false);
    else if (!$('#helpPanel').hidden) toggleHelp(false);
    else if (state.cameraView) exitCameraView();
    else if (state.mode === 'edit') { if (state.joint) selectJoint(null); else exitEdit(); }
    else deselect();
    return;
  }
  if (state.cameraView) return;
  // the add menu owns the keyboard while it is open (Enter/Space pick the focused item)
  if (!$('#addDrop').hidden) {
    if (matchesShortcut(e, 'add') && !e.repeat) toggleAddMenu(false);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
    e.preventDefault();
    stepHistory(k === 'y' || e.shiftKey ? 1 : -1);
    return;
  }
  {
    if (k === 'n' && !e.ctrlKey && !e.metaKey && !e.repeat) toggleNames();
    else if (matchesShortcut(e, 'transform')) setTool('transform');
    else if (matchesShortcut(e, 'scale')) setTool('scale');
    else if ((k === 'delete' || k === 'backspace') && selObjs().length) deleteSelection();
    else if (k === 'enter' && state.mode === 'compose' && e.target.tagName !== 'BUTTON' && state.selected?.obj) enterEdit(state.selected.obj);
    else if (k === 'd' && (e.ctrlKey || e.metaKey) && selObjs().length) { e.preventDefault(); duplicateSelection(); }
    else if (k === 'c' && (e.ctrlKey || e.metaKey)) { if (selObjs().length) { e.preventDefault(); copySelection(); } }
    else if (k === 'x' && (e.ctrlKey || e.metaKey)) { if (selObjs().length) { e.preventDefault(); cutSelection(); } }
    else if (k === 'v' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pasteClipboard(); }
    else if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); selectMany(state.objects); }
    else if (matchesShortcut(e, 'add') && !e.repeat) toggleAddMenu(true);
  }
});

/* =====================================================================
   START
   ===================================================================== */
const isNew = new URLSearchParams(location.search).has('new');   // opened by File → New file
if (isNew) { const u = new URL(location.href); u.searchParams.delete('new'); history.replaceState(null, '', u); }
const stored = isNew ? null : loadStored(STORE_SCENE);
if (stored) deserializeScene(stored);
else {
  resetCamera();
  deserializeScene({ camera: { pos: shotCam.position.toArray(), quat: shotCam.quaternion.toArray(), focal: 35, aspect: '16:9' }, objects: [], notes: '' });
  if (!isNew) addObject('mannequin');
  renderObjectList(); markDirty();
}
updateModeBadge();
commitHistory();   // first undo step = the scene as loaded
resize();
window.vpg = { state, markDirty, serializeScene, deserializeScene, exportText, promptText, takeScreenshot, editCam, shotCam, addObject }; // handy for debugging in the console

function frame() {
  requestAnimationFrame(frame);
  if (pilot) pilot.update(); else orbit.update();
  if (takeDirty()) refreshDerived();
  placePivot();   // keep the gizmo on the centre of the selection
  render();
}

frame();
// a new file (also the first visit) starts with the wizard, then the tour if it was not done yet
const WIZARD = 'vpg.wizard';   // still open in this tab: a reload asks again
async function start() {
  let pending = false;
  try { pending = !!sessionStorage.getItem(WIZARD); } catch { /* not remembered */ }
  const askName = isNew || pending || !stored;
  if (askName) {
    try { sessionStorage.setItem(WIZARD, '1'); } catch { /* not remembered */ }
    const { name } = await newFileWizard();
    try { sessionStorage.removeItem(WIZARD); } catch { /* not remembered */ }
    if (name) {
      setSceneName(name);
      flushPendingSave();
      undoHist.stack.length = 0; undoHist.idx = -1;
      commitHistory();   // undo does not take the name away
    }
  }
  if (!tutorialDone()) startTutorial();
}
start();
