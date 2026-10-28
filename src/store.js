// Minimal IndexedDB key-value store. Everything stays on this device.
const DB = 'heat-load-studio', STORE = 'kv', VER = 1;
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const s = t.objectStore(STORE); const out = fn(s);
    t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error);
  });
}
export const kvGet = (k) => tx('readonly', (s) => s.get(k));
export const kvSet = (k, v) => tx('readwrite', (s) => s.put(v, k));
export const kvDel = (k) => tx('readwrite', (s) => s.delete(k));
export async function persist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
