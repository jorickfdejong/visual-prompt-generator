import * as THREE from 'three';
import { state } from './state.js';
import { editCam, orbit, renderer, vp } from './scene.js';
import { pilot, resetCamera, shotCam } from './camera.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   NAVIGATION: wheel / trackpad / pinch, Space + drag, Alt + drag, and the floating camera-controls widget.
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
function orbitBy(dx, dy) {
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
function panBy(dx, dy) {
  const c = active(); if (!c) return;
  const cam = camOf(c), h = vp.clientHeight || 1;
  const dist = cam.position.distanceTo(c.target) * Math.tan((cam.fov / 2) * Math.PI / 180);
  const k = 2 * dist / h;
  _d.set(-dx * k, dy * k, 0).applyQuaternion(cam.quaternion);
  cam.position.add(_d);
  c.target.add(_d);
  finish(c);
}
function zoomBy(factor) {
  const c = active(); if (!c) return;
  const cam = camOf(c);
  _off.copy(cam.position).sub(c.target);
  const len = THREE.MathUtils.clamp(_off.length() * factor, Math.max(c.minDistance || 0, 0.05), c.maxDistance || Infinity);
  _off.setLength(len);
  cam.position.copy(c.target).add(_off);
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
    zoomBy(Math.exp(cap(dy || dx, 100) * 0.0012));
    return;
  }
  let mode = pinch ? 'pinch' : ctrl ? 'orbit' : e.shiftKey || e.altKey ? 'pan' : 'zoom';
  // the scroll still coasting after the key is released keeps doing what it did, instead of turning into a zoom
  if (mode === 'zoom' && (padMode === 'orbit' || padMode === 'pan') && now - lastTrackpad < 100) mode = padMode;
  lastTrackpad = now;
  padMode = mode;
  if (mode === 'pinch') zoomBy(Math.exp(cap(dy, 30) * 0.012));
  else if (mode === 'orbit') orbitBy(-cap(dx, 200), -cap(dy, 200));
  else if (mode === 'pan') panBy(-cap(dx, 200), -cap(dy, 200));   // as is: Shift may deliver only deltaX
  else zoomBy(Math.exp(cap(dy, 100) * 0.003));
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
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: space };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}, true);
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) panBy(dx, dy); else orbitBy(dx, dy);
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- reset view ---------- */
function resetView() {
  const c = active(); if (!c) return;
  if (c === pilot) {
    resetCamera();
    const dir = shotCam.getWorldDirection(new THREE.Vector3());
    let d = 5;
    const vis = state.objects.filter((o) => !o.hidden);
    if (vis.length) d = THREE.MathUtils.clamp(Math.min(...vis.map((o) => o.root.position.distanceTo(shotCam.position))), 1, 30);
    pilot.target.copy(shotCam.position).addScaledVector(dir, d);
    pilot.update();
    markDirty();
    return;
  }
  const dir = new THREE.Vector3(5.5, 4.5 - 0.9, 8.5).normalize();
  if (state.mode === 'edit' && state.editing) {
    const o = state.editing, t = new THREE.Vector3();
    o.joints.chest.getWorldPosition(t);
    orbit.target.copy(t);
    editCam.position.copy(t).addScaledVector(dir, 2.6 * o.root.scale.x + 0.6);
  } else {
    orbit.target.set(0, 0.9, 0);
    editCam.position.set(5.5, 4.5, 8.5);
  }
  orbit.update();
}

/* ---------- floating widget ---------- */
const ICONS = {
  names: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/><circle cx="12" cy="12" r="1.6"/>',
  pan: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M4 4v5h5"/>',
};
const widget = document.createElement('div');
widget.id = 'navWidget';
widget.setAttribute('role', 'group');
widget.setAttribute('aria-label', 'Camera controls');
function mk(id, tip, key, icon) {
  const b = document.createElement('button');
  b.type = 'button'; b.id = id; b.dataset.tip = tip; b.dataset.key = key;
  b.setAttribute('aria-label', tip + (key ? ` (${key.replaceAll('\n', ', ')})` : ''));
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  widget.appendChild(b);
  return b;
}
mk('btnNames', 'Show object names', 'N', 'names').setAttribute('aria-pressed', 'false');   // wired in main.js, kept in step by labels.js
const bRot = mk('navRotate', 'Orbit', 'Drag this button\nMiddle mouse drag\nAlt + left drag\nCtrl + two fingers', 'rotate');
const bPan = mk('navPan', 'Pan', 'Drag this button\nShift + middle mouse drag\nRight drag\nSpace + left drag\nShift + two fingers', 'pan');
const bOut = mk('navZoomOut', 'Zoom out', 'Hold this button\nMouse wheel down\nTwo fingers or pinch', 'minus');
const bIn = mk('navZoomIn', 'Zoom in', 'Hold this button\nMouse wheel up\nTwo fingers or pinch', 'plus');
const bReset = mk('navReset', 'Reset view', '', 'reset');
vp.appendChild(widget);
widget.addEventListener('contextmenu', (e) => e.preventDefault());

function padDrag(btn, fn, arrowStep) {
  let id = null, lx = 0, ly = 0;
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    id = e.pointerId; lx = e.clientX; ly = e.clientY;
    btn.setPointerCapture(id); btn.classList.add('held'); e.preventDefault();
  });
  btn.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    fn(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
  });
  const up = (e) => { if (e.pointerId === id) { id = null; btn.classList.remove('held'); } };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('keydown', (e) => {
    const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!m) return;
    e.preventDefault(); fn(m[0] * arrowStep, m[1] * arrowStep);
  });
}
padDrag(bRot, orbitBy, 12);
padDrag(bPan, panBy, 12);

function holdRepeat(btn, factor) {
  let delay = null, timer = null;
  const stop = () => { clearTimeout(delay); clearInterval(timer); delay = timer = null; btn.classList.remove('held'); };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); btn.classList.add('held');
    zoomBy(factor);
    delay = setTimeout(() => { timer = setInterval(() => zoomBy(factor), 45); }, 320);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach((t) => btn.addEventListener(t, stop));
  btn.addEventListener('click', (e) => { if (e.detail === 0) zoomBy(factor); });   // keyboard activation
}
holdRepeat(bOut, 1.06);
holdRepeat(bIn, 1 / 1.06);
bReset.addEventListener('click', resetView);
