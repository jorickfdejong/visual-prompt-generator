import { $ } from './state.js';
import { dataURLtoBlob, takeScreenshot } from './rendering.js';
import { promptText } from './export-modal.js';

/* =====================================================================
   CLIPBOARD & DOWNLOADS
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
export async function copyText(text = promptText()) {
  try { await navigator.clipboard.writeText(text); toast('Prompt text copied'); }
  catch { downloadText('prompt.txt', text); toast('Clipboard blocked — downloaded prompt.txt instead'); }
}
export async function copyImage() {
  const url = takeScreenshot();
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataURLtoBlob(url) })]); toast('Reference image copied'); }
  catch { download('reference.png', url); toast('Clipboard blocked — downloaded reference.png instead'); }
}
export async function copyBoth() {
  const url = takeScreenshot(), text = promptText();
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataURLtoBlob(url), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    toast('Image + text copied (some apps paste only one — use the separate buttons then)');
  } catch {
    download('reference.png', url); downloadText('prompt.txt', text);
    toast('Clipboard blocked — downloaded both files instead');
  }
}
