import { TYPES } from './types.js';

/* Helpers for the optional "Details" of an object (TYPES is only used at call time, so import cycles are fine). */
const blank = (s) => !String(s ?? '').trim();

// Filled-in details as [label, value]: type fields that differ from their default (except the "depicts" noun) + complete custom rows
export function detailList(o) {
  const t = TYPES[o.type] || {};
  const d = o.details || {};
  const defaults = t.defaultDetails ? t.defaultDetails() : {};
  const list = [];
  for (const f of t.fields || []) {
    if (f.asNoun) continue;
    const v = d[f.key];
    if (!blank(v) && String(v).trim() !== defaults[f.key]) list.push([f.label, String(v).trim()]);
  }
  for (const c of d.custom || []) if (!blank(c.key) && !blank(c.value)) list.push([c.key.trim(), c.value.trim()]);
  return list;
}
export function detailCount(o) { return detailList(o).length; }

// A custom row with a blank name and/or a blank value
export function incompleteDetail(c) {
  return blank(c.key) || blank(c.value);
}
