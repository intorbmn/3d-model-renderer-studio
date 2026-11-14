// Clothing, hair, shoes and accessories the user imports and puts on the character.
//
// A part is a glTF/GLB made for the same skeleton as the character (for example another piece
// exported with KKBP from the same game, or a piece rigged in Blender to the character's bones).
// Its skinned meshes are bound to the character's bones by name; bones the character does not
// have (a skirt's or a ponytail's own bones) are added under their nearest matching parent, so the
// studio's physics finds them. Rigid meshes (a hat, glasses) follow the bone their node hangs from.
//
// When a card is exported with parts on, the character and its parts are written as one GLB, so
// the mod loads them like any other model.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export const SLOTS = ['hair', 'top', 'bottom', 'shoes', 'socks', 'accessory'];

/** Base materials that a part of each slot replaces (hidden when such a part is put on). */
const REPLACES = {
  hair: /hair/i,
  top: /top|shirt|jacket|coat|blouse|bra|inner/i,
  bottom: /bot|skirt|pants|denim|shorts|trouser|panties/i,
  shoes: /shoe|boot|sandal/i,
  socks: /sock|stocking|tights/i,
  accessory: /^$/,
};

let nextId = 1;

const nameOf = (model, object) => object.userData.originalName ?? model.originalName?.(object) ?? object.name;

function boneMap(model) {
  const map = new Map();
  model.root.traverse((o) => {
    if (o.isBone && !map.has(nameOf(model, o))) map.set(nameOf(model, o), o);
  });
  return map;
}

/** Materials of the character that a part in `slot` takes the place of. */
export function replacedMaterials(model, slot, partMaterials = new Set()) {
  const pattern = REPLACES[slot] ?? REPLACES.accessory;
  const out = [];
  model.root.traverse((o) => {
    if (!o.isMesh || o.userData.partId) return;
    for (const m of [].concat(o.material)) if (m && pattern.test(m.name) && !partMaterials.has(m.name)) out.push(m.name);
  });
  return [...new Set(out)];
}

/**
 * Puts the meshes of `gltf` (a loaded part) on `model`. Returns the part record:
 * {id, slot, name, meshes, addedBones, materials}.
 */
export function attachPart(model, gltf, slot, name) {
  const id = nextId++;
  const bones = boneMap(model);
  const target = model.gltf?.scene ?? model.root;
  target.updateMatrixWorld(true);
  gltf.scene.updateMatrixWorld(true);
  const addedBones = [];
  const meshes = [];

  // The part's bones, matched by name or added to the character.
  const mapped = new Map();
  const mapBone = (bone) => {
    if (mapped.has(bone)) return mapped.get(bone);
    const own = bones.get(nameOf(model, bone));
    if (own) {
      mapped.set(bone, own);
      return own;
    }
    // Not on the character: add it under the nearest parent that is (or under the scene).
    const parent = bone.parent?.isBone ? mapBone(bone.parent) : null;
    const copy = new THREE.Bone();
    copy.name = bone.name;
    copy.userData.originalName = nameOf(model, bone);
    copy.userData.partId = id;
    const holder = parent ?? target;
    // Same place in the world as in the part file (both are in the character's space).
    const local = holder.matrixWorld.clone().invert().multiply(bone.matrixWorld);
    local.decompose(copy.position, copy.quaternion, copy.scale);
    holder.add(copy);
    copy.updateMatrixWorld(true);
    model.bindPose?.set(copy, { p: copy.position.clone(), q: copy.quaternion.clone(), s: copy.scale.clone() });
    bones.set(copy.userData.originalName, copy);
    addedBones.push(copy);
    mapped.set(bone, copy);
    return copy;
  };

  const sources = [];
  gltf.scene.traverse((o) => { if (o.isMesh) sources.push(o); });
  for (const source of sources) {
    let mesh;
    if (source.isSkinnedMesh) {
      const skeletonBones = source.skeleton.bones.map(mapBone);
      mesh = new THREE.SkinnedMesh(source.geometry, source.material);
      mesh.morphTargetDictionary = source.morphTargetDictionary;
      mesh.morphTargetInfluences = source.morphTargetInfluences?.slice();
      target.add(mesh);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(skeletonBones, source.skeleton.boneInverses.map((m) => m.clone())), source.bindMatrix.clone());
    } else {
      // A rigid piece follows the bone its node hangs from, or the character's root.
      let holder = target;
      for (let p = source.parent; p; p = p.parent) {
        if (p.isBone) {
          holder = mapBone(p);
          break;
        }
      }
      mesh = new THREE.Mesh(source.geometry, source.material);
      const local = holder.matrixWorld.clone().invert().multiply(source.matrixWorld);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      holder.add(mesh);
    }
    mesh.name = source.name;
    mesh.userData.originalName = source.userData.originalName ?? source.name;
    mesh.userData.partId = id;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  const materials = [...new Set(meshes.flatMap((m) => [].concat(m.material).map((x) => x?.name).filter(Boolean)))];
  return { id, slot, name, meshes, addedBones, materials };
}

/** Takes a part off again. */
export function detachPart(model, part) {
  for (const mesh of part.meshes) {
    mesh.removeFromParent();
    if (mesh.isSkinnedMesh) mesh.skeleton.dispose?.();
  }
  for (const bone of part.addedBones) {
    bone.removeFromParent();
    model.bindPose?.delete(bone);
  }
}

/**
 * The character with its parts as one GLB, in the file's own rest pose (no motion, no physics, no
 * maker edits: those are stored beside it in the card) and with the original node names.
 */
export async function exportCombined(model) {
  const scene = model.gltf?.scene ?? model.root;
  const saved = [];
  scene.traverse((o) => {
    saved.push([o, o.name, o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.matrixAutoUpdate]);
    o.name = nameOf(model, o);
    o.matrixAutoUpdate = true;
    const rest = model.bindPose?.get(o);
    if (rest) {
      o.position.copy(rest.p);
      o.quaternion.copy(rest.q);
      o.scale.copy(rest.s);
    }
  });
  // Skip the studio's own helpers (spring colliders) hanging from bones.
  const helpers = [];
  scene.traverse((o) => { if (o.type === 'VRMSpringBoneCollider' || o.isVRMSpringBoneCollider) helpers.push(o); });
  const parents = helpers.map((h) => [h, h.parent]);
  for (const h of helpers) h.removeFromParent();
  try {
    scene.updateMatrixWorld(true);
    const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
    return new Uint8Array(result);
  } finally {
    for (const [h, parent] of parents) parent.add(h);
    for (const [o, name, p, q, s, auto] of saved) {
      o.name = name;
      o.position.copy(p);
      o.quaternion.copy(q);
      o.scale.copy(s);
      o.matrixAutoUpdate = auto;
    }
    scene.updateMatrixWorld(true);
  }
}
