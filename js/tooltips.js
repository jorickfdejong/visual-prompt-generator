import { inputIcon } from './input-icons.js';

/* =====================================================================
   TOOLTIPS — [data-tip] buttons get a bubble with their name and shortcuts (data-key, one per line);
   keys and mouse buttons are drawn as <kbd>
   ===================================================================== */
const KEYS = /\b(Ctrl|Shift|Alt|Space|Middle mouse|Left mouse|Right mouse|Mouse wheel|Two fingers)\b/g;
for (const b of document.querySelectorAll('button[data-tip]')) {
  const tip = document.createElement('span');
  tip.className = 'tip';
  tip.setAttribute('aria-hidden', 'true');   // the aria-label says the same
  const name = document.createElement('span');
  name.textContent = b.dataset.tip;
  tip.append(name);
  for (const line of (b.dataset.key || '').split('\n').filter(Boolean)) {
    const row = document.createElement('span');
    row.className = 'tipKey';
    row.innerHTML = inputIcon(line) + (line.length === 1 ? `<kbd>${line}</kbd>` : line.replace(KEYS, '<kbd>$1</kbd>'));
    tip.append(row);
  }
  b.append(tip);
}
