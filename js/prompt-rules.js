import { state } from './state.js';

/* =====================================================================
   PROMPT RULES — fixed lines and sentence templates (no scene calculations)
   ===================================================================== */
export const REFERENCE_LINE = 'Use the reference image for composition, pose and camera only. Ignore its colours, materials and textures.';
export const FULL_COLOUR_LINE = 'Full-colour image, natural colours.';

const GEOMETRY = new Set(['cube', 'ball', 'cylinder', 'pyramid', 'cone']);
const a = (s) => (/^(a|an|the|some) /i.test(s) || /^[A-Z]/.test(s) ? s : (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s);
// shapes and puppets stand in for real things: say so, and say for what
export function standInLines() {
  const vis = state.objects.filter((o) => !o.hidden), shapes = vis.filter((o) => GEOMETRY.has(o.type));
  const out = [];
  if (shapes.length) {
    const named = shapes.filter((o) => (o.details.subject || '').trim()).map((o) => `the ${o.type} ${o.details.name} is ${a(o.details.subject.trim())}`);
    out.push('Geometric shapes in the reference image are stand-ins that only show position, size and proportions. Do not draw them as plain geometric shapes: replace each one with the real object it represents, with realistic form and detail.' + (named.length ? ' In this scene ' + named.join('; ') + '.' : ''));
  }
  if (vis.some((o) => o.type === 'mannequin')) out.push('Wooden mannequins are stand-ins for real people: do not draw them as dolls or mannequins.');
  return out;
}

// grey reference image unless the scene asks for the coloured one
export const clayReference = () => state.settings.reference !== 'colour';

// lines that close every prompt, in every format
export function fixedLines() {
  if (!state.settings.families.closing) return [];
  const words = [state.notes, state.visualStyle, ...Object.values(state.environment || {})].join(' ');
  const mono = /black[\s-]*(and|&|n)[\s-]*white|\bb\s*&\s*w\b|monochrom|gr[ea]y[\s-]?scale|sepia/i.test(words);
  return [...standInLines(), REFERENCE_LINE, ...(clayReference() && !mono ? [FULL_COLOUR_LINE] : [])];
}

// relation -> words between the two names
export const TEMPLATES = {
  rightOf: 'is to the right of', leftOf: 'is to the left of',
  frontOf: 'is closer to the camera than', backOf: 'is further from the camera than',
  above: 'is above', below: 'is below', onTopOf: 'is resting on top of', sameLevel: 'is at the same height as',
  sameRow: 'is in the same row as', sameCol: 'is in the same column as', adjacent: 'is next to',
  larger: 'is larger than', smaller: 'is smaller than', sameSize: 'is the same size as',
  facing: 'faces', facingAway: 'faces away from',
};
const INVERSE = { leftOf: 'rightOf', backOf: 'frontOf', below: 'above', smaller: 'larger' };
const SYMMETRIC = new Set(['sameRow', 'sameCol', 'sameLevel', 'sameSize', 'adjacent']);
// relations on the same topic: two different ones for the same pair contradict each other
const TOPIC = { rightOf: 'left/right', frontOf: 'front/back', above: 'height', onTopOf: 'height', sameLevel: 'height', larger: 'size', sameSize: 'size', facing: 'facing', facingAway: 'facing' };

// one form per fact: (B, leftOf, A) and (A, rightOf, B) give the same result
export function canonical([a, rel, b]) {
  if (INVERSE[rel]) return [b, INVERSE[rel], a];
  return SYMMETRIC.has(rel) && a > b ? [b, rel, a] : [a, rel, b];
}
export function contradicts(p, q) {
  const [a, r, b] = canonical(p), [c, s, d] = canonical(q);
  if (!TOPIC[r] || TOPIC[r] !== TOPIC[s]) return false;
  const same = a === c && b === d, swapped = a === d && b === c;
  if (TOPIC[r] === 'facing') return same && r !== s;
  if (swapped) return true;   // equal symmetric relations are always written the same way round
  return same && r !== s && SYMMETRIC.has(r) !== SYMMETRIC.has(s);   // above + onTopOf agree
}
export const tupleParts = (text) => String(text).replace(/^\s*\(|\)\s*$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
