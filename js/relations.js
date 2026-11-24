import * as THREE from 'three';
import { ALTS, DEG, ENV_FIELDS, state } from './state.js';
import { shotCam } from './camera.js';
import { TYPES } from './types.js';
import { objHeight } from './objects.js';
import { sizeOf } from './stretch.js';
import { computeFacts } from './world-facts.js';
import { canonical, tupleParts } from './prompt-rules.js';
import { impliedLeftRight } from './tuple-trim.js';

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

// Orientation of an object's root from its quaternion (never Euler angles): up / forward / left axes in world space
export function orientationOf(o) {
  const q = o.root.quaternion, sym = TYPES[o.type].symmetry;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const left = new THREE.Vector3(1, 0, 0).applyQuaternion(q);   // a doll's left is local +X
  if (sym === 'flip' && up.y < 0) up.negate();   // a cylinder looks the same upside down
  if (sym === 'cube' || sym === 'ball') {
    // any side may be up: only a cube standing on an edge or corner shows its rotation
    const t = Math.acos(THREE.MathUtils.clamp(Math.max(...[up, fwd, left].map((v) => Math.abs(v.y))), -1, 1)) / DEG;
    return { up, fwd, left, tilt: t, flatLen: 0, kind: sym === 'cube' && t >= 12 ? 'tilted' : 'upright' };
  }
  const tilt = Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)) / DEG;
  return { up, fwd, left, tilt, flatLen: Math.hypot(fwd.x, fwd.z), kind: tilt < 12 ? 'upright' : tilt < 60 ? 'leaning' : tilt <= 120 ? 'horizontal' : 'upsideDown' };
}

export function computeTuples() {
  const out = [];
  // meta (extra, backward compatible): objIds = ids of the objects the parts refer to, in order; field = detail key; text = original wording
  const push = (parts, family, meta) => out.push({ parts, family, key: '(' + parts.join(', ') + ')', alts: parts.length === 3 && ALTS[family] ? ALTS[family] : null, ...meta });
  const vis = state.objects.filter((o) => !o.hidden);
  const facts = (state.facts = computeFacts()), F = vis.map((o) => facts.get(o.id));
  const axes = boardAxes();
  const cells = vis.map((o) => cellOf(o, axes));
  const ids = vis.map(exportId);
  const camPos = shotCam.getWorldPosition(new THREE.Vector3());

  // environment (Environment panel)
  for (const f of ENV_FIELDS) {
    const v = ((state.environment || {})[f.key] || '').trim();
    if (!v) continue;
    const text = f.suffix && !v.toLowerCase().includes(f.suffix) ? v + ' ' + f.suffix : v;
    push([camel(text), 'environment'], 'environment', { field: f.key, text, value: v });
  }

  // final image (Final image panel)
  const style = (state.visualStyle || '').trim();
  if (style) push([camel(/style/i.test(style) ? style : style + ' style'), 'finalImage'], 'finalImage', { field: 'visualStyle', text: style });

  // camera axes, as the real (un-snapped) horizontal right / away directions
  const cdir = shotCam.getWorldDirection(new THREE.Vector3());
  const camRight = new THREE.Vector3(-cdir.z, 0, cdir.x);
  if (camRight.length() > 1e-6) camRight.normalize(); else camRight.set(1, 0, 0);
  const camAway = new THREE.Vector3(cdir.x, 0, cdir.z);
  if (camAway.length() > 1e-6) camAway.normalize(); else camAway.set(0, 0, -1);
  const orients = vis.map(orientationOf);

  // unary: details + size
  vis.forEach((o, i) => {
    const id = ids[i], d = o.details, oi = [o.id], ori = orients[i];
    const T = TYPES[o.type];
    const nf = (T.fields || []).find((f) => f.asNoun);
    push([T.nounOf ? T.nounOf(o) : T.noun, id], 'attributes', { objIds: oi, field: '__noun', text: (T.poseable && /^[A-Z]/.test((d.subject || '').trim()) ? '' : nf && (d[nf.key] || '').trim()) || T.noun });
    for (const f of T.fields || []) {
      if (f.asNoun) continue;
      const v = (d[f.key] || '').trim();
      if (!v) continue;
      if (f.key === 'pose' && /^standing$/i.test(v) && (ori.kind === 'horizontal' || ori.kind === 'upsideDown')) continue;   // contradicts the rotation
      const text = f.suffix && !v.toLowerCase().includes(f.suffix) && !f.noSuffix?.test(v) ? v + ' ' + f.suffix : v;
      push([camel(text), id], 'attributes', { objIds: oi, field: f.key, text });
    }
    for (const c of d.custom || []) {
      const k = (c.key || '').trim(), v = (c.value || '').trim();
      if (!k && !v) continue;
      const text = !v ? k : (!k || v.toLowerCase().includes(k.toLowerCase())) ? v : v + ' ' + k;
      push([camel(text), id], 'attributes', { objIds: oi, field: 'custom', text });
    }
    // orientation: tilt of the root, direction the head/top points in the camera's view
    if (ori.kind !== 'upright') {
      const oriPush = (name, text, extra) => push([name, id], 'orientation', { objIds: oi, field: 'orientation', text, tilt: Math.round(ori.tilt), ...extra });
      const hx = ori.up.x, hz = ori.up.z, hl = Math.hypot(hx, hz);
      let dir = null;
      if (hl > 0.15 && ori.kind !== 'upsideDown') {
        const dr = hx * camRight.x + hz * camRight.z, df = hx * camAway.x + hz * camAway.z;
        dir = Math.abs(dr) >= Math.abs(df) ? (dr < 0 ? 'Left' : 'Right') : (df < 0 ? 'TowardCamera' : 'AwayFromCamera');
      }
      const isDoll = !!T.poseable;
      if (ori.kind === 'tilted') {
        oriPush('tilted', 'tilted', { orient: 'tilted' });
      } else if (ori.kind === 'leaning') {
        if (dir) oriPush('leaning' + dir, 'leaning ' + dir, { orient: 'leaning', dir });
      } else if (ori.kind === 'upsideDown') {
        oriPush('upsideDown', 'upside down', { orient: 'upsideDown' });
      } else {
        const fy = ori.fwd.y;
        let name;
        if (isDoll) name = fy >= 0.5 ? 'lyingOnBack' : fy <= -0.5 ? 'lyingOnStomach' : ori.left.y < 0 ? 'lyingOnLeftSide' : 'lyingOnRightSide';
        else if (T.symmetry === 'none' && Math.abs(fy) >= 0.5) name = fy > 0 ? 'frontFacingUp' : 'frontFacingDown';
        else if (T.symmetry) name = 'turnedOnSide';
        else name = fy >= 0.5 ? 'lyingFlatFaceUp' : fy <= -0.5 ? 'lyingFlatFaceDown' : 'turnedOnSide';
        oriPush(name, name, { orient: 'horizontal' });
        if (dir) oriPush((isDoll ? 'headPointing' : 'topPointing') + dir, (isDoll ? 'head pointing ' : 'top pointing ') + dir, { orient: 'pointing', dir });
      }
    }
    push([sizeBucket(sizeOf(o)), id], 'size', { objIds: oi });
    if (F[i].support === 'ground') push(['onGround', id], 'placement', { objIds: oi });
    else if (F[i].support === 'floating') push(['floating', id], 'placement', { objIds: oi });
  });

  // binary
  const oid = vis.map((o) => o.id);
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const A = cells[i], B = cells[j];
    const pb = (x, rel, y, family) => push([ids[x], rel, ids[y]], family, { objIds: [oid[x], oid[y]] });
    // the grid is read along the axis nearest to the camera's view: leave out what the real view contradicts
    if (A.col !== B.col) {
      const [r, l] = A.col > B.col ? [i, j] : [j, i];
      if (!(F[r].inShot && F[l].inShot && F[r].x < F[l].x)) pb(r, 'rightOf', l, 'leftRight');
    } else pb(i, 'sameCol', j, 'sameRowCol');
    if (A.row !== B.row) {
      const [f, b] = A.row > B.row ? [i, j] : [j, i];
      if (F[b].depth - F[f].depth > 0.1) pb(f, 'frontOf', b, 'frontBack');
    } else pb(i, 'sameRow', j, 'sameRowCol');
    if (F[i].on === vis[j]) pb(i, 'onTopOf', j, 'onTop');
    else if (F[j].on === vis[i]) pb(j, 'onTopOf', i, 'onTop');
    else if (A.level !== B.level) {
      const [u, l] = A.level > B.level ? [i, j] : [j, i];
      pb(u, 'above', l, 'vertical');
    } else pb(i, 'sameLevel', j, 'vertical');
    if (A.level === B.level && Math.abs(A.col - B.col) + Math.abs(A.row - B.row) === 1) pb(i, 'adjacent', j, 'adjacent');
    // only heights are compared, so only for objects that stand upright
    if (orients[i].kind === 'upright' && orients[j].kind === 'upright') {
      const sa = objHeight(vis[i]), sb = objHeight(vis[j]);
      if (sa / sb > 1.08) pb(i, 'taller', j, 'sizeRel');
      else if (sb / sa > 1.08) pb(j, 'taller', i, 'sizeRel');
      else pb(i, 'sameHeight', j, 'sizeRel');
    }
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
    if (row || col || diag) push([ids[i], 'between', ids[j], ids[k]], 'between', { objIds: [oid[i], oid[j], oid[k]] });
  }

  // facing (extension)
  const fwd = (o) => { const v = new THREE.Vector3(0, 0, 1).applyQuaternion(o.root.quaternion); v.y = 0; return v.normalize(); };
  const flatDir = (from, to) => { const v = to.clone().sub(from); v.y = 0; return v.normalize(); };
  const fronts = [];
  vis.forEach((o, i) => {
    const ori = orients[i];
    if ((TYPES[o.type].symmetry || 'none') !== 'none') return;   // no front
    if (ori.flatLen < 0.35 || ori.kind === 'horizontal') return;   // forward (near) vertical or lying down: yaw is meaningless
    const f = fwd(o);
    const toCam = flatDir(o.root.position, camPos);
    const ang = f.angleTo(toCam) / DEG;
    const side = f.x * camRight.x + f.z * camRight.z < 0 ? 'Left' : 'Right';   // which way the front turns in the frame
    const name = ang < 20 ? 'facingCamera' : ang < 65 ? 'threeQuarter' + side : ang < 115 ? 'profile' + side
      : ang < 160 ? 'threeQuarterBack' + side : 'backToCamera';
    push([name, ids[i]], 'facing', { objIds: [o.id] });
    fronts[i] = f;
  });
  // facing each other: both turned towards the other one
  const turnedTo = (i, j) => fronts[i] && fronts[i].angleTo(flatDir(vis[i].root.position, vis[j].root.position)) / DEG < 30;
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    if (turnedTo(i, j) && turnedTo(j, i)) push([ids[i], 'facingEachOther', ids[j]], 'facingRel', { objIds: [vis[i].id, vis[j].id] });
  }

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

// Resolved tuples after family toggles, overrides (off / rel) and custom tuples.
// Each: { family, parts (rel resolved), rel, overridden, objIds?, field?, text?, ... } or { custom: true, text }
export function activeTuples() {
  const out = [];
  for (const t of state.tuples) {
    if (!state.settings.families[t.family]) continue;
    const o = state.overrides[t.key];
    if (o?.off) continue;
    const parts = t.parts.slice();
    let overridden = false;
    if (o?.rel && t.alts) { parts[1] = o.rel; overridden = o.rel !== t.parts[1]; }
    out.push({ ...t, parts, rel: parts[1], overridden, computedRel: t.parts[1] });
  }
  // one line per fact: skip what is already there, also when it is written the other way round
  const key = (p) => (p.length === 3 ? canonical(p) : p).join('|');
  const seen = new Set(out.map((t) => key(t.parts)));
  if (state.settings.families.custom) for (const c of state.custom) {
    const k = key(tupleParts(c.text));
    if (c.off || seen.has(k)) continue;
    seen.add(k);
    out.push({ family: 'custom', custom: true, parts: [], text: c.text });
  }
  return out;
}
export function finalTuples() {
  const act = activeTuples(), implied = impliedLeftRight(act);
  return act.filter((t) => !implied.has(t.key)).map((t) => (t.custom ? t.text : '(' + t.parts.join(', ') + ')'));
}
export function exportText() {
  const notes = state.notes.trim();
  return (notes ? notes + '\n\n' : '') + finalTuples().join('\n');
}
