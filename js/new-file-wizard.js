// The app leaves keyboard shortcuts alone while the project name dialog is open.
export function newFileWizard() {
  return new Promise((done) => {
    const dialog = document.createElement('div');
    dialog.id = 'navAsk';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'navAskTitle');
    dialog.innerHTML = `<form class="navAskBox"><h1 id="navAskTitle">What is your project called?<span class="req" aria-hidden="true">*</span></h1>
      <p class="hint">You can rename it any time in the menu at the top left.</p>
      <input type="text" id="wizName" maxlength="60" placeholder="Project name" aria-label="Project name" aria-required="true" spellcheck="false" autocomplete="off">
      <div class="wizBtns"><button type="submit" class="primary" disabled>Start</button></div></form>`;
    document.body.appendChild(dialog);
    const input = dialog.querySelector('input'), submit = dialog.querySelector('button');
    input.oninput = () => { submit.disabled = !input.value.trim(); };
    dialog.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      dialog.remove();
      done({ name });
    };
    dialog.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Tab') return;
      e.preventDefault();
      (submit.disabled || document.activeElement === submit ? input : submit).focus();
    });
    input.focus();
  });
}
