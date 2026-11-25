import { ENV_FIELDS, state } from './state.js';
import { showTab } from './side-tabs.js';

/* =====================================================================
   ENVIRONMENT CHECK — "Generate prompt" needs every environment detail
   (ENV_FIELDS + Visual style). Empty ones get highlighted until filled.
   ===================================================================== */
const MSG = 'Fill in the environment details before Generating the prompt';
const MSG_ID = 'envCheckMsg';
let active = false;   // a warning was shown and not yet resolved

// the inputs to check, in panel order (Visual style comes first in the tab); the world panel is rebuilt, so look them up each time
function fields() {
  const list = [{ el: document.getElementById('visualStyle'), value: state.visualStyle }];
  for (const f of ENV_FIELDS) list.push({ el: document.querySelector(`#worldSection [data-env="${f.key}"]`), value: state.environment?.[f.key] });
  return list.map((f) => ({ el: f.el, empty: !String(f.el ? f.el.value : f.value ?? '').trim() }));
}
export function envComplete() { return fields().every((f) => !f.empty); }

// re-applies highlights and the message from the current values (safe to call any time)
function refresh() {
  const list = fields(), missing = list.filter((f) => f.empty);
  let msg = document.getElementById(MSG_ID);
  if (active && !missing.length) active = false;
  if (!active) { msg?.remove(); msg = null; }
  else if (!msg) {
    msg = document.createElement('div');
    msg.id = MSG_ID; msg.className = 'envCheckMsg'; msg.setAttribute('role', 'alert');
    msg.textContent = MSG;
    const sec = document.getElementById('imageSection');
    sec.insertBefore(msg, sec.firstChild);
  }
  for (const { el, empty } of list) {
    if (!el) continue;
    const bad = active && empty;
    el.classList.toggle('env-missing', bad);
    el.closest('.field')?.classList.toggle('env-missing', bad);
    if (bad) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', MSG_ID); }
    else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
  }
}

// shows the warning on the Environment tab and focuses the first empty field (caller leaves camera view / edit mode)
export function showEnvWarning() {
  active = true;
  showTab('env');
  refresh();
  const first = fields().find((f) => f.empty)?.el;
  if (first) { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); first.focus({ preventScroll: true }); }
}

// live: typing, and panel rebuilds (renderWorldPanel, undo, scene load)
document.addEventListener('input', (e) => { if (active && e.target.closest?.('#side')) refresh(); });
document.addEventListener('change', () => { if (active) refresh(); });
new MutationObserver(() => { if (active) refresh(); }).observe(document.getElementById('worldSection'), { childList: true });
