# 3D Model Renderer Studio

[Tiếng Việt](README.vi.md)

A browser tool for making **character cards** for the [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer) Minecraft mod from characters of ILLGAMES games. A card is a PNG picture of the character with the whole model (body, outfit, textures, shape, settings and physics) packed inside, the same idea as Koikatsu character cards. Share one file, drop it into the mod's `3d-skin/Cards` folder, done.

**Open the studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Everything runs in your browser. Nothing is uploaded.

## What the studio supports

The studio officially supports **characters exported from ILLGAMES games** (see below): models with the games' skeleton and shape bones, like the sample model. Only these get the character editor, the outfit, physics and colour tabs, and card export.

Other models (GLB, VRM, PMX/PMD, ...) open for an **animation preview only**. In the mod they work as in MMD Skin: put the model folder in `3d-skin`. An animation editor for them is planned.

## Using it

1. **Open a character**: *Open files* (or drag the file onto the view) with a GLB exported as described below, or *Open card* with a card made here.
2. **Check it moves**: pick a motion at the bottom (the mod's idle, walk, sprint, sneak, swim, crawl, elytra, ride, sleep and swing) or load your own `.vmd`.
3. **Fill in the card** (*Card* tab): name, author, terms of use, source, notes, overall size.
4. **Character** tab: **Body** and **Face** sliders like the games' character makers, grouped by part (head and neck, torso, bust and hips, arms, legs; face shape, eyes, brows, nose, mouth, ears). Every slider has a number box for exact values (typed values may go past the slider's ends); double-click a slider to reset it.
5. **Outfit** tab:
   - **Pieces**: one box per slot, **hair, top, inner top, bottom, underwear, socks, shoes, accessory** (and the body's own pieces). Click a box to open it: show or hide each piece, remove an imported one, or import a piece into that slot. **Import outfit** takes a whole outfit file (for example a KKBP export made with `--only-outfit`), splits it into its pieces and puts each in its slot; what the slot held before stays in the card, hidden, so several outfits can live in one card. Hair stays separate: an outfit's hair is only used when the character has none showing.
   - **Presets**: save what the character wears as a named outfit, wear a preset again, update or remove it, and pick the default. In game, the config wheel's **Outfit** entry switches between the card's presets.
6. **Physics** tab: hair, clothing and body (bust, hips) groups found from the bone names, including the outfit's own bones. Open a group to tune it: **Spring** motion for hair and clothes (stiffness, drag, gravity), **Jiggle** for bust and hips (bounce speed, settling, sag), hit radius, **max angle**, and the colliders it bumps into. Custom groups from any root bone; collision shapes on the body. *Preview* runs the same solver as the mod while the motion plays.
7. **Colours** tab: a tint per material (the mod applies the same tints) and an expression preview.
8. **Values** bar at the bottom: **Save** keeps the current values (in this browser and in the card); **Back to saved** and **Original** undo experiments.
9. **Export card**. The character, its outfits, presets and every value you set are saved in the card; *Open card* brings it all back, outfit slots included, to change it later.

**Export model** saves the character with its outfit as GLB, glTF, OBJ, STL or PLY (OBJ/STL/PLY in the pose on screen), or the original file.

**ILLGAMES cards** (Koikatsu, Koikatsu Sunshine, AI Shoujo / Honey Select 2, Honey Come, Summer Vacation Scramble, ...) are recognised and read, but they hold settings for the game's character maker, not a 3D model. To bring the character itself in, export it as below.

## Models and outfits from ILLGAMES games

Characters and their outfits from ILLGAMES games can be exported and brought into the studio: the body (with its face) is the character, and each outfit is imported onto it in the **Outfit** tab. This goes through Blender with [KKBP (KK Blender Porter Pack)](https://github.com/FlailingFog/KK-Blender-Porter-Pack), which supports Koikatsu and Koikatsu Sunshine (see its page for the games and versions it supports), and the script in this repository (Blender 4.x/5.x).

1. **In the game**: export the character with the KKBP Exporter plugin (see KKBP's instructions). Turn on **Export all outfits** to get every outfit of the card in one go, or export one outfit at a time.
2. **In Blender**: import that export with KKBP and save the `.blend`.
3. **Split it into a body and outfits**, in one of three ways. Each writes, next to the `.blend`:
   - `<name>_body.glb`: the body with its face, no clothes or hair;
   - `<name>_outfit00.glb`, `<name>_outfit01.glb`, ...: one file per outfit (clothes, shoes, accessories and hair). Outfits identical to an earlier one are written once.

   **a. Blender add-on (recommended)**
   1. Get `export_kkbp_glb.py` (the studio's **.blend → GLB** button, or `tools/blender/` in this repository).
   2. In Blender: **Edit → Preferences → Add-ons → Install from Disk**, pick `export_kkbp_glb.py`, and enable "3D Model Renderer Studio: KKBP body + outfit export". To update it, remove the old one first.
   3. Open the `.blend` imported by KKBP and save it.
   4. **File → Export → Body + outfit for 3D Model Renderer Studio (.glb)**, or the **Studio** tab of the 3D view's sidebar (N key) → **Export body + outfit**. Blender is busy for a few minutes (longer with many outfits); a message lists the files when it is done. The open scene is not changed: the export runs in a separate Blender process.

   **b. Windows, drag and drop**: put `kkbp_to_studio.bat` and `export_kkbp_glb.py` in one folder and drag one or more `.blend` files onto the `.bat`. It finds Blender in the usual places, or asks for the path to `blender.exe` (set the `BLENDER` environment variable to choose one).

   **c. Command line**

   ```
   # body + one file per outfit (what the add-on and the .bat do)
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- character --split
   # only the body / only the outfits / only outfit 2 / everything in one file
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- body.glb --no-outfit
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- outfit.glb --only-outfit
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- outfit02.glb --outfit 2
   blender --background character.blend --python tools/blender/export_kkbp_glb.py -- character.glb
   ```
4. **In the studio**: open `<name>_body.glb` (*Open files*). In **Outfit → Pieces**, click **Import outfit** with `<name>_outfit00.glb`: its pieces go to their slots (hair, top, inner top, bottom, underwear, socks, shoes, accessory) and bind to the body's bones, so they follow the body, its shape sliders, the motions and the physics. In **Outfit → Presets**, save it as a preset. Import the next outfit file (it replaces every piece of clothing; the old ones stay in the card, hidden) and save it as another preset, and so on.
5. **Export card**: the body and all its outfits are written as one model with one skeleton, which the mod loads like any other; in game the config wheel's **Outfit** entry switches between the presets.

The GLB keeps the shape bones the Character tab works with, the expressions and the hair/skirt/bust bones for physics, and gives the skeleton the names the mod recognises. Exports made before 14 November 2026 have the elbow and forearm helper bones attached to the chest, which bends the arms wrongly when they move: export them again with the current script.

The exported files contain the game's assets: use them for yourself and do not share them unless the game's terms allow.

## Card format

See [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). In short: a normal PNG, followed by a `3DMRCARD` block with a JSON manifest (details, settings, physics groups and colliders) and the model files (deflate-compressed, SHA-256 per file), followed by a 16-byte trailer. Image viewers just show the picture.

## Respect model licences

A card contains the full model. Only share cards for models whose terms allow redistribution, and fill in the author and terms-of-use fields.

## Planned

- An animation editor: pose a basic skeleton (MMD bone names, so motions work on every model the mod animates), key it on a timeline, and save the motion into the card or as a separate VMD for `3d-skin/EntityPlayer/<model>/` or `3d-skin/CustomAnim/`. The groundwork is in `src/rig/` and `src/animation/` (standard skeleton, keyframe data, VMD writer); the editor itself is not built yet.
- Pose and camera presets for the card picture.

## Development

No build step. Serve the folder over HTTP (`npm run serve`, then open http://localhost:8000) and edit the files in `src/`. `npm test` runs the card, ILLGAMES card and animation tests (Node 22). GitHub Pages deploys `main` after the tests pass.

three.js and three-vrm are vendored under `vendor/` so the site works without a CDN. See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

MIT. See [LICENSE](LICENSE).
