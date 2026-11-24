import { $, state } from './state.js';
import { activeTuples } from './relations.js';
import { TYPES } from './types.js';
import { canonical, contradicts, tupleParts } from './prompt-rules.js';

/* =====================================================================
   CONSISTENCY CHECK — plain comparisons that point out what an image generator would misread (never exported)
   ===================================================================== */
export function warnings() {
  const out = [], all = [...state.facts.values()];
  const name = (o) => o.details.name || o.id;
  for (const f of all) {
    const n = name(f.o);
    if (!f.inShot) out.push(`${n} is outside the shot, but it is described in the prompt.`);
    else if (f.hidden?.part === 'fully') out.push(`${n} is completely hidden behind ${name(f.hidden.o)}.`);
    if (TYPES[f.o.type].geometry && !(f.o.details.subject || '').trim()) out.push(`${n} is a plain ${f.o.type}: fill in “Represents” so the image generator knows what to draw.`);
    for (const c of f.o.details.custom || []) if (!(c.key || '').trim() || !(c.value || '').trim()) out.push(`${n} has a detail with an empty field.`);
    if (f.support === 'below') out.push(`${n} goes through the floor.`);
    if (f.support === 'floating') {
      const g = all.find((p) => p !== f && p.support === 'ground' && f.inShot && p.inShot && f.depth > p.depth + 0.25 && f.y > p.y
        && Math.max(f.height, p.height) / Math.min(f.height, p.height) <= 1.08);
      out.push(g ? `${n} floats: it is behind ${name(g.o)}, higher in the frame and about the same size, so it can be drawn hovering. Put it on the ground.`
        : `${n} floats above the ground.`);
    }
  }
  const act = activeTuples();
  const str = (p) => '(' + p.join(', ') + ')';
  for (const t of act) if (t.overridden) out.push(`${str(t.parts)} was changed by hand; the scene and the image show ${t.computedRel}.`);
  const computed = act.filter((t) => !t.custom && t.parts.length === 3).map((t) => t.parts);
  const custom = act.filter((t) => t.custom).map((t) => tupleParts(t.text)).filter((p) => p.length === 3);
  custom.forEach((c, i) => {
    const hit = [...computed, ...custom.slice(0, i)].find((p) => contradicts(c, p));
    if (hit) out.push(`${str(c)} contradicts ${str(hit)}.`);
  });
  // loops: A left of B, B left of C, C left of A
  for (const [rel, words] of [['rightOf', 'left/right'], ['frontOf', 'front/back'], ['above', 'height'], ['larger', 'size'], ['taller', 'tallness']]) {
    const next = new Map();
    for (const p of [...computed, ...custom]) {
      const [a, r, b] = canonical(p);
      if (r !== rel) continue;
      if (!next.has(a)) next.set(a, new Set());
      next.get(a).add(b);
    }
    const done = new Set();
    let loop = null;
    const visit = (n, path) => {
      if (loop || done.has(n)) return;
      const at = path.indexOf(n);
      if (at >= 0) { if (path.length - at > 2) loop = path.slice(at); return; }
      for (const m of next.get(n) || []) visit(m, [...path, n]);
      done.add(n);
    };
    for (const n of next.keys()) visit(n, []);
    if (loop) out.push(`The ${words} relations of ${loop.join(', ')} go round in a circle.`);
  }
  return out;
}
export function renderWarnings() {
  const el = $('#promptWarnings'), list = warnings(), sig = list.join('\n');
  if (el._sig === sig) return;
  el._sig = sig;
  el.hidden = !list.length;
  el.replaceChildren(...list.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
}
