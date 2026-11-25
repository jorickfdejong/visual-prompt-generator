import * as THREE from 'three';
import { state } from './state.js';
import { editCam, orbit, renderer, vp } from './scene.js';
import { pilot, shotCam } from './camera.js';
import { isEasy } from './nav-mode.js';

/* =====================================================================
   NAVIGATION: wheel / trackpad / pinch, Space + drag, Alt + drag, and the floating button that shows the names.
   Works on the active controls (`pilot` in camera view, else `orbit`). OrbitControls keeps the mouse buttons
   (middle = orbit, right / Shift + middle = pan); its wheel zoom is off (see blenderControls) and handled here.
   Only used inside event handlers, so the import cycles are harmless.
   ===================================================================== */
const canvas = renderer.domElement;
const _off = new THREE.Vector3(), _sph = new THREE.Spherical(), _d = new THREE.Vector3();

function active() {
  const c = state.cameraView && pilot ? pilot : orbit;
  return c && c.enabled ? c : null;
}
function camOf(c) { return c === pilot ? shotCam : editCam; }
function finish(c) { c.update(); }   // pilot 'change' -> markDirty; the orbit view needs no dirty flag

// drag-equivalent orbit, in CSS pixels (same speed as OrbitControls rotating)
export function orbitBy(dx, dy) {
  const c = active(); if (!c) return;
  const cam = camOf(c), h = vp.clientHeight || 1;
  _off.copy(cam.position).sub(c.target);
  _sph.setFromVector3(_off);
  _sph.theta -= 2 * Math.PI * dx / h;
  _sph.phi -= 2 * Math.PI * dy / h;
  _sph.phi = THREE.MathUtils.clamp(_sph.phi, 0.0001, Math.PI - 0.0001);
  _sph.makeSafe();
  _off.setFromSpherical(_sph);
  cam.position.copy(c.target).add(_off);
  finish(c);
}
// drag-equivalent pan, screen-scaled by distance and fov like OrbitControls (the scene follows the pointer)
export function panBy(dx, dy) {
  const c = active(); if (!c) return;
  const cam = camOf(c), h = vp.clientHeight || 1;
  const dist = cam.position.distanceTo(c.target) * Math.tan((cam.fov / 2) * Math.PI / 180);
  const k = 2 * dist / h;
  _d.set(-dx * k, dy * k, 0).applyQuaternion(cam.quaternion);
  cam.position.add(_d);
  c.target.add(_d);
  finish(c);
}
function zoomBy(factor, at = null) {
  const c = active(); if (!c) return;
  const cam = camOf(c);
  _off.copy(cam.position).sub(c.target);
  const before = _off.length();
  const len = THREE.MathUtils.clamp(_off.length() * factor, Math.max(c.minDistance || 0, 0.05), c.maxDistance || Infinity);
  _off.setLength(len);
  cam.position.copy(c.target).add(_off);
  if (at && c === orbit) {   // keep what is under the pointer in place
    const r = canvas.getBoundingClientRect(), k = (before - len) * Math.tan((cam.fov / 2) * Math.PI / 180);
    const nx = ((at.clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((at.clientY - r.top) / r.height) * 2;
    _d.set(nx * k * cam.aspect, ny * k, 0).applyQuaternion(cam.quaternion);
    cam.position.add(_d);
    c.target.add(_d);
  }
  finish(c);
}

/* ---------- wheel ---------- */
let lastTrackpad = 0, padMode = '';
// is the Ctrl key really held? (tells Ctrl + two fingers from a pinch)
let ctrlDown = false;
for (const t of ['keydown', 'keyup', 'pointermove', 'pointerdown']) window.addEventListener(t, (e) => { ctrlDown = e.ctrlKey; }, true);
window.addEventListener('blur', () => { ctrlDown = false; });
const cap = (v, m) => Math.max(-m, Math.min(m, v));
function onWheel(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  // scrollable overlays keep their own scrolling unless Ctrl is held (then only the page zoom is blocked)
  if (!ctrl && e.target.closest?.('#helpPanel, #fileDrop, #addDrop')) return;
  e.preventDefault();
  if (!active()) return;
  const now = performance.now();
  const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? vp.clientHeight : 1;
  const dx = e.deltaX * unit, dy = e.deltaY * unit;
  const wd = e.wheelDeltaY;
  const pinch = e.ctrlKey && !ctrlDown;   // browsers report a trackpad pinch as a wheel with Ctrl set, without the key
  const mouse = !pinch && (e.deltaMode !== 0 ||
    (e.deltaX === 0 && wd && wd % 120 === 0 && now - lastTrackpad >= 250));
  if (mouse) {
    // wheel notch: exponential zoom (Shift may turn the wheel into horizontal-only)
    zoomBy(Math.exp(cap(dy || dx, 100) * 0.0012), isEasy() ? e : null);
    return;
  }
  let mode = pinch ? 'pinch' : ctrl ? 'orbit' : e.shiftKey || e.altKey ? 'pan' : 'zoom';
  // the scroll still coasting after the key is released keeps doing what it did, instead of turning into a zoom
  if (mode === 'zoom' && (padMode === 'orbit' || padMode === 'pan') && now - lastTrackpad < 100) mode = padMode;
  lastTrackpad = now;
  padMode = mode;
  if (mode === 'pinch') zoomBy(Math.exp(cap(dy, 30) * 0.012), isEasy() ? e : null);
  else if (mode === 'orbit') orbitBy(-cap(dx, 200), -cap(dy, 200));
  else if (mode === 'pan') panBy(-cap(dx, 200), -cap(dy, 200));   // as is: Shift may deliver only deltaX
  else zoomBy(Math.exp(cap(dy, 100) * 0.003), isEasy() ? e : null);
}
vp.addEventListener('wheel', onWheel, { passive: false });

/* ---------- Safari pinch ---------- */
let gScale = 1;
vp.addEventListener('gesturestart', (e) => { e.preventDefault(); gScale = e.scale || 1; });
vp.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  if (e.scale) { zoomBy(gScale / e.scale); gScale = e.scale; }
});
vp.addEventListener('gestureend', (e) => e.preventDefault());

/* ---------- Space + left-drag = pan, Alt + left-drag = orbit ---------- */
let space = false;
const typing = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
function setSpace(v) { space = v; vp.classList.toggle('nav-space', v); }
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || typing(e.target)) return;
  if (e.target.tagName !== 'BUTTON') e.preventDefault();
  if (e.target.tagName !== 'BUTTON') setSpace(true);
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') setSpace(false); });
window.addEventListener('blur', () => setSpace(false));

let drag = null;
vp.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target !== canvas || typing(document.activeElement)) return;
  if (!space && !e.altKey) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, do: space ? 'pan' : 'orbit' };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}, true);
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.do === 'pan') panBy(dx, dy); else orbitBy(dx, dy);
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- middle drag: Shift pans, also when it is pressed after the drag began ---------- */
// stops the glide of the previous drag, so a pan does not turn the view along
const _p = new THREE.Vector3(), _t = new THREE.Vector3();
function stopGlide(c) {
  const cam = camOf(c), damping = c.enableDamping;
  _p.copy(cam.position); _t.copy(c.target);
  c.enableDamping = false;
  c.update();   // uses up what is left of the glide
  c.enableDamping = damping;
  cam.position.copy(_p); c.target.copy(_t);
  c.update();
}
let mid = null;   // { id, x, y, pan } of a middle drag that OrbitControls started as an orbit
vp.addEventListener('pointerdown', (e) => {
  const c = active();
  if (!c || e.target !== canvas || e.pointerType === 'touch') return;
  if (e.button === 2 || (e.button === 1 && e.shiftKey)) stopGlide(c);
  if (e.button === 1) mid = e.shiftKey || e.ctrlKey || e.metaKey ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, pan: false };
}, true);
vp.addEventListener('pointermove', (e) => {
  if (!mid || e.pointerId !== mid.id) return;
  const dx = e.clientX - mid.x, dy = e.clientY - mid.y;
  mid.x = e.clientX; mid.y = e.clientY;
  if (!mid.pan && e.shiftKey && active()) { mid.pan = true; stopGlide(active()); }   // stays a pan until the button is released
  if (!mid.pan) return;
  e.stopPropagation();   // OrbitControls would turn the view
  panBy(dx, dy);
}, true);
for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, (e) => { if (mid && e.pointerId === mid.id) mid = null; }, true);

