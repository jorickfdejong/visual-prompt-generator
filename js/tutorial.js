/* Spotlight tour: 4 chapters, a ring around the target, a card beside it. The app stays usable underneath. */
const CHAPTERS = ['Viewport positions', 'Adding & removing objects', 'Moving puppets', 'Adding details to puppets'];
const $ = (s) => document.querySelector(s);
const vpg = () => window.vpg || {};
const st = () => vpg().state || { objects: [] };

const isPuppet = (o) => o && o.type === 'mannequin';
const selPuppet = () => { const s = st().selected; return s && s.kind === 'obj' && isPuppet(s.obj) ? s.obj : null; };
const anyPuppet = () => (st().objects || []).find(isPuppet) || null;
const camKey = () => { const c = vpg().editCam; return c ? [c.position.x, c.position.y, c.position.z].map((v) => v.toFixed(3)).join() : ''; };
const detailsKey = () => { const p = selPuppet(); try { return p ? JSON.stringify(p.details) : ''; } catch { return ''; } };
const posKey = (o) => o && o.root ? [o.root.position.x, o.root.position.y, o.root.position.z, o.root.rotation.y, o.root.scale.x].map((v) => v.toFixed(3)).join() : '';
const easy = () => document.body.classList.contains('nav-easy');

const STEPS = [
  {
    ch: 0, title: 'Look around',
    text: () => easy()
      ? 'Pick Orbit, Pan or Zoom in the bar, then drag with the left mouse button. The mouse wheel also zooms.'
      : 'Orbit: hold the middle mouse button and drag. Pan: Shift + middle mouse drag. Zoom: mouse wheel. The buttons in the small control panel do the same.',
    target: () => (easy() ? $('#easyBar') : $('#navWidget')) || $('#navWidget') || $('#easyBar'),
    tryText: 'Try it: move the view.',
    init: (c) => { c.cam = camKey(); },
    done: (c) => camKey() !== c.cam,
  },
  {
    ch: 0, title: 'The camera preview',
    text: () => 'The small window at the top right shows what your final image will look like. Click it to frame the shot. Use "Back to editor" to return.',
    target: () => $('#inset'),
    tryText: 'Try it: click the preview.',
    init: () => {},
    done: () => !!st().cameraView,
  },
  {
    ch: 1, title: 'Add an object',
    text: () => 'Press the + button (or the A key) to add a puppet, object, shape or image. Click an object in the view to select it.',
    target: () => $('#btnAdd'),
    tryText: 'Try it: add something.',
    init: (c) => { c.n = (st().objects || []).length; },
    done: (c) => (st().objects || []).length > c.n,
  },
  {
    ch: 1, title: 'Remove and undo',
    text: () => 'Select an object and press Delete to remove it. The list on the right shows everything in the scene. Made a mistake? Press Ctrl+Z to undo.',
    target: () => $('#outliner'),
    tryText: 'Try it: select an object.',
    init: () => {},
    done: () => { const s = st().selected; return !!s && s.kind !== 'camera'; },
  },
  {
    ch: 2, title: 'Move a puppet',
    text: () => 'Click a puppet. Arrows move it, rings turn it. The tools on the left switch between Move & rotate and Scale, which resizes it. Objects can also be stretched: pull a coloured box.',
    target: () => $('#toolStrip'),
    needsPuppet: true,
    tryText: 'Try it: move or turn the puppet.',
    init: (c) => { const p = selPuppet() || anyPuppet(); c.pos = posKey(p); c.obj = p; },
    done: (c) => { const p = selPuppet() || c.obj; return !!p && posKey(p) !== c.pos; },
  },
  {
    ch: 2, title: 'Change posture',
    text: () => 'Press "Change posture" or double-click the puppet. Then click an orange joint and drag the rings to bend it. Presets give quick poses. Press Esc or Done to finish.',
    target: () => (st().mode === 'edit' ? $('#editBar') : null) || $('#btnPose'),
    needsPuppet: true,
    tryText: 'Try it: open posture mode.',
    init: () => {},
    done: () => st().mode === 'edit',
  },
  {
    ch: 3, title: 'Add details',
    text: () => 'Select a puppet and open Details. Gender, clothing and the rest are optional. To add your own detail, fill in both of its fields. "Represents" says what an object is in the image.',
    target: () => $('#context'),
    needsPuppet: true,
    tryText: 'Try it: change a detail.',
    init: (c) => { c.d = detailsKey(); },
    done: (c) => { const k = detailsKey(); return !!k && k !== c.d; },
  },
  {
    ch: 3, title: 'Export',
    text: () => 'When you are happy, press Export at the top right. You get the image and the text to use together.',
    target: () => $('#btnExport'),
    tryText: 'Try it: open Export.',
    init: () => {},
    done: () => { const m = $('#exportModal'); return !!m && !m.hidden; },
  },
];

let root = null, ring = null, card = null, els = null, idx = 0, raf = 0, ctx = {}, doneFlag = false, lastKey = '';

export function tutorialOpen() { return !!root; }

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
  card.innerHTML = `<div class="tutStep" id="tutStepLbl"></div><h3 id="tutTitle"></h3>
    <p id="tutText" aria-live="polite"></p>
    <p id="tutTry" class="tutTry"></p><p id="tutHint" class="tutHint" aria-live="polite"></p>
    <div class="tutDots" id="tutDots"></div>
    <div class="tutBtns"><button type="button" id="tutBack">Back</button><button type="button" id="tutSkip" class="tutGhost">Skip</button><button type="button" id="tutNext" class="tutPrimary">Next</button></div>`;
  root.append(ring, card);
  document.body.appendChild(root);
  els = {
    lbl: card.querySelector('#tutStepLbl'), title: card.querySelector('#tutTitle'), text: card.querySelector('#tutText'),
    tryEl: card.querySelector('#tutTry'), hint: card.querySelector('#tutHint'), dots: card.querySelector('#tutDots'),
    back: card.querySelector('#tutBack'), next: card.querySelector('#tutNext'), skip: card.querySelector('#tutSkip'),
  };
  els.back.onclick = () => go(idx - 1);
  els.next.onclick = () => (idx >= STEPS.length - 1 ? endTutorial() : go(idx + 1));
  els.skip.onclick = () => endTutorial();
  STEPS.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tutDot'; b.setAttribute('aria-label', 'Go to card ' + (i + 1));
    b.onclick = () => go(i);
    els.dots.appendChild(b);
  });
  window.addEventListener('keydown', onKey, true);
  go(0, true);
  loop();
}

export function endTutorial() {
  if (!root) return;
  cancelAnimationFrame(raf);
  window.removeEventListener('keydown', onKey, true);
  root.remove();
  root = ring = card = els = null;
  try { localStorage.setItem('vpg.tutorialDone', '1'); } catch {}
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.stopPropagation();
  e.preventDefault();
  endTutorial();
}

function go(i, first) {
  idx = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[idx];
  ctx = {}; doneFlag = false; lastKey = '';
  s.init(ctx);
  els.lbl.textContent = `Step ${s.ch + 1} of ${CHAPTERS.length} · ${CHAPTERS[s.ch]}`;
  els.title.textContent = s.title;
  els.text.textContent = s.text();
  els.tryEl.textContent = '';
  els.tryEl.classList.remove('tutOk');
  els.back.disabled = idx === 0;
  els.next.textContent = idx === STEPS.length - 1 ? 'Finish' : 'Next';
  [...els.dots.children].forEach((d, k) => {
    d.classList.toggle('on', k === idx);
    d.classList.toggle('same', STEPS[k].ch === s.ch);
    if (k === idx) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
  });
  refreshDynamic(true);
  els.next.focus({ preventScroll: true });
}

// text / try line / hint that depend on the live app state
function refreshDynamic(force) {
  const s = STEPS[idx];
  const key = [easy(), !!selPuppet(), !!anyPuppet(), doneFlag].join();
  if (!force && key === lastKey) return;
  lastKey = key;
  els.text.textContent = s.text();
  let hint = '';
  if (s.needsPuppet && !selPuppet()) {
    hint = anyPuppet() ? 'Click a puppet in the view or in the list first.' : 'There is no puppet yet. Add one first with the + button.';
  }
  els.hint.textContent = hint;
  els.hint.style.display = hint ? '' : 'none';
  els.tryEl.classList.toggle('tutOk', doneFlag);
  els.tryEl.textContent = doneFlag ? '\u2713 Done' : (s.tryText || '');
}

function targetFor(s) {
  let el = null;
  if (s.needsPuppet) {
    const p = selPuppet();
    if (!p) {
      // point at the puppet's list row, or at + when there is none
      const o = anyPuppet();
      if (o) {
        const lis = [...document.querySelectorAll('#objectList li')];
        el = lis[(st().objects || []).indexOf(o)] || $('#objectList');
      } else el = $('#btnAdd');
    }
  }
  if (!el) el = s.target();
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
  if (!doneFlag) { try { if (s.done(ctx)) doneFlag = true; } catch {} }
  refreshDynamic(false);
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
