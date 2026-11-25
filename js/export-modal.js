import * as THREE from 'three';
import { $, state } from './state.js';
import { editCam, orbit } from './scene.js';
import { exitCameraView } from './camera.js';
import { deselect, exitEdit, selectCamera, selectObject } from './selection.js';
import { schedulePreview } from './rendering.js';
import { exportText } from './relations.js';
import { environmentCardKey, naturalText, objectCardKey, promptCards, renderNatural } from './natural.js';
import { renderPromptCards } from './export-prompt-cards.js';
import { fixedLines } from './prompt-rules.js';
import { showTab } from './side-tabs.js';
import { envComplete, showEnvWarning } from './env-check.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   EXPORT MODAL
   ===================================================================== */
// the text that is copied / downloaded, in the chosen format
export function promptText() {
  return [fixedLines().join('\n'), bodyText()].filter(Boolean).join('\n\n');
}
function bodyText() {
  const f = state.settings.format || 'both';
  if (f === 'tuples') return [exportText(includeTuple).trimEnd(), ...promptCards().map((card) => state.promptCardEdits[card.key])].filter(Boolean).join('\n\n');
  if (f === 'natural') return naturalText();
  // the notes open the written prompt already, so the tuples follow without repeating them
  const notes = state.notes.trim(), t = exportText(includeTuple);
  return [naturalText(), notes ? t.slice(notes.length).trimStart() : t].filter(Boolean).join('\n\n');
}
const objectCardFamilies = new Set(['attributes', 'size', 'placement', 'orientation', 'facing']);
export function includeTuple(t) {
  if (t.family === 'environment') return !Object.hasOwn(state.promptCardEdits, environmentCardKey);
  if (!objectCardFamilies.has(t.family)) return true;
  const id = t.objIds[0];
  return !state.facts.get(id)?.inShot || !Object.hasOwn(state.promptCardEdits, objectCardKey(id));
}

function applyCard(card, text) {
  const edits = state.promptCardEdits;
  const previous = edits[card.key];
  if (text === (previous ?? card.text)) return;
  edits[card.key] = text;
  markDirty(true);
  renderPromptEdit();
}

export function refreshPromptCards() {
  renderPromptCards($('#promptCards'), promptCards(), state.promptCardEdits, applyCard);
}
export function renderPromptEdit() {
  const box = $('#promptView'), text = promptText();
  if (box.textContent !== text) box.textContent = text;
}
export function exportOpen() { return !$('#exportModal').hidden; }
export function openExport() {
  if (exportOpen()) return;
  if (!envComplete()) {   // empty environment details: show them instead of exporting
    if (state.cameraView) exitCameraView();
    if (state.mode === 'edit') exitEdit();
    showEnvWarning();
    return;
  }
  $('#exportModal').hidden = false;
  renderNatural($('#naturalPrompt'));
  renderPromptEdit();
  refreshPromptCards();
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
    const bounds = new THREE.Box3().setFromObject(o.root);
    const center = bounds.getCenter(new THREE.Vector3());
    const offset = editCam.position.clone().sub(orbit.target);
    if (target.frame && !bounds.isEmpty()) {
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
      const vertical = THREE.MathUtils.degToRad(editCam.getEffectiveFOV() / 2);
      const horizontal = Math.atan(Math.tan(vertical) * editCam.aspect);
      const distance = radius / Math.sin(Math.min(vertical, horizontal));
      offset.setLength(Math.max(distance * 1.15, radius + editCam.near * 2, orbit.minDistance));
    }
    orbit.target.copy(center);
    editCam.position.copy(center).add(offset);
    orbit.update();
  } else deselect();
  $('#btnExport').blur();
  showTab(['environment', 'finalImage'].includes(target.kind) ? 'env' : 'scene');
  (target.kind === 'finalImage' ? $('#imageSection') : target.kind === 'environment' ? $('#worldSection') : target.kind === 'camera' ? $('#camSection') : $('#context')).scrollIntoView({ block: 'start', behavior: 'smooth' });
}
document.addEventListener('vpg:goto', (e) => goTo(e.detail));
