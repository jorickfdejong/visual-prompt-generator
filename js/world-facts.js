import * as THREE from 'three';
import { state } from './state.js';
import { shotCam } from './camera.js';
import { imageStore } from './images.js';
import { objHeight } from './objects.js';

/* =====================================================================
   WORLD FACTS — true positions and sizes read from the 3D scene, as the shot camera sees them
   ===================================================================== */
// exact world box of the visible meshes (o.root also holds the joint handles); cached until the object changes
const boxCache = new WeakMap();
function worldBox(o) {
  o.root.updateWorldMatrix(true, true);
  let key = o.root.matrixWorld.elements.join() + '|' + o.meshes.map((m) => m.id).join();
  for (const j of Object.values(o.joints)) key += '|' + j.position.y + ',' + j.quaternion.toArray().join();
  const c = boxCache.get(o);
  if (c?.key === key) return c.box;
  const box = new THREE.Box3();
  for (const m of o.meshes) box.expandByObject(m, true);
  if (box.isEmpty()) box.expandByPoint(o.root.position);
  boxCache.set(o, { key, box });
  return box;
}

// rectangle of the box in the frame (-1..1), null when it is behind the camera
function screenRect(box) {
  const r = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(shotCam.matrixWorldInverse);
    if (v.z > -0.05) continue;
    v.applyMatrix4(shotCam.projectionMatrix);
    r.x0 = Math.min(r.x0, v.x); r.x1 = Math.max(r.x1, v.x); r.y0 = Math.min(r.y0, v.y); r.y1 = Math.max(r.y1, v.y);
  }
  return r.x0 === Infinity ? null : r;
}

const ray = new THREE.Raycaster();
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
// a picture can be see-through (cutout, PNG), which a ray does not notice: only a JPEG counts as solid
const solid = (o) => o.type !== 'image' || (!o.cutout?.on && /^data:image\/jpeg/.test(imageStore[o.imageId]?.src || ''));
const solidMeshes = (o) => (o.built ? o.built.flatMap(solidMeshes) : solid(o) ? o.meshes : []);

// what hides most of f: { o, part: 'partly' | 'fully' } or null
function hiddenBy(f, all) {
  const before = all.filter((g) => g !== f && g.rect && g.distance < f.distance && solidMeshes(g.o).length && overlap(f.rect, g.rect));
  if (!before.length) return null;
  const r = { x0: Math.max(-1, f.rect.x0), x1: Math.min(1, f.rect.x1), y0: Math.max(-1, f.rect.y0), y1: Math.min(1, f.rect.y1) };
  const N = 8, counts = new Map();
  let total = 0, hidden = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    ray.setFromCamera(new THREE.Vector2(r.x0 + (i + 0.5) / N * (r.x1 - r.x0), r.y0 + (j + 0.5) / N * (r.y1 - r.y0)), shotCam);
    const own = ray.intersectObjects(f.o.meshes, false)[0];
    if (!own) continue;
    total++;
    let best = null;
    for (const g of before) {
      const h = ray.intersectObjects(solidMeshes(g.o), false)[0];
      if (h && h.distance < own.distance && (!best || h.distance < best.d)) best = { d: h.distance, g };
    }
    if (best) { hidden++; counts.set(best.g, (counts.get(best.g) || 0) + 1); }
  }
  if (!total || hidden / total < 0.15) return null;
  const top = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  return { o: top.o, part: hidden / total > 0.95 ? 'fully' : 'partly' };
}

// facts per visible object id
export function computeFacts() {
  shotCam.updateWorldMatrix(true, false);
  shotCam.matrixWorldInverse.copy(shotCam.matrixWorld).invert();
  const camPos = shotCam.getWorldPosition(new THREE.Vector3()), dir = shotCam.getWorldDirection(new THREE.Vector3());
  const away = new THREE.Vector3(dir.x, 0, dir.z);
  if (away.length() > 1e-6) away.normalize(); else away.set(0, 0, -1);
  const list = state.objects.filter((o) => !o.hidden).map((o) => {
    const box = worldBox(o), rect = screenRect(box), rel = box.getCenter(new THREE.Vector3()).sub(camPos);
    return {
      o, box, rect, height: objHeight(o),
      depth: rel.dot(away),              // along the floor, away from the camera
      distance: rel.length(),
      x: rect ? (Math.max(-1, rect.x0) + Math.min(1, rect.x1)) / 2 : 0,
      y: rect ? (rect.y0 + rect.y1) / 2 : 0,
      inShot: !!rect && rel.dot(dir) > 0 && rect.x1 > -1 && rect.x0 < 1 && rect.y1 > -1 && rect.y0 < 1,
    };
  });
  for (const f of list) {
    const tol = Math.max(0.05, 0.03 * f.height), bottom = f.box.min.y;
    f.support = bottom < -tol ? 'below' : bottom <= tol ? 'ground' : 'floating';
    f.on = null;
    if (f.support === 'floating') {
      const gap = (g) => Math.abs(bottom - g.box.max.y);
      const under = list.filter((g) => g !== f && gap(g) <= tol + 0.03 && footprintsOverlap(f, g)).sort((p, q) => gap(p) - gap(q));
      if (under.length) { f.support = 'object'; f.on = under[0].o; }
    }
    f.hidden = f.inShot ? hiddenBy(f, list) : null;
    f.place = !f.inShot ? null : f.x < -0.33 ? 'on the left' : f.x > 0.33 ? 'on the right' : 'in the centre';
  }
  return new Map(list.map((f) => [f.o.id, f]));
}

// visible objects from left to right in the frame; those outside the shot come last
export function leftToRight(facts) {
  return [...facts.values()].sort((a, b) => (b.inShot - a.inShot) || (Math.round(a.x * 50) - Math.round(b.x * 50)) || (a.depth - b.depth)).map((f) => f.o);
}
export function footprintsOverlap(a, b) {
  return a.box.min.x < b.box.max.x && b.box.min.x < a.box.max.x && a.box.min.z < b.box.max.z && b.box.min.z < a.box.max.z;
}
export const depthWord = (gap) => (gap >= 4 ? 'far behind' : gap < 1 ? 'just behind' : 'behind');
