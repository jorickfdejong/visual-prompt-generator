import * as THREE from 'three';
import { state } from './state.js';
import { vp } from './scene.js';
import { TYPES } from './types.js';
import { removeObject } from './objects.js';
import { selectObject, selObjs } from './selection.js';
import { renderContext, renderObjectList, setName } from './left-panel.js';
import { headTop } from './labels.js';
import { camel } from './relations.js';
import { markDirty } from './prompt-panel.js';
import { toast } from './clipboard.js';

/* =====================================================================
   REQUIRED NAMES — a new object gets an input at its own label, and the rest of the app waits until it has a name.
   body.naming is set meanwhile (persistence.js then adds no undo step, so adding + naming is one step).
   ===================================================================== */
const HINT = 'Give it a name to continue';
const queue = [];   // { o, opts, done }
let cur = null;     // the one being named: { ...queued, gate, box, input, msg }

// Asks for a name; resolves to true when named, false when the object was removed (or disappeared).
// opts: remove(o) and removeLabel replace the default "Remove object"
export function requireName(o, opts = {}) {
  return new Promise((done) => { queue.push({ o, opts, done }); if (!cur) next(); });
}
// opts.exists(o): for objects that do not live in state.objects
const alive = ({ o, opts }) => (opts.exists ? opts.exists(o) : state.objects.includes(o));
export const namingObject = () => cur?.o || null;
let idle = [];
export const whenNamed = () => (cur ? new Promise((r) => idle.push(r)) : Promise.resolve());

const noun = (o) => (o.type === 'mannequin' ? 'doll' : TYPES[o.type]?.baseName || 'object');
// why this is not a name of their own ('' = it is one)
function problem(raw) {
  const id = camel(raw);
  if (!raw.trim()) return HINT;
  if (!id) return 'Use letters or numbers in the name';
  const auto = Object.values(TYPES).some((t) => new RegExp('^' + t.baseName + '\\d+$', 'i').test(id));
  return auto ? `“${raw.trim()}” is an automatic name. Think of your own name` : '';
}
function next() {
  while (queue.length && !alive(queue[0])) queue.shift().done(false);
  if (!queue.length) {
    document.body.classList.remove('naming');
    document.querySelector('#app').inert = false;
    idle.forEach((r) => r()); idle = [];
    return;
  }
  cur = queue.shift();
  const { o, opts } = cur;
  document.activeElement?.blur?.();   // commits whatever was being typed elsewhere
  document.body.classList.add('naming');
  document.querySelector('#app').inert = true;
  if (!o.hidden && !selObjs().includes(o)) selectObject(o);
  const gate = document.createElement('div'), box = document.createElement('div');
  gate.id = 'nameGate'; box.id = 'nameBox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `Name this ${noun(o)}`);
  box.innerHTML = `<label for="nameBoxInput">Name in the prompt<span class="req" aria-hidden="true">*</span></label><input aria-required="true" id="nameBoxInput" type="text" maxlength="40" spellcheck="false" autocomplete="off" aria-describedby="nameMsg"><p id="nameMsg" role="status"></p>
    <div><button type="button" class="nameRemove"></button><button type="button" class="nameOk primary">OK</button></div>`;
  const input = box.querySelector('input'), msg = box.querySelector('p');
  Object.assign(cur, { gate, box, input, msg });
  box.querySelector('.nameRemove').textContent = opts.removeLabel || 'Remove object';
  box.querySelector('.nameRemove').onclick = () => finish(false);
  box.querySelector('.nameOk').onclick = submit;
  input.addEventListener('input', () => { box.classList.remove('bad'); msg.textContent = ''; });
  gate.addEventListener('pointerdown', (e) => { e.preventDefault(); refuse(); });
  gate.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  gate.addEventListener('contextmenu', (e) => e.preventDefault());
  box.addEventListener('focusout', () => setTimeout(() => { if (cur?.box === box && !allowed(document.activeElement)) input.focus(); }));
  document.body.append(gate, box);
  place();
  input.focus();
  tick();
}
// the tutorial card stays usable
const allowed = (el) => !!el?.closest?.('#nameBox, #tutRoot');
function refuse() {
  const { box, input, msg } = cur;
  msg.textContent = problem(input.value) || 'Press Enter to use this name';
  box.classList.add('bad');
  box.classList.remove('shake');
  void box.offsetWidth;   // restarts the animation
  box.classList.add('shake');
  input.focus();
}
function submit() {
  if (problem(cur.input.value)) refuse(); else finish(true);
}
function finish(keep) {
  const { o, opts, input, gate, box, done } = cur, there = alive(cur);
  cur = null;
  gate.remove(); box.remove();
  if (there && keep) {
    const raw = input.value.trim();
    setName(o, raw);
    if (o.details.name !== camel(raw)) toast(`That name is taken: this one is called “${o.details.name}”`);
    renderObjectList(); renderContext();
  } else if (there) (opts.remove || removeObject)(o);
  markDirty();
  done(there && keep);
  next();
}

/* ---------- at the object, inside the window, and not under the tutorial card ---------- */
const M = 8;
function place() {
  const { o, box } = cur, r = vp.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
  let top = null;
  if (!state.cameraView && o.root) top = headTop(o, r.width, r.height);
  if (!top || !Number.isFinite(top.x + top.y)) top = { x: r.width / 2, y: r.height / 2 };
  const maxX = Math.max(M, innerWidth - bw - M), maxY = Math.max(M, innerHeight - bh - M);
  const fit = (x, y) => [THREE.MathUtils.clamp(x, M, maxX), THREE.MathUtils.clamp(y, M, maxY)];
  // inside the viewport first, then inside the window
  let [x, y] = fit(THREE.MathUtils.clamp(r.left + top.x - bw / 2, r.left + M, Math.max(r.left + M, r.right - bw - M)),
    THREE.MathUtils.clamp(r.top + top.y - 12 - bh, r.top + M, Math.max(r.top + M, r.bottom - bh - M)));
  const card = document.querySelector('#tutCard')?.getBoundingClientRect();
  if (card) {
    const hits = (a, b) => a < card.right + M && a + bw > card.left - M && b < card.bottom + M && b + bh > card.top - M;
    if (hits(x, y)) {
      const free = [[card.left - bw - M, y], [card.right + M, y], [x, card.top - bh - M], [x, card.bottom + M]]
        .filter(([a, b]) => { const [c, d] = fit(a, b); return Math.abs(a - c) + Math.abs(b - d) < 1; })
        .sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y));
      if (free.length) [x, y] = free[0];
    }
  }
  box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(y) + 'px';
}
function tick() {
  const box = cur?.box;
  if (!box) return;
  if (!alive(cur)) { finish(false); return; }   // another scene was loaded
  place();
  requestAnimationFrame(() => { if (cur?.box === box) tick(); });
}

/* ---------- nothing else hears the keyboard or a dropped file ---------- */
window.addEventListener('keydown', (e) => {
  if (!cur || e.isComposing) return;
  e.stopImmediatePropagation();
  const inBox = cur.box.contains(e.target), k = e.key.toLowerCase();
  if (e.key === 'Tab') {
    e.preventDefault();
    const all = [cur.input, ...cur.box.querySelectorAll('button'), ...document.querySelectorAll('#tutCard button:not(:disabled)')];
    all[(all.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
  } else if (e.key === 'Escape') { e.preventDefault(); refuse(); }
  else if (e.key === 'Enter' && e.target === cur.input) { e.preventDefault(); if (!e.repeat) submit(); }
  else if ((e.ctrlKey || e.metaKey) && 'sodgpy'.includes(k) && k.length === 1) e.preventDefault();
  else if (!inBox && !allowed(e.target)) {
    if (!/^F\d+$/.test(e.key) && !(e.ctrlKey || e.metaKey)) e.preventDefault();
    cur.input.focus();
  }
}, true);
for (const t of ['dragover', 'drop']) window.addEventListener(t, (e) => {
  if (!cur) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (t === 'drop') refuse(); else e.dataTransfer.dropEffect = 'none';
}, true);
