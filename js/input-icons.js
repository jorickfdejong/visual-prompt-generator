/* =====================================================================
   INPUT ICONS — a mouse (with the button that is used filled in) or a trackpad, for lists of controls
   ===================================================================== */
const BUTTON = {
  left: '<path class="on" d="M11 3.1A6 6 0 0 0 6 9v1h5z"/>',
  right: '<path class="on" d="M13 3.1A6 6 0 0 1 18 9v1h-5z"/>',
  wheel: '<rect class="on" x="10.5" y="5" width="3" height="6" rx="1.5"/>',
};
const svg = (body) => `<svg class="inIcon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const mouse = (button) => svg(`<rect x="6" y="3" width="12" height="18" rx="6"/>${BUTTON[button]}`);
const TRACKPAD = svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 15h18M12 15v4"/>');
// the icon for a line such as "Shift + Middle mouse drag"; nothing for keys only
export function inputIcon(text) {
  if (/two fingers|pinch|trackpad/i.test(text)) return TRACKPAD;
  if (/middle mouse|wheel/i.test(text)) return mouse('wheel');
  if (/right (mouse|drag)/i.test(text)) return mouse('right');
  if (/left (mouse|drag)|\bclick\b|^drag$|\+ drag$/i.test(text)) return mouse('left');
  return '';
}
