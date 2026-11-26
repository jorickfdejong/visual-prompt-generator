import { setNavMode } from './nav-mode.js';
import { SHORTCUT_PRESETS, setShortcutPreset, shortcutPreset } from './shortcut-presets.js';

/* =====================================================================
   NEW FILE WIZARD: 1. a name for the project, 2. which controls. Also the first visit; a file that already has a name
   only gets the controls step. Other code checks for #navAsk to leave the keyboard alone while it is open.
   ===================================================================== */
// resolves to { name } once the controls are chosen (name: '' when it was not asked)
export function newFileWizard({ askName = true } = {}) {
  return new Promise((done) => {
    const el = document.createElement('div');
    el.id = 'navAsk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'navAskTitle');
    document.body.appendChild(el);
    let name = '';
    const step = (n) => (askName ? `<div class="wizStep">Step ${n} of 2</div>` : '');

    function nameStep() {
      el.innerHTML = `<form class="navAskBox">${step(1)}<h1 id="navAskTitle">What is your project called?<span class="req" aria-hidden="true">*</span></h1>
        <p class="hint">You can rename it any time in the menu at the top left.</p>
        <input type="text" id="wizName" maxlength="60" placeholder="Project name" aria-label="Project name" aria-required="true" spellcheck="false" autocomplete="off">
        <div class="wizBtns"><button type="submit" class="primary">Next</button></div></form>`;
      const inp = el.querySelector('input'), next = el.querySelector('button');
      inp.value = name;
      const check = () => { next.disabled = !inp.value.trim(); };
      inp.oninput = check;
      check();
      el.querySelector('form').onsubmit = (e) => { e.preventDefault(); name = inp.value.trim(); if (name) controlsStep(); };
      inp.focus();
    }
    function controlsStep() {
      el.innerHTML = `<div class="navAskBox">${step(2)}<h1 id="navAskTitle">Which tool are you most familiar with?</h1>
        <p class="hint">Choose a keyboard shortcut preset. You can change it later in Controls.</p>
        <div class="navAskOpts">
          ${Object.entries(SHORTCUT_PRESETS).map(([key, preset]) => `<button type="button" data-preset="${key}">
            <img src="assets/tool-logos/${key}.svg" width="28" height="28" alt="">
            <b>${preset.label}</b>
          </button>`).join('')}
        </div>${askName ? '<div class="wizBtns"><button type="button" id="wizBack">Back</button></div>' : ''}</div>`;
      const opts = [...el.querySelectorAll('[data-preset]')];
      opts.forEach((b) => { b.onclick = () => {
        el.remove();
        setShortcutPreset(b.dataset.preset);
        setNavMode(SHORTCUT_PRESETS[b.dataset.preset].navigation);
        done({ name });
      }; });
      el.querySelector('#wizBack')?.addEventListener('click', nameStep);
      (opts.find((b) => b.dataset.preset === shortcutPreset()) || opts[0]).focus();
    }

    el.addEventListener('keydown', (e) => {
      e.stopPropagation();   // no app shortcuts
      const opts = [...el.querySelectorAll('[data-preset]')];
      const selected = opts.indexOf(document.activeElement);
      if (selected >= 0 && /^Arrow/.test(e.key)) {
        e.preventDefault();
        const step = /Right|Down/.test(e.key) ? 1 : -1;
        opts[(selected + step + opts.length) % opts.length].focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const all = [...el.querySelectorAll('input, button:not(:disabled)')], i = all.indexOf(document.activeElement);
      e.preventDefault();
      all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
    });
    if (askName) nameStep(); else controlsStep();
  });
}
