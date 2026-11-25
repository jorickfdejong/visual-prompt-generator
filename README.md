# Visual Prompt Generator (V1)

A local tool for designers to **set up a scene themselves** before going to an image generator. Pose wooden mannequins, place a camera, add details, and export a **reference image + structured prompt**. Change the setup, save it as a variant, and compare variants to iterate.

The tool contains no AI and calls no external service. You paste its output into whichever image generator you prefer.

## Open it

- **Online:** https://jorickfdejong.github.io/visual-prompt-generator/
- **Locally:** run the small PowerShell server (no Node/Python needed) and open `http://localhost:8765`:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1 -Root .
  ```

Double-clicking `index.html` does **not** work: the code is split into JavaScript modules (`js/`), and browsers refuse to load those from a `file://` page. An internet connection is needed to load Three.js from a CDN.

## Navigation

Picked on the first visit, switched with the toggle at the bottom of the view. **Easy**: left drag orbits, or slides the object under the pointer over the floor; the gizmo is the same as in Pro. The number fields for position, rotation, stretch and scale are hidden. Right drag pans, the wheel zooms towards the pointer, Shift + drag box-selects. **Pro** (Blender-style):

| Input | Action |
|---|---|
| Ctrl + two fingers (trackpad) or middle mouse drag | Orbit the view (also Alt + left drag) |
| Shift + two fingers or Shift + middle mouse drag | Pan (also right drag, or Space + left drag) |
| Two fingers, pinch or mouse wheel | Zoom |
| Buttons bottom-right | Orbit, pan and zoom, always visible |
| Left click | Select / use the gizmo |
| Left drag on an object | Slide it over the floor |
| Arrow keys | Move the selection over the floor, 0.5 m per press (smaller steps when scaled down) |

The **View** buttons (or `1` – `5`) look at the scene from the front, right, back, left or above.

The same controls frame the shot in **Camera view**.

## How it works

| Area | What you do |
|---|---|
| **Compose mode** (default) | Arrange the space. Select a doll or the camera (in the viewport or the Objects list) and move and rotate it with one gizmo (`M`) or scale it (`S`). Add, duplicate (`Ctrl+D`), delete (`Del`), hide or rename (double-click the name) dolls. |
| **Edit mode** | Click the **Change posture** button under the selected doll (or double-click it / press `Enter`). The posture panel opens on the right; everything else keeps working. Other dolls fade out. In Easy, pull an orange dot to turn the limb it ends (the elbow dot swings the upper arm), or pull a body part; in Pro, click a joint (orange dot) or a body part and drag the rings. Or use a pose preset, Mirror L↔R or Hip height. Fill in details: gender, age, race, body type, skin, hair, clothing, expression, pose, action, plus your own details. `Esc`, **Done** or clicking something else returns to Compose. |
| **Shot camera** | Always visible in the top-right corner. Set focal length and aspect ratio. Click the preview (or **Camera view**) to frame the shot with the navigation controls, then take a **📸 Screenshot**. |
| **Objects** | Puppets, pictures, wooden toys (tree, car, house) and shapes (cube, ball, cylinder, pyramid, cone). Select several to edit their shared details together; differing values show as Mixed. **Group** (`Ctrl+G`) makes several selected objects (not dolls) one object with one name and one set of details; **Ungroup** (`Ctrl+Shift+G`) brings them back with their own names and details. |
| **Final image** | In the Environment tab: the visual style of the image to generate. |
| **Environment** | Its own tab in the sidebar: labels for environment, temperature and lighting, floor, walls, the light direction and shadows. |
| **Export** | The button at the top of the sidebar: the prompt next to the reference images, with the notes, checkboxes and tuples it is made from below. |
| **Prompt tuples** | Shows every computed tuple. Untick a line to leave it out, use a dropdown to override a relation, add your own tuples, and add scene notes. |
| **Include in the prompt** | Checkboxes in Export that include or leave out a kind of information (size, height, left / right, cameraâ€¦), in both the written prompt and the tuples. The group checkbox switches all of it. |
| **Variants** | **Save as variant** stores the whole setup with a thumbnail and its prompt. Load a variant, change it, and save again to iterate. Tick `cmp` on two cards and click **Compare** to see both images and a diff of their tuples. |

Everything autosaves in your browser (localStorage). **New scene** clears the working setup; your variants are kept.

## Spatial relations (Tarski's World, extended to 3D)

- The space is a grid of 0.5 m cells. Objects move freely and stick only to the floor; the grid is used to read relations.
- "Front" is the side facing the **shot camera**, so the relations always describe the reference image.
- Relations the real camera view contradicts are left out; a custom tuple that repeats a listed fact (also the other way round) is skipped.
- Every other predicate that holds is listed:
  - `rightOf` / `leftOf`, `frontOf` / `backOf`, `sameRow` / `sameCol`
  - `adjacent`, `between`
  - `small` / `medium` / `large`, `taller` / `sameHeight` (upright objects only)
  - 3D: `above`, `onTopOf`, `sameLevel`
  - Placement: `onGround`, `floating` (read from the real positions)
  - Extensions: `facingEachOther`, `facingCamera` / `threeQuarterLeft` / `profileLeft` / `backToCamera`; rotation such as `lyingOnBack`, `leaningLeft`, `upsideDown`
  - Camera: shot size, angle, lens, aspect ratio

Example export:

```
Generate one image of the scene described below. Use the two reference images together: they show the same scene from the same camera.
The clay grey reference image shows the shapes and the pose. Use it for composition, pose and camera only. Ignore its colours, materials, textures and lighting.
The depth map reference image shows distance: light is close to the camera, dark is far away, black is empty background. Use it for composition, pose, distance and camera only. Its grey values are not colours or lighting, and the result must not look like a depth map.
Full-colour image, natural colours.

sunny park, golden hour, 35mm film photo

(person, woman)
(female, woman)
(darkBrownSkin, woman)
(sitting, woman)
(person, man)
(man, rightOf, woman)
(woman, frontOf, man)
(woman, facingEachOther, man)
(fullShot, camera)
(eyeLevel, camera)
(16:9, camera)
```

## The written prompt

Fixed sentence templates, in this order: opening lines (what to generate and how to use the reference images), scene, objects from left to right (each named by its place and pose in the frame), layout, camera, lighting, additional notes. Sizes and distances are written in words, not metres.

Export always gives two **reference images**: a neutral grey render and a depth map (light is near, dark is far). The prompt also asks for full colour, unless the notes ask for black and white.

## Taking it to an image generator

- **Download all 3 files** gives `clay-grey.png`, `depth-map.png` and `prompt.txt` (allow multiple downloads if the browser asks). Drag all three files into the image generator.
- To re-export an older variant's image, **Load** it and take a screenshot. **Copy** on a card copies that variant's prompt text directly.

## Structure (for later versions)

`index.html` holds only the page layout; `styles.css` the styling. The code lives in `js/` as ES modules, loaded from `js/main.js`:

| File | What it does |
|---|---|
| `state.js` | Constants and the shared `state` object |
| `scene.js` | Three.js renderer, scene, lights, editor camera, gizmo |
| `images.js` | Uploaded images: storage, textures, background cutout |
| `room.js` | Floor, walls, surface patterns, light settings, grid |
| `camera.js` | Shot camera and camera view (framing the shot) |
| `mannequin.js` | The articulated wooden doll |
| `image-card.js` | Image card on a wooden stand |
| `types.js` | The object **type registry** (`TYPES`) |
| `objects.js` | Adding, duplicating, copy/paste and deleting objects |
| `selection.js` | Compose/edit modes, selection, gizmo, help panel |
| `group.js`, `grouping.js` | The group type (several objects as one); grouping and ungrouping |
| `depth-map.js` | The depth map, one of the two reference images |
| `rendering.js` | Viewport and shot rendering, screenshots, live preview |
| `relations.js` | Spatial relations (Tarski's World) and the prompt text |
| `world-facts.js` | Real positions read from the scene: support, depth, place in the frame, what hides what |
| `prompt-rules.js` | Fixed closing lines and sentence templates |
| `natural.js` | The written prompt |
| `consistency.js` | Checks for contradictions, floating or unseen objects (not shown at the moment) |
| `left-panel.js` | Edit tab: object list, transforms, details, world settings |
| `prompt-panel.js` | Export tab: tuples, overrides, notes; `markDirty()` |
| `clipboard.js` | Downloads, toast messages |
| `persistence.js` | Autosave, scene files, undo/redo |
| `stretch.js` | Scaling width, height and depth separately |
| `hover.js` | Outline and name of the object under the pointer |
| `nav-mode.js` | Easy / Pro navigation |
| `tutorial.js` | Guided tour (also from the ? panel) |
| `details.js` | Counting and checking details |
| `easy-drag.js` | Easy mode: drag objects, orbit |
| `side-tabs.js` | Sidebar tabs: Scene and Environment |
| `pose-button.js` | Change posture button under the selected puppet |
| `main.js` | Wires up buttons, menus and shortcuts; starts the app |

Scene objects go through a small **type registry** (`TYPES` in `types.js`): a new object type only needs a new registry entry. Relations, export and saving work on all objects.

`state.js` and `scene.js` must not import from other project modules: the other modules use their values while loading, so they have to load first.
