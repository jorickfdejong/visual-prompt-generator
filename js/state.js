

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

export const FAMILIES = {
  attributes: { label: 'Details', color: '#c9a27a' },
  size: { label: 'Size', color: '#9575cd' },
  leftRight: { label: 'Left / right', color: '#4ba3f0' },
  frontBack: { label: 'Front / back', color: '#26a69a' },
  sameRowCol: { label: 'Same row / col', color: '#78909c' },
  adjacent: { label: 'Adjacent', color: '#8bc34a' },
  between: { label: 'Between', color: '#ffb74d' },
  vertical: { label: 'Height', color: '#f06292' },
  facing: { label: 'Facing', color: '#ffd54f' },
  camera: { label: 'Camera', color: '#90caf9' },
  custom: { label: 'Custom', color: '#ffffff' },
};
// Alternatives offered in a relation's override dropdown
export const ALTS = {
  leftRight: ['rightOf', 'leftOf'],
  frontBack: ['frontOf', 'backOf'],
  sameRowCol: ['sameRow', 'sameCol'],
  vertical: ['above', 'below', 'onTopOf', 'sameLevel'],
  size: ['larger', 'smaller', 'sameSize'],
  facing: ['facing', 'facingAway'],
};

export const SKIN_TONES = [
  ['porcelain', '#f6e3d6'], ['fair', '#f1d0b5'], ['light', '#e3b48f'], ['medium', '#c99067'], ['olive', '#b07d4f'],
  ['tan', '#9c6a43'], ['brown', '#7a4b2a'], ['dark brown', '#5a3520'], ['deep', '#3b2216'],
];
export const DETAIL_FIELDS = [
  { key: 'gender', label: 'Gender', type: 'select', options: ['', 'female', 'male', 'non-binary'] },
  { key: 'age', label: 'Age', type: 'select', options: ['', 'child', 'teenager', 'young adult', 'adult', 'middle-aged', 'elderly'] },
  { key: 'skin', label: 'Skin', type: 'skin', suffix: 'skin' },
  { key: 'hair', label: 'Hair', type: 'text', placeholder: 'e.g. long curly red', suffix: 'hair' },
  { key: 'clothing', label: 'Clothing', type: 'text', placeholder: 'e.g. blue denim jacket' },
  { key: 'expression', label: 'Expression', type: 'text', placeholder: 'e.g. smiling' },
  { key: 'pose', label: 'Pose', type: 'text', placeholder: 'e.g. sitting' },
  { key: 'action', label: 'Action', type: 'text', placeholder: 'e.g. holding a coffee cup' },
];

export const state = {
  objects: [],
  selected: null,          // { kind: 'obj', obj } | { kind: 'camera' } | null
  mode: 'compose',         // 'compose' | 'edit'
  editing: null,           // obj in edit mode
  joint: null,             // selected joint name in edit mode
  tool: 'translate',       // compose gizmo mode
  cameraView: false,
  camera: { focal: 35, aspect: '16:9' },
  notes: '',
  settings: { cell: 0.5, snap: true, families: Object.fromEntries(Object.keys(FAMILIES).map((k) => [k, true])) },
  overrides: {},           // tupleKey -> { off?: true, rel?: string }
  custom: [],              // [{ text, off }]
  tuples: [],
  lastShot: null,          // dataURL
};
