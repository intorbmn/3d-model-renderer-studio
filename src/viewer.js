// The 3D preview: loads a model from a FileSet, plays motions, applies the editable settings.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { inferFromNames, isComplete } from './humanoid.js';
import { HumanoidRetarget } from './retarget.js';

const MMD_UNIT = 0.08; // one MMD unit in metres
const GLTF_HEIGHT_UNITS = 20; // rust_engine normalises plain glTF models to 20 MMD units

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.camera.position.set(0, 1.0, 4);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.85, 0);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1.5, 3, 2.5);
    this.scene.add(sun);
    const grid = new THREE.GridHelper(4, 16, 0x9aa3b2, 0xd5dae3);
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    this.scene.add(grid);
    this.grid = grid;

    this.clock = new THREE.Clock();
    this.model = null;
    this.playing = true;
    this.onFrame = null;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    if (this.model && this.playing) {
      this.model.mmdHelper?.update(delta);
      this.model.retarget?.update(delta);
      this.model.vrm?.update(delta);
      this.afterAnimate?.(delta);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }

  clear() {
    if (!this.model) return;
    this.scene.remove(this.model.root);
    this.model.root.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) {
        for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
        m.dispose();
      }
    });
    this.model = null;
  }

  /** Loads the model `entry` ({path, type}) of a FileSet. */
  async load(fileSet, entry, { keepCamera = false } = {}) {
    this.clear();
    const { manager, missing } = this.loadingManager(fileSet, entry);
    const url = fileSet.url(entry.path);

    let model;
    if (entry.type === 'pmx' || entry.type === 'pmd') model = await this.loadMmd(manager, url, entry.type);
    else model = await this.loadGltf(manager, url, entry.type);
    model.entry = entry;
    model.missing = [...missing];
    this.model = model;
    this.scene.add(model.root);
    if (!keepCamera) this.frameModel();
    this.captureMaterialColors();
    return model;
  }

  /** Resolves the files a model refers to (textures, .bin) inside its FileSet. */
  loadingManager(fileSet, entry) {
    const manager = new THREE.LoadingManager();
    const baseDir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    const missing = new Set();
    manager.setURLModifier((url) => {
      if (url.startsWith('data:')) return url;
      if (url.startsWith('blob:')) return url;
      const found = fileSet.resolve(url, baseDir);
      if (found) return fileSet.url(found);
      missing.add(decodeURIComponent(url.split('/').pop()));
      return url;
    });
    return { manager, missing };
  }

  /** Loads a glTF/GLB of a FileSet without adding it to the scene (for imported parts). */
  async loadGltfScene(fileSet, entry) {
    const { manager } = this.loadingManager(fileSet, entry);
    const gltf = await new GLTFLoader(manager).loadAsync(fileSet.url(entry.path));
    // Keep the file's own node names (GLTFLoader strips '.' and turns spaces into '_').
    gltf.scene.traverse((o) => {
      const index = gltf.parser.associations.get(o)?.nodes;
      const name = gltf.parser.json.nodes?.[index]?.name;
      if (name) o.userData.originalName = name;
    });
    return gltf;
  }

  async loadMmd(manager, url, type) {
    const loader = new MMDLoader(manager);
    const mesh = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject, ));
    mesh.scale.setScalar(MMD_UNIT);
    const root = new THREE.Group();
    root.add(mesh);
    return { kind: 'mmd', type, root, mesh, loader, unit: MMD_UNIT, humanoid: null, humanoidComplete: true };
  }

  async loadGltf(manager, url, type) {
    const loader = new GLTFLoader(manager);
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm ?? null;
    const root = new THREE.Group();
    // GLTFLoader strips characters such as '.' from node names; the mod sees the original names.
    const originalName = (object) => {
      if (object.userData.originalName) return object.userData.originalName;
      const index = gltf.parser.associations.get(object)?.nodes;
      return gltf.parser.json.nodes?.[index]?.name ?? object.name;
    };
    let humanoid = new Map();
    const rawHumanoid = new Map();
    let complete = false;
    if (vrm) {
      VRMUtils.removeUnnecessaryVertices?.(gltf.scene);
      VRMUtils.rotateVRM0?.(vrm);
      root.add(vrm.scene);
      for (const name of Object.keys(vrm.humanoid.humanBones)) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (node) humanoid.set(name, node);
        const raw = vrm.humanoid.getRawBoneNode(name);
        if (raw) rawHumanoid.set(name, raw);
      }
      complete = true;
    } else {
      root.add(gltf.scene);
      const bones = [];
      gltf.scene.traverse((o) => { if (o.isBone) bones.push(o); });
      const mapping = inferFromNames(bones.map(originalName));
      for (const [name, index] of mapping) humanoid.set(name, bones[index]);
      complete = isComplete(mapping);
    }
    // The file's own pose, before the arm correction below: written back on export.
    const bindPose = new Map();
    root.traverse((o) => {
      if (o.isBone) bindPose.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const height = Math.max(1e-4, box.max.y - box.min.y);
    // The mod treats one VRM metre as 12.5 MMD units, and scales a plain glTF to 20 units tall.
    const unit = vrm ? MMD_UNIT : height / GLTF_HEIGHT_UNITS;
    const model = { kind: vrm ? 'vrm' : 'gltf', type, root, vrm, gltf, unit, humanoid, humanoidComplete: complete, originalName,
      rawHumanoid: vrm ? rawHumanoid : humanoid, bindPose };
    if (complete) {
      model.retarget = new HumanoidRetarget(root, humanoid, unit);
      model.retarget.applyRestCorrection();
    }
    return model;
  }

  /** Plays a parsed VMD motion (or stops when null). */
  async setMotion(vmdUrl) {
    const model = this.model;
    if (!model) return;
    if (model.kind === 'mmd') {
      if (model.mmdHelper) {
        model.mmdHelper.remove(model.mesh);
        model.mmdHelper = null;
        model.mesh.pose();
      }
      if (!vmdUrl) return;
      const clip = await new Promise((resolve, reject) => model.loader.loadAnimation(vmdUrl, model.mesh, resolve, undefined, reject));
      const helper = new MMDAnimationHelper({ afterglow: 0 });
      helper.add(model.mesh, { animation: clip, physics: false });
      model.mmdHelper = helper;
      return;
    }
    if (!model.retarget) return;
    if (!vmdUrl) {
      model.retarget.clear();
      return;
    }
    const vmd = await new Promise((resolve, reject) => new MMDLoader().loadVMD(vmdUrl, resolve, undefined, reject));
    model.retarget.setMotion(vmd);
  }

  frameModel() {
    const box = new THREE.Box3().setFromObject(this.model.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const distance = (size.y / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.25;
    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + size.y * 0.05, center.z + Math.max(distance, size.z * 2));
    this.camera.near = Math.max(0.001, distance / 100);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Remembers each material's own colour so tints can be applied and reset. */
  captureMaterialColors() {
    this.materials = new Map();
    this.model.root.traverse((o) => {
      for (const m of [].concat(o.material ?? [])) {
        if (!m?.color) continue;
        if (!this.materials.has(m.name || m.uuid)) this.materials.set(m.name || m.uuid, []);
        this.materials.get(m.name || m.uuid).push({ material: m, base: m.color.clone() });
      }
    });
  }

  materialNames() {
    return [...(this.materials?.keys() ?? [])];
  }

  /** @param {Object<string, number[]>} tints material name → [r, g, b] multipliers */
  applyTints(tints) {
    for (const [name, list] of this.materials ?? []) {
      const tint = tints?.[name];
      for (const { material, base } of list) {
        material.color.copy(base);
        if (tint) material.color.multiply(new THREE.Color(tint[0], tint[1], tint[2]));
      }
    }
  }

  /** Height of the model in its file's units (without the size slider). */
  modelHeight() {
    if (!this.model) return 1.6;
    const box = new THREE.Box3().setFromObject(this.model.root);
    return (box.max.y - box.min.y) / (this.model.root.scale.x || 1);
  }

  setScale(scale) {
    if (this.model) this.model.root.scale.setScalar(scale);
  }

  /** Morph targets (expressions) as {name, set(value)}. */
  expressions() {
    const model = this.model;
    if (!model) return [];
    if (model.vrm?.expressionManager) {
      return model.vrm.expressionManager.expressions.map((e) => ({
        name: e.expressionName,
        set: (v) => model.vrm.expressionManager.setValue(e.expressionName, v),
      }));
    }
    const out = new Map();
    model.root.traverse((o) => {
      if (!o.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(o.morphTargetDictionary)) {
        if (!out.has(name)) out.set(name, []);
        out.get(name).push({ mesh: o, index });
      }
    });
    return [...out].map(([name, targets]) => ({
      name,
      set: (v) => targets.forEach(({ mesh, index }) => { mesh.morphTargetInfluences[index] = v; }),
    }));
  }

  /** A square PNG of the current view with a transparent background, for the card preview. */
  async snapshot(size = 512) {
    const previousSize = this.renderer.getSize(new THREE.Vector2());
    const previousAspect = this.camera.aspect;
    const previousRatio = this.renderer.getPixelRatio();
    this.grid.visible = false;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, Math.round(size * 1.4), false);
    this.camera.aspect = 1 / 1.4;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const blob = await new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
    this.grid.visible = true;
    this.renderer.setPixelRatio(previousRatio);
    this.renderer.setSize(previousSize.x, previousSize.y, false);
    this.camera.aspect = previousAspect;
    this.camera.updateProjectionMatrix();
    return new Uint8Array(await blob.arrayBuffer());
  }
}
