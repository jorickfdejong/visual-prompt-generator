import { $ } from './state.js';
import { inputIcon } from './input-icons.js';
import { vp } from './scene.js';
import { renderHelp } from './selection.js';

/* =====================================================================
   NAVIGATION MODE — Easy: left drag orbits, or moves the object under the pointer (easy-drag.js).
   Pro: the mouse-button shortcuts in nav.js. Chosen on the first visit, kept per browser.
   ===================================================================== */
const KEY = 'vpg.navMode';
let easy = false;
export const isEasy = () => easy;

const toggle = document.createElement('div');
toggle.id = 'navMode';
toggle.setAttribute('role', 'group');
toggle.setAttribute('aria-label', 'Navigation');
toggle.innerHTML = '<svg viewBox="0 0 24 24" role="img" aria-label="Controls"><title>Controls</title><rect x="2" y="5.5" width="20" height="13" rx="2.5"/><path d="M6 9.5h.01M10 9.5h.01M14 9.5h.01M18 9.5h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 15h8"/></svg><button type="button" data-mode="easy" title="Drag with the left mouse button">Easy</button><button type="button" data-mode="pro" title="Mouse-button shortcuts">Pro</button>';
vp.appendChild(toggle);
toggle.querySelectorAll('button').forEach((b) => { b.onclick = () => { setNavMode(b.dataset.mode); b.blur(); }; });

function apply() {
  document.body.classList.toggle('nav-easy', easy);
  toggle.querySelectorAll('button').forEach((b) => { const on = (b.dataset.mode === 'easy') === easy; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  const M = inputIcon('wheel'), T = inputIcon('trackpad'), K = (k) => `<kbd>${k}</kbd>`;
  const pad = { zoom: `${T}${K('Two fingers')}`, orbit: `${T}${K('Ctrl')} + ${K('Two fingers')}`, pan: `${T}${K('Shift')} + ${K('Two fingers')}` };
  $('#camHint').innerHTML = easy
    ? `Orbit: ${inputIcon('left drag')}${K('Left mouse')} or ${pad.orbit} · Pan: ${inputIcon('right drag')}${K('Right mouse')} or ${pad.pan} · Zoom: ${M}${K('Wheel')} or ${pad.zoom}`
    : `Orbit: ${M}${K('Middle mouse')} or ${pad.orbit} · Pan: ${M}${K('Shift')} + ${K('Middle mouse')} or ${pad.pan} · Zoom: ${M}${K('Wheel')} or ${pad.zoom}`;
  renderHelp();
}
export function setNavMode(mode) {
  easy = mode === 'easy';
  try { localStorage.setItem(KEY, mode); } catch { /* not remembered */ }
  apply();
}
// first visit: which navigation? Resolves to true when it had to ask.
export function askNavMode() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* ask */ }
  easy = saved !== 'pro';
  apply();
  if (saved) return Promise.resolve(false);
  return new Promise((done) => {
    const el = document.createElement('div');
    el.id = 'navAsk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'navAskTitle');
    el.innerHTML = `<div class="navAskBox"><h1 id="navAskTitle">How do you want to move around?</h1>
      <p class="hint">You can switch any time with the Easy / Pro toggle at the bottom of the view.</p>
      <div class="navAskOpts">
        <button type="button" data-mode="easy"><b>Easy</b><em class="simPill">Similar to Sketchfab</em><span>New to 3D? ${inputIcon('left drag')}Drag with the left mouse button to look around, and drag objects to move them.</span></button>
        <button type="button" data-mode="pro"><b>Pro</b><em class="simPill">Similar to Blender</em><span>Used to 3D software? ${inputIcon('middle mouse')}<kbd>Middle mouse</kbd> orbits, ${inputIcon('middle mouse')}<kbd>Shift</kbd> + <kbd>Middle mouse</kbd> pans, the ${inputIcon('wheel')}wheel zooms.</span></button>
      </div></div>`;
    document.body.appendChild(el);
    const bs = [...el.querySelectorAll('button')];
    bs.forEach((b) => { b.onclick = () => { el.remove(); setNavMode(b.dataset.mode); done(true); }; });
    el.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); bs[(bs.indexOf(document.activeElement) + 1) % 2].focus(); } });
    bs[0].focus();
  });
}
