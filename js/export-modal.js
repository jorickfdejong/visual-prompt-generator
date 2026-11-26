import * as THREE from 'three';
import { $, state } from './state.js';
import { editCam, orbit } from './scene.js';
import { exitCameraView } from './camera.js';
import { deselect, exitEdit, selectCamera, selectObject } from './selection.js';
import { schedulePreview } from './rendering.js';
import { exportText } from './relations.js';
import { startWizard } from './export-wizard.js';
import { environmentCardKey, naturalText, objectCardKey, promptCards, renderNatural } from './natural.js';
import { renderPromptCards } from './export-prompt-cards.js';
import { fixedLines } from './prompt-rules.js';
import { showTab } from './side-tabs.js';
import { envComplete, showEnvWarning } from './env-check.js';
import { dollsComplete, markUnfinished, showDollWarning } from './doll-check.js';
import { detailCount } from './details.js';
import { TYPES } from './types.js';

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
const objectCardFamilies = new Set(['attributes', 'size', 'orientation', 'facing']);
export function includeTuple(t) {
  if (t.family === 'environment') return !Object.hasOwn(state.promptCardEdits, environmentCardKey);
  if (!objectCardFamilies.has(t.family)) return true;
  const id = t.objIds[0];
  return !state.facts.get(id)?.inShot || !Object.hasOwn(state.promptCardEdits, objectCardKey(id));
}

// older scenes can hold a card text typed by hand, which replaces the environment fields: those win again once edited
$('#envDetails').addEventListener('input', () => { delete state.promptCardEdits[environmentCardKey]; }, true);

// an object with more than half of its fields still empty
function isSparse(card) {
  const o = card.objectId && state.objects.find((x) => x.id === card.objectId);
  if (!o || Object.hasOwn(state.promptCardEdits, card.key)) return false;
  return detailCount(o) < (TYPES[o.type].fields || []).filter((f) => !f.asNoun).length / 2;
}
export function refreshPromptCards() {
  const cards = promptCards().map((card) => ({ ...card, sparse: isSparse(card) }));
  $('#sparseWarning').hidden = !cards.some((card) => card.sparse);
  renderPromptCards($('#promptCards'), cards, state.promptCardEdits);
}
let shownPrompt = null;
export function renderPromptEdit() {
  const box = $('#promptView'), text = promptText();
  if (shownPrompt === text) return;
  shownPrompt = text;
  // only on screen: every fixed line and every paragraph gets room around it
  const fixed = fixedLines(), body = text.slice(fixed.join('\n').length);
  box.replaceChildren(...[...fixed, ...body.split(/\n{2,}/)].filter((t) => t.trim()).map((t) => {
    const p = document.createElement('p');
    p.textContent = t.trim();
    return p;
  }));
}
export function exportOpen() { return !$('#exportModal').hidden; }
export function openExport() {
  if (exportOpen()) return;
  if (!envComplete() || !dollsComplete()) {   // empty required details: show them instead of exporting
    if (state.cameraView) exitCameraView();
    if (state.mode === 'edit') exitEdit();
    markUnfinished();
    if (!envComplete()) showEnvWarning(); else showDollWarning();
    return;
  }
  $('#exportModal').hidden = false;
  startWizard(closeExport);
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
  (target.kind === 'finalImage' || target.kind === 'environment' ? $('#imageSection') : target.kind === 'camera' ? $('#camSection') : $('#context')).scrollIntoView({ block: 'start', behavior: 'smooth' });
}
document.addEventListener('vpg:goto', (e) => goTo(e.detail));
