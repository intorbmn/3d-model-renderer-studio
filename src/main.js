import { Viewer } from './viewer.js';
import { FileSet, filesFromDrop, extensionOf } from './files.js';
import { writeCard, readCard, isCard, isKoikatsuCard, isPng, CardError } from './card.js';
import { t, setLanguage, currentLanguage, applyTranslations } from './i18n.js';

export const STUDIO_VERSION = '0.1.0';

const MOTIONS = [
  ['idle', 'idle.vmd'], ['walk', 'walk.vmd'], ['sprint', 'sprint.vmd'], ['sneak', 'sneak.vmd'],
  ['swim', 'swim.vmd'], ['crawl', 'crawl.vmd'], ['elytraFly', 'elytraFly.vmd'], ['ride', 'ride.vmd'],
  ['sleep', 'sleep.vmd'], ['swingRight', 'swingRight.vmd'],
];

const $ = (id) => document.getElementById(id);
const viewer = new Viewer($('canvas'));
window.studio = { viewer }; // for debugging and tests

const state = {
  fileSet: null,
  entry: null,
  settings: { scale: 1, materialTints: {} },
  preview: null,
  customVmdUrl: null,
  prefix: 'model/',
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

// ---------- loading ----------

async function openFiles(files) {
  files = [...files];
  if (files.length === 0) return;
  if (files.length === 1 && extensionOf(files[0].name) === 'png') {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    if (isCard(bytes)) return openCard(bytes);
    if (isKoikatsuCard(bytes)) return message(t('koikatsuCard'));
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
    await loadModel(fileSet, card.manifest.model, card.manifest, '');
  } catch (error) {
    message(error instanceof CardError ? `${t('badCard')} ${error.message}` : String(error));
  }
}

async function loadModel(fileSet, entry, info, prefix = 'model/') {
  setStatus([[t('loading')]]);
  $('empty').hidden = true;
  state.fileSet?.dispose();
  state.fileSet = fileSet;
  state.entry = entry;
  state.prefix = prefix;
  state.preview = null;
  state.settings = {
    scale: Number(info.settings?.scale) || 1,
    materialTints: { ...(info.settings?.materialTints ?? {}) },
  };
  for (const key of ['name', 'author', 'license', 'source', 'notes']) $(`f-${key}`).value = info[key] ?? '';
  try {
    const model = await viewer.load(fileSet, entry);
    $('f-scale').value = state.settings.scale;
    $('o-scale').textContent = state.settings.scale.toFixed(2);
    viewer.setScale(state.settings.scale);
    viewer.applyTints(state.settings.materialTints);
    buildMaterialList();
    buildExpressionList();
    await selectMotion($('motion').value);
    showModelStatus(model);
    $('export-card').disabled = false;
    $('retake').disabled = false;
    setTimeout(() => retakePreview(), 300);
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
  const facts = [
    [t('format'), state.entry.type.toUpperCase()],
    [t('vertices'), vertices.toLocaleString()],
    [t('materials'), String(materials)],
    [t('files'), String(state.fileSet.paths.length)],
    [t('animation'), model.kind === 'mmd' || model.humanoidComplete ? t('yes') : t('no')],
  ];
  $('facts').replaceChildren(...facts.flatMap(([k, v]) => {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    return [dt, dd];
  }));
}

// ---------- editing ----------

function hex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}

function buildMaterialList() {
  const list = $('materials');
  list.replaceChildren();
  for (const name of viewer.materialNames()) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = name;
    label.title = name;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = hex(state.settings.materialTints[name] ?? [1, 1, 1]);
    input.addEventListener('input', () => {
      const v = input.value.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255);
      state.settings.materialTints[name] = v;
      viewer.applyTints(state.settings.materialTints);
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = t('reset');
    reset.addEventListener('click', () => {
      delete state.settings.materialTints[name];
      input.value = '#ffffff';
      viewer.applyTints(state.settings.materialTints);
    });
    row.append(label, input, reset);
    list.append(row);
  }
}

function buildExpressionList() {
  const list = $('expressions');
  list.replaceChildren();
  const expressions = viewer.expressions();
  if (expressions.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('noExpressions');
    list.append(p);
    return;
  }
  for (const expression of expressions.slice(0, 80)) {
    const row = document.createElement('label');
    row.className = 'row expr';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = expression.name;
    label.title = expression.name;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = 0;
    input.max = 1;
    input.step = 0.01;
    input.value = 0;
    input.addEventListener('input', () => expression.set(Number(input.value)));
    row.append(label, input);
    list.append(row);
  }
}

$('f-scale').addEventListener('input', () => {
  state.settings.scale = Number($('f-scale').value);
  $('o-scale').textContent = state.settings.scale.toFixed(2);
  viewer.setScale(state.settings.scale);
});

// ---------- motions ----------

function buildMotionList() {
  const select = $('motion');
  const current = select.value || 'idle';
  select.replaceChildren();
  const none = new Option(t('motionNone'), '');
  select.append(none);
  for (const [key, file] of MOTIONS) select.append(new Option(t(`motion_${key}`), `assets/motions/${file}`));
  if (state.customVmdUrl) select.append(new Option(t('motionCustom'), state.customVmdUrl));
  select.value = [...select.options].some((o) => o.value === current) ? current : 'assets/motions/idle.vmd';
}

async function selectMotion(url) {
  try {
    await viewer.setMotion(url || null);
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

// ---------- card preview and export ----------

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

async function exportCard() {
  if (!viewer.model || !state.fileSet) return;
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
  const card = await writeCard(state.preview, info, files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([card], { type: 'image/png' }));
  a.download = `${(info.name || 'model').replace(/[\\/:*?"<>|]+/g, '_')}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return card;
}
$('export-card').addEventListener('click', () => exportCard().catch((e) => message(String(e.message ?? e))));
window.studio.exportCard = exportCard;
window.studio.openFiles = openFiles;
window.studio.openCard = openCard;
window.studio.state = state;

// ---------- file inputs and drag & drop ----------

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

// ---------- language ----------

$('language').value = currentLanguage();
$('language').addEventListener('change', () => {
  setLanguage($('language').value);
  applyTranslations();
  buildMotionList();
  if (viewer.model) {
    showModelStatus(viewer.model);
    buildMaterialList();
  }
});
applyTranslations();
buildMotionList();
