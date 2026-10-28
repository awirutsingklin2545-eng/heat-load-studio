// IndexedDB storage. Everything stays on this device.
const DB = 'heat-load-studio', VER = 2;
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
let dbp = null;
const db = () => (dbp ||= open());
async function run(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode); const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export const kvGet = (k) => run('kv', 'readonly', (s) => s.get(k));
export const kvSet = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k));
export const kvDel = (k) => run('kv', 'readwrite', (s) => s.delete(k));
export const listProjects = () => run('projects', 'readonly', (s) => s.getAll());
export const getProject = (id) => run('projects', 'readonly', (s) => s.get(id));
export const putProject = (p) => run('projects', 'readwrite', (s) => s.put(p));
export const deleteProject = (id) => run('projects', 'readwrite', (s) => s.delete(id));
export async function persist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
