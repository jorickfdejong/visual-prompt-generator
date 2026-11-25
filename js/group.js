import * as THREE from 'three';
import { TYPES } from './types.js';

/* =====================================================================
   GROUP — several objects as one: its root holds the built members, o.members their saved data
   (position, rotation and scale relative to the root, which stands under the centre of the members)
   ===================================================================== */
const clone = (data) => JSON.parse(JSON.stringify(data || []));
// 'none' = has a front (types without a symmetry do too)
export const symmetryOf = (o) => TYPES[o.type].symmetryOf?.(o) ?? TYPES[o.type].symmetry;

const MAX_TURN = Math.cos(15 * Math.PI / 180);
// the direction all members with a front face, as [x, z]; null when there is none or they differ
export function commonFront(objs) {
  const dirs = [];
  for (const o of objs) {
    if ((symmetryOf(o) || 'none') !== 'none') continue;
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(o.root.quaternion);
    if (Math.abs(v.y) > 0.5) return null;
    v.y = 0; v.normalize();
    if (dirs.some((d) => d.dot(v) < MAX_TURN)) return null;
    dirs.push(v);
  }
  return dirs.length ? [dirs[0].x, dirs[0].z] : null;
}

function buildMember(d, accent) {
  const m = { type: d.type, accent, details: d.details, ...TYPES[d.type].create(accent) };
  m.root.position.fromArray(d.pos);
  m.root.quaternion.fromArray(d.quat);
  if (Array.isArray(d.scale)) m.root.scale.fromArray(d.scale); else m.root.scale.setScalar(d.scale);
  TYPES[d.type].applyExtra(m, d);
  return m;
}
// members take the colour of the group (their own one is kept in their data)
function buildGroup(o) {
  o.built = o.members.filter((d) => TYPES[d.type]).map((d) => buildMember(d, o.accent));
  o.built.forEach((m) => o.parts.add(m.root));
  o.meshes = o.built.flatMap((m) => m.meshes);
  o.mats = o.built.flatMap((m) => m.mats);
  o.meshes.forEach((m) => { m.userData.objId = o.id; });
  const front = commonFront(o.built);
  o.front = !!front && front[1] > MAX_TURN;
  // measured before it is placed in the scene
  o.parts.updateMatrixWorld(true);
  const box = new THREE.Box3();
  o.meshes.forEach((m) => box.expandByObject(m, true));
  o.height = box.isEmpty() ? 1 : Math.max(0.01, box.max.y);
  o.root.add(o.parts);
}
function createGroup() {
  return { root: new THREE.Group(), parts: new THREE.Group(), joints: {}, meshes: [], handles: [], mats: [], members: [], built: [] };
}
// a function: types.js and this module import each other
export function groupType(camel) {
  return {
    noun: 'object',
    nounOf: (o) => camel(o.details.subject || '') || 'object',
    baseName: 'group',
    scaleRange: [0.1, 10],   // as a whole only: a stretched parent would skew turned members
    height: (o) => o.height,
    symmetryOf: (o) => (o.front ? 'none' : 'round'),
    fields: [
      { key: 'subject', label: 'Represents', type: 'text', placeholder: 'e.g. market stall', asNoun: true },
      { key: 'description', label: 'Description', type: 'text', placeholder: 'e.g. old and weathered' },
    ],
    create: createGroup,
    defaultDetails: () => ({ name: '', subject: '', description: '', custom: [] }),
    serializeExtra: (o) => ({ members: clone(o.members) }),
    applyExtra: (o, d) => { o.members = clone(d.members); buildGroup(o); },
  };
}
