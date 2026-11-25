import { state } from './state.js';
import { inputIcon } from './input-icons.js';
import { editCam, orbit } from './scene.js';
import { selObjs } from './selection.js';
import { viewCount, viewMoving } from './views.js';
import { detailList } from './details.js';

/* Spotlight tour: 4 steps, a ring around the target, a card beside it. The app stays usable underneath.
   Every step has tasks; Next only works when all of them are done. */
const DONE_KEY = 'vpg.tutorialDone';
const $ = (s) => document.querySelector(s);
const easy = () => document.body.classList.contains('nav-easy');
const kbd = (...keys) => inputIcon(keys.join(' + ')) + keys.map((k) => `<kbd>${k}</kbd>`).join(' + ');

// remembers every object it has seen, so anything that happens to one of them can be noticed
function watch(c, value) {
  c.seen ??= new Map();
  for (const o of state.objects) if (!c.seen.has(o.id)) c.seen.set(o.id, value(o));
}
const changed = (c, pick) => state.objects.some((o) => pick(o, c.seen.get(o.id)));

const STEPS = [
  {
    title: 'Viewport positions', like: () => (easy() ? 'Sketchfab' : 'Blender'),
    text: () => 'Look around the scene from every side.',
    target: (c) => $(c.did.size === 3 && !c.did.has('view') ? '#viewBar' : '#viewport'),
    tasks: [
      ['orbit', () => `Orbit: ${easy() ? `${kbd('Left mouse')} drag on empty space` : `${kbd('Middle mouse')} drag`} or ${kbd('Ctrl', 'Two fingers')}`],
      ['zoom', () => `Zoom: ${kbd('Wheel')} or ${kbd('Two fingers')}`],
      ['pan', () => `Pan: ${easy() ? `${kbd('Right mouse')} drag` : `${kbd('Shift', 'Middle mouse')} drag`} or ${kbd('Shift', 'Two fingers')}`],
      ['view', () => `Pick a standard view: Front, Right, Back, Left or Above (${kbd('1')} to ${kbd('5')})`],
    ],
    update: (c) => {
      const view = state.mode === 'compose' && !state.cameraView && { off: editCam.position.clone().sub(orbit.target), target: orbit.target.clone() };
      const prev = c.prev;
      c.prev = view;
      c.views ??= viewCount();
      if (viewCount() > c.views) c.did.add('view');
      if (!view || !prev || viewMoving()) return;
      const zoom = Math.abs(Math.log(view.off.length() / prev.off.length()));
      const turn = view.off.angleTo(prev.off);
      const slide = view.target.distanceTo(prev.target);
      c.zoomed = (c.zoomed || 0) + zoom;
      c.turned = (c.turned || 0) + turn;
      if (zoom < 1e-5 && turn < 1e-5) c.slid = (c.slid || 0) + slide;   // zooming towards the pointer also shifts the target
      if (c.turned > 0.15) c.did.add('orbit');
      if (c.zoomed > 0.08) c.did.add('zoom');
      if (c.slid > 0.15) c.did.add('pan');
    },
  },
  {
    title: 'Adding & removing objects', like: () => 'PowerPoint',
    text: () => `Made a mistake? ${kbd('Ctrl', 'Z')} undoes it.`,
    target: (c) => (!c.did.has('add') ? ($('#addDrop').hidden ? $('#btnAdd') : $('#addDrop')) : $('#viewport')),
    tasks: [
      ['add', () => `Add an object: press the + button or ${kbd('A')}`],
      ['remove', () => `Remove it: click it, then press ${kbd('Delete')}`],
    ],
    update: (c) => {
      const ids = new Set(state.objects.map((o) => o.id));
      if (c.ids && [...ids].some((id) => !c.ids.has(id))) c.did.add('add');
      if (c.did.has('add') && c.ids && [...c.ids].some((id) => !ids.has(id))) c.did.add('remove');
      c.ids = ids;
    },
  },
  {
    title: 'Moving objects', like: () => (easy() ? 'Tinkercad' : 'Blender'),
    text: () => 'Drag an object to slide it over the floor, or click it to get the gizmo: arrows move it, rings turn it.',
    target: () => $('#viewport'), needsObject: true,
    tasks: [
      ['move', () => `Move: ${kbd('Left mouse')} drag an object, drag an arrow or press ${kbd('← ↑ ↓ →')}`],
      ['turn', () => 'Turn: drag a ring of the gizmo'],
    ],
    update: (c) => {
      watch(c, (o) => ({ p: o.root.position.clone(), q: o.root.quaternion.clone() }));
      if (changed(c, (o, was) => o.root.position.distanceTo(was.p) > 0.05)) c.did.add('move');
      if (changed(c, (o, was) => o.root.quaternion.angleTo(was.q) > 0.05)) c.did.add('turn');
    },
  },
  {
    title: 'Adding details to objects', like: () => 'Figma',
    text: () => 'Details show above the object and go into the prompt.',
    target: () => (selObjs().length ? ($('#side').dataset.tab === 'scene' ? $('#context') : $('#tabScene')) : $('#viewport')), needsObject: true,
    tasks: [
      ['select', () => `Select an object: ${kbd('Click')} it`],
      ['detail', () => 'Fill in a detail in the panel on the right'],
    ],
    update: (c) => {
      const key = (o) => JSON.stringify(detailList(o));
      watch(c, key);
      if (selObjs().length) c.did.add('select');
      if (changed(c, (o, was) => key(o) !== was && detailList(o).length)) c.did.add('detail');
    },
  },
];

let root = null, ring = null, card = null, els = null, idx = 0, raf = 0, ctx = {}, lastKey = '';

export function tutorialDone() { try { return !!localStorage.getItem(DONE_KEY); } catch { return true; } }

// skipping counts as done: it does not come back on the next visit (it can be started again from the ? panel)
export function startTutorial() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'tutRoot';
  ring = document.createElement('div');
  ring.id = 'tutRing';
  card = document.createElement('div');
  card.id = 'tutCard';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'tutTitle');
  card.innerHTML = `<div class="tutTop"><span class="tutStep" id="tutStepLbl"></span><span class="simPill" id="tutLike"></span></div><h3 id="tutTitle"></h3>
    <p id="tutText"></p><ul id="tutTasks" aria-live="polite"></ul><p id="tutHint" class="tutHint" aria-live="polite"></p>
    <div class="tutBtns"><button type="button" id="tutClose" class="tutGhost">Skip tutorial</button><button type="button" id="tutNext" class="tutPrimary">Next</button></div>`;
  root.append(ring, card);
  document.body.appendChild(root);
  els = {
    lbl: card.querySelector('#tutStepLbl'), like: card.querySelector('#tutLike'), title: card.querySelector('#tutTitle'), text: card.querySelector('#tutText'),
    tasks: card.querySelector('#tutTasks'), hint: card.querySelector('#tutHint'), next: card.querySelector('#tutNext'), close: card.querySelector('#tutClose'),
  };
  els.next.onclick = () => (idx >= STEPS.length - 1 ? endTutorial() : go(idx + 1));
  els.close.onclick = endTutorial;
  go(0);
  loop();
}

function endTutorial() {
  if (!root) return;
  cancelAnimationFrame(raf);
  root.remove();
  root = ring = card = els = null;
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* not remembered */ }
}

function go(i) {
  idx = i;
  ctx = { did: new Set() };
  lastKey = '';
  els.lbl.textContent = `Step ${idx + 1} of ${STEPS.length}`;
  els.title.textContent = STEPS[idx].title;
  els.next.textContent = idx === STEPS.length - 1 ? 'Finish' : 'Next';
  els.next.blur();   // Enter and Space belong to the app again
  refresh();
}

// everything that depends on the live app state
function refresh() {
  const s = STEPS[idx];
  const noObject = s.needsObject && !state.objects.length;
  const key = [easy(), noObject, ...ctx.did].join();
  if (key === lastKey) return;
  lastKey = key;
  els.like.textContent = `Similar to ${s.like()}`;
  els.text.innerHTML = s.text();
  els.tasks.innerHTML = s.tasks.map(([k, label]) => `<li class="${ctx.did.has(k) ? 'done' : ''}"><i aria-hidden="true">${ctx.did.has(k) ? '✓' : ''}</i><span>${label()}</span></li>`).join('');
  els.hint.textContent = noObject ? 'There is no object yet. Add one first with the + button.' : '';
  els.hint.hidden = !noObject;
  els.next.disabled = !s.tasks.every(([k]) => ctx.did.has(k));
}

function targetFor(s) {
  const el = s.needsObject && !state.objects.length ? ($('#addDrop').hidden ? $('#btnAdd') : $('#addDrop')) : s.target(ctx);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || el.closest('[hidden]')) return null;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  return r;
}

function loop() {
  if (!root) return;
  const s = STEPS[idx];
  s.update(ctx);
  refresh();
  layout(targetFor(s));
  raf = requestAnimationFrame(loop);
}

function layout(r) {
  const W = window.innerWidth, H = window.innerHeight, m = 12, pad = 6;
  const cw = Math.min(card.offsetWidth || 300, W - 2 * m), ch = card.offsetHeight || 200;
  if (!r) {
    ring.style.display = 'none';
    root.classList.add('tutNoTarget');
    place(Math.round((W - cw) / 2), Math.max(m, H - ch - 24));
    return;
  }
  root.classList.remove('tutNoTarget');
  ring.style.display = 'block';
  const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
  const w = Math.min(W - x, r.width + 2 * pad), h = Math.min(H - y, r.height + 2 * pad);
  ring.style.transform = `translate(${x}px,${y}px)`;
  ring.style.width = w + 'px'; ring.style.height = h + 'px';
  const gap = 14, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const spaces = { right: W - (x + w), left: x, below: H - (y + h), above: y };
  const fits = {
    right: spaces.right >= cw + gap + m, left: spaces.left >= cw + gap + m,
    below: spaces.below >= ch + gap + m, above: spaces.above >= ch + gap + m,
  };
  const order = ['below', 'right', 'left', 'above'];
  const side = order.find((k) => fits[k]);
  let px, py;
  if (side === 'below') { py = y + h + gap; px = cx - cw / 2; }
  else if (side === 'above') { py = y - ch - gap; px = cx - cw / 2; }
  else if (side === 'right') { px = x + w + gap; py = cy - ch / 2; }
  else if (side === 'left') { px = x - cw - gap; py = cy - ch / 2; }
  else {
    // nothing fits cleanly: bottom centre, or top if the target sits there
    px = (W - cw) / 2;
    py = cy > H / 2 ? m : H - ch - 24;
  }
  place(px, py);
}

function place(px, py) {
  const W = window.innerWidth, H = window.innerHeight, m = 12;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  px = Math.max(m, Math.min(W - cw - m, px));
  py = Math.max(m, Math.min(H - ch - m, py));
  card.style.transform = `translate(${Math.round(px)}px,${Math.round(py)}px)`;
}
