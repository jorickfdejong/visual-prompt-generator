import { $ } from './state.js';
import { vp } from './scene.js';
import { renderHelp } from './selection.js';

/* =====================================================================
   NAVIGATION MODE — Easy: pick Select, Orbit, Pan or Zoom and drag with the left mouse button.
   Pro: the mouse-button shortcuts in nav.js. Chosen on the first visit, kept per browser.
   ===================================================================== */
const KEY = 'vpg.navMode';
let tool = 'select', easy = false;
export const isEasy = () => easy;
export const easyTool = () => tool;

const ICONS = {
  select: '<path d="M6 3l13 9-6 1.2-3 6z"/>',
  orbit: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/><circle cx="12" cy="12" r="1.6"/>',
  pan: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 8v5M8 10.5h5"/>',
};
const TOOLS = [['select', 'Select', 'Space'], ['orbit', 'Orbit', 'O'], ['pan', 'Pan', 'H'], ['zoom', 'Zoom', 'Z']];
const bar = document.createElement('div');
bar.id = 'easyBar';
bar.setAttribute('role', 'toolbar');
bar.setAttribute('aria-label', 'View tools');
bar.innerHTML = TOOLS.map(([k, label, key]) => `<button type="button" data-easy="${k}" title="${label} (${key})"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>${label}</button>`).join('');
vp.appendChild(bar);
bar.querySelectorAll('button').forEach((b) => { b.onclick = () => { setEasyTool(b.dataset.easy); b.blur(); }; });

const toggle = document.createElement('div');
toggle.id = 'navMode';
toggle.setAttribute('role', 'group');
toggle.setAttribute('aria-label', 'Navigation');
toggle.innerHTML = '<span>Navigation</span><button type="button" data-mode="easy" title="Pick a tool and drag with the left mouse button">Easy</button><button type="button" data-mode="pro" title="Mouse-button shortcuts">Pro</button>';
vp.appendChild(toggle);
toggle.querySelectorAll('button').forEach((b) => { b.onclick = () => { setNavMode(b.dataset.mode); b.blur(); }; });

export function setEasyTool(t) {
  tool = t;
  bar.querySelectorAll('button').forEach((b) => { b.classList.toggle('active', b.dataset.easy === t); b.setAttribute('aria-pressed', b.dataset.easy === t); });
  for (const [k] of TOOLS) vp.classList.toggle('easy-' + k, easy && k === t);
}
function apply() {
  document.body.classList.toggle('nav-easy', easy);
  toggle.querySelectorAll('button').forEach((b) => { const on = (b.dataset.mode === 'easy') === easy; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  $('#camHint').textContent = easy
    ? 'Pick Orbit, Pan or Zoom below and drag to frame the shot · scroll to zoom'
    : 'Two fingers, pinch or wheel to zoom · Ctrl + two fingers or middle mouse to orbit · Shift + two fingers or middle mouse to pan';
  setEasyTool(document.body.classList.contains('camview') ? 'orbit' : 'select');
  renderHelp();
}
export function setNavMode(mode) {
  easy = mode === 'easy';
  try { localStorage.setItem(KEY, mode); } catch { /* not remembered */ }
  apply();
}
// entering or leaving the camera view starts with a useful tool
export function onCameraView(on) { if (easy) setEasyTool(on ? 'orbit' : 'select'); }

window.addEventListener('keydown', (e) => {
  if (!easy || e.ctrlKey || e.metaKey || e.altKey || e.repeat || !$('#exportModal').hidden || !$('#addDrop').hidden || $('#navAsk')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || (e.key === ' ' && e.target.tagName === 'BUTTON')) return;
  const t = { ' ': 'select', o: 'orbit', h: 'pan', z: 'zoom' }[e.key.toLowerCase()];
  if (t) { e.preventDefault(); setEasyTool(t); }
});

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
        <button type="button" data-mode="easy"><b>Easy</b><span>New to 3D? Pick Select, Orbit, Pan or Zoom from a toolbar and drag with the left mouse button, as in SketchUp.</span></button>
        <button type="button" data-mode="pro"><b>Pro</b><span>Used to 3D software? Middle mouse orbits, Shift + middle mouse pans, the wheel zooms, as in Blender.</span></button>
      </div></div>`;
    document.body.appendChild(el);
    const bs = [...el.querySelectorAll('button')];
    bs.forEach((b) => { b.onclick = () => { el.remove(); setNavMode(b.dataset.mode); done(true); }; });
    el.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); bs[(bs.indexOf(document.activeElement) + 1) % 2].focus(); } });
    bs[0].focus();
  });
}
