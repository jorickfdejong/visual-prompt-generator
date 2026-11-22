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
}
// stop the browser's middle-click autoscroll on the canvas
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

// Gizmo
export const tc = new TransformControls(editCam, renderer.domElement);
tc.setSize(0.8);
// rotate gizmo: keep only the three axis rings (drop the yellow screen-axis ring 'E' and the grey free-rotate ball 'XYZE')
for (const group of [tc._gizmo?.gizmo?.rotate, tc._gizmo?.picker?.rotate]) {
  if (group) [...group.children].filter((h) => h.name === 'E' || h.name === 'XYZE').forEach((h) => group.remove(h));
}
scene.add(tc);
tc.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });

export const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
