/* While the tutorial runs, only the buttons of the current task work. Pressing another one makes the card blink.
   The scene itself, the name field and windows on top of the app are never locked. */
const CONTROLS = 'button, input, select, textarea, a, summary, label, [role=button], [tabindex], #inset, #camRow, #objectList li';
const ALWAYS = '#nameLayer, #btnBackEditor, #btnEditDone';   // naming, and the ways back to the scene
let allowed = () => '', card = null;

function guard(e) {
  if (!card || !e.isTrusted) return;   // the app pressing its own buttons
  const hit = e.target.closest?.(CONTROLS);
  if (!hit || !hit.closest('#app')) return;
  const ok = allowed();
  if (hit.closest(ok ? `${ALWAYS}, ${ok}` : ALWAYS)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.type === 'click' || e.type === 'pointerdown') blink();
}
function blink() {
  card.classList.remove('tutBlink');
  void card.offsetWidth;   // restarts the animation
  card.classList.add('tutBlink');
}
// fields reached with Tab
function guardFocus(e) {
  if (!card) return;
  const hit = e.target.closest?.('#app input, #app select, #app textarea'), ok = allowed();
  if (!hit || hit.closest(ok ? `${ALWAYS}, ${ok}` : ALWAYS)) return;
  hit.blur();
  blink();
}
for (const t of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) window.addEventListener(t, guard, true);
window.addEventListener('focusin', guardFocus, true);

export function lockTo(cardEl, allowedSelector) { card = cardEl; allowed = allowedSelector; }
export function unlock() { card = null; }
