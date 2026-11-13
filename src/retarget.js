// Plays MMD motions (VMD) on humanoid models that are not MMD models (VRM, plain glTF), the way the mod
// does it in rust_engine: VMD rotations are applied in a world-aligned frame per bone, the T-pose arms are
// turned down into the A-pose MMD motions expect, and the legs follow the foot IK bones.
import * as THREE from 'three';
import { VRM_TO_MMD } from './humanoid.js';

const FPS = 30;
const ARM_REST_ANGLE = THREE.MathUtils.degToRad(35); // rust_engine vrm_skeleton.rs ARM_REST_ANGLE_DEG

/** Groups VMD keyframes by bone name, sorted by frame. */
export function tracksFromVmd(vmd) {
  const tracks = new Map();
  for (const m of vmd.motions) {
    if (!tracks.has(m.boneName)) tracks.set(m.boneName, []);
    tracks.get(m.boneName).push(m);
  }
  let lastFrame = 0;
  for (const keys of tracks.values()) {
    keys.sort((a, b) => a.frameNum - b.frameNum);
    lastFrame = Math.max(lastFrame, keys[keys.length - 1].frameNum);
  }
  return { tracks, duration: lastFrame / FPS };
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Linear sample of one bone track at a frame: {position: Vector3, rotation: Quaternion} or null. */
function sample(keys, frame, outPosition, outRotation) {
  if (!keys || keys.length === 0) return false;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].frameNum <= frame) i++;
  const k0 = keys[i];
  const k1 = keys[Math.min(i + 1, keys.length - 1)];
  const span = k1.frameNum - k0.frameNum;
  const t = span > 0 ? THREE.MathUtils.clamp((frame - k0.frameNum) / span, 0, 1) : 0;
  outPosition.fromArray(k0.position).lerp(_v.fromArray(k1.position), t);
  _qa.fromArray(k0.rotation);
  _qb.fromArray(k1.rotation);
  outRotation.slerpQuaternions(_qa, _qb, t);
  return true;
}

/**
 * Drives the raw bones of a humanoid from "normalised" rotations: a rotation in a frame whose axes are the
 * model's axes (like a VRM normalised rig). raw.local = parentRestWorld⁻¹ · normalised · parentRestWorld · rawRestLocal.
 */
class NormalisedBone {
  constructor(bone) {
    this.bone = bone;
    this.restLocal = bone.quaternion.clone();
    this.restPosition = bone.position.clone();
    this.parentRestWorld = new THREE.Quaternion();
    bone.parent?.getWorldQuaternion(this.parentRestWorld);
    this.parentRestWorldInverse = this.parentRestWorld.clone().invert();
  }

  setRotation(normalised) {
    this.bone.quaternion
      .copy(this.parentRestWorldInverse)
      .multiply(normalised)
      .multiply(this.parentRestWorld)
      .multiply(this.restLocal);
  }

  reset() {
    this.bone.quaternion.copy(this.restLocal);
    this.bone.position.copy(this.restPosition);
  }
}

export class HumanoidRetarget {
  /**
   * @param {THREE.Object3D} root the model root
   * @param {Map<string, THREE.Bone>} humanoid humanoid bone name → bone
   * @param {number} unit size of one MMD unit in scene units
   */
  constructor(root, humanoid, unit) {
    this.root = root;
    this.unit = unit;
    root.updateMatrixWorld(true);
    this.bones = new Map();
    for (const [name, bone] of humanoid) this.bones.set(name, new NormalisedBone(bone));
    this.restWorld = new Map();
    for (const [name, bone] of humanoid) this.restWorld.set(name, bone.getWorldPosition(new THREE.Vector3()));

    // A-pose correction of the upper arms, and the accumulated correction of their descendants.
    this.restCorrection = new Map();
    this.parentCorrection = new Map();
    for (const side of ['left', 'right']) {
      const upper = this.restWorld.get(`${side}UpperArm`);
      const lower = this.restWorld.get(`${side}LowerArm`);
      if (!upper || !lower) continue;
      const diff = lower.clone().sub(upper);
      const horizontal = Math.hypot(diff.x, diff.z);
      if (horizontal < 1e-4) continue;
      const correction = -ARM_REST_ANGLE - Math.atan2(diff.y, horizontal);
      if (Math.abs(correction) < THREE.MathUtils.degToRad(3)) continue;
      // The model faces +Z, so its left arm points to +X.
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side === 'left' ? correction : -correction);
      this.restCorrection.set(`${side}UpperArm`, rotation);
      for (const child of [`${side}LowerArm`, `${side}Hand`]) this.parentCorrection.set(child, rotation);
      for (const [name] of this.bones) if (name.startsWith(side) && /(Thumb|Index|Middle|Ring|Little)/.test(name)) this.parentCorrection.set(name, rotation);
    }
    this.tracks = null;
    this.duration = 0;
    this.time = 0;
    this._position = new THREE.Vector3();
    this._rotation = new THREE.Quaternion();
    this._local = new THREE.Quaternion();
  }

  setMotion(vmd) {
    const { tracks, duration } = vmdTracks(vmd);
    this.tracks = tracks;
    this.duration = duration;
    this.time = 0;
  }

  clear() {
    this.tracks = null;
    for (const bone of this.bones.values()) bone.reset();
    this.applyRestCorrection();
  }

  /** Turns the T-pose arms down into the A-pose, as the mod does even without a motion. */
  applyRestCorrection() {
    for (const [name, rotation] of this.restCorrection) this.bones.get(name)?.setRotation(rotation);
    this.root.updateMatrixWorld(true);
  }

  update(delta) {
    if (!this.tracks) return;
    this.time = this.duration > 0 ? (this.time + delta) % this.duration : 0;
    const frame = this.time * FPS;

    for (const [name, bone] of this.bones) {
      const mmdName = VRM_TO_MMD[name];
      const has = sample(this.tracks.get(mmdName), frame, this._position, this._rotation);
      const animation = has ? this._rotation : new THREE.Quaternion();
      const p = this.parentCorrection.get(name);
      const rest = this.restCorrection.get(name);
      this._local.copy(animation);
      if (p) this._local.premultiply(p.clone().invert()).multiply(p);
      if (rest) this._local.multiply(rest);
      bone.setRotation(this._local);
      if (name === 'hips') bone.bone.position.copy(bone.restPosition);
    }

    // Centre / groove translation moves the hips.
    const offset = new THREE.Vector3();
    for (const name of ['センター', 'グルーブ', '全ての親']) {
      if (sample(this.tracks.get(name), frame, this._position, this._rotation)) offset.add(this._position);
    }
    const hips = this.bones.get('hips');
    if (hips && offset.lengthSq() > 0) {
      const world = this.restWorld.get('hips').clone().add(offset.multiplyScalar(this.unit));
      const parent = hips.bone.parent;
      parent.updateMatrixWorld(true);
      hips.bone.position.copy(parent.worldToLocal(world));
    }
    this.root.updateMatrixWorld(true);

    for (const side of ['left', 'right']) {
      const ik = this.tracks.get(side === 'left' ? '左足ＩＫ' : '右足ＩＫ');
      if (!sample(ik, frame, this._position, this._rotation)) continue;
      const target = this.restWorld.get(`${side}Foot`).clone().addScaledVector(this._position, this.unit);
      this.solveLeg(side, target);
    }
  }

  /** Two-bone IK: bends the knee to the distance of the target, then swings the thigh towards it. */
  solveLeg(side, targetModel) {
    const upper = this.bones.get(`${side}UpperLeg`)?.bone;
    const lower = this.bones.get(`${side}LowerLeg`)?.bone;
    const foot = this.bones.get(`${side}Foot`)?.bone;
    if (!upper || !lower || !foot) return;
    const target = this.root.localToWorld(targetModel.clone());
    const a = upper.getWorldPosition(new THREE.Vector3());
    const b = lower.getWorldPosition(new THREE.Vector3());
    const c = foot.getWorldPosition(new THREE.Vector3());
    const lenUpper = a.distanceTo(b);
    const lenLower = b.distanceTo(c);
    const reach = THREE.MathUtils.clamp(a.distanceTo(target), Math.abs(lenUpper - lenLower) + 1e-4, lenUpper + lenLower - 1e-4);

    // Knee: interior angle from the law of cosines; bend about the axis across the leg.
    const ba = a.clone().sub(b);
    const bc = c.clone().sub(b);
    const current = ba.angleTo(bc);
    const wanted = Math.acos(THREE.MathUtils.clamp((lenUpper ** 2 + lenLower ** 2 - reach ** 2) / (2 * lenUpper * lenLower), -1, 1));
    let axis = new THREE.Vector3().crossVectors(bc, ba);
    if (axis.lengthSq() < 1e-10) {
      // Straight leg: bend the knee forwards (model +Z), i.e. about the model's sideways axis.
      axis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    }
    axis.normalize();
    rotateWorld(lower, new THREE.Quaternion().setFromAxisAngle(axis, current - wanted));
    this.root.updateMatrixWorld(true);

    // Thigh: swing so the ankle points at the target.
    const c2 = foot.getWorldPosition(new THREE.Vector3());
    const from = c2.sub(a).normalize();
    const to = target.clone().sub(a).normalize();
    rotateWorld(upper, new THREE.Quaternion().setFromUnitVectors(from, to));
    this.root.updateMatrixWorld(true);
  }
}

/** Applies a world-space rotation to a bone, keeping its parent unchanged. */
function rotateWorld(bone, worldRotation) {
  const parentWorld = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorld);
  const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentWorld.invert().multiply(worldRotation).multiply(boneWorld));
  bone.updateMatrixWorld(true);
}

function vmdTracks(vmd) {
  return tracksFromVmd(vmd);
}
