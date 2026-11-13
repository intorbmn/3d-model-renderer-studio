import { Viewer } from './viewer.js';
import { FileSet, filesFromDrop, extensionOf } from './files.js';
import { writeCard, readCard, isCard, isPng, CardError } from './card.js';
import { t, setLanguage, currentLanguage, applyTranslations } from './i18n.js';
import {
  SLIDERS, HAIR_STYLES_ALL, TOPS, BOTTOMS, TEMPLATE_VERSION,
  presetParams, sanitiseParams, exportCharacterGlb, templatePhysicsTuning,
} from './template.js';
import { detectGroups, fromVrm, PhysicsPreview, toManifest, chainFrom, makeGroup, collectBones, colliderForBone } from './physics.js';
import { detectIllgamesCard, readIllgamesCharacter } from './illgames.js';
import { FORMATS, exportModel } from './export.js';

export const STUDIO_VERSION = '0.2.0';

const MOTIONS = [
  ['idle', 'idle.vmd'], ['walk', 'walk.vmd'], ['sprint', 'sprint.vmd'], ['sneak', 'sneak.vmd'],
  ['swim', 'swim.vmd'], ['crawl', 'crawl.vmd'], ['elytraFly', 'elytraFly.vmd'], ['ride', 'ride.vmd'],
  ['sleep', 'sleep.vmd'], ['swingRight', 'swingRight.vmd'],
];

const $ = (id) => document.getElementById(id);
const viewer = new Viewer($('canvas'));

const state = {
  fileSet: null,
  entry: null,
  settings: { scale: 1, materialTints: {} },
  preview: null,
  customVmdUrl: null,
  prefix: 'model/',
  template: null, // maker sliders when the model is the built-in character
  physics: null,
  physicsPreview: null,
  physicsOn: true,
};
window.studio = { viewer, state };

viewer.afterAnimate = (delta) => {
  if (state.physicsOn) state.physicsPreview?.update(delta);
};

function setStatus(parts) {
  const status = $('status');
  status.replaceChildren(...parts.map(([text, cls]) => {
    const span = document.createElement('span');
    span.textContent = text;
    if (cls) span.className = cls;
    return span;
  }).flatMap((node, i) => (i === 0 ? [node] : [document.createTextNode(' · '), node])));
}

function message(text) {
  $('message-text').textContent = text;
  $('message').showModal();
}

const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// ---------- tabs

function showTab(name) {
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.classList.toggle('active', b.dataset.tab === name);
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
}
for (const b of document.querySelectorAll('.tabs [data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

// ---------- opening

async function openFiles(files) {
  files = [...files];
  if (files.length === 0) return;
  if (files.length === 1 && extensionOf(files[0].name) === 'png') {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    if (isCard(bytes)) return openCard(bytes);
    if (detectIllgamesCard(bytes)) return openIllgamesCard(bytes);
    if (isPng(bytes)) return message(t('notACard'));
  }
  const fileSet = FileSet.fromFiles(files);
  const entry = fileSet.findModel();
  if (!entry) return message(t('noModel'));
  state.template = null;
  await loadModel(fileSet, entry, {
    name: entry.path.split('/').pop().replace(/\.[^.]+$/, ''),
    author: '', license: '', source: '', notes: '',
    settings: { scale: 1, materialTints: {} },
  });
}

async function openCard(bytes) {
  try {
    const card = await readCard(bytes);
    const fileSet = FileSet.fromBytes(card.files);
    state.template = card.manifest.template?.params ? sanitiseParams(card.manifest.template.params) : null;
    await loadModel(fileSet, card.manifest.model, card.manifest, '', { physics: card.manifest.physics });
  } catch (error) {
    message(error instanceof CardError ? `${t('badCard')} ${error.message}` : String(error));
  }
}

async function openIllgamesCard(bytes) {
  let character;
  try {
    character = readIllgamesCharacter(bytes);
  } catch (error) {
    message(`${t('illgamesFailed')} ${error.message ?? error}`);
    return;
  }
  state.template = sanitiseParams({ ...presetParams(character.sex), ...character.params });
  await buildTemplate({ first: true, info: { name: character.name || 'Character', notes: `${character.game}` } });
  message(t('illgamesCard', { game: character.game, name: character.name ? `: ${character.name}` : '' }));
}

async function loadModel(fileSet, entry, info, prefix = 'model/', { keepCamera = false, physics = null } = {}) {
  setStatus([[t('loading')]]);
  $('empty').hidden = true;
  if (state.fileSet !== fileSet) state.fileSet?.dispose();
  state.fileSet = fileSet;
  state.entry = entry;
  state.prefix = prefix;
  if (!keepCamera) state.preview = null;
  if (info) {
    state.settings = {
      scale: Number(info.settings?.scale) || 1,
      materialTints: { ...(info.settings?.materialTints ?? {}) },
    };
    for (const key of ['name', 'author', 'license', 'source', 'notes']) $(`f-${key}`).value = info[key] ?? '';
  }
  try {
    state.physicsPreview?.dispose();
    state.physicsPreview = null;
    const model = await viewer.load(fileSet, entry, { keepCamera });
    $('f-scale').value = state.settings.scale;
    $('o-scale').textContent = state.settings.scale.toFixed(2);
    viewer.setScale(state.settings.scale);
    viewer.applyTints(state.settings.materialTints);
    buildMaterialList();
    buildExpressionList();
    setupPhysics(model, physics);
    await selectMotion($('motion').value);
    showModelStatus(model);
    for (const id of ['export-card', 'retake', 'export-model', 'export-format']) $(id).disabled = false;
    $('tab-maker').hidden = !state.template;
    // Rebuilding the controls while a slider is being dragged would cut the drag short.
    if (state.template && !keepCamera) buildMaker();
    if (!keepCamera) setTimeout(() => retakePreview(), 300);
  } catch (error) {
    console.error(error);
    $('empty').hidden = false;
    setStatus([[`${t('loadFailed')} ${error.message ?? error}`, 'warn']]);
  }
}

function showModelStatus(model) {
  const parts = [[`${state.entry.type.toUpperCase()} · ${state.entry.path}`]];
  if (model.kind === 'gltf') {
    parts.push(model.humanoidComplete ? [t('rigRecognised'), 'ok'] : [t('rigNotRecognised'), 'warn']);
  }
  if (model.missing.length > 0) parts.push([`${t('missingFiles')} ${model.missing.slice(0, 4).join(', ')}`, 'warn']);
  setStatus(parts);
  renderFacts(model);
}

function renderFacts(model) {
  let vertices = 0;
  let materials = 0;
  model.root.traverse((o) => {
    if (o.isMesh) {
      vertices += o.geometry.attributes.position?.count ?? 0;
      materials += [].concat(o.material).length;
    }
  });
  const groups = state.physics?.groups?.filter((g) => g.enabled) ?? [];
  const facts = [
    [t('format'), state.template ? `${state.entry.type.toUpperCase()} · ${t('tabMaker')}` : state.entry.type.toUpperCase()],
    [t('vertices'), vertices.toLocaleString()],
    [t('materials'), String(materials)],
    [t('files'), String(state.fileSet.paths.length)],
    [t('animation'), model.kind === 'mmd' || model.humanoidComplete ? t('yes') : t('no')],
    [t('tabPhysics'), model.kind === 'mmd' ? 'PMX rigid body' : groups.map((g) => t(`kind_${g.kind}`)).join(', ') || '—'],
  ];
  $('facts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]));
}

// ---------- character maker

const MAKER_LAYOUT = {
  body: ['height', 'headSize', 'neckLength', 'shoulderWidth', 'bustSize', 'bustSoftness', 'waist', 'hipWidth',
    'armThickness', 'thighThickness', 'legLength', 'c:skinColor'],
  face: ['eyeSize', 'eyeHeight', 'eyeSpacing', 'c:eyeColor'],
  hair: ['o:hairStyle', 'hairLength', 'hairVolume', 'hairSoftness', 'c:hairColor'],
  clothing: ['o:top', 'c:topColor', 'topLength', 'o:bottom', 'c:bottomColor', 'bottomLength', 'clothingSoftness'],
};
const OPTIONS = { hairStyle: HAIR_STYLES_ALL, top: TOPS, bottom: BOTTOMS };
let makerSub = 'body';

function buildMaker() {
  const box = $('maker-controls');
  box.replaceChildren();
  const params = state.template;
  for (const chip of document.querySelectorAll('[data-preset]')) chip.classList.toggle('active', chip.dataset.preset === params.preset);
  for (const b of document.querySelectorAll('.subtabs [data-sub]')) b.classList.toggle('active', b.dataset.sub === makerSub);
  for (const item of MAKER_LAYOUT[makerSub]) {
    const [kind, key] = item.includes(':') ? item.split(':') : ['s', item];
    const row = el('label', { className: 'maker-row' });
    if (kind === 's') {
      const input = el('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(params[key] * 100) });
      const out = el('output', { textContent: input.value });
      input.addEventListener('input', () => {
        out.textContent = input.value;
        params[key] = Number(input.value) / 100;
        scheduleRebuild();
      });
      row.append(el('span', { textContent: t(`s_${key}`) }), input, out);
    } else if (kind === 'c') {
      const input = el('input', { type: 'color', value: params[key] });
      input.addEventListener('input', () => {
        params[key] = input.value;
        scheduleRebuild();
      });
      row.append(el('span', { textContent: t(`c_${key}`) }), input);
    } else {
      const select = el('select');
      for (const option of OPTIONS[key]) select.append(new Option(t(`o_${option}`), option));
      select.value = params[key];
      select.addEventListener('change', () => {
        params[key] = select.value;
        scheduleRebuild();
      });
      row.append(el('span', { textContent: t(key) }), select);
    }
    box.append(row);
  }
}

for (const b of document.querySelectorAll('.subtabs [data-sub]')) {
  b.addEventListener('click', () => {
    makerSub = b.dataset.sub;
    buildMaker();
  });
}
for (const chip of document.querySelectorAll('[data-preset]')) {
  chip.addEventListener('click', () => {
    state.template = presetParams(chip.dataset.preset);
    buildMaker();
    scheduleRebuild(0);
  });
}

let rebuildTimer = null;
let rebuilding = Promise.resolve();
function scheduleRebuild(delay = 250) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuilding = rebuilding.then(() => buildTemplate({ first: false })).catch((e) => console.error(e));
  }, delay);
}

/** Builds the character from the maker sliders and loads it like any other model. */
async function buildTemplate({ first, info = null }) {
  const bytes = await exportCharacterGlb(state.template);
  const fileSet = FileSet.fromBytes(new Map([['character.glb', bytes]]));
  const previous = state.physics;
  const fields = info
    ? { author: '', license: '', source: '', notes: '', settings: { scale: 1, materialTints: {} }, ...info }
    : null;
  await loadModel(fileSet, { path: 'character.glb', type: 'glb' }, fields, 'model/', { keepCamera: !first });
  // Keep the user's own physics edits across rebuilds where the bones still exist.
  if (!first && previous) mergePhysics(previous);
  if (!first) state.preview = null;
}

$('new-character').addEventListener('click', () => $('new-dialog').showModal());
$('new-dialog').addEventListener('close', async () => {
  const preset = $('new-dialog').returnValue;
  if (!preset) return;
  state.template = presetParams(preset);
  makerSub = 'body';
  await buildTemplate({ first: true, info: { name: preset === 'male' ? 'Male' : 'Female' } });
  showTab('maker');
});

// ---------- physics

function setupPhysics(model, fromCard) {
  if (model.kind === 'mmd') {
    state.physics = null;
  } else if (fromCard?.groups) {
    state.physics = structuredClone(fromCard);
  } else {
    const tuning = state.template ? templatePhysicsTuning(state.template) : {};
    state.physics = fromVrm(model) ?? detectGroups(model, tuning);
  }
  state.physicsPreview = new PhysicsPreview(model);
  state.physicsPreview.setShowColliders($('colliders-show').checked, viewer.scene);
  applyPhysics();
  renderPhysics();
  fillRootBones(model);
}

function mergePhysics(previous) {
  const bones = new Set(collectBones(viewer.model).map((b) => b.name));
  for (const group of state.physics.groups) {
    const old = previous.groups.find((g) => g.kind === group.kind && !g.custom);
    if (old) Object.assign(group, { enabled: old.enabled, name: old.name, drag: old.drag, gravity: old.gravity, radius: old.radius, colliders: old.colliders });
  }
  for (const old of previous.groups.filter((g) => g.custom)) {
    if (old.chains.every((chain) => chain.every((b) => bones.has(b)))) state.physics.groups.push(old);
  }
  // Colliders the user added or resized: keep them where their bone still exists.
  for (const old of previous.colliders ?? []) {
    if (!bones.has(old.bone)) continue;
    const fresh = state.physics.colliders.find((c) => c.name === old.name);
    if (fresh) fresh.radius = old.radius;
    else state.physics.colliders.push(old);
  }
  const names = new Set(state.physics.colliders.map((c) => c.name));
  for (const g of state.physics.groups) g.colliders = (g.colliders ?? []).filter((n) => names.has(n));
  applyPhysics();
  renderPhysics();
}

let physicsTimer = null;
function applyPhysics(delay = 0) {
  clearTimeout(physicsTimer);
  physicsTimer = setTimeout(() => {
    if (!state.physicsPreview) return;
    if (state.physicsOn) state.physicsPreview.apply(state.physics);
    else state.physicsPreview.dispose();
    if (viewer.model) renderFacts(viewer.model);
  }, delay);
}

function renderPhysics() {
  renderColliders();
  const box = $('physics-groups');
  box.replaceChildren();
  if (!viewer.model) return;
  if (viewer.model.kind === 'mmd') {
    box.append(el('p', { className: 'hint', textContent: t('physicsPmx') }));
    return;
  }
  if (!state.physics || state.physics.groups.length === 0) {
    box.append(el('p', { className: 'hint', textContent: t('physicsNone') }));
    return;
  }
  const height = viewer.modelHeight();
  state.physics.groups.forEach((group, index) => {
    const card = el('div', { className: 'group' });
    card.dataset.kind = group.kind;
    const enabled = el('input', { type: 'checkbox', checked: group.enabled });
    enabled.addEventListener('change', () => { group.enabled = enabled.checked; applyPhysics(); });
    const name = el('input', { type: 'text', value: group.name });
    name.addEventListener('change', () => { group.name = name.value; });
    const remove = el('button', { type: 'button', className: 'link', textContent: t('remove') });
    remove.addEventListener('click', () => { state.physics.groups.splice(index, 1); applyPhysics(); renderPhysics(); });
    card.append(el('header', {}, [enabled, name, el('span', { className: 'badge', textContent: t(`kind_${group.kind}`) }), remove]));
    card.append(el('div', { className: 'meta', textContent: `${group.chains.length} ${t('physicsChains')} · ${group.chains.slice(0, 3).map((c) => c[0]).join(', ')}${group.chains.length > 3 ? '…' : ''}` }));
    const slider = (key, max, step) => {
      const row = el('label', { className: 'maker-row' });
      const input = el('input', { type: 'range', min: 0, max, step, value: group[key] });
      const out = el('output', { textContent: Number(group[key]).toFixed(2) });
      input.addEventListener('input', () => {
        group[key] = Number(input.value);
        out.textContent = Number(input.value).toFixed(2);
        applyPhysics(120);
      });
      row.append(el('span', { textContent: t(`p_${key}`) }), input, out);
      card.append(row);
    };
    slider('stiffness', 4, 0.05);
    slider('drag', 1, 0.01);
    slider('gravity', 2, 0.01);
    slider('radius', Number((height * 0.05).toFixed(3)), Number((height * 0.0005).toFixed(5)));
    const chips = el('div', { className: 'collider-chips' }, [el('span', { className: 'meta', textContent: t('groupColliders') })]);
    for (const c of state.physics.colliders ?? []) {
      const on = (group.colliders ?? []).includes(c.name);
      const chip = el('button', { type: 'button', className: `chip small${on ? ' active' : ''}`, textContent: c.name });
      chip.addEventListener('click', () => {
        group.colliders = on ? group.colliders.filter((n) => n !== c.name) : [...(group.colliders ?? []), c.name];
        applyPhysics();
        renderPhysics();
      });
      chips.append(chip);
    }
    card.append(chips);
    box.append(card);
  });
}

function renderColliders() {
  const box = $('physics-colliders');
  box.replaceChildren();
  if (!viewer.model || viewer.model.kind === 'mmd' || !state.physics) return;
  const height = viewer.modelHeight();
  state.physics.colliders.forEach((c, index) => {
    const input = el('input', { type: 'range', min: 0, max: Number((height * 0.2).toFixed(3)), step: Number((height * 0.001).toFixed(5)), value: c.radius });
    input.addEventListener('input', () => {
      c.radius = Number(input.value);
      applyPhysics(120);
    });
    const remove = el('button', { type: 'button', textContent: t('remove') });
    remove.addEventListener('click', () => {
      state.physics.colliders.splice(index, 1);
      for (const g of state.physics.groups) g.colliders = (g.colliders ?? []).filter((n) => n !== c.name);
      applyPhysics();
      renderPhysics();
    });
    box.append(el('div', { className: 'row' }, [
      el('span', { className: 'label', textContent: `${c.name}${c.tail ? ' ⬭' : ' ●'}`, title: c.bone }), input, remove]));
  });
}

function fillRootBones(model) {
  const select = $('physics-root');
  const colliderBone = $('collider-bone');
  select.replaceChildren();
  colliderBone.replaceChildren();
  if (model.kind === 'mmd') return;
  for (const { name } of collectBones(model)) {
    select.append(new Option(name, name));
    colliderBone.append(new Option(name, name));
  }
}

$('physics-detect').addEventListener('click', () => {
  if (!viewer.model || viewer.model.kind === 'mmd') return;
  const tuning = state.template ? templatePhysicsTuning(state.template) : {};
  state.physics = detectGroups(viewer.model, tuning);
  applyPhysics();
  renderPhysics();
});
$('colliders-show').addEventListener('change', () => {
  state.physicsPreview?.setShowColliders($('colliders-show').checked, viewer.scene);
});
$('collider-add').addEventListener('click', () => {
  if (!viewer.model || viewer.model.kind === 'mmd') return;
  const name = $('collider-bone').value;
  const bone = collectBones(viewer.model).find((b) => b.name === name)?.bone;
  if (!bone) return;
  state.physics ??= { version: 1, groups: [], colliders: [] };
  let label = name;
  for (let i = 2; state.physics.colliders.some((c) => c.name === label); i++) label = `${name} ${i}`;
  const collider = colliderForBone(viewer.model, label, bone, viewer.modelHeight() * 0.03);
  state.physics.colliders.push(collider);
  // New colliders apply to every group except body jiggle.
  for (const g of state.physics.groups) if (g.kind !== 'body') g.colliders = [...(g.colliders ?? []), label];
  applyPhysics();
  renderPhysics();
});
$('physics-on').addEventListener('change', () => {
  state.physicsOn = $('physics-on').checked;
  applyPhysics();
});
$('physics-add').addEventListener('click', () => {
  if (!viewer.model || viewer.model.kind === 'mmd') return;
  const chain = chainFrom(viewer.model, $('physics-root').value);
  if (!chain) return message(t('physicsChainFailed'));
  const kind = $('physics-kind').value;
  state.physics ??= { version: 1, groups: [], colliders: [] };
  const group = makeGroup($('physics-name').value.trim() || chain[0], kind, [chain], state.physics.colliders);
  group.custom = true;
  state.physics.groups.push(group);
  $('physics-name').value = '';
  applyPhysics();
  renderPhysics();
});

// ---------- colours and expressions

function hex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}

function buildMaterialList() {
  const list = $('materials');
  list.replaceChildren();
  for (const name of viewer.materialNames()) {
    const input = el('input', { type: 'color', value: hex(state.settings.materialTints[name] ?? [1, 1, 1]) });
    input.addEventListener('input', () => {
      state.settings.materialTints[name] = input.value.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255);
      viewer.applyTints(state.settings.materialTints);
    });
    const reset = el('button', { type: 'button', textContent: t('reset') });
    reset.addEventListener('click', () => {
      delete state.settings.materialTints[name];
      input.value = '#ffffff';
      viewer.applyTints(state.settings.materialTints);
    });
    list.append(el('div', { className: 'row' }, [el('span', { className: 'label', textContent: name, title: name }), input, reset]));
  }
}

function buildExpressionList() {
  const list = $('expressions');
  list.replaceChildren();
  const expressions = viewer.expressions();
  if (expressions.length === 0) {
    list.append(el('p', { className: 'hint', textContent: t('noExpressions') }));
    return;
  }
  for (const expression of expressions.slice(0, 80)) {
    const input = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0 });
    input.addEventListener('input', () => expression.set(Number(input.value)));
    list.append(el('label', { className: 'row expr' }, [el('span', { className: 'label', textContent: expression.name, title: expression.name }), input]));
  }
}

$('f-scale').addEventListener('input', () => {
  state.settings.scale = Number($('f-scale').value);
  $('o-scale').textContent = state.settings.scale.toFixed(2);
  viewer.setScale(state.settings.scale);
  applyPhysics(150);
});

// ---------- motions

function buildMotionList() {
  const select = $('motion');
  const current = select.value || 'assets/motions/idle.vmd';
  select.replaceChildren(new Option(t('motionNone'), ''));
  for (const [key, file] of MOTIONS) select.append(new Option(t(`motion_${key}`), `assets/motions/${file}`));
  if (state.customVmdUrl) select.append(new Option(t('motionCustom'), state.customVmdUrl));
  select.value = [...select.options].some((o) => o.value === current) ? current : 'assets/motions/idle.vmd';
}

async function selectMotion(url) {
  try {
    await viewer.setMotion(url || null);
    state.physicsPreview?.reset();
  } catch (error) {
    console.error(error);
    message(`${t('motionFailed')} ${error.message ?? error}`);
  }
}

$('motion').addEventListener('change', () => selectMotion($('motion').value));
$('pick-vmd').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (state.customVmdUrl) URL.revokeObjectURL(state.customVmdUrl);
  state.customVmdUrl = URL.createObjectURL(file);
  buildMotionList();
  $('motion').value = state.customVmdUrl;
  await selectMotion(state.customVmdUrl);
});
$('play').addEventListener('click', () => {
  viewer.playing = !viewer.playing;
  $('play').textContent = viewer.playing ? t('pause') : t('play');
});
$('reframe').addEventListener('click', () => viewer.model && viewer.frameModel());

// ---------- card preview and export

async function retakePreview() {
  if (!viewer.model) return;
  const shot = await viewer.snapshot(504);
  const image = await createImageBitmap(new Blob([shot], { type: 'image/png' }));
  const canvas = $('card-preview');
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#2b2f3c');
  bg.addColorStop(1, '#5a3a55');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const scale = Math.min(w / image.width, (h - 70) / image.height);
  g.drawImage(image, (w - image.width * scale) / 2, 6, image.width * scale, image.height * scale);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, h - 70, w, 70);
  g.fillStyle = '#ffffff';
  g.font = '600 30px system-ui, sans-serif';
  g.fillText(($('f-name').value || 'Model').slice(0, 28), 20, h - 30);
  g.fillStyle = '#ff9fb8';
  g.font = '15px system-ui, sans-serif';
  g.fillText('3D Model Renderer', 20, h - 10);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  state.preview = new Uint8Array(await blob.arrayBuffer());
}

$('retake').addEventListener('click', retakePreview);
$('f-name').addEventListener('change', retakePreview);

function download(bytes, name, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([bytes], { type })), download: name.replace(/[\\/:*?"<>|]+/g, '_') });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function exportCard() {
  if (!viewer.model || !state.fileSet) return;
  await rebuilding;
  if (!state.preview) await retakePreview();
  const files = [];
  for (const path of state.fileSet.paths) files.push({ path: state.prefix + path, data: await state.fileSet.bytes(path) });
  const info = {
    name: $('f-name').value.trim(),
    author: $('f-author').value.trim(),
    license: $('f-license').value.trim(),
    source: $('f-source').value.trim(),
    notes: $('f-notes').value.trim(),
    createdWith: `3d-model-renderer-studio ${STUDIO_VERSION}`,
    model: { path: state.prefix + state.entry.path, type: state.entry.type },
    settings: state.settings,
  };
  const manifestExtras = {};
  if (viewer.model.kind !== 'mmd' && state.physics) manifestExtras.physics = toManifest(state.physics);
  if (state.template) manifestExtras.template = { version: TEMPLATE_VERSION, params: state.template };
  const card = await writeCard(state.preview, { ...info, ...manifestExtras }, files);
  download(card, `${info.name || 'model'}.png`, 'image/png');
  return card;
}
$('export-card').addEventListener('click', () => exportCard().catch((e) => message(String(e.message ?? e))));

function buildFormatList() {
  const select = $('export-format');
  const current = select.value || 'glb';
  select.replaceChildren(...Object.keys(FORMATS).map((id) => new Option(t(`fmt_${id}`), id)));
  select.value = current;
}

async function exportCurrentModel() {
  if (!viewer.model) return;
  await rebuilding;
  const format = $('export-format').value;
  const base = ($('f-name').value.trim() || 'model');
  try {
    if (format === 'original') {
      const bytes = await state.fileSet.bytes(state.entry.path);
      download(bytes, state.entry.path.split('/').pop(), FORMATS.original[2]);
      return;
    }
    const bytes = await exportModel(viewer.model, format);
    const [, extension, mime] = FORMATS[format];
    download(bytes, `${base}.${extension}`, mime);
  } catch (error) {
    console.error(error);
    message(`${t('exportFailed')} ${error.message ?? error}`);
  }
}
$('export-model').addEventListener('click', exportCurrentModel);

window.studio.exportCard = exportCard;
window.studio.exportModel = (format) => exportModel(viewer.model, format);
window.studio.openFiles = openFiles;
window.studio.openCard = openCard;
window.studio.newCharacter = async (preset) => {
  state.template = presetParams(preset);
  await buildTemplate({ first: true, info: { name: preset } });
};
window.studio.rebuild = () => buildTemplate({ first: false });

// ---------- file inputs and drag & drop

for (const id of ['pick-folder', 'pick-files', 'pick-card']) {
  $(id).addEventListener('change', (event) => {
    openFiles(event.target.files);
    event.target.value = '';
  });
}

const viewport = $('viewport');
let dragDepth = 0;
viewport.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
viewport.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
viewport.addEventListener('dragover', (e) => e.preventDefault());
viewport.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('drop').hidden = true;
  openFiles(await filesFromDrop(e.dataTransfer));
});

// ---------- language

$('language').value = currentLanguage();
$('language').addEventListener('change', () => {
  setLanguage($('language').value);
  applyTranslations();
  buildMotionList();
  buildFormatList();
  if (viewer.model) {
    showModelStatus(viewer.model);
    buildMaterialList();
    renderPhysics();
    if (state.template) buildMaker();
  }
});
applyTranslations();
buildMotionList();
buildFormatList();
