// Physics groups: spring-bone chains sorted into hair, clothing, body and custom groups, plus the
// colliders they bump into. The studio finds them from bone names (or imports a VRM's own spring
// bones), lets the user tune or add groups, previews them with three-vrm's spring-bone solver, and
// writes them into the card, where the mod runs them with the same algorithm.
//
// Units in the card (see docs/CARD_FORMAT.md, "physics"): radii and offsets in the glTF file's
// world units, offsets in the collider bone's own axes; stiffness and gravity as in VRM (metres
// per second for a human-sized model).

import * as THREE from 'three';
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneJoint,
  VRMSpringBoneManager,
} from '@pixiv/three-vrm';

export const KINDS = ['hair', 'clothing', 'body', 'custom'];

const KIND_PATTERNS = [
  ['hair', /hair|kami|髪|bang|maegami|ahoge|ponytail|twintail|もみあげ|おさげ/i],
  ['clothing', /skirt|スカート|coat|cloth|cape|cloak|ribbon|リボン|necktie|tie_|ネクタイ|sleeve|袖|frill|dress|scarf|hood|apron|裾|衣|服/i],
  ['body', /breast|bust|oppai|胸|乳|butt|hip_?jiggle|尻|belly|jiggle/i],
  ['custom', /tail|しっぽ|尻尾|ear|耳|wing|羽|acce|acc_|chain|pendant|earring|tassel|房/i],
];

export const DEFAULTS = {
  hair: { stiffness: 0.9, drag: 0.4, gravity: 0.15, radius: 0.015 },
  clothing: { stiffness: 0.8, drag: 0.5, gravity: 0.3, radius: 0.03 },
  body: { stiffness: 2.0, drag: 0.6, gravity: 0.05, radius: 0.0 },
  custom: { stiffness: 1.0, drag: 0.4, gravity: 0.1, radius: 0.01 },
};

export function kindOf(name) {
  for (const [kind, pattern] of KIND_PATTERNS) if (pattern.test(name)) return kind;
  return null;
}

/**
 * The bones of a loaded model as [{name, bone}], `name` being the name the mod will see
 * (the original glTF node name).
 */
export function collectBones(model) {
  const seen = new Set();
  const out = [];
  model.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    for (const bone of o.skeleton.bones) {
      if (seen.has(bone)) continue;
      seen.add(bone);
      out.push({ name: model.originalName?.(bone) ?? bone.name, bone });
    }
  });
  return out;
}

function humanoidBones(model) {
  const map = model.rawHumanoid ?? model.humanoid;
  return new Set(map ? [...map.values()] : []);
}

/** Chains for every bone that looks like hair, clothing, body or an accessory. */
export function detectGroups(model, tuning = {}) {
  const bones = collectBones(model);
  const nameOf = new Map(bones.map(({ name, bone }) => [bone, name]));
  const humanoid = humanoidBones(model);
  const kindByBone = new Map();
  for (const { name, bone } of bones) {
    if (humanoid.has(bone)) continue;
    const kind = kindOf(name);
    if (kind) kindByBone.set(bone, kind);
  }
  const chainsByKind = Object.fromEntries(KINDS.map((k) => [k, []]));
  const used = new Set();
  const childrenOf = (bone) => bone.children.filter((c) => c.isBone);
  const walk = (root, kind) => {
    const chain = [root];
    used.add(root);
    let current = root;
    for (;;) {
      const next = childrenOf(current).filter((c) => kindByBone.get(c) === kind && !used.has(c));
      if (next.length === 0) {
        // An end bone without a matching name ("..._end") still gives the last joint its tail.
        const tail = childrenOf(current).find((c) => !kindByBone.has(c) && !humanoid.has(c));
        if (tail && chain.length >= 1) chain.push(tail);
        break;
      }
      next.sort((a, b) => nameOf.get(a).localeCompare(nameOf.get(b)));
      for (const branch of next.slice(1)) {
        // Other branches become chains of their own.
        queue.push([branch, kind]);
      }
      current = next[0];
      used.add(current);
      chain.push(current);
    }
    if (chain.length >= 2) chainsByKind[kind].push(chain.map((b) => nameOf.get(b) ?? b.name));
  };
  const queue = [];
  for (const [bone, kind] of kindByBone) {
    const parent = bone.parent;
    if (parent && kindByBone.get(parent) === kind) continue;
    queue.push([bone, kind]);
  }
  while (queue.length) {
    const [bone, kind] = queue.shift();
    if (!used.has(bone)) walk(bone, kind);
  }

  const colliders = defaultColliders(model);
  const groups = [];
  const label = { hair: 'Tóc / Hair', clothing: 'Quần áo / Clothing', body: 'Cơ thể / Body', custom: 'Phụ kiện / Accessories' };
  for (const kind of KINDS) {
    if (chainsByKind[kind].length === 0) continue;
    groups.push(makeGroup(label[kind], kind, chainsByKind[kind], colliders, tuning[kind]));
  }
  return { version: 1, groups, colliders };
}

export function makeGroup(name, kind, chains, colliders, tuning = {}) {
  const d = { ...DEFAULTS[kind], ...tuning };
  const useColliders = colliders
    .filter((c) => (kind === 'body' ? false : kind === 'clothing' ? /leg|hips/i.test(c.name) || c.name === 'chest' : true))
    .map((c) => c.name);
  return {
    name, kind, enabled: true,
    stiffness: d.stiffness, drag: d.drag, gravity: d.gravity, gravityDir: [0, -1, 0], radius: d.radius,
    chains, colliders: useColliders,
  };
}

/** Head, chest, hips and leg colliders from the humanoid skeleton, sized from the model. */
export function defaultColliders(model) {
  const h = model.rawHumanoid ?? model.humanoid;
  if (!h || h.size === 0) return [];
  const rootScale = model.root.scale.x || 1;
  const box = new THREE.Box3().setFromObject(model.root);
  const height = (box.max.y - box.min.y) / rootScale;
  const out = [];
  const add = (name, humanoidName, worldOffset, radius, worldTail = null) => {
    const bone = h.get(humanoidName);
    if (!bone) return;
    const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local = (v) => v.clone().applyQuaternion(q).toArray().map((x) => Number(x.toFixed(5)));
    out.push({
      name, bone: model.originalName?.(bone) ?? bone.name,
      offset: local(worldOffset), radius: Number(radius.toFixed(5)),
      tail: worldTail ? local(worldTail) : null,
    });
  };
  const v = (x, y, z) => new THREE.Vector3(x, y, z).multiplyScalar(height);
  add('head', 'head', v(0, 0.05, 0), 0.07 * height);
  add('chest', h.has('upperChest') ? 'upperChest' : 'chest', v(0, 0, 0), 0.09 * height, v(0, 0.06, 0));
  add('hips', 'hips', v(0, 0, 0), 0.1 * height);
  for (const side of ['left', 'right']) {
    // Thighs: capsules down the upper leg, for skirts.
    const upper = h.get(`${side}UpperLeg`);
    const lower = h.get(`${side}LowerLeg`);
    if (upper && lower) {
      const a = upper.getWorldPosition(new THREE.Vector3());
      const b = lower.getWorldPosition(new THREE.Vector3());
      add(`${side}Leg`, `${side}UpperLeg`, new THREE.Vector3(), 0.055 * height, b.sub(a).divideScalar(rootScale));
    }
    add(`${side}Arm`, `${side}UpperArm`, v(0, 0, 0), 0.03 * height);
  }
  return out;
}

/** The model's own VRM spring bones as groups (kinds guessed from bone names). */
export function fromVrm(model) {
  const manager = model.vrm?.springBoneManager;
  if (!manager || manager.joints.size === 0) return null;
  const nameOf = (bone) => model.originalName?.(bone) ?? bone.name;
  const jointByBone = new Map([...manager.joints].map((j) => [j.bone, j]));
  const chains = [];
  for (const joint of manager.joints) {
    if (jointByBone.has(joint.bone.parent)) continue; // not a chain root
    const chain = [joint.bone];
    let current = joint;
    while (current) {
      if (current.child) chain.push(current.child);
      current = current.child ? jointByBone.get(current.child) : null;
    }
    if (chain.length >= 2) chains.push({ chain: chain.map(nameOf), settings: joint.settings });
  }
  const byKind = new Map();
  for (const { chain, settings } of chains) {
    const kind = kindOf(chain.join(' ')) ?? 'custom';
    if (!byKind.has(kind)) byKind.set(kind, { settings, chains: [] });
    byKind.get(kind).chains.push(chain);
  }
  const colliders = defaultColliders(model);
  const groups = [...byKind].map(([kind, { settings, chains: list }]) => ({
    ...makeGroup(`VRM ${kind}`, kind, list, colliders),
    stiffness: round(settings.stiffness), drag: round(settings.dragForce),
    gravity: round(settings.gravityPower), gravityDir: settings.gravityDir.toArray(), radius: round(settings.hitRadius),
  }));
  return { version: 1, groups, colliders };
}

const round = (x) => Number(Number(x).toFixed(4));

/** A bone-chain group for a custom root bone chosen by the user. */
export function chainFrom(model, rootName) {
  const bones = collectBones(model);
  const entry = bones.find((b) => b.name === rootName);
  if (!entry) return null;
  const chain = [entry.bone];
  let current = entry.bone;
  for (;;) {
    const next = current.children.find((c) => c.isBone);
    if (!next) break;
    chain.push(next);
    current = next;
  }
  if (chain.length < 2) return null;
  const names = new Map(bones.map(({ name, bone }) => [bone, name]));
  return chain.map((b) => names.get(b) ?? b.name);
}

/** Runs physics groups on a loaded model for the preview. */
export class PhysicsPreview {
  constructor(model) {
    this.model = model;
    this.manager = null;
    this.objects = [];
    this.touched = new Set();
  }

  apply(physics) {
    this.dispose();
    if (!physics || this.model.kind === 'mmd') return;
    const bones = new Map(collectBones(this.model).map(({ name, bone }) => [name, bone]));
    const rootScale = this.model.root.scale.x || 1;
    const manager = new VRMSpringBoneManager();
    const colliderByName = new Map();
    for (const c of physics.colliders ?? []) {
      const bone = bones.get(c.bone);
      if (!bone) continue;
      const scale = bone.getWorldScale(new THREE.Vector3()).x || 1;
      // Offsets are rotated into the bone's axes but carry no bone scale; undo it for three.js.
      const toLocal = (a) => new THREE.Vector3(...a).multiplyScalar(rootScale / scale);
      const shape = c.tail
        ? new VRMSpringBoneColliderShapeCapsule({ offset: toLocal(c.offset), tail: toLocal(c.tail), radius: c.radius * rootScale })
        : new VRMSpringBoneColliderShapeSphere({ offset: toLocal(c.offset), radius: c.radius * rootScale });
      const collider = new VRMSpringBoneCollider(shape);
      bone.add(collider);
      this.objects.push(collider);
      colliderByName.set(c.name, collider);
    }
    for (const group of physics.groups ?? []) {
      if (!group.enabled) continue;
      const colliderGroup = { colliders: (group.colliders ?? []).map((n) => colliderByName.get(n)).filter(Boolean) };
      for (const chain of group.chains ?? []) {
        const list = chain.map((n) => bones.get(n)).filter(Boolean);
        for (let i = 0; i < list.length - 1; i++) {
          const joint = new VRMSpringBoneJoint(list[i], list[i + 1], {
            hitRadius: group.radius * rootScale,
            stiffness: group.stiffness * rootScale,
            gravityPower: group.gravity * rootScale,
            gravityDir: new THREE.Vector3(...(group.gravityDir ?? [0, -1, 0])).normalize(),
            dragForce: group.drag,
          }, [colliderGroup]);
          manager.addJoint(joint);
          this.touched.add(list[i]);
        }
      }
    }
    this.model.root.updateMatrixWorld(true);
    manager.setInitState();
    this.manager = manager;
    // A VRM's own spring bones would fight the preview; the card's groups replace them in the mod too.
    if (this.model.vrm) {
      this.savedVrmManager ??= this.model.vrm.springBoneManager;
      this.model.vrm.springBoneManager = manager;
    }
  }

  update(delta) {
    if (this.manager && !this.model.vrm) this.manager.update(delta);
  }

  reset() {
    this.manager?.reset();
  }

  dispose() {
    for (const o of this.objects) o.removeFromParent();
    this.objects = [];
    for (const bone of this.touched) bone.matrixAutoUpdate = true;
    this.touched.clear();
    this.manager = null;
    if (this.model.vrm && this.savedVrmManager) this.model.vrm.springBoneManager = this.savedVrmManager;
  }
}

/** What goes into the card manifest (drops unknown fields, rounds numbers). */
export function toManifest(physics) {
  if (!physics) return null;
  return {
    version: 1,
    groups: physics.groups.map((g) => ({
      name: String(g.name).slice(0, 80), kind: KINDS.includes(g.kind) ? g.kind : 'custom', enabled: !!g.enabled,
      stiffness: round(g.stiffness), drag: round(g.drag), gravity: round(g.gravity),
      gravityDir: (g.gravityDir ?? [0, -1, 0]).map(round), radius: round(g.radius),
      chains: g.chains, colliders: g.colliders ?? [],
    })),
    colliders: (physics.colliders ?? []).map((c) => ({
      name: c.name, bone: c.bone, offset: c.offset.map(round), radius: round(c.radius), tail: c.tail ? c.tail.map(round) : null,
    })),
  };
}
