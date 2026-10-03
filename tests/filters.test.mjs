import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilterState, ensureFilterState, selectQuestionGroups } from '../js/filters.js';
import { questionTypes } from '../js/utils.js';
import { loadApp, memoryStorage } from './helpers/app.mjs';
import { MatchingElement, matchingFixture } from './helpers/matching-dom.mjs';

const pathA = 'Raiz > A', pathB = 'Raiz > B';
function questions() {
  const q = (tipo, path, tags, dificuldade, grouped = false) => ({
    tipo, _path: path.split(' > '), tags, dificuldade,
    ...(grouped ? { _groupData: { id: 'grupo' } } : {}), alternativas: [{ texto: 'A' }, { texto: 'B' }]
  });
  return [
    q('ME', pathA, ['Cardio'], 1), q('ME', pathA, ['Cardio'], 1, true),
    q('CH', pathA, ['Nefro'], 2, true), q('ME-CH', pathB, [], null),
    q('VF', pathB, ['Cardio', 'Excluir'], 3), q('MQ', pathB, ['Cardio'], 2),
    q('ESCRITA', 'Outro', ['Nefro'], undefined), q('ME', pathB, ['Cardio'], 1, true)
  ];
}
function state() {
  return { questions: questions(), filters: createFilterState(), deletedIndices: [], disabledIndices: [], retryMode: false, retryIndices: [] };
}
function setup(overrides = {}) {
  const f = matchingFixture(); f.win.scrollTo = () => {};
  f.doc.createTextNode = (text) => { const node = new MatchingElement('#text'); node.textContent = text; return node; };
  globalThis.localStorage = memoryStorage();
  const app = loadApp({ document: f.doc, window: f.win, ...overrides });
  Object.assign(app.state, state(), { quizJson: { descricao: 'Descrição\nDo quiz', conteudo: [
    { tipo: 'FOLDER', nome: 'Raiz', descricao: 'Descrição da raiz', conteudo: [
      { tipo: 'FOLDER', nome: 'A', descricao: 'Descrição A' }, { tipo: 'FOLDER', nome: 'B' }
    ] }
  ] } });
  const effects = { saves: 0, generates: 0, renders: 0 };
  app.save = () => effects.saves++;
  app.renderer = { render: () => effects.renders++, clear() {} };
  app.preferences = { applyFooterMode() {} };
  app.applyCommentCollapseMode = () => {};
  const generate = app.generateAndRender.bind(app);
  app.generateAndRender = () => { effects.generates++; generate(); };
  app.initFilters();
  app.quizFilters.extractFiltersData(); app.quizFilters.prepareStep1();
  const element = (id) => f.doc.getElementById(id);
  const check = (list, value, checked) => {
    const input = element(list).querySelectorAll('input').find((node) => String(node.value) === String(value));
    assert.ok(input, `${list}: ${value}`); input.checked = checked; input.emit('change');
  };
  return { ...f, app, filters: app.quizFilters, effects, element, check };
}

test('esquema dos filtros é independente por sessão e restaura exclusões e aliases legados', () => {
  const a = createFilterState(), b = createFilterState();
  a.tags.push('Cardio'); a.counts.tags.Cardio = 1;
  assert.deepEqual(b.tags, []); assert.deepEqual(b.counts.tags, {});
  const s = { filters: { tags: ['Cardio', 'Nefro'], excludedTags: ['Nefro'], diffs: null, types: ['CH', 'ME-CH', 'MEM', 'INVALIDO'] } };
  ensureFilterState(s);
  assert.deepEqual(s.filters.tags, ['Cardio']); assert.deepEqual(s.filters.diffs, []);
  assert.deepEqual(s.filters.types, ['MVF', 'MEM']);
  assert.deepEqual(s.filters.allTypes, questionTypes);
  assert.deepEqual(s.filters.counts, { tags: {}, diffs: {}, types: {}, folders: {} });
  assert.deepEqual(s.filters.folderDescriptions, {});
});

test('seleção combina pasta, inclusão, exclusão, dificuldade e tipo sem mutar a sessão', () => {
  const s = state();
  Object.assign(s.filters, { folders: [pathB], tags: ['Cardio'], excludedTags: ['Excluir'], diffs: [2, 3], types: ['VF', 'MQ'] });
  const before = structuredClone(s);
  assert.deepEqual(selectQuestionGroups(s), { groups: [[5]], forcedIndices: [] });
  assert.deepEqual(s, before);
  s.filters.tags = []; assert.deepEqual(selectQuestionGroups(s).groups, []);
  s.filters.tags = ['Cardio']; s.filters.types = []; assert.deepEqual(selectQuestionGroups(s).groups, []);
});

test('sem tag/dificuldade e aliases CH e ME-CH preservam a seleção', () => {
  const s = state();
  Object.assign(s.filters, { folders: [pathB], tags: ['__NO_TAG__'], diffs: ['__NO_DIFF__'], types: ['ME-CH'] });
  assert.deepEqual(selectQuestionGroups(s), { groups: [[3]], forcedIndices: [] });
  Object.assign(s.filters, { folders: [pathA], tags: ['Nefro'], diffs: [2], types: ['CH'] });
  assert.deepEqual(selectQuestionGroups(s), { groups: [[1, 2]], forcedIndices: [1] });
});

test('grupos mantêm contexto somente nas pastas escolhidas; questões apagadas não retornam', () => {
  const s = state();
  Object.assign(s.filters, { folders: [pathA], tags: ['Cardio'], diffs: [1], types: ['ME'] });
  assert.deepEqual(selectQuestionGroups(s), { groups: [[0], [1, 2]], forcedIndices: [2] });
  s.deletedIndices = [2]; s.disabledIndices = [0];
  assert.deepEqual(selectQuestionGroups(s), { groups: [[0], [1]], forcedIndices: [] }, 'desativadas permanecem visíveis');
});

test('retry ignora filtros normais, inclui contexto de grupo e respeita exclusões permanentes', () => {
  const s = state(); s.retryMode = true; s.retryIndices = [1, 5]; s.deletedIndices = [2];
  assert.deepEqual(selectQuestionGroups(s), { groups: [[1, 7], [5]], forcedIndices: [7] });
});

test('contagens, rótulos e descrição são restaurados nas duas etapas', () => {
  const f = setup();
  assert.deepEqual(f.app.state.filters.counts.folders, { [pathA]: 3, [pathB]: 4, Outro: 1 });
  f.app.state.filters.folders = [pathB]; f.filters.prepareStep2(); f.filters.renderFilterDescription();
  assert.deepEqual(f.app.state.filters.counts.tags, { __NO_TAG__: 1, Cardio: 3, Excluir: 1 });
  assert.deepEqual(f.app.state.filters.counts.diffs, { __NO_DIFF__: 1, 1: 1, 2: 1, 3: 1 });
  assert.deepEqual(f.app.state.filters.counts.types, { MEM: 1, VF: 1, MQ: 1, ME: 1 });
  assert.match(f.element('tagList').textContent, /Sem tag \(1\)/);
  assert.match(f.element('diffList').textContent, /Sem dificuldade \(1\)/);
  assert.match(f.element('typeList').textContent, /Múltipla Escolha Múltipla \(1\)/);
  assert.equal(f.element('filterDescription').style.display, 'block');
  assert.match(f.element('filterDescription').innerHTML, /Descrição<br>Do quiz/);
  f.filters.dispose();
});

test('árvore de pastas conserva seleção parcial, contagem, descrições e seleção dos descendentes', () => {
  const f = setup(); f.app.state.filters.folders = [pathA]; f.filters.renderFolderUI();
  const find = (path) => f.element('folderTree').querySelectorAll('input').find((node) => node.dataset.path === path);
  const raiz = find('Raiz'); assert.equal(raiz.checked, false); assert.equal(raiz.indeterminate, true);
  assert.equal(raiz.parentNode.querySelector('.ft-count').textContent, '7');
  raiz.parentNode.querySelector('.btn-desc').emit('click');
  assert.equal(f.element('infoModalTitle').textContent, 'Raiz');
  assert.equal(f.element('infoModalBody').innerHTML, 'Descrição da raiz');
  raiz.checked = true; raiz.emit('change');
  assert.deepEqual(f.app.state.filters.folders, [pathA, pathB]);
  const child = find(pathA); child.checked = false; child.emit('change');
  assert.deepEqual(f.app.state.filters.folders, [pathB]);
  assert.equal(find('Raiz').indeterminate, true);
  assert.equal(f.effects.saves, 2);
  f.filters.dispose();
});

test('incluir e excluir tags continuam mutuamente exclusivos; ações coletivas preservam escolhas', () => {
  const f = setup(); f.filters.prepareStep2();
  f.check('excludedTagList', 'Cardio', true);
  assert.ok(!f.app.state.filters.tags.includes('Cardio'));
  assert.ok(f.app.state.filters.excludedTags.includes('Cardio'));
  f.check('tagList', 'Cardio', true);
  assert.ok(!f.app.state.filters.excludedTags.includes('Cardio'));
  f.element('btnToggleAllExcludedTags').emit('click');
  assert.deepEqual(f.app.state.filters.tags, []);
  assert.deepEqual(f.app.state.filters.excludedTags, f.app.state.filters.allTags);
  f.element('btnToggleAllIncludedTags').emit('click');
  assert.deepEqual(f.app.state.filters.tags, f.app.state.filters.allTags);
  assert.deepEqual(f.app.state.filters.excludedTags, []);
  f.element('btnToggleAllIncludedTags').emit('click');
  f.check('tagList', 'Nefro', true); f.element('btnExcludeNotIncludedTags').emit('click');
  assert.deepEqual(f.app.state.filters.tags, ['Nefro']);
  assert.deepEqual(f.app.state.filters.excludedTags, ['Cardio', 'Excluir', '__NO_TAG__']);
  assert.equal(f.element('btnGenerate').textContent, 'Gerar quiz filtrado');
  f.filters.dispose();
});

test('etapas e geração conservam ordem, contexto e alternativas; gerar sai do retry', () => {
  const f = setup(); f.element('btnGoToStep2').emit('click');
  assert.equal(f.app.state.filters.step, 2);
  assert.equal(f.element('filterStep1').classList.contains('hidden'), true);
  f.check('typeList', 'VF', false); f.check('diffList', 3, false);
  assert.ok(!f.app.state.filters.types.includes('VF'));
  assert.ok(!f.app.state.filters.diffs.includes(3));
  f.app.state.retryMode = true; f.app.state.retryIndices = [4];
  f.element('btnGenerate').emit('click');
  assert.equal(f.app.state.retryMode, false);
  assert.deepEqual(Array.from(f.app.state.mappings.qOrder), [0, 1, 2, 7, 3, 5, 6]);
  assert.deepEqual(Array.from(f.app.state.mappings.altOrder[0]), [0, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.app.state.mappings.altOrder[5])), { left: [], right: [] });
  assert.equal(f.effects.generates, 1); assert.equal(f.effects.renders, 1);
  f.element('btnBackToStep1').emit('click');
  assert.equal(f.app.state.filters.step, 1);
  assert.equal(f.element('filterStep2').classList.contains('hidden'), true);
  f.filters.dispose();
});

test('troca de sessão usa o estado atual e limpa callbacks de controles anteriores', async () => {
  const restored = state(); restored.filters.step = 2; restored.filters.folders = [pathB];
  restored.filters.tags = ['__NO_TAG__']; restored.filters.diffs = ['__NO_DIFF__']; restored.filters.types = ['ME-CH'];
  restored.quizJson = { titulo: 'Restaurado', descricao: '', conteudo: [] };
  restored.config = {}; restored.mappings = { qOrder: [], altOrder: {} }; restored.userAnswers = {};
  const f = setup({ loadSession: async () => ({ sessionId: 'beta-old', state: restored }) });
  f.filters.prepareStep2();
  const oldInput = f.element('diffList').querySelector('input');
  await f.app.loadSessionFromList('beta-old');
  assert.equal(f.filters.state, f.app.state);
  assert.equal(f.app.state.filters.step, 2);
  assert.deepEqual(f.app.state.filters.types, ['MEM']);
  assert.deepEqual(f.app.state.filters.tags, ['__NO_TAG__']);
  const saves = f.effects.saves; oldInput.emit('change');
  assert.equal(f.effects.saves, saves);
  f.element('btnGenerate').emit('click');
  assert.deepEqual(Array.from(f.app.state.mappings.qOrder), [3]);
  f.filters.dispose();
});

test('reconstrução, reinicialização e descarte não acumulam eventos nem alteram listas antigas', () => {
  const f = setup(); f.filters.prepareStep2();
  const oldInput = f.element('typeList').querySelector('input');
  f.filters.renderFilterUI(); oldInput.checked = false; oldInput.emit('change');
  assert.equal(f.effects.saves, 0);
  assert.equal(f.app.state.filters.types.includes('ME'), true);
  f.app.initFilters();
  assert.equal(f.element('btnGoToStep2').listeners.get('click').length, 1);
  f.element('btnGoToStep2').emit('click');
  assert.equal(f.effects.saves, 1);
  f.app.quizFilters.dispose(); f.element('btnGenerate').emit('click');
  assert.equal(f.effects.generates, 0);
});

test('quiz vazio mantém listas vazias e ações de tags desabilitadas', () => {
  const f = setup(); f.app.state.questions = []; f.app.state.filters = createFilterState();
  f.filters.extractFiltersData(); f.filters.prepareStep1(); f.filters.prepareStep2();
  assert.deepEqual(selectQuestionGroups(f.app.state), { groups: [], forcedIndices: [] });
  assert.equal(f.element('btnToggleAllIncludedTags').disabled, true);
  assert.equal(f.element('btnToggleAllExcludedTags').disabled, true);
  assert.equal(f.element('btnExcludeNotIncludedTags').disabled, true);
  assert.equal(f.element('tagList').children.length, 0);
  f.filters.dispose();
});
