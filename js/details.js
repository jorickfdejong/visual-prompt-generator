import { TYPES } from './types.js';

/* Helpers for the optional "Details" of an object (TYPES is only used at call time, so import cycles are fine). */
const blank = (s) => !String(s ?? '').trim();

// action, posture and expression (dolls) or the description (objects) come first, in the panel and in the export check; the written prompt keeps its own order
const FIRST = ['description', 'expression', 'pose', 'action'];
export const panelFields = (o) => [...(TYPES[o.type]?.fields || [])].sort((a, b) => FIRST.indexOf(b.key) - FIRST.indexOf(a.key));

// Filled-in details as [label, value]: type fields that differ from their default (except the "depicts" noun) + complete custom rows
export function detailList(o) {
  const t = TYPES[o.type] || {};
  const d = o.details || {};
  const defaults = t.defaultDetails ? t.defaultDetails() : {};
  const list = [];
  for (const f of panelFields(o)) {
    if (f.asNoun) continue;
    const v = d[f.key];
    if (!blank(v) && String(v).trim() !== defaults[f.key]) list.push([f.label, String(v).trim()]);
  }
  for (const c of d.custom || []) if (!blank(c.key) && !blank(c.value)) list.push([c.key.trim(), c.value.trim()]);
  return list;
}
export function detailCount(o) { return detailList(o).length; }

// what the object itself is called in the prompt ("the doll represents a man")
export const typeWord = (o) => TYPES[o.type].baseName;

// A custom row with a blank name and/or a blank value
export function incompleteDetail(c) {
  return blank(c.key) || blank(c.value);
}
