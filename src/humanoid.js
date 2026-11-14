// Humanoid bone recognition for plain glTF models. Mirrors rust_engine/src/model/humanoid_inference.rs in
// the mod, so that the studio shows the same result the mod will get.

export const REQUIRED = [
  'hips', 'spine', 'head',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];

export function normalise(raw) {
  const tokens = [];
  let current = '';
  let previousLower = false;
  for (const ch of raw) {
    if (/[A-Za-z0-9]/.test(ch)) {
      const upper = ch >= 'A' && ch <= 'Z';
      if (upper && previousLower && current) {
        tokens.push(current);
        current = '';
      }
      previousLower = ch >= 'a' && ch <= 'z';
      current += ch.toLowerCase();
    } else {
      previousLower = false;
      if (current) tokens.push(current);
      current = '';
    }
  }
  if (current) tokens.push(current);
  if (tokens.length > 1 && /^\d+$/.test(tokens[0])) tokens.shift();
  const kept = tokens.filter((t) => !['joint', 'mixamorig', 'bip', 'bip01', 'bip001', 'j', 'def', 'c'].includes(t));
  let side = 'center';
  let core = '';
  for (const t of kept) {
    if (t === 'left' || t === 'l') side = 'left';
    else if (t === 'right' || t === 'r') side = 'right';
    else core += t;
  }
  if (side === 'center') {
    if (core.startsWith('left')) {
      side = 'left';
      core = core.slice(4);
    } else if (core.startsWith('right')) {
      side = 'right';
      core = core.slice(5);
    }
  }
  return { side, core };
}

const PARTS = {
  hips: 'hips', hip: 'hips', pelvis: 'hips', hipmaster: 'hips',
  spine: 'spine', torso: 'spine', spine01: 'spine',
  chest: 'chest', spine1: 'chest', torso2: 'chest', spine02: 'chest',
  upperchest: 'upperChest', spine2: 'upperChest', torso3: 'upperChest', spine03: 'upperChest',
  neck: 'neck', neck01: 'neck', head: 'head',
  shoulder: 'Shoulder', clavicle: 'Shoulder', collar: 'Shoulder',
  upperarm: 'UpperArm', arm: 'UpperArm', uparm: 'UpperArm',
  lowerarm: 'LowerArm', forearm: 'LowerArm', elbow: 'LowerArm',
  hand: 'Hand', wrist: 'Hand',
  upperleg: 'UpperLeg', upleg: 'UpperLeg', thigh: 'UpperLeg',
  lowerleg: 'LowerLeg', calf: 'LowerLeg', shin: 'LowerLeg', knee: 'LowerLeg',
  leg: 'Leg', foot: 'Foot', ankle: 'Foot',
  toe: 'Toes', toes: 'Toes', toebase: 'Toes', ball: 'Toes',
  eye: 'Eye', jaw: 'jaw',
};

function classify(core, side) {
  if ((core === 'hip') && side !== 'center') return 'UpperLeg';
  const part = PARTS[core];
  if (part === 'hips' && side !== 'center') return null;
  return part ?? null;
}

const sided = (side, part) => (side === 'left' ? `left${part}` : side === 'right' ? `right${part}` : null);

function classifyFinger(core) {
  const m = /^(\D+)(\d+)$/.exec(core);
  if (!m) return null;
  let name = m[1].replace(/^hand/, '').replace(/finger$/, '');
  const finger = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', little: 'Little', pinky: 'Little' }[name];
  return finger ? { finger, number: Number(m[2]) } : null;
}

/** @param {string[]} names bone names @returns {Map<string, number>} humanoid name → index into names */
export function inferFromNames(names) {
  const chosen = new Map();
  const offer = (name, index, preference) => {
    const existing = chosen.get(name);
    if (!existing || existing.preference < preference) chosen.set(name, { index, preference });
  };
  const legs = [];
  const fingers = new Map();
  names.forEach((raw, index) => {
    let { side, core } = normalise(raw);
    // A "pelvis" sits below the hips in rigs that have both (KKBP: Hips -> Pelvis, Spine).
    let preference = core === 'pelvis' ? 0 : 1;
    if (side !== 'center' && core.endsWith('d') && ['hip', 'knee', 'foot', 'leg', 'ankle'].includes(core.slice(0, -1))) {
      core = core.slice(0, -1);
      preference = 2;
    }
    const finger = classifyFinger(core);
    if (finger) {
      if (side !== 'center') {
        const key = `${side}|${finger.finger}`;
        if (!fingers.has(key)) fingers.set(key, []);
        fingers.get(key).push({ number: finger.number, index });
      }
      return;
    }
    const part = classify(core, side);
    if (!part) return;
    if (part === 'Leg') {
      legs.push({ side, index, preference });
      return;
    }
    const name = /^[A-Z]/.test(part) ? sided(side, part) : part;
    if (name) offer(name, index, preference);
  });
  for (const { side, index, preference } of legs) {
    const upper = sided(side, 'UpperLeg');
    const lower = sided(side, 'LowerLeg');
    if (!upper) continue;
    if (!chosen.has(upper)) offer(upper, index, preference);
    else if (!chosen.has(lower)) offer(lower, index, preference);
  }
  for (const [key, list] of fingers) {
    const [side, finger] = key.split('|');
    const segments = finger === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
    const unique = [...new Map(list.sort((a, b) => a.number - b.number).map((e) => [e.number, e])).values()];
    unique.slice(0, 3).forEach((e, i) => offer(sided(side, finger + segments[i]), e.index, 1));
  }
  return new Map([...chosen].map(([name, { index }]) => [name, index]));
}

export function isComplete(mapping) {
  return REQUIRED.every((name) => mapping.has(name));
}

/** humanoid name (VRM) → MMD bone name driven by VMD motions. Matches rust_engine bone_mapping.rs. */
export const VRM_TO_MMD = {
  hips: '下半身', spine: '上半身', chest: '上半身2', upperChest: '上半身3', neck: '首', head: '頭',
  leftShoulder: '左肩', leftUpperArm: '左腕', leftLowerArm: '左ひじ', leftHand: '左手首',
  rightShoulder: '右肩', rightUpperArm: '右腕', rightLowerArm: '右ひじ', rightHand: '右手首',
  leftUpperLeg: '左足', leftLowerLeg: '左ひざ', leftFoot: '左足首', leftToes: '左つま先',
  rightUpperLeg: '右足', rightLowerLeg: '右ひざ', rightFoot: '右足首', rightToes: '右つま先',
  leftEye: '左目', rightEye: '右目', jaw: 'あご',
  leftThumbMetacarpal: '左親指０', leftThumbProximal: '左親指１', leftThumbDistal: '左親指２',
  leftIndexProximal: '左人指１', leftIndexIntermediate: '左人指２', leftIndexDistal: '左人指３',
  leftMiddleProximal: '左中指１', leftMiddleIntermediate: '左中指２', leftMiddleDistal: '左中指３',
  leftRingProximal: '左薬指１', leftRingIntermediate: '左薬指２', leftRingDistal: '左薬指３',
  leftLittleProximal: '左小指１', leftLittleIntermediate: '左小指２', leftLittleDistal: '左小指３',
  rightThumbMetacarpal: '右親指０', rightThumbProximal: '右親指１', rightThumbDistal: '右親指２',
  rightIndexProximal: '右人指１', rightIndexIntermediate: '右人指２', rightIndexDistal: '右人指３',
  rightMiddleProximal: '右中指１', rightMiddleIntermediate: '右中指２', rightMiddleDistal: '右中指３',
  rightRingProximal: '右薬指１', rightRingIntermediate: '右薬指２', rightRingDistal: '右薬指３',
  rightLittleProximal: '右小指１', rightLittleIntermediate: '右小指２', rightLittleDistal: '右小指３',
};
