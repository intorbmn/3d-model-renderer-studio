import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClipData } from '../src/animation/clip.js';
import { writeVmd } from '../src/animation/vmd-writer.js';
import { encodeShiftJis, KNOWN_NAMES } from '../src/rig/sjis.js';
import { MMDParser } from '../vendor/three/examples/jsm/libs/mmdparser.module.js';

test('the Shift_JIS table decodes back to the names', () => {
  const decoder = new TextDecoder('shift_jis');
  for (const name of KNOWN_NAMES) assert.equal(decoder.decode(encodeShiftJis(name)), name);
  assert.equal(encodeShiftJis('知らない骨'), null);
});

test('clip keys sort, replace and interpolate', () => {
  const clip = new AnimationClipData('wave');
  const half = Math.SQRT1_2;
  clip.setBoneKey('左腕', 30, [0, 0, half, half]);
  clip.setBoneKey('左腕', 0, [0, 0, 0, 1]);
  clip.setBoneKey('左腕', 30, [0, 0, half, half]);
  assert.deepEqual(clip.bones.get('左腕').map((k) => k.frame), [0, 30]);
  const mid = clip.sampleBone('左腕', 15).rotation;
  assert.ok(Math.abs(mid[2] - Math.sin(Math.PI / 8)) < 1e-6, 'slerp halfway is a 45 degree turn');
  assert.equal(clip.duration, 30);
  const copy = AnimationClipData.fromJSON(JSON.parse(JSON.stringify(clip)));
  assert.deepEqual(copy.sampleBone('左腕', 15), clip.sampleBone('左腕', 15));
});

test('written VMD files read back with the MMD parser', () => {
  const clip = new AnimationClipData('test');
  clip.setBoneKey('センター', 0, [0, 0, 0, 1], [0, 0, 0]);
  clip.setBoneKey('センター', 10, [0, 0, 0, 1], [0, 1.5, -2]);
  clip.setBoneKey('右ひじ', 5, [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)]);
  clip.setMorphKey('まばたき', 20, 1);
  const bytes = writeVmd(clip, 'Studio');
  const vmd = new MMDParser.Parser().parseVmd(bytes.buffer, false);
  assert.equal(vmd.metadata.name, 'Studio');
  assert.equal(vmd.metadata.motionCount, 3);
  const center = vmd.motions.find((m) => m.boneName === 'センター' && m.frameNum === 10);
  assert.deepEqual(center.position.map((v) => Math.round(v * 100) / 100), [0, 1.5, -2]);
  const elbow = vmd.motions.find((m) => m.boneName === '右ひじ');
  assert.ok(Math.abs(elbow.rotation[2] - 0.3) < 1e-6);
  assert.equal(vmd.morphs[0].morphName, 'まばたき');
  // And back into a clip.
  const back = AnimationClipData.fromVmd(vmd);
  assert.deepEqual(back.bones.get('センター').map((k) => k.frame), [0, 10]);
});
