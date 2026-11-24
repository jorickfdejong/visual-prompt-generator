import { TYPES } from './types.js';
import { scaleRange } from './objects.js';

/* =====================================================================
   STRETCH — objects whose width, height and depth can be scaled separately.
   Puppets only scale as a whole: a stretched parent would skew their joints.
   ===================================================================== */
export const canStretch = (o) => !!TYPES[o.type].stretch;
// overall size, however it is stretched
export const sizeOf = (o) => { const s = o.root.scale; return s.x === s.y && s.y === s.z ? s.x : Math.cbrt(s.x * s.y * s.z); };
// smallest and largest factor that keeps every side within the type's range
export function scaleLimits(o, s = o.root.scale) {
  const [a, b] = scaleRange(o);
  return [a / Math.min(s.x, s.y, s.z), b / Math.max(s.x, s.y, s.z)];
}
// saved as one number, or as [x, y, z] when stretched
export function saveScale(o) {
  const v = o.root.scale.toArray().map((n) => +n.toFixed(3));
  return v[0] === v[1] && v[1] === v[2] ? v[0] : v;
}
