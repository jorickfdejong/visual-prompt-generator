import { inputIcon } from './input-icons.js';
import { shortcutKeys } from './shortcut-presets.js';

/* =====================================================================
   TOOLTIPS — [data-tip] buttons get a bubble with their name and shortcuts (data-key, one per line);
   keys and mouse buttons are drawn as <kbd>
   ===================================================================== */
const KEYS = /\b(Ctrl|Shift|Alt|Space|Middle mouse|Left mouse|Right mouse|Mouse wheel|Two fingers|[A-Z])\b/g;
function renderTooltip(b) {
  b.querySelector('.tip')?.remove();
  const tip = document.createElement('span');
  tip.className = 'tip';
  tip.setAttribute('aria-hidden', 'true');   // the aria-label says the same
  const name = document.createElement('span');
  name.textContent = b.dataset.tip;
  tip.append(name);
  for (const line of (b.dataset.key || '').split('\n').filter(Boolean)) {
    const row = document.createElement('span');
    row.className = 'tipKey' + (/Two fingers/.test(line) ? ' padOnly' : /mouse/i.test(line) ? ' mouseOnly' : '');
    row.innerHTML = inputIcon(line) + line.replace(line.length === 1 ? /^.$/ : KEYS, '<kbd>$&</kbd>');
    tip.append(row);
  }
  b.append(tip);
}
for (const button of document.querySelectorAll('button[data-tip]')) renderTooltip(button);

function renderShortcutTooltips() {
  for (const [selector, action, label] of [
    ['#btnAdd', 'add', 'Add object'],
    ['[data-tool="transform"]', 'transform', 'Move and rotate'],
    ['[data-tool="scale"]', 'scale', 'Scale and stretch'],
  ]) {
    const button = document.querySelector(selector), keys = shortcutKeys(action);
    button.dataset.key = keys.join('\n');
    button.setAttribute('aria-label', `${label} (${keys.join(' or ')})`);
    button.setAttribute('aria-keyshortcuts', keys.map((key) => key.replaceAll(' + ', '+')).join(' '));
    renderTooltip(button);
  }
}
document.addEventListener('vpg:shortcut-preset', renderShortcutTooltips);
renderShortcutTooltips();
