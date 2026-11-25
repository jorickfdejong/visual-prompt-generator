/* =====================================================================
   MOUSE OR TRACKPAD — a browser cannot list input devices, so the one used last is taken from what it sends.
   inputKind() is 'mouse', 'pad' or null (unknown: show both). Remembered per browser; the other device takes over as soon as it is used.
   body.has-mouse hides every .padOnly hint, body.has-pad every .mouseOnly one.
   Mouse: a wheel notch, the middle button, or a drag with the right button. A notch is a wheelDelta of a multiple of 120
   (deltaY is no use: it is scaled by the screen and page zoom) that is not part of a finer scroll.
   Trackpad: three finer scroll or pinch events in a row.
   Limit: a high-resolution mouse wheel scrolls as finely as a trackpad.
   Passive capture listeners only; they never touch the events. ===================================================================== */
const KEY = 'vpg.inputKind';
const listeners = new Set();
let kind = null, fine = 0, fineAt = -1e9, pending = 0, ctrl = false, right = null;
try { kind = { mouse: 'mouse', pad: 'pad' }[localStorage.getItem(KEY)] || null; } catch { /* unknown */ }
function show() {
  document.body.classList.toggle('has-mouse', kind === 'mouse');
  document.body.classList.toggle('has-pad', kind === 'pad');
}
show();

export const inputKind = () => kind;
export const onInputKind = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function set(k) {
  if (k === kind) return;
  kind = k;
  try { localStorage.setItem(KEY, k); } catch { /* not remembered */ }
  show();
  listeners.forEach((fn) => fn());
}

const opt = { capture: true, passive: true };
for (const t of ['keydown', 'keyup', 'pointermove', 'pointerdown']) window.addEventListener(t, (e) => { ctrl = e.ctrlKey; }, opt);
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (e.button === 1) set('mouse');
  right = e.button === 2 ? [e.clientX, e.clientY] : null;
}, opt);
window.addEventListener('pointermove', (e) => {
  if (right && !(e.buttons & 2)) right = null;
  if (right && Math.hypot(e.clientX - right[0], e.clientY - right[1]) > 12) { right = null; set('mouse'); }
}, opt);
window.addEventListener('wheel', (e) => {
  const now = performance.now(), x = e.wheelDeltaX || 0, y = e.wheelDeltaY || 0;   // Shift turns a notch sideways
  const pinch = e.ctrlKey && !ctrl;   // a pinch comes as Ctrl without the key
  if (e.deltaMode === 1 || (!pinch && !!x !== !!y && (x || y) % 120 === 0)) {
    // a finer scroll can hit a multiple of 120 by chance: wait whether more of it follows
    if (now - fineAt > 300 && !pending) pending = setTimeout(() => { pending = 0; set('mouse'); }, 100);
    return;
  }
  if (!pinch && !x && !y) return;
  clearTimeout(pending); pending = 0;
  fine = now - fineAt < 300 ? fine + 1 : 1;
  fineAt = now;
  if (fine >= 3) set('pad');
}, opt);
