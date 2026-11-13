// Character cards of ILLGAMES / ILLUSION titles (Koikatsu, Koikatsu Sunshine, Emotion Creators,
// AI Shoujo, Honey Select 2, Room Girl, Honey Come, Summer Vacation Scramble, ...).
//
// Those cards are PNG files with the game's character data appended: a header, then a MessagePack
// "BlockHeader" listing data blocks ("Custom" for face/body/hair, "Parameter" for name and sex,
// "Coordinate" for outfits). They hold slider values and asset IDs for the game's own character
// maker, not a 3D model, so a character cannot be rebuilt exactly without the game. The studio
// reads what carries over to its base body: name, sex, body proportions, skin, hair and eye colour.

import { findPngEnd } from './card.js';

const MARKERS = {
  KoiKatuChara: 'Koikatsu', KoiKatuCharaS: 'Koikatsu Party', KoiKatuCharaSP: 'Koikatsu Party',
  KoiKatuCharaSun: 'Koikatsu Sunshine', KoiKatsuCharaSun: 'Koikatsu Sunshine', EroMakeChara: 'Emotion Creators',
  AIS_Chara: 'AI Shoujo / Honey Select 2', RG_Chara: 'Room Girl', HCChara: 'Honey Come', HCPChara: 'Honey Come',
  SVChara: 'Summer Vacation Scramble', ACChara: 'Aicomi', DCChara: 'DigitalCraft', PlayHome: 'PlayHome',
};

/** The game a card comes from, or null when it is not an ILLGAMES character card. */
export function detectIllgamesCard(bytes) {
  const end = findPngEnd(bytes);
  if (end < 0 || end >= bytes.length) return null;
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(end, Math.min(bytes.length, end + 96)));
  const m = /【([A-Za-z0-9_]+)】/.exec(head);
  if (!m) return null;
  return { marker: m[1], game: MARKERS[m[1]] ?? m[1] };
}

// ---------------------------------------------------------------- MessagePack

export function decodeMsgpack(bytes, offset = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = offset;
  const text = new TextDecoder();
  const str = (n) => { const s = text.decode(bytes.subarray(pos, pos + n)); pos += n; return s; };
  const bin = (n) => { const b = bytes.subarray(pos, pos + n); pos += n; return b; };
  const arr = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(read()); return a; };
  const map = (n) => { const o = {}; for (let i = 0; i < n; i++) { const k = read(); o[String(k)] = read(); } return o; };
  const ext = (n) => { pos += 1; return { ext: bin(n) }; };
  function read() {
    if (pos >= bytes.length) throw new Error('msgpack: unexpected end');
    const b = bytes[pos++];
    if (b <= 0x7f) return b;
    if (b >= 0xe0) return b - 0x100;
    if ((b & 0xf0) === 0x80) return map(b & 0x0f);
    if ((b & 0xf0) === 0x90) return arr(b & 0x0f);
    if ((b & 0xe0) === 0xa0) return str(b & 0x1f);
    let v;
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: v = bytes[pos]; pos += 1; return bin(v);
      case 0xc5: v = view.getUint16(pos); pos += 2; return bin(v);
      case 0xc6: v = view.getUint32(pos); pos += 4; return bin(v);
      case 0xc7: v = bytes[pos]; pos += 1; return ext(v);
      case 0xc8: v = view.getUint16(pos); pos += 2; return ext(v);
      case 0xc9: v = view.getUint32(pos); pos += 4; return ext(v);
      case 0xca: v = view.getFloat32(pos); pos += 4; return v;
      case 0xcb: v = view.getFloat64(pos); pos += 8; return v;
      case 0xcc: v = bytes[pos]; pos += 1; return v;
      case 0xcd: v = view.getUint16(pos); pos += 2; return v;
      case 0xce: v = view.getUint32(pos); pos += 4; return v;
      case 0xcf: v = Number(view.getBigUint64(pos)); pos += 8; return v;
      case 0xd0: v = view.getInt8(pos); pos += 1; return v;
      case 0xd1: v = view.getInt16(pos); pos += 2; return v;
      case 0xd2: v = view.getInt32(pos); pos += 4; return v;
      case 0xd3: v = Number(view.getBigInt64(pos)); pos += 8; return v;
      case 0xd4: return ext(1);
      case 0xd5: return ext(2);
      case 0xd6: return ext(4);
      case 0xd7: return ext(8);
      case 0xd8: return ext(16);
      case 0xd9: v = bytes[pos]; pos += 1; return str(v);
      case 0xda: v = view.getUint16(pos); pos += 2; return str(v);
      case 0xdb: v = view.getUint32(pos); pos += 4; return str(v);
      case 0xdc: v = view.getUint16(pos); pos += 2; return arr(v);
      case 0xdd: v = view.getUint32(pos); pos += 4; return arr(v);
      case 0xde: v = view.getUint16(pos); pos += 2; return map(v);
      case 0xdf: v = view.getUint32(pos); pos += 4; return map(v);
      default: throw new Error(`msgpack: unknown byte 0x${b.toString(16)}`);
    }
  }
  const value = read();
  return { value, end: pos };
}

// ---------------------------------------------------------------- card blocks

function indexOfAscii(bytes, text, from) {
  const pattern = Uint8Array.from(text, (c) => c.charCodeAt(0));
  outer: for (let i = from; i <= bytes.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) if (bytes[i + j] !== pattern[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * Reads the data blocks of a card. The header before the block list differs between games, so
 * the block list is found by its MessagePack key ("lstInfo") instead of by parsing the header.
 */
export function readBlocks(bytes) {
  const card = detectIllgamesCard(bytes);
  if (!card) throw new Error('not an ILLGAMES character card');
  const end = findPngEnd(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let search = end;
  while (search >= 0) {
    const at = indexOfAscii(bytes, 'lstInfo', search);
    if (at < 0) break;
    search = at + 1;
    // The map header and the key's string header (fixstr: 1 byte, str8: 2 bytes) come right before
    // the key; the int32 length of the block list before that.
    let header = null;
    let headerStart = 0;
    let length = 0;
    for (const back of [2, 3]) {
      headerStart = at - back;
      const lengthAt = headerStart - 4;
      if (lengthAt < end) continue;
      length = view.getInt32(lengthAt, true);
      if (length <= 0 || headerStart + length + 8 > bytes.length) continue;
      try {
        header = decodeMsgpack(bytes.subarray(headerStart, headerStart + length)).value;
      } catch {
        header = null;
      }
      if (Array.isArray(header?.lstInfo)) break;
      header = null;
    }
    if (!header) continue;
    const dataStart = headerStart + length + 8; // + int64 total size
    const blocks = {};
    for (const info of header.lstInfo) {
      const from = dataStart + Number(info.pos);
      const to = from + Number(info.size);
      if (from < dataStart || to > bytes.length) continue;
      blocks[info.name] = bytes.subarray(from, to);
    }
    return { ...card, blocks };
  }
  throw new Error('the card data could not be found');
}

/** "Custom" holds three length-prefixed MessagePack maps: face, body, hair. */
function readCustom(block) {
  const out = {};
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  let pos = 0;
  for (const key of ['face', 'body', 'hair']) {
    if (pos + 4 > block.length) break;
    const length = view.getInt32(pos, true);
    pos += 4;
    if (length <= 0 || pos + length > block.length) break;
    try {
      out[key] = decodeMsgpack(block.subarray(pos, pos + length)).value;
    } catch {
      out[key] = null;
    }
    pos += length;
  }
  return out;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const hex = (rgb) => '#' + rgb.slice(0, 3).map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');

/** A Unity colour in any of the shapes the games serialise it in. */
function colour(value) {
  if (Array.isArray(value) && value.length >= 3 && value.every((x) => typeof x === 'number')) return hex(value);
  if (value && typeof value === 'object' && 'r' in value) return hex([value.r, value.g, value.b]);
  return null;
}

/** First colour found under `value` for any of `keys` (depth-first). */
function findColour(value, keys, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return null;
  for (const key of keys) {
    const c = colour(value[key]);
    if (c) return c;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const c = findColour(child, keys, depth + 1);
    if (c) return c;
  }
  return null;
}

/**
 * What carries over from an ILLGAMES card to the studio's base body.
 * Returns {game, name, sex, params, notes}.
 */
export function readIllgamesCharacter(bytes) {
  const card = readBlocks(bytes);
  const custom = card.blocks.Custom ? readCustom(card.blocks.Custom) : {};
  let parameter = {};
  try {
    if (card.blocks.Parameter) parameter = decodeMsgpack(card.blocks.Parameter).value ?? {};
  } catch { /* keep going without the name */ }

  const name = parameter.fullname
    ?? [parameter.lastname, parameter.firstname].filter(Boolean).join(' ')
    ?? '';
  const sex = parameter.sex === 0 ? 'male' : 'female';
  const params = { preset: sex };
  const notes = [];

  // Body sliders. The games store -1..2 (shown as -100..200); index meanings follow the body
  // slider list of Koikatsu and AI/HS2, which share these entries.
  const shape = custom.body?.shapeValueBody;
  if (Array.isArray(shape) && shape.length >= 30) {
    const pick = (index) => clamp01(Number(shape[index]));
    Object.assign(params, {
      height: pick(0), bustSize: sex === 'male' ? 0 : pick(1), headSize: pick(10), shoulderWidth: pick(13),
      waist: pick(17), hipWidth: pick(22), thighThickness: pick(26), armThickness: pick(31),
    });
  } else {
    notes.push('no body sliders');
  }
  if (typeof custom.body?.bustSoftness === 'number') params.bustSoftness = clamp01(custom.body.bustSoftness);
  const skin = findColour(custom.body, ['skinMainColor', 'skinColor', 'skinBaseColor']);
  if (skin) params.skinColor = skin;
  const hair = findColour(custom.hair, ['baseColor', 'color']);
  if (hair) params.hairColor = hair;
  const eye = findColour(custom.face?.pupil ?? custom.face, ['baseColor', 'color', 'whiteColor']);
  if (eye) params.eyeColor = eye;
  if (!custom.face) notes.push('no face data');

  return { game: card.game, marker: card.marker, name: name.trim(), sex, params, blocks: Object.keys(card.blocks), notes };
}
