/* =====================================================================
   INPUT ICONS — a mouse (with the button that is used filled in) or a trackpad, for lists of controls
   ===================================================================== */
const BUTTON = {
  left: '<path class="on" d="M11 3.1A6 6 0 0 0 6 9v1h5z"/>',
  right: '<path class="on" d="M13 3.1A6 6 0 0 1 18 9v1h-5z"/>',
  wheel: '<rect class="on" x="10.5" y="5" width="3" height="6" rx="1.5"/>',
};
const svg = (body, only = '') => `<svg class="inIcon ${only}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const mouse = (button, only) => svg(`<rect x="6" y="3" width="12" height="18" rx="6"/>${BUTTON[button]}`, only);
const pad = (only) => svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 15h18M12 15v4"/>', only);
// the icon for a line such as "Shift + Middle mouse drag"; nothing for keys only
export function inputIcon(text) {
  if (/one finger|two fingers|pinch|trackpad/i.test(text)) return pad();
  if (/middle mouse|wheel/i.test(text)) return mouse('wheel');
  if (/right (mouse|drag)/i.test(text)) return mouse('right');
  if (/left (mouse|drag)/i.test(text)) return mouse('left');
  if (/\bclick\b|^drag$|\+ drag$/i.test(text)) return mouse('left', 'mouseOnly') + pad('padOnly');   // works on both: the device in use (mouse-detect.js)
  return '';
}
