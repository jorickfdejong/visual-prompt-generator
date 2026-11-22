import * as THREE from 'three';
import { $, ASPECTS, state } from './state.js';
import { editCam, renderer, scene, tc, vp } from './scene.js';
import { shotCam } from './camera.js';
import { applyDim, dimmed } from './selection.js';

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
  const tv = tc.visible, wasDim = dimmed;
  tc.visible = false;
  if (wasDim) applyDim(false);
  fn();
  if (wasDim) applyDim(true);
  tc.visible = tv;
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
  if (document.body.classList.contains('exporting')) return; // inset hidden while Export is open
  // camera inset (top right)
  const cr = renderer.domElement.getBoundingClientRect(), ir = inset.getBoundingClientRect();
  const x = ir.left - cr.left + 2, yb = cr.bottom - ir.bottom + 2, iw = ir.width - 4, ih = ir.height - 4;
  renderer.setScissorTest(true);
  renderer.setScissor(x, yb, iw, ih);
  renderer.setViewport(x, yb, iw, ih);
  cleanRender(() => renderer.render(scene, shotCam));
  renderer.setScissorTest(false);
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
  cleanRender(() => shotRenderer.render(scene, shotCam));
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
// live camera preview in the Export tab (throttled)
export let previewTimer = null;
export function schedulePreview() {
  if ($('#tabExport').hidden || previewTimer) return;
  previewTimer = setTimeout(() => { previewTimer = null; $('#shotPreview').src = renderShot(640); }, 120);
}
