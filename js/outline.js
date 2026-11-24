import * as THREE from 'three';
import { state } from './state.js';
import { editCam, renderer } from './scene.js';
import { hovered } from './hover.js';
import { selObjs } from './selection.js';

/* =====================================================================
   SELECTION OUTLINE — selected objects get a bright line in their own colour.
   They are drawn flat into a mask, whose edge is then painted over the editor view (never in the shot).
   ===================================================================== */
const THICKNESS = 2.5;   // CSS px
let mask = null;
const maskMat = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color() }, map: { value: null }, useMap: { value: false } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 color; uniform sampler2D map; uniform bool useMap; varying vec2 vUv;
    void main() { if (useMap && texture2D(map, vUv).a < 0.3) discard; gl_FragColor = vec4(color, 1.0); }`,
  side: THREE.DoubleSide,
});
const edgeMat = new THREE.ShaderMaterial({
  uniforms: { mask: { value: null }, px: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D mask; uniform vec2 px; varying vec2 vUv;
    void main() {
      if (texture2D(mask, vUv).a > 0.5) discard;
      vec4 best = vec4(0.0);
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 0.3926991;
        vec2 d = vec2(cos(a), sin(a)) * px;
        vec4 s = texture2D(mask, vUv + d);
        if (s.a > best.a) best = s;
        s = texture2D(mask, vUv + d * 0.5);
        if (s.a > best.a) best = s;
      }
      if (best.a < 0.5) discard;
      gl_FragColor = vec4(best.rgb, 1.0);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthTest: false, depthWrite: false,
});
const quadScene = new THREE.Scene();
quadScene.add(Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), edgeMat), { frustumCulled: false }));
const quadCam = new THREE.Camera();

export function brightAccent(hex) {
  const hsl = new THREE.Color(hex).getHSL({});
  return new THREE.Color().setHSL(hsl.h, 1, 0.55);
}
export function renderOutline(w, h) {
  if (state.mode !== 'compose') return;
  const hov = hovered();
  const objs = [...new Set([...selObjs(), ...(hov ? [hov] : [])])].filter((o) => !o.hidden);
  if (!objs.length) return;
  const pr = renderer.getPixelRatio(), W = Math.round(w * pr), H = Math.round(h * pr);
  if (!mask) mask = new THREE.WebGLRenderTarget(W, H);
  else if (mask.width !== W || mask.height !== H) mask.setSize(W, H);

  const auto = renderer.autoClear, shadows = renderer.shadowMap.enabled;
  const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(mask);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.autoClear = false;
  renderer.shadowMap.enabled = false;
  for (const o of objs) {
    maskMat.uniforms.color.value.copy(brightAccent(o.accent));
    if (!selObjs().includes(o)) maskMat.uniforms.color.value.set('#ffffff');   // only hovered
    for (const m of o.meshes) {
      const own = m.material, tex = own.map;
      maskMat.uniforms.map.value = tex || null;
      maskMat.uniforms.useMap.value = !!tex;
      maskMat.uniformsNeedUpdate = true;
      m.material = maskMat;
      renderer.render(m, editCam);
      m.material = own;
    }
  }
  renderer.setRenderTarget(null);
  edgeMat.uniforms.mask.value = mask.texture;
  edgeMat.uniforms.px.value.set(THICKNESS * pr / W, THICKNESS * pr / H);
  renderer.render(quadScene, quadCam);
  renderer.autoClear = auto;
  renderer.shadowMap.enabled = shadows;
  renderer.setClearColor(clear, alpha);
}
