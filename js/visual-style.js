import { $, state } from './state.js';
import { markDirty } from './prompt-panel.js';

const select = $('#visualStyle');
const savedStyle = new Option();
savedStyle.disabled = true;

export function syncVisualStyle() {
  savedStyle.remove();
  const value = state.visualStyle.trim();
  const preset = [...select.options].find((option) => option.value === value.toLowerCase());
  if (!preset) {
    savedStyle.textContent = savedStyle.value = value;
    select.prepend(savedStyle);
  }
  select.value = preset?.value ?? value;
}

select.addEventListener('change', () => {
  state.visualStyle = select.value;
  savedStyle.remove();
  markDirty();
});
