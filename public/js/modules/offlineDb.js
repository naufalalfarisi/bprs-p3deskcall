/**
 * BPRS Mitra Harmoni Yogyakarta — Offline-First IndexedDB Manager & Background Sync
 * Handles storage of P3 visit drafts, GPS coordinates, and photos when offline.
 */

const DB_NAME = 'BPRS_OFFLINE_P3_DB';
const DB_VERSION = 1;
const STORE_NAME = 'p3_drafts';

let _idbPromise = null;

function getDb() {
  if (_idbPromise) return _idbPromise;

  _idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'jadwalId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return _idbPromise;
}

export async function saveOfflineDraft(draft) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item = {
      ...draft,
      savedAt: new Date().toISOString()
    };
    const req = store.put(item);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineDraft(jadwalId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(jadwalId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllOfflineDrafts() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflineDraft(jadwalId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(jadwalId);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllOfflineDrafts() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function countOfflineDrafts() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

// Window global fallback
if (typeof window !== 'undefined') {
  window.saveOfflineDraft = saveOfflineDraft;
  window.getOfflineDraft = getOfflineDraft;
  window.getAllOfflineDrafts = getAllOfflineDrafts;
  window.deleteOfflineDraft = deleteOfflineDraft;
  window.countOfflineDrafts = countOfflineDrafts;
  window.clearAllOfflineDrafts = clearAllOfflineDrafts;
}
