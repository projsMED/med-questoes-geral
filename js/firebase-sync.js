/* ===== JS: js/firebase-sync.js ===== */
import { db, isLoggedIn } from './firebase-config.js';
import {
  doc, setDoc, getDoc, getDocs, deleteDoc,
  collection, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const MAX_CHUNK_SIZE = 800 * 1024; // 800KB, bem abaixo do limite de 1MB do Firestore

// ===== Compressão/Descompressão (CompressionStream API nativa) =====

async function compress(data) {
  const jsonStr = JSON.stringify(data);
  const blob = new Blob([jsonStr]);
  const cs = new CompressionStream('gzip');
  const compressedStream = blob.stream().pipeThrough(cs);
  const compressedBlob = await new Response(compressedStream).blob();
  const buffer = await compressedBlob.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

async function decompress(base64Data) {
  const buffer = base64ToArrayBuffer(base64Data);
  const blob = new Blob([buffer]);
  const ds = new DecompressionStream('gzip');
  const decompressedStream = blob.stream().pipeThrough(ds);
  const decompressedBlob = await new Response(decompressedStream).blob();
  const text = await decompressedBlob.text();
  return JSON.parse(text);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ===== Operações Firestore =====

export async function uploadSession(session) {
  if (!isLoggedIn()) return false;

  try {
    const { state, ...metadata } = session;
    const compressed = await compress(state);

    // Dividir em chunks se necessário
    const chunks = [];
    for (let i = 0; i < compressed.length; i += MAX_CHUNK_SIZE) {
      chunks.push(compressed.substring(i, i + MAX_CHUNK_SIZE));
    }

    // Salvar documento principal (metadados)
    const sessionRef = doc(db, 'sessions', session.sessionId);
    await setDoc(sessionRef, {
      ...metadata,
      chunkCount: chunks.length,
      compressed: true
    });

    // Salvar chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkRef = doc(db, 'sessions', session.sessionId, 'chunks', String(i));
      await setDoc(chunkRef, { data: chunks[i] });
    }

    return true;
  } catch (e) {
    console.error('Erro ao enviar sessão para Firebase:', e);
    return false;
  }
}

export async function downloadSession(sessionId) {
  if (!isLoggedIn()) return null;

  try {
    const sessionRef = doc(db, 'sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) return null;

    const metadata = sessionSnap.data();
    const { chunkCount, compressed, ...rest } = metadata;

    // Buscar todos os chunks em paralelo
    const chunkPromises = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkRef = doc(db, 'sessions', sessionId, 'chunks', String(i));
      chunkPromises.push(getDoc(chunkRef));
    }

    const chunkSnaps = await Promise.all(chunkPromises);
    const compressedData = chunkSnaps.map(s => s.data().data).join('');

    const state = await decompress(compressedData);

    return {
      ...rest,
      sessionId,
      state
    };
  } catch (e) {
    console.error('Erro ao baixar sessão do Firebase:', e);
    return null;
  }
}

export async function getRemoteSessionList() {
  if (!isLoggedIn()) return [];

  try {
    const sessionsRef = collection(db, 'sessions');
    const snapshot = await getDocs(sessionsRef);

    return snapshot.docs.map(d => {
      const data = d.data();
      const { chunkCount, compressed, ...metadata } = data;
      return { ...metadata, sessionId: d.id };
    });
  } catch (e) {
    console.error('Erro ao listar sessões remotas:', e);
    return [];
  }
}

// ===== Pastas de Sessões =====

export async function uploadSessionFolders(data) {
  if (!isLoggedIn()) return false;
  try {
    const ref = doc(db, 'meta', 'sessionFolders');
    await setDoc(ref, data);
    return true;
  } catch (e) {
    console.error('Erro ao enviar pastas para Firebase:', e);
    return false;
  }
}

export async function downloadSessionFolders() {
  if (!isLoggedIn()) return null;
  try {
    const ref = doc(db, 'meta', 'sessionFolders');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (e) {
    console.error('Erro ao baixar pastas do Firebase:', e);
    return null;
  }
}

// ===== Registro de Sessões Deletadas =====

const DELETED_SESSIONS_DOC = 'deletedSessions';

export async function downloadDeletedSessionTombstones() {
  if (!isLoggedIn()) return {};
  try {
    const ref = doc(db, 'meta', DELETED_SESSIONS_DOC);
    const snap = await getDoc(ref);
    if (!snap.exists()) return {};
    const data = snap.data();
    return data.ids || {};
  } catch (e) {
    console.error('Erro ao baixar registro de sessões deletadas:', e);
    return {};
  }
}

export async function uploadDeletedSessionTombstones(tombstones) {
  if (!isLoggedIn()) return false;
  try {
    const ref = doc(db, 'meta', DELETED_SESSIONS_DOC);
    const existingSnap = await getDoc(ref);
    const existing = existingSnap.exists() ? (existingSnap.data().ids || {}) : {};
    const merged = { ...existing, ...tombstones };

    await setDoc(ref, {
      ids: merged,
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (e) {
    console.error('Erro ao enviar registro de sessões deletadas:', e);
    return false;
  }
}

export async function recordDeletedSession(sessionId, deletedAt = new Date().toISOString()) {
  if (!isLoggedIn()) return false;
  const ok = await uploadDeletedSessionTombstones({ [sessionId]: deletedAt });
  if (!ok) return false;
  await deleteRemoteSession(sessionId);
  return true;
}

export async function deleteRemoteSession(sessionId) {
  if (!isLoggedIn()) return false;

  try {
    // Deletar chunks primeiro
    const chunksRef = collection(db, 'sessions', sessionId, 'chunks');
    const chunksSnap = await getDocs(chunksRef);

    const batch = writeBatch(db);
    chunksSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'sessions', sessionId));
    await batch.commit();

    return true;
  } catch (e) {
    console.error('Erro ao deletar sessão remota:', e);
    return false;
  }
}
