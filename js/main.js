import { $, state, STORE_SCENE } from './state.js';
import { editCam, orbit, scene } from './scene.js';
import { imageStore, importImageFile, isImageFile, pickImage } from './images.js';
import { rebuildGrid } from './room.js';
import { applyCamera, enterCameraView, exitCameraView, pilot, resetCamera, shotCam } from './camera.js';
import { addObject, copySelection, cutSelection, deleteSelection, duplicateSelection, pasteClipboard, uniqueName } from './objects.js';
import { configureGizmo, deselect, enterEdit, exitEdit, selectCamera, selectJoint, selectMany, selectObject, selObjs, setTool, toggleHelp, updateModeBadge } from './selection.js';
import { inset, render, resize, takeScreenshot } from './rendering.js';
import { camel, exportText } from './relations.js';
import { renderObjectList, setTab } from './left-panel.js';
import { addCustomTuple, markDirty, refreshDerived, takeDirty } from './prompt-panel.js';
import { copyBoth, copyImage, copyText, download, downloadText, toast } from './clipboard.js';
import { commitHistory, deserializeScene, loadStored, renderSceneName, serializeScene, stepHistory } from './persistence.js';

/* =====================================================================
   WIRING
   ===================================================================== */
$('#camRow').onclick = selectCamera;
function addDoll() { const o = addObject('mannequin'); selectObject(o); markDirty(); }
function toggleAddMenu(open = $('#addDrop').hidden) {
  $('#addDrop').hidden = !open;
  $('#btnAdd').classList.toggle('open', open);
  $('#btnAdd').setAttribute('aria-expanded', open);
  if (open) $('#addDrop [role=menuitem]').focus();
}
$('#btnAdd').addEventListener('click', (e) => { e.stopPropagation(); toggleAddMenu(); });
$('#btnAddDoll').onclick = () => { toggleAddMenu(false); addDoll(); };
// image card: picked from disk or dropped on the page; the file name becomes its id
function addImageObject(id) {
  const e = imageStore[id];
  const base = camel((e?.name || '').replace(/\.[^.]+$/, '')).replace(/^\d+/, '') || 'image';
  const o = addObject('image', { imageId: id, details: { name: uniqueName(base) } });
  if (state.mode === 'edit') exitEdit();
  selectObject(o); renderObjectList(); markDirty();
  return o;
}
$('#btnAddImage').onclick = async () => {
  toggleAddMenu(false);
  const id = await pickImage();
  if (id) addImageObject(id);
};
document.addEventListener('pointerdown', (e) => { if (!$('#addDrop').hidden && !e.target.closest('#btnAdd, #addDrop')) toggleAddMenu(false); });
$('#focal').addEventListener('input', (e) => { state.camera.focal = +e.target.value; applyCamera(); markDirty(); });
$('#aspect').addEventListener('change', (e) => { state.camera.aspect = e.target.value; applyCamera(); markDirty(); });
$('#btnCamView').onclick = enterCameraView;
$('#btnCamReset').onclick = () => { resetCamera(); markDirty(); };
inset.onclick = enterCameraView;
$('#btnBackEditor').onclick = exitCameraView;
$('#btnEditDone').onclick = exitEdit;
$('#btnCopyImg').onclick = copyImage;
$('#btnDlPng').onclick = () => download('reference.png', takeScreenshot());
$('#btnCopyText').onclick = () => copyText();
$('#btnCopyBoth').onclick = copyBoth;
$('#btnDlTxt').onclick = () => downloadText('prompt.txt', exportText());
$('#notes').addEventListener('input', (e) => { state.notes = e.target.value; markDirty(); });
$('#btnAddTuple').onclick = addCustomTuple;
$('#customTuple').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustomTuple(); });
$('#cellSize').addEventListener('change', (e) => { state.settings.cell = +e.target.value; rebuildGrid(); if (state.selected) setTool(state.tool); markDirty(); });
$('#snap').addEventListener('change', (e) => { state.settings.snap = e.target.checked; if (state.selected && state.mode === 'compose') setTool(state.tool); if (state.joint) configureGizmo('joint'); markDirty(); });
document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
function newScene() {
  if (!confirm('Start an empty scene? Anything you have not saved to a file is lost.')) return;
  deserializeScene({ objects: [], notes: '', settings: state.settings });
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
  if (state.cameraView) exitCameraView();
  const made = [];
  for (const f of imgs) { const id = await importImageFile(f); if (id) made.push(addImageObject(id)); }
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
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
  const k = e.key.toLowerCase();
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
    if (k === 'a' && !e.repeat) toggleAddMenu(false);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
    e.preventDefault();
    stepHistory(k === 'y' || e.shiftKey ? 1 : -1);
    return;
  }
  if (state.mode === 'compose') {
    if (k === 'w') setTool('translate');
    else if (k === 'r') setTool('rotate');
    else if (k === 'e') setTool('scale');
    else if ((k === 'delete' || k === 'backspace') && selObjs().length) deleteSelection();
    else if (k === 'enter' && state.selected?.obj) enterEdit(state.selected.obj);
    else if (k === 'd' && (e.ctrlKey || e.metaKey) && selObjs().length) { e.preventDefault(); duplicateSelection(); }
    else if (k === 'c' && (e.ctrlKey || e.metaKey)) { if (selObjs().length) { e.preventDefault(); copySelection(); } }
    else if (k === 'x' && (e.ctrlKey || e.metaKey)) { if (selObjs().length) { e.preventDefault(); cutSelection(); } }
    else if (k === 'v' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pasteClipboard(); }
    else if (k === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); selectMany(state.objects); }
    else if (k === 'a' && !e.altKey && !e.shiftKey && !e.repeat) toggleAddMenu(true);
  }
});

/* =====================================================================
   START
   ===================================================================== */
const stored = loadStored(STORE_SCENE);
if (stored) deserializeScene(stored);
else {
  resetCamera();
  deserializeScene({ camera: { pos: shotCam.position.toArray(), quat: shotCam.quaternion.toArray(), focal: 35, aspect: '16:9' }, objects: [], notes: '' });
  addObject('mannequin');
  renderObjectList(); markDirty();
}
updateModeBadge();
commitHistory();   // first undo step = the scene as loaded
resize();
window.vpg = { state, markDirty, serializeScene, deserializeScene, exportText, takeScreenshot, editCam }; // handy for debugging in the console

function frame() {
  requestAnimationFrame(frame);
  if (pilot) pilot.update(); else orbit.update();
  if (takeDirty()) refreshDerived();
  render();
}

frame();
