import { $ } from './state.js';
import { inputIcon } from './input-icons.js';
import { vp } from './scene.js';
import { refreshPosing, renderHelp } from './selection.js';

/* =====================================================================
   NAVIGATION MODE — Easy: left drag orbits, or moves the object under the pointer (easy-drag.js).
   Pro: the mouse-button shortcuts in nav.js. Chosen in the new file wizard, kept per browser.
   ===================================================================== */
const KEY = 'vpg.navMode';
let easy = false;
export const isEasy = () => easy;

const toggle = document.createElement('div');
toggle.id = 'navMode';
toggle.setAttribute('role', 'group');
toggle.setAttribute('aria-label', 'Navigation');
toggle.innerHTML = '<button type="button" data-mode="easy" title="Easy controls but less precise">Easy</button><button type="button" data-mode="pro" title="Precise controls but less easy">Pro</button>';
vp.appendChild(toggle);
toggle.querySelectorAll('button').forEach((b) => { b.onclick = () => { setNavMode(b.dataset.mode); b.blur(); }; });

function apply() {
  document.body.classList.toggle('nav-easy', easy);
  toggle.querySelectorAll('button').forEach((b) => { const on = (b.dataset.mode === 'easy') === easy; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  const M = inputIcon('wheel'), T = inputIcon('trackpad'), K = (k) => `<kbd>${k}</kbd>`;
  const pad = { zoom: `${T}${K('Two fingers')}`, orbit: easy ? `${T}${K('One finger')}` : `${T}${K('Ctrl')} + ${K('Two fingers')}`, pan: `${T}${K('Shift')} + ${K('Two fingers')}` };
  const mouse = easy
    ? { orbit: `${inputIcon('left drag')}${K('Left mouse')}`, pan: `${inputIcon('right drag')}${K('Right mouse')}` }
    : { orbit: `${M}${K('Middle mouse')}`, pan: `${M}${K('Shift')} + ${K('Middle mouse')}` };
  mouse.zoom = `${M}${K('Wheel')}`;
  // one row per action: name, mouse, trackpad
  $('#camHint').innerHTML = [[easy ? 'Rotate' : 'Orbit', 'orbit'], ['Pan', 'pan'], ['Zoom', 'zoom']].map(([label, k]) => `<b>${label}</b><span class="mouseOnly">${mouse[k]}</span><span class="padOnly">${pad[k]}</span>`).join('');
  renderHelp();
  refreshPosing();
}
export function setNavMode(mode) {
  easy = mode === 'easy';
  try { localStorage.setItem(KEY, mode); } catch { /* not remembered */ }
  apply();
}
const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const navModeSaved = () => !!saved();
// at startup: the last choice, or Easy until it is chosen in the wizard (new-file-wizard.js)
export function initNavMode() {
  easy = saved() !== 'pro';
  apply();
}
