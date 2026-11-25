import { ENV_FIELDS, state } from './state.js';
import { activeTuples, exportId } from './relations.js';
import { depthWord, footprintsOverlap, leftToRight } from './world-facts.js';
import { TYPES } from './types.js';
import { typeWord } from './details.js';
import { fixedLines, TEMPLATES, tupleParts } from './prompt-rules.js';

/* =====================================================================
   NATURAL-LANGUAGE PROMPT — deterministic prose derived from the same resolved tuples as the export
   (activeTuples(): family toggles, overrides and custom tuples are honoured).
   Objects run from left to right in the frame, then layout, camera and lighting; the closing lines come from prompt-rules.js.
   Parts of a sentence are strings or segments { text, target } (target = { kind: 'obj', id } | { kind: 'camera' } | { kind: 'environment' } | { kind: 'finalImage' }).
   ===================================================================== */

/* ---------- small language helpers ---------- */
const BE = { be: true };   // placeholder replaced by is / are
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const spaced = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

function art(phrase) {
  const p = String(phrase).trim();
  if (!p) return p;
  if (/^(a|an|the|his|her|their|its|my|our|your|some|one|two|three|four|five|several|many|\d+)\b/i.test(p)) return p;
  if (/^(uni|use|usu|uti|eu|ewe|one|once)/i.test(p)) return 'a ' + p;
  if (/^(hour|honest|honou?r|heir)/i.test(p)) return 'an ' + p;
  return (/^[aeiou]/i.test(p) || /^(8|11|18)\b/.test(p) ? 'an ' : 'a ') + p;
}
// clothing: plural words ("jeans", "boots") take no article
const isPlural = (p) => /[a-z]s$/i.test(p) && !/(ss|us|is)$/i.test(p);
const artUnlessPlural = (p) => (isPlural(p.trim().split(/\s+/).pop()) ? p : art(p));

// "a", "a and b", "a, b and c" over arrays of parts
function listAnd(items) {
  const out = [];
  items.forEach((it, i) => {
    if (i > 0) out.push(i === items.length - 1 ? ' and ' : ', ');
    out.push(...it);
  });
  return out;
}

function pronouns(o, gender) {
  if (o.type !== 'mannequin') return { subj: 'it', obj: 'it', poss: 'its', be: 'is', pl: false, third: true };
  if (gender === 'female') return { subj: 'she', obj: 'her', poss: 'her', be: 'is', pl: false, third: true };
  if (gender === 'male') return { subj: 'he', obj: 'him', poss: 'his', be: 'is', pl: false, third: true };
  return { subj: 'they', obj: 'them', poss: 'their', be: 'are', pl: true, third: false };
}
const verb = (p, base, s) => (p.pl ? base : s);

/* ---------- gather the active tuples per object / topic ---------- */
function nameOf(o) { return o.details.name || o.id; }
const refObj = (o) => ({ text: nameOf(o), target: { kind: 'obj', id: o.id } });
const refCam = (t = 'the camera') => ({ text: t, target: { kind: 'camera' } });
const refImage = (t) => ({ text: t, target: { kind: 'finalImage' } });
const refEnv = (t) => ({ text: t, target: { kind: 'environment' } });

function gather() {
  const facts = state.facts;
  const vis = leftToRight(facts).filter((o) => !o.hidden && state.objects.includes(o));
  const byId = new Map(vis.map((o) => [o.id, o]));
  const info = new Map(vis.map((o) => [o.id, { noun: null, fields: {}, custom: [], size: null, facing: null, orient: [], placement: null }]));
  const g = { facts, same: new Set(), vis, byId, info, edges: { left: [], front: [], vert: [], larger: [] }, stand: [], between: [], faces: [], camera: [], env: {}, style: '', custom: [], adj: new Set() };
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  g.pairKey = pairKey;
  // how the objects really stand, also when their orientation is left out of the prompt
  const turned = new Set(state.tuples.filter((t) => t.family === 'orientation').map((t) => t.objIds[0]));
  g.upright = (id) => !turned.has(id);
  for (const t of activeTuples()) {
    if (t.custom) { g.custom.push(t.text); continue; }
    const ids = t.objIds || [];
    const inf = ids.length ? info.get(ids[0]) : null;
    switch (t.family) {
      case 'environment': g.env[t.field] = t.value || t.text; break;
      case 'finalImage': g.style = t.text; break;
      case 'camera': g.camera.push(t.parts[0]); break;
      case 'attributes':
        if (!inf) break;
        if (t.field === '__noun') inf.noun = t.text;
        else if (t.field === 'custom') inf.custom.push(t.text);
        else inf.fields[t.field] = t.text;
        break;
      case 'size': if (inf) inf.size = t.parts[0]; break;
      case 'sizeRel':
        if (ids.length !== 2 || !byId.has(ids[0]) || !byId.has(ids[1])) break;
        if (t.rel === 'taller') g.edges.larger.push([ids[0], ids[1], 'larger', t.overridden]);
        else if (t.rel === 'shorter') g.edges.larger.push([ids[1], ids[0], 'larger', t.overridden]);
        else if (t.rel === 'sameHeight') g.same.add(pairKey(ids[0], ids[1]));
        break;
      case 'placement': if (inf) inf.placement = t.parts[0]; break;
      case 'orientation': if (inf) inf.orient.push(t.parts[0]); break;
      case 'facing': if (inf) inf.facing = t.parts[0]; break;
      case 'facingRel':
        if (ids.length === 2 && byId.has(ids[0]) && byId.has(ids[1])) g.faces.push([ids[0], ids[1], t.rel]);
        break;
      case 'between':
        if (ids.length === 3 && ids.every((i) => byId.has(i))) g.between.push(ids);
        break;
      default: {
        if (ids.length !== 2 || !ids.every((i) => byId.has(i))) break;
        const [a, b] = ids;
        if (t.family === 'leftRight') {
          if (t.rel === 'rightOf') g.edges.left.push([b, a, 'left']); else if (t.rel === 'leftOf') g.edges.left.push([a, b, 'left']);
        } else if (t.family === 'frontBack') {
          if (t.rel === 'frontOf') g.edges.front.push([a, b, 'front', t.overridden]); else if (t.rel === 'backOf') g.edges.front.push([b, a, 'front', t.overridden]);
        } else if (t.family === 'sameRowCol') {
          if (t.overridden) g.stand.push([a, b, t.rel]);
        } else if (t.family === 'vertical' || t.family === 'onTop') {
          if (t.rel === 'above') g.edges.vert.push([a, b, 'above', t.overridden]);
          else if (t.rel === 'below') g.edges.vert.push([b, a, 'above', t.overridden]);
          else if (t.rel === 'onTopOf') g.edges.vert.push([a, b, 'onTop', t.overridden]);
          else if (t.overridden) g.stand.push([a, b, 'sameLevel']);
        } else if (t.family === 'adjacent') g.adj.add(pairKey(a, b));
      }
    }
  }
  return g;
}

// drop an edge when the same relation is already implied by a chain through other edges (a < b < c makes a < c redundant)
function reduceEdges(edges) {
  return edges.filter((e) => {
    const seen = new Set([e[0]]);
    const stack = [e[0]];
    while (stack.length) {
      const x = stack.pop();
      for (const f of edges) {
        if (f === e || f[0] !== x) continue;
        if (f[1] === e[1]) { if (x !== e[0]) return false; continue; }
        if (!seen.has(f[1])) { seen.add(f[1]); stack.push(f[1]); }
      }
    }
    return true;
  });
}
function dedupe(edges) {
  const seen = new Set();
  return edges.filter((e) => { const k = e[0] + '>' + e[1] + e[2]; if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------- sentences ---------- */
function resolveBE(parts, be) { return parts.map((p) => (p === BE ? be : p)); }

function nounPhrase(o, inf) {
  if (o.type !== 'mannequin') {
    // pictures, toys and shapes: colour and material in front of the noun
    const words = [inf.fields.color, inf.fields.material, inf.noun].filter(Boolean);
    return words.length ? art(words.join(' ')) : null;
  }
  const gender = inf.fields.gender, age = inf.fields.age, race = inf.fields.race ? inf.fields.race + ' ' : '';
  const a = age ? age.toLowerCase() : '';
  let noun = null;
  if (inf.noun && inf.noun !== 'person') noun = [a, race.trim(), (gender || '').toLowerCase(), inf.noun].filter(Boolean).join(' ');
  else if (gender || age) {
    const g = (gender || '').toLowerCase();
    const kid = a === 'child' || a === 'teenager';
    const adj = a === 'teenager' ? 'teenage' : a === 'child' ? '' : a;
    if (g === 'female') noun = (kid ? (a === 'teenager' ? 'teenage ' : '') + race + 'girl' : (adj ? adj + ' ' : '') + race + 'woman');
    else if (g === 'male') noun = (kid ? (a === 'teenager' ? 'teenage ' : '') + race + 'boy' : (adj ? adj + ' ' : '') + race + 'man');
    else if (g) noun = (adj ? adj + ' ' : '') + race + g + ' person';
    else noun = a === 'child' || a === 'teenager' ? race + a : a + ' ' + race + 'person';
  } else if (inf.noun) noun = race + inf.noun;
  else if (race) noun = race + 'person';
  if (!noun) return null;
  const withs = [inf.fields.body && artUnlessPlural(inf.fields.body), inf.fields.skin, inf.fields.hair].filter(Boolean);
  return art(noun) + (withs.length ? ' with ' + listAnd(withs.map((w) => [w])).join('') : '');
}

function orientParts(names, p, isDoll) {
  const main = names.find((n) => /^(lying|turned|leaning|upsideDown|tilted|frontFacing)/.test(n));
  const pointN = names.find((n) => /^(head|top)Pointing/.test(n));
  const dirOf = (n) => n.replace(/^(head|top)Pointing/, '');
  const poss = p.poss;
  let out = null;
  if (main) {
    const m = {
      lyingOnBack: [' lying on ', poss, ' back'],
      lyingOnStomach: [' lying on ', poss, ' stomach'],
      lyingOnLeftSide: [' lying on ', poss, ' left side'],
      lyingOnRightSide: [' lying on ', poss, ' right side'],
      lyingFlatFaceUp: [' lying flat, face up'],
      lyingFlatFaceDown: [' lying flat, face down'],
      turnedOnSide: [' turned on ', poss, ' side'],
      frontFacingUp: [' tipped over with ', poss, ' front facing up'],
      frontFacingDown: [' tipped over with ', poss, ' front facing down'],
      tilted: [' tilted'],
      leaningLeft: [' leaning to the left of the frame'],
      leaningRight: [' leaning to the right of the frame'],
      leaningTowardCamera: [' leaning towards ', refCam()],
      leaningAwayFromCamera: [' leaning away from ', refCam()],
      upsideDown: [' upside down'],
    }[main];
    if (m) out = [BE, ...m];
  }
  if (pointN) {
    const d = dirOf(pointN);
    const where = { Left: ['to the left of the frame'], Right: ['to the right of the frame'], TowardCamera: ['towards ', refCam()], AwayFromCamera: ['away from ', refCam()] }[d];
    if (where) {
      const part = [' ', poss, isDoll ? ' head' : ' top', ' pointing ', ...where];
      out = out ? [...out, ', with', ...part] : ['has', ...part];
    }
  }
  return out;
}

function facingParts(name, p) {
  const left = ' to the left of the frame', right = ' to the right of the frame';
  switch (name) {
    case 'facingCamera': return [verb(p, 'face', 'faces'), ' ', refCam()];
    case 'backToCamera': return [verb(p, 'have', 'has'), ' ', p.poss, ' back to ', refCam()];
    case 'threeQuarterLeft': return [BE, ' turned', left, ' in a three-quarter view'];
    case 'threeQuarterRight': return [BE, ' turned', right, ' in a three-quarter view'];
    case 'profileLeft': return [BE, ' turned', left, ' in profile'];
    case 'profileRight': return [BE, ' turned', right, ' in profile'];
    case 'threeQuarterBackLeft': return [BE, ' turned away from ', refCam(), ' and towards the', left.replace(' to the', '')];
    case 'threeQuarterBackRight': return [BE, ' turned away from ', refCam(), ' and towards the', right.replace(' to the', '')];
    case 'profile': return [BE, ' seen in profile'];
    default: return null;
  }
}

// clauses of a mannequin's first sentence
function mannequinClauses(inf, p, poseSaid) {
  const f = inf.fields, cl = [];
  const orient = orientParts(inf.orient, p, true);
  if (orient) cl.push({ kind: 'orient', parts: orient });
  if (f.clothing) cl.push({ kind: 'plain', parts: ['wears ' + artUnlessPlural(f.clothing)] });
  if (f.expression) {
    const e = f.expression;
    if (/\b(expression|face|look|smile|grin)\b/i.test(e) && !/ing$/i.test(e)) cl.push({ kind: 'plain', parts: ['has ' + art(e)] });
    else if (/ing$/i.test(e)) cl.push({ kind: 'is', text: e });
    else cl.push({ kind: 'plain', parts: ['looks ' + e] });
  }
  if (f.pose && !poseSaid) {
    const e = f.pose;
    if (/ing$/i.test(e)) cl.push({ kind: 'is', text: e });
    else if (/^(with|in|on|at|against|arms|legs|hands)\b/i.test(e)) cl.push({ kind: 'plain', parts: ['is posed ' + e] });
    else if (/\b(pose|position|stance)\b/i.test(e)) cl.push({ kind: 'is', text: 'in ' + art(e) });
    else cl.push({ kind: 'is', text: 'in ' + art(e + ' pose') });
  }
  if (f.action) cl.push(/^[a-z]+ing\b/i.test(f.action) ? { kind: 'is', text: f.action } : { kind: 'plain', parts: [f.action] });
  return cl;
}
function clausesToParts(cl, be) {
  const merged = [];
  for (const c of cl) {
    const last = merged[merged.length - 1];
    if (c.kind === 'is' && last && last.kind === 'is') last.texts.push(c.text);
    else if (c.kind === 'is') merged.push({ kind: 'is', texts: [c.text] });
    else merged.push(c);
  }
  return merged.map((c) => (c.kind === 'is'
    ? [be + ' ', ...listAnd(c.texts.map((t) => [t]))]
    : resolveBE(c.parts, be)));
}

// one sentence per relation, from fixed templates
function layoutSentences(g) {
  const out = [], ref = (id) => refObj(g.byId.get(id)), order = new Map(g.vis.map((o, i) => [o.id, i]));
  const byOrder = (edges) => [...edges].sort((p, q) => order.get(p[0]) - order.get(q[0]) || order.get(p[1]) - order.get(q[1]));
  const say = (a, words, b, tail = '') => out.push([ref(a), ' ' + words + ' ', ref(b), tail + '.']);
  const fact = (id) => g.facts.get(id);

  const nextSaid = new Set();   // "immediately to the left of" already says that they are next to each other
  for (const [a, b] of byOrder(g.reduced.left)) {
    const k = g.pairKey(a, b);
    if (g.adj.has(k)) nextSaid.add(k);
    say(a, g.adj.has(k) ? 'is immediately to the left of' : TEMPLATES.leftOf, b);
  }
  for (const [f, k, , over] of byOrder(g.reduced.front)) {   // f is in front of k
    if (over) { say(f, TEMPLATES.frontOf, k); continue; }
    const F = fact(f), K = fact(k);
    say(k, 'is ' + depthWord(K.depth - F.depth), f, K.distance > F.distance ? ', further from the camera' : '');
  }
  if (out.length) out[0].unshift("From the camera's point of view, ");
  for (const k of g.adj) {
    if (nextSaid.has(k)) continue;
    const [a, b] = k.split('|').sort((x, y) => order.get(x) - order.get(y));
    say(a, TEMPLATES.adjacent, b);
  }
  for (const [a, b, kind, over] of byOrder(g.reduced.vert)) {
    // an object resting on another one is already placed: no need to compare its height with the rest of the scene
    if (!over && kind === 'above' && fact(a).on && !footprintsOverlap(fact(a), fact(b))) continue;
    say(a, kind === 'onTop' ? TEMPLATES.onTopOf : over || footprintsOverlap(fact(a), fact(b)) ? TEMPLATES.above : 'is higher up than', b);
  }
  // heights: objects of the same height form a group, which is compared with the others only once
  const groups = [];
  for (const o of g.vis) {
    const grp = groups.find((x) => x.every((id) => g.same.has(g.pairKey(id, o.id))));
    if (grp) grp.push(o.id); else groups.push([o.id]);
  }
  const rep = new Map(groups.flatMap((x) => x.map((id) => [id, x[0]])));
  for (const x of groups) if (x.length > 1) out.push([...listAnd(x.map((id) => [ref(id)])), ' are about the same height.']);
  const has = new Set(g.edges.larger.map((e) => e[0] + '>' + e[1]));
  const sizes = reduceEdges(dedupe(g.edges.larger.filter(([a, b, , over]) => over || (rep.get(a) === a && rep.get(b) === b) || !has.has(rep.get(a) + '>' + rep.get(b)))));
  for (const [a, b, , over] of byOrder(sizes)) {
    const much = !over && fact(a).height / fact(b).height >= 1.5 ? 'much ' : '';
    say(a, 'is ' + much + 'taller than', b);
  }
  for (const [a, b, rel] of byOrder(g.stand)) say(a, TEMPLATES[rel], b);
  for (const [a, b, c] of byOrder(g.between)) out.push([ref(a), ' is between ', ref(b), ' and ', ref(c), '.']);
  for (const [a, b, rel] of byOrder(g.faces)) {
    if (rel === 'facingEachOther') out.push([ref(a), ' and ', ref(b), ' face each other.']);
    else say(a, TEMPLATES[rel], b);
  }
  return out;
}

/* ---------- which object is which: by place and pose in the frame, never by colour ---------- */
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const kindOf = (o) => (o.type === 'mannequin' ? 'figure' : o.type === 'image' ? 'picture' : TYPES[o.type].geometry ? o.type + '-shaped stand-in' : o.type);
function poseWord(o, inf) {
  if (o.type !== 'mannequin') return '';
  const n = inf.orient.find((x) => /^(lying|leaning|upsideDown)/.test(x));
  if (n) return /^lying/.test(n) ? 'lying down' : /^leaning/.test(n) ? 'leaning' : 'upside down';
  const p = (inf.fields.pose || '').trim();
  return /^[a-z]+ing$/i.test(p) ? p.toLowerCase() : '';
}
function identify(g, o) {
  const f = g.facts.get(o.id);
  if (!f.inShot || !state.settings.families.inFrame) return null;
  const kind = kindOf(o), pose = poseWord(o, g.info.get(o.id));
  const spot = (x) => [kindOf(x), poseWord(x, g.info.get(x.id)), g.facts.get(x.id).place, g.facts.get(x.id).hidden?.o.id || ''].join('|');
  const shown = g.vis.filter((x) => g.facts.get(x.id).inShot);
  const alike = shown.filter((x) => spot(x) === spot(o));
  let head = 'The ' + kind, extra = '';
  if (alike.length > 1) {
    const other = alike.length === 2 && g.facts.get(alike.find((x) => x !== o).id);
    if (other && Math.abs(other.depth - f.depth) >= 0.5) extra = f.depth < other.depth ? ', nearest to the camera' : ', furthest from the camera';
    else {
      const n = shown.filter((x) => kindOf(x) === kind).indexOf(o);
      head = 'The ' + (ORDINAL[n] || 'number ' + (n + 1)) + ' ' + kind + ' from the left,';
    }
  }
  const parts = [head + ' ' + [pose, f.place].filter(Boolean).join(' ') + extra];
  const hid = f.hidden && g.byId.get(f.hidden.o.id);
  if (hid) parts.push(f.hidden.part === 'fully' ? ', hidden behind ' : ', partly hidden behind ', refObj(hid));
  parts.push((extra || hid || head.endsWith(',') ? ',' : '') + ' is ', refObj(o));
  return parts;
}

function placementSentence(g, o) {
  const inf = g.info.get(o.id);
  if (inf.placement === 'floating') return [refObj(o), ' is in the air, off the ground.'];
  if (inf.placement !== 'onGround') return null;
  if (o.type === 'mannequin' && g.upright(o.id)) {
    if (/^standing$/i.test(inf.fields.pose || '')) return [refObj(o), ' is standing on the ground.'];
    const hip = o.joints.pelvis.matrixWorld.elements[13];
    if (hip > 0.3 * o.root.scale.x) return [refObj(o), ' has ' + pronouns(o, inf.fields.gender).poss + ' feet on the ground.'];
  }
  return [refObj(o), ' is on the ground.'];
}

function objectParagraph(g, o) {
  const inf = g.info.get(o.id);
  const p = pronouns(o, inf.fields.gender);
  const sents = [];
  const isThing = o.type !== 'mannequin';
  const app = nounPhrase(o, inf), id = identify(g, o);
  const poseSaid = !!id && !!inf.fields.pose && poseWord(o, inf) === inf.fields.pose.trim().toLowerCase();
  const clParts = isThing ? [] : clausesToParts(mannequinClauses(inf, p, poseSaid), 'is');
  const desc = isThing && inf.fields.description;
  const subject = (o.details.subject || '').trim();
  if (subject && app) {   // named after what it stands for: "The doll represents a man."
    if (id) sents.push([...id, '.']);
    const proper = /^[A-Z]/.test(subject) && o.type === 'mannequin';
    sents.push(['The ' + typeWord(o) + ' ', ...(id ? [] : [refObj(o), ' ']), 'represents ', ...(proper ? [subject + ', '] : []), app, ...(desc ? [', ', desc] : []), '.']);
  } else if (id || app || desc) {
    const s = id ? [...id] : [refObj(o)];
    if (app) s.push(id ? ', ' : ' is ', app);
    if (desc) s.push(id || app ? ', ' : ' is ', desc);
    sents.push([...s, '.']);
  }
  if (clParts.length) sents.push([refObj(o), ' ', ...listAnd(clParts), '.']);
  if (isThing) {
    const op = orientParts(inf.orient, p, false);
    if (op) sents.push([refObj(o), ' ', ...resolveBE(op, 'is'), '.']);
  }
  if (inf.custom.length) sents.push(['Other details: ', ...listAnd(inf.custom.map((c) => [c])), '.']);
  if (inf.size && inf.size !== 'medium') sents.push([refObj(o), ' is ', inf.size, '.']);
  const fp = inf.facing ? facingParts(inf.facing, { ...p, pl: false, be: 'is' }) : null;
  if (fp) sents.push([refObj(o), ' ', ...resolveBE(fp, 'is'), '.']);
  const pl = placementSentence(g, o);
  if (pl) sents.push(pl);
  return sents;
}

function cameraSentence(g) {
  const c = g.camera;
  if (!c.length) return null;
  const SHOTS = { extremeWideShot: 'extreme wide shot', wideShot: 'wide shot', fullShot: 'full shot', mediumShot: 'medium shot', closeUp: 'close-up' };
  const ANGLE_WITH = { birdsEyeView: "from a bird's-eye view", highAngle: 'from a high angle', lowAngle: 'from a low angle', eyeLevel: 'at eye level' };
  const ANGLE_ALONE = { birdsEyeView: "looks down from a bird's-eye view", highAngle: 'is at a high angle', lowAngle: 'is at a low angle', eyeLevel: 'is at eye level' };
  const shot = c.find((x) => SHOTS[x]), angle = c.find((x) => ANGLE_WITH[x]);
  const lens = c.map((x) => /^(\d+)mmLens$/.exec(x)).find(Boolean), aspect = c.find((x) => /^\d+:\d+$/.test(x));
  const clauses = [];
  if (shot) clauses.push('frames ' + art(SHOTS[shot]) + (angle ? ' ' + ANGLE_WITH[angle] : ''));
  else if (angle) clauses.push(ANGLE_ALONE[angle]);
  if (lens) clauses.push('uses a ' + lens[1] + 'mm lens');
  if (aspect) clauses.push('has a ' + aspect + ' aspect ratio');
  if (!clauses.length) return null;
  return [refCam('The camera'), ' ', ...listAnd(clauses.map((x) => [x])), '.'];
}

function environmentSentences(g) {
  const e = g.env, out = [];
  const PREP = /^(in|at|on|inside|outside|near|by|under|beside|above|below|within|around|along|across)\b/i;
  if (e.setting) {
    const s = e.setting.trim();
    const where = PREP.test(s) ? s : 'in ' + (/^[A-Z]/.test(s) ? s : art(s));
    out.push([refEnv('The scene'), ' is set ' + where + '.']);
  }
  if (e.temperature) out.push([refEnv('The temperature'), ' is ' + e.temperature + '.']);
  for (const [k, v] of Object.entries(e)) if (!['setting', 'lighting', 'temperature'].includes(k)) out.push([refEnv(cap(k)), ' is ' + v + '.']);
  return out;
}

function lightingSentence(g) {
  return g.env.lighting ? [refEnv('The lighting'), ' is ' + g.env.lighting + '.'] : null;
}

function customSentence(g) {
  if (!g.custom.length) return null;
  const items = g.custom.map((txt) => {
    const parts = tupleParts(txt);
    const conv = parts.map((s, i) => {
      const o = g.vis.find((v) => exportId(v) === s || v.id === s);
      return o ? refObj(o) : (parts.length === 3 && i === 1 ? TEMPLATES[s] || spaced(s) : s);
    });
    const out = [];
    conv.forEach((c, i) => { if (i) out.push(' '); out.push(c); });
    return out;
  });
  const out = ['Additional notes: '];
  items.forEach((it, i) => { if (i) out.push('; '); out.push(...it); });
  out.push('.');
  return out;
}

/* ---------- assembly ---------- */
function flat(parts) {
  const out = [];
  for (const p of parts) {
    if (typeof p === 'string') { if (!p) continue; const l = out[out.length - 1]; if (l && !l.target) l.text += p; else out.push({ text: p }); }
    else out.push({ text: p.text, target: p.target });
  }
  return out;
}
const paragraphSegments = (sents) => flat(sents.flatMap((s, i) => (i ? [' ', ...s] : s)));
const segmentText = (segments) => segments.map((s) => s.text).join('');
export const objectCardKey = (id) => 'object:' + id;
export const environmentCardKey = 'environment';

function detailLines(fields, values) {
  return fields.map(({ key }) => values[key]?.trim()).filter(Boolean);
}

function describeCards(g) {
  const environment = segmentText(paragraphSegments(environmentSentences(g)));
  const lighting = lightingSentence(g);
  const environmentParts = [environment, lighting && segmentText(flat(lighting))].filter(Boolean);
  const cards = g.vis.filter((o) => g.facts.get(o.id).inShot).map((o) => {
    const subject = o.details.subject?.trim();
    const title = subject || g.info.get(o.id).noun || TYPES[o.type].noun;
    const paragraph = segmentText(paragraphSegments(objectParagraph(g, o)));
    const details = detailLines(TYPES[o.type].fields.filter((f) => !f.asNoun), o.details);
    for (const detail of o.details.custom || []) {
      const label = detail.key?.trim(), value = detail.value?.trim();
      if (label && value) details.push(value);
    }
    return { key: objectCardKey(o.id), objectId: o.id, title: cap(title), name: nameOf(o), text: details.join('\n'), paragraphs: paragraph ? [paragraph] : [] };
  });
  cards.push({ key: environmentCardKey, title: 'Environment', text: detailLines(ENV_FIELDS, state.environment).join('\n'), paragraphs: environmentParts });
  return cards;
}

export function promptCards() { return describeCards(gather()); }

function paragraphs() {
  const g = gather();
  g.reduced = {
    left: reduceEdges(dedupe(g.edges.left)),
    front: reduceEdges(dedupe(g.edges.front)),
    vert: (() => {
      const onTop = new Set(g.edges.vert.filter((e) => e[2] === 'onTop').map((e) => e[0] + '>' + e[1]));
      return reduceEdges(dedupe(g.edges.vert).filter((e) => !(e[2] === 'above' && onTop.has(e[0] + '>' + e[1]))));
    })(),
  };
  const paras = [];
  const notes = (state.notes || '').trim();
  if (notes) paras.push([[notes]]);
  if (g.style) paras.push([[refImage('The visual style'), ' of the final image is ' + g.style + '.']]);
  const edits = state.promptCardEdits;
  const envEdited = Object.hasOwn(edits, environmentCardKey);
  const env = envEdited ? [[edits[environmentCardKey]]] : environmentSentences(g);
  if (env.length) paras.push(env);
  for (const o of g.vis) {
    const key = objectCardKey(o.id);
    const sents = g.facts.get(o.id).inShot && Object.hasOwn(edits, key) ? [[edits[key]]] : objectParagraph(g, o);
    if (sents.length) paras.push(sents);
  }
  const layout = layoutSentences(g);
  if (layout.length) paras.push(layout);
  const cam = cameraSentence(g);
  if (cam) paras.push([cam]);
  const light = lightingSentence(g);
  if (light && !envEdited) paras.push([light]);
  const cu = customSentence(g);
  if (cu) paras.push([cu]);
  return paras.map(paragraphSegments).filter((p) => p.length);
}

/* ---------- public API ---------- */
export function naturalSegments() {
  const out = [];
  paragraphs().forEach((p, i) => { if (i) out.push({ text: '\n\n' }); out.push(...p); });
  return out;
}
export function naturalText() {
  return naturalSegments().map((s) => s.text).join('');
}

const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : '');
export function renderNatural(el) {
  const body = paragraphs(), paras = [...body, ...fixedLines().map((text) => [{ text }])];
  const sig = JSON.stringify([paras, paras.flat().map((s) => (s.target?.kind === 'obj' ? state.objects.find((o) => o.id === s.target.id)?.accent : 0))]);
  if (el._natSig === sig) return;
  el._natSig = sig;
  el.textContent = '';
  if (!body.length) { const p = document.createElement('p'); p.className = 'nlEmpty'; p.textContent = 'Nothing to describe yet.'; el.appendChild(p); }
  for (const para of paras) {
    const p = document.createElement('p');
    for (const s of para) {
      if (!s.target) { p.appendChild(document.createTextNode(s.text)); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nlRef nlRef-' + s.target.kind;
      if (s.target.kind === 'obj') {
        const o = state.objects.find((x) => x.id === s.target.id);
        const col = o && safeColor(o.accent);
        if (col) { const d = document.createElement('span'); d.className = 'nlDot'; d.style.background = col; b.appendChild(d); }
      }
      b.appendChild(document.createTextNode(s.text));
      const target = { ...s.target };
      b.addEventListener('click', () => document.dispatchEvent(new CustomEvent('vpg:goto', { detail: target })));
      p.appendChild(b);
    }
    el.appendChild(p);
  }
}
