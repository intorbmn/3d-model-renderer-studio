// Writes an AnimationClipData as a VMD file (the format the mod plays).
//
// Layout (little endian): 30-byte header "Vocaloid Motion Data 0002", 20-byte model name, then
// bone keys (u32 count; each 111 bytes: 15-byte name, u32 frame, 3×f32 position, 4×f32 rotation,
// 64 bytes of Bézier interpolation), morph keys (u32 count; each 23 bytes: 15-byte name, u32
// frame, f32 weight), and empty camera, light and shadow sections. Names are Shift_JIS.
//
// STATUS: groundwork for the animation editor; not used by the UI yet.

import { encodeShiftJis } from '../rig/sjis.js';

const HEADER = 'Vocaloid Motion Data 0002';

/** Linear interpolation, in the byte pattern MMD writes for its default curve. */
const LINEAR_INTERPOLATION = (() => {
  // Per channel (X, Y, Z, rotation): x1, y1, x2, y2 with control points (20,20) and (107,107).
  const curve = [20, 20, 20, 20, 20, 20, 20, 20, 107, 107, 107, 107, 107, 107, 107, 107];
  const bytes = new Uint8Array(64);
  // MMD stores the 16 values four times, each copy shifted by one byte.
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 16; i++) bytes[row * 16 + i] = i - row >= 0 ? curve[i - row] : 0;
  }
  return bytes;
})();

function writeName(view, bytes, offset, name, size) {
  const encoded = encodeShiftJis(name);
  if (!encoded) throw new Error(`cannot write the name "${name}" into a VMD (not in the Shift_JIS table)`);
  if (encoded.length > size) throw new Error(`the name "${name}" is too long for a VMD (${encoded.length} > ${size} bytes)`);
  bytes.set(encoded, offset);
}

/**
 * @param {import('./clip.js').AnimationClipData} clip keys in MMD space
 * @param {string} modelName written into the header (ASCII or a known name; at most 20 bytes)
 */
export function writeVmd(clip, modelName = '') {
  const boneKeys = [];
  for (const [name, keys] of clip.bones) for (const k of keys) boneKeys.push([name, k]);
  const morphKeys = [];
  for (const [name, keys] of clip.morphs) for (const k of keys) morphKeys.push([name, k]);

  const size = 30 + 20 + 4 + boneKeys.length * 111 + 4 + morphKeys.length * 23 + 4 + 4 + 4;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(HEADER), 0);
  const asciiModel = /^[\x20-\x7e]*$/.test(modelName) ? modelName.slice(0, 20) : '';
  writeName(view, bytes, 30, asciiModel, 20);

  let o = 50;
  view.setUint32(o, boneKeys.length, true);
  o += 4;
  for (const [name, k] of boneKeys) {
    writeName(view, bytes, o, name, 15);
    view.setUint32(o + 15, k.frame, true);
    k.position.forEach((v, i) => view.setFloat32(o + 19 + i * 4, v, true));
    k.rotation.forEach((v, i) => view.setFloat32(o + 31 + i * 4, v, true));
    bytes.set(LINEAR_INTERPOLATION, o + 47);
    o += 111;
  }
  view.setUint32(o, morphKeys.length, true);
  o += 4;
  for (const [name, k] of morphKeys) {
    writeName(view, bytes, o, name, 15);
    view.setUint32(o + 15, k.frame, true);
    view.setFloat32(o + 19, k.weight, true);
    o += 23;
  }
  // Camera, light and self-shadow sections: empty.
  view.setUint32(o, 0, true);
  view.setUint32(o + 4, 0, true);
  view.setUint32(o + 8, 0, true);
  return bytes;
}
