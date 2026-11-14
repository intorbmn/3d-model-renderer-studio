# 3D Model Renderer Studio

[Tiếng Việt](README.vi.md)

A browser tool for making **model cards** for the [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer) Minecraft mod. A card is a PNG picture of the character with the whole model (mesh, textures, settings and physics) packed inside, the same idea as Koikatsu character cards. Share one file, drop it into the mod's `3d-skin/Cards` folder, done.

**Open the studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Everything runs in your browser. Nothing is uploaded.

## Using it

1. **Open a model**: *Open model folder* (pick the folder so the textures come along), *Open files*, or drag the folder onto the view. The studio takes the same types as the mod: **PMX, PMD, VRM, GLB, glTF**.
2. **Check it moves**: pick a motion at the bottom (the mod's idle, walk, sprint, sneak, swim, crawl, elytra, ride, sleep and swing) or load your own `.vmd`. For non-MMD skeletons the status bar says whether the mod recognises the rig.
3. **Fill in the card** (*Card* tab): name, model author, terms of use, source, notes, overall size.
4. **Character** tab, for models with ILLGAMES-style shape bones (for example characters exported with KKBP, see below): sliders for the body (head, neck, shoulders, chest, waist, hips, bust, arms, legs) and the face (face shape, eyes, brows, nose, mouth, ears), and a **Parts** list to show or hide each piece (hair, top, bottoms, shoes, ...) and to **import your own** clothing, hair, shoes or accessories (a GLB/glTF rigged to the same skeleton, for example another KKBP export made with `--only-outfit`). Every slider has a number box for exact values (typed values may go past the slider's ends); double-click a slider to reset it. **Save defaults** keeps the current values (in this browser and in the card), **Back to saved defaults** and **Back to original** undo experiments, and **Use as base model** makes the current body the starting point of **New character**. The card keeps the values and the mod applies them when it loads the model, so every card made this way works the same.
5. **Physics** (*Physics* tab), for VRM, GLB and glTF models:
   - Spring-bone chains are sorted into **hair**, **clothing**, **body** and **custom** groups from the bone names, or taken from a VRM's own spring bones. *Detect again* starts over.
   - Per group: on/off, stiffness, drag, gravity, hit radius, and which colliders it bumps into.
   - **Add a custom group** from any root bone (the chain follows its children).
   - **Collision**: colliders on the head, neck, spine, chest, hips, arms and legs keep hair and clothes out of the body. Resize them, add one on any bone, and turn on *Show colliders* to see them.
   - *Preview* runs the physics live while the motion plays.
   - PMX/PMD models keep the rigid-body physics in their file; the mod runs that.
6. **Colours** tab: a tint per material (the mod applies the same tints) and an expression preview.
7. **Export card**. Re-open a card later with *Open card* to change it.

**Export model** saves the model as GLB, glTF, OBJ, STL or PLY (OBJ/STL/PLY in the pose on screen), or the original file.

**ILLGAMES cards** (Koikatsu, Koikatsu Sunshine, AI Shoujo / Honey Select 2, Honey Come, Summer Vacation Scramble, ...) are recognised and read, but they hold settings for the game's character maker, not a 3D model. To bring the character itself in, export it as below.

## Models and outfits from ILLGAMES games

Characters and their outfits from ILLGAMES games can be exported and brought into the studio: the body becomes your base model and each outfit becomes a part you put on in the **Character** tab. This goes through Blender with [KKBP (KK Blender Porter Pack)](https://github.com/FlailingFog/KK-Blender-Porter-Pack), which supports Koikatsu and Koikatsu Sunshine (see its page for the games and versions it supports), and the script in this repository (Blender 4.x/5.x).

1. **In the game**: export the character with KKBP's exporter plugin (see KKBP's instructions), wearing the outfit you want.
2. **In Blender**: import that export with KKBP and save the `.blend`.
3. **Export to GLB** with the script:

   ```
   # the body only (face included, no clothes or hair): the base model
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- body.glb --no-outfit
   # the outfit and hair only: a part to import
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- outfit.glb --only-outfit
   # everything in one file
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- character.glb
   ```

   Repeat steps 1 to 3 with other outfits (or other characters made on the same game body) to collect more parts.
4. **In the studio**: open `body.glb`, click **Use as base model** so **New character** starts from it, then in **Character → Parts** pick a slot (hair, top, bottoms, shoes, socks, accessory) and **Import a part** with `outfit.glb`. Parts bind to the body's bones by name, so they follow the body, its shape sliders, the motions and the physics.
5. **Export card**: the body and the parts you put on are written as one model, which the mod loads like any other.

The GLB keeps the shape bones the Character tab works with, the expressions and the hair/skirt/bust bones for physics, and gives the skeleton the names the mod recognises. Exports made before 14 November 2026 have the elbow and forearm helper bones attached to the chest, which bends the arms wrongly when they move: export them again with the current script.

The exported files contain the game's assets: use them for yourself and do not share them unless the game's terms allow.

## Card format

See [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). In short: a normal PNG, followed by a `3DMRCARD` block with a JSON manifest (details, settings, physics groups and colliders) and the model files (deflate-compressed, SHA-256 per file), followed by a 16-byte trailer. Image viewers just show the picture.

## Respect model licences

A card contains the full model. Only share cards for models whose terms allow redistribution, and fill in the author and terms-of-use fields.

## Planned

- A character maker on a new base model (body and face, with hair, clothing and body physics as parts), female and male presets, and ILLGAMES cards rebuilt on it. The first version is switched off while it waits for that model.
- An animation editor: pose a basic skeleton (MMD bone names, so motions work on every model the mod animates), key it on a timeline, and save the motion into the card or as a separate VMD for `3d-skin/EntityPlayer/<model>/` or `3d-skin/CustomAnim/`. The groundwork is in `src/rig/` and `src/animation/` (standard skeleton, keyframe data, VMD writer); the editor itself is not built yet.
- Pose and camera presets for the card picture.

## Development

No build step. Serve the folder over HTTP (`npm run serve`, then open http://localhost:8000) and edit the files in `src/`. `npm test` runs the card, ILLGAMES card and animation tests (Node 22). GitHub Pages deploys `main` after the tests pass.

three.js and three-vrm are vendored under `vendor/` so the site works without a CDN. See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

MIT. See [LICENSE](LICENSE).
