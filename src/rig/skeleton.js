// The basic skeleton animations are authored on.
//
// Every model the studio opens (PMX, PMD, VRM, GLB, glTF) is mapped onto one standard humanoid
// skeleton that uses MMD bone names, because that is what the mod plays: VMD motions keyed by MMD
// bone names, retargeted by the engine onto non-MMD rigs. An animation made on this skeleton
// therefore works for every model the mod can animate.
//
// STATUS: groundwork for the animation editor. Not wired into the UI yet (see animation/editor.js).

import * as THREE from 'three';
import { VRM_TO_MMD } from '../humanoid.js';

/**
 * The standard bones: [MMD name, parent MMD name, humanoid name or null, rest position].
 * Rest positions are in MMD units for a 20-unit-tall character in the MMD A-pose, MMD axes
 * (left-handed, +Y up, the character faces -Z), as most PMX models are built.
 */
export const STANDARD_BONES = [
  ['全ての親', null, null, [0, 0, 0]],
  ['センター', '全ての親', null, [0, 8.0, 0]],
  ['グルーブ', 'センター', null, [0, 8.2, 0]],
  ['下半身', 'グルーブ', 'hips', [0, 11.4, 0.2]],
  ['上半身', 'グルーブ', 'spine', [0, 11.6, 0.2]],
  ['上半身2', '上半身', 'chest', [0, 13.0, 0.2]],
  ['首', '上半身2', 'neck', [0, 16.0, 0.4]],
  ['頭', '首', 'head', [0, 16.8, 0.2]],
  ['両目', '頭', null, [0, 18.2, -1.0]],
  ['左目', '頭', 'leftEye', [0.6, 18.2, -1.0]],
  ['右目', '頭', 'rightEye', [-0.6, 18.2, -1.0]],
  ['左肩', '上半身2', 'leftShoulder', [0.4, 15.6, 0.4]],
  ['左腕', '左肩', 'leftUpperArm', [1.4, 15.4, 0.6]],
  ['左ひじ', '左腕', 'leftLowerArm', [3.6, 13.8, 0.8]],
  ['左手首', '左ひじ', 'leftHand', [5.6, 12.4, 0.6]],
  ['右肩', '上半身2', 'rightShoulder', [-0.4, 15.6, 0.4]],
  ['右腕', '右肩', 'rightUpperArm', [-1.4, 15.4, 0.6]],
  ['右ひじ', '右腕', 'rightLowerArm', [-3.6, 13.8, 0.8]],
  ['右手首', '右ひじ', 'rightHand', [-5.6, 12.4, 0.6]],
  ['左足', '下半身', 'leftUpperLeg', [1.0, 10.6, 0.2]],
  ['左ひざ', '左足', 'leftLowerLeg', [1.0, 5.8, 0.0]],
  ['左足首', '左ひざ', 'leftFoot', [1.0, 1.2, 0.4]],
  ['左つま先', '左足首', 'leftToes', [1.0, 0.2, -1.4]],
  ['右足', '下半身', 'rightUpperLeg', [-1.0, 10.6, 0.2]],
  ['右ひざ', '右足', 'rightLowerLeg', [-1.0, 5.8, 0.0]],
  ['右足首', '右ひざ', 'rightFoot', [-1.0, 1.2, 0.4]],
  ['右つま先', '右足首', 'rightToes', [-1.0, 0.2, -1.4]],
  // Leg IK targets: the engine solves the legs towards these when they are keyed.
  ['左足ＩＫ', '全ての親', null, [1.0, 1.2, 0.4]],
  ['右足ＩＫ', '全ての親', null, [-1.0, 1.2, 0.4]],
];

/** Fingers, parented to the hands; positions are filled in relative to the hand. */
const FINGERS = ['親指０', '親指１', '親指２', '人指１', '人指２', '人指３', '中指１', '中指２', '中指３',
  '薬指１', '薬指２', '薬指３', '小指１', '小指２', '小指３'];

export const MMD_TO_HUMANOID = Object.fromEntries(Object.entries(VRM_TO_MMD).map(([h, m]) => [m, h]));

/** Bones whose translation is keyed in a VMD (all others are rotation only). */
export const TRANSLATING_BONES = new Set(['全ての親', 'センター', 'グルーブ', '左足ＩＫ', '右足ＩＫ']);

/** All standard bone names, fingers included, parents before children. */
export function standardBoneNames({ fingers = true } = {}) {
  const names = STANDARD_BONES.map(([name]) => name);
  if (fingers) for (const side of ['左', '右']) for (const f of FINGERS) names.push(side + f);
  return names;
}

/**
 * Builds the standard skeleton as THREE.Bones in MMD space, scaled to `height` MMD units.
 * Returns {root, bones: Map<name, THREE.Bone>}.
 */
export function buildStandardSkeleton(height = 20) {
  const k = height / 20;
  const bones = new Map();
  const world = new Map();
  for (const [name, parent, , rest] of STANDARD_BONES) {
    const bone = new THREE.Bone();
    bone.name = name;
    const position = new THREE.Vector3(...rest).multiplyScalar(k);
    world.set(name, position);
    if (parent) {
      bone.position.copy(position).sub(world.get(parent));
      bones.get(parent).add(bone);
    } else {
      bone.position.copy(position);
    }
    bones.set(name, bone);
  }
  // Fingers: a short fan in front of each wrist.
  for (const [side, sign] of [['左', 1], ['右', -1]]) {
    const hand = world.get(`${side}手首`);
    FINGERS.forEach((finger, i) => {
      const digit = Math.floor(i / 3);
      const joint = i % 3;
      const parentName = joint === 0 ? `${side}手首` : side + FINGERS[i - 1];
      const position = hand.clone().add(new THREE.Vector3(sign * (0.5 + joint * 0.35), -0.3 - joint * 0.25, -0.5 + digit * 0.25).multiplyScalar(k));
      const bone = new THREE.Bone();
      bone.name = side + finger;
      bone.position.copy(position).sub(world.get(parentName));
      bones.get(parentName).add(bone);
      world.set(bone.name, position);
      bones.set(bone.name, bone);
    });
  }
  return { root: bones.get('全ての親'), bones };
}

/**
 * Maps the standard skeleton onto a loaded model: standard MMD name → the model's own bone.
 * PMX/PMD models are matched by bone name; other models through their humanoid mapping.
 * Bones the model lacks are left out (the editor keys them only on the standard skeleton).
 */
export function fitToModel(model) {
  const map = new Map();
  if (model.kind === 'mmd') {
    const byName = new Map(model.mesh.skeleton.bones.map((b) => [b.name, b]));
    for (const name of standardBoneNames()) if (byName.has(name)) map.set(name, byName.get(name));
    return map;
  }
  const humanoid = model.humanoid ?? new Map();
  for (const [humanoidName, bone] of humanoid) {
    const mmd = VRM_TO_MMD[humanoidName];
    if (mmd) map.set(mmd, bone);
  }
  return map;
}

/**
 * A visible stick figure of a skeleton, for picking and posing bones.
 * TODO(animation editor): bone picking, rotation gizmo, highlighting the selected bone.
 */
export class SkeletonView {
  constructor(root) {
    this.helper = new THREE.SkeletonHelper(root);
    this.helper.material.depthTest = false;
    this.helper.renderOrder = 10;
  }

  addTo(scene) {
    scene.add(this.helper);
  }

  dispose() {
    this.helper.removeFromParent();
    this.helper.dispose?.();
  }
}
