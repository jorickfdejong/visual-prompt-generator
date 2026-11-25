/* After the files were downloaded: an arrow to the browser's downloads (top right) and what to do with them */
let el = null;
function close() { el?.remove(); el = null; }

export function showDownloadGuide() {
  close();
  el = document.createElement('div');
  el.id = 'downloadGuide';
  el.setAttribute('role', 'status');
  el.innerHTML = `<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 28V4M3 13l9-9 9 9"/></svg>
    <div><h3>Your files are here</h3><p>Drop all 3 files into your AI. You don't need to add any text.</p><button type="button" class="primary">Got it</button></div>`;
  el.querySelector('button').onclick = close;
  document.body.append(el);
}
window.addEventListener('keydown', (e) => {
  if (!el || e.key !== 'Escape') return;
  e.preventDefault(); e.stopImmediatePropagation();
  close();
}, true);
