/* =====================================================================
   TUPLE TRIM — left / right facts that follow from the other ones are not written down
   ===================================================================== */
// A left of B, B left of C: "A left of C" adds nothing. Changed by hand: always kept.
// One at a time, so what is left always still implies what was taken out.
export function impliedLeftRight(tuples) {
  const edges = tuples.filter((t) => t.family === 'leftRight' && t.parts.length === 3)
    .map((t) => ({ t, from: t.parts[t.rel === 'leftOf' ? 0 : 2], to: t.parts[t.rel === 'leftOf' ? 2 : 0] }));
  const implied = new Set();
  for (const e of edges) {
    if (e.t.overridden) continue;
    const seen = new Set([e.from]), stack = [e.from];
    while (stack.length && !seen.has(e.to)) {
      const x = stack.pop();
      for (const f of edges) if (f !== e && f.from === x && !implied.has(f.t.key) && !seen.has(f.to)) { seen.add(f.to); stack.push(f.to); }
    }
    if (seen.has(e.to)) implied.add(e.t.key);
  }
  return implied;
}
