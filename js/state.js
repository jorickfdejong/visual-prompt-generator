

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

// kinds of information in the prompt; group = heading of its checkbox under "Include in the prompt" (Export)
// inFrame and closing are not tuples, so they have no lines in the tuple list
export const FAMILIES = {
  attributes: { label: 'Details', color: '#c9a27a', group: 'Objects', hint: 'What an object is, plus gender, clothing, colour, pose and so on' },
  size: { label: 'Size', color: '#9575cd', group: 'Objects', hint: 'small, medium, large' },
  inFrame: { label: 'Place in frame', color: '#bcaaa4', group: 'Objects', hint: 'Where an object is in the picture and what hides it (written prompt only)' },
  facing: { label: 'Facing direction', color: '#ffd54f', group: 'Objects', hint: 'Towards the camera, in profile, from the back' },
  orientation: { label: 'Orientation', color: '#4dd0e1', group: 'Objects', hint: 'Lying, leaning, upside down' },
  placement: { label: 'On the ground / floating', color: '#a1887f', group: 'Objects' },
  sizeRel: { label: 'Size', color: '#b39ddb', group: 'Relationships', hint: 'larger, smaller, same size' },
  leftRight: { label: 'Left / right', color: '#4ba3f0', group: 'Relationships' },
  frontBack: { label: 'Front / back', color: '#26a69a', group: 'Relationships' },
  vertical: { label: 'Above / below', color: '#f06292', group: 'Relationships', hint: 'above, on top of, same level' },
  sameRowCol: { label: 'Same row / column', color: '#78909c', group: 'Relationships', hint: 'Mainly in the tuples; the written prompt only uses relations you changed by hand' },
  adjacent: { label: 'Next to', color: '#8bc34a', group: 'Relationships' },
  between: { label: 'Between', color: '#ffb74d', group: 'Relationships' },
  facingRel: { label: 'Facing each other', color: '#ffe082', group: 'Relationships', hint: 'One object faces another' },
  environment: { label: 'Environment', color: '#a5d6a7', group: 'Scene', hint: 'Environment, temperature and lighting' },
  finalImage: { label: 'Visual style', color: '#fff176', group: 'Scene' },
  camera: { label: 'Camera', color: '#90caf9', group: 'Scene', hint: 'Shot size, angle, lens, aspect ratio' },
  custom: { label: 'Your own tuples', color: '#ffffff', group: 'Scene' },
  closing: { label: 'Closing lines', color: '#eeeeee', group: 'Scene', hint: 'How to use the reference image, and full colour' },
};
// Alternatives offered in a relation's override dropdown
export const ALTS = {
  leftRight: ['rightOf', 'leftOf'],
  frontBack: ['frontOf', 'backOf'],
  sameRowCol: ['sameRow', 'sameCol'],
  vertical: ['above', 'below', 'onTopOf', 'sameLevel'],
  sizeRel: ['larger', 'smaller', 'sameSize'],
  facingRel: ['facing', 'facingAway'],
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
  { key: 'expression', label: 'Expression', type: 'text', placeholder: 'e.g. smiling' },
  { key: 'pose', label: 'Pose', type: 'text', placeholder: 'e.g. sitting' },
  { key: 'action', label: 'Action', type: 'text', placeholder: 'e.g. holding a coffee cup' },
];

// labels describing the environment as a whole (Environment panel), exported as tuples and in the written prompt
export const ENV_FIELDS = [
  { key: 'setting', label: 'Environment', placeholder: 'e.g. sunny park' },
  { key: 'temperature', label: 'Temperature', placeholder: 'e.g. freezing cold', suffix: 'temperature' },
  { key: 'lighting', label: 'Lighting', placeholder: 'e.g. golden hour', suffix: 'lighting' },
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
  environment: ENV_DEFAULT(),
  visualStyle: '',         // look of the final image (Final image panel)
  settings: { cell: 0.5, showNames: false, families: Object.fromEntries(Object.keys(FAMILIES).map((k) => [k, true])) },
  overrides: {},           // tupleKey -> { off?: true, rel?: string }
  custom: [],              // [{ text, off }]
  tuples: [],
  facts: new Map(),        // world facts per object id, refreshed with the tuples
  lastShot: null,          // dataURL
};
