

/* =====================================================================
   CONSTANTS & STATE
   ===================================================================== */
export const $ = (s) => document.querySelector(s);
export const HELPER = 1;                       // layer for editor-only things (shot camera never renders it)
export const DEG = Math.PI / 180;
export const ASPECTS = { '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9, '9:16': 9 / 16, '2:3': 2 / 3 };
export const ACCENTS = ['#e4572e', '#29b6f6', '#66bb6a', '#ab47bc', '#ffa726', '#26a69a', '#ec407a', '#8d6e63'];
export const DOLL_HEIGHT = 1.75;
// autosave is per browser tab (sessionStorage survives reloads of that tab); the old shared localStorage slot is migrated once
export const STORE_SCENE = 'vpg.scene.v1';

// kinds of information in the prompt; group = heading of its checkbox under "Include in the prompt" (Export); off = left out unless ticked (these come last in their group)
// inFrame and closing are not tuples, so they have no lines in the tuple list
export const FAMILIES = {
  attributes: { label: 'Details', color: '#c9a27a', group: 'Objects', hint: 'What an object is, plus gender, clothing, colour, pose and so on' },
  inFrame: { label: 'Place in frame', color: '#bcaaa4', group: 'Objects', hint: 'Where an object is in the picture and what hides it (written prompt only)' },
  facing: { label: 'Facing direction', color: '#ffd54f', group: 'Objects', hint: 'Towards the camera, in profile, from the back' },
  orientation: { label: 'Orientation', color: '#4dd0e1', group: 'Objects', hint: 'Lying, leaning, upside down' },
  size: { label: 'Size', color: '#9575cd', group: 'Objects', hint: 'small, medium, large', off: true },
  leftRight: { label: 'Left / right', color: '#4ba3f0', group: 'Relationships' },
  frontBack: { label: 'Front / back', color: '#26a69a', group: 'Relationships' },
  adjacent: { label: 'Next to', color: '#8bc34a', group: 'Relationships' },
  onTop: { label: 'On top of', color: '#ff8a65', group: 'Relationships' },
  vertical: { label: 'Above / below', color: '#f06292', group: 'Relationships', hint: 'above, same level', off: true },
  sameRowCol: { label: 'Same row / column', color: '#78909c', group: 'Relationships', hint: 'Mainly in the tuples; the written prompt only uses relations you changed by hand', off: true },
  between: { label: 'Between', color: '#ffb74d', group: 'Relationships', off: true },
  sizeRel: { label: 'Height', color: '#b39ddb', group: 'Relationships', hint: 'taller, shorter, same height (upright objects only)', off: true },
  facingRel: { label: 'Facing each other', color: '#ffe082', group: 'Relationships', hint: 'Two objects turned towards each other', off: true },
  environment: { label: 'World', color: '#a5d6a7', group: 'Scene', hint: 'World, lighting, ground and background' },
  finalImage: { label: 'Visual style', color: '#fff176', group: 'Scene' },
  camera: { label: 'Camera', color: '#90caf9', group: 'Scene', hint: 'Shot size, angle, lens, aspect ratio' },
  custom: { label: 'Your own tuples', color: '#ffffff', group: 'Scene' },
  closing: { label: 'Opening lines', color: '#eeeeee', group: 'Scene', hint: 'How to use the reference images, shapes as stand-ins, and full colour' },
};
// Alternatives offered in a relation's override dropdown
export const ALTS = {
  leftRight: ['rightOf', 'leftOf'],
  frontBack: ['frontOf', 'backOf'],
  sameRowCol: ['sameRow', 'sameCol'],
  vertical: ['above', 'below', 'onTopOf', 'sameLevel'],
  onTop: ['above', 'below', 'onTopOf', 'sameLevel'],
  sizeRel: ['taller', 'shorter', 'sameHeight'],
  facingRel: ['facingEachOther', 'facing', 'facingAway'],
};

export const SKIN_TONES = [
  ['porcelain', '#f6e3d6'], ['fair', '#f1d0b5'], ['light', '#e3b48f'], ['medium', '#c99067'], ['olive', '#b07d4f'],
  ['tan', '#9c6a43'], ['brown', '#7a4b2a'], ['dark brown', '#5a3520'], ['deep', '#3b2216'],
];
export const DETAIL_FIELDS = [
  { key: 'gender', label: 'Gender', type: 'select', options: ['', 'female', 'male', 'non-binary'] },
  { key: 'age', label: 'Age', type: 'select', options: ['', 'child', 'teenager', 'young adult', 'adult', 'middle-aged', 'elderly'] },
  { key: 'race', label: 'Race', type: 'text', placeholder: 'e.g. East Asian' },
  { key: 'body', label: 'Body type', type: 'text', placeholder: 'e.g. athletic', suffix: 'build', noSuffix: /\b(body|build|built|figure|physique|frame|shoulders)\b/i },
  { key: 'skin', label: 'Skin', type: 'skin', suffix: 'skin' },
  { key: 'hair', label: 'Hair', type: 'text', placeholder: 'e.g. long curly red', suffix: 'hair' },
  { key: 'clothing', label: 'Clothing', type: 'text', placeholder: 'e.g. blue denim jacket' },
  { key: 'expression', label: 'Expression', type: 'text', required: true, placeholder: 'e.g. smiling' },
  { key: 'pose', label: 'Posture', type: 'select', required: true },
  { key: 'action', label: 'Action', type: 'text', required: true, placeholder: 'e.g. holding a coffee cup' },
];

// labels describing the environment as a whole (World panel), exported as tuples and in the written prompt
export const ENV_FIELDS = [
  { key: 'setting', label: 'World', placeholder: 'e.g. sunny park' },
  { key: 'lighting', label: 'Lighting', placeholder: 'e.g. golden hour', suffix: 'lighting' },
  { key: 'floor', label: 'Ground', placeholder: 'e.g. wet cobblestones', suffix: 'floor', optional: true },
  { key: 'background', label: 'Background', placeholder: 'e.g. snowy mountains', suffix: 'background', optional: true },
];
export const ENV_DEFAULT = () => Object.fromEntries(ENV_FIELDS.map((f) => [f.key, '']));

export const state = {
  objects: [],
  selected: null,          // { kind: 'obj', obj } | { kind: 'camera' } | null
  mode: 'compose',         // 'compose' | 'edit'
  editing: null,           // obj in edit mode
  joint: null,             // selected joint name in edit mode
  tool: 'transform',       // compose gizmo: 'transform' (move + rotate) | 'scale'
  cameraView: false,
  camera: { focal: 35, aspect: '16:9' },
  notes: '',
  promptCardEdits: {},
  environment: ENV_DEFAULT(),
  visualStyle: '',         // look of the final image (Final image panel)
  settings: { cell: 0.5, showNames: false, promptDefaults: 3, families: Object.fromEntries(Object.keys(FAMILIES).map((k) => [k, !FAMILIES[k].off])) },
  overrides: {},           // tupleKey -> { off?: true, rel?: string }
  custom: [],              // [{ text, off }]
  tuples: [],
  facts: new Map(),        // world facts per object id, refreshed with the tuples
};
