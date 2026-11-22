import * as THREE from 'three';
import { $ } from './state.js';
import { markDirty } from './prompt-panel.js';
import { toast } from './clipboard.js';

/* ---------- uploaded images (JPG / PNG), shared by image objects and room surfaces ----------
   Kept outside the undo snapshots (they would be huge); saved files and the autosave carry the ones in use. */
export const imageStore = {};    // id -> { src: dataURL, w, h, name }
export const texCache = {};      // id -> THREE.Texture
export const IMG_MAX = 1280;     // long side in px after import
export function imageTexture(id) {
  if (texCache[id]) return texCache[id];
  const e = imageStore[id];
  if (!e) return null;
  const tex = new THREE.TextureLoader().load(e.src, () => markDirty());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return (texCache[id] = tex);
}
// decoded pixels of an uploaded image (for the background cutout and the eyedropper); cb runs once they're ready
export const pixCache = {};      // id -> ImageData
export function withPixels(id, cb) {
  if (pixCache[id]) return cb(pixCache[id]);
  const e = imageStore[id];
  if (!e) return;
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = e.w; cv.height = e.h;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, e.w, e.h);
    cb(pixCache[id] = g.getImageData(0, 0, e.w, e.h));
  };
  img.src = e.src;
}
export const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
/* Background removal by colour key (no AI): pixels close to c.color become see-through.
   c.tol 0..100 sets how close; a soft band above it fades the edge. With c.edges only the
   background-coloured area connected to the picture's border is removed (flood fill). */
export function cutoutPixels(src, c) {
  const W = src.width, H = src.height, s = src.data;
  const out = new ImageData(new Uint8ClampedArray(s), W, H), d = out.data;
  const [r0, g0, b0] = hexRGB(c.color);
  const thr = c.tol * 2.2, soft = Math.max(6, thr * 0.25);
  // 0 = fully removed, 1 = kept
  const keep = (p) => {
    if (s[p + 3] < 10) return 0;
    const dist = Math.hypot(s[p] - r0, s[p + 1] - g0, s[p + 2] - b0);
    return dist <= thr ? 0 : dist >= thr + soft ? 1 : (dist - thr) / soft;
  };
  const apply = (i) => { const p = i * 4, k = keep(p); if (k < 1) d[p + 3] = Math.round(s[p + 3] * k); return k < 1; };
  if (!c.edges) { for (let i = 0; i < W * H; i++) apply(i); return out; }
  const seen = new Uint8Array(W * H), stack = [];
  const push = (i) => { if (!seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (!apply(i)) continue;            // a kept pixel stops the fill
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  return out;
}
export const CUTOUT_DEFAULT = () => ({ on: false, color: '#ffffff', tol: 20, edges: true });
// texture of an image object with its background removed; one per object, replaced when the settings change
export function cutoutTexture(o) {
  const c = o.cutout, key = `${o.imageId}|${c.color}|${c.tol}|${c.edges}`;
  if (o._cut?.key === key) return o._cut.tex;
  o._cut?.tex.dispose();
  const e = imageStore[o.imageId];
  const cv = document.createElement('canvas');
  cv.width = e.w; cv.height = e.h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const cut = o._cut = { key, tex, url: null };
  withPixels(o.imageId, (src) => {
    if (o._cut !== cut) return;         // settings changed meanwhile
    cv.getContext('2d').putImageData(cutoutPixels(src, c), 0, 0);
    tex.needsUpdate = true;
    cut.url = cv.toDataURL('image/png');
    const prev = document.getElementById('imgPreview');
    if (prev && prev.dataset.obj === String(o.id)) prev.src = cut.url;
    markDirty();
  });
  return tex;
}
export function isImageFile(f) { return /^image\/(png|jpeg)$/.test(f.type) || /\.(png|jpe?g)$/i.test(f.name); }
export async function importImageFile(file) {
  if (!isImageFile(file)) { toast('Only JPG and PNG images are supported'); return null; }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, IMG_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const png = /png$/i.test(file.type) || /\.png$/i.test(file.name);   // PNG keeps its transparency
    const id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    imageStore[id] = { src: cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88), w, h, name: file.name };
    return id;
  } catch { toast('Could not read that image'); return null; }
  finally { URL.revokeObjectURL(url); }
}
// ask for one image file; resolves to an image id (or null when cancelled)
export let imagePick = null;
export function pickImage() {
  return new Promise((res) => { imagePick = res; $('#imageFile').click(); });
}
$('#imageFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  const done = imagePick; imagePick = null;
  done?.(f ? await importImageFile(f) : null);
});
// No "window regained focus = cancelled" fallback: Safari can fire 'change' well after focus returns
// (e.g. while it converts a Photos/iCloud picture), and that guess threw the chosen file away.
// Every current browser sends 'cancel'; on older ones a cancelled pick just leaves the promise pending.
$('#imageFile').addEventListener('cancel', () => { const d = imagePick; imagePick = null; d?.(null); });
