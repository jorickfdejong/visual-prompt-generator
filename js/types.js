import { DETAIL_FIELDS, DOLL_HEIGHT } from './state.js';
import { CUTOUT_DEFAULT } from './images.js';
import { createMannequin } from './mannequin.js';
import { buildImageCard, createImageCard, IMG_H, STAND } from './image-card.js';
import { scaleRange } from './objects.js';
import { camel } from './relations.js';

export const TYPES = {
  image: {
    noun: 'image',
    nounOf: (o) => camel(o.details.subject || '') || 'image',   // what the picture shows becomes its noun
    baseName: 'image',
    scaleRange: [0.1, 10],
    height: () => IMG_H + STAND.h - STAND.slotDepth,
    fields: [
      { key: 'subject', label: 'Depicts', type: 'text', placeholder: 'e.g. red vintage car', asNoun: true },
      { key: 'description', label: 'Description', type: 'text', placeholder: 'e.g. parked, rusty' },
    ],
    create: createImageCard,
    defaultDetails: () => ({ name: '', subject: '', description: '', custom: [] }),
    serializeExtra: (o) => ({ imageId: o.imageId, hideStand: !!o.hideStand, cutout: { ...(o.cutout || CUTOUT_DEFAULT()) } }),
    applyExtra: (o, d) => {
      if (d.imageId !== undefined) o.imageId = d.imageId;
      if (d.hideStand !== undefined) o.hideStand = !!d.hideStand;
      o.cutout = { ...CUTOUT_DEFAULT(), ...(o.cutout || {}), ...(d.cutout || {}) };   // older saves have none
      buildImageCard(o);
    },
  },
  mannequin: {
    noun: 'person',
    baseName: 'doll',
    height: () => DOLL_HEIGHT,
    poseable: true,          // has joints: shows the Pose button / edit mode
    fields: DETAIL_FIELDS,   // detail fields shown in the object panel and exported as attributes
    create: createMannequin,
    defaultDetails: () => ({ name: '', gender: '', age: '', skin: '', hair: '', clothing: '', expression: '', pose: 'standing', action: '', custom: [] }),
    serializeExtra: (o) => ({
      joints: Object.fromEntries(Object.entries(o.joints).map(([k, g]) => [k, [g.rotation.x, g.rotation.y, g.rotation.z].map((v) => +v.toFixed(4))])),
      pelvisY: o.joints.pelvis.position.y,
    }),
    applyExtra: (o, d) => {
      if (d.joints) for (const [k, r] of Object.entries(d.joints)) o.joints[k]?.rotation.set(...r);
      if (d.pelvisY != null) o.joints.pelvis.position.y = d.pelvisY;
    },
  },
};
