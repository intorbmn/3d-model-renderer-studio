import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIllgamesCard, readIllgamesCharacter, decodeMsgpack } from '../src/illgames.js';

// A minimal MessagePack encoder for building test cards.
function pack(value) {
  const out = [];
  const enc = new TextEncoder();
  const f32 = (x) => { const b = new DataView(new ArrayBuffer(5)); b.setUint8(0, 0xca); b.setFloat32(1, x); return [...new Uint8Array(b.buffer)]; };
  const write = (v) => {
    if (v === null) out.push(0xc0);
    else if (typeof v === 'boolean') out.push(v ? 0xc3 : 0xc2);
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 128) out.push(v);
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 65536) out.push(0xcd, v >> 8, v & 255);
    else if (typeof v === 'number') out.push(...f32(v));
    else if (typeof v === 'string') { const b = enc.encode(v); if (b.length < 32) out.push(0xa0 | b.length, ...b); else out.push(0xd9, b.length, ...b); }
    else if (Array.isArray(v)) { out.push(0xdc, v.length >> 8, v.length & 255); v.forEach(write); }
    else { const k = Object.keys(v); out.push(0x80 | k.length); for (const key of k) { write(key); write(v[key]); } }
  };
  write(value);
  return Uint8Array.from(out);
}
const int32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n, true); return b; };
const int64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(n), true); return b; };
const csString = (s) => { const b = new TextEncoder().encode(s); return Uint8Array.from([b.length, ...b]); };
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

const PNG = Uint8Array.from(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005bc4cd8b0000000049454e44ae426082', 'hex'));

function koikatsuCard() {
  const shape = Array.from({ length: 44 }, () => 0.5);
  shape[0] = 0.9; shape[1] = 0.8; shape[10] = 0.2;
  const face = pack({ pupil: [{ id: 1, baseColor: [0, 0.2, 0.4, 1] }] });
  const body = pack({ shapeValueBody: shape, bustSoftness: 0.7, skinMainColor: [1, 0.8, 0.6, 1] });
  const hair = pack({ parts: [{ id: 3, baseColor: [0.2, 0.4, 1, 1] }] });
  const custom = concat(int32(face.length), face, int32(body.length), body, int32(hair.length), hair);
  const parameter = pack({ lastname: 'Sakura', firstname: 'Mio', sex: 1 });
  const header = pack({ lstInfo: [
    { name: 'Custom', version: '0.0.0', pos: 0, size: custom.length },
    { name: 'Parameter', version: '0.0.5', pos: custom.length, size: parameter.length },
  ] });
  const facePng = PNG;
  return concat(PNG, int32(100), csString('【KoiKatuChara】'), csString('0.0.0'),
    int32(facePng.length), facePng, int32(header.length), header, int64(custom.length + parameter.length), custom, parameter);
}

test('detects the game from the marker', () => {
  assert.deepEqual(detectIllgamesCard(koikatsuCard()), { marker: 'KoiKatuChara', game: 'Koikatsu' });
  assert.equal(detectIllgamesCard(PNG), null);
});

test('reads name, sex, sliders and colours', () => {
  const c = readIllgamesCharacter(koikatsuCard());
  assert.equal(c.name, 'Sakura Mio');
  assert.equal(c.sex, 'female');
  assert.ok(Math.abs(c.params.height - 0.9) < 1e-6);
  assert.ok(Math.abs(c.params.bustSize - 0.8) < 1e-6);
  assert.ok(Math.abs(c.params.headSize - 0.2) < 1e-6);
  assert.ok(Math.abs(c.params.bustSoftness - 0.7) < 1e-6);
  assert.equal(c.params.skinColor, '#ffcc99');
  assert.equal(c.params.hairColor, '#3366ff');
  assert.equal(c.params.eyeColor, '#003366');
});

test('msgpack round trip of nested values', () => {
  const v = { a: [1, 2.5, 'x', null, true], b: { c: 300 } };
  const out = decodeMsgpack(pack(v)).value;
  assert.deepEqual(out, v);
});
