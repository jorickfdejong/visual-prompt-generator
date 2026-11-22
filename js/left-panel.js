import * as THREE from 'three';
import { $, DEG, SKIN_TONES, state } from './state.js';
import { floor, orbit, scene } from './scene.js';
import { imageStore, pickImage, rgbHex, withPixels } from './images.js';
import { applyLight, applyRoom, PATTERNS, ROOM_DEFAULT } from './room.js';
import { shotCam } from './camera.js';
import { PELVIS_Y, POSES } from './mannequin.js';
import { buildImageCard, IMG_H } from './image-card.js';
import { TYPES } from './types.js';
import { uniqueName } from './objects.js';
import { enterEdit, exitEdit, placePivot, selectMany, selectObject, selObjs, setTool, toggleInSelection, updateModeBadge } from './selection.js';
import { schedulePreview } from './rendering.js';
import { camel } from './relations.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   UI — LEFT PANEL
   ===================================================================== */
export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

export function renderObjectList() {
  const ul = $('#objectList');
  ul.innerHTML = '';
  $('#emptyHint').style.display = state.objects.length ? 'none' : 'block';
  $('#objCount').textContent = state.objects.length ? state.objects.length : '';
  $('#camRow').classList.toggle('selected', state.selected?.kind === 'camera');
  for (const o of state.objects) {
    const li = document.createElement('li');
    if (selObjs().includes(o)) li.classList.add('selected');
    if (o.hidden) li.classList.add('hidden-obj');
    li.innerHTML = `<span class="dot" style="background:${o.accent}"></span><span class="name" title="Double-click to rename">${esc(o.details.name)}</span>
      <button class="icon eye" data-act="eye" title="${o.hidden ? 'Show' : 'Hide'}">${o.hidden ? '◌' : '👁'}</button>`;
    li.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'eye') { o.hidden = !o.hidden; o.root.visible = !o.hidden; if (o.hidden && state.editing === o) exitEdit(); if (state.selected?.obj === o) selectObject(o); else if (state.selected?.kind === 'multi') selectMany(state.selected.objs); renderObjectList(); markDirty(); return; }
      if (state.mode === 'edit' && state.editing !== o) exitEdit();
      if (state.mode === 'compose') { if (e.shiftKey || e.ctrlKey || e.metaKey) toggleInSelection(o); else selectObject(o); }
    });
    li.querySelector('.name').addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(li, o); });
    ul.appendChild(li);
  }
}
export function startRename(li, o) {
  const span = li.querySelector('.name');
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = o.details.name;
  span.replaceWith(inp);
  inp.focus(); inp.select();
  const done = () => { setName(o, inp.value); renderObjectList(); renderContext(); };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = o.details.name; inp.blur(); } e.stopPropagation(); });
}
export function setName(o, raw) {
  const clean = camel(raw) || o.details.name;
  o.details.name = clean;
  if (state.objects.some((x) => x !== o && x.details.name === clean)) {
    o.details.name = '';
    o.details.name = uniqueName(clean);
  }
  updateModeBadge(); markDirty();
}

export let wasEditing = false;
export function setTab(name) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $('#tabEdit').hidden = name !== 'edit';
  $('#tabExport').hidden = name !== 'export';
  document.body.classList.toggle('exporting', name === 'export');
  if (name === 'export') schedulePreview();
}
export function renderContext() {
  const el = $('#context');
  const editing = state.mode === 'edit';
  const side = $('#editSide');
  const sel = state.selected;
  side.hidden = !editing;
  $('#camSection').hidden = editing || sel?.kind !== 'camera';
  $('#gridSection').hidden = editing || !!sel;   // nothing selected = editing the world
  $('#worldSection').hidden = editing || !!sel;
  if (editing && !wasEditing) setTab('edit');   // jump to the Edit tab when edit mode starts
  wasEditing = editing;
  renderTools();
  if (editing) {
    renderEditPanel(side);
    el.hidden = true;
    return;
  }
  el.hidden = false;
  side.innerHTML = '';
  if (sel?.kind === 'camera') {
    el.innerHTML = `<p class="hint" style="margin-top:0">Move or rotate the camera with the gizmo or type exact values, or open <b>Camera view</b> to frame the shot by orbiting.</p>${transformHTML(sel)}`;
    bindTransformInputs(el);
    return;
  }
  const objs = selObjs();
  if (sel?.kind === 'multi') {
    el.innerHTML = `<h2>${objs.length} objects selected</h2>
      <p class="hint" style="margin-top:0">${objs.map((o) => esc(o.details.name)).join(', ')}. The gizmo moves, rotates and scales them together. Shift/Ctrl-click to add or remove one.</p>${transformHTML(sel)}`;
  } else if (sel?.kind === 'obj') {
    const o = sel.obj;
    el.innerHTML = `<div class="field"><label>Name</label><input type="text" id="nameInput" value="${esc(o.details.name)}"></div>
      ${TYPES[o.type].poseable ? `<button id="btnPose" class="primary" style="width:100%;margin:2px 0 12px" title="Pose the joints (Enter or double-click it)">Pose</button>` : ''}
      ${transformHTML(sel)}
      ${o.type === 'image' ? imagePanelHTML(o) : ''}
      ${detailsHTML(o)}`;
    el.querySelector('#btnPose')?.addEventListener('click', () => enterEdit(o));
    if (o.type === 'image') bindImagePanel(el, o);
    const nameInput = el.querySelector('#nameInput');
    nameInput.addEventListener('change', () => { setName(o, nameInput.value); nameInput.value = o.details.name; renderObjectList(); });
    bindDetails(el, o);
  } else {
    el.innerHTML = `<p class="hint" style="margin:0">Select the camera or an object in the scene list above. Drag over empty space to select several objects.</p>`;
    return;
  }
  bindTransformInputs(el);
}

/* Numeric transform fields for the selection.
   Position in metres (Y = up), rotation in degrees, scale as a factor.
   For several objects the position is the group's centre and moving it shifts them all. */
export function transformTarget(sel = state.selected) {
  if (!sel) return null;
  if (sel.kind === 'camera') return shotCam;
  if (sel.kind === 'obj') return sel.obj.root;
  return null;
}
export function groupCentre() {
  const c = new THREE.Vector3();
  const objs = selObjs();
  objs.forEach((o) => c.add(o.root.position));
  return objs.length ? c.divideScalar(objs.length) : c;
}
export function transformValues(sel = state.selected) {
  const t = transformTarget(sel);
  if (t) {
    const v = { px: t.position.x, py: t.position.y, pz: t.position.z, rx: t.rotation.x / DEG, ry: t.rotation.y / DEG, rz: t.rotation.z / DEG };
    if (sel.kind === 'obj') v.s = t.scale.x;
    return v;
  }
  if (sel?.kind === 'multi') { const c = groupCentre(); return { px: c.x, py: c.y, pz: c.z }; }
  return {};
}
export function transformHTML(sel) {
  const v = transformValues(sel);
  // each field: axis letter inside (drag it sideways to scrub the value, like Figma) + the number
  const field = (k, ax, step) => `<label class="tfField"><span class="ax" data-scrub="${k}" title="Drag to adjust">${ax}</span><input type="number" data-tf="${k}" step="${step}" value="${fmtNum(v[k])}"></label>`;
  const trio = (p, step) => `<div class="tfRow">${field(p + 'x', 'X', step)}${field(p + 'y', 'Y', step)}${field(p + 'z', 'Z', step)}</div>`;
  const group = (label, unit, body) => `<div class="tfGroup"><div class="tfLabel">${label}<span class="unit">${unit}</span></div>${body}</div>`;
  let html = group(sel.kind === 'multi' ? 'Centre' : 'Position', 'm', trio('p', state.settings.snap ? state.settings.cell : 0.05));
  if ('rx' in v) html += group('Rotation', '°', trio('r', 5));
  if ('s' in v) html += group('Scale', '×', `<div class="tfRow">${field('s', '↔', 0.05)}</div>`);
  return `<div class="transform">${html}</div>`;
}
export function fmtNum(n) { return n == null ? '' : String(+(+n).toFixed(3)); }
export function bindTransformInputs(el) {
  el.querySelectorAll('[data-tf]').forEach((inp) => {
    inp.addEventListener('change', () => applyTransformInput(inp.dataset.tf, parseFloat(inp.value)));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { syncTransformInputs(); inp.blur(); } });
  });
  // drag the axis letter left/right to change the value (one step per 4 px; Shift = 10x finer)
  el.querySelectorAll('[data-scrub]').forEach((ax) => {
    ax.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const k = ax.dataset.scrub;
      const inp = el.querySelector(`[data-tf="${k}"]`);
      const step = parseFloat(inp.step) || 1;
      const start = parseFloat(inp.value) || 0, x0 = e.clientX;
      ax.setPointerCapture(e.pointerId);
      document.body.classList.add('scrubbing');
      const move = (ev) => {
        const fine = ev.shiftKey ? 0.1 : 1;
        const n = start + Math.round((ev.clientX - x0) / 4) * step * fine;
        applyTransformInput(k, +n.toFixed(4));
      };
      const up = () => { ax.removeEventListener('pointermove', move); document.body.classList.remove('scrubbing'); };
      ax.addEventListener('pointermove', move);
      ax.addEventListener('pointerup', up, { once: true });
      ax.addEventListener('pointercancel', up, { once: true });
    });
  });
}
export function applyTransformInput(k, n) {
  const sel = state.selected;
  if (!sel || !Number.isFinite(n)) { syncTransformInputs(); return; }
  const axis = k[1];
  const t = transformTarget(sel);
  if (t) {
    if (k === 's') { const v = THREE.MathUtils.clamp(n, ...scaleRange(sel.obj)); t.scale.setScalar(v); t.userData.prevS = v; }
    else if (k[0] === 'p') t.position[axis] = n;
    else t.rotation[axis] = n * DEG;
    t.updateMatrixWorld(true);
  } else if (sel.kind === 'multi' && k[0] === 'p') {
    const d = n - groupCentre()[axis];
    selObjs().forEach((o) => { o.root.position[axis] += d; });
    placePivot();
  }
  markDirty();
  syncTransformInputs();
}
// keep the fields in step while the gizmo drags (skip the one being typed in)
export function syncTransformInputs() {
  const fields = document.querySelectorAll('#context [data-tf]');
  if (!fields.length) return;
  const v = transformValues();
  fields.forEach((inp) => { if (inp !== document.activeElement) inp.value = fmtNum(v[inp.dataset.tf]); });
  const sizeEl = $('#imgSize');
  if (sizeEl && state.selected?.obj?.type === 'image') sizeEl.textContent = imageSizeText(state.selected.obj);
}
// Left tool strip state (Move / Rotate / Scale)
export function renderTools() {
  // left tool strip: always visible in compose mode
  document.querySelectorAll('#toolStrip [data-tool]').forEach((b) => {
    b.classList.toggle('active', state.tool === b.dataset.tool);
    b.disabled = b.dataset.tool === 'scale' && state.selected?.kind === 'camera';
  });
}
document.querySelectorAll('#toolStrip [data-tool]').forEach((b) => { b.onclick = () => setTool(b.dataset.tool); });

// World settings: background colour, floor and background walls
export function renderWorldPanel() {
  const R = state.settings.room, F = R.floor, W = R.walls;
  const opts = (kind, cur) => Object.entries(PATTERNS[kind]).map(([k, p]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${p.label}</option>`).join('');
  const imgRow = (kind, cfg) => cfg.pattern !== 'image' ? '' : `<div class="field"><label></label><div class="row" style="flex-wrap:nowrap">
      <span class="hint" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(imageStore[cfg.imageId]?.name || 'no image')}</span>
      <button data-wimg="${kind}">Replace…</button></div></div>`;
  const num = (k, v) => `<input type="number" data-wnum="${k}" min="0.5" max="40" step="0.5" value="${v}">`;
  const L = R.light;
  const units = { direction: '°', height: '°' };
  const fmtLight = (k) => (units[k] ? Math.round(L[k]) : (+L[k]).toFixed(1)) + (units[k] || '');
  const slider = (k, label, min, max, step) => `<div class="field"><label>${label}</label><div class="row" style="flex-wrap:nowrap">
      <input type="range" data-wl="${k}" min="${min}" max="${max}" step="${step}" value="${L[k]}"><span data-wlv="${k}" style="width:38px;text-align:right">${fmtLight(k)}</span></div></div>`;
  const el = $('#worldSection');
  el.innerHTML = `<h2>World</h2>
    <div class="field"><label>Background</label><input type="color" data-wc="background" value="${R.background}"></div>
    <div class="field"><label>Size (m)</label><div class="tfRow">
      <label class="tfField" title="Width (X): floor and back wall"><span class="ax" data-wscrub="width" title="Drag to adjust">W</span>${num('width', W.width)}</label>
      <label class="tfField" title="Depth (Z): floor and side walls"><span class="ax" data-wscrub="depth" title="Drag to adjust">D</span>${num('depth', W.depth)}</label>
      <label class="tfField" title="Wall height"><span class="ax" data-wscrub="height" title="Drag to adjust">H</span>${num('height', W.height)}</label>
    </div></div>
    <h3 class="sub withBtn">Light <button id="btnResetLight" title="Back to the default light">Reset</button></h3>
    ${slider('direction', 'Direction', 0, 360, 1, '°')}
    ${slider('height', 'Height', 2, 90, 1, '°')}
    ${slider('brightness', 'Brightness', 0, 6, 0.1, '')}
    <div class="field"><label>Colour</label><div class="row" style="flex-wrap:nowrap">
      <input type="color" data-wc="light" value="${L.color}" style="flex:1">
      ${[['#ffffff', 'neutral'], ['#ffd9a8', 'warm sunlight'], ['#ff9e5e', 'sunset'], ['#cfe2ff', 'cool daylight'], ['#8fa8ff', 'moonlight']].map(([c, n]) => `<button class="swatch" data-lc="${c}" title="${n}" style="background:${c}"></button>`).join('')}
    </div></div>
    ${slider('ambient', 'Ambient', 0, 4, 0.1, '')}
    <div class="field"><label>Shadows</label><label class="checkRow"><input type="checkbox" id="lightShadows" ${L.shadows !== false ? 'checked' : ''}> Cast shadows</label></div>
    <h3 class="sub">Floor</h3>
    <div class="field"><label>Look</label><select data-wpat="floor">${opts('floor', F.pattern)}</select></div>
    ${imgRow('floor', F)}
    <div class="field"><label>Colour</label><input type="color" data-wc="floor" value="${F.color}" title="Also fills transparent parts of an image"></div>
    <h3 class="sub">Walls</h3>
    <div class="field"><label>Show</label><div class="row">
      ${['back', 'left', 'right'].map((k) => `<label class="checkRow"><input type="checkbox" data-wall="${k}" ${W[k] ? 'checked' : ''}> ${k[0].toUpperCase() + k.slice(1)}</label>`).join('')}
    </div></div>
    <div class="field"><label>Look</label><select data-wpat="walls">${opts('walls', W.pattern)}</select></div>
    ${imgRow('walls', W)}
    <div class="field"><label>Colour</label><input type="color" data-wc="walls" value="${W.color}" title="Also fills transparent parts of an image"></div>
    <p class="hint" style="margin:4px 0 0">The floor and walls share the same size. The back wall stands at −Z, behind the default camera view. Walls disappear when you orbit behind them.</p>`;
  const changed = (rerender) => { applyRoom(); markDirty(); if (rerender) renderWorldPanel(); };
  el.querySelectorAll('[data-wc]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.wc;
    if (k === 'background') R.background = inp.value; else R[k].color = inp.value;
    changed(false);
  }));
  // light sliders and colour presets (only the light changes, so skip rebuilding the room)
  el.querySelectorAll('[data-wl]').forEach((inp) => inp.addEventListener('input', () => {
    L[inp.dataset.wl] = +inp.value;
    el.querySelector(`[data-wlv="${inp.dataset.wl}"]`).textContent = fmtLight(inp.dataset.wl);
    applyLight(); markDirty();
  }));
  el.querySelector('#lightShadows').addEventListener('change', (e) => { L.shadows = e.target.checked; applyLight(); markDirty(); });
  el.querySelector('#btnResetLight').onclick =() => { R.light = ROOM_DEFAULT().light; changed(true); };
  el.querySelectorAll('[data-lc]').forEach((b) => { b.onclick = () => { L.color = b.dataset.lc; el.querySelector('[data-wc="light"]').value = L.color; applyLight(); markDirty(); }; });
  el.querySelectorAll('[data-wall]').forEach((inp) => inp.addEventListener('change', () => { W[inp.dataset.wall] = inp.checked; changed(false); }));
  el.querySelectorAll('[data-wnum]').forEach((inp) => inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v)) W[inp.dataset.wnum] = THREE.MathUtils.clamp(v, 0.5, 40);
    inp.value = W[inp.dataset.wnum];
    changed(false);
  }));
  // drag the W / D / H letter sideways to change the size (0.5 m per 4 px; Shift = 0.05 m steps), like the transform fields
  el.querySelectorAll('[data-wscrub]').forEach((ax) => {
    ax.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const k = ax.dataset.wscrub, inp = el.querySelector(`[data-wnum="${k}"]`);
      const start = +W[k] || 0, x0 = e.clientX;
      ax.setPointerCapture(e.pointerId);
      document.body.classList.add('scrubbing');
      const move = (ev) => {
        const step = ev.shiftKey ? 0.05 : 0.5;
        const v = THREE.MathUtils.clamp(+(start + Math.round((ev.clientX - x0) / 4) * step).toFixed(2), 0.5, 40);
        if (v === W[k]) return;
        W[k] = v;
        inp.value = v;
        changed(false);
      };
      const up = () => { ax.removeEventListener('pointermove', move); document.body.classList.remove('scrubbing'); };
      ax.addEventListener('pointermove', move);
      ax.addEventListener('pointerup', up, { once: true });
      ax.addEventListener('pointercancel', up, { once: true });
    });
  });
  const chooseImage = async (kind) => {
    const id = await pickImage();
    if (id) { R[kind].pattern = 'image'; R[kind].imageId = id; }
    if (id && kind === 'walls' && !W.back && !W.left && !W.right) W.back = true;
    changed(true);
  };
  el.querySelectorAll('[data-wpat]').forEach((sel) => sel.addEventListener('change', () => {
    const kind = sel.dataset.wpat, cfg = R[kind];
    if (sel.value === 'image' && !imageStore[cfg.imageId]) { chooseImage(kind); return; }   // reverts on cancel
    cfg.pattern = sel.value;
    if (kind === 'walls' && !W.back && !W.left && !W.right) W.back = true;   // picking a wall look shows a wall
    changed(true);
  }));
  el.querySelectorAll('[data-wimg]').forEach((b) => { b.onclick = () => chooseImage(b.dataset.wimg); });
}

// Image card: the picture, its stand and its real size
export function imageSizeText(o) {
  const e = imageStore[o.imageId], s = o.root.scale.x;
  const h = IMG_H * s, w = h * (e ? e.w / e.h : 1);
  return `${w.toFixed(2)} × ${h.toFixed(2)} m`;
}
export function imagePanelHTML(o) {
  const e = imageStore[o.imageId], c = o.cutout;
  const src = c.on && o._cut?.url ? o._cut.url : e?.src;
  return `<h2 style="margin-top:14px">Image</h2>
    <div class="imgCard${c.on ? ' picking' : ''}">
      ${e ? `<img id="imgPreview" data-obj="${o.id}" src="${src}" alt="" ${c.on ? 'title="Click to pick the background colour"' : ''}>` : '<div class="imgMissing">Image missing</div>'}
      <div class="imgMeta"><div class="imgName" title="${esc(e?.name || '')}">${esc(e?.name || 'No image')}</div>
        <div class="hint">${e ? `${e.w} × ${e.h} px · ` : ''}<span id="imgSize">${imageSizeText(o)}</span></div>
        <button id="btnReplaceImg">Replace image…</button></div>
    </div>
    <label class="checkRow"><input type="checkbox" id="hideStand" ${o.hideStand ? 'checked' : ''}> Hide stand <span class="hint">(the picture stays where it is)</span></label>
    ${e ? `<label class="checkRow" style="margin-top:6px"><input type="checkbox" id="cutOn" ${c.on ? 'checked' : ''}> Remove background <span class="hint">(by colour)</span></label>` : ''}
    ${e && c.on ? `<div class="cutOpts">
      <div class="field"><label>Background colour <span class="hint">— or click the picture</span></label><input type="color" id="cutColor" value="${c.color}"></div>
      <div class="field"><label>Tolerance</label><div class="row" style="flex-wrap:nowrap"><input type="range" id="cutTol" min="0" max="100" step="1" value="${c.tol}"><span id="cutTolV" style="width:38px;text-align:right">${c.tol}</span></div></div>
      <label class="checkRow"><input type="checkbox" id="cutEdges" ${c.edges ? 'checked' : ''}> Only from the edges <span class="hint">(keeps matching colours inside the picture)</span></label>
    </div>` : ''}`;
}
export function bindImagePanel(el, o) {
  const c = o.cutout;
  let cutTimer;
  const recut = (delay = 0) => { clearTimeout(cutTimer); cutTimer = setTimeout(() => { buildImageCard(o); markDirty(); }, delay); };
  el.querySelector('#cutOn')?.addEventListener('change', (e) => {
    c.on = e.target.checked;
    if (c.on && !c.picked) {
      // first time: preset the colour to the top-left pixel, shown and changeable in the panel
      withPixels(o.imageId, (p) => {
        c.color = rgbHex(p.data[0], p.data[1], p.data[2]);
        buildImageCard(o); markDirty(); renderContext();
      });
    }
    buildImageCard(o); markDirty(); renderContext();
  });
  el.querySelector('#cutColor')?.addEventListener('input', (e) => { c.color = e.target.value; c.picked = true; recut(80); });
  el.querySelector('#cutTol')?.addEventListener('input', (e) => { c.tol = +e.target.value; el.querySelector('#cutTolV').textContent = c.tol; recut(80); });
  el.querySelector('#cutEdges')?.addEventListener('change', (e) => { c.edges = e.target.checked; recut(); });
  // eyedropper: click the preview to take the colour of the original pixel under the cursor
  const prev = el.querySelector('#imgPreview');
  if (prev && c.on) prev.addEventListener('click', (ev) => {
    const r = prev.getBoundingClientRect(), img = imageStore[o.imageId];
    const k = Math.min(r.width / img.w, r.height / img.h);
    const x = Math.floor((ev.clientX - r.left - (r.width - img.w * k) / 2) / k);
    const y = Math.floor((ev.clientY - r.top - (r.height - img.h * k) / 2) / k);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
    withPixels(o.imageId, (p) => {
      const i = (y * img.w + x) * 4;
      c.color = rgbHex(p.data[i], p.data[i + 1], p.data[i + 2]); c.picked = true;
      el.querySelector('#cutColor').value = c.color;
      recut();
    });
  });
  el.querySelector('#hideStand').addEventListener('change', (e) => {
    o.hideStand = e.target.checked;
    buildImageCard(o);
    markDirty();
  });
  el.querySelector('#btnReplaceImg').onclick = async () => {
    const id = await pickImage();
    if (!id) return;
    o.imageId = id;
    if (o.cutout.on) {
      // a new picture probably has a different background: sample its corner again
      o.cutout.picked = false;
      withPixels(id, (p) => { o.cutout.color = rgbHex(p.data[0], p.data[1], p.data[2]); buildImageCard(o); markDirty(); renderContext(); });
    }
    buildImageCard(o);
    markDirty(); renderContext();
  };
}

// Details of one object (name lives above them). Fields come from the object's type.
export function detailsHTML(o) {
  const d = o.details;
  const fields = (TYPES[o.type].fields || []).map((f) => {
    if (f.type === 'select') return `<div class="field"><label>${f.label}</label><select data-k="${f.key}">${f.options.map((v) => `<option value="${v}" ${d[f.key] === v ? 'selected' : ''}>${v || '—'}</option>`).join('')}</select></div>`;
    if (f.type === 'skin') return `<div class="field"><label>${f.label}</label><div><input type="text" data-k="skin" value="${esc(d.skin)}" placeholder="e.g. olive">
      <div class="swatches">${SKIN_TONES.map(([n, c]) => `<button class="swatch ${d.skin === n ? 'on' : ''}" data-skin="${n}" title="${n}" style="background:${c}"></button>`).join('')}</div></div></div>`;
    return `<div class="field"><label>${f.label}</label><input type="text" data-k="${f.key}" value="${esc(d[f.key])}" placeholder="${f.placeholder || ''}"></div>`;
  }).join('');
  const custom = d.custom.map((c, i) => `<div class="customRow"><input type="text" data-ck="${i}" value="${esc(c.key)}" placeholder="detail (e.g. glasses)"><input type="text" data-cv="${i}" value="${esc(c.value)}" placeholder="value (e.g. round)"><button class="icon danger" data-crm="${i}">✕</button></div>`).join('');
  return `<h2 style="margin-top:14px">Details</h2>
    ${fields}
    <div style="margin-top:4px">${custom}</div>
    <button id="btnAddDetail">+ Add detail</button>`;
}
export function bindDetails(el, o) {
  const d = o.details;
  el.querySelectorAll('[data-k]').forEach((inp) => {
    inp.addEventListener('input', () => {
      d[inp.dataset.k] = inp.value;
      if (inp.dataset.k === 'skin') el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.skin === inp.value));
      markDirty();
    });
  });
  el.querySelectorAll('[data-skin]').forEach((b) => { b.onclick = () => { d.skin = d.skin === b.dataset.skin ? '' : b.dataset.skin; markDirty(); renderContext(); }; });
  el.querySelectorAll('[data-ck]').forEach((inp) => inp.addEventListener('input', () => { d.custom[+inp.dataset.ck].key = inp.value; markDirty(); }));
  el.querySelectorAll('[data-cv]').forEach((inp) => inp.addEventListener('input', () => { d.custom[+inp.dataset.cv].value = inp.value; markDirty(); }));
  el.querySelectorAll('[data-crm]').forEach((b) => { b.onclick = () => { d.custom.splice(+b.dataset.crm, 1); markDirty(); renderContext(); }; });
  el.querySelector('#btnAddDetail').onclick = () => { d.custom.push({ key: '', value: '' }); renderContext(); el.querySelector(`[data-ck="${d.custom.length - 1}"]`)?.focus(); };
}

// Edit mode (pose): only the articulation controls; name and details live in the object panel.
export function renderEditPanel(el) {
  const o = state.editing;
  const presets = Object.keys(POSES).map((p) => `<button data-pose="${p}">${p}</button>`).join('');
  el.innerHTML = `<h2>Posing <span style="color:var(--accent);text-transform:none;letter-spacing:0">${esc(o.details.name)}</span></h2>
    <h2 style="margin-top:12px">Presets</h2>
    <div class="presetGrid">${presets}</div>
    <div class="row"><button id="btnResetJoint" ${state.joint ? '' : 'disabled'}>Reset ${state.joint || 'joint'}</button><button id="btnMirror">Mirror L↔R</button><button id="btnResetPose">Reset pose</button></div>
    <div class="field" style="margin-top:8px"><label>Hip height</label><input type="range" id="hipY" min="0.2" max="1.1" step="0.01" value="${o.joints.pelvis.position.y}"></div>
    <p class="hint">${state.joint ? `Rotating <b>${state.joint}</b> — drag the rings.` : 'Click a joint (orange dot) or a body part to rotate it.'}</p>
    <p class="hint">Name and details (gender, clothing…) are in the object panel: press <b>Esc</b> to go back.</p>`;
  el.querySelectorAll('[data-pose]').forEach((b) => { b.onclick = () => applyPose(o, b.dataset.pose); });
  el.querySelector('#btnResetJoint').onclick = () => { if (state.joint) { o.joints[state.joint].rotation.set(0, 0, 0); markDirty(); } };
  el.querySelector('#btnMirror').onclick = () => mirrorPose(o);
  el.querySelector('#btnResetPose').onclick = () => { Object.values(o.joints).forEach((g) => g.rotation.set(0, 0, 0)); o.joints.pelvis.position.y = PELVIS_Y; markDirty(); renderContext(); };
  el.querySelector('#hipY').addEventListener('input', (e) => { o.joints.pelvis.position.y = +e.target.value; markDirty(); });
}

export function applyPose(o, name) {
  const p = POSES[name];
  Object.values(o.joints).forEach((g) => g.rotation.set(0, 0, 0));
  for (const [j, r] of Object.entries(p.joints)) o.joints[j].rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
  o.joints.pelvis.position.y = p.pelvisY ?? PELVIS_Y;
  o.details.pose = p.label;
  markDirty(); renderContext();
}
export function mirrorPose(o) {
  const saved = {};
  for (const [k, g] of Object.entries(o.joints)) saved[k] = g.rotation.clone();
  for (const k of Object.keys(o.joints)) {
    const src = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k;
    const r = saved[src];
    o.joints[k].rotation.set(r.x, -r.y, -r.z);
  }
  markDirty();
}
