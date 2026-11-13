// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeCard, readCard, isCard, isKoikatsuCard, isSafePath, findPngEnd, CardError } from '../src/card.js';

// Smallest valid PNG: 1x1 transparent pixel.
const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

const info = { name: 'Test', author: 'me', model: { path: 'model/a.pmx', type: 'pmx' }, settings: { scale: 1.5 } };
const files = [
  { path: 'model/a.pmx', data: new TextEncoder().encode('PMX '.repeat(1000)) },
  { path: 'model/tex/skin.png', data: Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 255) },
];

test('round trip keeps manifest and files', async () => {
  const card = await writeCard(PNG, info, files);
  assert.ok(isCard(card));
  assert.equal(findPngEnd(card), PNG.length, 'still a PNG ending where the preview ended');
  const read = await readCard(card);
  assert.equal(read.manifest.name, 'Test');
  assert.equal(read.manifest.settings.scale, 1.5);
  assert.deepEqual([...read.preview], [...PNG]);
  for (const f of files) assert.deepEqual([...read.files.get(f.path)], [...f.data]);
  assert.equal(read.manifest.files.find((f) => f.path === 'model/a.pmx').compression, 'deflate');
  assert.equal(read.manifest.files.find((f) => f.path === 'model/tex/skin.png').compression, 'none');
});

test('a plain PNG is not a card', () => {
  assert.equal(isCard(PNG), false);
});

test('corruption is detected', async () => {
  const card = await writeCard(PNG, info, files);
  const damaged = card.slice();
  damaged[damaged.length - 40] ^= 0xff; // inside the stored file data
  await assert.rejects(readCard(damaged), CardError);
});

test('unsafe paths are rejected', async () => {
  for (const bad of ['../x', '/abs', 'a//b', 'C:/x', 'a\\b', './a', '']) assert.equal(isSafePath(bad), false, bad);
  assert.equal(isSafePath('model/tex/a.png'), true);
  await assert.rejects(writeCard(PNG, { ...info, model: { path: '../a.pmx', type: 'pmx' } },
    [{ path: '../a.pmx', data: new Uint8Array(1) }]), CardError);
});

test('koikatsu cards are recognised', () => {
  const marker = new TextEncoder().encode('【KoiKatuChara】');
  const kk = new Uint8Array(PNG.length + 6 + marker.length);
  kk.set(PNG, 0);
  kk.set([100, 0, 0, 0, marker.length], PNG.length);
  kk.set(marker, PNG.length + 5);
  assert.equal(isKoikatsuCard(kk), true);
  assert.equal(isKoikatsuCard(PNG), false);
});
