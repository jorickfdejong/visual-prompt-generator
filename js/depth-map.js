import * as THREE from 'three';
import { state } from './state.js';
import { floor, scene } from './scene.js';
import { wallGroup } from './room.js';

/* =====================================================================
   DEPTH MAP — reference image that only shows distance: light is near, dark is far, black is nothing.
   The range is stretched over what the camera really sees, so the contrast is the same for every scene.
   ===================================================================== */
const FAR_GREY = 0.22;   // the furthest surface (often a wall: it sets the far end of the range) stays clearly apart from the black background
const range = { near: { value: 1 }, far: { value: 2 }, measure: { value: false } };
const depthMat = (side, map = null) => new THREE.ShaderMaterial({
  uniforms: { ...range, map: { value: map }, useMap: { value: !!map } },
  vertexShader: `varying float vDepth; varying vec2 vUv;
    void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vDepth = -p.z; vUv = uv; gl_Position = projectionMatrix * p; }`,
  fragmentShader: `uniform float near, far; uniform bool measure, useMap; uniform sampler2D map; varying float vDepth; varying vec2 vUv;
    void main() {
      if (useMap && texture2D(map, vUv).a < 0.3) discard;
      if (measure) { gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0); return; }
      float d = clamp((1.0 / vDepth - 1.0 / far) / (1.0 / near - 1.0 / far), 0.0, 1.0);
      gl_FragColor = vec4(vec3(mix(${FAR_GREY}, 1.0, d)), 1.0);
    }`,
  side,
});
const shared = {};
const plain = (side) => (shared[side] ||= depthMat(side));
let target = null;

// nearest and furthest distance in the shot, read from a small render
function measureRange(renderer, cam) {
  const w = 256, h = Math.max(1, Math.round(w / cam.aspect));
  target ||= new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  target.setSize(w, h);
  range.measure.value = true;
  renderer.setRenderTarget(target);
  try { renderer.render(scene, cam); } finally { renderer.setRenderTarget(null); range.measure.value = false; }
  const px = new Float32Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  let near = Infinity, far = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 0) { near = Math.min(near, px[i]); far = Math.max(far, px[i]); }
  if (!far) { near = 1; far = 2; }
  range.near.value = near;
  range.far.value = Math.max(far, near + 0.5);   // a nearly flat view does not turn tiny differences into black and white
}

export function renderDepth(renderer, cam) {
  const undo = [], own = [];
  const swap = (m) => {
    const old = m.material, cut = old.alphaTest > 0 && old.map;   // image cards keep their cut-out shape
    const mat = cut ? depthMat(old.side, old.map) : plain(old.side);
    if (cut) own.push(mat);
    undo.push(() => { m.material = old; });
    m.material = mat;
  };
  const bg = scene.background, shadows = renderer.shadowMap.autoUpdate;
  try {
    for (const o of state.objects) o.meshes.forEach(swap);
    swap(floor);
    wallGroup.children.forEach(swap);
    scene.background = new THREE.Color(0);
    renderer.shadowMap.autoUpdate = false;
    measureRange(renderer, cam);
    renderer.render(scene, cam);
  } finally {
    undo.forEach((u) => u());
    own.forEach((m) => m.dispose());
    scene.background = bg;
    renderer.shadowMap.autoUpdate = shadows;
  }
}
