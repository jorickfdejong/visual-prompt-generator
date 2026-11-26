import { state } from './state.js';
import { vp } from './scene.js';

/* Tutorial step 1: a spotlight on the part of the scene to drag in, with a small animation of the gesture in it.
   The gesture follows the device: a mouse with the right button lit, or fingers on a trackpad.
   key: the same key text as in Controls ('Left mouse', 'Shift + Two fingers', 'Wheel', ...); null hides it. */
let el = null, shown = '', spot = null, checkedAt = 0, down = false;
window.addEventListener('pointerdown', (e) => { if (vp.contains(e.target)) down = true; }, true);
window.addEventListener('pointerup', () => { down = false; }, true);

const MOUSE = (lit) => `<g class="tgMouse"><rect x="-11" y="-17" width="22" height="34" rx="11"/>
  ${lit === 'Left' ? '<path class="lit" d="M-1 -16.9A11 11 0 0 0 -11 -6v3H-1z"/>' : ''}
  ${lit === 'Right' ? '<path class="lit" d="M1 -16.9A11 11 0 0 1 11 -6v3H1z"/>' : ''}
  <path d="M0 -17v14M-11 -3h22"/>${lit === 'Middle' || lit === 'Wheel' ? '<rect class="lit" x="-2.5" y="-13" width="5" height="8" rx="2.5"/>' : ''}</g>`;
const FINGER = (x = 0, y = 0) => `<circle class="tgFinger" cx="${x}" cy="${y}" r="7"/>`;

function art(key) {
  const parts = key.split(' + '), main = parts.at(-1), mods = parts.slice(0, -1);
  let body, cls, label;
  if (/mouse/.test(main)) { body = MOUSE(main.split(' ')[0]); cls = 'drag'; label = 'Drag here'; }
  else if (main === 'Wheel') { body = `${MOUSE('Wheel')}<path class="tgChev up" d="M18 -6l5-5 5 5"/><path class="tgChev dn" d="M18 6l5 5 5-5"/>`; cls = 'wheel'; label = 'Scroll here'; }
  else if (main === 'One finger') { body = `<rect class="tgPad" x="-40" y="-22" width="80" height="44" rx="8"/><g class="tgMove">${FINGER()}</g>`; cls = 'drag'; label = 'Drag here'; }
  else if (mods.length) { body = `<rect class="tgPad" x="-40" y="-22" width="80" height="44" rx="8"/><g class="tgMove">${FINGER(-8)}${FINGER(8)}</g>`; cls = 'drag'; label = 'Scroll here'; }
  else { body = `<rect class="tgPad" x="-40" y="-22" width="80" height="44" rx="8"/><g class="tgPinchA">${FINGER(-6, 6)}</g><g class="tgPinchB">${FINGER(6, -6)}</g>`; cls = 'pinch'; label = 'Pinch or scroll here'; }
  const hold = mods.length ? `<span class="tgHold">hold ${mods.map((m) => `<kbd>${m}</kbd>`).join(' + ')}</span>` : '';
  return { cls, html: `<span class="tgPulse"></span><svg viewBox="-60 -40 120 80" aria-hidden="true"><g transform="translate(0 0)">${body}</g></svg><span class="tgLabel">${hold}${label}</span>` };
}

// the spotlight: centred left to right, a bit below the middle of the scene; the tutorial card sits GAP to its right (tutorial.js)
const GAP = 20;
function findSpot() {
  const r = vp.getBoundingClientRect(), q = (s) => document.querySelector(s)?.getBoundingClientRect();
  const floor = Math.min(r.bottom, ...[q('#toolStrip'), q('#viewBar')].filter((b) => b && b.width > 2).map((b) => b.top)) - 14;
  const x = r.left + r.width / 2, cw = document.querySelector('#tutCard')?.offsetWidth || 300;
  const w = Math.max(200, Math.min(360, 2 * (window.innerWidth - 12 - cw - GAP - x))), h = 180;   // narrower when the card would not fit next to it
  const y = Math.max(r.top + h / 2 + 8, Math.min(floor - h / 2, r.top + r.height * 0.58 - 30));
  return { x, y, w, h, dx: 0 };   // the drawing sits in the middle of the spotlight, always at the same place
}

export function showGesture(root, key, done = false) {
  if (!key || state.mode !== 'compose' || state.cameraView) { if (el) el.hidden = true; shown = ''; return; }
  if (!el || !root.contains(el)) { el = document.createElement('div'); el.id = 'tutGesture'; root.append(el); }   // after the spotlight: not dimmed by it
  if (key !== shown) { const a = art(key); el.className = a.cls; el.innerHTML = a.html; shown = key; }
  const now = performance.now();
  if (!spot || (!down && now - checkedAt > 250)) { spot = findSpot(); checkedAt = now; }   // not while dragging: it would move away under the pointer
  el.hidden = false;
  el.classList.toggle('busy', down);
  el.classList.toggle('done', done);
  el.style.transform = `translate(${Math.round(spot.x + spot.dx)}px,${Math.round(spot.y)}px)`;
}
// the area the spotlight shrinks to, or null when there is no gesture to show
export function gestureRect() {
  if (!el || el.hidden || !spot) return null;
  return { left: spot.x - spot.w / 2, top: spot.y - spot.h / 2, width: spot.w, height: spot.h };
}
export function hideGesture() { el?.remove(); el = null; shown = ''; spot = null; }
