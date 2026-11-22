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

## Navigation (Blender-style)

| Input | Action |
|---|---|
| Middle mouse drag | Orbit the view |
| Shift + middle mouse drag | Pan (right mouse drag also pans) |
| Mouse wheel | Zoom |
| Left click | Select / use the gizmo |

The same controls frame the shot in **Camera view**.

## How it works

| Area | What you do |
|---|---|
| **Compose mode** (default) | Arrange the space. Select a doll or the camera (in the viewport or the Objects list) and move / rotate / scale it (`W` / `E` / `R`). Add, duplicate (`Ctrl+D`), delete (`Del`), hide or rename (double-click the name) dolls. |
| **Edit mode** | Click the **✎ Edit** button that floats above the selected doll (or double-click it / press `Enter`). The edit panel opens on the right, in place of the prompt panel. Other dolls fade out. Click a joint (orange dot) or a body part to rotate it, or use a pose preset, Mirror L↔R or Hip height. Fill in details: gender, age, skin, hair, clothing, expression, pose, action, plus your own details. `Esc` / **Done** returns to Compose. |
| **Shot camera** | Always visible in the top-right corner. Set focal length and aspect ratio. Click the preview (or **Camera view**) to frame the shot with the navigation controls, then take a **📸 Screenshot**. |
| **Prompt panel** | Shows every computed tuple. Untick a line to leave it out, use a dropdown to override a relation, add your own tuples, hide whole families with the chips, and add scene notes. |
| **Variants** | **Save as variant** stores the whole setup with a thumbnail and its prompt. Load a variant, change it, and save again to iterate. Tick `cmp` on two cards and click **Compare** to see both images and a diff of their tuples. |

Everything autosaves in your browser (localStorage). **New scene** clears the working setup; your variants are kept.

## Spatial relations (Tarski's World, extended to 3D)

- The space is a grid; set the cell size in **Grid** (default 0.5 m). Snap to grid keeps placements exact.
- "Front" is the side facing the **shot camera**, so the relations always describe the reference image.
- Every predicate that holds is listed:
  - `rightOf` / `leftOf`, `frontOf` / `backOf`, `sameRow` / `sameCol`
  - `adjacent`, `between`
  - `small` / `medium` / `large`, `larger` / `sameSize`
  - 3D: `above`, `onTopOf`, `sameLevel`
  - Extensions: `facing`, `facingCamera` / `profile` / `backToCamera`
  - Camera: shot size, angle, lens, aspect ratio

Example export:

```
sunny park, golden hour, 35mm film photo

(person, woman)
(female, woman)
(darkBrownSkin, woman)
(sitting, woman)
(person, man)
(man, rightOf, woman)
(woman, frontOf, man)
(woman, facing, man)
(fullShot, camera)
(eyeLevel, camera)
(16:9, camera)
```

## Copying to an image generator

- **Copy image + text** puts both on the clipboard. Many apps paste only one of the two; if so, use **Copy image** and **Copy text** separately.
- If the browser blocks the clipboard, the files are downloaded instead (`reference.png`, `prompt.txt`).
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
| `rendering.js` | Viewport and shot rendering, screenshots, live preview |
| `relations.js` | Spatial relations (Tarski's World) and the prompt text |
| `left-panel.js` | Edit tab: object list, transforms, details, world settings |
| `prompt-panel.js` | Export tab: tuples, overrides, notes; `markDirty()` |
| `clipboard.js` | Copy / download, toast messages |
| `persistence.js` | Autosave, scene files, undo/redo |
| `main.js` | Wires up buttons, menus and shortcuts; starts the app |

Scene objects go through a small **type registry** (`TYPES` in `types.js`): a new object type only needs a new registry entry. Relations, export and saving work on all objects.

`state.js` and `scene.js` must not import from other project modules: the other modules use their values while loading, so they have to load first.
