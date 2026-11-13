// The built-in base character: a skinned humanoid built from code, with hair, clothing and body
// parts that carry their own spring-bone chains. Every look is driven by a few dozen 0..1 sliders,
// the way the character makers of ILLGAMES titles work, and the result is exported as a GLB that
// goes through exactly the same path as any other model.
//
// Conventions: metres, +Y up, the character faces +Z, its left hand is on +X, T-pose. Bones use
// VRM/Unity humanoid names so the mod recognises the skeleton; physics bones are named Hair_*,
// Skirt_*, Breast_* and so on so that physics.js puts them into the right groups.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export const TEMPLATE_VERSION = 1;

/** Slider definitions: key → [group, default]. Values are 0..1 unless noted. */
export const SLIDERS = {
  // Body
  height: ['body', 0.5], headSize: ['body', 0.5], neckLength: ['body', 0.5], shoulderWidth: ['body', 0.5],
  bustSize: ['body', 0.5], bustSoftness: ['body', 0.5], waist: ['body', 0.5], hipWidth: ['body', 0.5],
  armThickness: ['body', 0.5], thighThickness: ['body', 0.5], legLength: ['body', 0.5],
  // Face
  eyeSize: ['face', 0.5], eyeHeight: ['face', 0.5], eyeSpacing: ['face', 0.5],
  // Hair
  hairLength: ['hair', 0.5], hairVolume: ['hair', 0.5], hairSoftness: ['hair', 0.5],
  // Clothing
  topLength: ['clothing', 0.5], bottomLength: ['clothing', 0.5], clothingSoftness: ['clothing', 0.5],
};

export const HAIR_STYLES_ALL = ['none', 'short', 'bob', 'long', 'ponytail', 'twintails'];
export const TOPS = ['none', 'shirt'];
export const BOTTOMS = ['none', 'skirt', 'shorts', 'pants'];
export const PRESETS = ['female', 'male'];

/**
 * The base body is a plain figure with no clothes and no detail on the body, only a face.
 * The two presets set the sliders for a typical female and male figure; everything stays editable.
 */
export function presetParams(preset) {
  const base = Object.fromEntries(Object.entries(SLIDERS).map(([key, [, value]]) => [key, value]));
  const common = {
    top: 'none', bottom: 'none',
    skinColor: '#f6dccd', eyeColor: '#4a6fb5', hairColor: '#3a2a2a', topColor: '#f2f2f5', bottomColor: '#30365a',
  };
  if (preset === 'male') {
    return {
      ...base, ...common, preset: 'male', hairStyle: 'short',
      height: 0.75, headSize: 0.42, neckLength: 0.55, shoulderWidth: 0.85, bustSize: 0, waist: 0.75,
      hipWidth: 0.25, armThickness: 0.75, thighThickness: 0.5, legLength: 0.5, eyeSize: 0.35,
    };
  }
  return { ...base, ...common, preset: 'female', hairStyle: 'long', height: 0.4, bustSize: 0.5, waist: 0.35, hipWidth: 0.6 };
}

export function defaultParams() {
  return presetParams('female');
}

/** Keeps only known keys with values in range, filling the rest with defaults. */
export function sanitiseParams(input) {
  const params = defaultParams();
  if (!input || typeof input !== 'object') return params;
  for (const key of Object.keys(SLIDERS)) {
    const v = Number(input[key]);
    if (Number.isFinite(v)) params[key] = Math.min(1, Math.max(0, v));
  }
  if (HAIR_STYLES_ALL.includes(input.hairStyle)) params.hairStyle = input.hairStyle;
  if (PRESETS.includes(input.preset)) params.preset = input.preset;
  if (TOPS.includes(input.top)) params.top = input.top;
  if (BOTTOMS.includes(input.bottom)) params.bottom = input.bottom;
  for (const key of ['skinColor', 'eyeColor', 'hairColor', 'topColor', 'bottomColor']) {
    if (/^#[0-9a-f]{6}$/i.test(input[key] ?? '')) params[key] = input[key];
  }
  return params;
}

const lerp = (a, b, t) => a + (b - a) * t;
/** Maps a 0..1 slider to a range around 1 (or any range). */
const range = (t, lo, hi) => lerp(lo, hi, t);

// ---------------------------------------------------------------- skeleton

class Skeleton {
  constructor() {
    this.bones = [];
    this.byName = new Map();
  }

  add(name, parentName, worldPosition) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.userData.world = worldPosition.clone();
    const parent = parentName ? this.byName.get(parentName) : null;
    if (parent) {
      bone.position.copy(worldPosition).sub(parent.userData.world);
      parent.add(bone);
    } else {
      bone.position.copy(worldPosition);
    }
    this.byName.set(name, bone);
    this.bones.push(bone);
    return this.bones.length - 1;
  }

  index(name) {
    return this.bones.indexOf(this.byName.get(name));
  }

  world(name) {
    return this.byName.get(name).userData.world;
  }
}

// ---------------------------------------------------------------- geometry builder

/** Collects one material group of skinned triangles. */
class Part {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.indices = [];
  }

  vertex(p, n, weights) {
    const w = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = w.reduce((s, [, x]) => s + x, 0) || 1;
    while (w.length < 4) w.push([0, 0]);
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.skinIndex.push(...w.map(([i]) => i));
    this.skinWeight.push(...w.map(([, x]) => x / total));
    return this.positions.length / 3 - 1;
  }

  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  /**
   * A tube swept through rings. Each ring: {center, rx, rz, axis ('y' or 'x'), weights}.
   * Ends are closed with fans when `capStart`/`capEnd`.
   */
  tube(rings, segments, { capStart = false, capEnd = false, flip = false } = {}) {
    const start = this.positions.length / 3;
    for (const ring of rings) {
      for (let s = 0; s < segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        let offset;
        let normal;
        if (ring.axis === 'x') {
          offset = new THREE.Vector3(0, sn * ring.rx, c * ring.rz);
          normal = new THREE.Vector3(0, sn / ring.rx, c / ring.rz).normalize();
        } else {
          offset = new THREE.Vector3(sn * ring.rx, 0, c * ring.rz);
          normal = new THREE.Vector3(sn / ring.rx, 0, c / ring.rz).normalize();
        }
        this.vertex(ring.center.clone().add(offset), normal, ring.weights);
      }
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let s = 0; s < segments; s++) {
        const a = start + r * segments + s;
        const b = start + r * segments + ((s + 1) % segments);
        const c = b + segments;
        const d = a + segments;
        if (flip) this.quad(a, d, c, b);
        else this.quad(a, b, c, d);
      }
    }
    const cap = (ringIndex, outward) => {
      const ring = rings[ringIndex];
      const centre = this.vertex(ring.center, outward, ring.weights);
      for (let s = 0; s < segments; s++) {
        const a = start + ringIndex * segments + s;
        const b = start + ringIndex * segments + ((s + 1) % segments);
        const reversed = (ringIndex === 0) !== flip;
        if (reversed) this.indices.push(centre, b, a);
        else this.indices.push(centre, a, b);
      }
    };
    const axisDir = (i, j) => rings[j].center.clone().sub(rings[i].center).normalize();
    if (capStart) cap(0, axisDir(1, 0));
    if (capEnd) cap(rings.length - 1, axisDir(rings.length - 2, rings.length - 1));
  }

  ellipsoid(center, radii, weights, lat = 10, lon = 16, keep = null) {
    const start = this.positions.length / 3;
    for (let i = 0; i <= lat; i++) {
      const v = (i / lat) * Math.PI;
      for (let j = 0; j <= lon; j++) {
        const u = (j / lon) * Math.PI * 2;
        const unit = new THREE.Vector3(Math.sin(v) * Math.sin(u), Math.cos(v), Math.sin(v) * Math.cos(u));
        const p = unit.clone().multiply(radii).add(center);
        const n = unit.clone().divide(radii).normalize();
        this.vertex(p, n, typeof weights === 'function' ? weights(p) : weights);
      }
    }
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = start + i * (lon + 1) + j;
        const b = a + 1;
        const c = b + lon + 1;
        const d = a + lon + 1;
        if (keep) {
          // Decide by the quad's centre direction on the unit sphere.
          const v = ((i + 0.5) / lat) * Math.PI;
          const u = ((j + 0.5) / lon) * Math.PI * 2;
          if (!keep(new THREE.Vector3(Math.sin(v) * Math.sin(u), Math.cos(v), Math.sin(v) * Math.cos(u)))) continue;
        }
        this.quad(a, d, c, b);
      }
    }
  }

  /** A two-sided strip through `points` (Vector3), `widths`, facing `normal`, side along `side`. */
  ribbon(points, widths, side, normal, weightsAt) {
    for (const facing of [1, -1]) {
      const start = this.positions.length / 3;
      points.forEach((p, i) => {
        const half = side.clone().multiplyScalar(widths[i] / 2);
        const n = normal.clone().multiplyScalar(facing);
        // Offset the back face a hair so the two faces never z-fight.
        const lift = n.clone().multiplyScalar(0.0008);
        this.vertex(p.clone().sub(half).add(lift), n, weightsAt(i));
        this.vertex(p.clone().add(half).add(lift), n, weightsAt(i));
      });
      for (let i = 0; i < points.length - 1; i++) {
        const a = start + i * 2;
        if (facing === 1) this.quad(a, a + 2, a + 3, a + 1);
        else this.quad(a, a + 1, a + 3, a + 2);
      }
    }
  }
}

/** Linear blend between bones placed along a line: stops = [[t, boneIndex], ...] sorted by t. */
function blend(stops, t) {
  if (t <= stops[0][0]) return [[stops[0][1], 1]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, b0] = stops[i];
    const [t1, b1] = stops[i + 1];
    if (t <= t1) {
      const f = (t - t0) / Math.max(1e-6, t1 - t0);
      return [[b0, 1 - f], [b1, f]];
    }
  }
  return [[stops[stops.length - 1][1], 1]];
}

// ---------------------------------------------------------------- the character

/** Builds the character as a THREE.Group holding one SkinnedMesh (several materials). */
export function buildCharacter(input) {
  const p = sanitiseParams(input);
  const height = range(p.height, 1.45, 1.8);
  const s = height / 1.6; // overall scale
  const legLen = height * range(p.legLength, 0.44, 0.52);
  const headR = 0.105 * s * range(p.headSize, 0.88, 1.15);
  const neckLen = 0.07 * s * range(p.neckLength, 0.7, 1.4);
  const shoulderHalf = 0.17 * s * range(p.shoulderWidth, 0.85, 1.15);
  const hipHalf = 0.13 * s * range(p.hipWidth, 0.85, 1.2);
  const waistR = 0.105 * s * range(p.waist, 0.82, 1.15);
  const armR = 0.035 * s * range(p.armThickness, 0.8, 1.3);
  const thighR = 0.068 * s * range(p.thighThickness, 0.8, 1.25);

  const torsoTop = height - 2 * headR - neckLen;
  const hipsY = legLen;
  const chestY = lerp(hipsY, torsoTop, 0.72);
  const spineY = lerp(hipsY, torsoTop, 0.32);

  // Skeleton
  const sk = new Skeleton();
  const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  sk.add('Hips', null, v(0, hipsY));
  sk.add('Spine', 'Hips', v(0, spineY));
  sk.add('Chest', 'Spine', v(0, chestY));
  sk.add('Neck', 'Chest', v(0, torsoTop));
  sk.add('Head', 'Neck', v(0, torsoTop + neckLen));
  const headCentre = v(0, torsoTop + neckLen + headR * 0.95, 0.005 * s);
  sk.add('HeadTop', 'Head', v(0, height));
  const eyeY = headCentre.y - headR * range(p.eyeHeight, 0.25, -0.05);
  const eyeX = headR * range(p.eyeSpacing, 0.3, 0.45);
  sk.add('LeftEye', 'Head', v(eyeX, eyeY, headCentre.z + headR * 0.8));
  sk.add('RightEye', 'Head', v(-eyeX, eyeY, headCentre.z + headR * 0.8));
  const armY = torsoTop - 0.02 * s;
  const upperArmLen = 0.27 * s;
  const lowerArmLen = 0.24 * s;
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    sk.add(`${side}Shoulder`, 'Chest', v(sign * 0.03 * s, armY));
    sk.add(`${side}UpperArm`, `${side}Shoulder`, v(sign * shoulderHalf, armY));
    sk.add(`${side}LowerArm`, `${side}UpperArm`, v(sign * (shoulderHalf + upperArmLen), armY));
    sk.add(`${side}Hand`, `${side}LowerArm`, v(sign * (shoulderHalf + upperArmLen + lowerArmLen), armY));
    sk.add(`${side}HandTip`, `${side}Hand`, v(sign * (shoulderHalf + upperArmLen + lowerArmLen + 0.08 * s), armY));
    const legX = sign * hipHalf * 0.62;
    sk.add(`${side}UpperLeg`, 'Hips', v(legX, hipsY - 0.03 * s));
    sk.add(`${side}LowerLeg`, `${side}UpperLeg`, v(legX, hipsY * 0.5));
    sk.add(`${side}Foot`, `${side}LowerLeg`, v(legX, 0.07 * s));
    sk.add(`${side}Toes`, `${side}Foot`, v(legX, 0.02 * s, 0.11 * s));
  }

  // Body physics bones: breasts, each a two-bone chain.
  const bust = range(p.bustSize, 0.25, 1.25);
  const bustR = 0.052 * s * bust;
  const bustY = lerp(spineY, chestY, 0.85);
  const bustZ = waistR * 0.95;
  const hasBust = p.bustSize > 0.04;
  if (hasBust) {
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      sk.add(`Breast_${side}`, 'Chest', v(sign * 0.055 * s, bustY + 0.01 * s, bustZ * 0.55));
      sk.add(`Breast_${side}_end`, `Breast_${side}`, v(sign * 0.06 * s, bustY - 0.01 * s, bustZ + bustR * 1.1));
    }
  }

  const parts = { skin: new Part(), eyes: new Part(), face: new Part(), hair: new Part(), top: new Part(), bottom: new Part() };
  const B = (name) => sk.index(name);

  // Torso: rings from the crotch to the shoulders.
  const torsoProfile = [
    [hipsY - 0.08 * s, hipHalf * 0.75, hipHalf * 0.55],
    [hipsY - 0.02 * s, hipHalf * 1.0, hipHalf * 0.72],
    [lerp(hipsY, spineY, 0.6), hipHalf * 0.95, hipHalf * 0.7],
    [spineY + 0.02 * s, waistR, waistR * 0.72],
    [lerp(spineY, chestY, 0.6), lerp(waistR, shoulderHalf * 0.75, 0.6), waistR * 0.8],
    [chestY, shoulderHalf * 0.8, waistR * 0.82],
    [torsoTop - 0.02 * s, shoulderHalf * 0.85, waistR * 0.7],
    [torsoTop + 0.005 * s, 0.05 * s, 0.045 * s],
  ];
  const torsoStops = [[hipsY - 0.02 * s, B('Hips')], [spineY, B('Spine')], [chestY, B('Chest')], [torsoTop + 0.01 * s, B('Neck')]];
  const torsoRings = (grow = 1, from = 0, to = torsoProfile.length) =>
    torsoProfile.slice(from, to).map(([y, rx, rz]) => ({
      center: v(0, y), rx: rx * grow, rz: rz * grow, weights: blend(torsoStops, y),
    }));
  parts.skin.tube(torsoRings(), 20, { capStart: true });
  // Neck and head
  parts.skin.tube([
    { center: v(0, torsoTop - 0.01 * s), rx: 0.04 * s, rz: 0.04 * s, weights: [[B('Neck'), 1]] },
    { center: v(0, torsoTop + neckLen + 0.02 * s), rx: 0.037 * s, rz: 0.037 * s, weights: [[B('Head'), 1]] },
  ], 12);
  parts.skin.ellipsoid(headCentre, v(headR * 0.92, headR, headR * 0.95), [[B('Head'), 1]], 14, 20);
  // Eyes: dark almond shapes with a coloured iris, just in front of the face.
  const eyeR = headR * range(p.eyeSize, 0.17, 0.27);
  for (const sign of [1, -1]) {
    const c = v(sign * eyeX, eyeY, headCentre.z + headR * 0.86);
    parts.eyes.ellipsoid(c, v(eyeR * 0.85, eyeR, eyeR * 0.35), [[B('Head'), 1]], 8, 12);
  }
  // Arms
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    const x0 = sign * (shoulderHalf - 0.02 * s);
    const xE = sign * (shoulderHalf + upperArmLen);
    const xH = sign * (shoulderHalf + upperArmLen + lowerArmLen);
    const stops = [[0, B(`${side}UpperArm`)], [0.53, B(`${side}LowerArm`)], [1, B(`${side}Hand`)]];
    const total = Math.abs(xH - x0);
    const ring = (x, r) => ({ center: v(x, armY), rx: r, rz: r, axis: 'x', weights: blend(stops, Math.abs(x - x0) / total) });
    parts.skin.tube([ring(x0, armR * 1.25), ring(lerp(x0, xE, 0.5), armR * 1.1), ring(xE, armR * 0.9),
      ring(lerp(xE, xH, 0.6), armR * 0.85), ring(xH, armR * 0.7)], 10, { capStart: true, flip: sign < 0 });
    parts.skin.ellipsoid(v(xH + sign * 0.045 * s, armY), v(0.05 * s, 0.022 * s, 0.04 * s), [[B(`${side}Hand`), 1]], 6, 10);
    // Legs
    const lx = sign * hipHalf * 0.62;
    const legStops = [[hipsY, B(`${side}UpperLeg`)], [hipsY * 0.5, B(`${side}LowerLeg`)], [0.07 * s, B(`${side}Foot`)]].reverse();
    const legRing = (y, r) => ({ center: v(lx, y), rx: r, rz: r, weights: blend(legStops, y) });
    parts.skin.tube([legRing(0.06 * s, thighR * 0.5), legRing(hipsY * 0.25, thighR * 0.62), legRing(hipsY * 0.5, thighR * 0.62),
      legRing(hipsY * 0.75, thighR * 0.92), legRing(hipsY - 0.02 * s, thighR * 1.05)], 12, { capStart: true });
    parts.skin.ellipsoid(v(lx, 0.035 * s, 0.035 * s), v(0.04 * s, 0.035 * s, 0.11 * s), [[B(`${side}Foot`), 1]], 6, 10);
  }
  // Face: brows and a mouth, the only detail on the base body.
  const faceZ = headCentre.z + headR * 0.9;
  for (const sign of [1, -1]) {
    const browY = eyeY + eyeR * 1.7;
    const pts = [-1, 0, 1].map((t) => v(sign * (eyeX + t * eyeR * 1.1),
      browY + (t === 0 ? eyeR * 0.25 : 0), headCentre.z + headR * (0.87 - 0.05 * Math.abs(t))));
    parts.face.ribbon(pts, [eyeR * 0.22, eyeR * 0.3, eyeR * 0.18], v(0, 1, 0), v(0, 0, 1), () => [[B('Head'), 1]]);
  }
  const mouthY = headCentre.y - headR * 0.5;
  parts.face.ellipsoid(v(0, mouthY, faceZ - headR * 0.12), v(headR * 0.16, headR * 0.03, headR * 0.03), [[B('Head'), 1]], 6, 10);
  // A soft nose bump in skin colour.
  parts.skin.ellipsoid(v(0, headCentre.y - headR * 0.18, faceZ - headR * 0.02), v(headR * 0.07, headR * 0.12, headR * 0.08), [[B('Head'), 1]], 6, 10);

  // Breasts, weighted to their physics bones so they move.
  for (const [side, sign] of hasBust ? [['L', 1], ['R', -1]] : []) {
    const c = v(sign * 0.06 * s, bustY, bustZ * 0.75 + bustR * 0.45);
    const root = sk.world(`Breast_${side}`);
    const tip = sk.world(`Breast_${side}_end`);
    const span = tip.distanceTo(root) || 1;
    parts.skin.ellipsoid(c, v(bustR, bustR * 0.95, bustR * 0.9), (pos) => {
      const t = Math.min(1, Math.max(0, pos.distanceTo(root) / span));
      return [[B('Chest'), 1 - t], [B(`Breast_${side}`), t]];
    }, 8, 12);
  }

  // Clothing: top
  if (p.top === 'shirt') {
    const end = Math.round(range(p.topLength, 3, 1));
    const rings = torsoRings(1.06, end, torsoProfile.length - 1);
    parts.top.tube(rings, 20);
    // Cloth over the bust: a slightly larger copy of each breast in the shirt's material,
    // weighted like the breast so it moves with it.
    for (const [side, sign] of hasBust ? [['L', 1], ['R', -1]] : []) {
      const c = v(sign * 0.06 * s, bustY, bustZ * 0.75 + bustR * 0.45);
      const root = sk.world(`Breast_${side}`);
      const tip = sk.world(`Breast_${side}_end`);
      const span = tip.distanceTo(root) || 1;
      parts.top.ellipsoid(c, v(bustR * 1.12, bustR * 1.08, bustR * 1.06), (pos) => {
        const t = Math.min(1, Math.max(0, pos.distanceTo(root) / span));
        return [[B('Chest'), 1 - t], [B(`Breast_${side}`), t]];
      }, 8, 12);
    }
    for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
      // Short sleeves: start at the shoulder joint so they turn with the arm instead of flapping.
      const x0 = sign * (shoulderHalf + 0.005 * s);
      const x1 = sign * (shoulderHalf + upperArmLen * 0.45);
      parts.top.tube([
        { center: v(x0, armY), rx: armR * 1.3, rz: armR * 1.3, axis: 'x', weights: [[B(`${side}UpperArm`), 1]] },
        { center: v(x1, armY), rx: armR * 1.2, rz: armR * 1.2, axis: 'x', weights: [[B(`${side}UpperArm`), 1]] },
      ], 10, { flip: sign < 0 });
    }
  }

  // Clothing: bottom
  const skirtChains = [];
  if (p.bottom === 'skirt') {
    const segments = 12;
    const joints = 3;
    const length = hipsY * range(p.bottomLength, 0.22, 0.75);
    const topY = spineY - 0.01 * s;
    const flare = 1.25 + 0.25 * (1 - p.bottomLength);
    // One bone chain per panel; the cloth between chains is weighted to its two neighbours.
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const dir = v(Math.sin(a), 0, Math.cos(a));
      const names = [];
      for (let j = 0; j <= joints; j++) {
        const t = j / joints;
        const r = lerp(1.0, flare, t);
        const pos = v(dir.x * hipHalf * 1.05 * r, lerp(topY, topY - length, t), dir.z * hipHalf * 0.8 * r);
        const name = `Skirt_${String(i).padStart(2, '0')}_${j}`;
        sk.add(name, j === 0 ? 'Hips' : names[j - 1], pos);
        names.push(name);
      }
      skirtChains.push(names);
    }
    const rows = joints * 3;
    const start = parts.bottom.positions.length / 3;
    const cols = segments * 3;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      for (let c = 0; c < cols; c++) {
        const a = (c / cols) * Math.PI * 2;
        const panel = Math.floor(c / 3);
        const f = (c % 3) / 3;
        const rad = lerp(1.0, flare, t);
        const pos = v(Math.sin(a) * hipHalf * 1.08 * rad, lerp(topY + 0.01 * s, topY - length, t), Math.cos(a) * hipHalf * 0.83 * rad);
        const jointF = t * joints;
        const j0 = Math.min(joints, Math.floor(jointF));
        const j1 = Math.min(joints, j0 + 1);
        const jt = jointF - j0;
        const w = [];
        for (const [chain, cw] of [[skirtChains[panel], 1 - f], [skirtChains[(panel + 1) % segments], f]]) {
          w.push([B(chain[j0]), cw * (1 - jt)], [B(chain[j1]), cw * jt]);
        }
        parts.bottom.vertex(pos, v(Math.sin(a), 0.2, Math.cos(a)).normalize(), t === 0 ? [[B('Hips'), 1]] : w);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = start + r * cols + c;
        const b = start + r * cols + ((c + 1) % cols);
        parts.bottom.quad(a, b, b + cols, a + cols);
        parts.bottom.quad(a, a + cols, b + cols, b); // inside face
      }
    }
  } else if (p.bottom !== 'none') {
    const legEnd = p.bottom === 'shorts' ? hipsY * range(p.bottomLength, 0.85, 0.65) : 0.09 * s;
    for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
      const lx = sign * hipHalf * 0.62;
      const stops = [[hipsY, B(`${side}UpperLeg`)], [hipsY * 0.5, B(`${side}LowerLeg`)], [0.07 * s, B(`${side}Foot`)]].reverse();
      const ys = [hipsY - 0.02 * s, lerp(hipsY, legEnd, 0.33), lerp(hipsY, legEnd, 0.66), legEnd];
      parts.bottom.tube(ys.map((y) => {
        const t = y / hipsY;
        const r = thighR * (t > 0.5 ? lerp(0.62, 1.05, (t - 0.5) * 2) : lerp(0.5, 0.62, t * 2)) * 1.12;
        return { center: v(lx, y), rx: r, rz: r, weights: blend(stops, y) };
      }), 12);
    }
    parts.bottom.tube(torsoRings(1.05, 0, 3), 20, { capStart: false });
  }

  // Hair: a cap over the head plus strands, each strand a bone chain.
  const hairChains = [];
  const withHair = p.hairStyle !== 'none';
  const volume = range(p.hairVolume, 0.95, 1.18);
  if (withHair) parts.hair.ellipsoid(v(headCentre.x, headCentre.y + headR * 0.05, headCentre.z - headR * 0.04),
    v(headR * 0.98 * volume, headR * 1.03 * volume, headR * 1.02 * volume), (pos) =>
      [[B('Head'), 1]], 12, 20,
    // Leave the face open: no cap in front below the hairline.
    (dir) => !(dir.z > 0.2 && dir.y < 0.45));
  const strand = (name, from, dir, length, width, joints = 4, sideAxis = v(1, 0, 0)) => {
    const names = [];
    const points = [];
    const widths = [];
    for (let j = 0; j <= joints; j++) {
      const t = j / joints;
      const pos = from.clone().addScaledVector(dir, length * t);
      // Let longer strands fall: bend towards -Y.
      pos.y -= length * 0.15 * t * t;
      const boneName = `${name}_${j}`;
      sk.add(boneName, j === 0 ? 'Head' : names[j - 1], pos);
      names.push(boneName);
      points.push(pos);
      widths.push(width * lerp(1, 0.45, t));
    }
    hairChains.push(names);
    const normal = sideAxis.clone().cross(dir).normalize();
    parts.hair.ribbon(points, widths, sideAxis, normal, (i) => [[B(names[i]), 1]]);
  };
  const lengthFactor = range(p.hairLength, 0.6, 1.5);
  const hTop = headCentre.y + headR * 0.55;
  // Bangs
  for (const x of withHair ? [-0.5, -0.17, 0.17, 0.5] : []) {
    strand(`Hair_Front_${x < 0 ? 'R' : 'L'}${Math.abs(x) > 0.3 ? 2 : 1}`,
      v(x * headR, hTop, headCentre.z + headR * 0.86 * volume), v(x * 0.15, -1, 0.35).normalize(),
      headR * 0.42, headR * 0.5, 2);
  }
  // Side locks
  for (const [side, sign] of withHair && p.hairStyle !== 'short' ? [['L', 1], ['R', -1]] : []) {
    strand(`Hair_Side_${side}`, v(sign * headR * 0.9 * volume, headCentre.y, headCentre.z + headR * 0.25),
      v(sign * 0.1, -1, 0.05).normalize(), headR * 1.4 * lengthFactor, headR * 0.45, 4, v(0, 0, 1));
  }
  // Back hair by style
  const backZ = headCentre.z - headR * 0.95 * volume;
  if (p.hairStyle === 'none') {
    // Bald base body.
  } else if (p.hairStyle === 'short') {
    for (const x of [-0.5, 0, 0.5]) {
      strand(`Hair_Back_${x < 0 ? 'R' : x > 0 ? 'L' : 'C'}`, v(x * headR, headCentre.y + headR * 0.2, backZ),
        v(x * 0.1, -1, -0.2).normalize(), headR * 0.55 * lengthFactor, headR * 0.8, 2);
    }
  } else if (p.hairStyle === 'bob' || p.hairStyle === 'long') {
    const len = (p.hairStyle === 'bob' ? 0.9 : 3.2) * headR * lengthFactor;
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      strand(`Hair_Back_${x < 0 ? 'R' : 'L'}${Math.abs(x) > 0.4 ? 2 : 1}`, v(x * headR, headCentre.y, backZ),
        v(x * 0.15, -1, -0.12).normalize(), len, headR * 0.7, p.hairStyle === 'bob' ? 3 : 5);
    }
  } else if (p.hairStyle === 'ponytail') {
    strand('Hair_Tail', v(0, headCentre.y + headR * 0.3, backZ - 0.01), v(0, -1, -0.25).normalize(),
      3.0 * headR * lengthFactor, headR * 0.6, 5);
  } else {
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      strand(`Hair_Twin_${side}`, v(sign * headR * 0.8, headCentre.y + headR * 0.4, backZ + headR * 0.4),
        v(sign * 0.35, -1, -0.15).normalize(), 3.0 * headR * lengthFactor, headR * 0.55, 5, v(0, 0, 1));
    }
  }

  // Assemble one skinned mesh with a material per part.
  const materialOf = {
    skin: new THREE.MeshStandardMaterial({ name: 'Skin', color: p.skinColor, roughness: 0.75 }),
    eyes: new THREE.MeshStandardMaterial({ name: 'Eyes', color: p.eyeColor, roughness: 0.3 }),
    face: new THREE.MeshStandardMaterial({ name: 'Face', color: new THREE.Color(p.hairColor).lerp(new THREE.Color('#5a3030'), 0.4), roughness: 0.8 }),
    hair: new THREE.MeshStandardMaterial({ name: 'Hair', color: p.hairColor, roughness: 0.6, side: THREE.DoubleSide }),
    top: new THREE.MeshStandardMaterial({ name: 'Top', color: p.topColor, roughness: 0.85 }),
    bottom: new THREE.MeshStandardMaterial({ name: 'Bottom', color: p.bottomColor, roughness: 0.85, side: THREE.DoubleSide }),
  };
  const geometry = new THREE.BufferGeometry();
  const all = { positions: [], normals: [], skinIndex: [], skinWeight: [], indices: [] };
  const materials = [];
  for (const [key, part] of Object.entries(parts)) {
    if (part.indices.length === 0) continue;
    const base = all.positions.length / 3;
    const start = all.indices.length;
    all.positions.push(...part.positions);
    all.normals.push(...part.normals);
    all.skinIndex.push(...part.skinIndex);
    all.skinWeight.push(...part.skinWeight);
    all.indices.push(...part.indices.map((i) => i + base));
    geometry.addGroup(start, part.indices.length, materials.length);
    materials.push(materialOf[key]);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(all.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(all.normals, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(all.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(all.skinWeight, 4));
  geometry.setIndex(all.indices);

  const mesh = new THREE.SkinnedMesh(geometry, materials);
  mesh.name = 'Body';
  const root = sk.bones[0];
  const group = new THREE.Group();
  group.name = 'Character';
  group.add(root);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(sk.bones));

  return {
    group,
    params: p,
    chains: { hair: hairChains, clothing: skirtChains, body: hasBust ? [['Breast_L', 'Breast_L_end'], ['Breast_R', 'Breast_R_end']] : [] },
    stats: { height, bones: sk.bones.length, vertices: all.positions.length / 3 },
  };
}

/** The character as GLB bytes. */
export async function exportCharacterGlb(params) {
  const { group } = buildCharacter(params);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true, onlyVisible: true });
  return new Uint8Array(result);
}

/** Per-kind stiffness/softness defaults coming from the template's sliders. */
export function templatePhysicsTuning(params) {
  const p = sanitiseParams(params);
  return {
    hair: { stiffness: range(p.hairSoftness, 1.6, 0.5), drag: range(p.hairSoftness, 0.55, 0.3) },
    clothing: { stiffness: range(p.clothingSoftness, 1.5, 0.4), drag: range(p.clothingSoftness, 0.6, 0.35) },
    body: { stiffness: range(p.bustSoftness, 3.0, 1.0), drag: range(p.bustSoftness, 0.7, 0.45) },
  };
}
