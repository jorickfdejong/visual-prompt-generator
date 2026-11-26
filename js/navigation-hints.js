import { $ } from './state.js';
import { keysHTML } from './selection.js';

$('#camHint').innerHTML = [
  ['Orbit', 'Left mouse', 'One finger'],
  ['Pan', 'Right mouse', 'Shift + Two fingers'],
  ['Zoom', 'Wheel', 'Two fingers'],
].map(([label, mouse, trackpad]) =>
  `<b>${label}</b><span class="mouseOnly">${keysHTML(mouse)}</span><span class="padOnly">${keysHTML(trackpad)}</span>`).join('');
