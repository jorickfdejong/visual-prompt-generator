import { TYPES } from './types.js';
import { scaleRange } from './objects.js';

/* =====================================================================
   STRETCH — objects whose width, height and depth can be scaled separately.
   Dolls only scale as a whole: a stretched parent would skew their joints.
   ===================================================================== */
export const canStretch = (o) => !!TYPES[o.type].stretch;
// overall size, however it is stretched
// a stretched side may get visually flat, never zero, negative or flipped
export const FLAT = 0.001;
// flat sides count as 0.1 here, so the number (and the arrow-key step) does not collapse to nothing
export const sizeOf = (o) => { const s = o.root.scale; return s.x === s.y && s.y === s.z ? s.x : Math.cbrt(Math.max(s.x, 0.1) * Math.max(s.y, 0.1) * Math.max(s.z, 0.1)); };
// range of one side: stretchable objects go down to flat
export function sideRange(o) {
  const [a, b] = scaleRange(o);
  return canStretch(o) ? [FLAT, b] : [a, b];
}
// smallest and largest uniform factor: the range is judged on the largest side, flat sides never go below FLAT
export function scaleLimits(o, s = o.root.scale) {
  const [a, b] = scaleRange(o), lo = Math.min(s.x, s.y, s.z), hi = Math.max(s.x, s.y, s.z);
  if (!canStretch(o)) return [a / lo, b / hi];
  return [Math.max(FLAT / lo, Math.min(1, a / hi)), b / hi];
}
// one side dragged by factor r of its drag-start scale `s` (all sides `all`): from a flat side the change is
// additive, relative to the object's size, so it can grow again; r <= 0 (dragged through the centre) ends flat
export function stretchSide(o, s, all, r) {
  const [a, b] = sideRange(o);
  if (!canStretch(o)) return Math.min(b, Math.max(a, s * r));
  const base = Math.max(s, 0.25 * Math.max(all.x, all.y, all.z));
  return Math.min(b, Math.max(a, s + (r - 1) * base));
}
// saved as one number, or as [x, y, z] when stretched; small values keep their digits (never rounded to 0)
export function saveScale(o) {
  const v = o.root.scale.toArray().map((n) => Math.max(FLAT, n < 0.01 ? +n.toPrecision(3) : +n.toFixed(3)));
  return v[0] === v[1] && v[1] === v[2] ? v[0] : v;
}
