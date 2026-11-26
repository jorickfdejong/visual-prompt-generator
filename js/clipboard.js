import { $ } from './state.js';
import { dataURLtoBlob, takeScreenshot } from './rendering.js';
import { showDownloadGuide } from './download-guide.js';
import { promptText } from './export-modal.js';

/* =====================================================================
   DOWNLOADS & TOAST
   ===================================================================== */
export let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
export function download(name, href) {
  const a = document.createElement('a');
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
export function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  download(name, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const SHOT_FILES = { clay: 'clay-grey.png', depth: 'depth-map.png' };
// both reference images + prompt as three files
export function downloadAll() {
  const text = promptText();
  const urls = Object.entries(SHOT_FILES).map(([look, name]) => [name, URL.createObjectURL(dataURLtoBlob(takeScreenshot(look)))]);
  // spread out: some browsers drop a second download in the same instant
  urls.forEach(([name, url], i) => setTimeout(() => download(name, url), i * 300));
  setTimeout(() => downloadText('prompt.txt', text), urls.length * 300);
  setTimeout(() => urls.forEach(([, url]) => URL.revokeObjectURL(url)), 3000);
  toast('Downloading 3 files. If the browser asks, allow multiple downloads.');
  showDownloadGuide();
}
