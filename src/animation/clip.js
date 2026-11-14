// Keyframe animation data as the mod plays it: VMD-style keys at 30 frames per second on MMD bone
// names, in MMD space (left-handed, +Y up, characters face -Z), plus morph weights.
//
// STATUS: groundwork for the animation editor; not used by the UI yet.

export const FPS = 30;

/** Slots the mod plays from a model's `anims` folder (file name = slot + ".vmd"). */
export const MOD_SLOTS = [
  'idle', 'walk', 'sprint', 'sneak', 'swim', 'crawl', 'elytraFly', 'ride', 'onHorse', 'sleep', 'lieDown',
  'die', 'onClimbable', 'onClimbableUp', 'onClimbableDown', 'swingRight', 'swingLeft', 'Drink',
];

const identity = () => [0, 0, 0, 1];

function slerp(a, b, t) {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    dot = -dot;
  }
  if (dot > 0.9995) {
    const out = [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, aw + (bw - aw) * t];
    const n = Math.hypot(...out);
    return out.map((v) => v / n);
  }
  const theta = Math.acos(dot);
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s;
  const wb = Math.sin(t * theta) / s;
  return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb];
}

/** Keys sorted by frame; finds the pair around `frame`. */
function bracket(keys, frame) {
  if (keys.length === 0) return null;
  if (frame <= keys[0].frame) return [keys[0], keys[0], 0];
  const last = keys[keys.length - 1];
  if (frame >= last.frame) return [last, last, 0];
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].frame <= frame) lo = mid;
    else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  return [a, b, (frame - a.frame) / (b.frame - a.frame)];
}

function upsert(keys, key) {
  const i = keys.findIndex((k) => k.frame >= key.frame);
  if (i < 0) keys.push(key);
  else if (keys[i].frame === key.frame) keys[i] = key;
  else keys.splice(i, 0, key);
}

export class AnimationClipData {
  constructor(name = 'animation') {
    this.name = name;
    /** @type {Map<string, {frame: number, rotation: number[], position: number[]}[]>} */
    this.bones = new Map();
    /** @type {Map<string, {frame: number, weight: number}[]>} */
    this.morphs = new Map();
    this.loop = true;
  }

  /** Sets (or replaces) the key of `bone` at `frame`. Rotation [x,y,z,w], position [x,y,z]. */
  setBoneKey(bone, frame, rotation = identity(), position = [0, 0, 0]) {
    if (!this.bones.has(bone)) this.bones.set(bone, []);
    upsert(this.bones.get(bone), { frame: Math.max(0, Math.round(frame)), rotation: [...rotation], position: [...position] });
  }

  setMorphKey(morph, frame, weight) {
    if (!this.morphs.has(morph)) this.morphs.set(morph, []);
    upsert(this.morphs.get(morph), { frame: Math.max(0, Math.round(frame)), weight: Math.min(1, Math.max(0, weight)) });
  }

  removeKey(name, frame) {
    for (const map of [this.bones, this.morphs]) {
      const keys = map.get(name);
      if (!keys) continue;
      const i = keys.findIndex((k) => k.frame === frame);
      if (i >= 0) keys.splice(i, 1);
      if (keys.length === 0) map.delete(name);
    }
  }

  /** Last keyed frame. */
  get duration() {
    let last = 0;
    for (const map of [this.bones, this.morphs]) for (const keys of map.values()) last = Math.max(last, keys[keys.length - 1].frame);
    return last;
  }

  /** The pose of `bone` at `frame` (fractional frames interpolate linearly / by slerp). */
  sampleBone(bone, frame) {
    const b = bracket(this.bones.get(bone) ?? [], frame);
    if (!b) return { rotation: identity(), position: [0, 0, 0] };
    const [k0, k1, t] = b;
    return {
      rotation: slerp(k0.rotation, k1.rotation, t),
      position: k0.position.map((v, i) => v + (k1.position[i] - v) * t),
    };
  }

  sampleMorph(morph, frame) {
    const b = bracket(this.morphs.get(morph) ?? [], frame);
    if (!b) return 0;
    const [k0, k1, t] = b;
    return k0.weight + (k1.weight - k0.weight) * t;
  }

  toJSON() {
    return {
      version: 1, name: this.name, fps: FPS, loop: this.loop,
      bones: Object.fromEntries(this.bones), morphs: Object.fromEntries(this.morphs),
    };
  }

  static fromJSON(json) {
    const clip = new AnimationClipData(json?.name ?? 'animation');
    clip.loop = json?.loop !== false;
    for (const [bone, keys] of Object.entries(json?.bones ?? {})) {
      for (const k of keys) clip.setBoneKey(bone, k.frame, k.rotation, k.position);
    }
    for (const [morph, keys] of Object.entries(json?.morphs ?? {})) {
      for (const k of keys) clip.setMorphKey(morph, k.frame, k.weight);
    }
    return clip;
  }

  /** From a parsed VMD (MMDParser.parseVmd(buffer, false) — MMD space, no axis conversion). */
  static fromVmd(vmd, name = 'animation') {
    const clip = new AnimationClipData(name);
    for (const m of vmd.motions ?? []) clip.setBoneKey(m.boneName, m.frameNum, m.rotation, m.position);
    for (const m of vmd.morphs ?? []) clip.setMorphKey(m.morphName, m.frameNum, m.weight);
    return clip;
  }
}
