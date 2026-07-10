/* ===== JS: js\store.js ===== */
const DB_NAME = 'QuizEngineV3';
const STORE_NAME = 'quizState';
const SESSIONS_STORE = 'sessions';
const DB_VERSION = 2;

const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    // Store legado (mantido para migração)
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
    // Novo store de sessões
    if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
      const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
    }
  };
  request.onsuccess = (e) => resolve(e.target.result);
  request.onerror = (e) => reject(e);
});

// ===== Funções legadas (mantidas para compatibilidade de importação) =====

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

// ===== Funções de Sessões =====

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
}

export { generateId };

export async function saveSession(session) {
  try {
    if (!session.sessionId) {
      session.sessionId = generateId();
    }
    if (!session.updatedAt) {
      session.updatedAt = new Date().toISOString();
    }
    const db = await dbPromise;
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    const copy = JSON.parse(JSON.stringify(session));
    tx.objectStore(SESSIONS_STORE).put(copy);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Erro ao salvar sessão', e);
    return false;
  }
}

export async function loadSession(sessionId) {
  try {
    const db = await dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const req = tx.objectStore(SESSIONS_STORE).get(sessionId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error('Erro ao carregar sessão', e);
    return null;
  }
}

export async function deleteSession(sessionId) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).delete(sessionId);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Erro ao deletar sessão', e);
    return false;
  }
}

export async function getAllSessions() {
  try {
    const db = await dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const req = tx.objectStore(SESSIONS_STORE).getAll();
      req.onsuccess = () => {
        const sessions = req.result || [];
        // Retorna metadados sem o state completo para performance na listagem
        resolve(sessions.map(s => ({
          sessionId: s.sessionId,
          title: s.title,
          sourceFileName: s.sourceFileName || '',
          description: (s.state && s.state.quizJson && s.state.quizJson.descricao) || '',
          quizTitle: (s.state && s.state.quizJson && s.state.quizJson.titulo) || '',
          folderId: s.folderId || '',
          derivedFromErrors: !!(s.derivedFromErrors || (s.state && s.state.retryDerivedFromErrors)),
          createdAt: s.createdAt,
          lastAccessedAt: s.lastAccessedAt,
          updatedAt: s.updatedAt || s.lastAccessedAt || s.createdAt,
          answeredCount: s.answeredCount,
          totalCount: getEffectiveSessionTotal(s),
          sizeBytes: estimateSize(s)
        })));
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    console.error('Erro ao listar sessões', e);
    return [];
  }
}

export async function exportAllSessions() {
  try {
    const db = await dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const req = tx.objectStore(SESSIONS_STORE).getAll();
      req.onsuccess = () => {
        const sessions = req.result || [];
        if (sessions.length === 0) { resolve(null); return; }
        const blob = new Blob(
          [JSON.stringify(sessions, null, 2)],
          { type: 'application/json' }
        );
        resolve(blob);
      };
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error('Erro ao exportar sessões', e);
    return null;
  }
}

export async function importAllSessions(sessionsArray) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);
    const now = new Date().toISOString();
    sessionsArray.forEach(s => {
      if (s.sessionId) {
        store.put({
          ...s,
          updatedAt: s.updatedAt || s.lastAccessedAt || s.createdAt || now
        });
      }
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Erro ao importar sessões', e);
    return false;
  }
}

export async function clearAllSessions() {
  try {
    const db = await dbPromise;
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Erro ao limpar sessões', e);
    return false;
  }
}

// Migração: converte estado legado em sessão
export async function migrateLegacyState() {
  try {
    const legacy = await loadState();
    if (!legacy || !legacy.quizJson) return null;

    const { id, ...rest } = legacy;
    const now = new Date().toISOString();
    const title = (rest.quizJson && rest.quizJson.titulo) || 'Quiz sem título';

    // Calcula respondidas
    let answeredCount = 0;
    const totalCount = Array.isArray(rest.questions) ? rest.questions.length : 0;
    if (rest.userAnswers) {
      answeredCount = Object.values(rest.userAnswers).filter(a => a && a.submitted).length;
    }

    const session = {
      sessionId: generateId(),
      title,
      createdAt: now,
      lastAccessedAt: now,
      updatedAt: now,
      answeredCount,
      totalCount,
      state: rest
    };

    await saveSession(session);
    // Limpa o estado legado
    await clearState();

    return session;
  } catch (e) {
    console.error('Erro na migração', e);
    return null;
  }
}

// ===== Pastas de Sessões (armazenado no store legado como entrada especial) =====

export async function saveSessionFolders(folders) {
  try {
    const db = await dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id: 'sessionFolders',
      folders: JSON.parse(JSON.stringify(folders)),
      updatedAt: new Date().toISOString()
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Erro ao salvar pastas', e);
    return false;
  }
}

export async function loadSessionFolders() {
  try {
    const db = await dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('sessionFolders');
      req.onsuccess = () => {
        const result = req.result;
        resolve(result ? { folders: result.folders || [], updatedAt: result.updatedAt || '' } : { folders: [], updatedAt: '' });
      };
      req.onerror = () => resolve({ folders: [], updatedAt: '' });
    });
  } catch (e) {
    console.error('Erro ao carregar pastas', e);
    return { folders: [], updatedAt: '' };
  }
}

// Atualiza folderId de uma sessão sem recarregar o state completo
export async function updateSessionFolder(sessionId, folderId) {
  try {
    const db = await dbPromise;
    return new Promise((resolve) => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.get(sessionId);
      req.onsuccess = () => {
        const session = req.result;
        if (session) {
          const now = new Date().toISOString();
          session.folderId = folderId;
          session.updatedAt = now;
          store.put(session);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error('Erro ao mover sessão', e);
    return false;
  }
}

function estimateSize(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return 0;
  }
}

function getEffectiveSessionTotal(session) {
  const state = session && session.state;
  if (!state) return session.totalCount || 0;
  if (typeof state.sessionQuestionCount === 'number') return state.sessionQuestionCount;
  if (state.mappings && Array.isArray(state.mappings.qOrder) && state.mappings.qOrder.length > 0) {
    const forced = Array.isArray(state.forcedIndices) ? state.forcedIndices : [];
    return state.mappings.qOrder.filter((idx) => !forced.includes(idx)).length;
  }
  if (state.retryMode && Array.isArray(state.retryIndices)) {
    return state.retryIndices.length;
  }
  return session.totalCount || (Array.isArray(state.questions) ? state.questions.length : 0);
}
