import { Viewer } from './viewer.js';
import { FileSet, filesFromDrop, extensionOf } from './files.js';
import { writeCard, readCard, isCard, isPng, CardError } from './card.js';
import { t, setLanguage, currentLanguage, applyTranslations } from './i18n.js';
import { detectGroups, fromVrm, PhysicsPreview, toManifest, chainFrom, makeGroup, collectBones, colliderForBone, modeOf, maxAngleOf } from './physics.js';
import { detectIllgamesCard, readIllgamesCharacter } from './illgames.js';
import { FORMATS, exportModel } from './export.js';
import { ShapeMaker, listParts, partLabel, applyHidden } from './maker/shape.js';
import { SLOTS, slotOf, splitOutfit, attachPart, detachPart, partsFromModel, exportCombined } from './maker/parts.js';
import * as store from './store.js';

export const STUDIO_VERSION = '0.3.0';

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
  character: false, // an ILLGAMES character (the only kind the studio edits)
  physics: null,
  physicsPreview: null,
  physicsOn: true,
  shapeMaker: null, // character maker on shape bones (KKBP / ILLGAMES-style models)
  hiddenParts: new Set(), // material names hidden by the maker
  parts: [], // imported outfit pieces on the character
  outfits: { default: 0, presets: [] }, // outfit presets: which pieces each outfit shows
  savedDefaults: null, // values the user saved to come back to
  original: null, // the model's own values
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

/**
 * A slider with a number box next to it. The box can go past the slider's ends (within
 * `typedMin`..`typedMax`), like typing values in the games' character makers.
 */
function valueControl({ min, max, step, value, typedMin = min, typedMax = max, digits = 2, reset = null, onChange }) {
  const range = el('input', { type: 'range', min, max, step, value });
  const number = el('input', { type: 'number', min: typedMin, max: typedMax, step, value: Number(value).toFixed(digits), className: 'num' });
  range.addEventListener('input', () => {
    number.value = Number(range.value).toFixed(digits);
    onChange(Number(range.value));
  });
  number.addEventListener('change', () => {
    let v = Number(number.value);
    if (!Number.isFinite(v)) v = Number(range.value);
    v = Math.min(typedMax, Math.max(typedMin, v));
    number.value = v.toFixed(digits);
    range.value = v;
    onChange(v);
  });
  if (reset !== null) {
    range.addEventListener('dblclick', () => {
      range.value = reset;
      number.value = Number(reset).toFixed(digits);
      onChange(reset);
    });
  }
  return [range, number];
}

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
  // A browser cannot run Blender: explain how to turn the .blend into GLB files.
  if (files.some((f) => extensionOf(f.name) === 'blend')) return $('blend-dialog').showModal();
  if (files.length === 1 && extensionOf(files[0].name) === 'png') {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    if (isCard(bytes)) return openCard(bytes);
    if (detectIllgamesCard(bytes)) return openIllgamesCard(bytes);
    if (isPng(bytes)) return message(t('notACard'));
  }
  const fileSet = FileSet.fromFiles(files);
  const entry = fileSet.findModel();
  if (!entry) return message(t('noModel'));
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
    await loadModel(fileSet, card.manifest.model, card.manifest, '', { physics: card.manifest.physics, shape: card.manifest.shape });
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
  message(t('illgamesInfo', { game: character.game, name: character.name ? `: ${character.name}` : '' }));
}

async function loadModel(fileSet, entry, info, prefix = 'model/', { keepCamera = false, physics = null, shape = null } = {}) {
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
    // Pieces imported earlier and saved in the card come back in their slots.
    state.parts = model.kind === 'gltf' ? partsFromModel(model) : [];
    setupShapeMaker(model, shape);
    state.character = !!state.shapeMaker;
    if (state.character) {
      setupPhysics(model, physics);
      await setupDefaults(model, info?.editor?.defaults);
    } else {
      state.physics = null;
      state.savedDefaults = null;
    }
    await selectMotion($('motion').value);
    showModelStatus(model);
    setMode(state.character);
    state.outfits = readOutfits(info?.outfits);
    if (state.character) {
      buildShapeMaker();
      buildOutfitTab();
    }
    if (!keepCamera && state.character) setTimeout(() => retakePreview(), 300);
  } catch (error) {
    console.error(error);
    $('empty').hidden = false;
    setStatus([[`${t('loadFailed')} ${error.message ?? error}`, 'warn']]);
  }
}

/**
 * The studio edits ILLGAMES characters (models with the games' shape bones, like the sample
 * model). Other models only get the motion preview: in the mod they work like in MMD Skin.
 */
function setMode(character) {
  $('tabs').hidden = !character;
  $('defaults-bar').hidden = !character;
  for (const id of ['export-card', 'retake', 'export-model', 'export-format']) $(id).disabled = !character;
  $('card-preview').hidden = !character;
  $('retake').hidden = !character;
  showTab(character ? 'maker' : 'other');
}

/** ILLGAMES characters: the games' body and face shape bones are there. */
function isIllgamesCharacter(model) {
  const names = new Set(collectBones(model).map(({ name }) => name));
  const shapeBones = [...names].filter((n) => /^cf_[sdjJ]_/.test(n)).length;
  return shapeBones >= 40 && names.has('cf_J_FaceBase') && (names.has('cf_s_spine02') || names.has('cf_s_waist01'));
}

// ---------- shape-bone maker (KKBP / ILLGAMES-style models)

let shapeSub = 'body';

function setupShapeMaker(model, fromCard) {
  state.shapeMaker = null;
  state.hiddenParts = new Set(fromCard?.hidden?.materials ?? []);
  if (model.kind !== 'mmd' && isIllgamesCharacter(model)) {
    const bones = new Map(collectBones(model).map(({ name, bone }) => [name, bone]));
    const maker = new ShapeMaker(model, bones, viewer.modelHeight());
    if (maker.usable) {
      state.shapeMaker = maker;
      maker.setValues(fromCard?.sliders ?? {});
    }
  }
  applyHidden(model, state.hiddenParts);
}

/** Slider sections, like the games' character makers. */
const SECTIONS = {
  body: [['head', /^(head|neck)/], ['torso', /^(shoulderWidth|chest|waist|hip)/], ['bust', /^(bust|butt)/],
    ['arms', /^(shoulderThickness|upperArm|forearm|hand)/], ['legs', /^(thigh|calf|ankle|leg)/]],
  face: [['shape', /^(face|lowerFace|upperFace|jaw|chin|cheek)/], ['eyes', /^eye/], ['brows', /^brow/],
    ['nose', /^nose/], ['mouth', /^mouth/], ['ears', /^ear/]],
};

function buildShapeMaker() {
  const maker = state.shapeMaker;
  if (!maker) return;
  const box = $('shape-controls');
  box.replaceChildren();
  if (!maker.groups().includes(shapeSub)) shapeSub = maker.groups()[0] ?? 'body';
  for (const b of document.querySelectorAll('[data-shape-sub]')) {
    b.classList.toggle('active', b.dataset.shapeSub === shapeSub);
    b.hidden = !maker.groups().includes(b.dataset.shapeSub);
  }
  const sliders = maker.sliders.filter(([, group]) => group === shapeSub);
  const sections = SECTIONS[shapeSub] ?? [];
  const sectionOf = (id) => sections.find(([, pattern]) => pattern.test(id))?.[0] ?? 'other';
  const order = [...sections.map(([name]) => name), 'other'];
  for (const section of order) {
    const rows = sliders.filter(([id]) => sectionOf(id) === section);
    if (rows.length === 0) continue;
    const card = el('div', { className: 'box sliders' });
    if (section !== 'other') card.append(el('h3', { textContent: t(`sec_${section}`) }));
    for (const [id] of rows) {
      const controls = valueControl({
        min: 0, max: 100, step: 1, value: Math.round(maker.value(id) * 100), typedMin: -100, typedMax: 200, digits: 0, reset: 50,
        onChange: (v) => maker.setValue(id, v / 100),
      });
      card.append(el('div', { className: 'maker-row' }, [el('span', { textContent: t(`sh_${id}`) }), ...controls]));
    }
    box.append(card);
  }
}


for (const b of document.querySelectorAll('[data-shape-sub]')) {
  b.addEventListener('click', () => {
    shapeSub = b.dataset.shapeSub;
    buildShapeMaker();
  });
}
$('shape-reset').addEventListener('click', () => {
  if (!state.shapeMaker) return;
  state.shapeMaker.setValues({});
  state.hiddenParts.clear();
  applyHidden(viewer.model, state.hiddenParts);
  buildShapeMaker();
  buildOutfitTab();
});

// ---------- saved defaults

/** Everything the user edits: maker sliders, hidden parts, physics, size and tints. */
function snapshot() {
  return structuredClone({
    sliders: state.shapeMaker ? { ...state.shapeMaker.values } : {},
    hidden: [...state.hiddenParts],
    physics: state.physics,
    settings: state.settings,
  });
}

function applySnapshot(snap) {
  if (!snap || !viewer.model) return;
  state.shapeMaker?.setValues(snap.sliders ?? {});
  state.hiddenParts = new Set(snap.hidden ?? []);
  applyHidden(viewer.model, state.hiddenParts);
  if (snap.physics !== undefined && viewer.model.kind !== 'mmd') state.physics = structuredClone(snap.physics);
  if (snap.settings) {
    state.settings = structuredClone(snap.settings);
    viewer.setScale(state.settings.scale ?? 1);
    viewer.applyTints(state.settings.materialTints ?? {});
    $('f-scale').value = state.settings.scale ?? 1;
    $('o-scale').textContent = Number(state.settings.scale ?? 1).toFixed(2);
    buildMaterialList();
  }
  applyPhysics();
  renderPhysics();
  if (state.shapeMaker) buildShapeMaker();
  if (state.character) buildOutfitTab();
}

const defaultsKey = () => `defaults:${state.entry?.path}:${viewer.model?.root ? viewer.modelHeight().toFixed(4) : ''}`;

async function setupDefaults(model, fromCard) {
  state.original = snapshot();
  state.original.sliders = {};
  state.original.hidden = [];
  state.original.settings = { scale: 1, materialTints: {} };
  state.savedDefaults = fromCard ?? (await store.get(defaultsKey())) ?? null;
  $('defaults-restore').disabled = !state.savedDefaults;
}

$('defaults-save').addEventListener('click', async () => {
  if (!viewer.model) return;
  state.savedDefaults = snapshot();
  await store.set(defaultsKey(), state.savedDefaults);
  $('defaults-restore').disabled = false;
  setStatus([[t('defaultsSaved'), 'ok']]);
});
$('defaults-restore').addEventListener('click', () => applySnapshot(state.savedDefaults));
$('defaults-original').addEventListener('click', () => applySnapshot(state.original));

// ---------- outfit: hair, top, inner top, bottom, underwear, socks, shoes, accessories

const openSlots = new Set();

/** Every piece the character wears, per slot: its own (from its file) and imported ones. */
function outfitItems() {
  const imported = new Set(state.parts.flatMap((p) => p.materials));
  const items = new Map([...SLOTS, 'body'].map((slot) => [slot, []]));
  for (const part of listParts(viewer.model)) {
    if (imported.has(part.material)) continue;
    items.get(slotOf(part.material) ?? 'body').push({ material: part.material, label: part.label });
  }
  return items;
}

function visibilityToggle(material, label) {
  const input = el('input', { type: 'checkbox', checked: !state.hiddenParts.has(material) });
  input.addEventListener('change', () => {
    if (input.checked) state.hiddenParts.delete(material);
    else state.hiddenParts.add(material);
    applyHidden(viewer.model, state.hiddenParts);
    buildOutfitTab();
  });
  return el('label', { className: 'check part', title: material }, [input, ` ${label}`]);
}

function importButton(label, slot) {
  const file = el('input', { type: 'file', multiple: true, hidden: true, accept: '.glb,.gltf,.bin,.png,.jpg,.jpeg' });
  file.addEventListener('change', () => {
    if (file.files.length) importOutfit(file.files, slot);
    file.value = '';
  });
  return el('label', { className: `button small${slot ? '' : ' primary'}` }, [file, el('span', { textContent: label })]);
}

function buildOutfit(box) {
  box.append(el('p', { className: 'hint', textContent: t('outfitHint') }));
  box.append(el('div', { className: 'import-row' }, [importButton(t('outfitImport'), null)]));
  const own = outfitItems();
  for (const slot of [...SLOTS, 'body']) {
    const parts = state.parts.filter((p) => p.slot === slot);
    const mine = own.get(slot);
    if (slot === 'body' && mine.length === 0) continue;
    const shown = (part) => part.materials.some((m) => !state.hiddenParts.has(m));
    const names = [...parts.filter(shown).map((p) => p.name), ...mine.filter((i) => !state.hiddenParts.has(i.material)).map((i) => i.label)];
    const details = el('details', { className: 'slot', open: openSlots.has(slot) });
    details.addEventListener('toggle', () => { if (details.open) openSlots.add(slot); else openSlots.delete(slot); });
    details.append(el('summary', {}, [
      el('span', { className: 'slot-name', textContent: t(`slot_${slot}`) }),
      el('span', { className: 'slot-value', textContent: names.join(', ') || t('outfitEmpty') }),
    ]));
    const body = el('div', { className: 'slot-body' });
    for (const part of parts) {
      const remove = el('button', { type: 'button', className: 'link', textContent: t('remove') });
      remove.addEventListener('click', () => removePart(part));
      body.append(el('div', { className: 'row imported' }, [el('span', { className: 'label', textContent: part.name, title: part.materials.join(', ') }), remove]));
      for (const material of part.materials) body.append(visibilityToggle(material, partLabel(material)));
    }
    for (const item of mine) body.append(el('div', {}, [visibilityToggle(item.material, `${item.label} (${t('outfitFromModel')})`)]));
    if (slot !== 'body') body.append(el('div', { className: 'import-row' }, [importButton(t('outfitImportSlot'), slot)]));
    details.append(body);
    box.append(details);
  }
}

let outfitSub = 'pieces';

function buildOutfitTab() {
  const box = $('outfit-controls');
  box.replaceChildren();
  for (const b of document.querySelectorAll('[data-outfit-sub]')) b.classList.toggle('active', b.dataset.outfitSub === outfitSub);
  if (!viewer.model || !state.character) return;
  if (outfitSub === 'presets') buildPresets(box);
  else buildOutfit(box);
}
for (const b of document.querySelectorAll('[data-outfit-sub]')) {
  b.addEventListener('click', () => {
    outfitSub = b.dataset.outfitSub;
    buildOutfitTab();
  });
}

/** The card's `outfits` section as the studio keeps it. */
function readOutfits(section) {
  const presets = (section?.presets ?? [])
    .filter((p) => p && Array.isArray(p.hidden))
    .map((p, i) => ({ name: String(p.name || t('presetAuto', { n: i + 1 })).slice(0, 60), hidden: p.hidden.map(String) }));
  const index = Number(section?.default) || 0;
  return { default: index >= 0 && index < presets.length ? index : 0, presets };
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

function buildPresets(box) {
  const outfits = state.outfits;
  box.append(el('p', { className: 'hint', textContent: t('presetsHint') }));
  const current = new Set(state.hiddenParts);
  const worn = outfits.presets.findIndex((p) => sameSet(new Set(p.hidden), current));
  if (outfits.presets.length === 0) box.append(el('p', { className: 'hint empty-note', textContent: t('presetNone') }));
  outfits.presets.forEach((preset, index) => {
    const card = el('div', { className: `box preset${index === worn ? ' worn' : ''}` });
    const name = el('input', { type: 'text', value: preset.name, maxLength: 60, className: 'preset-name' });
    name.addEventListener('change', () => { preset.name = name.value.trim() || t('presetAuto', { n: index + 1 }); });
    const wear = el('button', { type: 'button', className: `button small${index === worn ? ' primary' : ''}`, textContent: t('presetWear') });
    wear.addEventListener('click', () => {
      state.hiddenParts = new Set(preset.hidden);
      applyHidden(viewer.model, state.hiddenParts);
      buildOutfitTab();
    });
    const update = el('button', { type: 'button', className: 'button small', textContent: t('presetUpdate'), title: t('presetUpdateHint') });
    update.addEventListener('click', () => {
      preset.hidden = [...state.hiddenParts];
      buildOutfitTab();
    });
    const star = el('label', { className: 'check', title: t('presetDefaultHint') }, [
      el('input', { type: 'radio', name: 'preset-default', checked: outfits.default === index }), ` ${t('presetDefault')}`]);
    star.querySelector('input').addEventListener('change', () => { outfits.default = index; });
    const remove = el('button', { type: 'button', className: 'link', textContent: t('presetDelete') });
    remove.addEventListener('click', () => {
      outfits.presets.splice(index, 1);
      if (outfits.default >= outfits.presets.length) outfits.default = 0;
      buildOutfitTab();
    });
    // What it wears, by slot.
    const hidden = new Set(preset.hidden);
    const wearing = [];
    for (const part of state.parts) if (part.materials.some((m) => !hidden.has(m))) wearing.push(`${t(`slot_${part.slot}`)}: ${part.name}`);
    for (const [slot, items] of outfitItems()) {
      if (slot === 'body') continue;
      for (const item of items) if (!hidden.has(item.material)) wearing.push(`${t(`slot_${slot}`)}: ${item.label}`);
    }
    card.append(
      el('div', { className: 'preset-head' }, [name, wear]),
      el('div', { className: 'meta', textContent: wearing.join(' · ') || '—' }),
      el('div', { className: 'preset-actions' }, [star, update, remove]),
    );
    box.append(card);
  });
  const name = el('input', { type: 'text', placeholder: t('presetName'), maxLength: 60, className: 'preset-name' });
  const save = el('button', { type: 'button', className: 'button small primary', textContent: t('presetSaveAs') });
  save.addEventListener('click', () => {
    outfits.presets.push({ name: name.value.trim() || t('presetAuto', { n: outfits.presets.length + 1 }), hidden: [...state.hiddenParts] });
    buildOutfitTab();
  });
  box.append(el('div', { className: 'box' }, [el('div', { className: 'preset-new' }, [name, save])]));
}

/** Shows that a slot is taken by an imported piece: the character's own piece there is hidden. */
function hideOwn(slot, hide) {
  for (const item of outfitItems().get(slot) ?? []) {
    if (hide) state.hiddenParts.add(item.material);
    else state.hiddenParts.delete(item.material);
  }
}

/**
 * Imports an outfit file. Without `slot`, it is split into its pieces (top, bottom, socks, ...),
 * each replacing what the character wears in that slot; hair in the file is used only when the
 * character has none showing. With `slot`, the file's pieces of that slot go there.
 */
async function importOutfit(files, slot = null) {
  const model = viewer.model;
  if (!model || model.kind !== 'gltf' || !state.character) return message(t('partsGltfOnly'));
  const fileSet = FileSet.fromFiles([...files]);
  const entry = fileSet.findModel();
  if (!entry || !['glb', 'gltf'].includes(entry.type)) return message(t('partsNeedGltf'));
  try {
    const gltf = await viewer.loadGltfScene(fileSet, entry);
    const name = entry.path.split('/').pop().replace(/\.[^.]+$/, '');
    const pieces = splitOutfit(gltf, slot);
    let hairKept = false;
    if (!slot && pieces.has('hair')) {
      const hairShowing = state.parts.some((p) => p.slot === 'hair')
        || outfitItems().get('hair').some((i) => !state.hiddenParts.has(i.material));
      if (hairShowing) {
        pieces.delete('hair');
        hairKept = true;
      }
    }
    for (const [s, meshes] of pieces) {
      // What the slot held stays in the card (hidden), so outfit presets can wear it again.
      for (const old of state.parts.filter((p) => p.slot === s)) for (const m of old.materials) state.hiddenParts.add(m);
      const part = attachPart(model, meshes, s, name);
      part.fileSet = fileSet;
      state.parts.push(part);
      hideOwn(s, true);
    }
    afterPartsChanged();
    if (hairKept) setStatus([[t('outfitHairKept'), 'warn']]);
  } catch (error) {
    console.error(error);
    message(`${t('partsFailed')} ${error.message ?? error}`);
  }
}

function takeOff(part) {
  state.parts = state.parts.filter((p) => p !== part);
  detachPart(viewer.model, part, state.parts);
  for (const m of part.materials) state.hiddenParts.delete(m);
}

function removePart(part) {
  takeOff(part);
  // Nothing imported left in the slot: the character's own piece shows again.
  if (!state.parts.some((p) => p.slot === part.slot)) hideOwn(part.slot, false);
  afterPartsChanged();
}

function afterPartsChanged() {
  const previous = state.physics;
  applyHidden(viewer.model, state.hiddenParts);
  viewer.captureMaterialColors();
  viewer.applyTints(state.settings.materialTints);
  buildMaterialList();
  // New bones (a ponytail, a skirt) get physics; the user's own edits are kept.
  state.physics = detectGroups(viewer.model);
  if (previous) mergePhysics(previous);
  else applyPhysics();
  fillRootBones(viewer.model);
  buildOutfitTab();
  renderFacts(viewer.model);
}

/** The card's `shape` section, or null when nothing is changed. */
function shapeManifest() {
  const shape = state.shapeMaker ? state.shapeMaker.toManifest() : { version: 1, sliders: {}, bones: {} };
  // The mod removes hidden pieces for good, so with outfit presets only pieces that no preset wears go.
  let hidden = [...state.hiddenParts];
  for (const preset of state.outfits.presets) hidden = hidden.filter((m) => preset.hidden.includes(m));
  shape.hidden = { materials: hidden, meshes: [] };
  const changed = Object.keys(shape.bones).length || shape.hidden.materials.length || Object.keys(shape.sliders).length;
  return changed ? shape : null;
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
    [t('format'), state.character ? `${state.entry.type.toUpperCase()} · ILLGAMES` : state.entry.type.toUpperCase()],
    [t('vertices'), vertices.toLocaleString()],
    [t('materials'), String(materials)],
    [t('files'), String(state.fileSet.paths.length)],
    [t('animation'), model.kind === 'mmd' || model.humanoidComplete ? t('yes') : t('no')],
    [t('tabPhysics'), model.kind === 'mmd' ? 'PMX rigid body' : groups.map((g) => t(`kind_${g.kind}`)).join(', ') || '—'],
  ];
  $('facts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })]));
}

// ---------- physics

function setupPhysics(model, fromCard) {
  if (model.kind === 'mmd') {
    state.physics = null;
  } else if (fromCard?.groups) {
    state.physics = structuredClone(fromCard);
  } else {
    state.physics = fromVrm(model) ?? detectGroups(model);
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
    if (old) Object.assign(group, { enabled: old.enabled, name: old.name, stiffness: old.stiffness, drag: old.drag, gravity: old.gravity, radius: old.radius, mode: old.mode, maxAngle: old.maxAngle, colliders: old.colliders });
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

const openGroups = new Set();

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
    const card = el('details', { className: 'group', open: openGroups.has(group.name) });
    card.dataset.kind = group.kind;
    card.addEventListener('toggle', () => { if (card.open) openGroups.add(group.name); else openGroups.delete(group.name); });
    const enabled = el('input', { type: 'checkbox', checked: group.enabled, title: t('physicsEnabled') });
    enabled.addEventListener('click', (e) => e.stopPropagation());
    enabled.addEventListener('change', () => { group.enabled = enabled.checked; applyPhysics(); });
    card.append(el('summary', {}, [
      enabled,
      el('span', { className: 'group-name', textContent: group.name }),
      el('span', { className: 'badge', textContent: t(`kind_${group.kind}`) }),
      el('span', { className: 'meta', textContent: `${group.chains.length} ${t('physicsChains')}` }),
    ]));
    const body = el('div', { className: 'group-body' });
    const name = el('input', { type: 'text', value: group.name, className: 'group-rename' });
    name.addEventListener('change', () => {
      openGroups.delete(group.name);
      group.name = name.value.trim() || group.name;
      openGroups.add(group.name);
      renderPhysics();
    });
    body.append(el('label', { className: 'field' }, [el('span', { textContent: t('physicsName') }), name]));
    const mode = el('select');
    for (const m of ['spring', 'jiggle']) mode.append(new Option(t(`mode_${m}`), m));
    mode.value = modeOf(group);
    mode.addEventListener('change', () => { group.mode = mode.value; applyPhysics(); renderPhysics(); });
    body.append(el('label', { className: 'field' }, [el('span', { textContent: t('p_mode') }), mode]));
    body.append(el('p', { className: 'hint', textContent: t(`modeHint_${modeOf(group)}`) }));
    const slider = (key, max, step, digits = 2, value = group[key], set = (v) => { group[key] = v; }) => {
      const controls = valueControl({
        min: 0, max, step, value, typedMin: 0, typedMax: max * 5, digits,
        onChange: (v) => { set(v); applyPhysics(120); },
      });
      body.append(el('div', { className: 'maker-row' }, [el('span', { textContent: t(`p_${key}`) }), ...controls]));
    };
    slider('stiffness', 4, 0.05);
    slider('drag', 1, 0.01);
    slider('gravity', modeOf(group) === 'jiggle' ? 0.5 : 2, 0.01);
    slider('radius', Number((height * 0.05).toFixed(3)), Number((height * 0.0005).toFixed(5)), 4);
    slider('maxAngle', 180, 1, 0, maxAngleOf(group), (v) => { group.maxAngle = Math.min(180, v); });
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
    body.append(chips);
    const remove = el('button', { type: 'button', className: 'link danger', textContent: t('remove') });
    remove.addEventListener('click', () => { state.physics.groups.splice(index, 1); applyPhysics(); renderPhysics(); });
    body.append(el('div', { className: 'group-actions' }, [remove]));
    card.append(body);
    box.append(card);
  });
}

function renderColliders() {
  const box = $('physics-colliders');
  box.replaceChildren();
  if (!viewer.model || viewer.model.kind === 'mmd' || !state.physics) return;
  const height = viewer.modelHeight();
  state.physics.colliders.forEach((c, index) => {
    const [input, number] = valueControl({
      min: 0, max: Number((height * 0.2).toFixed(3)), step: Number((height * 0.001).toFixed(5)), value: c.radius,
      typedMin: 0, typedMax: height, digits: 4,
      onChange: (v) => { c.radius = v; applyPhysics(120); },
    });
    const remove = el('button', { type: 'button', textContent: t('remove') });
    remove.addEventListener('click', () => {
      state.physics.colliders.splice(index, 1);
      for (const g of state.physics.groups) g.colliders = (g.colliders ?? []).filter((n) => n !== c.name);
      applyPhysics();
      renderPhysics();
    });
    box.append(el('div', { className: 'row' }, [
      el('span', { className: 'label', textContent: `${c.name}${c.tail ? ' ⬭' : ' ●'}`, title: c.bone }), input, number, remove]));
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
  state.physics = detectGroups(viewer.model);
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
    list.append(el('div', { className: 'row' }, [el('span', { className: 'label', textContent: partLabel(name), title: name }), input, reset]));
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
  // Plain light background like the viewport, so nothing frames the model.
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f6f7fa');
  bg.addColorStop(1, '#dfe3ea');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const scale = Math.min(w / image.width, (h - 64) / image.height);
  g.drawImage(image, (w - image.width * scale) / 2, 4, image.width * scale, image.height * scale);
  g.fillStyle = '#1f2329';
  g.font = '600 30px system-ui, sans-serif';
  g.fillText(($('f-name').value || 'Model').slice(0, 28), 20, h - 30);
  g.fillStyle = '#6b7280';
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
  if (!state.character) return;
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
  const shape = viewer.model.kind !== 'mmd' ? shapeManifest() : null;
  if (shape) manifestExtras.shape = shape;
  if (state.savedDefaults) manifestExtras.editor = { version: 1, defaults: state.savedDefaults };
  if (state.outfits.presets.length > 0) {
    manifestExtras.outfits = { version: 1, default: state.outfits.default, presets: state.outfits.presets.map((p) => ({ name: p.name, hidden: [...p.hidden] })) };
  }
  if (viewer.model.kind === 'gltf') {
    // The character and its outfit as one model with one skeleton, so the mod loads it like any
    // other and the outfit follows the body's bones and physics.
    files.length = 0;
    files.push({ path: 'model/character.glb', data: await exportCombined(viewer.model) });
    info.model = { path: 'model/character.glb', type: 'glb' };
  }
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
  if (!viewer.model || !state.character) return;
  const format = $('export-format').value;
  const base = ($('f-name').value.trim() || 'model');
  try {
    if (format === 'original') {
      const bytes = await state.fileSet.bytes(state.entry.path);
      download(bytes, state.entry.path.split('/').pop(), FORMATS.original[2]);
      return;
    }
    const bytes = format === 'glb' && viewer.model.kind !== 'mmd'
      ? await exportCombined(viewer.model) // rest pose, original names, imported parts included
      : await exportModel(viewer.model, format);
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

// ---------- file inputs and drag & drop

$('open-blend').addEventListener('click', () => $('blend-dialog').showModal());

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
    if (state.shapeMaker) buildShapeMaker();
    if (state.character) buildOutfitTab();
  }
});
applyTranslations();
buildMotionList();
buildFormatList();
