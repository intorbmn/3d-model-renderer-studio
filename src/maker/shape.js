// Character maker on shape bones, the way the character makers of ILLGAMES titles work.
//
// Those games shape a character by moving, turning and scaling dedicated "shape bones" of one
// shared skeleton: cf_s_* for the body, cf_J_* for the face. Models exported with KKBP keep these
// bones, so the studio can offer the same kind of sliders on any such model. A card stores the
// slider values (to edit again) and the resulting per-bone edits, which the mod bakes into the
// model when it loads it (rust_engine/src/model/shape_sidecar.rs), plus the parts that are hidden.
//
// Slider values are 0..1 with 0.5 meaning "as modelled".

import * as THREE from 'three';

/**
 * Bone entries: "a|b|c" lists alternatives, the first one that moves any vertex is used (ILLGAMES
 * models weight the cf_s_* bones; KKBP exports often move those weights to the main bones). A "!"
 * before a name scales that bone but cancels the scale on its children, for main bones whose
 * children must keep their shape (thickening the thigh must not thicken the foot).
 * `pair` makes the left and right entries from "…_L" / "Left …" names.
 */
const pair = (left) => [[left, false], [left.replace(/_L(?=$|\|)/g, '_R').replace(/Left /g, 'Right '), true]];
const one = (...names) => names.map((n) => [n, false]);

/**
 * [id, group, bones ([entry, mirrored]), operation, range]
 * Operations: scale (uniform), girth (across the bone), width / height / depth (along the bone's
 * axis closest to world X / Y / Z), moveX / moveY / moveZ (world axes, range as a fraction of the
 * model's height), turnZ (degrees about the axis closest to world Z).
 * Scale ranges are the factor at the slider's ends (1.3 → ×1/1.3 … ×1.3).
 */
export const SHAPE_SLIDERS = [
  // Body
  ['headSize', 'body', one('cf_s_head'), 'scale', 1.2],
  ['neckThickness', 'body', one('cf_s_neck|!Neck'), 'girth', 1.3],
  ['shoulderWidth', 'body', one('cf_s_spine03|!Upper Chest'), 'width', 1.2],
  ['chestWidth', 'body', one('cf_s_spine02|!Chest'), 'width', 1.25],
  ['chestDepth', 'body', one('cf_s_spine02|!Chest'), 'depth', 1.25],
  ['waistWidth', 'body', one('cf_s_waist01|!Spine'), 'width', 1.3],
  ['waistDepth', 'body', one('cf_s_waist01|!Spine'), 'depth', 1.3],
  ['hipWidth', 'body', one('cf_s_waist02'), 'width', 1.3],
  ['bustSize', 'body', pair('cf_s_bust00_L'), 'scale', 1.5],
  ['bustLift', 'body', pair('cf_s_bust01_L|cf_j_bust01_L'), 'moveY', 0.008],
  ['buttSize', 'body', pair('cf_s_siri_L'), 'scale', 1.4],
  ['shoulderThickness', 'body', pair('cf_s_shoulder02_L'), 'girth', 1.3],
  ['upperArmThickness', 'body', pair('cf_s_arm01_L|!Left arm'), 'girth', 1.35],
  ['forearmThickness', 'body', pair('cf_s_forearm01_L|!Left elbow'), 'girth', 1.35],
  ['handSize', 'body', pair('cf_s_hand_L|Left wrist'), 'scale', 1.25],
  ['thighThickness', 'body', pair('cf_s_thigh01_L|!Left leg'), 'girth', 1.35],
  ['calfThickness', 'body', pair('cf_s_leg01_L|!Left knee'), 'girth', 1.35],
  ['ankleThickness', 'body', pair('cf_s_leg03_L'), 'girth', 1.3],
  // Face
  ['faceSize', 'face', one('cf_J_FaceBase'), 'scale', 1.15],
  ['lowerFaceWidth', 'face', one('cf_J_FaceLow_sx'), 'width', 1.25],
  ['upperFaceHeight', 'face', one('cf_J_FaceUp_ty'), 'moveY', 0.005],
  ['jawHeight', 'face', one('cf_J_ChinLow'), 'moveY', 0.004],
  ['chinWidth', 'face', one('cf_J_Chin_s'), 'width', 1.3],
  ['chinDepth', 'face', one('cf_J_ChinTip_Base'), 'moveZ', 0.004],
  ['cheekUpper', 'face', pair('cf_J_CheekUp_s_L'), 'scale', 1.3],
  ['cheekLower', 'face', pair('cf_J_CheekLow_s_L'), 'scale', 1.3],
  ['eyeSize', 'face', pair('cf_J_Eye_rz_L'), 'scale', 1.3],
  ['eyeWidth', 'face', pair('cf_J_Eye_rz_L'), 'width', 1.25],
  ['eyeOpen', 'face', pair('cf_J_Eye_rz_L'), 'height', 1.3],
  ['eyeSpacing', 'face', pair('cf_J_Eye_tx_L'), 'moveX', 0.004],
  ['eyeHeight', 'face', pair('cf_J_Eye_tx_L'), 'moveY', 0.004],
  ['eyeDepth', 'face', one('cf_J_Eye_tz'), 'moveZ', 0.003],
  ['eyeAngle', 'face', pair('cf_J_Eye_rz_L'), 'turnZ', 15],
  ['browHeight', 'face', one('cf_J_Mayu_ty'), 'moveY', 0.004],
  ['browAngle', 'face', pair('cf_J_Mayu_L'), 'turnZ', 15],
  ['noseHeight', 'face', one('cf_J_NoseBase'), 'moveY', 0.004],
  ['noseSize', 'face', one('cf_J_NoseBase'), 'scale', 1.3],
  ['noseLength', 'face', one('cf_J_Nose_tip'), 'moveZ', 0.003],
  ['mouthHeight', 'face', one('cf_J_MouthBase_ty'), 'moveY', 0.004],
  ['mouthWidth', 'face', pair('cf_J_Mouth_L'), 'moveX', 0.003],
  ['earSize', 'face', pair('cf_J_EarBase_ry_L'), 'scale', 1.4],
];

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

/** Index (0..2) of the bone's local axis closest to `world`, and the sign of the match. */
function closestAxis(worldQuaternion, world) {
  let best = 0;
  let bestDot = 0;
  AXES.forEach((axis, i) => {
    const d = axis.clone().applyQuaternion(worldQuaternion).dot(world);
    if (Math.abs(d) > Math.abs(bestDot)) {
      best = i;
      bestDot = d;
    }
  });
  return [best, Math.sign(bestDot) || 1];
}

/** Bones that carry skin weights on any skinned mesh of the model. */
function influentialBones(model) {
  const used = new Set();
  model.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const index = o.geometry.attributes.skinIndex;
    const weight = o.geometry.attributes.skinWeight;
    if (!index || !weight) return;
    for (let i = 0; i < index.count; i++) {
      for (let k = 0; k < 4; k++) if (weight.getComponent(i, k) > 0) used.add(o.skeleton.bones[index.getComponent(i, k)]);
    }
  });
  return used;
}

/** Shape-bone maker for one loaded model. */
export class ShapeMaker {
  constructor(model, boneByName, heightInFileUnits) {
    this.model = model;
    this.height = heightInFileUnits;
    this.bones = boneByName; // name the mod sees → THREE.Bone
    this.rootScale = model.root.scale.x || 1;
    this.rest = new Map();
    this.values = {};
    this.influence = influentialBones(model);
    // Resolve each entry to the bone that is actually used on this model.
    this.sliders = SHAPE_SLIDERS.map(([id, group, bones, op, range]) => [id, group,
      bones.map(([entry, mirrored]) => [...this.resolve(entry), mirrored]).filter(([name]) => name), op, range])
      .filter(([, , bones]) => bones.length > 0);
    for (const [, , bones] of this.sliders) {
      for (const [name, counter] of bones) {
        const bone = boneByName.get(name);
        const related = counter ? [bone, ...bone.children.filter((c) => c.isBone)] : [bone];
        for (const b of related) this.remember(b);
      }
    }
  }

  /** "cf_s_x|!Main bone" → [name, counter-scale?] for the first alternative that moves vertices. */
  resolve(entry) {
    for (const option of entry.split('|')) {
      const counter = option.startsWith('!');
      const name = counter ? option.slice(1) : option;
      const bone = this.bones.get(name);
      if (bone && this.moves(bone)) return [name, counter];
    }
    return [null, false];
  }

  /** True when the bone or something under it carries skin weights. */
  moves(bone) {
    let found = false;
    bone.traverse((o) => { if (o.isBone && this.influence.has(o)) found = true; });
    return found;
  }

  remember(bone) {
    if (!bone || this.rest.has(bone)) return;
    this.rest.set(bone, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
      world: bone.getWorldQuaternion(new THREE.Quaternion()),
      parentWorld: bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(),
      parentScale: bone.parent ? bone.parent.getWorldScale(new THREE.Vector3()).x / this.rootScale : 1,
    });
  }


  nameOf(bone) {
    if (!this.names) this.names = new Map([...this.bones].map(([n, b]) => [b, n]));
    return this.names.get(bone) ?? bone.name;
  }

  /** True when the model has enough shape bones for the maker to be useful. */
  get usable() {
    return this.sliders.length >= 5;
  }

  groups() {
    return [...new Set(this.sliders.map(([, group]) => group))];
  }

  setValues(values) {
    this.values = {};
    for (const [id] of this.sliders) {
      const v = Number(values?.[id]);
      if (Number.isFinite(v) && v !== 0.5) this.values[id] = Math.min(1, Math.max(0, v));
    }
    this.apply();
  }

  setValue(id, value) {
    if (value === 0.5) delete this.values[id];
    else this.values[id] = value;
    this.apply();
  }

  value(id) {
    return this.values[id] ?? 0.5;
  }

  /** Per-bone edits in the card's terms: name → {t, r, s} (only bones that change). */
  edits() {
    const edits = new Map();
    const get = (name) => {
      if (!edits.has(name)) edits.set(name, { t: new THREE.Vector3(), r: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) });
      return edits.get(name);
    };
    for (const [id, , bones, op, range] of this.sliders) {
      const amount = (this.value(id) - 0.5) * 2; // -1 … 1
      if (amount === 0) continue;
      for (const [name, counter, mirrored] of bones) {
        const bone = this.bones.get(name);
        const rest = bone && this.rest.get(bone);
        if (!rest) continue;
        const edit = get(name);
        const factor = Math.pow(range, amount);
        const before = edit.s.clone();
        switch (op) {
          case 'scale':
            edit.s.multiplyScalar(factor);
            break;
          case 'girth': // across the bone: Blender/glTF bones run along their local Y
            edit.s.x *= factor;
            edit.s.z *= factor;
            break;
          case 'width':
          case 'height':
          case 'depth': {
            const [axis] = closestAxis(rest.world, AXES[{ width: 0, height: 1, depth: 2 }[op]]);
            edit.s.setComponent(axis, edit.s.getComponent(axis) * factor);
            break;
          }
          case 'moveX':
          case 'moveY':
          case 'moveZ': {
            const world = AXES[{ moveX: 0, moveY: 1, moveZ: 2 }[op]].clone()
              .multiplyScalar(amount * range * this.height * (mirrored && op === 'moveX' ? -1 : 1));
            const local = world.applyQuaternion(rest.parentWorld.clone().invert()).divideScalar(rest.parentScale || 1);
            edit.t.add(local);
            break;
          }
          case 'turnZ': {
            const [axis, sign] = closestAxis(rest.world, AXES[2]);
            edit.r.setComponent(axis, edit.r.getComponent(axis) + amount * range * sign * (mirrored ? -1 : 1));
            break;
          }
          default:
        }
        if (counter && !edit.s.equals(before)) {
          // Undo this slider's scale on the children, along their own closest axes.
          const change = edit.s.clone().divide(before);
          for (const child of bone.children.filter((c) => c.isBone)) {
            const childRest = this.rest.get(child);
            if (!childRest) continue;
            const childEdit = get(this.nameOf(child));
            AXES.forEach((axis, i) => {
              const k = change.getComponent(i);
              if (k === 1) return;
              const [childAxis] = closestAxis(childRest.world, axis.clone().applyQuaternion(rest.world));
              childEdit.s.setComponent(childAxis, childEdit.s.getComponent(childAxis) / k);
            });
          }
        }
      }
    }
    return edits;
  }

  /** Poses the shape bones in the preview. */
  apply() {
    const edits = this.edits();
    for (const [bone, rest] of this.rest) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
      bone.scale.copy(rest.scale);
    }
    for (const [name, e] of edits) {
      const bone = this.bones.get(name);
      const rest = this.rest.get(bone);
      if (!rest) continue;
      bone.position.copy(rest.position).add(e.t);
      const d = e.r.clone().multiplyScalar(Math.PI / 180);
      bone.quaternion.copy(rest.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(d.x, d.y, d.z, 'XYZ')));
      bone.scale.copy(rest.scale).multiply(e.s);
    }
  }

  /** The card's `shape` section (without the hidden parts, added by the caller). */
  toManifest() {
    const round = (v) => v.toArray().map((x) => Number(x.toFixed(6)));
    const bones = {};
    for (const [name, e] of this.edits()) {
      const entry = {};
      if (e.t.lengthSq() > 0) entry.t = round(e.t);
      if (e.r.lengthSq() > 0) entry.r = round(e.r);
      if (!e.s.equals(new THREE.Vector3(1, 1, 1))) entry.s = round(e.s);
      if (Object.keys(entry).length) bones[name] = entry;
    }
    return { version: 1, sliders: { ...this.values }, bones };
  }
}

/** Parts the maker can show or hide: every material of every mesh. */
export function listParts(model) {
  const parts = [];
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    const meshName = model.originalName?.(o.parent?.isGroup && !o.parent.isBone ? o.parent : o) ?? o.name;
    for (const material of [].concat(o.material)) {
      if (!material?.name || parts.some((p) => p.material === material.name)) continue;
      parts.push({ mesh: meshName, material: material.name, label: partLabel(material.name) });
    }
  });
  return parts;
}

/** "SVS m_cloth_cf_top_tshirt00 9140" → "top tshirt00". */
export function partLabel(name) {
  return name.replace(/^SVS\s+/, '').replace(/\s+\d+$/, '').replace(/^(cf_)?m_(cloths?_)?(cf_|cm_)?/, '')
    .replace(/^cf_hair_/, 'hair ').replace(/_/g, ' ').trim() || name;
}

/** Hides or shows the materials named in `hidden` (a Set). */
export function applyHidden(model, hidden) {
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    for (const material of [].concat(o.material)) if (material) material.visible = !hidden.has(material.name);
  });
}
