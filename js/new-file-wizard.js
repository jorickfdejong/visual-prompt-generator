import { isEasy, navModeSaved, setNavMode } from './nav-mode.js';

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
      el.innerHTML = `<form class="navAskBox">${step(1)}<h1 id="navAskTitle">What is your project called?</h1>
        <p class="hint">You can rename it any time in the menu at the top left.</p>
        <input type="text" id="wizName" maxlength="60" placeholder="Project name" aria-label="Project name" spellcheck="false" autocomplete="off">
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
      const current = navModeSaved() ? (isEasy() ? 'easy' : 'pro') : '';
      el.innerHTML = `<div class="navAskBox">${step(2)}<h1 id="navAskTitle">How familiar are you with 3D tools?</h1>
        <p class="hint">You can switch any time with the Easy / Pro toggle at the bottom of the view.</p>
        <div class="navAskOpts">
          <button type="button" data-mode="easy"><b>New to 3D</b><span>Easy controls but less precise</span></button>
          <button type="button" data-mode="pro"><b>Used to 3D software</b><span>Precise controls but less easy</span><span>Similar to Blender</span></button>
        </div>${askName ? '<div class="wizBtns"><button type="button" id="wizBack">Back</button></div>' : ''}</div>`;
      const opts = [...el.querySelectorAll('[data-mode]')];
      opts.forEach((b) => { b.onclick = () => { el.remove(); setNavMode(b.dataset.mode); done({ name }); }; });
      el.querySelector('#wizBack')?.addEventListener('click', nameStep);
      (opts.find((b) => b.dataset.mode === current) || opts[0]).focus();   // last time's choice
    }

    el.addEventListener('keydown', (e) => {
      e.stopPropagation();   // no app shortcuts
      if (e.key !== 'Tab') return;
      const all = [...el.querySelectorAll('input, button:not(:disabled)')], i = all.indexOf(document.activeElement);
      e.preventDefault();
      all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
    });
    if (askName) nameStep(); else controlsStep();
  });
}
