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
    { "name": "Hair", "kind": "hair", "enabled": true,
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
| `chains` | Bone names (glTF node names), root first. Each bone swings towards the next one. |
| `stiffness`, `drag`, `gravity`, `gravityDir` | As in VRM spring bones: stiffness and gravity in metres per second for a human-sized model, drag 0..1. |
| `radius` | Hit radius of the chain's joints, in the model file's units. |
| `colliders[]` | Spheres (`tail` null) or capsules. `offset` and `tail` are relative to `bone`, along the bone's axes in the rest pose, in the file's units. |

## Character maker (`template`, optional)

Cards made from the studio's base body keep the maker's sliders so the character can be edited again:
`"template": { "version": 1, "params": { "preset": "female", "height": 0.4, ... } }`. Readers other than the
studio ignore it.

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
