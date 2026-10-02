import test from 'node:test';
import assert from 'node:assert/strict';
import { appStorage, DATABASE_NAME, ALLOW_AUTOMATIC_SYNC } from '../js/release-config.js';
import { loadApp, memoryStorage } from './helpers/app.mjs';

test('beta abre IndexedDB próprio e mantém preferências, sessão ativa e exclusões isoladas', async () => {
  const opened = [];
  globalThis.indexedDB = { open(name, version) { opened.push([name, version]); return {}; } };
  await import('../js/store.js');
  assert.equal(DATABASE_NAME, 'QuizEngineV3Beta');
  assert.deepEqual(opened, [['QuizEngineV3Beta', 2]]);
  globalThis.localStorage = memoryStorage({ activeSessionId: 'stable', pendingDeletes: '{"stable":"ontem"}', vs_darkMode: 'true' });
  assert.equal(appStorage.getItem('activeSessionId'), null);
  assert.equal(appStorage.getItem('pendingDeletes'), null);
  assert.equal(appStorage.getItem('vs_darkMode'), null);
  appStorage.setItem('activeSessionId', 'beta');
  appStorage.setItem('vs_darkMode', 'false');
  assert.equal(localStorage.getItem('activeSessionId'), 'stable');
  assert.equal(localStorage.getItem('vs_darkMode'), 'true');
  assert.equal(localStorage.getItem('beta:activeSessionId'), 'beta');
  appStorage.removeItem('activeSessionId');
  assert.equal(appStorage.getItem('activeSessionId'), null);
  assert.equal(localStorage.getItem('activeSessionId'), 'stable');
});

test('login não sincroniza mesmo com preferência automática antiga ativada', async () => {
  globalThis.localStorage = memoryStorage({ firebaseAutoSync: 'true', 'beta:firebaseAutoSync': 'true' });
  let syncs = 0;
  const app = loadApp({
    firebaseConfigModule: { onAuthChange(callback) { callback({ uid: 'teste' }); } },
    firebaseSyncModule: {}
  });
  app.syncNow = () => { syncs++; };
  await app.initFirebaseAsync();
  assert.equal(ALLOW_AUTOMATIC_SYNC, false);
  assert.equal(app.firebaseState.connected, true);
  assert.equal(app.firebaseState.autoSync, false);
  assert.equal(app.elements.chkFirebaseAutoSync.checked, false);
  assert.equal(app.elements.chkFirebaseAutoSync.disabled, true);
  assert.equal(syncs, 0);
  assert.equal(localStorage.getItem('firebaseAutoSync'), 'true');
});

test('salvar sessão marca pendência sem agendar sincronização', () => {
  let timers = 0; let saved;
  const app = loadApp({ saveSession: (session) => { saved = session; }, setTimeout: () => { timers++; } });
  app.firebaseConfig = {}; app.firebaseState.connected = true;
  app.firebaseState.autoSync = true; // A política deve bloquear mesmo um estado indevido.
  app.activeSessionId = 'beta-session';
  app.save();
  assert.equal(saved.sessionId, 'beta-session');
  assert.equal(app.firebaseState.pendingChanges, true);
  assert.equal(timers, 0);
});

test('entregar todas não sincroniza automaticamente', () => {
  let syncs = 0;
  const app = loadApp();
  app.firebaseState.connected = true; app.firebaseState.autoSync = true;
  app.state.questions = [{ tipo: 'ME', gabarito: 'A' }];
  app.state.mappings.qOrder = [0];
  app.save = () => {}; app.applyCommentCollapseMode = () => {};
  app.renderer = { render() {} }; app.syncNow = () => { syncs++; };
  app.submitAll();
  assert.equal(app.state.userAnswers[0].submitted, true);
  assert.equal(syncs, 0);
});

test('exclusões ficam locais até sincronização manual, que continua enviando e baixando sessões', async () => {
  globalThis.localStorage = memoryStorage({ pendingDeletes: '{"stable":"ontem"}' });
  const uploaded = []; const downloaded = []; const saved = []; const removed = []; const tombstones = [];
  const app = loadApp({
    getAllSessions: async () => [{ sessionId: 'local', updatedAt: '2026-10-02' }],
    loadSession: async (id) => ({ sessionId: id, state: {} }),
    saveSession: async (session) => { saved.push(session.sessionId); },
    loadSessionFolders: async () => null
  });
  app.firebaseConfig = {}; app.firebaseState.connected = true;
  app.firebaseSync = {
    recordDeletedSession() { assert.fail('envio automático de exclusão'); },
    downloadDeletedSessionTombstones: async () => ({}),
    uploadDeletedSessionTombstones: async (data) => { tombstones.push(data); return true; },
    deleteRemoteSession: async (id) => { removed.push(id); },
    getRemoteSessionList: async () => [{ sessionId: 'remote', updatedAt: '2026-10-02' }],
    uploadSession: async (session) => { uploaded.push(session.sessionId); return true; },
    downloadSession: async (id) => { downloaded.push(id); return { sessionId: id, state: {} }; },
    downloadSessionFolders: async () => null
  };
  await app._markSessionDeleted('deleted-beta', '2026-10-02');
  assert.deepEqual(JSON.parse(appStorage.getItem('pendingDeletes')), { 'deleted-beta': '2026-10-02' });
  assert.equal(app.firebaseState.pendingChanges, true);
  assert.equal(uploaded.length + downloaded.length + removed.length, 0);
  app.bindEvents();
  // Também verifica que um evento forçado não consegue ativar o automático.
  const checkbox = app.elements.chkFirebaseAutoSync;
  checkbox.checked = true;
  checkbox.listeners.get('change')({ target: checkbox });
  assert.equal(checkbox.checked, false); assert.equal(app.firebaseState.autoSync, false);
  await app.elements.btnFirebaseSyncNow.listeners.get('click')();
  assert.deepEqual(uploaded, ['local']); assert.deepEqual(downloaded, ['remote']);
  assert.deepEqual(saved, ['remote']); assert.deepEqual(removed, ['deleted-beta']);
  assert.deepEqual(JSON.parse(JSON.stringify(tombstones)), [{ 'deleted-beta': '2026-10-02' }]);
  assert.equal(appStorage.getItem('pendingDeletes'), null);
  assert.equal(app.firebaseState.pendingChanges, false);
  assert.ok(appStorage.getItem('lastSyncTime'));
  assert.equal(localStorage.getItem('pendingDeletes'), '{"stable":"ontem"}');
});
