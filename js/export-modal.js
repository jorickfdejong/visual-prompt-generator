import * as THREE from 'three';
import { $, state } from './state.js';
import { editCam, orbit } from './scene.js';
import { exitCameraView } from './camera.js';
import { deselect, exitEdit, selectCamera, selectObject } from './selection.js';
import { schedulePreview } from './rendering.js';
import { exportText } from './relations.js';
import { naturalText, renderNatural } from './natural.js';
import { renderWarnings } from './consistency.js';
import { fixedLines } from './prompt-rules.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   EXPORT MODAL
   ===================================================================== */
// the text that is copied / downloaded, in the chosen format
export function promptText() { return state.promptEdit?.text ?? generatedText(); }
export function generatedText() {
  return [bodyText(), fixedLines().join('\n')].filter(Boolean).join('\n\n');
}
function bodyText() {
  const f = state.settings.format || 'both';
  if (f === 'tuples') return exportText();
  if (f === 'natural') return naturalText();
  // the notes open the written prompt already, so the tuples follow without repeating them
  const notes = state.notes.trim(), t = exportText();
  return [naturalText(), notes ? t.slice(notes.length).trimStart() : t].filter(Boolean).join('\n\n');
}
// the editable text: a hand-edited prompt stays as it is until it is reset
export function editPrompt() {
  const text = $('#promptEdit').value;
  state.promptEdit = text === generatedText() ? null : { text, base: state.promptEdit?.base ?? generatedText() };
  markDirty();
}
export function resetPrompt() { state.promptEdit = null; markDirty(); renderPromptEdit(); }
export function renderPromptEdit() {
  const box = $('#promptEdit'), text = promptText(), ed = state.promptEdit;
  if (box.value !== text) box.value = text;
  $('#promptEditState').hidden = $('#btnPromptReset').hidden = !ed;
  if (ed) $('#promptEditState').textContent = ed.base === generatedText() ? 'Edited by you.' : 'Edited by you. The scene or options changed since: reset to get the new text.';
}
export function exportOpen() { return !$('#exportModal').hidden; }
export function openExport() {
  if (exportOpen()) return;
  $('#exportModal').hidden = false;
  renderNatural($('#naturalPrompt'));
  renderWarnings();
  renderPromptEdit();
  schedulePreview();
  $('#btnCloseExport').focus();
}
export function closeExport() {
  if (!exportOpen()) return;
  $('#exportModal').hidden = true;
  $('#btnExport').focus();
}
// a button in the written prompt: close the modal, select what it names and bring it into view
export function goTo(target) {
  closeExport();
  if (state.cameraView) exitCameraView();
  if (state.mode === 'edit') exitEdit();
  if (target.kind === 'camera') selectCamera();
  else if (target.kind === 'obj') {
    const o = state.objects.find((x) => x.id === target.id);
    if (!o) return;
    selectObject(o);
    const c = new THREE.Box3().setFromObject(o.root).getCenter(new THREE.Vector3());
    editCam.position.add(c.clone().sub(orbit.target));
    orbit.target.copy(c);
  } else deselect();
  $('#btnExport').blur();
  (target.kind === 'finalImage' ? $('#imageSection') : target.kind === 'environment' ? $('#worldSection') : target.kind === 'camera' ? $('#camSection') : $('#context')).scrollIntoView({ block: 'start', behavior: 'smooth' });
}
document.addEventListener('vpg:goto', (e) => goTo(e.detail));
