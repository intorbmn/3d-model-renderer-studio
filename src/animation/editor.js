// Animation editor: pose the standard skeleton, key it on a timeline, and save the result for
// the mod, either inside a card or as a separate VMD for the mod's folders.
//
// STATUS: groundwork only. The data model (clip.js), the VMD writer (vmd-writer.js), the standard
// skeleton (../rig/skeleton.js) and where files go (below) are in place and tested; the editor UI
// (timeline, bone picking, rotation gizmo) is not built yet, and nothing here is wired into main.js.
//
// Where the mod looks for animations (AnimationLibrary.java), for a slot such as "walk":
//   1. a file mapped in the model folder's animations.json,
//   2. <model folder>/walk.vmd,
//   3. 3d-skin/CustomAnim/walk.vmd (every model),
//   4. 3d-skin/DefaultAnim/walk.vmd (the mod's defaults).
// A card's model folder is where its model file sits, so a card carries its own animations by
// packing "<model folder>/<slot>.vmd" next to the model; the mod needs no change for that.

import * as THREE from 'three';
import { AnimationClipData, FPS, MOD_SLOTS } from './clip.js';
import { writeVmd } from './vmd-writer.js';
import { buildStandardSkeleton, fitToModel, standardBoneNames, TRANSLATING_BONES } from '../rig/skeleton.js';

export const ANIMATION_EDITOR_ENABLED = false;

/** Files to pack into a card: {slot: clip} → [{path, data}] next to the model file. */
export function cardAnimationFiles(clipsBySlot, modelPath) {
  const dir = modelPath.includes('/') ? modelPath.slice(0, modelPath.lastIndexOf('/') + 1) : '';
  return Object.entries(clipsBySlot)
    .filter(([slot]) => isValidSlot(slot))
    .map(([slot, clip]) => ({ path: `${dir}${slot}.vmd`, data: writeVmd(clip) }));
}

/** Where to put a separate VMD in the game folder (relative to .minecraft). */
export function modFolderTargets(slot, modelFolderName = null) {
  const file = `${slot}.vmd`;
  const targets = [{ scope: 'all models', path: `3d-skin/CustomAnim/${file}` }];
  if (modelFolderName) targets.unshift({ scope: 'one model', path: `3d-skin/EntityPlayer/${modelFolderName}/${file}` });
  return targets;
}

/** A slot is one of the mod's names, or a custom action name (letters, digits, _ - .). */
export function isValidSlot(slot) {
  return MOD_SLOTS.includes(slot) || /^[A-Za-z0-9_.-]{1,64}$/.test(slot);
}

// three.js shows MMD models right-handed: the loader mirrors Z. Keys are stored in MMD space.
const toMmdRotation = (q) => [-q.x, -q.y, q.z, q.w];
const toMmdPosition = (p) => [p.x, p.y, -p.z];
const fromMmdRotation = (r) => new THREE.Quaternion(-r[0], -r[1], r[2], r[3]);
const fromMmdPosition = (p) => new THREE.Vector3(p[0], p[1], -p[2]);

export class AnimationEditor {
  constructor() {
    this.clip = new AnimationClipData();
    this.frame = 0;
    this.playing = false;
    this.selectedBone = null;
    this.skeleton = null; // the standard skeleton, in three.js space
    this.targets = null; // standard name → the model's bone
    this.restRotations = new Map();
  }

  /**
   * Prepares the editor for a loaded model: builds the standard skeleton and maps it onto the
   * model's bones. TODO: scale the standard skeleton to the model's proportions.
   */
  attach(model) {
    this.model = model;
    this.skeleton = buildStandardSkeleton(20);
    this.targets = fitToModel(model);
    this.restRotations = new Map([...this.targets].map(([name, bone]) => [name, bone.quaternion.clone()]));
  }

  /** Bones that can be keyed on this model. */
  keyableBones() {
    return standardBoneNames().filter((name) => this.targets?.has(name) || TRANSLATING_BONES.has(name));
  }

  /**
   * Keys the current pose of `boneName` at the current frame.
   * TODO: for non-MMD models, turn the model bone's rotation into the standard bone's frame
   * (the inverse of retarget.js), as the engine does when it plays the VMD.
   */
  keyBone(boneName) {
    const bone = this.targets?.get(boneName);
    if (!bone) return;
    const rest = this.restRotations.get(boneName) ?? new THREE.Quaternion();
    const delta = rest.clone().invert().multiply(bone.quaternion);
    const position = TRANSLATING_BONES.has(boneName) ? toMmdPosition(bone.position) : [0, 0, 0];
    this.clip.setBoneKey(boneName, this.frame, toMmdRotation(delta), position);
  }

  /** Puts the model in the clip's pose at the current frame (preview). TODO: non-MMD models. */
  applyFrame() {
    for (const [name, bone] of this.targets ?? []) {
      if (!this.clip.bones.has(name)) continue;
      const { rotation, position } = this.clip.sampleBone(name, this.frame);
      const rest = this.restRotations.get(name) ?? new THREE.Quaternion();
      bone.quaternion.copy(rest).multiply(fromMmdRotation(rotation));
      if (TRANSLATING_BONES.has(name)) bone.position.copy(fromMmdPosition(position));
    }
  }

  setFrame(frame) {
    this.frame = Math.max(0, Math.round(frame));
    this.applyFrame();
  }

  /** Advances playback. TODO: hook into Viewer.afterAnimate once the UI exists. */
  update(delta) {
    if (!this.playing) return;
    const end = Math.max(1, this.clip.duration);
    const next = this.frame + delta * FPS;
    this.frame = this.clip.loop ? next % end : Math.min(next, end);
    this.applyFrame();
  }

  exportVmd(modelName = '') {
    return writeVmd(this.clip, modelName);
  }

  // TODO(animation editor UI): timeline with keys per bone, bone list and picking on the skeleton
  // view, rotation gizmo (TransformControls), copy/paste and mirror pose, undo, slot picker,
  // "add to card" and "download VMD" buttons, loading an existing VMD to edit (AnimationClipData.fromVmd).
}
