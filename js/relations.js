import * as THREE from 'three';
import { ALTS, DEG, state } from './state.js';
import { shotCam } from './camera.js';
import { TYPES } from './types.js';
import { objHeight } from './objects.js';

/* =====================================================================
   SPATIAL RELATIONS — Tarski's World on a 3D grid, seen from the shot camera
   ===================================================================== */
export function camel(s) {
  const w = String(s).trim().split(/[^A-Za-z0-9:]+/).filter(Boolean);
  return w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x[0].toLowerCase() + x.slice(1))).join('');
}
export function exportId(o) { return camel(o.details.name) || o.id; }

// Board orientation: the camera's horizontal view direction snapped to the nearest grid axis
export function boardAxes() {
  const f = shotCam.getWorldDirection(new THREE.Vector3());
  let fx = 0, fz = 0;
  if (Math.abs(f.x) >= Math.abs(f.z)) fx = Math.sign(f.x) || 1; else fz = Math.sign(f.z) || 1;
  return { right: [-fz, fx], front: [-fx, -fz] }; // front = towards the camera
}
export function cellOf(o, axes) {
  const c = state.settings.cell, p = o.root.position;
  return {
    col: Math.round((p.x * axes.right[0] + p.z * axes.right[1]) / c),
    row: Math.round((p.x * axes.front[0] + p.z * axes.front[1]) / c),
    level: Math.round(p.y / c),
  };
}
export function sizeBucket(s) { return s < 0.8 ? 'small' : s > 1.2 ? 'large' : 'medium'; }
export function strictlyBetween(a, b, c) { return (a > b && a < c) || (a < b && a > c); }

export function computeTuples() {
  const out = [];
  const push = (parts, family) => out.push({ parts, family, key: '(' + parts.join(', ') + ')', alts: parts.length === 3 && ALTS[family] ? ALTS[family] : null });
  const vis = state.objects.filter((o) => !o.hidden);
  const axes = boardAxes();
  const cells = vis.map((o) => cellOf(o, axes));
  const ids = vis.map(exportId);
  const camPos = shotCam.getWorldPosition(new THREE.Vector3());

  // unary: details + size
  vis.forEach((o, i) => {
    const id = ids[i], d = o.details;
    const T = TYPES[o.type];
    push([T.nounOf ? T.nounOf(o) : T.noun, id], 'attributes');
    for (const f of T.fields || []) {
      if (f.asNoun) continue;
      const v = (d[f.key] || '').trim();
      if (!v) continue;
      const text = f.suffix && !v.toLowerCase().includes(f.suffix) ? v + ' ' + f.suffix : v;
      push([camel(text), id], 'attributes');
    }
    for (const c of d.custom || []) {
      const k = (c.key || '').trim(), v = (c.value || '').trim();
      if (!k && !v) continue;
      const text = !v ? k : (!k || v.toLowerCase().includes(k.toLowerCase())) ? v : v + ' ' + k;
      push([camel(text), id], 'attributes');
    }
    push([sizeBucket(o.root.scale.x), id], 'size');
  });

  // binary
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const A = cells[i], B = cells[j], a = ids[i], b = ids[j];
    if (A.col !== B.col) push(A.col > B.col ? [a, 'rightOf', b] : [b, 'rightOf', a], 'leftRight');
    else push([a, 'sameCol', b], 'sameRowCol');
    if (A.row !== B.row) push(A.row > B.row ? [a, 'frontOf', b] : [b, 'frontOf', a], 'frontBack');
    else push([a, 'sameRow', b], 'sameRowCol');
    if (A.level !== B.level) {
      const [u, l] = A.level > B.level ? [a, b] : [b, a];
      push([u, 'above', l], 'vertical');
      if (A.col === B.col && A.row === B.row) push([u, 'onTopOf', l], 'vertical');
    } else push([a, 'sameLevel', b], 'vertical');
    if (A.level === B.level && Math.abs(A.col - B.col) + Math.abs(A.row - B.row) === 1) push([a, 'adjacent', b], 'adjacent');
    const sa = objHeight(vis[i]), sb = objHeight(vis[j]);   // real heights, so a doll and a picture compare fairly
    if (sa / sb > 1.08) push([a, 'larger', b], 'size');
    else if (sb / sa > 1.08) push([b, 'larger', a], 'size');
    else push([a, 'sameSize', b], 'size');
  }

  // ternary: between (same row, column or diagonal, same level)
  for (let i = 0; i < vis.length; i++) for (let j = 0; j < vis.length; j++) for (let k = j + 1; k < vis.length; k++) {
    if (i === j || i === k) continue;
    const A = cells[i], B = cells[j], C = cells[k];
    if (A.level !== B.level || A.level !== C.level) continue;
    const row = A.row === B.row && B.row === C.row && strictlyBetween(A.col, B.col, C.col);
    const col = A.col === B.col && B.col === C.col && strictlyBetween(A.row, B.row, C.row);
    const dc = C.col - B.col, dr = C.row - B.row;
    const diag = dc !== 0 && Math.abs(dc) === Math.abs(dr) &&
      (A.col - B.col) * dr === (A.row - B.row) * dc && strictlyBetween(A.col, B.col, C.col);
    if (row || col || diag) push([ids[i], 'between', ids[j], ids[k]], 'between');
  }

  // facing (extension)
  const fwd = (o) => { const v = new THREE.Vector3(0, 0, 1).applyQuaternion(o.root.quaternion); v.y = 0; return v.normalize(); };
  const flatDir = (from, to) => { const v = to.clone().sub(from); v.y = 0; return v.normalize(); };
  vis.forEach((o, i) => {
    const f = fwd(o);
    const ang = f.angleTo(flatDir(o.root.position, camPos)) / DEG;
    push([ang < 45 ? 'facingCamera' : ang > 135 ? 'backToCamera' : 'profile', ids[i]], 'facing');
    vis.forEach((p, j) => {
      if (i === j) return;
      const t = flatDir(o.root.position, p.root.position);
      if (f.angleTo(t) / DEG < 30) push([ids[i], 'facing', ids[j]], 'facing');
    });
  });

  // camera
  const dir = shotCam.getWorldDirection(new THREE.Vector3());
  const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / DEG;
  const halfFov = Math.tan(shotCam.getEffectiveFOV() * DEG / 2);
  let maxFrac = 0;
  for (const o of vis) {
    const hgt = objHeight(o);
    const center = o.root.position.clone().add(new THREE.Vector3(0, hgt / 2, 0));
    const dist = center.clone().sub(camPos).dot(dir);
    if (dist > 0.05) maxFrac = Math.max(maxFrac, hgt / (2 * dist * halfFov));
  }
  let shot;
  if (!maxFrac) shot = state.camera.focal < 28 ? 'wideShot' : state.camera.focal > 85 ? 'closeUp' : 'mediumShot';
  else shot = maxFrac < 0.2 ? 'extremeWideShot' : maxFrac < 0.45 ? 'wideShot' : maxFrac < 1.15 ? 'fullShot' : maxFrac < 2.2 ? 'mediumShot' : 'closeUp';
  push([shot, 'camera'], 'camera');
  push([pitch < -60 ? 'birdsEyeView' : pitch < -12 ? 'highAngle' : pitch > 8 ? 'lowAngle' : 'eyeLevel', 'camera'], 'camera');
  push([state.camera.focal + 'mmLens', 'camera'], 'camera');
  push([state.camera.aspect, 'camera'], 'camera');
  return out;
}

export function finalTuples() {
  const lines = [];
  for (const t of state.tuples) {
    if (!state.settings.families[t.family]) continue;
    const o = state.overrides[t.key];
    if (o?.off) continue;
    const parts = t.parts.slice();
    if (o?.rel && t.alts) parts[1] = o.rel;
    lines.push('(' + parts.join(', ') + ')');
  }
  for (const c of state.custom) if (!c.off) lines.push(c.text);
  return lines;
}
export function exportText() {
  const notes = state.notes.trim();
  return (notes ? notes + '\n\n' : '') + finalTuples().join('\n');
}
