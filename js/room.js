import * as THREE from 'three';
import { $, DEG, state } from './state.js';
import { floor, hemi, scene, setHelper, sun } from './scene.js';
import { imageStore } from './images.js';
import { markDirty } from './prompt-panel.js';

/* ---------- room: floor and background walls (world settings) ---------- */
export const ROOM_DEFAULT = () => ({
  background: '#e4dfd7',
  floor: { pattern: 'plain', color: '#bdb3a4', imageId: null },
  walls: { back: false, left: false, right: false, pattern: 'plain', color: '#ece6dc', imageId: null, width: 8, depth: 8, height: 3 },
  light: { direction: 40, shadows: true },
});
// fixed part of the light (its direction and shadows are settings)
const LIGHT = { height: 50, brightness: 2.4, color: '#ffffff', ambient: 1.6 };
// procedural patterns, drawn light grey so the chosen colour tints them; m = metres one canvas covers
export const PATTERNS = {
  floor: { plain: { label: 'Plain' }, wood: { label: 'Wood planks', m: 2 }, tiles: { label: 'Tiles', m: 1 }, checker: { label: 'Checkerboard', m: 1 }, concrete: { label: 'Concrete', m: 3 }, image: { label: 'Your image…', m: 3 } },
  walls: { plain: { label: 'Plain' }, brick: { label: 'Brick', m: 1.2 }, stripes: { label: 'Stripes', m: 1 }, panels: { label: 'Wood panels', m: 1.5 }, image: { label: 'Your image… (stretched)' } },
};
export const patternCache = {};
export function patternCanvas(name) {
  if (patternCache[name]) return patternCache[name];
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shade = (v) => `rgb(${v},${v},${v})`;
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  if (name === 'wood' || name === 'panels') {
    const n = name === 'wood' ? 8 : 4, ph = S / n;
    for (let r = 0; r < n; r++) {
      const off = name === 'wood' ? rnd() * S : 0;
      for (const x0 of [off - S, off]) {
        g.fillStyle = shade(205 + Math.floor(rnd() * 45));
        if (name === 'wood') g.fillRect(x0, r * ph, S, ph); else g.fillRect(r * ph, 0, ph, S);
      }
      g.strokeStyle = 'rgba(0,0,0,.07)'; g.lineWidth = 1;
      for (let k = 0; k < 9; k++) {   // grain
        const t = rnd() * ph;
        g.beginPath();
        if (name === 'wood') { g.moveTo(0, r * ph + t); g.bezierCurveTo(S / 3, r * ph + t + 4, S * 2 / 3, r * ph + t - 4, S, r * ph + t); }
        else { g.moveTo(r * ph + t, 0); g.bezierCurveTo(r * ph + t + 4, S / 3, r * ph + t - 4, S * 2 / 3, r * ph + t, S); }
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,.35)';
      if (name === 'wood') { g.fillRect(0, r * ph, S, 2); g.fillRect(off % S, r * ph, 2, ph); }
      else g.fillRect(r * ph, 0, 3, S);
    }
  } else if (name === 'tiles') {
    const n = 2, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = shade(238 + Math.floor(rnd() * 14)); g.fillRect(i * t, j * t, t, t); }
    g.fillStyle = 'rgb(150,150,150)';
    for (let i = 0; i <= n; i++) { g.fillRect(i * t - 3, 0, 6, S); g.fillRect(0, i * t - 3, S, 6); }
  } else if (name === 'checker') {
    g.fillStyle = 'rgb(120,120,120)';
    g.fillRect(0, 0, S / 2, S / 2); g.fillRect(S / 2, S / 2, S / 2, S / 2);
  } else if (name === 'concrete') {
    for (let k = 0; k < 9000; k++) { const v = 200 + Math.floor(rnd() * 55); g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 2 + rnd() * 5); }
  } else if (name === 'brick') {
    const rows = 8, bh = S / rows, bw = S / 2;
    g.fillStyle = 'rgb(225,225,225)'; g.fillRect(0, 0, S, S);   // mortar
    for (let r = 0; r < rows; r++) for (let c = -1; c < 3; c++) {
      g.fillStyle = shade(150 + Math.floor(rnd() * 50));
      g.fillRect(c * bw + (r % 2) * bw / 2 + 4, r * bh + 4, bw - 8, bh - 8);
    }
  } else if (name === 'stripes') {
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgb(222,222,222)'; g.fillRect(i * S / 4, 0, S / 8, S); }
  }
  return (patternCache[name] = cv);
}
// texture for one surface: pattern tiled every `m` metres, or an uploaded image (tiled on the floor, stretched on walls)
export function surfaceTexture(kind, cfg, w, h) {
  if (cfg.pattern === 'plain') return null;
  let tex;
  if (cfg.pattern === 'image') {
    const e = cfg.imageId && imageStore[cfg.imageId];
    if (!e) return null;
    // draw the picture over the surface colour, so transparent parts of a PNG show that colour (not black)
    const cv = document.createElement('canvas');
    cv.width = e.w; cv.height = e.h;
    const g = cv.getContext('2d');
    g.fillStyle = cfg.color; g.fillRect(0, 0, e.w, e.h);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const img = new Image();
    img.onload = () => { g.drawImage(img, 0, 0, e.w, e.h); tex.needsUpdate = true; markDirty(); };
    img.src = e.src;
    if (kind === 'walls') return tex;
  } else {
    tex = new THREE.CanvasTexture(patternCanvas(cfg.pattern));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }
  const m = PATTERNS[kind][cfg.pattern].m || 1;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / m, h / m);
  return tex;
}
export function setSurface(mat, tex, cfg) {
  mat.map?.dispose();
  mat.map = tex;
  // an uploaded image shows in its own colours; patterns and plain take the chosen colour
  mat.color.set(cfg.pattern === 'image' && tex ? '#ffffff' : cfg.color);
  mat.needsUpdate = true;
}
state.settings.room = ROOM_DEFAULT();
export const wallGroup = new THREE.Group();
scene.add(wallGroup);
export const wallMat = new THREE.MeshStandardMaterial({ color: '#ece6dc', roughness: 0.95 });   // front side only: walls vanish when seen from outside the room
// the light: turned around the room (direction), with a fixed height, brightness, colour and ambient fill; shadows can be toggled
export function applyLight() {
  const R = state.settings.room, W = R.walls, L = R.light || {};
  const az = (+L.direction || 0) * DEG, el = LIGHT.height * DEG;
  const half = Math.max(+W.width || 8, +W.depth || 8) / 2 + 2;   // shadows cover the whole floor
  const dist = half * 1.5 + 6;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  sun.position.copy(dir).multiplyScalar(dist);
  sun.color.set(LIGHT.color);
  sun.intensity = LIGHT.brightness;
  hemi.intensity = LIGHT.ambient;
  sun.castShadow = L.shadows !== false;   // older scenes have no flag: shadows on
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: dist * 2 });
  sun.shadow.camera.updateProjectionMatrix();
}
export function applyRoom() {
  const R = state.settings.room;
  scene.background.set(R.background);
  applyLight();
  const W = R.walls, wd = Math.max(0.5, +W.width || 8), dp = Math.max(0.5, +W.depth || 8), ht = Math.max(0.5, +W.height || 3);
  // the floor covers exactly the room (width × depth), the same footprint as the walls
  floor.geometry.dispose();
  floor.geometry = new THREE.PlaneGeometry(wd, dp);
  setSurface(floor.material, surfaceTexture('floor', R.floor, wd, dp), R.floor);
  rebuildGrid();   // the grid follows the floor size
  wallGroup.children.forEach((m) => { m.geometry.dispose(); if (m.material !== wallMat) { m.material.map?.dispose(); m.material.dispose(); } });
  wallGroup.clear();
  const make = (len, x, z, ry) => {
    const geo = new THREE.PlaneGeometry(len, ht);
    geo.translate(0, ht / 2, 0);
    const mat = wallMat.clone();
    setSurface(mat, surfaceTexture('walls', W, len, ht), W);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    wallGroup.add(m);
  };
  if (W.back) make(wd, 0, -dp / 2, 0);
  if (W.left) make(dp, -wd / 2, 0, Math.PI / 2);
  if (W.right) make(dp, wd / 2, 0, -Math.PI / 2);
}

export let grid = null;
// grid lines only on the floor (room width × depth), on multiples of the cell size so snapping lines up;
// the centre lines are drawn darker
export function rebuildGrid() {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  const W = state.settings.room.walls, c = state.settings.cell;
  const hx = Math.max(0.5, +W.width || 8) / 2, hz = Math.max(0.5, +W.depth || 8) / 2;
  const pos = [], col = [], dark = new THREE.Color(0x8c8170), light = new THREE.Color(0xb3aa9b);
  const line = (x0, z0, x1, z1, k) => { pos.push(x0, 0, z0, x1, 0, z1); const cl = k === 0 ? dark : light; col.push(cl.r, cl.g, cl.b, cl.r, cl.g, cl.b); };
  const eps = 1e-6;
  for (let i = Math.ceil(-hx / c - eps); i * c <= hx + eps; i++) line(i * c, -hz, i * c, hz, i);
  for (let j = Math.ceil(-hz / c - eps); j * c <= hz + eps; j++) line(-hx, j * c, hx, j * c, j);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
  grid.position.y = 0.002;
  setHelper(grid);
  scene.add(grid);
}
