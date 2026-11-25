import * as THREE from 'three';
import { state } from './state.js';
import { editCam, orbit, vp } from './scene.js';

/* =====================================================================
   STANDARD VIEWS — front, left, right, back and top, keeping the distance and turning around the middle of the scene
   (in pose mode: around the doll), wherever the view was panned to.
   The side views look down diagonally at a point a bit above the floor, so it sits below the middle of the viewport.
   Front looks at a new doll's face (it faces +Z); left and right are as seen from there.
   ===================================================================== */
const TILT = THREE.MathUtils.degToRad(65);   // side views look down diagonally (90 = straight from the side)
const VIEWS = [   // label, theta, phi
  ['Front', 0, TILT], ['Left', -Math.PI / 2, TILT], ['Right', Math.PI / 2, TILT], ['Back', Math.PI, TILT], ['Top', 0, 0.0001],
];
const CENTER = orbit.target.clone();   // where a new scene starts: the middle of the floor
const TIME = 280;
const LIFT = 0.16;   // lowest height a side view looks at, per unit of distance
let raf = 0, count = 0;
export const viewMoving = () => !!raf;
export const viewCount = () => count;   // how often a view was picked
function stop() { cancelAnimationFrame(raf); raf = 0; }

export function showView(i) {
  if (state.cameraView || !orbit.enabled) return;
  stop();
  count++;
  const [, theta, phi] = VIEWS[i];
  const s = new THREE.Spherical().setFromVector3(editCam.position.clone().sub(orbit.target));
  const from = orbit.target.clone(), to = CENTER.clone();
  if (state.mode === 'edit') state.editing.joints.chest.getWorldPosition(to);   // pose mode stays on the doll
  else if (phi > 0.1) to.y = Math.max(to.y, s.radius * LIFT);
  const t0 = performance.now(), theta0 = s.theta, phi0 = s.phi;
  const turn = THREE.MathUtils.euclideanModulo(theta - theta0 + Math.PI, 2 * Math.PI) - Math.PI;   // the short way round
  const step = () => {
    if (state.cameraView) { stop(); return; }
    const t = Math.min(1, (performance.now() - t0) / TIME), k = t * t * (3 - 2 * t);
    s.theta = theta0 + turn * k;
    s.phi = phi0 + (phi - phi0) * k;
    orbit.target.lerpVectors(from, to, k);
    editCam.position.setFromSpherical(s).add(orbit.target);
    orbit.update();
    raf = t < 1 ? requestAnimationFrame(step) : 0;
  };
  step();
}
// taking hold of the view stops the turn
for (const t of ['pointerdown', 'wheel']) vp.addEventListener(t, stop, true);

const bar = document.createElement('div');
bar.id = 'viewBar';
bar.setAttribute('role', 'group');
bar.setAttribute('aria-label', 'Standard views');
const buttons = VIEWS.map(([label], i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.tip = `${label} view`;
  b.dataset.key = String(i + 1);
  b.setAttribute('aria-label', `${b.dataset.tip} (${i + 1})`);
  b.onclick = () => { showView(i); b.blur(); };
  bar.appendChild(b);
  return b;
});
vp.appendChild(bar);
// highlight the button of the view being shown
const dir = new THREE.Vector3(), want = new THREE.Vector3();
function mark() {
  dir.copy(editCam.position).sub(orbit.target).normalize();
  VIEWS.forEach(([, theta, phi], i) => {
    const on = dir.angleTo(want.setFromSphericalCoords(1, phi, theta)) < 0.02;
    buttons[i].classList.toggle('active', on);
    buttons[i].setAttribute('aria-pressed', on);
  });
}
orbit.addEventListener('change', mark);
mark();
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !/^[1-5]$/.test(e.key)) return;
  if (e.target.matches?.('input, textarea, select, [contenteditable="true"]') || !document.querySelector('#exportModal').hidden || document.querySelector('#navAsk')) return;
  showView(+e.key - 1);
});
