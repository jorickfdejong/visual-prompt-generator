import * as THREE from 'three';
import { cutoutTexture, imageStore, imageTexture } from './images.js';

/* =====================================================================
   IMAGE CARD — a flat picture standing in the slot of a wooden block
   ===================================================================== */
export const IMG_H = 1;                  // picture height in metres at scale 1 (the width follows the image's aspect ratio)
export const STAND = { h: 0.07, d: 0.16, slot: 0.012, slotDepth: 0.05 };
export function createImageCard(accent) {
  const root = new THREE.Group();
  return { root, joints: {}, meshes: [], handles: [], mats: [], parts: new THREE.Group() };
}
export function buildImageCard(o) {
  // (re)build the picture and the stand from o.imageId / o.hideStand
  o.root.remove(o.parts);
  o.parts.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
  o.mats.forEach((m) => m.dispose());
  o.parts = new THREE.Group();
  o.root.add(o.parts);
  const e = imageStore[o.imageId];
  const W = IMG_H * (e ? e.w / e.h : 1);
  const tex = !e ? null : o.cutout?.on ? cutoutTexture(o) : imageTexture(o.imageId);
  // transparent stays on so edit-mode dimming works; alphaTest cuts out PNG transparency (also in the shadow)
  const pic = new THREE.MeshStandardMaterial({ map: tex, color: tex ? '#ffffff' : '#9aa0a8', roughness: 0.85, side: THREE.DoubleSide, transparent: true, alphaTest: 0.05 });
  const wood = new THREE.MeshStandardMaterial({ color: '#c99d6c', roughness: 0.75, transparent: true });
  o.mats = [pic, wood];
  o.meshes = [];
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    m.userData.objId = o.id;
    o.parts.add(m);
    o.meshes.push(m);
    return m;
  };
  const bottom = STAND.h - STAND.slotDepth;   // the picture sits on the bottom of the slot, also when the stand is hidden
  add(new THREE.PlaneGeometry(W, IMG_H), pic, 0, bottom + IMG_H / 2, 0);
  const bw = Math.max(0.3, W * 0.6);
  if (!o.hideStand) {
    // block = base slab + two halves with the slot between them
    const half = (STAND.d - STAND.slot) / 2, base = STAND.h - STAND.slotDepth;
    add(new THREE.BoxGeometry(bw, base, STAND.d), wood, 0, base / 2, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(bw, STAND.slotDepth, half), wood, 0, base + STAND.slotDepth / 2, s * (STAND.slot / 2 + half / 2));
  }
}
