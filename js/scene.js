import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { $, HELPER } from './state.js';

/* =====================================================================
   SCENE SETUP
   ===================================================================== */
export const vp = $('#viewport');
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
vp.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#e4dfd7');

export const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.6);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 30 });
sun.shadow.bias = -0.0005;
scene.add(sun);

export const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: '#bdb3a4', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

export function setHelper(o) { o.traverse((c) => c.layers.set(HELPER)); }

// Editor camera
export const editCam = new THREE.PerspectiveCamera(50, 1, 0.05, 300);
editCam.layers.enable(HELPER);
editCam.position.set(5.5, 4.5, 8.5);
export const orbit = new OrbitControls(editCam, renderer.domElement);
orbit.target.set(0, 0.9, 0);
orbit.enableDamping = true;
blenderControls(orbit);
orbit.update();

// Blender-style navigation: middle mouse = orbit, Shift + middle mouse = pan, wheel = zoom.
// Left mouse is left free for selecting and gizmos. (OrbitControls pans when Shift/Ctrl is held during a rotate.)
export function blenderControls(c) {
  c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  c.enableZoom = false;   // wheel / trackpad / pinch navigation is handled in nav.js
}
// stop the browser's middle-click autoscroll on the canvas
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

// Gizmo: two controls drawn as one. `tc` moves (arrows + centre dot) or scales, `rc` rotates (three rings).
export const tc = new TransformControls(editCam, renderer.domElement);
export const rc = new TransformControls(editCam, renderer.domElement);
rc.setMode('rotate');
export const gizmo = new THREE.Group();   // lets rendering hide both at once
gizmo.add(tc, rc);
scene.add(gizmo);
const AXIS_COLORS = { X: '#e5484d', Y: '#46a758', Z: '#3e7bfa' };
const RING_R = 0.5;
let stretchHandles = false;
export function showStretch(on) { stretchHandles = on; }
function buildGizmo() {
  const mat = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, fog: false, toneMapped: false, transparent: true });
  const invisible = mat('#ffffff');
  // geometry is made along +Y and turned to its axis here
  const toAxis = { X: (g) => g.rotateZ(-Math.PI / 2), Y: (g) => g, Z: (g) => g.rotateX(Math.PI / 2) };
  // half rings: TransformControls keeps the half that faces the view in front
  const ring = (tube, seg) => new THREE.TorusGeometry(RING_R, tube, seg, 48, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI / 2);
  const ringAxis = { X: (g) => g, Y: (g) => g.rotateZ(-Math.PI / 2), Z: (g) => g.rotateY(Math.PI / 2) };
  const add = (group, name, geo, m) => { const h = new THREE.Mesh(geo, m); h.name = name; h.renderOrder = Infinity; group.add(h); };
  const move = tc._gizmo.gizmo.translate, movePick = tc._gizmo.picker.translate;
  const turn = rc._gizmo.gizmo.rotate, turnPick = rc._gizmo.picker.rotate;
  for (const g of [move, movePick, turn, turnPick]) g.clear();
  for (const a of ['X', 'Y', 'Z']) {
    const m = mat(AXIS_COLORS[a]);
    // the arrows start just outside the rings, so the two never cover each other
    add(move, a, toAxis[a](new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8).translate(0, RING_R + 0.12, 0)), m);
    add(move, a, toAxis[a](new THREE.ConeGeometry(0.05, 0.13, 16).translate(0, RING_R + 0.26, 0)), m);
    add(movePick, a, toAxis[a](new THREE.CylinderGeometry(0.09, 0.09, 0.32, 8).translate(0, RING_R + 0.21, 0)), invisible);
    add(turn, a, ringAxis[a](ring(0.011, 6)), mat(AXIS_COLORS[a]));
    add(turnPick, a, ringAxis[a](ring(0.06, 6)), invisible);
  }
  // centre dot: slides over the floor plane
  add(move, 'XZ', new THREE.SphereGeometry(0.06, 20, 14), mat('#ffffff'));
  add(movePick, 'XZ', new THREE.SphereGeometry(0.11, 12, 8), invisible);
  // scale: a diagonal line keeps the proportions; three boxes stretch along one axis (only objects that can be stretched)
  const size = tc._gizmo.gizmo.scale, sizePick = tc._gizmo.picker.scale;
  for (const g of [size, sizePick, tc._gizmo.helper.scale]) g.clear();
  const diagonal = (g) => g.rotateZ(-Math.PI / 4), orange = mat('#f0a04b');
  add(size, 'XYZ', diagonal(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 8).translate(0, 0.35, 0)), orange);
  add(size, 'XYZ', diagonal(new THREE.BoxGeometry(0.11, 0.11, 0.11).translate(0, 0.7, 0)), orange);
  add(sizePick, 'XYZ', diagonal(new THREE.CylinderGeometry(0.1, 0.06, 0.6, 8).translate(0, 0.5, 0)), invisible);   // starts off-centre: grabbing at the centre would scale wildly
  for (const h of [...size.children, ...sizePick.children]) {
    h.updateMatrix = function () { this.quaternion.copy(editCam.quaternion); THREE.Mesh.prototype.updateMatrix.call(this); };
  }
  for (const a of ['X', 'Y', 'Z']) {
    const m = mat(AXIS_COLORS[a]);
    add(size, a, toAxis[a](new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8).translate(0, 0.275, 0)), m);
    add(size, a, toAxis[a](new THREE.BoxGeometry(0.09, 0.09, 0.09).translate(0, 0.55, 0)), m);
    add(sizePick, a, toAxis[a](new THREE.CylinderGeometry(0.09, 0.09, 0.45, 8).translate(0, 0.42, 0)), invisible);
  }
  for (const h of [...size.children, ...sizePick.children]) {
    if (h.name === 'XYZ') continue;
    h.updateMatrix = function () { if (!stretchHandles) this.visible = false; THREE.Mesh.prototype.updateMatrix.call(this); };
  }
}
buildGizmo();
// only one of the two may respond at a time (tc's listeners run first, so arrows win over rings)
for (const [c, other] of [[tc, rc], [rc, tc]]) {
  const hover = c.pointerHover.bind(c);
  c.pointerHover = (p) => {
    if (other.dragging || (c === rc && tc.object && tc.axis)) { c.axis = null; return; }
    hover(p);
  };
  c.setSize(0.9);
  c.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
}
export function attachGizmo(obj, { move = true, turn = true } = {}) {
  if (move) tc.attach(obj); else tc.detach();
  if (turn) rc.attach(obj); else rc.detach();
}
export function detachGizmo() { tc.detach(); rc.detach(); }
export const gizmoDragging = () => tc.dragging || rc.dragging;
export const gizmoHot = () => !!((tc.object && tc.axis) || (rc.object && rc.axis));   // pointer is on a handle

export const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
