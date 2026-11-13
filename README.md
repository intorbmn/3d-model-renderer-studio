# 3D Model Renderer Studio

[Tiếng Việt](README.vi.md)

A browser tool for making **model cards** for the [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer) Minecraft mod. A card is a PNG picture of the character with the whole model (mesh, textures and settings) packed inside, the same idea as Koikatsu character cards. Share one file, drop it into the mod's `Cards` folder, done.

**Open the studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Everything runs in your browser. Nothing is uploaded.

## What it does

- **Create a character** from the built-in base body (no clothes, no detail on the body, only a face), with a **female** and a **male** preset. Shape it with sliders the way the character makers of ILLGAMES titles work: body, face, hair (style, length, colour) and clothing (top, skirt/shorts/trousers). Hair, skirt and bust come with physics bones.
- **Physics groups**: hair, clothing, body and custom groups of spring-bone chains, found from the bone names (or a VRM's own spring bones), tuned per group, previewed live and written into the card, where the mod recognises them. Add your own groups from any bone.
- **ILLGAMES cards** (Koikatsu, Koikatsu Sunshine, AI Shoujo / Honey Select 2, Honey Come, Summer Vacation Scramble, ...): those cards hold maker settings, not a 3D model, so the studio rebuilds the character on its base body from the proportions and colours in the card.
- **Export the model** as GLB, glTF, OBJ, STL or PLY (OBJ/STL/PLY in the current pose), or download the original file.

- Opens the same model types as the mod: **PMX, PMD, VRM, GLB, glTF** (pick the whole model folder so textures come along, or drag it in).
- Previews the model with the mod's default motions (idle, walk, sprint, sneak, swim, crawl, elytra, ride, sleep, swing) or any `.vmd` you load. Non-MMD rigs are retargeted the same way the mod does it, and the status bar tells you whether the mod will be able to animate the skeleton.
- Lets you edit the card: name, model author, terms of use, source, notes, overall size and a colour tint per material (the mod applies the same tints). Expression sliders are a preview.
- Exports the card as a PNG. Re-open a card later to change it.
- For an exact copy of a Koikatsu character, export it to PMX with the KKBP exporter in the game and open that PMX here.

## Card format

See [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). In short: a normal PNG, followed by a `3DMRCARD` block with a JSON manifest and the model files (deflate-compressed, with a SHA-256 per file), followed by a 16-byte trailer. Image viewers just show the picture.

## Respect model licences

A card contains the full model. Only share cards for models whose terms allow redistribution, and fill in the author and terms-of-use fields.

## Planned

- More hair styles, clothing pieces and face shapes for the base body; textures for skin and clothing.
- Pose and camera presets for the card picture.

## Development

No build step. Serve the folder over HTTP (`npm run serve`, then open http://localhost:8000) and edit the files in `src/`. `npm test` runs the card format tests (Node 22).

three.js and three-vrm are vendored under `vendor/` so the site works without a CDN. See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

MIT. See [LICENSE](LICENSE).
