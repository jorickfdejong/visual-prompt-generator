import { TYPES } from './types.js';

/* Helpers for the optional "Details" of an object (TYPES is only used at call time, so import cycles are fine). */
const blank = (s) => !String(s ?? '').trim();

// Number of filled-in details: type fields that differ from their default (except the "depicts" noun) + complete custom rows
export function detailCount(o) {
  const t = TYPES[o.type] || {};
  const d = o.details || {};
  const defaults = t.defaultDetails ? t.defaultDetails() : {};
  let n = 0;
  for (const f of t.fields || []) {
    if (f.asNoun) continue;
    const v = d[f.key];
    if (!blank(v) && String(v).trim() !== defaults[f.key]) n++;
  }
  for (const c of d.custom || []) if (!blank(c.key) && !blank(c.value)) n++;
  return n;
}

// A custom row with a blank name and/or a blank value
export function incompleteDetail(c) {
  return blank(c.key) || blank(c.value);
}
