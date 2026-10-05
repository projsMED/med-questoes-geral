import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizePagination, readGlobalPagination, effectivePagination, buildQuestionPages,
  pageForQuestion, PaginationSettings } from '../js/pagination.js';
import { QuizRenderer } from '../js/renderer.js';
import { appStorage } from '../js/release-config.js';
import { matchingFixture, MatchingElement } from './helpers/matching-dom.mjs';
import { memoryStorage, loadApp } from './helpers/app.mjs';

const settings = (pageSize = 1, exclusiveGroups = false) => ({ enabled: true, pageSize, exclusiveGroups });
const groups = [null, null, 'a', 'a', 'a', 'a', null, null, null];
const questions = groups.map((id) => id ? { _groupData: { id, text: 'Texto-base' } } : {});
const order = questions.map((_, index) => index);

test('páginas respeitam limites, grupos grandes, exclusividade e ordem embaralhada', () => {
  assert.deepEqual(buildQuestionPages(questions, order, settings(3)), [
    { start: 0, end: 2 }, { start: 2, end: 6 }, { start: 6, end: 9 }
  ]);
  assert.deepEqual(buildQuestionPages(questions, order, settings(8, true)), [
    { start: 0, end: 2 }, { start: 2, end: 6 }, { start: 6, end: 9 }
  ]);
  assert.deepEqual(buildQuestionPages(questions, order, settings(8)), [
    { start: 0, end: 8 }, { start: 8, end: 9 }
  ]);
  assert.deepEqual(buildQuestionPages(questions, [], settings()), []);
  assert.deepEqual(buildQuestionPages(questions, order, { enabled: false }), [{ start: 0, end: 9 }]);
  for (const exclusive of [true, false]) for (let size = 1; size <= 12; size++) {
    const shuffled = [8, 2, 3, 4, 5, 7, 1, 0, 6];
    const pages = buildQuestionPages(questions, shuffled, settings(size, exclusive));
    assert.deepEqual(pages.flatMap(({ start, end }) => shuffled.slice(start, end)), shuffled);
    const groupPages = [2, 3, 4, 5].map((idx) => pageForQuestion(pages, shuffled, idx));
    assert.equal(new Set(groupPages).size, 1);
    const groupPage = pages[groupPages[0]];
    if (exclusive) assert.equal(groupPage.end - groupPage.start, 4);
    for (const page of pages) {
      if (page.end - page.start > size) assert.equal(page, groupPage);
    }
  }
});

test('herança é dinâmica; valores próprios, inclusive lista contínua, sobrevivem ao JSON', () => {
  globalThis.localStorage = memoryStorage();
  const state = { config: {} };
  assert.deepEqual(effectivePagination(state), normalizePagination());
  appStorage.setItem('gs_pagination', JSON.stringify(settings(3, true)));
  assert.deepEqual(effectivePagination(state), settings(3, true));
  state.config.pagination = { enabled: false, pageSize: 5, exclusiveGroups: false };
  const restored = JSON.parse(JSON.stringify(state));
  appStorage.setItem('gs_pagination', JSON.stringify(settings(9)));
  assert.deepEqual(effectivePagination(restored), state.config.pagination);
  delete restored.config.pagination;
  assert.deepEqual(effectivePagination(restored), settings(9));
  appStorage.setItem('gs_pagination', '{broken');
  assert.deepEqual(readGlobalPagination(), normalizePagination());
  for (const size of [0, -1, 2.5, Infinity, 'invalid']) assert.equal(normalizePagination({ pageSize: size }).pageSize, 1);
});

test('controles globais e da sessão preservam independência, troca de sessão e limpeza de eventos', () => {
  const f = matchingFixture();
  let state = { config: {} };
  let active = true;
  const changes = [];
  const root = new MatchingElement();
  const controls = new PaginationSettings({ root, getState: () => state, hasSession: () => active,
    onChange: (sessionChange) => changes.push(sessionChange) });
  const change = (key, scope, value) => {
    const input = root.querySelector(`[data-paging="${key}"]${scope ? `[data-scope="${scope}"]` : ''}`);
    if (key === 'custom' || key === 'exclusiveGroups') input.checked = value;
    else input.value = String(value);
    root.emit('change', { target: input });
  };
  change('enabled', 'global', true);
  change('pageSize', 'global', 3);
  change('custom', null, true);
  assert.deepEqual(state.config.pagination, settings(3));
  change('pageSize', 'session', 5);
  change('exclusiveGroups', 'session', true);
  change('pageSize', 'global', 8);
  assert.deepEqual(effectivePagination(state), settings(5, true));
  assert.deepEqual(readGlobalPagination(), settings(8));
  const saved = JSON.stringify(state);
  state = { config: {} }; controls.refresh();
  assert.equal(root.querySelector('[data-paging="custom"]').checked, false);
  state = JSON.parse(saved); controls.refresh();
  assert.equal(root.querySelector('[data-paging="pageSize"][data-scope="session"]').value, '5');
  change('pageSize', 'session', 0);
  assert.equal(state.config.pagination.pageSize, 5);
  change('custom', null, false);
  assert.deepEqual(effectivePagination(state), settings(8));
  assert.equal(changes.at(-1), true);
  active = false; controls.refresh();
  assert.equal(root.querySelector('[data-paging-session="true"]').classList.contains('hidden'), true);
  controls.dispose();
  change('pageSize', 'global', 2);
  assert.equal(readGlobalPagination().pageSize, 8);
});

function rendererFixture() {
  const f = matchingFixture();
  f.win.scrollY = 0;
  const state = { quizJson: { titulo: 'Teste' }, questions, mappings: { qOrder: order, altOrder: {} },
    config: { pagination: settings(3), showTags: true, showFolders: true }, userAnswers: {} };
  let changes = 0;
  const renderer = new QuizRenderer('quizContainer', 'footerBar', { onPageChange: () => changes++ });
  // Os cartões complexos já têm testes próprios; aqui verificamos montagem, limites e navegação.
  renderer.createQuestionCard = (q, originalIdx, visualIdx) => {
    const card = new MatchingElement(); card.className = 'question-card';
    card.dataset.originalIdx = originalIdx; card.dataset.visualIdx = visualIdx;
    return card;
  };
  renderer.highlighter = { beginRender() {}, finishRender() {}, updateControls() {},
    createControlsHtml: () => '', setupControls() {}, registerTarget() {} };
  renderer.updateFooter = () => {};
  renderer.scrollToReadingPosition = () => {};
  return { ...f, state, renderer, changes: () => changes };
}

test('renderer monta só a página atual, mantém numeração e grupo; contador e posição restauram', () => {
  const f = rendererFixture();
  const { state, renderer } = f;
  renderer.render(state); f.flush();
  assert.equal(f.shell.querySelectorAll('.question-card').length, 2);
  assert.equal(f.doc.getElementById('paginationQuestionRange').innerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(), 'Questões 1–2 de 9');
  assert.equal(renderer.previousPageButton.disabled, true);
  renderer.nextPageButton.emit('click'); f.flush();
  assert.equal(state.paginationAnchor, 2);
  assert.equal(f.shell.querySelectorAll('.question-card').length, 4);
  assert.equal(f.shell.querySelectorAll('.question-group').length, 1);
  assert.deepEqual(f.shell.querySelectorAll('.question-card').map((card) => card.dataset.visualIdx), [2, 3, 4, 5]);
  assert.equal(f.doc.getElementById('paginationPageCount').textContent, 'Página 2 de 3');
  state.userAnswers[3] = { submitted: true, connections: [{ leftOrigIdx: 0, rightOrigIdx: 1 }], text: 'Resposta' };
  renderer.nextPageButton.emit('click'); f.flush();
  assert.equal(renderer.nextPageButton.disabled, true);
  assert.equal(renderer.goToPage(3), false);
  renderer.render(JSON.parse(JSON.stringify(state))); f.flush();
  assert.equal(renderer._pageIndex, 2);
  renderer.revealQuestion(3); f.flush();
  assert.equal(renderer._pageIndex, 1);
  assert.equal(renderer._state.userAnswers[3].text, 'Resposta');
  renderer.clear();
  assert.equal(f.doc.getElementById('quizPagination').classList.contains('hidden'), true);
  assert.equal(f.doc.body.classList.contains('quiz-paged'), false);
});

test('uma questão por página omite contador redundante e mudar tamanho mantém a questão de referência', () => {
  const f = rendererFixture();
  f.state.mappings.qOrder = [0, 1, 6, 7, 8];
  f.state.config.pagination = settings();
  f.renderer.render(f.state);
  f.renderer.goToPage(3);
  assert.equal(f.state.paginationAnchor, 7);
  assert.equal(f.doc.getElementById('paginationPageCount').classList.contains('hidden'), true);
  assert.equal(f.doc.getElementById('paginationQuestionRange').innerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(), 'Questão 4 de 5');
  f.state.config.pagination.pageSize = 2;
  f.renderer.render(f.state);
  assert.equal(f.renderer._pageIndex, 1);
  assert.equal(f.doc.getElementById('paginationQuestionRange').innerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(), 'Questões 3–4 de 5');
  f.state.config.pagination.enabled = false;
  f.renderer.render(f.state);
  assert.equal(f.shell.querySelectorAll('.question-card').length, 5);
  assert.equal(f.doc.getElementById('quizPagination').classList.contains('hidden'), true);
  f.renderer.clear();
});

test('salvar e reabrir sessão preserva configuração própria e ponto de estudo', async () => {
  globalThis.localStorage = memoryStorage();
  let saved;
  const app = loadApp({ saveSession: (value) => { saved = JSON.parse(JSON.stringify(value)); },
    loadSession: async () => JSON.parse(JSON.stringify(saved)) });
  app.activeSessionId = 'paging-session';
  app.state.quizJson = { titulo: 'Paginação' };
  app.state.config.pagination = settings(5, true);
  app.state.paginationAnchor = 7;
  app.save();
  app.state.config.pagination = settings(1);
  app.state.paginationAnchor = 0;
  app.restoreUI = () => {};
  app.quizFilters = { clear() {}, renderFilterDescription() {}, prepareStep1() {}, prepareStep2() {} };
  app.renderer = { clear() {} };
  await app.loadSessionFromList('paging-session');
  assert.deepEqual(JSON.parse(JSON.stringify(app.state.config.pagination)), settings(5, true));
  assert.equal(app.state.paginationAnchor, 7);
});

test('Firebase comprime e recupera configuração e posição no estado da sessão', async () => {
  const documents = new Map();
  const source = readFileSync(new URL('../js/firebase-sync.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm, '').replace(/export /g, '');
  const api = vm.runInNewContext(`${source}\n({ uploadSession, downloadSession });`, {
    db: {}, isLoggedIn: () => true, doc: (_, ...parts) => parts.join('/'),
    setDoc: async (key, value) => documents.set(key, structuredClone(value)),
    getDoc: async (key) => ({ exists: () => documents.has(key), data: () => documents.get(key) }),
    Blob, Response, CompressionStream, DecompressionStream, Uint8Array, btoa, atob, console
  });
  const session = { sessionId: 'pagination-test', updatedAt: '2026-10-04', state: {
    config: { pagination: settings(3, true) }, paginationAnchor: 6, userAnswers: { 2: { text: 'Texto preservado' } }
  } };
  assert.equal(await api.uploadSession(session), true);
  const restored = await api.downloadSession(session.sessionId);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), session);
  delete session.state.config.pagination;
  await api.uploadSession(session);
  const inherited = await api.downloadSession(session.sessionId);
  assert.equal(Object.hasOwn(inherited.state.config, 'pagination'), false);
});

test('configurações no controlador salvam só a sessão personalizada e não sobrescrevem seu modo pelo global', () => {
  const f = matchingFixture();
  const app = loadApp({ document: f.doc, window: f.win, PaginationSettings });
  let renders = 0, saves = 0;
  app.renderer = { render: () => renders++, captureReadingPosition() {} };
  app.applyCommentCollapseMode = () => {};
  app.save = () => saves++;
  app.activeSessionId = 'own';
  app.state.quizJson = {};
  app.state.mappings.qOrder = [0];
  app.initPaginationSettings();
  const root = f.doc.getElementById('paginationSettings');
  const custom = root.querySelector('[data-paging="custom"]');
  custom.checked = true;
  root.emit('change', { target: custom });
  assert.equal(saves, 1);
  assert.equal(renders, 1);
  const globalMode = root.querySelector('[data-paging="enabled"][data-scope="global"]');
  globalMode.value = 'true';
  root.emit('change', { target: globalMode });
  assert.equal(renders, 1);
  assert.equal(app.state.config.pagination.enabled, false);
  custom.checked = false;
  root.emit('change', { target: custom });
  assert.equal(renders, 2);
  assert.equal(saves, 2);
  assert.equal(effectivePagination(app.state).enabled, true);
  app.paginationSettings.dispose();
});

test('próxima não respondida atravessa páginas e responder todas abrange questões fora do DOM', () => {
  const f = rendererFixture();
  const app = loadApp({ document: f.doc, window: f.win });
  Object.assign(app.state, f.state);
  app.renderer = f.renderer;
  app.save = () => {};
  app.applyCommentCollapseMode = () => {};
  app.expandAllComments = () => {};
  app.state.userAnswers = { 0: { submitted: true }, 1: { submitted: true } };
  app.renderer.render(app.state);
  app.renderer.createQuestionCard = (q, idx) => {
    const card = new MatchingElement(); card.className = 'question-card';
    card.dataset.originalIdx = idx; card.scrollIntoView = () => {};
    return card;
  };
  app.scrollToNextUnanswered();
  assert.equal(app.renderer._pageIndex, 1);
  assert.equal(app.state.paginationAnchor, 2);
  app.submitAll();
  for (const index of order) assert.equal(app.state.userAnswers[index].submitted, true);
  assert.equal(f.shell.querySelectorAll('.question-card').length, 4);
  app.renderer.clear();
});

test('associações e texto digitado continuam no estado ao navegar, e observadores das setas são liberados', () => {
  const f = rendererFixture();
  f.state.questions = [{ tipo: 'MQ', coluna_esquerda: { itens: [{ texto: 'Um' }] },
    coluna_direita: { itens: [{ texto: 'A' }] } }, { tipo: 'ESCRITA' }];
  f.state.mappings.qOrder = [0, 1];
  f.state.config.pagination = settings();
  f.renderer.matchingQuestions.onChange = (idx, connections) => { f.state.userAnswers[idx] = { connections }; };
  f.renderer.createQuestionCard = (q, idx) => {
    const card = new MatchingElement(); card.className = 'question-card'; card.dataset.originalIdx = idx;
    if (q.tipo === 'MQ') card.appendChild(f.renderer.matchingQuestions.render(q, idx, f.state, false, false, f.state.userAnswers[idx]));
    return card;
  };
  f.renderer.render(f.state); f.flush();
  f.shell.querySelector('.mq-left-item').emit('click');
  f.shell.querySelector('.mq-right-item').emit('click');
  const arrowObserver = f.observers.at(-1);
  f.renderer.goToPage(1); f.flush();
  assert.equal(arrowObserver.disconnected, true);
  f.state.userAnswers[1] = { text: 'Rascunho da resposta' };
  f.renderer.goToPage(0); f.flush();
  assert.equal(f.shell.querySelectorAll('.mq-arrow-default').length, 1);
  assert.equal(f.state.userAnswers[1].text, 'Rascunho da resposta');
  f.renderer.clear();
});

test('mapa na lista contínua encontra o cartão na ordem visual sem reconstruir respostas nem mudar páginas', () => {
  const f = rendererFixture();
  const { renderer, state } = f;
  state.config.pagination = { enabled: false };
  state.mappings.qOrder = [8, 2, 3, 4, 5, 1, 0, 6, 7];
  state.userAnswers[4] = { text: 'Rascunho preservado' };
  renderer.render(state); f.flush();
  const card = f.shell.querySelector('.question-card[data-original-idx="4"]');
  const cards = f.shell.querySelectorAll('.question-card');
  renderer.navigation.openMap();
  const list = f.doc.getElementById('questionMapList');
  list.emit('click', { target: list.querySelector('[data-question="4"]') }); f.flush();
  assert.equal(renderer.navigation.map.open, false);
  assert.equal(f.doc.activeElement, card);
  assert.deepEqual(card.lastScroll, { behavior: 'instant', block: 'start' });
  assert.equal(card.attributes.tabindex, '-1');
  assert.equal(f.changes(), 0);
  assert.equal(f.shell.querySelectorAll('.question-card')[3], cards[3]);
  assert.equal(state.userAnswers[4].text, 'Rascunho preservado');
  for (const destination of [0, 10, 1.5, NaN]) assert.equal(renderer.jumpToQuestion(destination), false);
  renderer.clear();
  assert.equal(renderer.jumpToQuestion(1), false);
  assert.equal(renderer.navigation.mapShortcut.disabled, true);
  renderer.navigation.dispose();
});

test('setas passam pelo renderer, preservam respostas e mostram a navegação no modo topo', () => {
  const f = rendererFixture();
  const { renderer, state } = f;
  renderer.scrollToReadingPosition = QuizRenderer.prototype.scrollToReadingPosition;
  localStorage.setItem('vs_paginationPosition', 'top');
  renderer.render(state); f.flush();
  state.userAnswers[0] = { text: 'Rascunho preservado' };
  f.doc.emit('keydown', { key: 'ArrowRight' }); f.flush();
  assert.equal(renderer._pageIndex, 1);
  assert.equal(state.paginationAnchor, 2);
  assert.equal(f.changes(), 1);
  assert.equal(renderer.navigation.dock.lastScroll.block, 'start');
  f.doc.emit('keydown', { key: 'ArrowLeft' }); f.flush();
  assert.equal(renderer._pageIndex, 0);
  assert.equal(state.userAnswers[0].text, 'Rascunho preservado');
  assert.equal(f.changes(), 2);
  renderer.clear(); renderer.navigation.dispose();
});

test('salto distante vai à questão visual correta dentro de grupo, inclusive na página já aberta', () => {
  const f = rendererFixture();
  f.state.mappings.qOrder = [8, 7, 6, 5, 4, 3, 2, 1, 0];
  f.state.config.pagination = settings(1);
  f.renderer.render(f.state);
  assert.equal(f.renderer.jumpToQuestion(6), true);
  assert.equal(f.renderer._pageIndex, 3);
  const target = f.shell.querySelector('.question-card[data-original-idx="3"]');
  assert.deepEqual(target.lastScroll, { behavior: 'instant', block: 'start' });
  assert.equal(f.doc.activeElement, target);
  assert.equal(f.shell.querySelectorAll('.question-card').length, 4);
  assert.equal(f.renderer.jumpToQuestion(7), true);
  assert.equal(f.renderer._pageIndex, 3);
  assert.equal(f.doc.activeElement.dataset.originalIdx, 2);
  assert.equal(f.renderer.jumpToQuestion(10), false);
  assert.equal(f.renderer.jumpToQuestion(0), false);
  f.renderer.clear();
});
