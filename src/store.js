// Things the studio keeps in this browser: the user's base model for "New character" and the saved
// default values per model. Nothing leaves the browser.

const DB = 'studio';
const STORE = 'kv';

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function get(key) {
  try {
    return await run('readonly', (s) => s.get(key));
  } catch {
    return undefined; // storage unavailable (private window, blocked site data)
  }
}

export async function set(key, value) {
  try {
    await run('readwrite', (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function remove(key) {
  try {
    await run('readwrite', (s) => s.delete(key));
  } catch { /* nothing to remove */ }
}
