/* IndexedDB 本機儲存：資料只存在這台裝置的瀏覽器中 */
(function (root) {
  'use strict';
  const DB_NAME = 'pocketledger';
  const VERSION = 1;
  const STORES = ['entries', 'categories', 'cards', 'budgets', 'alerts', 'settings', 'receipts'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: s === 'settings' ? 'key' : (s === 'receipts' ? 'name' : 'id') });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function reqP(req) {
    return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  }

  const DB = {
    getAll(store) { return tx(store, 'readonly', s => reqP(s.getAll())); },
    get(store, key) { return tx(store, 'readonly', s => reqP(s.get(key))); },
    put(store, value) { return tx(store, 'readwrite', s => { s.put(value); }); },
    putMany(store, values) { return tx(store, 'readwrite', s => { values.forEach(v => s.put(v)); }); },
    delete(store, key) { return tx(store, 'readwrite', s => { s.delete(key); }); },
    clear(store) { return tx(store, 'readwrite', s => { s.clear(); }); },
    async clearAll() { for (const s of STORES) await DB.clear(s); },
    STORES
  };
  root.DB = DB;
})(globalThis);
