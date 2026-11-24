import * as THREE from 'three';
import { $, ASPECTS, state } from './state.js';
import { clayReference } from './prompt-rules.js';
import { wallGroup } from './room.js';
import { editCam, floor, hemi, gizmo, renderer, scene, vp } from './scene.js';
import { shotCam } from './camera.js';
import { applyDim, dimmed } from './selection.js';
import { renderOutline } from './outline.js';
import { updateLabels } from './labels.js';
import { updatePoseButton } from './pose-button.js';

/* =====================================================================
   RENDERING
   ===================================================================== */
export const inset = $('#inset');
export const camHint = document.getElementById('camHint');
export function layoutInset() {
  const a = ASPECTS[state.camera.aspect], max = Math.max(140, Math.min(260, vp.clientWidth * 0.38));
  const w = a >= 1 ? max : Math.round(max * a), h = a >= 1 ? Math.round(max / a) : max;
  inset.style.width = w + 'px'; inset.style.height = h + 'px';
}
export function cleanRender(fn) {
  const tv = gizmo.visible, wasDim = dimmed;
  gizmo.visible = false;
  if (wasDim) applyDim(false);
  fn();
  if (wasDim) applyDim(true);
  gizmo.visible = tv;
}
export function resize() {
  const w = vp.clientWidth, h = vp.clientHeight;
  renderer.setSize(w, h);
  editCam.aspect = w / h;
  editCam.updateProjectionMatrix();
  layoutInset();
}
new ResizeObserver(resize).observe(vp);

export function render() {
  const w = vp.clientWidth, h = vp.clientHeight;
  if (!w || !h) return;
  updateLabels();
  updatePoseButton();
  renderer.setScissorTest(false);
  if (state.cameraView) {
    renderer.setViewport(0, 0, w, h);
    renderer.setClearColor('#141518');
    renderer.clear();
    const a = shotCam.aspect;
    let vw = w - 40, vh = vw / a;
    if (vh > h - 150) { vh = h - 150; vw = vh * a; }
    const top = 50 + (h - 150 - vh) / 2, x = (w - vw) / 2, y = h - top - vh;
    const hintTop = Math.round(top + vh + 12) + 'px';
    if (camHint.style.top !== hintTop) camHint.style.top = hintTop;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, vw, vh);
    renderer.setViewport(x, y, vw, vh);
    cleanRender(() => renderer.render(scene, shotCam));
    return;
  }
  renderer.setViewport(0, 0, w, h);
  renderer.render(scene, editCam);
  renderOutline(w, h);
  // camera inset (top right)
  const cr = renderer.domElement.getBoundingClientRect(), ir = inset.getBoundingClientRect();
  const x = ir.left - cr.left + 2, yb = cr.bottom - ir.bottom + 2, iw = ir.width - 4, ih = ir.height - 4;
  renderer.setScissorTest(true);
  renderer.setScissor(x, yb, iw, ih);
  renderer.setViewport(x, yb, iw, ih);
  cleanRender(() => renderer.render(scene, shotCam));
  renderer.setScissorTest(false);
}

/* neutral clay look for the reference image: light grey for everything, so the generator has no colour or
   material to copy. Pictures keep their content (it is made grey afterwards). */
const CLAY = {};
const clayMat = (color, side) => CLAY[color + side] || (CLAY[color + side] = new THREE.MeshStandardMaterial({ color, side, roughness: 0.9 }));
function clayRender(fn) {
  const undo = [];
  const swap = (m, color) => { const old = m.material; undo.push(() => { m.material = old; }); m.material = clayMat(color, old.side); };
  const bg = scene.background, sky = hemi.color.clone(), ground = hemi.groundColor.clone();
  try {
    for (const o of state.objects) for (const m of o.meshes) if (!(o.type === 'image' && m.material === o.mats[0])) swap(m, '#b8b8b8');
    swap(floor, '#a0a0a0');
    wallGroup.children.forEach((m) => swap(m, '#acacac'));
    scene.background = new THREE.Color('#dcdcdc');
    hemi.color.set('#ffffff'); hemi.groundColor.set('#808080');
    fn();
  } finally {
    undo.forEach((u) => u());
    scene.background = bg; hemi.color.copy(sky); hemi.groundColor.copy(ground);
  }
}
// luminance only
function greyURL(src, type, quality) {
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, cv.width, cv.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  g.putImageData(img, 0, 0);
  return cv.toDataURL(type, quality);
}

export let shotRenderer = null;
export function renderShot(longSide, type = 'image/png', quality) {
  const a = shotCam.aspect;
  const w = a >= 1 ? longSide : Math.round(longSide * a), h = a >= 1 ? Math.round(longSide / a) : longSide;
  if (!shotRenderer) {
    shotRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    shotRenderer.shadowMap.enabled = true;
    shotRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    shotRenderer.setPixelRatio(1);
  }
  shotRenderer.setSize(w, h, false);
  const draw = () => shotRenderer.render(scene, shotCam);
  if (clayReference()) {
    cleanRender(() => clayRender(draw));
    return greyURL(shotRenderer.domElement, type, quality);
  }
  cleanRender(draw);
  return shotRenderer.domElement.toDataURL(type, quality);
}
export function takeScreenshot() {
  state.lastShot = renderShot(1024);
  $('#shotPreview').src = state.lastShot;
  return state.lastShot;
}
export function dataURLtoBlob(url) {
  const [head, b64] = url.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
// live camera preview in the Export window (throttled)
export let previewTimer = null;
export function schedulePreview() {
  if ($('#exportModal').hidden || previewTimer) return;
  previewTimer = setTimeout(() => { previewTimer = null; $('#shotPreview').src = renderShot(640); }, 120);
}
