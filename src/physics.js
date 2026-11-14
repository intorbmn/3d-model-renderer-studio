// Physics groups: spring-bone chains sorted into hair, clothing, body and custom groups, plus the
// colliders they bump into. The studio finds them from bone names (or imports a VRM's own spring
// bones), lets the user tune or add groups, previews them with the solver below, and writes them
// into the card, where the mod runs them with the same solver (rust_engine vrm_runtime/spring_bone.rs).
//
// Two kinds of motion:
//  * "spring" (hair, clothing, custom): UniVRM's spring bone. The tail keeps its momentum, drag
//    takes some away, stiffness pushes it back towards the rest direction, gravity pulls it.
//  * "jiggle" (body: bust, hips): a damped spring around the rest pose. Stiffness 0..4 sets the
//    bounce (1..7 Hz), drag 0..1 how soon it settles, gravity how far it sags (a fraction of the
//    bone length). Like the breast physics of character-action games (Zenless Zone Zero), the
//    chain's first bone also moves on a position spring (`translation`, a fraction of its length),
//    so the whole mass bounces and lags while the joints below add the swing.
// Both run at a fixed 60 Hz, keep each joint within `maxAngle` of its rest direction, treat the
// last bone of a chain as its tail only, and use colliders that know the rest pose (a tail inside a
// collider at rest is only kept from going deeper) and push out on the side the tail came from.
//
// Units in the card (see docs/CARD_FORMAT.md, "physics"): radii and offsets in the glTF file's
// world units, offsets in the collider bone's own axes; spring stiffness and gravity as in VRM
// (metres per second for a human-sized model).

import * as THREE from 'three';
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderHelper,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneManager,
} from '@pixiv/three-vrm';

export const KINDS = ['hair', 'clothing', 'body', 'custom'];

const KIND_PATTERNS = [
  ['hair', /hair|kami|髪|bang|maegami|ahoge|ponytail|twintail|もみあげ|おさげ/i],
  ['clothing', /skirt|(^|_)sk_\d|スカート|coat|cloth|cape|cloak|ribbon|リボン|necktie|tie_|ネクタイ|sleeve|袖|frill|dress|scarf|hood|apron|裾|衣|服/i],
  ['body', /breast|bust|oppai|胸|乳|butt|siri|hip_?jiggle|尻|belly|jiggle/i],
  ['custom', /tail|しっぽ|尻尾|(^|_)ears?(_|$)|耳|wing|羽|acce|acc_|chain|pendant|earring|tassel|房/i],
];

export const DEFAULTS = {
  hair: { stiffness: 1.0, drag: 0.45, gravity: 0.15, radius: 0.01, maxAngle: 80, mode: 'spring' },
  clothing: { stiffness: 0.8, drag: 0.5, gravity: 0.3, radius: 0.02, maxAngle: 70, mode: 'spring' },
  body: { stiffness: 2.5, drag: 0.5, gravity: 0.06, radius: 0.0, maxAngle: 1, mode: 'jiggle', translation: 0.3 },
  custom: { stiffness: 1.0, drag: 0.4, gravity: 0.1, radius: 0.01, maxAngle: 80, mode: 'spring' },
};

/** The motion of a group: "jiggle" for body groups unless set otherwise. */
export const modeOf = (group) => group.mode ?? (group.kind === 'body' ? 'jiggle' : 'spring');
export const maxAngleOf = (group) => group.maxAngle ?? DEFAULTS[group.kind]?.maxAngle ?? 80;
/** How far a jiggle chain's first bone may move (bounce), as a fraction of its length. */
export const translationOf = (group) => (modeOf(group) === 'jiggle' ? group.translation ?? (group.kind === 'body' ? 0.3 : 0) : 0);

/** Bones that are never physics: ILLGAMES shape bones (except hair), weight helpers, anchors, hit boxes. */
const NOT_PHYSICS = /^(cf_s_|cf_J_(?!hair)|k_f_|a_n_|cf_hit_|cf_d_hit)/;

export function kindOf(name) {
  if (NOT_PHYSICS.test(name)) return null;
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
  // A bone with both a left and a right side under it (a bust or hip centre) is not a chain: it
  // would swing both sides as one.
  const sideOf = (name) => (/(_L|\.L|^Left|_l$)(\b|_|$)/.test(name) ? 'L' : /(_R|\.R|^Right|_r$)(\b|_|$)/.test(name) ? 'R' : null);
  const bilateral = (bone) => {
    const sides = new Set();
    bone.traverse((o) => { if (o !== bone && o.isBone) { const s = sideOf(nameOf.get(o) ?? o.name); if (s) sides.add(s); } });
    return sides.size === 2 && !sideOf(nameOf.get(bone) ?? bone.name);
  };
  const walk = (root, kind) => {
    if (bilateral(root)) {
      for (const child of childrenOf(root)) if (kindByBone.get(child) === kind) queue.push([child, kind]);
      used.add(root);
      return;
    }
    const chain = [root];
    used.add(root);
    let current = root;
    // A hub (a bone with several chains under it, like a hair root) does not swing itself:
    // each chain under it starts on its own.
    const firstNext = childrenOf(root).filter((c) => kindByBone.get(c) === kind && !used.has(c));
    if (firstNext.length > 1) {
      for (const branch of firstNext) queue.push([branch, kind]);
      return;
    }
    for (;;) {
      const next = childrenOf(current).filter((c) => kindByBone.get(c) === kind && !used.has(c));
      if (next.length === 0) {
        // An end bone without a matching name ("..._end") still gives the last joint its tail.
        const tail = childrenOf(current).find((c) => !kindByBone.has(c) && !humanoid.has(c));
        if (tail && chain.length >= 1) chain.push(tail);
        break;
      }
      if (next.length > 1) {
        // A fork: each branch becomes a chain of its own, and the hub itself does not swing
        // (it would carry every branch with it).
        // The stem above the fork is a hub too (a hair root group), so it is dropped as a whole.
        for (const branch of next) queue.push([branch, kind]);
        return;
      }
      current = next[0];
      used.add(current);
      chain.push(current);
    }
    if (kind === 'body') {
      // The whole breast moves, not only its tip: start from the bust bones of the same side
      // above the chain (in KKBP files the base of the breast hangs from cf_s_bust00_L, beside
      // cf_j_bust02_L). The unsided centre (cf_d_bust00) is not taken.
      const side = sideOf(nameOf.get(root) ?? root.name);
      for (let p = root.parent, n = 0; side && p?.isBone && n < 2; p = p.parent, n++) {
        const name = nameOf.get(p) ?? p.name;
        if (!/bust/i.test(name) || sideOf(name) !== side || bilateral(p)) break;
        chain.unshift(p);
      }
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

/** Which of the default colliders each kind of group bumps into. */
const COLLIDERS_FOR = {
  hair: /^(head|neck|chest|spine|(left|right)(UpperArm|Shoulder))$/,
  clothing: /^(hips|spine|chest|(left|right)(UpperLeg|LowerLeg))$/,
  body: /^$/,
  custom: /./,
};

export function makeGroup(name, kind, chains, colliders, tuning = {}) {
  const d = { ...DEFAULTS[kind], ...tuning };
  const pattern = COLLIDERS_FOR[kind] ?? COLLIDERS_FOR.custom;
  return {
    name, kind, enabled: true, mode: d.mode, maxAngle: d.maxAngle, ...(d.translation ? { translation: d.translation } : {}),
    stiffness: d.stiffness, drag: d.drag, gravity: d.gravity, gravityDir: [0, -1, 0], radius: d.radius,
    chains, colliders: colliders.filter((c) => pattern.test(c.name)).map((c) => c.name),
  };
}

/** A collider entry; offsets are given in world axes and stored along the bone's own axes. */
export function makeCollider(model, name, bone, radius, worldOffset = new THREE.Vector3(), worldTail = null) {
  const rootScale = model.root.scale.x || 1;
  const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const local = (v) => v.clone().divideScalar(rootScale).applyQuaternion(q).toArray().map((x) => Number(x.toFixed(5)));
  return {
    name, bone: model.originalName?.(bone) ?? bone.name,
    offset: local(worldOffset), radius: Number(radius.toFixed(5)),
    tail: worldTail ? local(worldTail) : null,
  };
}

/** A capsule from `bone` to its first child bone, or a sphere when it has none. */
export function colliderForBone(model, name, bone, radius) {
  const child = bone.children.find((c) => c.isBone);
  if (!child) return makeCollider(model, name, bone, radius);
  const a = bone.getWorldPosition(new THREE.Vector3());
  const b = child.getWorldPosition(new THREE.Vector3());
  return makeCollider(model, name, bone, radius, new THREE.Vector3(), b.sub(a));
}

/** Body colliders from the humanoid skeleton (head, neck, torso, arms, legs), sized from the model. */
export function defaultColliders(model) {
  const h = model.rawHumanoid ?? model.humanoid;
  if (!h || h.size === 0) return [];
  const rootScale = model.root.scale.x || 1;
  const box = new THREE.Box3().setFromObject(model.root);
  const height = (box.max.y - box.min.y) / rootScale;
  const world = (name) => h.get(name)?.getWorldPosition(new THREE.Vector3());
  const out = [];
  const sphere = (name, bone, offsetY, radius) => {
    if (h.get(bone)) out.push(makeCollider(model, name, h.get(bone), radius * height, new THREE.Vector3(0, offsetY * height * rootScale, 0)));
  };
  // A capsule along the bone from `from` to `to` (both humanoid names).
  const capsule = (name, from, to, radius) => {
    const a = world(from);
    const b = world(to);
    if (!a || !b) return;
    out.push(makeCollider(model, name, h.get(from), radius * height, new THREE.Vector3(), b.sub(a)));
  };
  sphere('head', 'head', 0.05, 0.07);
  capsule('neck', 'neck', 'head', 0.03);
  const chest = h.has('upperChest') ? 'upperChest' : 'chest';
  capsule('spine', 'hips', h.has('chest') ? 'chest' : 'spine', 0.085);
  capsule('chest', chest, h.has('neck') ? 'neck' : 'head', 0.09);
  sphere('hips', 'hips', -0.02, 0.095);
  for (const side of ['left', 'right']) {
    capsule(`${side}UpperLeg`, `${side}UpperLeg`, `${side}LowerLeg`, 0.055);
    capsule(`${side}LowerLeg`, `${side}LowerLeg`, `${side}Foot`, 0.04);
    capsule(`${side}UpperArm`, `${side}UpperArm`, `${side}LowerArm`, 0.03);
    capsule(`${side}LowerArm`, `${side}LowerArm`, `${side}Hand`, 0.025);
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

const STEP = 1 / 60;

// A joint's rest: the character maker's pose of the bone when it set one, else the pose at apply().
const restQ = (joint) => joint.bone.userData.shapePose?.q ?? joint.initLocal;
const restP = (joint) => joint.bone.userData.shapePose?.p ?? joint.bounce.restLocal;
const MAX_STEPS = 4;
const RESET_DISTANCE = 4;

/** Angular frequency (rad/s) and damping ratio of a jiggle joint (same as the mod). */
function jiggleConstants(stiffness, drag) {
  const frequency = 1 + 1.5 * THREE.MathUtils.clamp(stiffness, 0, 4);
  return [2 * Math.PI * frequency, 0.1 + 0.8 * THREE.MathUtils.clamp(drag, 0, 1)];
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();

function closestOnSegment(a, b, point, out) {
  const ab = _w.copy(b).sub(a);
  const lengthSq = ab.lengthSq();
  if (lengthSq < 1e-12) return out.copy(a);
  const t = THREE.MathUtils.clamp(_v.copy(point).sub(a).dot(ab) / lengthSq, 0, 1);
  return out.copy(a).addScaledVector(ab, t);
}

/** Runs physics groups on a loaded model for the preview, with the mod's solver. */
export class PhysicsPreview {
  constructor(model) {
    this.model = model;
    this.chains = [];
    this.objects = [];
    this.touched = new Set();
    this.showColliders = false;
    this.helpers = [];
    this.accumulator = 0;
  }

  /** Shows the colliders as wireframes in the scene. */
  setShowColliders(show, scene) {
    this.showColliders = show;
    this.scene = scene ?? this.scene;
    this.refreshHelpers();
  }

  refreshHelpers() {
    for (const h of this.helpers) {
      h.removeFromParent();
      h.dispose?.();
    }
    this.helpers = [];
    if (!this.showColliders || !this.scene) return;
    for (const collider of this.colliders ?? []) {
      const helper = new VRMSpringBoneColliderHelper(collider.object);
      this.scene.add(helper);
      this.helpers.push(helper);
    }
  }

  /** The collider's core point closest to `point` (world), into `out`; returns its radius. */
  closest(collider, point, out) {
    const shape = collider.object.shape;
    const start = collider.object.localToWorld(collider.start.copy(shape.offset));
    if (!shape.tail) {
      out.copy(start);
      return shape.radius;
    }
    const end = collider.object.localToWorld(collider.end.copy(shape.tail));
    closestOnSegment(start, end, point, out);
    return shape.radius;
  }

  apply(physics) {
    this.dispose();
    if (!physics || this.model.kind === 'mmd') return;
    const bones = new Map(collectBones(this.model).map(({ name, bone }) => [name, bone]));
    const rootScale = this.model.root.scale.x || 1;
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
      const object = new VRMSpringBoneCollider(shape);
      bone.add(object);
      this.objects.push(object);
      colliderByName.set(c.name, { object, start: new THREE.Vector3(), end: new THREE.Vector3() });
    }
    this.model.root.updateMatrixWorld(true);
    for (const group of physics.groups ?? []) {
      if (!group.enabled) continue;
      const mode = modeOf(group);
      const jiggle = mode === 'jiggle';
      const colliders = (group.colliders ?? []).map((n) => colliderByName.get(n)).filter(Boolean);
      for (const names of group.chains ?? []) {
        const list = names.map((n) => bones.get(n)).filter(Boolean);
        const joints = [];
        // The last bone of a chain is its tail only.
        for (let i = 0; i < list.length - 1; i++) {
          const bone = list[i];
          const childWorld = list[i + 1].getWorldPosition(new THREE.Vector3());
          const boneWorld = bone.getWorldPosition(new THREE.Vector3());
          const length = childWorld.distanceTo(boneWorld);
          if (length < 1e-6) continue;
          const axis = bone.worldToLocal(childWorld.clone()).normalize();
          const hit = group.radius * rootScale;
          const limits = colliders.map((c) => {
            const closest = new THREE.Vector3();
            const radius = this.closest(c, childWorld, closest);
            const distance = childWorld.distanceTo(closest);
            return distance >= radius + hit ? radius + hit : distance * 0.95;
          });
          joints.push({
            bone, axis, length, initLocal: bone.quaternion.clone(), limits,
            current: childWorld.clone(), prev: childWorld.clone(), velocity: new THREE.Vector3(),
          });
          this.touched.add(bone);
        }
        if (joints.length === 0) continue;
        const translation = translationOf(group);
        if (jiggle && translation > 0) {
          // The chain's first bone also bounces on a spring of its own (the whole mass moves).
          const first = joints[0];
          first.bounce = {
            restLocal: first.bone.position.clone(),
            position: first.bone.getWorldPosition(new THREE.Vector3()),
            velocity: new THREE.Vector3(),
            maxOffset: first.length * translation,
          };
        }
        this.chains.push({
          joints, colliders, jiggle,
          stiffness: jiggle ? group.stiffness : group.stiffness * rootScale,
          gravity: jiggle ? group.gravity : group.gravity * rootScale,
          gravityDir: new THREE.Vector3(...(group.gravityDir ?? [0, -1, 0])).normalize(),
          drag: THREE.MathUtils.clamp(group.drag, 0, 1),
          maxAngle: THREE.MathUtils.degToRad(maxAngleOf(group)),
        });
      }
    }
    this.colliders = [...colliderByName.values()];
    this.refreshHelpers();
    this.accumulator = 0;
    // A VRM's own spring bones would fight the preview; the card's groups replace them in the mod too.
    if (this.model.vrm) {
      this.savedVrmManager ??= this.model.vrm.springBoneManager;
      this.model.vrm.springBoneManager = new VRMSpringBoneManager();
    }
  }

  update(delta) {
    if (this.chains.length === 0 || !(delta > 0)) return;
    this.model.root.updateMatrixWorld(true);
    this.accumulator = Math.min(this.accumulator + delta, STEP * MAX_STEPS);
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      this.step(STEP);
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === 0) this.pose();
  }

  /** Turns `joint.bone` so it points at `tail` (world). */
  aim(joint, tail) {
    const bone = joint.bone;
    bone.parent.getWorldQuaternion(_p);
    const baseline = _q.copy(_p).multiply(restQ(joint));
    const from = _v.copy(joint.axis).applyQuaternion(baseline).normalize();
    const to = _w.copy(tail).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
    const world = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(baseline);
    bone.quaternion.copy(_p.invert().multiply(world));
    bone.updateMatrixWorld(true);
  }

  step(h) {
    const restDir = new THREE.Vector3();
    const restTail = new THREE.Vector3();
    const next = new THREE.Vector3();
    const closest = new THREE.Vector3();
    const closestNow = new THREE.Vector3();
    const keep = (origin, length) => {
      const d = next.sub(origin);
      if (d.lengthSq() < 1e-12) next.copy(restDir);
      else next.normalize();
      next.multiplyScalar(length).add(origin);
    };
    for (const chain of this.chains) {
      for (const joint of chain.joints) {
        const bone = joint.bone;
        if (joint.bounce) this.bounce(chain, joint, h);
        const origin = bone.getWorldPosition(new THREE.Vector3());
        bone.parent.getWorldQuaternion(_p);
        restDir.copy(joint.axis).applyQuaternion(_q.copy(_p).multiply(restQ(joint))).normalize();
        restTail.copy(origin).addScaledVector(restDir, joint.length);
        if (joint.current.distanceTo(origin) > joint.length * RESET_DISTANCE || !Number.isFinite(joint.current.x)) {
          joint.current.copy(restTail);
          joint.prev.copy(restTail);
          joint.velocity.set(0, 0, 0);
        }
        if (chain.jiggle) {
          const [omega, zeta] = jiggleConstants(chain.stiffness, chain.drag);
          const target = _v.copy(restTail).addScaledVector(chain.gravityDir, chain.gravity * joint.length);
          const acceleration = target.sub(joint.current).multiplyScalar(omega * omega)
            .addScaledVector(joint.velocity, -2 * zeta * omega);
          joint.velocity.addScaledVector(acceleration, h);
          next.copy(joint.current).addScaledVector(joint.velocity, h);
        } else {
          next.copy(joint.current)
            .addScaledVector(_v.copy(joint.current).sub(joint.prev), 1 - chain.drag)
            .addScaledVector(restDir, chain.stiffness * h)
            .addScaledVector(chain.gravityDir, chain.gravity * h);
        }
        keep(origin, joint.length);
        // Not further than maxAngle from the rest direction.
        const dir = _v.copy(next).sub(origin).normalize();
        const angle = restDir.angleTo(dir);
        if (angle > chain.maxAngle) {
          const axis = _w.crossVectors(restDir, dir).normalize();
          if (axis.lengthSq() < 1e-12) next.copy(restTail);
          else next.copy(restDir).applyAxisAngle(axis, chain.maxAngle).multiplyScalar(joint.length).add(origin);
        }
        chain.colliders.forEach((collider, i) => {
          const limit = joint.limits[i];
          if (!(limit > 0)) return;
          this.closest(collider, next, closest);
          if (next.distanceToSquared(closest) >= limit * limit) return;
          // Out on the side the tail came from, so it is never pulled through.
          this.closest(collider, joint.current, closestNow);
          const normal = _v.copy(joint.current).sub(closestNow);
          if (normal.lengthSq() < 1e-12) normal.copy(next).sub(closest);
          if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0);
          next.copy(closest).addScaledVector(normal.normalize(), limit);
          keep(origin, joint.length);
        });
        if (chain.jiggle) joint.velocity.copy(next).sub(joint.current).divideScalar(h);
        joint.prev.copy(joint.current);
        joint.current.copy(next);
        this.aim(joint, next);
      }
    }
  }

  /** Moves a jiggle chain's first bone on its position spring (same as the mod). */
  bounce(chain, joint, h) {
    const b = joint.bounce;
    const parent = joint.bone.parent;
    const rest = restP(joint).clone().applyMatrix4(parent.matrixWorld);
    if (!Number.isFinite(b.position.x) || b.position.distanceTo(rest) > b.maxOffset * 4 + 1e-4) {
      b.position.copy(rest);
      b.velocity.set(0, 0, 0);
    }
    const [omega, zeta] = jiggleConstants(chain.stiffness, chain.drag);
    const target = rest.clone().addScaledVector(chain.gravityDir, chain.gravity * joint.length * 0.5);
    const acceleration = target.sub(b.position).multiplyScalar(omega * omega).addScaledVector(b.velocity, -2 * zeta * omega);
    b.velocity.addScaledVector(acceleration, h);
    const next = b.position.clone().addScaledVector(b.velocity, h);
    const offset = next.clone().sub(rest);
    if (offset.length() > b.maxOffset) next.copy(rest).addScaledVector(offset.normalize(), b.maxOffset);
    b.velocity.copy(next).sub(b.position).divideScalar(h);
    b.position.copy(next);
    joint.bone.position.copy(parent.worldToLocal(next.clone()));
    joint.bone.updateMatrixWorld(true);
  }

  pose() {
    for (const chain of this.chains) for (const joint of chain.joints) this.aim(joint, joint.current);
  }

  /** Back to the rest pose (a new motion starts). */
  reset() {
    for (const chain of this.chains) {
      for (const joint of chain.joints) {
        joint.bone.quaternion.copy(restQ(joint));
        if (joint.bounce) joint.bone.position.copy(restP(joint));
        joint.bone.updateMatrixWorld(true);
      }
    }
    this.model.root.updateMatrixWorld(true);
    for (const chain of this.chains) {
      for (const joint of chain.joints) {
        const origin = joint.bone.getWorldPosition(new THREE.Vector3());
        const restDir = joint.axis.clone().applyQuaternion(joint.bone.getWorldQuaternion(new THREE.Quaternion())).normalize();
        joint.current.copy(origin).addScaledVector(restDir, joint.length);
        joint.prev.copy(joint.current);
        joint.velocity.set(0, 0, 0);
        if (joint.bounce) {
          joint.bounce.position.copy(origin);
          joint.bounce.velocity.set(0, 0, 0);
        }
      }
    }
    this.accumulator = 0;
  }

  dispose() {
    // Put the swinging bones back where they started: the next apply() would otherwise take the
    // drooped pose as the rest pose (and the chain would stay down for good).
    for (const chain of this.chains) {
      for (const joint of chain.joints) {
        joint.bone.quaternion.copy(restQ(joint));
        if (joint.bounce) joint.bone.position.copy(restP(joint));
      }
    }
    this.chains = [];
    this.colliders = [];
    this.refreshHelpers();
    for (const o of this.objects) o.removeFromParent();
    this.objects = [];
    this.touched.clear();
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
      mode: modeOf(g), maxAngle: round(maxAngleOf(g)), translation: round(translationOf(g)),
      stiffness: round(g.stiffness), drag: round(g.drag), gravity: round(g.gravity),
      gravityDir: (g.gravityDir ?? [0, -1, 0]).map(round), radius: round(g.radius),
      chains: g.chains, colliders: g.colliders ?? [],
    })),
    colliders: (physics.colliders ?? []).map((c) => ({
      name: c.name, bone: c.bone, offset: c.offset.map(round), radius: round(c.radius), tail: c.tail ? c.tail.map(round) : null,
    })),
  };
}
