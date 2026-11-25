import { state } from './state.js';
import { inputIcon } from './input-icons.js';
import { editCam, orbit } from './scene.js';
import { selObjs } from './selection.js';
import { viewCount, viewMoving } from './views.js';
import { detailList } from './details.js';
import { inputKind, onInputKind } from './mouse-detect.js';

/* Spotlight tour: 5 steps, a ring around the target, a card beside it. The app stays usable underneath.
   Every step has tasks; Next only works when all of them are done, and a finished step cheers and opens the next one. */
const DONE_KEY = 'vpg.tutorialDone';
const $ = (s) => document.querySelector(s);
const easy = () => document.body.classList.contains('nav-easy');
// the controls of the device in use, or both while that is unknown (mouse-detect.js)
const either = (mouse, ...pad) => ({ mouse, pad: kbd(...pad) })[inputKind()] || `${mouse} or ${kbd(...pad)}`;
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
      ['orbit', () => `${easy() ? 'Rotate' : 'Orbit'}: ${either(easy() ? `${kbd('Left mouse')} drag on empty space` : `${kbd('Middle mouse')} drag`, 'Ctrl', 'Two fingers')}`],
      ['zoom', () => `Zoom: ${either(kbd('Wheel'), 'Two fingers')}`],
      ['pan', () => `Pan: ${either(easy() ? `${kbd('Right mouse')} drag` : `${kbd('Shift', 'Middle mouse')} drag`, 'Shift', 'Two fingers')}`],
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
    text: () => 'Every object gets a name, and the name goes into the prompt.',
    target: (c) => (document.body.classList.contains('placing') || c.added ? $('#viewport') : !c.did.has('add') ? ($('#addDrop').hidden ? $('#btnAdd') : $('#addDrop')) : $('#viewport')),
    tasks: [
      ['add', () => `Add an object: press the + button or ${kbd('A')}, click in the scene to place it, then type a name and press ${kbd('Enter')}`],
      ['remove', () => `Remove it: click it, then press ${kbd('Delete')}`],
    ],
    update: (c) => {
      const ids = new Set(state.objects.map((o) => o.id));
      const now = performance.now();
      if (c.ids && [...ids].some((id) => !c.ids.has(id))) c.added = now;   // only counts once naming is over
      if (c.added) {
        const naming = !!$('#nameLayer input, #nameBox'), placing = document.body.classList.contains('placing');
        if (naming || placing) c.added = now;   // the name field may show a frame after the object appeared
        else if (now - c.added > 250) c.did.add('add');
      }
      if (c.added && c.ids && [...c.ids].some((id) => !ids.has(id))) { c.did.add('add'); c.did.add('remove'); }
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
  {
    title: 'Describing the environment', like: () => 'Unity',
    text: () => 'The Environment tab describes the scene as a whole: setting, temperature and lighting. It goes into the prompt too.',
    target: () => ($('#side').dataset.tab === 'env' ? $('#worldSection') : $('#tabEnv')),
    tasks: [
      ['open', () => 'Open the Environment tab on the right'],
      ['label', () => 'Fill in a label: Environment, Temperature or Lighting'],
    ],
    update: (c) => {
      c.env0 ??= { ...state.environment };   // the step may begin with the tab already open: that counts
      if ($('#side').dataset.tab === 'env') c.did.add('open');
      if (Object.keys(state.environment).some((k) => (state.environment[k] || '').trim() && state.environment[k] !== c.env0[k])) c.did.add('label');
    },
  },
];

let off = null, root = null, ring = null, card = null, els = null, idx = 0, raf = 0, ctx = {}, lastKey = '';

/* Step changes must not interrupt the user: not mid-drag, not mid-typing (a typed field counts once committed or after a 1.5 s pause) */
let buttons = 0, lastInput = 0, lastCommit = 0;
const capture = { capture: true, passive: true };
for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mouseup', 'mousemove']) window.addEventListener(t, (e) => { buttons = e.buttons; }, capture);   // placing keeps its pointer events to itself: the mouse events still get here
window.addEventListener('blur', () => { buttons = 0; });
document.addEventListener('input', () => { lastInput = performance.now(); }, capture);
for (const t of ['change', 'focusout']) document.addEventListener(t, () => { lastCommit = performance.now(); }, capture);
const isTyping = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !/^(checkbox|radio|range|color|button)$/.test(t.type || '');
const settled = () => !buttons && !(isTyping(document.activeElement) && lastInput > lastCommit && performance.now() - lastInput < 1500);
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    <div class="tutCheer" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><path d="M15 27l8 8 14-16"/></svg><b></b><span></span></div><span class="tutSr" id="tutLive" role="status" aria-live="polite"></span>
    <div class="tutBtns"><button type="button" id="tutClose" class="tutGhost">Skip tutorial</button><button type="button" id="tutNext" class="tutPrimary">Next</button></div>`;
  root.append(ring, card);
  document.body.appendChild(root);
  els = {
    lbl: card.querySelector('#tutStepLbl'), like: card.querySelector('#tutLike'), title: card.querySelector('#tutTitle'), text: card.querySelector('#tutText'),
    tasks: card.querySelector('#tutTasks'), hint: card.querySelector('#tutHint'), cheer: card.querySelector('.tutCheer'), live: card.querySelector('#tutLive'), next: card.querySelector('#tutNext'), close: card.querySelector('#tutClose'),
  };
  els.next.onclick = () => (idx >= STEPS.length - 1 ? endTutorial() : go(idx + 1));
  els.close.onclick = endTutorial;
  const again = () => { lastKey = ''; };   // the mouse verdict changed: redraw the hints
  off = onInputKind(again);
  go(0);
  loop();
}

function endTutorial() {
  if (!root) return;
  cancelAnimationFrame(raf);
  off?.(); off = null;
  root.remove();
  root = ring = card = els = null;
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* not remembered */ }
}

function go(i) {
  idx = i;
  ctx = { did: new Set() };
  lastKey = '';
  card.classList.remove('cheer');
  els.live.textContent = '';
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
  const placing = document.body.classList.contains('placing');
  const key = [easy(), inputKind(), noObject, placing, ...ctx.did].join();
  if (key === lastKey) return;
  lastKey = key;
  els.like.textContent = `Similar to ${s.like()}`;
  els.text.innerHTML = s.text();
  els.tasks.innerHTML = s.tasks.map(([k, label]) => `<li class="${ctx.did.has(k) ? 'done' : ''}"><i aria-hidden="true">${ctx.did.has(k) ? '✓' : ''}</i><span>${label()}</span></li>`).join('');
  els.hint.textContent = placing ? 'Click in the scene to place it, then type a name.' : noObject ? 'There is no object yet. Add one first with the + button or press A.' : '';
  els.hint.hidden = !els.hint.textContent;
  els.next.disabled = !s.tasks.every(([k]) => ctx.did.has(k));
}

// all tasks done: celebrate for ~1.4 s, then open the next step (or close after the last one). No timers: the loop drives it,
// and go() / endTutorial() reset or stop it, so it cannot double-advance or fire after the end.
function cheer(s) {
  if (!s.tasks.every(([k]) => ctx.did.has(k))) return;
  const now = performance.now(), last = idx === STEPS.length - 1;
  if (!ctx.cheer) {
    if (!settled()) return;
    ctx.cheer = now;
    els.cheer.querySelector('b').textContent = last ? 'Tutorial finished!' : 'Step done!';
    els.cheer.querySelector('span').textContent = last ? 'Have fun building your scene.' : 'On to the next one.';
    els.live.textContent = last ? 'Tutorial finished.' : `Step ${idx + 1} done.`;
    card.classList.add('cheer');
    return;
  }
  if (now - ctx.cheer < (calm() ? 1000 : last ? 1800 : 1400) || !settled()) return;
  if (last) endTutorial(); else go(idx + 1);
}

function targetFor(s) {
  const el = document.body.classList.contains('placing') ? $('#viewport') : s.needsObject && !state.objects.length ? ($('#addDrop').hidden ? $('#btnAdd') : $('#addDrop')) : s.target(ctx);
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
  cheer(s);
  if (!root) return;   // the last step just closed the tour
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
  // never cover the bottom-centre toolbar: sit above it
  const tb = $('#toolStrip')?.getBoundingClientRect();
  if (tb && tb.width > 2 && px < tb.right + 6 && px + cw > tb.left - 6 && py < tb.bottom + 6 && py + ch > tb.top - 6) py = Math.max(m, tb.top - ch - 10);
  card.style.transform = `translate(${Math.round(px)}px,${Math.round(py)}px)`;
}
