import test from 'node:test';
import assert from 'node:assert/strict';
import { appStorage, DATABASE_NAME, ALLOW_AUTOMATIC_SYNC, RELEASE_CHANNEL } from '../js/release-config.js';
import { loadApp, memoryStorage } from './helpers/app.mjs';

test('estável reutiliza IndexedDB e chaves originais, preservando os dados de teste da beta', async () => {
  const opened = [];
  globalThis.indexedDB = { open(name, version) { opened.push([name, version]); return {}; } };
  await import('../js/store.js');
  assert.equal(RELEASE_CHANNEL, 'stable');
  assert.equal(DATABASE_NAME, 'QuizEngineV3');
  assert.deepEqual(opened, [['QuizEngineV3', 2]]);
  globalThis.localStorage = memoryStorage({
    activeSessionId: 'original', pendingDeletes: '{"original":"ontem"}', vs_darkMode: 'true',
    'beta:activeSessionId': 'teste', 'beta:vs_darkMode': 'false', 'beta:pendingDeletes': '{}'
  });
  assert.equal(appStorage.getItem('activeSessionId'), 'original');
  assert.equal(appStorage.getItem('pendingDeletes'), '{"original":"ontem"}');
  assert.equal(appStorage.getItem('vs_darkMode'), 'true');
  appStorage.setItem('activeSessionId', 'stable-session'); appStorage.setItem('vs_darkMode', 'false');
  assert.equal(localStorage.getItem('activeSessionId'), 'stable-session');
  assert.equal(localStorage.getItem('beta:activeSessionId'), 'teste');
  assert.equal(localStorage.getItem('beta:vs_darkMode'), 'false');
  appStorage.removeItem('activeSessionId');
  assert.equal(appStorage.getItem('activeSessionId'), null);
  assert.equal(localStorage.getItem('beta:activeSessionId'), 'teste');
});

test('login restaura a preferência estável de sync automático e libera o controle', async () => {
  assert.equal(ALLOW_AUTOMATIC_SYNC, true);
  for (const enabled of [true, false]) {
    globalThis.localStorage = memoryStorage({ firebaseAutoSync: String(enabled), 'beta:firebaseAutoSync': String(!enabled) });
    let syncs = 0;
    const app = loadApp({
      firebaseConfigModule: { onAuthChange(callback) { callback({ uid: 'teste' }); } },
      firebaseSyncModule: {}
    });
    app.syncNow = () => syncs++;
    await app.initFirebaseAsync();
    assert.equal(app.firebaseState.connected, true);
    assert.equal(app.firebaseState.autoSync, enabled);
    assert.equal(app.elements.chkFirebaseAutoSync.checked, enabled);
    assert.equal(app.elements.chkFirebaseAutoSync.disabled, false);
    assert.equal(syncs, enabled ? 1 : 0);
  }
});

test('controle de sync automático permite ativar e desativar e grava a preferência original', () => {
  globalThis.localStorage = memoryStorage({ 'beta:firebaseAutoSync': 'false' });
  const app = loadApp(); app.bindEvents();
  const checkbox = app.elements.chkFirebaseAutoSync;
  for (const enabled of [true, false]) {
    checkbox.checked = enabled; checkbox.listeners.get('change')({ target: checkbox });
    assert.equal(checkbox.checked, enabled);
    assert.equal(app.firebaseState.autoSync, enabled);
    assert.equal(localStorage.getItem('firebaseAutoSync'), String(enabled));
  }
  assert.equal(localStorage.getItem('beta:firebaseAutoSync'), 'false');
});

test('salvar sessão agenda sync com debounce somente quando conectado e habilitado', () => {
  for (const [connected, enabled] of [[true, true], [true, false], [false, true]]) {
    let saved; const timers = []; let syncs = 0;
    const app = loadApp({ saveSession: (session) => { saved = session; }, setTimeout: (callback, delay) => { timers.push({ callback, delay }); return 1; } });
    app.firebaseConfig = {}; app.firebaseState.connected = connected; app.firebaseState.autoSync = enabled;
    app.activeSessionId = 'stable-session'; app.syncNow = () => syncs++;
    app.save();
    assert.equal(saved.sessionId, 'stable-session');
    assert.equal(timers.length, connected && enabled ? 1 : 0);
    if (timers.length) { assert.equal(timers[0].delay, 30000); timers[0].callback(); assert.equal(syncs, 1); }
  }
});

test('entregar todas volta a sincronizar automaticamente quando habilitado', () => {
  for (const enabled of [true, false]) {
    let syncs = 0; const app = loadApp();
    app.firebaseState.connected = true; app.firebaseState.autoSync = enabled;
    app.state.questions = [{ tipo: 'ME', gabarito: 'A' }]; app.state.mappings.qOrder = [0];
    app.save = () => {}; app.applyCommentCollapseMode = () => {};
    app.renderer = { render() {} }; app.syncNow = () => syncs++;
    app.submitAll();
    assert.equal(app.state.userAnswers[0].submitted, true);
    assert.equal(syncs, enabled ? 1 : 0);
  }
});

test('exclusões conectadas registram tombstone e limpam a pendência após confirmação', async () => {
  globalThis.localStorage = memoryStorage();
  const records = []; const app = loadApp(); app.firebaseState.connected = true;
  app.firebaseSync = { recordDeletedSession: async (...args) => { records.push(args); return true; } };
  await app._markSessionDeleted('deleted-stable', '2026-10-03');
  assert.deepEqual(records, [['deleted-stable', '2026-10-03']]);
  assert.equal(appStorage.getItem('pendingDeletes'), null);
});

test('sync manual continua enviando/baixando sessões e processa exclusões pendentes após falha', async () => {
  globalThis.localStorage = memoryStorage({ 'beta:pendingDeletes': '{"teste":"ontem"}' });
  const uploaded = [], downloaded = [], saved = [], removed = [], tombstones = [];
  const app = loadApp({
    getAllSessions: async () => [{ sessionId: 'local', updatedAt: '2026-10-03' }],
    loadSession: async (id) => ({ sessionId: id, state: {} }),
    saveSession: async (session) => saved.push(session.sessionId), loadSessionFolders: async () => null
  });
  app.firebaseConfig = {}; app.firebaseState.connected = true; app.firebaseState.autoSync = false;
  app.firebaseSync = {
    recordDeletedSession: async () => false,
    downloadDeletedSessionTombstones: async () => ({}),
    uploadDeletedSessionTombstones: async (data) => { tombstones.push(data); return true; },
    deleteRemoteSession: async (id) => removed.push(id),
    getRemoteSessionList: async () => [{ sessionId: 'remote', updatedAt: '2026-10-03' }],
    uploadSession: async (session) => { uploaded.push(session.sessionId); return true; },
    downloadSession: async (id) => { downloaded.push(id); return { sessionId: id, state: {} }; },
    downloadSessionFolders: async () => null
  };
  await app._markSessionDeleted('deleted-stable', '2026-10-03');
  assert.deepEqual(JSON.parse(appStorage.getItem('pendingDeletes')), { 'deleted-stable': '2026-10-03' });
  app.bindEvents(); await app.elements.btnFirebaseSyncNow.listeners.get('click')();
  assert.deepEqual(uploaded, ['local']); assert.deepEqual(downloaded, ['remote']);
  assert.deepEqual(saved, ['remote']); assert.deepEqual(removed, ['deleted-stable']);
  assert.deepEqual(JSON.parse(JSON.stringify(tombstones)), [{ 'deleted-stable': '2026-10-03' }]);
  assert.equal(appStorage.getItem('pendingDeletes'), null);
  assert.equal(app.firebaseState.pendingChanges, false);
  assert.ok(appStorage.getItem('lastSyncTime'));
  assert.equal(localStorage.getItem('beta:pendingDeletes'), '{"teste":"ontem"}');
});
