import { PROPS } from './props.js';

/* =====================================================================
   OBJECT ICONS — what an object is, in its own colour (scene list); the same drawings as in the add menu
   ===================================================================== */
const ICONS = {
  mannequin: ['Puppet', '<circle cx="12" cy="4.5" r="2.2"/><path d="M12 7.5v7M7 10.5h10M12 14.5l-3 6.5M12 14.5l3 6.5"/>'],
  image: ['Image', '<rect x="5" y="3" width="14" height="13" rx="1"/><path d="M5 12l4-4 4 4 2-2 4 4"/><path d="M3 21h18v-3H3z"/>'],
  group: ['Group', '<rect x="3" y="9" width="12" height="12" rx="1.5"/><path d="M9 9V4.500A1.500 1.500 0 0 1 10.500 3h9A1.500 1.500 0 0 1 21 4.500v9a1.500 1.500 0 0 1-1.500 1.500H15"/>'],
};
export function objectIcon(o) {
  const p = PROPS.find((x) => x.type === o.type);
  const [label, body] = p ? [p.label, p.icon] : ICONS[o.type] || [o.type, '<circle cx="12" cy="12" r="5"/>'];
  return `<svg class="objIcon" viewBox="0 0 24 24" role="img" aria-label="${label}" style="color:${o.accent}"><title>${label}</title>${body}</svg>`;
}
