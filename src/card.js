// Reading and writing model cards (docs/CARD_FORMAT.md). No DOM dependencies: runs in browsers and Node 18+.

export const CARD_FORMAT = '3d-model-renderer-card';
export const CARD_VERSION = 1;
export const MODEL_TYPES = ['pmx', 'pmd', 'vrm', 'glb', 'gltf'];

const MAGIC = asciiBytes('3DMRCARD');
const END_MAGIC = asciiBytes('3DMR-END');
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024;
const MAX_FILES = 4096;

export class CardError extends Error {}

function asciiBytes(text) {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function bytesEqual(a, aOffset, b) {
  if (aOffset < 0 || aOffset + b.length > a.length) return false;
  for (let i = 0; i < b.length; i++) if (a[aOffset + i] !== b[i]) return false;
  return true;
}

export function isPng(bytes) {
  return bytesEqual(bytes, 0, PNG_SIGNATURE);
}

/** Returns the end offset (exclusive) of the IEND chunk, or -1. */
export function findPngEnd(bytes) {
  if (!isPng(bytes)) return -1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) return -1;
    if (type === 'IEND') return end;
    offset = end;
  }
  return -1;
}

/** A path inside a card: relative, '/'-separated, no '..', no empty segments. */
export function isSafePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function streamThrough(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const deflate = (bytes) => streamThrough(bytes, new CompressionStream('deflate'));
export const inflate = (bytes) => streamThrough(bytes, new DecompressionStream('deflate'));

/**
 * Builds a card.
 * @param {Uint8Array} png the preview image (a complete PNG)
 * @param {object} info manifest fields: name, author, license, source, notes, model {path, type}, settings
 * @param {Array<{path: string, data: Uint8Array}>} files the model files
 * @returns {Promise<Uint8Array>}
 */
export async function writeCard(png, info, files) {
  const pngEnd = findPngEnd(png);
  if (pngEnd < 0) throw new CardError('The preview is not a valid PNG image.');
  if (!info?.model || !MODEL_TYPES.includes(info.model.type)) throw new CardError('Unknown model type.');
  if (!files.some((f) => f.path === info.model.path)) throw new CardError('The model file is missing from the card.');

  const seen = new Set();
  const entries = [];
  const blobs = [];
  let offset = 0;
  for (const file of files) {
    if (!isSafePath(file.path)) throw new CardError(`Unsafe path in card: ${file.path}`);
    if (seen.has(file.path)) throw new CardError(`Duplicate path in card: ${file.path}`);
    seen.add(file.path);
    const compressed = await deflate(file.data);
    const useDeflate = compressed.length < file.data.length;
    const stored = useDeflate ? compressed : file.data;
    entries.push({
      path: file.path,
      offset,
      size: file.data.length,
      stored: stored.length,
      compression: useDeflate ? 'deflate' : 'none',
      sha256: await sha256Hex(file.data),
    });
    blobs.push(stored);
    offset += stored.length;
  }

  const manifest = {
    format: CARD_FORMAT,
    version: CARD_VERSION,
    name: info.name ?? '',
    author: info.author ?? '',
    license: info.license ?? '',
    source: info.source ?? '',
    notes: info.notes ?? '',
    createdWith: info.createdWith ?? '3d-model-renderer-studio',
    createdAt: info.createdAt ?? new Date().toISOString(),
    model: { path: info.model.path, type: info.model.type },
    settings: info.settings ?? {},
    files: entries,
  };
  // Optional sections (docs/CARD_FORMAT.md): physics groups and the character maker's sliders.
  if (info.physics) manifest.physics = info.physics;
  if (info.template) manifest.template = info.template;
  if (info.shape) manifest.shape = info.shape;
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));

  const header = new Uint8Array(16);
  header.set(MAGIC, 0);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(8, CARD_VERSION, true);
  headerView.setUint32(12, manifestBytes.length, true);

  const trailer = new Uint8Array(16);
  new DataView(trailer.buffer).setBigUint64(0, BigInt(pngEnd), true);
  trailer.set(END_MAGIC, 8);

  return new Uint8Array(await new Blob([png.subarray(0, pngEnd), header, manifestBytes, ...blobs, trailer]).arrayBuffer());
}

/** Returns the card payload location, or null when the bytes are not a model card. */
function locatePayload(bytes) {
  if (bytes.length < 32 || !bytesEqual(bytes, bytes.length - 8, END_MAGIC)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = Number(view.getBigUint64(bytes.length - 16, true));
  if (!Number.isSafeInteger(start) || start < 0 || start + 16 > bytes.length - 16) return null;
  if (!bytesEqual(bytes, start, MAGIC)) return null;
  return { start, end: bytes.length - 16 };
}

export function isCard(bytes) {
  return locatePayload(bytes) !== null;
}

/**
 * Reads and validates a card.
 * @returns {Promise<{manifest: object, preview: Uint8Array, files: Map<string, Uint8Array>}>}
 */
export async function readCard(bytes) {
  const location = locatePayload(bytes);
  if (!location) throw new CardError('This file is not a 3D Model Renderer card.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(location.start + 8, true);
  if (version !== CARD_VERSION) throw new CardError(`Unsupported card version ${version}.`);
  const manifestLength = view.getUint32(location.start + 12, true);
  const manifestStart = location.start + 16;
  const dataStart = manifestStart + manifestLength;
  if (dataStart > location.end) throw new CardError('The card manifest is truncated.');

  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(manifestStart, dataStart)));
  } catch {
    throw new CardError('The card manifest is not valid JSON.');
  }
  if (manifest?.format !== CARD_FORMAT || manifest.version !== CARD_VERSION) throw new CardError('Not a version 1 model card.');
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_FILES) throw new CardError('Invalid file list.');
  if (!manifest.model || !MODEL_TYPES.includes(manifest.model.type)) throw new CardError('Unknown model type.');

  const dataLength = location.end - dataStart;
  const files = new Map();
  let total = 0;
  for (const entry of manifest.files) {
    const { path, offset, size, stored, compression, sha256 } = entry ?? {};
    if (!isSafePath(path) || files.has(path)) throw new CardError(`Unsafe or duplicate path: ${path}`);
    if (![offset, size, stored].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new CardError(`Invalid entry: ${path}`);
    if (offset + stored > dataLength) throw new CardError(`File runs past the end of the card: ${path}`);
    total += size;
    if (total > MAX_TOTAL_SIZE) throw new CardError('The card is too large.');
    const raw = bytes.subarray(dataStart + offset, dataStart + offset + stored);
    let data;
    if (compression === 'deflate') data = await inflate(raw);
    else if (compression === 'none') data = raw.slice();
    else throw new CardError(`Unknown compression for ${path}`);
    if (data.length !== size || (await sha256Hex(data)) !== sha256) throw new CardError(`File is damaged: ${path}`);
    files.set(path, data);
  }
  if (!files.has(manifest.model.path)) throw new CardError('The model file is missing from the card.');
  return { manifest, preview: bytes.slice(0, location.start), files };
}

/** True for a Koikatsu / Koikatsu Party / Sunshine character card (data after IEND with its marker). */
export function isKoikatsuCard(bytes) {
  const end = findPngEnd(bytes);
  if (end < 0 || end >= bytes.length) return false;
  const tail = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(end, Math.min(bytes.length, end + 64)));
  return /【(KoiKatu|KoiKatsu|KoiKatuChara|EroMakeChara|AIS_Chara|KoiKatuCharaS|KoiKatuCharaSun)/.test(tail);
}
