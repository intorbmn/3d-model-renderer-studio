// A set of user files (a model and everything next to it), addressed by relative path.

export const MODEL_PRIORITY = ['pmx', 'pmd', 'vrm', 'glb', 'gltf'];

export function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
}

function normalise(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}

export class FileSet {
  /** @param {Map<string, Blob>} entries relative path → contents */
  constructor(entries) {
    this.entries = new Map();
    for (const [path, blob] of entries) this.entries.set(normalise(path), blob);
    this.urls = new Map();
  }

  /** From an <input type=file multiple webkitdirectory> selection or a list of dropped files. */
  static fromFiles(files) {
    const list = [...files];
    const entries = new Map();
    // Drop the shared top folder so paths are relative to the model's folder.
    const paths = list.map((f) => normalise(f.webkitRelativePath || f.relativePath || f.name));
    const first = paths[0]?.split('/')[0];
    const shared = paths.length > 0 && paths.every((p) => p.includes('/') && p.split('/')[0] === first);
    list.forEach((file, i) => entries.set(shared ? paths[i].slice(first.length + 1) : paths[i], file));
    return new FileSet(entries);
  }

  /** From a card: path → bytes. */
  static fromBytes(map) {
    const entries = new Map();
    for (const [path, bytes] of map) entries.set(path, new Blob([bytes]));
    return new FileSet(entries);
  }

  get paths() {
    return [...this.entries.keys()];
  }

  /** The model file the mod would pick: by format priority, then the shortest path. */
  findModel() {
    for (const type of MODEL_PRIORITY) {
      const candidates = this.paths.filter((p) => extensionOf(p) === type).sort((a, b) => a.length - b.length || a.localeCompare(b));
      if (candidates.length > 0) return { path: candidates[0], type };
    }
    return null;
  }

  /** Finds the file a model refers to, tolerating Windows separators, case and folder differences. */
  resolve(reference, baseDir = '') {
    if (!reference) return null;
    let ref = normalise(decodeURIComponent(reference.replace(/^blob:.*\//, '')));
    const direct = [ref, baseDir ? `${baseDir}/${ref}` : ref].map(normalise);
    for (const candidate of direct) if (this.entries.has(candidate)) return candidate;
    const lower = ref.toLowerCase();
    const byLower = this.paths.filter((p) => p.toLowerCase() === lower || p.toLowerCase().endsWith('/' + lower));
    if (byLower.length > 0) return byLower[0];
    const base = lower.split('/').pop();
    const byName = this.paths.filter((p) => p.toLowerCase().split('/').pop() === base);
    return byName.length > 0 ? byName[0] : null;
  }

  url(path) {
    if (!this.urls.has(path)) this.urls.set(path, URL.createObjectURL(this.entries.get(path)));
    return this.urls.get(path);
  }

  async bytes(path) {
    return new Uint8Array(await this.entries.get(path).arrayBuffer());
  }

  dispose() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

/** Reads dropped items, descending into folders (DataTransferItem.webkitGetAsEntry). */
export async function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length === 0) return [...dataTransfer.files];
  const out = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      file.relativePath = prefix + file.name;
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length > 0);
    }
  }
  for (const entry of entries) await walk(entry, '');
  return out;
}
