export const SHORTCUT_PRESETS = {
  blender: { label: 'Blender', transform: ['G', 'R'], scale: ['S'], add: ['Shift + A'] },
  sketchup: { label: 'SketchUp', transform: ['M', 'Q'], scale: ['S'], add: ['Shift + A'] },
  figma: { label: 'Figma', transform: ['V'], scale: ['K'], add: ['Shift + I'] },
};

const storageKey = 'vpg.shortcutPreset';
let preset = '';
try {
  const saved = localStorage.getItem(storageKey);
  if (Object.hasOwn(SHORTCUT_PRESETS, saved)) preset = saved;
} catch { /* browser storage unavailable */ }

export const shortcutPreset = () => preset;
export const shortcutKeys = (action) => (SHORTCUT_PRESETS[preset] || {
  transform: ['M'], scale: ['S'], add: ['A'],
})[action];

export function setShortcutPreset(value) {
  if (value && !Object.hasOwn(SHORTCUT_PRESETS, value)) return;
  preset = value;
  try { localStorage.setItem(storageKey, value); } catch { /* session choice still works */ }
  document.dispatchEvent(new Event('vpg:shortcut-preset'));
}

export function matchesShortcut(event, action) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const key = (event.shiftKey ? 'Shift + ' : '') + event.key.toUpperCase();
  return shortcutKeys(action).includes(key);
}
