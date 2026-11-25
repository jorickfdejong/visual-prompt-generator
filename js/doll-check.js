import { $, state } from './state.js';
import { panelFields } from './details.js';
import { selectObject, selObjs } from './selection.js';
import { showTab } from './side-tabs.js';

/* =====================================================================
   DOLL CHECK — "Generate prompt" needs the required details (type fields with `required`) of every visible object.
   Empty ones get highlighted until filled; looks the same as the world check (env-check.js).
   ===================================================================== */
const MSG_ID = 'dollCheckMsg';
const context = $('#context');
let active = false;

const missing = (o) => panelFields(o).filter((f) => f.required && !String(o.details[f.key] ?? '').trim());
export const unfinished = () => state.objects.filter((o) => !o.hidden && missing(o).length);
export const dollsComplete = () => !unfinished().length;

const listAnd = (w) => (w.length < 2 ? w.join('') : w.slice(0, -1).join(', ') + ' and ' + w.at(-1));
function refresh() {
  const todo = active ? unfinished() : [], sel = selObjs().filter((o) => todo.includes(o));
  if (!todo.length) active = false;
  const text = !todo.length ? ''
    : sel.length ? `Fill in the ${listAnd([...new Set(sel.flatMap(missing).map((f) => f.label.toLowerCase()))])} before generating the prompt`
      : `Not finished yet: ${listAnd(todo.map((o) => o.details.name))}`;
  const heading = context.querySelector('.detailsHint');
  let msg = document.getElementById(MSG_ID);
  if (!text || !heading) { msg?.remove(); msg = null; }
  else {
    if (!msg) { msg = document.createElement('div'); msg.id = MSG_ID; msg.className = 'envCheckMsg'; msg.setAttribute('role', 'alert'); heading.before(msg); }
    if (msg.textContent !== text) msg.textContent = text;
  }
  const empty = new Set(sel.flatMap(missing).map((f) => f.key));
  context.querySelectorAll('[data-k], [data-mk]').forEach((el) => {
    const bad = empty.has(el.dataset.k || el.dataset.mk);
    el.classList.toggle('env-missing', bad);
    el.closest('.field')?.classList.toggle('env-missing', bad);
    if (bad) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', MSG_ID); }
    else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
  });
}

// selects the first unfinished object and focuses its first empty field (caller leaves camera view / edit mode)
export function showDollWarning() {
  const o = unfinished()[0];
  active = true;
  showTab('scene');
  selectObject(o);
  refresh();
  const el = [...context.querySelectorAll('.env-missing[data-k]')][0];
  if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
}

// live: typing, and panel rebuilds (other selection, undo, scene load)
context.addEventListener('input', () => { if (active) refresh(); });
new MutationObserver(() => { if (active) refresh(); }).observe(context, { childList: true });
