import * as THREE from 'three';
import { setHelper } from './scene.js';

/* =====================================================================
   MANNEQUIN (articulated)  — type registry entry
   ===================================================================== */
export const SKELETON = [
  ['pelvis', null, [0, 0.95, 0]],
  ['spine', 'pelvis', [0, 0.08, 0]],
  ['chest', 'spine', [0, 0.2, 0]],
  ['neck', 'chest', [0, 0.27, 0]],
  ['head', 'neck', [0, 0.08, 0]],
  ['shoulderL', 'chest', [0.19, 0.22, 0]], ['elbowL', 'shoulderL', [0, -0.29, 0]], ['wristL', 'elbowL', [0, -0.26, 0]],
  ['shoulderR', 'chest', [-0.19, 0.22, 0]], ['elbowR', 'shoulderR', [0, -0.29, 0]], ['wristR', 'elbowR', [0, -0.26, 0]],
  ['hipL', 'pelvis', [0.095, -0.06, 0]], ['kneeL', 'hipL', [0, -0.43, 0]], ['ankleL', 'kneeL', [0, -0.41, 0]],
  ['hipR', 'pelvis', [-0.095, -0.06, 0]], ['kneeR', 'hipR', [0, -0.43, 0]], ['ankleR', 'kneeR', [0, -0.41, 0]],
];
// Easy mode: pulling a dot turns the joint it hangs from (the elbow dot swings the arm around the shoulder).
// The dots of the pelvis, spine and hips would turn the whole doll, so Easy leaves them out.
const DOT_PULLS = Object.fromEntries(SKELETON.filter(([, parent]) => parent && parent !== 'pelvis').map(([n, parent]) => [n, parent]));
const TIP_DOTS = { head: [0, 0.25, 0], wristL: [0, -0.13, 0], wristR: [0, -0.13, 0], ankleL: [0, -0.015, 0.15], ankleR: [0, -0.015, 0.15] };
export const PELVIS_Y = 0.95;
// Pose presets: joint -> [x, y, z] degrees. Doll faces +Z, its left side is +X.
export const POSES = {
  Stand: { label: 'standing', joints: { shoulderL: [0, 0, 8], shoulderR: [0, 0, -8] } },
  'T-pose': { label: 'arms spread', joints: { shoulderL: [0, 0, 90], shoulderR: [0, 0, -90] } },
  Sit: { label: 'sitting', pelvisY: 0.5, joints: { hipL: [-90, 0, 0], hipR: [-90, 0, 0], kneeL: [90, 0, 0], kneeR: [90, 0, 0], shoulderL: [-20, 0, 6], shoulderR: [-20, 0, -6], elbowL: [-40, 0, 0], elbowR: [-40, 0, 0] } },
  Walk: { label: 'walking', joints: { hipL: [-25, 0, 0], kneeL: [15, 0, 0], hipR: [20, 0, 0], kneeR: [30, 0, 0], shoulderL: [22, 0, 6], shoulderR: [-22, 0, -6], elbowL: [-15, 0, 0], elbowR: [-25, 0, 0] } },
  Wave: { label: 'waving', joints: { shoulderL: [0, 0, 8], shoulderR: [0, 0, -150], elbowR: [0, 0, -35], head: [0, -10, 0] } },
  Point: { label: 'pointing', joints: { shoulderL: [0, 0, 8], shoulderR: [-90, 0, 0], head: [0, -5, 0] } },
};

export const unitSphere = new THREE.SphereGeometry(1, 24, 16);
export const capCache = {};
export function capsule(r, len) {
  const k = r + ':' + len;
  return capCache[k] || (capCache[k] = new THREE.CapsuleGeometry(r, len, 6, 16));
}

// a light version of an accent colour: the hex lerped t of the way towards white (0 = unchanged, 1 = white)
export function lightAccent(hex, t = 0.55) {
  return new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), t);
}

export function createMannequin(accent) {
  // transparent stays on permanently so edit-mode dimming only changes opacity (no shader recompiles)
  const wood = new THREE.MeshStandardMaterial({ color: accent ? lightAccent(accent, 0.55) : '#d9b48a', roughness: 0.75, metalness: 0, transparent: true });
  const ball = new THREE.MeshStandardMaterial({ color: accent ? lightAccent(accent, 0.30) : '#b98d5f', roughness: 0.7, metalness: 0, transparent: true });
  const root = new THREE.Group();
  const joints = {}, meshes = [], handles = [];
  for (const [name, parent, off] of SKELETON) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...off);
    (parent ? joints[parent] : root).add(g);
    joints[name] = g;
  }
  const add = (jointName, geo, mat, pos, scale) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.joint = jointName;
    joints[jointName].add(m);
    meshes.push(m);
    return m;
  };
  add('pelvis', unitSphere, wood, [0, -0.01, 0], [0.16, 0.1, 0.11]);
  add('pelvis', unitSphere, ball, [0.095, -0.06, 0], [0.062, 0.062, 0.062]);
  add('pelvis', unitSphere, ball, [-0.095, -0.06, 0], [0.062, 0.062, 0.062]);
  add('spine', capsule(0.085, 0.08), wood, [0, 0.1, 0], [1, 1, 0.75]);
  add('chest', unitSphere, wood, [0, 0.13, 0], [0.18, 0.16, 0.11]);
  add('neck', capsule(0.038, 0.05), ball, [0, 0.03, 0]);
  add('head', unitSphere, wood, [0, 0.12, 0], [0.095, 0.125, 0.105]);
  add('head', unitSphere, wood, [0, 0.11, 0.098], [0.018, 0.028, 0.018]); // nose: shows facing direction
  for (const s of ['L', 'R']) {
    add('shoulder' + s, unitSphere, ball, [0, 0, 0], [0.05, 0.05, 0.05]);
    add('shoulder' + s, capsule(0.042, 0.19), wood, [0, -0.145, 0]);
    add('elbow' + s, unitSphere, ball, [0, 0, 0], [0.038, 0.038, 0.038]);
    add('elbow' + s, capsule(0.036, 0.18), wood, [0, -0.13, 0]);
    add('wrist' + s, unitSphere, wood, [0, -0.075, 0], [0.04, 0.08, 0.022]);
    add('hip' + s, capsule(0.064, 0.28), wood, [0, -0.215, 0]);
    add('knee' + s, unitSphere, ball, [0, 0, 0], [0.052, 0.052, 0.052]);
    add('knee' + s, capsule(0.05, 0.29), wood, [0, -0.205, 0]);
    add('ankle' + s, unitSphere, wood, [0, -0.015, 0.05], [0.05, 0.035, 0.12]);
  }
  // Editor-only joint handles
  const hMat = new THREE.MeshBasicMaterial({ color: '#ff9f43', depthTest: false, transparent: true, opacity: 0.9 });
  for (const name of Object.keys(joints)) {
    const h = new THREE.Mesh(unitSphere, hMat.clone());
    h.scale.setScalar(name === 'pelvis' ? 0.05 : 0.038);
    h.renderOrder = 999;
    h.userData.handle = name;
    h.visible = false;
    joints[name].add(h);
    setHelper(h);
    h.userData.pulls = DOT_PULLS[name];
    handles.push(h);
  }
  // ends of the limbs: only for pulling (Easy mode)
  for (const [name, pos] of Object.entries(TIP_DOTS)) {
    const h = new THREE.Mesh(unitSphere, hMat.clone());
    h.scale.setScalar(0.03);
    h.position.set(...pos);
    h.renderOrder = 999;
    h.userData.pulls = name;
    h.visible = false;
    joints[name].add(h);
    setHelper(h);
    handles.push(h);
  }
  return { root, joints, meshes, handles, mats: [wood, ball] };
}
