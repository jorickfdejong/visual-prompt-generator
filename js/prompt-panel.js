import { $, FAMILIES, state } from './state.js';
import { gizmoDragging } from './scene.js';
import { grid } from './room.js';
import { schedulePreview } from './rendering.js';
import { computeTuples, finalTuples } from './relations.js';
import { exportOpen, promptText } from './export-modal.js';
import { renderNatural } from './natural.js';
import { renderWarnings } from './consistency.js';
import { esc } from './left-panel.js';
import { commitHistory, saveScene } from './persistence.js';

/* =====================================================================
   UI — PROMPT PANEL
   ===================================================================== */
// checkboxes that include or leave out a kind of information, with one per group for all of it
export function renderIncludes() {
  const el = $('#includeList'), on = state.settings.families;
  const groups = {};
  for (const [k, f] of Object.entries(FAMILIES)) (groups[f.group] ||= []).push(k);
  el.innerHTML = Object.entries(groups).map(([name, keys]) =>
    `<div class="incGroup" role="group" aria-label="${name}"><label class="checkRow incAll"><input type="checkbox" data-group="${name}">${name}</label>${keys.map((k) =>
      `<label class="checkRow" title="${FAMILIES[k].hint || ''}"><input type="checkbox" data-fam="${k}" ${on[k] ? 'checked' : ''}>${FAMILIES[k].label}</label>`).join('')}</div>`).join('');
  const syncGroups = () => el.querySelectorAll('[data-group]').forEach((b) => {
    const n = groups[b.dataset.group].filter((k) => on[k]).length;
    b.checked = n === groups[b.dataset.group].length;
    b.indeterminate = n > 0 && !b.checked;
  });
  el.querySelectorAll('[data-fam]').forEach((b) => { b.onchange = () => { on[b.dataset.fam] = b.checked; syncGroups(); markDirty(true); }; });
  el.querySelectorAll('[data-group]').forEach((b) => {
    b.onchange = () => {
      for (const k of groups[b.dataset.group]) { on[k] = b.checked; el.querySelector(`[data-fam=${k}]`).checked = b.checked; }
      syncGroups(); markDirty(true);
    };
  });
  syncGroups();
}
export function renderTuples() {
  const el = $('#tupleList');
  el.innerHTML = '';
  const rows = [];
  for (const t of state.tuples) {
    if (!state.settings.families[t.family]) continue;
    const o = state.overrides[t.key] || {};
    const div = document.createElement('div');
    div.className = 'tuple' + (o.off ? ' off' : '') + (o.rel ? ' overridden' : '');
    let text;
    if (t.alts) {
      const cur = o.rel || t.parts[1];
      const opts = [...new Set([t.parts[1], ...t.alts])].map((a) => `<option ${a === cur ? 'selected' : ''}>${a}</option>`).join('');
      text = `(${esc(t.parts[0])}, <select>${opts}</select>, ${esc(t.parts[2])})`;
    } else text = esc('(' + t.parts.join(', ') + ')');
    div.innerHTML = `<span class="fam" style="background:${FAMILIES[t.family].color}" title="${FAMILIES[t.family].label}"></span><input type="checkbox" ${o.off ? '' : 'checked'}><span class="ttext">${text}</span>${o.rel ? '<button title="Back to computed value">↺</button>' : ''}`;
    div.querySelector('input').onchange = (e) => { setOverride(t.key, { off: !e.target.checked }); };
    div.querySelector('select')?.addEventListener('change', (e) => setOverride(t.key, { rel: e.target.value === t.parts[1] ? undefined : e.target.value }));
    div.querySelector('button')?.addEventListener('click', () => setOverride(t.key, { rel: undefined }));
    rows.push(div);
  }
  if (state.settings.families.custom) state.custom.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'tuple' + (c.off ? ' off' : '');
    div.innerHTML = `<span class="fam" style="background:#fff" title="Custom"></span><input type="checkbox" ${c.off ? '' : 'checked'}><span class="ttext">${esc(c.text)}</span><button class="danger" title="Remove">✕</button>`;
    div.querySelector('input').onchange = (e) => { c.off = !e.target.checked; markDirty(true); };
    div.querySelector('button').onclick = () => { state.custom.splice(i, 1); markDirty(true); };
    rows.push(div);
  });
  rows.forEach((r) => el.appendChild(r));
  if (!rows.length) el.innerHTML = '<div class="hint">No tuples (all kinds left out?).</div>';
}
export function setOverride(key, patch) {
  const o = { ...(state.overrides[key] || {}), ...patch };
  Object.keys(o).forEach((k) => o[k] === undefined || o[k] === false ? delete o[k] : 0);
  if (Object.keys(o).length) state.overrides[key] = o; else delete state.overrides[key];
  markDirty(true);
}
export function addCustomTuple() {
  const inp = $('#customTuple');
  const parts = inp.value.replace(/[()]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return;
  state.custom.push({ text: '(' + parts.join(', ') + ')', off: false });
  inp.value = '';
  markDirty(true);
}

export let dirty = true, forceTupleRender = true, saveTimer = null, lastSig = '', lastExport = null;
// read-and-clear the dirty flag (used by the render loop)
export function takeDirty() { const d = dirty; dirty = false; return d; }
// save + record an undo step right now if a change is still waiting for settle()
export function flushPendingSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveScene(); commitHistory(); } }
export function markDirty(forceRender = false) {
  dirty = true;
  if (forceRender) forceTupleRender = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(settle, 400);
}
// runs once things have been still for a moment: autosave + one undo step
export function settle() {
  if (gizmoDragging() || document.body.classList.contains('scrubbing')) { saveTimer = setTimeout(settle, 250); return; }
  saveTimer = null;
  saveScene();
  commitHistory();
}
export function refreshDerived() {
  schedulePreview();
  state.tuples = computeTuples();
  const sig = JSON.stringify([state.tuples.map((t) => t.key), state.settings.families]);
  if (sig !== lastSig || forceTupleRender) { lastSig = sig; forceTupleRender = false; renderTuples(); }
  const text = promptText();
  if (exportOpen()) { renderNatural($('#naturalPrompt')); renderWarnings(); }
  if (text !== lastExport) {
    lastExport = text;
    $('#exportPreview').textContent = text;
  }
  $('#tupleCount').textContent = finalTuples().length + ' lines';
}
