import * as THREE from 'three';
import { lightAccent } from './mannequin.js';

/* =====================================================================
   WOODEN TOYS & SHAPES — simple blocks in the object's light colour, standing on the floor and facing +Z
   ===================================================================== */
let grain = null;
function grainTexture() {
  if (grain) return grain;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256, b = (rnd() - 0.5) * 10;
    g.strokeStyle = `rgba(90,60,30,${0.06 + rnd() * 0.12})`;
    g.lineWidth = 1 + rnd() * 2;
    for (const o of [-256, 0, 256]) { g.beginPath(); g.moveTo(x + o, 0); g.bezierCurveTo(x + o + b, 85, x + o - b, 170, x + o, 256); g.stroke(); }
  }
  grain = new THREE.CanvasTexture(cv);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.anisotropy = 4;
  return grain;
}
const wood = (color) => new THREE.MeshStandardMaterial({ color, map: grainTexture(), roughness: 0.75, transparent: true });

// build(add, light, dark): add(geometry, material, x, y, z) puts a block in the toy
const maker = (build) => (accent) => {
  const root = new THREE.Group(), parts = new THREE.Group(), meshes = [];
  const light = wood(lightAccent(accent, 0.55)), dark = wood(lightAccent(accent, 0.15));
  root.add(parts);
  build((geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parts.add(m); meshes.push(m);
    return m;
  }, light, dark);
  return { root, parts, joints: {}, meshes, handles: [], mats: [light, dark] };
};
// a flat outline cut from a thick plank with rounded edges, centred on its thickness
function plank(shape, depth, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 16 });
  geo.translate(0, 0, -depth / 2 + bevel);
  return geo;
}

const createTree = maker((add, light, dark) => {
  add(new THREE.CylinderGeometry(0.12, 0.12, 1, 24), dark, 0, 0.5, 0);
  add(new THREE.SphereGeometry(1, 32, 24), light, 0, 1.65, 0).scale.set(0.65, 0.85, 0.65);
});

// side view of a small rounded car with two window holes; drawn with the front at +x, then turned to face +Z
const createCar = maker((add, light, dark) => {
  const s = new THREE.Shape();
  s.moveTo(-1.35, 0.28);
  s.lineTo(-1.35, 0.6);
  s.bezierCurveTo(-1.35, 0.95, -1.15, 1.45, -0.65, 1.5);      // rounded back
  s.lineTo(0.1, 1.5);                                          // roof
  s.bezierCurveTo(0.45, 1.5, 0.6, 1.1, 0.72, 0.98);            // windscreen
  s.bezierCurveTo(0.95, 0.92, 1.3, 0.9, 1.38, 0.6);            // bonnet
  s.bezierCurveTo(1.46, 0.55, 1.5, 0.45, 1.48, 0.28);          // bumper
  s.closePath();
  const back = new THREE.Path();
  back.moveTo(-0.32, 0.95); back.lineTo(-0.95, 0.95);
  back.bezierCurveTo(-1.0, 1.15, -0.85, 1.34, -0.62, 1.35); back.lineTo(-0.32, 1.35); back.closePath();
  const front = new THREE.Path();
  front.moveTo(-0.15, 0.95); front.lineTo(-0.15, 1.35); front.lineTo(0.08, 1.35);
  front.bezierCurveTo(0.26, 1.33, 0.36, 1.12, 0.46, 0.95); front.closePath();
  s.holes.push(back, front);
  const body = plank(s, 1.1, 0.04);
  body.rotateY(-Math.PI / 2);
  add(body, light);
  for (const z of [-0.82, 0.85]) for (const side of [-1, 1]) {
    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 32); tyre.rotateZ(Math.PI / 2);
    add(tyre, dark, side * 0.65, 0.34, z);
    const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.24, 20); hub.rotateZ(Math.PI / 2);
    add(hub, light, side * 0.66, 0.34, z);
  }
});

// gabled block: the pointed face looks at +Z
const createHouse = maker((add, light) => {
  const s = new THREE.Shape();
  s.moveTo(-1, 0); s.lineTo(1, 0); s.lineTo(1, 1.5); s.lineTo(0, 2.5); s.lineTo(-1, 1.5); s.closePath();
  add(plank(s, 1.1, 0.03), light);
});

const geometry = (make, y = 0.5) => maker((add, light) => { add(make(), light, 0, y, 0); });
const LINE_RADIUS = 0.02;

const FIELDS = [
  { key: 'subject', label: 'Represents', type: 'text', placeholder: 'e.g. flower pot', asNoun: true },
  { key: 'color', label: 'Colour', type: 'text', placeholder: 'e.g. dark green' },
  { key: 'material', label: 'Material', type: 'text', placeholder: 'e.g. brick' },
  { key: 'description', label: 'Description', type: 'text', placeholder: 'e.g. old and weathered' },
];
// symmetry: what a rotation can't change. 'none' has a front; 'round' turns freely around its axis;
// 'flip' also looks the same upside down; 'cube' / 'ball' look the same on every side
const LIST = [
  ['tree', 'Tree', 'object', 2.5, 'round', createTree, '<path d="M12 22v-7"/><ellipse cx="12" cy="9" rx="5.5" ry="7"/>'],
  ['car', 'Car', 'object', 1.5, 'none', createCar, '<path d="M3 17V13c0-4 2-6 5-6h4c3 0 4 2 5 4 3 0 4 2 4 6z"/><circle cx="8" cy="17" r="2.2"/><circle cx="16" cy="17" r="2.2"/>'],
  ['house', 'House', 'object', 2.5, 'none', createHouse, '<path d="M5 21V11l7-8 7 8v10z"/>'],
  ['cube', 'Cube', 'geometry', 1, 'cube', geometry(() => new THREE.BoxGeometry(1, 1, 1)), '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>'],
  ['ball', 'Sphere', 'geometry', 1, 'ball', geometry(() => new THREE.SphereGeometry(0.5, 40, 28)), '<circle cx="12" cy="12" r="8.5"/>'],
  ['cylinder', 'Cylinder', 'geometry', 1, 'flip', geometry(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 40)), '<ellipse cx="12" cy="6" rx="6.5" ry="2.5"/><path d="M5.500 6v12c0 1.400 3 2.500 6.500 2.500s6.500-1.100 6.500-2.500V6"/>'],
  ['pyramid', 'Pyramid', 'geometry', 1, 'round', geometry(() => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).toNonIndexed(); g.rotateY(Math.PI / 4); g.computeVertexNormals(); return g; }), '<path d="M12 3l9 15-9 3-9-3zM12 3v18"/>'],
  ['cone', 'Cone', 'geometry', 1, 'round', geometry(() => new THREE.ConeGeometry(0.5, 1, 40)), '<path d="M12 3L5.500 18.500M12 3l6.500 15.500"/><ellipse cx="12" cy="18.500" rx="6.500" ry="2.500"/>'],
  ['line', 'Line', 'geometry', 1, 'flip', geometry(() => new THREE.CylinderGeometry(LINE_RADIUS, LINE_RADIUS, 1, 12)), '<path d="M5 19L19 5"/>'],
];
export const PROPS = LIST.map(([type, label, group, , , , icon]) => ({ type, label, group, icon }));
// the types an object consists of: its own, or those of the members of a group (also for saved data)
export const typesIn = (o) => (o.type === 'group' ? o.members.flatMap(typesIn) : [o.type]);
// camel is passed in because relations.js imports types.js (a cycle)
export function propTypes(camel) {
  return Object.fromEntries(LIST.map(([type, label, group, h, symmetry, create]) => [type, {
    noun: group === 'geometry' ? 'object' : type,   // a shape only stands in for something
    geometry: group === 'geometry',
    stretch: true,
    nounOf: (o) => camel(o.details.subject || '') || (group === 'geometry' ? 'object' : type),
    baseName: label.toLowerCase(),   // the word people see; the type itself is what saved scenes hold ('ball')
    scaleRange: [0.1, 10],
    height: () => h,
    symmetry,
    fields: FIELDS,
    create,
    defaultDetails: () => ({ name: '', subject: '', color: '', material: '', description: '', custom: [] }),
    serializeExtra: () => ({}),
    applyExtra: () => {},
  }]));
}
