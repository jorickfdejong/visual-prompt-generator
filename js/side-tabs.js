import { $, state } from './state.js';
import { renderer } from './scene.js';

/* =====================================================================
   SIDEBAR TABS — Scene (objects, camera, selection) and World
   ===================================================================== */
const side = $('#side'), tabs = [...document.querySelectorAll('#tabs button')];
export function showTab(name) {
  const other = side.dataset.tab !== name;
  side.dataset.tab = name;
  if (other) $('#sideBody').scrollTop = 0;   // another tab starts at the top
  for (const b of tabs) { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
}
tabs.forEach((b) => { b.onclick = () => { showTab(b.dataset.tab); b.blur(); }; });
showTab('scene');
// clicking an object in the view shows its panel (after the selection has been made)
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
window.addEventListener('pointerup', (e) => {
  if (!down) return;
  const click = Math.hypot(e.clientX - down[0], e.clientY - down[1]) <= 4;
  down = null;
  if (click && e.button === 0 && state.selected) showTab('scene');
});
