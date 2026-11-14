// The character's outfit: hair, tops, bottoms, underwear, socks, shoes and accessories.
//
// Pieces come from the character's own file (ILLGAMES exports carry the outfit they were exported
// with) and from outfit files the user imports: GLB/glTF made for the same skeleton, for example a
// KKBP export made with --only-outfit. An imported file is split into its pieces by material name,
// and each piece goes to its slot, in place of what the character wore there.
//
// Every skinned mesh of the character, imported pieces included, shares one skeleton: the
// character's, extended with the bones a piece brings along (a skirt's or a ponytail's own). The
// pieces' vertices are re-expressed in the character's bind pose, so a card's model has one skin
// and the mod (which reads the first skin) drives the outfit with the same bones and physics as
// the body.
//
// Imported pieces are tagged in the node extras ("outfitSlot", "outfitName", "outfitPart"), so a
// card opened again shows them in their slots.

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export const SLOTS = ['hair', 'top', 'innerTop', 'bottom', 'underwear', 'socks', 'shoes', 'accessory'];

// Order matters: the first match wins ("shoes_inner" is shoes, "bra" before "top").
const SLOT_PATTERNS = [
  ['hair', /hair|kami|髪/i],
  ['shoes', /shoe|boot|sandal|sneaker|loafer|靴/i],
  ['socks', /sock|panst|stocking|tights|legwear|靴下/i],
  ['innerTop', /(^|[_ ])bra([_ \d]|$)|inner|camisole|undershirt|sports_?bra|下着上/i],
  ['bottom', /(^|[_ ])bot([_ \d]|$)|skirt|pants|trouser|denim|jeans|スカート/i],
  ['underwear', /(^|[_ ])shorts([_ \d]|$)|panties|pantsu|underwear|briefs|lingerie|下着/i],
  ['top', /(^|[_ ])top([_ \d]|$)|shirt|jacket|coat|blouse|sweater|hoodie|dress|uniform|vest|服/i],
  ['accessory', /glove|acc|ribbon|hat|cap|glasses|earring|necklace/i],
];

/** The slot a material (or mesh) name belongs to, or null for the body itself. */
export function slotOf(name) {
  for (const [slot, pattern] of SLOT_PATTERNS) if (pattern.test(name)) return slot;
  return null;
}

let nextId = 1;

const nameOf = (model, object) => object.userData.originalName ?? model.originalName?.(object) ?? object.name;

function skinnedMeshes(root) {
  const out = [];
  root.traverse((o) => { if (o.isSkinnedMesh) out.push(o); });
  return out;
}

/**
 * The skeleton every mesh of the character uses (the one with the most bones), and the bind
 * matrix that goes with it. Body meshes on another skeleton with the same bones are moved onto it.
 */
function masterSkeleton(model) {
  if (model.master) return model.master;
  const meshes = skinnedMeshes(model.root);
  if (meshes.length === 0) return null;
  const main = meshes.reduce((a, b) => (b.skeleton.bones.length > a.skeleton.bones.length ? b : a));
  const skeleton = new THREE.Skeleton(main.skeleton.bones.slice(), main.skeleton.boneInverses.map((m) => m.clone()));
  const index = new Map(skeleton.bones.map((b, i) => [b, i]));
  for (const mesh of meshes) {
    if (mesh.skeleton.bones.some((b) => !index.has(b))) continue; // a skeleton of its own: leave it
    remapSkinIndex(mesh.geometry, mesh.skeleton.bones.map((b) => index.get(b)));
    mesh.bind(skeleton, mesh.bindMatrix);
  }
  model.master = { skeleton, bindMatrix: main.bindMatrix.clone() };
  return model.master;
}

function remapSkinIndex(geometry, map) {
  const attribute = geometry.attributes.skinIndex;
  if (!attribute) return;
  const identity = map.every((v, i) => v === i);
  if (identity) return;
  const out = new Uint16Array(attribute.count * 4);
  for (let v = 0; v < attribute.count; v++) for (let k = 0; k < 4; k++) out[v * 4 + k] = map[attribute.getComponent(v, k)] ?? 0;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out, 4));
}

/**
 * Splits a loaded outfit file into pieces per slot: Map slot → meshes. With `slot` given, the
 * meshes of that slot go there (all of them when none matches).
 */
export function splitOutfit(gltf, slot = null) {
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const bySlot = new Map();
  for (const mesh of meshes) {
    const material = [].concat(mesh.material)[0]?.name ?? '';
    const s = slotOf(material) ?? slotOf(mesh.userData.originalName ?? mesh.name) ?? 'accessory';
    if (!bySlot.has(s)) bySlot.set(s, []);
    bySlot.get(s).push(mesh);
  }
  if (slot) return new Map([[slot, bySlot.get(slot) ?? meshes]]);
  return bySlot;
}

/**
 * Puts `sources` (meshes of a loaded outfit file) on `model` in `slot`. Returns the part record:
 * {id, slot, name, meshes, addedBones, usedBones, materials}.
 */
export function attachPart(model, sources, slot, name) {
  const id = nextId++;
  const master = masterSkeleton(model);
  const target = model.gltf?.scene ?? model.root;
  const bones = master ? master.skeleton.bones.slice() : [];
  const inverses = master ? master.skeleton.boneInverses.slice() : [];
  const byName = new Map();
  for (const bone of bones) if (!byName.has(nameOf(model, bone))) byName.set(nameOf(model, bone), bone);
  const boneIndex = new Map(bones.map((b, i) => [b, i]));
  const addedBones = [];
  const usedBones = new Set();
  const meshes = [];

  /** The character's bone for a bone of the outfit file, added to the skeleton when it is new. */
  const mapBone = (bone, partBind) => {
    const own = byName.get(nameOf(model, bone));
    if (own) return own;
    const parentSource = bone.parent?.isBone ? bone.parent : null;
    const parent = parentSource ? mapBone(parentSource, partBind) : null;
    const copy = new THREE.Bone();
    copy.name = bone.name;
    copy.userData.originalName = nameOf(model, bone);
    copy.userData.outfitBone = true;
    // Where it sits relative to its parent in the outfit file's bind pose.
    const parentBind = parent ? inverses[boneIndex.get(parent)].clone().invert() : new THREE.Matrix4();
    const parentPartBind = parentSource ? (partBind.get(parentSource) ?? parentSource.matrixWorld) : new THREE.Matrix4();
    const local = parentPartBind.clone().invert().multiply(partBind.get(bone) ?? bone.matrixWorld);
    local.decompose(copy.position, copy.quaternion, copy.scale);
    (parent ?? target).add(copy);
    model.bindPose?.set(copy, { p: copy.position.clone(), q: copy.quaternion.clone(), s: copy.scale.clone() });
    bones.push(copy);
    inverses.push(parentBind.clone().multiply(local).invert());
    boneIndex.set(copy, bones.length - 1);
    byName.set(copy.userData.originalName, copy);
    addedBones.push(copy);
    return copy;
  };

  // 1. Map the bones of every skinned piece (adding the new ones) and move its vertices into
  //    the character's bind pose.
  const skinned = [];
  for (const source of sources) {
    if (!source.isSkinnedMesh || !master) continue;
    // The outfit file's bind pose, per bone: world = bindMatrix · inverse(boneInverse).
    const partBind = new Map(source.skeleton.bones.map((b, i) => [b, source.bindMatrix.clone().multiply(source.skeleton.boneInverses[i].clone().invert())]));
    const mapped = source.skeleton.bones.map((b) => mapBone(b, partBind));
    for (const b of mapped) usedBones.add(b);
    const geometry = rebind(source, mapped, inverses, boneIndex, master.bindMatrix);
    remapSkinIndex(geometry, mapped.map((b) => boneIndex.get(b)));
    skinned.push([source, geometry]);
  }
  // 2. One skeleton for everything, with the new bones at the end.
  if (master && bones.length !== master.skeleton.bones.length) {
    const old = master.skeleton;
    master.skeleton = new THREE.Skeleton(bones, inverses);
    for (const mesh of skinnedMeshes(model.root)) if (mesh.skeleton === old) mesh.bind(master.skeleton, mesh.bindMatrix);
  }
  // 3. The pieces themselves.
  for (const source of sources) {
    let mesh;
    const entry = skinned.find(([s]) => s === source);
    if (entry) {
      mesh = new THREE.SkinnedMesh(entry[1], source.material);
      mesh.morphTargetDictionary = source.morphTargetDictionary;
      mesh.morphTargetInfluences = source.morphTargetInfluences?.slice();
      target.add(mesh);
      mesh.bind(master.skeleton, master.bindMatrix.clone());
    } else {
      // A rigid piece follows the bone its node hangs from, or the character's root.
      let holder = target;
      let sourceParent = null;
      for (let p = source.parent; p; p = p.parent) {
        if (p.isBone) {
          sourceParent = p;
          holder = byName.get(nameOf(model, p)) ?? target;
          break;
        }
      }
      if (holder.isBone) usedBones.add(holder);
      mesh = new THREE.Mesh(source.geometry, source.material);
      const local = holder.isBone && sourceParent
        ? sourceParent.matrixWorld.clone().invert().multiply(source.matrixWorld)
        : source.matrixWorld.clone();
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      holder.add(mesh);
    }
    mesh.name = source.name;
    mesh.userData.originalName = source.userData.originalName ?? source.name;
    mesh.userData.outfitSlot = slot;
    mesh.userData.outfitName = name;
    mesh.userData.outfitPart = id;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  const materials = [...new Set(meshes.flatMap((m) => [].concat(m.material).map((x) => x?.name).filter(Boolean)))];
  return { id, slot, name, meshes, addedBones, usedBones, materials };
}

/**
 * The geometry of an outfit mesh expressed in the character's bind pose (positions and normals),
 * so that it can share the character's skeleton even when the file's rest pose differs a little.
 */
function rebind(source, bones, inverses, boneIndex, masterBindMatrix) {
  const geometry = source.geometry.clone();
  const index = geometry.attributes.skinIndex;
  const weight = geometry.attributes.skinWeight;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!index || !weight || !position) return geometry;
  // Per bone: part bind space → world (as the character's bone) → character's bind space.
  const masterBindInverse = masterBindMatrix.clone().invert();
  const perBone = bones.map((bone, i) => {
    const toWorld = inverses[boneIndex.get(bone)].clone().invert()
      .multiply(source.skeleton.boneInverses[i]).multiply(source.bindMatrix);
    return masterBindInverse.clone().multiply(toWorld);
  });
  const identity = new THREE.Matrix4();
  const near = (m) => m.elements.every((e, i) => Math.abs(e - identity.elements[i]) < 1e-5);
  if (perBone.every(near)) return geometry;
  const sum = new THREE.Matrix4();
  const temp = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    sum.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const w = weight.getComponent(i, k);
      if (w === 0) continue;
      total += w;
      temp.copy(perBone[index.getComponent(i, k)]);
      for (let e = 0; e < 16; e++) sum.elements[e] += temp.elements[e] * w;
    }
    if (total === 0) continue;
    for (let e = 0; e < 16; e++) sum.elements[e] /= total;
    v.fromBufferAttribute(position, i).applyMatrix4(sum);
    position.setXYZ(i, v.x, v.y, v.z);
    if (normal) {
      normalMatrix.getNormalMatrix(sum);
      v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normal.setXYZ(i, v.x, v.y, v.z);
    }
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
  return geometry;
}

/** Takes a part off again, with the bones that no other piece uses. */
export function detachPart(model, part, remaining) {
  for (const mesh of part.meshes) mesh.removeFromParent();
  const master = model.master;
  const stillUsed = new Set(remaining.flatMap((p) => [...p.usedBones]));
  const removable = new Set(part.addedBones.filter((b) => !stillUsed.has(b)));
  // Keep a bone whose children are kept.
  for (const bone of [...removable].reverse()) {
    if (bone.children.some((c) => c.isBone && !removable.has(c)) || bone.children.some((c) => c.isMesh)) removable.delete(bone);
  }
  if (!master || removable.size === 0) return;
  const old = master.skeleton;
  const keep = old.bones.map((b, i) => [b, i]).filter(([b]) => !removable.has(b));
  const map = new Array(old.bones.length).fill(0);
  keep.forEach(([, index], i) => { map[index] = i; });
  master.skeleton = new THREE.Skeleton(keep.map(([b]) => b), keep.map(([, index]) => old.boneInverses[index]));
  for (const mesh of skinnedMeshes(model.root)) {
    if (mesh.skeleton !== old) continue;
    remapSkinIndex(mesh.geometry, map);
    mesh.bind(master.skeleton, mesh.bindMatrix);
  }
  for (const bone of removable) {
    bone.removeFromParent();
    model.bindPose?.delete(bone);
  }
  for (const p of remaining) p.addedBones = p.addedBones.filter((b) => !removable.has(b));
}

/** The imported pieces of a card opened again (tagged in the node extras), as part records. */
export function partsFromModel(model) {
  const byId = new Map();
  model.root.traverse((o) => {
    let tagged = o;
    while (tagged && !tagged.userData?.outfitSlot) tagged = tagged.parent?.isBone ? null : tagged.parent;
    if (!o.isMesh || !tagged) return;
    const key = tagged.userData.outfitPart ?? `${tagged.userData.outfitSlot}:${tagged.userData.outfitName}`;
    if (!byId.has(key)) {
      byId.set(key, { id: nextId++, slot: tagged.userData.outfitSlot, name: tagged.userData.outfitName ?? '', meshes: [], addedBones: [], usedBones: new Set(), materials: [] });
    }
    const part = byId.get(key);
    part.meshes.push(o);
    if (o.isSkinnedMesh) {
      const index = o.geometry.attributes.skinIndex;
      const weight = o.geometry.attributes.skinWeight;
      for (let v = 0; index && v < index.count; v++) {
        for (let k = 0; k < 4; k++) if (weight.getComponent(v, k) > 0) part.usedBones.add(o.skeleton.bones[index.getComponent(v, k)]);
      }
    }
    for (const m of [].concat(o.material)) if (m?.name && !part.materials.includes(m.name)) part.materials.push(m.name);
  });
  const parts = [...byId.values()];
  // Bones the outfit brought: tagged, and claimed by the first part that uses them.
  model.root.traverse((o) => {
    if (!o.isBone || !o.userData.outfitBone) return;
    const owner = parts.find((p) => p.usedBones.has(o)) ?? parts[0];
    owner?.addedBones.push(o);
  });
  return parts;
}

/**
 * The character with its outfit as one GLB, in the file's own rest pose (no motion, no physics, no
 * maker edits: those are stored beside it in the card) and with the original node names.
 */
export async function exportCombined(model) {
  masterSkeleton(model);
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
