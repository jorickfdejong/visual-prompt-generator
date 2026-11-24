import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { $, ASPECTS, DEG, state } from './state.js';
import { blenderControls, orbit, renderer, scene, setHelper, detachGizmo } from './scene.js';
import { exitEdit, selectCamera, selectMany, selectObject, updateModeBadge } from './selection.js';
import { onCameraView } from './nav-mode.js';
import { layoutInset } from './rendering.js';
import { markDirty } from './prompt-panel.js';

/* =====================================================================
   SHOT CAMERA
   ===================================================================== */
export const shotCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 300);
scene.add(shotCam);
export const camModel = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: '#2c3036', roughness: .6 });
  const blue = new THREE.MeshStandardMaterial({ color: '#4ba3f0', roughness: .4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.2), dark);
  body.position.z = 0.12;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 20), blue);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.03;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), dark);
  top.position.set(0, 0.11, 0.12);
  camModel.add(body, lens, top);
  camModel.children.forEach((m) => { m.userData.isCamera = true; });
}
shotCam.add(camModel);
export let frustum = null;
export function rebuildFrustum() {
  if (frustum) { shotCam.remove(frustum); frustum.geometry.dispose(); }
  const d = 1.4, h = Math.tan(shotCam.getEffectiveFOV() * DEG / 2) * d, w = h * shotCam.aspect;
  const c = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => new THREE.Vector3(x, y, -d));
  const pts = [];
  c.forEach((p, i) => { pts.push(new THREE.Vector3(), p, p, c[(i + 1) % 4]); });
  frustum = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#4ba3f0' }));
  shotCam.add(frustum);
  setHelper(camModel);
  setHelper(frustum);
}
export function applyCamera() {
  shotCam.aspect = ASPECTS[state.camera.aspect];
  shotCam.setFocalLength(state.camera.focal);
  shotCam.updateProjectionMatrix();
  rebuildFrustum();
  layoutInset();
  $('#focal').value = state.camera.focal;
  $('#focalVal').textContent = state.camera.focal + ' mm';
  $('#aspect').value = state.camera.aspect;
  $('#camSummary').textContent = `${state.camera.focal}mm · ${state.camera.aspect}`;
}
export function resetCamera() {
  shotCam.position.set(0, 1.5, 6);
  shotCam.lookAt(0, 1, 0);
}

/* =====================================================================
   CAMERA VIEW (frame the shot)
   ===================================================================== */
export let pilot = null;
export function enterCameraView() {
  if (state.mode === 'edit') exitEdit();
  state.cameraView = true;
  document.body.classList.add('camview');
  detachGizmo();
  orbit.enabled = false;
  // read the direction BEFORE creating the controls: their constructor re-aims the camera at (0,0,0)
  const dir = shotCam.getWorldDirection(new THREE.Vector3());
  const startPos = shotCam.position.clone(), startQuat = shotCam.quaternion.clone();
  pilot = new OrbitControls(shotCam, renderer.domElement);
  shotCam.position.copy(startPos); shotCam.quaternion.copy(startQuat);
  let d = 5;
  const vis = state.objects.filter((o) => !o.hidden);
  if (vis.length) {
    d = Math.min(...vis.map((o) => o.root.position.distanceTo(shotCam.position)));
    d = THREE.MathUtils.clamp(d, 1, 30);
  }
  blenderControls(pilot);
  pilot.target.copy(shotCam.position).addScaledVector(dir, d);
  pilot.enableDamping = true;
  pilot.update();
  pilot.addEventListener('change', () => markDirty());
  onCameraView(true);
  updateModeBadge();
}
export function exitCameraView() {
  state.cameraView = false;
  document.body.classList.remove('camview');
  pilot?.dispose(); pilot = null;
  orbit.enabled = true;
  onCameraView(false);
  if (state.selected?.kind === 'camera') selectCamera();
  else if (state.selected?.obj) selectObject(state.selected.obj);
  else if (state.selected?.kind === 'multi') selectMany(state.selected.objs);
  updateModeBadge(); markDirty();
}
