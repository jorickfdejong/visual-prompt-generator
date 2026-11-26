import { state } from './state.js';
import { editCam, orbit } from './scene.js';
import { keysHTML, navKeys, selObjs } from './selection.js';
import { viewCount, viewMoving } from './views.js';
import { detailList } from './details.js';
import { envComplete } from './env-check.js';
import { unfinished } from './doll-check.js';
import { celebrate } from './tutorial-finish.js';
import { lockTo, unlock } from './tutorial-lock.js';
import { inputKind, onInputKind } from './mouse-detect.js';
import { showGesture, hideGesture, gestureRect } from './tutorial-gesture.js';

/* Spotlight tour: 5 steps, a ring around the target, a card beside it. The app stays usable underneath.
   Next only works when all tasks of the step are done, and then plays a short animation (tutorial.css). */
const DONE_KEY = 'vpg.tutorialDone';
const $ = (s) => document.querySelector(s);
// Use the same orbit, pan, and zoom instructions as the Controls panel.
const navRow = (what) => navKeys(inputKind() === 'pad').find(([, t]) => what.test(t)) || ['Middle mouse', 'Drag to orbit'];
const nav = (what) => { const row = navRow(what); return `${row[1]} ${keysHTML(row[0])}`; };

// remembers every object it has seen, so anything that happens to one of them can be noticed
function watch(c, value) {
  c.seen ??= new Map();
  for (const o of state.objects) if (!c.seen.has(o.id)) c.seen.set(o.id, value(o));
}
const changed = (c, pick) => state.objects.some((o) => isDoll(o) && pick(o, c.seen.get(o.id)));

// true once a value has stood still for a moment: the first letter of a word does not end the task
function settled(c, value) {
  if (c.value !== value) { c.value = value; c.valueAt = performance.now(); }
  return performance.now() - c.valueAt > 1000;
}
// the whole tour is about a doll: everybody adds one, and the tasks after that only count for dolls
const isDoll = (o) => o.type === 'mannequin';
// after dragging or scrolling in the scene, the spotlight and the card wait a moment before moving on to the next task, so the result can be seen first
let down = null, dragEndAt = 0;
addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, moved: false }; }, true);
addEventListener('pointermove', (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true; }, true);
addEventListener('pointerup', () => { if (down?.moved) dragEndAt = performance.now(); down = null; }, true);
addEventListener('wheel', () => { dragEndAt = performance.now(); }, { capture: true, passive: true });
const justDragged = () => !!down?.moved || performance.now() - dragEndAt < 700;
let shownDid = null;
// the context the spotlight, arrow, gesture and card follow: the ticks of a moment ago while a drag has just happened
function viewCtx() {
  if (!shownDid || !justDragged()) shownDid = new Set(ctx.did);
  return { ...ctx, did: shownDid };
}
const selDolls = () => selObjs().filter(isDoll);
const ready = () => envComplete() && !unfinished().length;

const ENTER = '<kbd class="tutEnter" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 5v7a3 3 0 0 1-3 3H5M9 10.5 4.5 15 9 19.5"/></svg></kbd>';
const scaleButton = () => $('#toolStrip [data-tool="scale"]');
const pressScale = (c) => c.did.has('move') && c.did.has('turn') && !c.did.has('tool');
// what the step still has to be given before it can go on: '' or 'doll'
const missing = (s) => (s.needsDoll?.(ctx) && !state.objects.some((o) => isDoll(o) && !o.hidden) ? 'doll' : '');

const STEPS = [
  {
    title: 'Viewport positions', use: { view: '#viewBar' },   // use: the buttons that work during a task (tutorial-lock.js); '*' = the whole step
    text: () => 'Look around the scene from every side.',
    target: (c) => (c.did.size === 3 && !c.did.has('view') ? $('#viewBar') : $('#viewport')), underPreview: true,   // the spotlight on the view buttons once the dragging is done
    gesture: (c) => { const k = ['orbit', 'zoom', 'pan'].find((t) => !c.did.has(t)); return k && navRow(k === 'orbit' ? /orbit|rotate/ : new RegExp(k))[0]; },   // where and how to drag (tutorial-gesture.js)
    tasks: [
      ['orbit', () => nav(/orbit|rotate/)],
      ['zoom', () => nav(/zoom/)],
      ['pan', () => nav(/pan/)],
      ['view', () => `Switch between views by pressing Front, Left, Right, Back or Top ${keysHTML('1-5')}`],
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
      if (zoom < 1e-5) c.slid = (c.slid || 0) + slide;   // zooming towards the pointer also shifts the target
      if (c.turned > 0.15) c.did.add('orbit');   // a short drag is enough
      if (c.zoomed > 0.4) c.did.add('zoom');
      if (c.slid > 0.8) c.did.add('pan');
    },
  },
  {
    title: 'Adding a doll', besideMenu: true, use: { '*': '#btnAdd, #btnAddDoll' },
    target: (c) => (document.body.classList.contains('placing') || c.added ? $('#viewport') : !c.did.has('name') ? ($('#addDrop').hidden ? $('#btnAdd') : $('#btnAddDoll')) : $('#viewport')),
    tasks: [
      ['open', () => `Press the highlighted button or ${keysHTML('A')}`],
      ['pick', () => 'Select <b>Doll</b>'],
      ['place', () => 'Click in the scene to place the doll'],
      ['name', () => 'Type a name for the doll and press Enter'],
    ],
    update: (c) => {
      const tick = (n) => ['open', 'pick', 'place', 'name'].slice(0, n).forEach((k) => c.did.add(k));   // a later task also ticks the ones before it
      if (!$('#addDrop').hidden) tick(1);
      if (document.body.classList.contains('placing')) tick(2);
      const ids = new Set(state.objects.filter(isDoll).map((o) => o.id));
      const now = performance.now();
      if (c.ids && [...ids].some((id) => !c.ids.has(id))) { c.added = now; tick(3); }
      if (c.added) {
        const naming = !!$('#nameLayer input, #nameBox'), placing = document.body.classList.contains('placing');
        if (naming || placing) c.added = now;   // the name field may show a frame after the object appeared
        else if (now - c.added > 250) tick(4);   // naming is over
      }
      if (c.added && c.ids && !c.did.has('name') && [...c.ids].some((id) => !ids.has(id))) { c.added = 0; c.did.delete('place'); }   // removed instead of named: place one again
      c.ids = ids;
    },
  },
  {
    title: 'Moving & scaling a doll', use: { '*': '#toolStrip [data-tool]' },
    target: (c) => (pressScale(c) ? scaleButton() : $('#viewport')), needsDoll: () => true, overPanel: true,
    beside: pressScale,   // the spotlight on the scale button only, with the card next to it
    arrow: (c) => (!c.did.has('turn') && state.tool === 'scale' ? $('#toolStrip [data-tool="transform"]') : null),   // the rings are not there in scaling mode
    tasks: [
      ['move', () => 'Move the doll by dragging their body or one of the arrows'],
      ['turn', () => 'Select a doll and turn it by dragging the green ring'],
      ['tool', () => `Press the scale button at the bottom ${keysHTML('S')}`],
      ['scale', () => 'Select a doll and scale it by dragging the square handle'],
    ],
    update: (c) => {
      watch(c, (o) => ({ q: o.root.quaternion.clone(), s: o.root.scale.clone() }));
      // turning and scaling also shift an object a little: only the frames in which it just moves count
      for (const o of state.objects) {
        const { position: p, quaternion: q, scale: k } = o.root, last = c.last?.get(o.id);
        if (isDoll(o) && last && last.q.equals(q) && last.k.equals(k)) c.moved = (c.moved || 0) + last.p.distanceTo(p);
      }
      c.last = new Map(state.objects.map((o) => [o.id, { p: o.root.position.clone(), q: o.root.quaternion.clone(), k: o.root.scale.clone() }]));
      if (c.moved > 0.05) c.did.add('move');
      if (changed(c, (o, was) => o.root.quaternion.angleTo(was.q) > 0.05)) c.did.add('turn');
      if (state.tool === 'scale') c.did.add('tool');
      if (state.tool === 'scale' && changed(c, (o, was) => ['x', 'y', 'z'].some((k) => Math.abs(Math.log(o.root.scale[k] / was.s[k])) > Math.log(1.05)))) c.did.add('scale');
    },
  },
  {
    title: 'Adding details to a doll', atTop: true,
    use: { '*': '#tabScene, #objectList', detail: '#context', open: '#tabEnv', label: '#tabEnv, #imageSection' },
    note: ['detail', 'The details show above the doll. All details go into the prompt.'],   // highlighted, below that task
    target: (c) => (c.did.has('detail') ? ($('#side').dataset.tab === 'env' ? $('#imageSection') : $('#tabEnv'))
      : selDolls().length ? ($('#side').dataset.tab === 'scene' ? $('#context') : $('#tabScene')) : $('#viewport')),
    needsDoll: (c) => !c.did.has('detail'),
    tasks: [
      ['select', () => `Select a doll ${keysHTML('Click')}`],
      ['detail', () => 'Fill in the mandatory (<span class="req">*</span>) object details'],
      ['open', () => 'Open the World tab on the right'],
      ['label', () => 'Fill in the mandatory (<span class="req">*</span>) world details'],
    ],
    update: (c) => {
      const key = (o) => JSON.stringify(detailList(o));
      if (selDolls().length) c.did.add('select');
      const still = settled(c, state.objects.map(key).join() + JSON.stringify(state.environment) + state.visualStyle);
      const dolls = selDolls(), todo = unfinished();
      if (still && dolls.length && !dolls.some((o) => todo.includes(o))) c.did.add('detail');
      if ($('#side').dataset.tab === 'env') c.did.add('open');   // also when the step began with it open
      if (still && envComplete()) c.did.add('label');
    },
  },
  {
    title: 'Generating the prompt', centered: true,
    get use() { return { '*': ready() ? '#btnExport' : '#btnExport, #tabScene, #tabEnv, #objectList, #context, #imageSection' }; },   // something is still missing (another doll, or emptied again): it can be filled in here
    text: () => 'All the details you fill in show up in your prompt: names, object details and the world.<br><br>Finished with your scene? Press <b>Generate prompt</b> to get the text and the images.',
    target: () => $(!ready() && $('.envCheckMsg') ? '#side' : '#btnExport'),
    tasks: [],   // only explains: Finish is available right away
    update: () => {},
  },
];

let lastPlace = null, off = null, root = null, ring = null, arrow = null, card = null, els = null, idx = 0, raf = 0, ctx = {}, lastKey = '';

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
  arrow.innerHTML = '<svg viewBox="0 0 24 30"><path class="edge" d="M12 2v24M3 17l9 9 9-9"/><path d="M12 2v24M3 17l9 9 9-9"/></svg>';
  arrow.hidden = true;
  card = document.createElement('div');
  card.id = 'tutCard';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'tutTitle');
  card.innerHTML = `<div class="tutTop"><span class="tutStep" id="tutStepLbl"></span></div><h3 id="tutTitle"></h3>
    <p id="tutText"></p><ul id="tutTasks" aria-live="polite"></ul><p id="tutHint" class="tutHint" aria-live="polite"></p>
    <span class="tutSr" id="tutLive" role="status" aria-live="polite"></span>
    <div class="tutBtns"><button type="button" id="tutClose" class="tutGhost">Skip tutorial</button><span class="tutNextWrap"><button type="button" id="tutNext" class="tutPrimary" aria-describedby="tutNextTip">Next</button><span id="tutNextTip" role="tooltip"></span></span></div>`;
  root.append(ring, card, arrow);
  document.body.appendChild(root);
  els = {
    lbl: card.querySelector('#tutStepLbl'), title: card.querySelector('#tutTitle'), text: card.querySelector('#tutText'),
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
  lockTo(card, usable);
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
  unlock();
  hideGesture();
  root.remove();
  root = ring = arrow = card = els = null;
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* not remembered */ }
}

function go(i) {
  idx = i;
  ctx = { did: new Set() };
  lastPlace = null;
  shownDid = null;
  lastKey = '';
  els.live.textContent = '';
  els.lbl.textContent = `Step ${idx + 1} of ${STEPS.length}`;
  els.title.textContent = STEPS[idx].title;
  const last = idx === STEPS.length - 1;
  els.next.innerHTML = last ? 'Finish 🎉' : 'Next' + ENTER;
  els.next.setAttribute('aria-label', last ? 'Finish' : 'Next');
  els.next.classList.toggle('tutFinish', last);
  els.close.hidden = last;   // nothing left to skip
  els.next.blur();   // Enter and Space belong to the app again
  refresh();
}

// everything that depends on the live app state
function refresh() {
  const s = STEPS[idx];
  const lack = missing(s);
  const placing = document.body.classList.contains('placing');
  const key = [inputKind(), lack, placing, ...ctx.did].join();
  if (key === lastKey) return;
  lastKey = key;
  els.text.innerHTML = s.text?.() || '';
  els.text.hidden = !s.text;
  const now = s.tasks.findIndex(([k]) => !ctx.did.has(k));
  els.tasks.innerHTML = s.tasks.map(([k, label], i) => {
    const done = ctx.did.has(k), cls = done ? 'done' : i === now ? 'now' : 'later';
    return `<li class="${cls}"${cls === 'now' ? ' aria-current="step"' : ''}><i aria-hidden="true">${done ? '✓' : ''}</i><span>${label(ctx)}</span></li>${s.note?.[0] === k && cls !== 'later' ? `<li class="tutNote">${s.note[1]}</li>` : ''}`;
  }).join('');
  els.hint.textContent = placing && !s.besideMenu ? 'Click in the scene to place it, then type a name.' : lack ? `There is no ${lack} yet. Add one first with the + button.` : '';
  els.hint.hidden = !els.hint.textContent;
  const done = s.tasks.every(([k]) => ctx.did.has(k));
  els.next.disabled = !done;
  card.querySelector('#tutNextTip').textContent = done ? '' : "You haven't done all the steps yet";
  els.live.textContent = done ? (idx === STEPS.length - 1 ? 'Tutorial finished. Press Finish.' : `Step ${idx + 1} done. Press Next to continue.`) : '';
}

function targetFor(s) {
  const el = document.body.classList.contains('placing') ? $('#viewport') : missing(s) ? ($('#addDrop').hidden ? $('#btnAdd') : $('#btnAddDoll')) : s.target(viewCtx());
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

// the first task that is not done yet is highlighted and decides which buttons work; a task done early is ticked and skipped later
function usable() {
  const s = STEPS[idx], now = (s.tasks.find(([k]) => !ctx.did.has(k)) || s.tasks.at(-1))?.[0];
  return [s.use?.['*'], s.use?.[now], missing(s) && '#btnAdd, #btnAddDoll'].filter(Boolean).join(', ');
}

function loop() {
  if (!root) return;
  const s = STEPS[idx];
  s.update(ctx);
  refresh();
  layout(targetFor(s), s.besideMenu || missing(s) ? menuRect() : null);
  const v = viewCtx();
  pointArrow(rectOf(s.arrow?.(v)));
  const was = s.gesture?.(v);
  showGesture(root, was, was !== s.gesture?.(ctx));   // done: the drawing goes at once, the spotlight stays a moment
  focusGesture(gestureRect());
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
  const view = STEPS[idx].atTop && r && !menuSpace && rectOf($('#viewport'));   // wide and flat at the top of the viewport: the selected object stays visible
  card.classList.toggle('wide', !!view);
  card.style.width = view ? Math.min(540, view.width - 2 * m) + 'px' : '';
  const cw = Math.min(card.offsetWidth || 300, W - 2 * m), ch = card.offsetHeight || 200;
  if (!r) {
    ring.classList.remove('tutRound');
    ring.style.display = 'none';
    root.classList.add('tutNoTarget');
    place(Math.round((W - cw) / 2), Math.max(m, H - ch - 24));
    return;
  }
  root.classList.remove('tutNoTarget');
  ring.style.display = 'block';
  const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
  const w = Math.min(W - x, r.width + 2 * pad), h = Math.min(H - y, r.height + 2 * pad);
  if (!ring.classList.contains('tutRound')) {   // drawn by focusGesture: setting it twice a frame restarts its transition
    ring.style.transform = `translate(${x}px,${y}px)`;
    ring.style.width = w + 'px'; ring.style.height = h + 'px';
  }
  if (menuSpace) {
    const right = menuSpace.right + 20;
    place(right + cw + m <= W || menuSpace.left - 20 - cw < m ? right : menuSpace.left - 20 - cw, menuSpace.bottom - ch);
    return;
  }
  if (view) { place(view.right - cw - m, view.top + m); return; }
  if (STEPS[idx].centered) {   // the middle of the screen; of the viewport while details still have to be filled in on the right
    const v = r.height > H / 2 && rectOf($('#viewport'));
    place(v ? v.left + (v.width - cw) / 2 : (W - cw) / 2, (H - ch) / 2);
    return;
  }
  if (STEPS[idx].beside?.(viewCtx())) { place(x + w + 20, y + (h - ch) / 2); return; }   // to the right of the spotlight, 20px from it
  const panel = STEPS[idx].overPanel && rectOf($('#side'));   // at the bottom of the side panel, so the gizmo and the toolbar stay free
  if (panel) { place(panel.left + (panel.width - cw) / 2, panel.bottom - ch - m); return; }
  if (STEPS[idx].gesture) {   // step 1: next to the drag spotlight, then to the right of the view buttons; it stays at the last place
    const g = gestureRect(), a = !g && r.height < 100 && r;   // a: the view buttons
    if (a) lastPlace = [a.right + pad + 20, a.top + (a.height - ch) / 2];   // to the right of the spotlight, 20px from it
    else if (g) lastPlace = [g.left + g.width + 20, g.top + (g.height - ch) / 2];
    if (lastPlace) { place(...lastPlace); return; }
  }
  if (STEPS[idx].underPreview) { place(r.right - cw - m, (rectOf($('#inset'))?.bottom ?? r.top) + m); return; }   // top right of the viewport, below the camera preview
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

// a drag task: the spotlight is a rounded box around the place to drag instead of the whole viewport
function focusGesture(g) {
  ring.classList.toggle('tutRound', !!g);
  if (!g) return;
  root.classList.remove('tutNoTarget');
  ring.style.display = 'block';
  ring.style.transform = `translate(${Math.round(g.left)}px,${Math.round(g.top)}px)`;
  ring.style.width = g.width + 'px'; ring.style.height = g.height + 'px';
}

// sits above its target, pointing down at it
function pointArrow(r) {
  arrow.hidden = !r;
  if (r) arrow.style.transform = `translate(${Math.round(r.left + r.width / 2 - 16)}px,${Math.round(r.top - 50)}px)`;
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
