/* ===== JS: js\store.js ===== */
const DB_NAME = 'QuizEngineV3';
const STORE_NAME = 'quizState';

const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = (e) => resolve(e.target.result);
  request.onerror = (e) => reject(e);
});

export async function saveState(state) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const copy = JSON.parse(JSON.stringify(state));
    tx.objectStore(STORE_NAME).put({ id: 'current', ...copy });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Erro ao salvar estado', e);
  }
}

export async function loadState() {
  try {
    const db = await dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('current');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error('Erro ao carregar estado', e);
    return null;
  }
}

export async function exportState() {
  const db = await dbPromise;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('current');
    req.onsuccess = () => {
      const data = req.result;
      if (!data) { resolve(null); return; }
      const { id, ...rest } = data;
      const blob = new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' });
      resolve(blob);
    };
    req.onerror = () => resolve(null);
  });
}

export async function importState(jsonObj) {
  const db = await dbPromise;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({ id: 'current', ...jsonObj });
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function clearState() {
  try {
    const db = await dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('current');
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
    });
  } catch (e) {
    console.error('Erro ao limpar estado', e);
  }
}
