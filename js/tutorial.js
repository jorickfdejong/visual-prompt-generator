import { state } from './state.js';
import { inputIcon } from './input-icons.js';
import { editCam, orbit } from './scene.js';
import { selObjs } from './selection.js';
import { viewCount, viewMoving } from './views.js';
import { detailList } from './details.js';
import { celebrate } from './tutorial-finish.js';
import { inputKind, onInputKind } from './mouse-detect.js';

/* Spotlight tour: 6 steps, a ring around the target, a card beside it. The app stays usable underneath.
   Next only works when all tasks of the step are done, and then plays a short animation (tutorial.css). */
const DONE_KEY = 'vpg.tutorialDone';
const $ = (s) => document.querySelector(s);
const easy = () => document.body.classList.contains('nav-easy');
// the controls of the device in use (mouse-detect.js)
const either = (mouse, pad) => (inputKind() === 'pad' ? pad : mouse);
const kbd = (...keys) => inputIcon(keys.join(' + ')) + keys.map((k) => `<kbd>${k}</kbd>`).join(' + ');

// remembers every object it has seen, so anything that happens to one of them can be noticed
function watch(c, value) {
  c.seen ??= new Map();
  for (const o of state.objects) if (!c.seen.has(o.id)) c.seen.set(o.id, value(o));
}
const changed = (c, pick) => state.objects.some((o) => pick(o, c.seen.get(o.id)));

const scaleButton = () => $('#toolStrip [data-tool="scale"]');
// what the step still has to be given before it can go on: '', 'object' or 'puppet'
const missing = (s) => (s.needsObject && !state.objects.length ? 'object' : s.needsDoll?.(ctx) && !state.objects.some((o) => o.type === 'mannequin') ? 'puppet' : '');

const STEPS = [
  {
    title: 'Viewport positions',
    text: () => 'Look around the scene from every side.',
    target: () => $('#viewport'),
    arrow: (c) => (c.did.size === 3 && !c.did.has('view') ? $('#viewBar') : null),   // points there without moving the spotlight, so a pan is not interrupted
    tasks: [
      ['orbit', () => easy() ? `Rotate: ${either(`${kbd('Left mouse')} drag`, `${kbd('One finger')} press and drag`)}` : `Orbit: ${either(`${kbd('Middle mouse')} drag`, `${kbd('Ctrl', 'Two fingers')} scroll`)}`],
      ['zoom', () => easy() ? `Zoom: ${either(`${kbd('Wheel')} scroll`, `${kbd('Two fingers')} scroll`)}` : `Zoom: ${either(`${kbd('Wheel')} scroll`, `${kbd('Two fingers')} scroll`)}`],
      ['pan', () => easy() ? `Pan: ${either(`${kbd('Right mouse')} drag`, `${kbd('Shift', 'Two fingers')} scroll`)}` : `Pan: ${either(`${kbd('Shift', 'Middle mouse')} drag`, `${kbd('Shift', 'Two fingers')} scroll`)}`],
      ['view', () => 'Pick a standard view: Front, Right, Back, Left or Above'],
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
    title: 'Adding & removing objects', besideMenu: true,
    target: (c) => (document.body.classList.contains('placing') || c.added ? $('#viewport') : !c.did.has('name') ? ($('#addDrop').hidden ? $('#btnAdd') : $('#addDrop')) : $('#viewport')),
    tasks: [
      ['open', () => 'Press the +'],
      ['pick', () => 'Select an object'],
      ['place', () => 'Click in the scene to place it'],
      ['name', () => 'Type a name and press Enter'],
      ['remove', () => 'Remove it: Click it, then press Delete'],
    ],
    update: (c) => {
      const tick = (n) => ['open', 'pick', 'place', 'name', 'remove'].slice(0, n).forEach((k) => c.did.add(k));   // a later task also ticks the ones before it
      if (!$('#addDrop').hidden) tick(1);
      if (document.body.classList.contains('placing')) tick(2);
      const ids = new Set(state.objects.map((o) => o.id));
      const now = performance.now();
      if (c.ids && [...ids].some((id) => !c.ids.has(id))) { c.added = now; tick(3); }
      if (c.added) {
        const naming = !!$('#nameLayer input, #nameBox'), placing = document.body.classList.contains('placing');
        if (naming || placing) c.added = now;   // the name field may show a frame after the object appeared
        else if (now - c.added > 250) tick(4);   // naming is over
      }
      if (c.added && c.ids && [...c.ids].some((id) => !ids.has(id))) {
        if (c.did.has('name')) tick(5);
        else { c.added = 0; c.did.delete('place'); }   // removed instead of named: place one again
      }
      c.ids = ids;
    },
  },
  {
    title: 'Moving & scaling objects',
    text: () => 'Drag an object to slide it over the floor, or click it to get the gizmo: arrows move it, rings turn it. The scaling button makes it bigger or smaller.',
    target: () => $('#viewport'), needsObject: true, overPanel: true,
    needsDoll: (c) => c.did.has('move') && c.did.has('turn') && !c.did.has('scale'),
    arrow: (c) => (c.did.has('move') && c.did.has('turn') && !c.did.has('tool') ? scaleButton() : null),
    tasks: [
      ['move', () => `Move: ${either(`${kbd('Left mouse')} drag`, `${kbd('One finger')} press and drag`)} an object or an arrow`],
      ['turn', () => 'Turn: drag a ring of the gizmo'],
      ['tool', () => 'Press the scaling button at the bottom'],
      ['scale', () => 'Scale up a puppet: click it, then drag the handle outwards'],
    ],
    update: (c) => {
      watch(c, (o) => ({ p: o.root.position.clone(), q: o.root.quaternion.clone(), s: o.root.scale.y }));
      if (changed(c, (o, was) => o.root.position.distanceTo(was.p) > 0.05)) c.did.add('move');
      if (changed(c, (o, was) => o.root.quaternion.angleTo(was.q) > 0.05)) c.did.add('turn');
      if (state.tool === 'scale') c.did.add('tool');
      if (state.tool === 'scale' && changed(c, (o, was) => o.type === 'mannequin' && o.root.scale.y > was.s * 1.05)) c.did.add('scale');
    },
  },
  {
    title: 'Adding details to objects',
    note: 'Details show above the object and go into the prompt.',   // highlighted, below the tasks
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
    title: 'Describing the environment',
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
  {
    title: 'Generating the prompt',
    text: () => 'All the details you fill in show up in your prompt: names, object details and the environment.<br><br>Finished with your scene? Press <b>Generate prompt</b> to get the text and the images.',
    target: () => $('#btnExport'),
    tasks: [],   // only explains: Finish is available right away
    update: () => {},
  },
];

let off = null, root = null, ring = null, arrow = null, card = null, els = null, idx = 0, raf = 0, ctx = {}, lastKey = '';

export function tutorialDone() { try { return !!localStorage.getItem(DONE_KEY); } catch { return true; } }

// skipping counts as done: it does not come back on the next visit (it can be started again from the ? panel)
export function startTutorial() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'tutRoot';
  ring = document.createElement('div');
  ring.id = 'tutRing';
  arrow = document.createElement('div');
  arrow.id = 'tutArrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML = '<svg viewBox="0 0 24 30"><path d="M12 2v24M3 17l9 9 9-9"/></svg>';
  arrow.hidden = true;
  card = document.createElement('div');
  card.id = 'tutCard';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'tutTitle');
  card.innerHTML = `<div class="tutTop"><span class="tutStep" id="tutStepLbl"></span></div><h3 id="tutTitle"></h3>
    <p id="tutText"></p><ul id="tutTasks" aria-live="polite"></ul><p id="tutNote" class="tutNote"></p><p id="tutHint" class="tutHint" aria-live="polite"></p>
    <span class="tutSr" id="tutLive" role="status" aria-live="polite"></span>
    <div class="tutBtns"><button type="button" id="tutClose" class="tutGhost">Skip tutorial</button><button type="button" id="tutNext" class="tutPrimary">Next</button></div>`;
  root.append(ring, card, arrow);
  document.body.appendChild(root);
  els = {
    lbl: card.querySelector('#tutStepLbl'), title: card.querySelector('#tutTitle'), text: card.querySelector('#tutText'), note: card.querySelector('#tutNote'),
    tasks: card.querySelector('#tutTasks'), hint: card.querySelector('#tutHint'), live: card.querySelector('#tutLive'), next: card.querySelector('#tutNext'), close: card.querySelector('#tutClose'),
  };
  els.next.onclick = () => {
    if (idx < STEPS.length - 1) { go(idx + 1); return; }
    endTutorial();
    celebrate();
  };
  els.close.onclick = endTutorial;
  const again = () => { lastKey = ''; };   // the mouse verdict changed: redraw the hints
  off = onInputKind(again);
  go(0);
  loop();
}

// Enter = Next, once it is available. Fields, placing, naming, open windows and buttons reached with Tab keep their own Enter.
let tabbed = false, held = false;
window.addEventListener('pointerdown', () => { tabbed = false; }, true);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') tabbed = true;
  if (e.key === 'Enter' && e.repeat && held) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // still the press that went on: the app does not get it
  held = false;
  if (!root || e.key !== 'Enter' || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || els.next.disabled) return;
  const t = e.target;
  if (t.isContentEditable || t.closest?.('input, textarea, select') || (tabbed && t.closest?.('button, a, [role=button]'))) return;
  if (document.body.matches('.placing, .naming') || document.querySelector('#navAsk') || ['#exportModal', '#addDrop', '#fileDrop', '#helpPanel'].some((q) => !$(q).hidden)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  held = true;
  els.next.click();
}, true);

function endTutorial() {
  if (!root) return;
  cancelAnimationFrame(raf);
  off?.(); off = null;
  root.remove();
  root = ring = arrow = card = els = null;
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* not remembered */ }
}

function go(i) {
  idx = i;
  ctx = { did: new Set() };
  lastKey = '';
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
  const lack = missing(s);
  const placing = document.body.classList.contains('placing');
  const key = [easy(), inputKind(), lack, placing, ...ctx.did].join();
  if (key === lastKey) return;
  lastKey = key;
  els.text.innerHTML = s.text?.() || '';
  els.text.hidden = !s.text;
  els.note.textContent = s.note || '';
  els.note.hidden = !s.note;
  els.tasks.innerHTML = s.tasks.map(([k, label]) => `<li class="${ctx.did.has(k) ? 'done' : ''}"><i aria-hidden="true">${ctx.did.has(k) ? '✓' : ''}</i><span>${label()}</span></li>`).join('');
  els.hint.textContent = placing && !s.besideMenu ? 'Click in the scene to place it, then type a name.' : lack ? `There is no ${lack} yet. Add one first with the + button.` : '';
  els.hint.hidden = !els.hint.textContent;
  const done = s.tasks.every(([k]) => ctx.did.has(k));
  els.next.disabled = !done;
  els.live.textContent = done ? (idx === STEPS.length - 1 ? 'Tutorial finished. Press Finish.' : `Step ${idx + 1} done. Press Next to continue.`) : '';
}

function targetFor(s) {
  const el = document.body.classList.contains('placing') ? $('#viewport') : missing(s) ? ($('#addDrop').hidden ? $('#btnAdd') : $('#addDrop')) : s.target(ctx);
  return rectOf(el);
}
function rectOf(el) {
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
  layout(targetFor(s), s.besideMenu || missing(s) ? menuRect() : null);
  pointArrow(rectOf(s.arrow?.(ctx)));
  raf = requestAnimationFrame(loop);
}

// where the add menu is, or will be once it opens: the card leaves that space free, so it does not jump when the menu opens
let menu = null, menuKey = '';
function menuRect() {
  const drop = $('#addDrop'), b = $('#btnAdd').getBoundingClientRect();
  if (b.width < 2) return null;
  const key = [window.innerWidth, window.innerHeight, b.left, b.top].join();
  if (key !== menuKey) {
    const was = drop.hidden;
    drop.hidden = false;   // measured and hidden again before anything is painted
    menu = drop.getBoundingClientRect();
    drop.hidden = was;
    menuKey = key;
  }
  return menu;
}

function layout(r, menuSpace) {
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
  if (menuSpace) {
    const right = menuSpace.right + 20;
    place(right + cw + m <= W || menuSpace.left - 20 - cw < m ? right : menuSpace.left - 20 - cw, menuSpace.bottom - ch);
    return;
  }
  const panel = STEPS[idx].overPanel && rectOf($('#side'));   // over the side panel, so the gizmo and the toolbar stay free
  if (panel) { place(panel.left + (panel.width - cw) / 2, panel.top + 150); return; }
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

// sits above its target, pointing down at it
function pointArrow(r) {
  arrow.hidden = !r;
  if (r) arrow.style.transform = `translate(${Math.round(r.left + r.width / 2 - 12)}px,${Math.round(r.top - 38)}px)`;
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
