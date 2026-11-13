# 3D Model Renderer Studio

[Tiếng Việt](README.vi.md)

A browser tool for making **model cards** for the [3D Model Renderer](https://github.com/intorbmn/3d-model-renderer) Minecraft mod. A card is a PNG picture of the character with the whole model (mesh, textures and settings) packed inside, the same idea as Koikatsu character cards. Share one file, drop it into the mod's `Cards` folder, done.

**Open the studio:** https://intorbmn.github.io/3d-model-renderer-studio/

Everything runs in your browser. Nothing is uploaded.

## What it does

- Opens the same model types as the mod: **PMX, PMD, VRM, GLB, glTF** (pick the whole model folder so textures come along, or drag it in).
- Previews the model with the mod's default motions (idle, walk, sprint, sneak, swim, crawl, elytra, ride, sleep, swing) or any `.vmd` you load. Non-MMD rigs are retargeted the same way the mod does it, and the status bar tells you whether the mod will be able to animate the skeleton.
- Lets you edit the card: name, model author, terms of use, source, notes, overall size and a colour tint per material (the mod applies the same tints). Expression sliders are a preview.
- Exports the card as a PNG. Re-open a card later to change it.
- Recognises Koikatsu cards and explains how to convert them: those cards only hold character-maker settings, not a 3D model, so export the character to PMX with the KKBP exporter first.

## Card format

See [docs/CARD_FORMAT.md](docs/CARD_FORMAT.md). In short: a normal PNG, followed by a `3DMRCARD` block with a JSON manifest and the model files (deflate-compressed, with a SHA-256 per file), followed by a 16-byte trailer. Image viewers just show the picture.

## Respect model licences

A card contains the full model. Only share cards for models whose terms allow redistribution, and fill in the author and terms-of-use fields.

## Planned

- A built-in base model with Koikatsu-style sliders (body proportions, hair and outfit parts). Waiting on a model with a licence that allows bundling it, and on body-shape support in the mod's engine.
- Pose and camera presets for the card picture.

## Development

No build step. Serve the folder over HTTP (`npm run serve`, then open http://localhost:8000) and edit the files in `src/`. `npm test` runs the card format tests (Node 22).

three.js and three-vrm are vendored under `vendor/` so the site works without a CDN. See [THIRD_PARTY.md](THIRD_PARTY.md).

## License

MIT. See [LICENSE](LICENSE).
