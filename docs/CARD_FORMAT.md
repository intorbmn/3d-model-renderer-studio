# Model card format, version 1

A model card is a single PNG file that carries a 3D model for 3D Model Renderer. Any image viewer shows
it as the preview picture; the mod and the studio read the model packed behind the image. The idea is the
same as the character cards of Koikatsu.

## Layout

```
+-----------------------------------------------+
| PNG image (signature ... IEND chunk)          |  an ordinary, complete PNG: the preview
+-----------------------------------------------+
| "3DMRCARD"                       8 bytes      |  payload start
| format version                   u32 LE = 1   |
| manifest length M                u32 LE       |
| manifest                         M bytes      |  UTF-8 JSON, see below
| file data                        ...          |  the packed files, back to back
+-----------------------------------------------+
| payload start offset             u64 LE       |  offset of "3DMRCARD" from the start of the file
| "3DMR-END"                       8 bytes      |  trailer
+-----------------------------------------------+
```

A reader looks at the last 16 bytes first. If they end with `3DMR-END`, the offset in front of it gives
the payload start, which must hold `3DMRCARD`. This keeps reading cheap and does not depend on parsing the
PNG. A file without the trailer is not a card (it may still be an ordinary image).

Everything after the IEND chunk is ignored by PNG decoders, so the card still displays as an image.
Image hosts and chat apps that re-encode pictures drop the payload: share cards as files.

## Manifest

```json
{
  "format": "3d-model-renderer-card",
  "version": 1,
  "name": "Mona",
  "author": "Who made the model",
  "license": "Terms of use of the model, as given by its author",
  "source": "Where the model comes from (URL or description)",
  "notes": "",
  "createdWith": "3d-model-renderer-studio 0.1.0",
  "createdAt": "2026-11-14T05:00:00Z",
  "model": { "path": "model/Mona.glb", "type": "glb" },
  "settings": {
    "scale": 1.0,
    "materialTints": { "face": [1.0, 0.96, 0.94] }
  },
  "files": [
    { "path": "model/Mona.glb", "offset": 0, "size": 123456, "stored": 98765,
      "compression": "deflate", "sha256": "…64 hex digits…" }
  ]
}
```

| Field | Meaning |
|---|---|
| `format`, `version` | Must be `3d-model-renderer-card` and `1`. |
| `name` | Display name of the model. |
| `author`, `license`, `source`, `notes` | Credits and terms. A card redistributes a model, so keep its author's terms with it. |
| `model.path` | The model file inside the card. |
| `model.type` | `pmx`, `pmd`, `vrm`, `glb` or `gltf`. |
| `settings.scale` | Size multiplier applied by the mod (1 = unchanged). |
| `settings.materialTints` | Colour multiplier per material name, RGB in 0..2. Materials not listed are unchanged. |
| `files[].path` | Relative path with `/` separators. No absolute paths, no `..`, no empty segments. |
| `files[].offset` | Start of the stored bytes, counted from the start of the file data section. |
| `files[].size` | Size after decompression. |
| `files[].stored` | Size of the stored bytes. |
| `files[].compression` | `deflate` (zlib stream, RFC 1950) or `none`. |
| `files[].sha256` | SHA-256 of the decompressed bytes, lower-case hex. |

Readers must ignore manifest fields they do not know, so later versions can add settings without breaking
older readers. A change that older readers cannot ignore increases `version`.

## Physics groups (`physics`, optional)

Spring-bone chains sorted into groups. The mod writes this object as `physics.json` next to the extracted
model and runs it, for VRM, GLB and glTF models, in place of the model's own VRM spring bones. PMX and
PMD models keep their rigid-body physics; their cards have no `physics` section.

```json
"physics": {
  "version": 1,
  "groups": [
    { "name": "Hair", "kind": "hair", "enabled": true, "mode": "spring", "maxAngle": 80,
      "stiffness": 0.9, "drag": 0.4, "gravity": 0.15, "gravityDir": [0, -1, 0], "radius": 0.015,
      "chains": [["Hair_Back_L1_0", "Hair_Back_L1_1", "Hair_Back_L1_2"]],
      "colliders": ["head", "chest"] }
  ],
  "colliders": [
    { "name": "head", "bone": "Head", "offset": [0, 0.08, 0], "radius": 0.11, "tail": null },
    { "name": "leftLeg", "bone": "LeftUpperLeg", "offset": [0, 0, 0], "radius": 0.09, "tail": [0, -0.38, 0] }
  ]
}
```

| Field | Meaning |
|---|---|
| `kind` | `hair`, `clothing`, `body` or `custom`. Unknown kinds are read as `custom`. |
| `chains` | Bone names (glTF node names), root first. Each bone swings towards the next one; the last bone is only the tail (it does not swing itself). |
| `mode` | `spring` (hair, clothing, custom) or `jiggle` (body). Missing: `jiggle` for `body`, `spring` otherwise. |
| `stiffness`, `drag`, `gravity`, `gravityDir` | `spring`: as in VRM spring bones, stiffness and gravity in metres per second for a human-sized model, drag 0..1. `jiggle`: a damped spring around the rest pose; stiffness 0..4 is the bounce (1 + 1.5 × stiffness Hz), drag 0..1 the damping (ratio 0.1 + 0.8 × drag), gravity the sag as a fraction of the bone length. |
| `maxAngle` | Furthest a joint turns from its rest direction, in degrees. Missing: 1 for `body` (the breast moves as a whole on its position spring, the tip barely turns), 70 for `clothing`, 80 otherwise. |
| `translation` | `jiggle` only: how far the chain's first bone may also move on a position spring, as a fraction of its bone length (the whole mass bounces and lags, as in Zenless Zone Zero). Missing: 0.3 for `body`, 0 otherwise. Body chains start from the bust bone that carries the whole breast (`cf_s_bust00_L` in KKBP files); the mod also extends older cards' chains that start lower. |
| `radius` | Hit radius of the chain's joints, in the model file's units. |
| `colliders[]` | Spheres (`tail` null) or capsules. `offset` and `tail` are relative to `bone`, along the bone's axes in the rest pose, in the file's units. A joint whose tail already sits inside a collider at rest is only kept from going deeper; collisions push the tail out on the side it came from. |

The studio and the mod run the same solver at a fixed 60 Hz (at most four steps a frame).

## Character shape (`shape`, optional)

Edits made with the studio's character maker. Like the character makers of ILLGAMES titles, it shapes a
character by moving, turning and scaling bones (the "shape bones": `cf_s_*` for the body, `cf_J_*` for
the face, or main bones where an export moved the weights there) and by hiding parts. The mod writes this
object as `shape.json` next to the extracted model and bakes it into the model's rest pose when it loads
it (VRM, GLB and glTF models).

```json
"shape": {
  "version": 1,
  "sliders": { "headSize": 0.6, "eyeSpacing": 0.55 },
  "bones": {
    "cf_s_head": { "s": [1.04, 1.04, 1.04] },
    "cf_J_Eye_tx_L": { "t": [0.0006, 0, 0] },
    "Left leg": { "s": [1.1, 1, 1.1] }, "Left knee": { "s": [0.909, 1, 0.909] }
  },
  "hidden": { "materials": ["SVS m_cloth_cf_top_tshirt00 9140"], "meshes": [] }
}
```

| Field | Meaning |
|---|---|
| `sliders` | The maker's slider values (0.5 = as modelled; the slider covers 0..1, typed values may go from -1 to 2). Only the studio reads them, to edit again. |
| `bones` | Per bone (glTF node name): `t` added to its position (parent's axes, file units), `r` a turn in degrees (X, Y, Z, after its own rotation), `s` multiplied into its scale. |
| `hidden.materials`, `hidden.meshes` | Parts that are not drawn. |

## Animations (by file placement)

A card can carry its own motions without any extra manifest field: a VMD named after a mod slot
(`idle.vmd`, `walk.vmd`, `sprint.vmd`, ... or a custom action name) placed in the same folder as the
model file is played by the mod in place of its default for that slot, because the mod looks in the
model folder before `3d-skin/CustomAnim` and `3d-skin/DefaultAnim`. The studio's animation editor
(in progress, `src/animation/`) will write them there.

## Saved defaults (`editor`, optional)

`"editor": { "defaults": { "sliders": {...}, "hidden": [...], "physics": {...}, "settings": {...} } }` holds the
values the author saved with **Save defaults**, so whoever opens the card in the studio can go back to
them with **Back to saved defaults** after experimenting. The mod ignores it: what it applies is
`settings`, `physics` and `shape`.

## Outfit

The outfit is not a separate manifest field. A character card's model is one GLB
(`model/character.glb`) holding the character and the outfit pieces imported in the studio, with
**one skeleton**: every skinned mesh uses the same joint list (the character's bones, then the bones
the outfit brought, such as a skirt's), so readers that take the first skin, like the mod, drive the
outfit with the body's bones and physics. Imported pieces carry node extras so the studio can show
them in their slots again:

| Extra | Meaning |
|---|---|
| `outfitSlot` | `hair`, `top`, `innerTop`, `bottom`, `underwear`, `socks`, `shoes` or `accessory` |
| `outfitName` | The file the piece came from |
| `outfitPart` | Pieces imported together share this number |
| `outfitBone` (on bones) | A bone the outfit added to the skeleton |

Pieces hidden in every outfit preset (or, without presets, hidden now) are listed in
`shape.hidden.materials`; the mod removes them.

## Outfit presets (`outfits`, optional)

```json
"outfits": { "version": 1, "default": 0, "presets": [
  { "name": "Casual", "hidden": ["SVS m_cloth_cf_bra_base00_03 9340"] },
  { "name": "Inner only", "hidden": ["SVS m_cloth_cf_top_tshirt00 9140"] }
] }
```

Each preset names the materials it hides; the others are shown. The mod writes this object as
`outfits.json` next to the extracted model, wears the `default` preset, and lets the player change
it in game (config wheel → Outfit); the choice is kept per model.

## Character maker (`template`, obsolete)

Early studio versions wrote `"template": { "version": 1, "params": {...} }` for characters built from
their own base body. That maker is gone; readers ignore the field.

## Limits

Readers reject a card when any of these hold:

- the trailer offset does not point at `3DMRCARD`, or the manifest runs past the payload;
- the manifest is not valid JSON or `format`/`version` do not match;
- a path is unsafe (absolute, contains `..`, a drive letter or a backslash) or appears twice;
- a file's stored bytes run past the end of the file data, or its decompressed size or hash do not match;
- the total decompressed size exceeds 1 GiB, or there are more than 4096 files;
- `model.path` is not one of the files.

## ILLGAMES / Koikatsu cards

Koikatsu cards use the same trick (data appended after the PNG), but their data is a list of settings for
Koikatsu's own character maker: slider values, outfit and accessory IDs. They contain no mesh, so a model
cannot be rebuilt from them without the game. The studio recognises them and says so. To bring a Koikatsu
character over, export it from the game to PMX with the KKBP exporter, then import the PMX into the studio.
