import test from 'node:test';
import assert from 'node:assert/strict';
import { questionProgress, visiblePageNumbers, buildQuestionPages } from '../js/pagination.js';
import { QuestionNavigation } from '../js/question-navigation.js';
import { Preferences } from '../js/preferences.js';
import { matchingFixture, MatchingElement } from './helpers/matching-dom.mjs';

const state = (questions, answers = {}) => ({ questions, userAnswers: answers, config: {},
  quizJson: {}, mappings: { qOrder: questions.map((_, index) => index), altOrder: {} } });

test('progresso distingue escolha zero, falso, rascunhos apagados e envio correto/errado', () => {
  const s = state([{ tipo: 'ME', gabarito: 'A' }, { tipo: 'MVF', assertivas: [{ is_correct: false }] }]);
  assert.equal(questionProgress(s, 0), 'empty');
  s.userAnswers[0] = { selectedOriginalIdx: 0 };
  assert.equal(questionProgress(s, 0), 'draft');
  s.userAnswers[1] = { assertivaAnswers: { 0: false } };
  assert.equal(questionProgress(s, 1), 'draft');
  s.userAnswers[0].submitted = true;
  s.userAnswers[1].submitted = true;
  assert.equal(questionProgress(s, 0), 'correct');
  assert.equal(questionProgress(s, 1), 'correct');
  s.userAnswers[0].selectedOriginalIdx = 1;
  assert.equal(questionProgress(s, 0), 'wrong');
  s.userAnswers[0] = { selectedOriginalIndices: [], connections: [], text: '  ', assertivaAnswers: {} };
  assert.equal(questionProgress(s, 0), 'empty');
});

test('associação e múltipla escolha usam acerto parcial e desconsideração já aplicados à nota', () => {
  const s = state([
    { tipo: 'MQ', coluna_esquerda: { itens: [{}, {}] }, coluna_direita: { itens: [{}, {}] }, gabarito: '1(A), 2(B)' },
    { tipo: 'MEM', alternativas: [{}, {}, {}], gabarito: 'A, B' }
  ], {
    0: { connections: [{ leftOrigIdx: 0, rightOrigIdx: 0 }] },
    1: { selectedOriginalIndices: [0], submitted: true }
  });
  assert.equal(questionProgress(s, 0), 'draft');
  s.userAnswers[0].submitted = true;
  assert.equal(questionProgress(s, 0), 'partial');
  assert.equal(questionProgress(s, 1), 'partial');
  s.userAnswers[1].selectedOriginalIndices = [0, 1];
  assert.equal(questionProgress(s, 1), 'correct');
  s.userAnswers[1].disregardCorrect = true;
  assert.equal(questionProgress(s, 1), 'wrong');
  s.disabledIndices = [1];
  assert.equal(questionProgress(s, 1), 'excluded');
  s.forcedIndices = [0];
  assert.equal(questionProgress(s, 0), 'excluded');
});

test('dissertativas enviadas sem avaliação ficam pendentes; zero é avaliação válida', () => {
  const s = state([{ tipo: 'ESCRITA' }, { tipo: 'ESCRITA', subtipo: 'itens', itens: [{}, {}] }], {
    0: { text: 'Resposta' }, 1: { items: [{ text: 'Item A', submitted: true }] }
  });
  assert.equal(questionProgress(s, 0), 'draft');
  assert.equal(questionProgress(s, 1), 'draft');
  s.userAnswers[0].submitted = true;
  s.userAnswers[1].submitted = true;
  assert.equal(questionProgress(s, 0), 'pending');
  assert.equal(questionProgress(s, 1), 'pending');
  s.userAnswers[0].selfEval = 0;
  assert.equal(questionProgress(s, 0), 'wrong');
  s.userAnswers[1].items = [{ selfEval: 10 }, { selfEval: 5 }];
  assert.equal(questionProgress(s, 1), 'partial');
  s.userAnswers[1].items[1].selfEval = 10;
  assert.equal(questionProgress(s, 1), 'correct');
});

test('janela de números respeita capacidade, extremos e página atual em simulado longo', () => {
  assert.deepEqual(visiblePageNumbers(4, 2, 6), [1, 2, 3, 4]);
  for (const total of [10, 100, 1000]) for (const capacity of [3, 5, 7, 12]) {
    for (const current of [1, 2, Math.floor(total / 2), total - 1, total]) {
      const tokens = visiblePageNumbers(total, current, capacity);
      assert.ok(tokens.length <= capacity);
      assert.ok(tokens.includes(1)); assert.ok(tokens.includes(total)); assert.ok(tokens.includes(current));
      const pages = tokens.filter((page) => page !== null);
      assert.equal(new Set(pages).size, pages.length);
      assert.deepEqual(pages, [...pages].sort((a, b) => a - b));
      assert.ok(pages.every((page) => page >= 1 && page <= total));
    }
  }
});

function setup(total = 30) {
  const f = matchingFixture();
  f.doc.documentElement = new MatchingElement();
  const s = state(Array.from({ length: total }, () => ({ tipo: 'ME', gabarito: 'A' })));
  const pages = buildQuestionPages(s.questions, s.mappings.qOrder, { enabled: true, pageSize: 1 });
  const actions = [];
  const navigation = new QuestionNavigation({ onPage: (index) => actions.push(['page', index]),
    onQuestion: (number) => actions.push(['question', number]) });
  navigation.pageRow.clientWidth = 280;
  f.doc.getElementById('footerBar').rect.height = 60;
  navigation.dock.rect.height = 112;
  navigation.update(s, pages, 0, true);
  return { ...f, s, pages, actions, navigation };
}

test('campo de página aparece só quando necessário e se adapta à largura do dispositivo', () => {
  const f = setup(8);
  f.win.innerWidth = 800;
  f.navigation.updatePageNumbers();
  assert.equal(f.navigation.pageJump.classList.contains('hidden'), true);
  assert.equal(f.navigation.numbers.querySelectorAll('button').length, 8);
  f.win.innerWidth = 320;
  f.win.emit('resize');
  assert.equal(f.navigation.pageJump.classList.contains('hidden'), false);
  assert.ok(f.navigation.numbers.querySelectorAll('button').length < 8);
  f.navigation.numbers.emit('click', { target: f.navigation.numbers.querySelector('[data-page="8"]') });
  assert.deepEqual(f.actions, [['page', 7]]);
  f.navigation.dispose();
});

test('salto por número valida intervalo e usa questão visual, inclusive com ordem embaralhada', () => {
  const f = setup();
  const form = f.doc.getElementById('paginationJumpForm');
  f.navigation.openJump('page');
  f.navigation.jumpInput.value = '31';
  form.emit('submit');
  assert.equal(f.navigation.jump.open, true);
  assert.equal(f.navigation.jumpInput.attributes['aria-invalid'], 'true');
  assert.equal(f.actions.length, 0);
  f.navigation.jumpInput.value = '25'; form.emit('submit');
  assert.equal(f.navigation.jump.open, false);
  assert.deepEqual(f.actions.at(-1), ['page', 24]);
  f.navigation.openJump('question');
  f.navigation.jumpInput.value = '7'; form.emit('submit');
  assert.deepEqual(f.actions.at(-1), ['question', 7]);
  f.navigation.dispose();
});

test('mapa agrupa números, colore estados e destaca só as questões da página atual', () => {
  const f = setup(6);
  const group = { id: 'shared', text: 'Base' };
  f.s.questions[1]._groupData = group;
  f.s.questions[2]._groupData = group;
  f.s.userAnswers = { 0: { selectedOriginalIdx: 0 }, 1: { submitted: true, selectedOriginalIdx: 0 },
    2: { submitted: true, selectedOriginalIdx: 1 } };
  f.pages = buildQuestionPages(f.s.questions, f.s.mappings.qOrder, { enabled: true, pageSize: 1 });
  f.navigation.update(f.s, f.pages, 1, true);
  f.navigation.openMap();
  const list = f.doc.getElementById('questionMapList');
  assert.equal(list.querySelectorAll('.question-map-tile').length, 6);
  assert.equal(list.querySelectorAll('.question-map-grid').length, 1);
  assert.equal(list.querySelectorAll('.question-map-group-title').length, 0);
  assert.match(list.querySelector('[data-question="2"]').title, /Grupo: questões 2–3/);
  assert.match(f.doc.getElementById('questionMapLegend').textContent, /Questões do mesmo grupo/);
  assert.equal(list.querySelectorAll('.question-map-current').length, 2);
  assert.equal(list.querySelectorAll('.progress-correct').length, 1);
  assert.equal(list.querySelectorAll('.progress-wrong').length, 1);
  assert.equal(list.querySelectorAll('.progress-draft').length, 1);
  list.emit('click', { target: list.querySelector('[data-question="6"]') });
  assert.deepEqual(f.actions.at(-1), ['question', 6]);
  assert.equal(f.navigation.map.open, false);
  f.navigation.openMap();
  f.navigation.update(null, [], 0, false);
  assert.equal(f.navigation.map.open, false);
  assert.equal(f.navigation.dock.classList.contains('hidden'), true);
  f.navigation.dispose();
});

test('mapa funciona na lista contínua com grupos e progresso, sem controles nem destaques de páginas', () => {
  const f = setup(6);
  const group = { id: 'shared', text: 'Base' };
  f.s.questions[1]._groupData = group;
  f.s.questions[2]._groupData = group;
  f.s.mappings.qOrder = [5, 1, 2, 0, 3, 4];
  f.s.userAnswers = { 5: { submitted: true, selectedOriginalIdx: 0 } };
  const pages = buildQuestionPages(f.s.questions, f.s.mappings.qOrder, { enabled: false });
  f.navigation.update(f.s, pages, 0, false);
  assert.equal(f.navigation.mapShortcut.disabled, false);
  assert.equal(f.navigation.dock.classList.contains('hidden'), true);
  assert.equal(f.doc.documentElement.style['--pagination-dock-height'], '0px');
  f.navigation.openMap(); f.flush();
  const list = f.doc.getElementById('questionMapList');
  assert.equal(f.navigation.map.open, true);
  assert.equal(f.doc.getElementById('questionMapSummary').textContent, '6 questões');
  assert.equal(f.doc.getElementById('questionMapHelp').textContent, 'Toque em um número para ir à questão.');
  assert.doesNotMatch(f.doc.getElementById('questionMapLegend').textContent, /Página atual/);
  assert.equal(list.querySelectorAll('.question-map-current').length, 0);
  assert.equal(list.querySelectorAll('.question-map-group').length, 1);
  assert.match(list.querySelector('[data-question="2"]').title, /Grupo: questões 2–3/);
  assert.equal(list.querySelector('[data-question="1"]').classList.contains('progress-correct'), true);
  assert.equal(f.doc.activeElement.dataset.question, 1);
  const event = f.doc.emit('keydown', { key: 'ArrowRight' });
  assert.equal(event.defaultPrevented, undefined);
  assert.equal(f.actions.length, 0);
  // Respostas alteradas devem ser refletidas mesmo quando a barra de páginas está oculta.
  f.s.userAnswers[5].selectedOriginalIdx = 1;
  f.navigation.update(f.s, pages, 0, false); f.flush();
  assert.equal(f.navigation.map.open, true);
  assert.equal(list.querySelector('[data-question="1"]').classList.contains('progress-wrong'), true);
  list.emit('click', { target: list.querySelector('[data-question="4"]') });
  assert.equal(f.navigation.map.open, false);
  assert.deepEqual(f.actions, [['question', 4]]);
  f.navigation.openMap();
  f.navigation.update(null, [], 0, false);
  assert.equal(f.navigation.map.open, false);
  assert.equal(f.navigation.mapShortcut.disabled, true);
  f.navigation.openMap();
  assert.equal(f.navigation.map.open, false);
  f.navigation.dispose();
});

test('mudar o modo de exibição ou a sessão fecha o mapa e limpa a disponibilidade em sessão sem questões', () => {
  const f = setup(4);
  f.navigation.openMap();
  const continuous = buildQuestionPages(f.s.questions, f.s.mappings.qOrder, { enabled: false });
  f.navigation.update(f.s, continuous, 0, false);
  assert.equal(f.navigation.map.open, false);
  f.navigation.openMap();
  assert.equal(f.doc.getElementById('questionMapSummary').textContent, '4 questões');
  f.navigation.update(f.s, f.pages, 1, true);
  assert.equal(f.navigation.map.open, false);
  f.navigation.openMap();
  assert.match(f.doc.getElementById('questionMapSummary').textContent, /4 páginas/);
  assert.equal(f.doc.getElementById('questionMapList').querySelectorAll('.question-map-current').length, 1);
  const empty = state([]);
  f.navigation.update(empty, [], 0, false);
  assert.equal(f.navigation.map.open, false);
  assert.equal(f.navigation.mapShortcut.disabled, true);
  f.navigation.dispose();
});

test('navegação permanece visível e fixa quando responder todas vira inline; observadores são liberados', () => {
  const f = setup();
  const preferences = new Preferences({ elements: { footerBar: f.navigation.footer } });
  assert.equal(f.doc.documentElement.style['--pagination-footer-offset'], '60px');
  preferences.applyFooterMode(false);
  f.navigation.measureDock();
  assert.equal(f.doc.documentElement.style['--pagination-footer-offset'], '0px');
  assert.equal(f.navigation.dock.classList.contains('hidden'), false);
  assert.equal(f.doc.documentElement.style['--pagination-dock-height'], '120px');
  preferences.applyFooterMode(true);
  f.navigation.measureDock();
  assert.equal(f.doc.documentElement.style['--pagination-footer-offset'], '60px');
  const observer = f.navigation.resizeObserver;
  f.navigation.dispose();
  assert.equal(observer.disconnected, true);
});

test('setas navegam com limites e respeitam edição, controles, modificadores e diálogos', () => {
  const f = setup(3);
  assert.equal(f.doc.emit('keydown', { key: 'ArrowLeft' }).defaultPrevented, undefined);
  assert.equal(f.doc.emit('keydown', { key: 'ArrowRight' }).defaultPrevented, true);
  assert.deepEqual(f.actions, [['page', 1]]);
  f.navigation.update(f.s, f.pages, 2, true);
  f.doc.emit('keydown', { key: 'ArrowRight' });
  f.doc.emit('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(f.actions.at(-1), ['page', 1]);
  const count = f.actions.length;
  for (const tag of ['input', 'textarea', 'select']) {
    f.doc.emit('keydown', { key: 'ArrowLeft', target: new MatchingElement(tag) });
  }
  const slider = new MatchingElement(); slider.setAttribute('role', 'slider');
  f.doc.emit('keydown', { key: 'ArrowLeft', target: slider });
  const editable = new MatchingElement(); editable.isContentEditable = true;
  f.doc.emit('keydown', { key: 'ArrowLeft', target: editable });
  for (const flag of ['ctrlKey', 'shiftKey', 'metaKey', 'altKey', 'repeat', 'isComposing', 'defaultPrevented']) {
    f.doc.emit('keydown', { key: 'ArrowLeft', [flag]: true });
  }
  const query = f.doc.querySelector;
  f.doc.querySelector = () => new MatchingElement('dialog');
  f.doc.emit('keydown', { key: 'ArrowLeft' });
  f.doc.querySelector = query;
  assert.equal(f.actions.length, count);
  f.navigation.update(null, [], 0, false);
  f.doc.emit('keydown', { key: 'ArrowRight' });
  assert.equal(f.actions.length, count);
  f.navigation.dispose();
  assert.equal(f.doc.listeners.get('keydown').length, 0);
});

test('posição move o mesmo painel e reserva espaço inferior somente no modo fixo', () => {
  const f = setup();
  const initialButtons = f.navigation.numbers.querySelectorAll('button');
  for (const [position, parent] of [['top', 'paginationTopSlot'], ['bottom', 'paginationBottomSlot'], ['fixed', null]]) {
    localStorage.setItem('vs_paginationPosition', position);
    f.navigation.applyPosition();
    assert.equal(f.navigation.dock.parentElement, parent ? f.doc.getElementById(parent) : f.doc.body);
    assert.equal(f.doc.body.classList.contains('quiz-pagination-fixed'), position === 'fixed');
    assert.equal(f.doc.documentElement.style['--pagination-dock-height'], position === 'fixed' ? '120px' : '0px');
    assert.equal(f.navigation.numbers.querySelector('button'), initialButtons[0]);
  }
  f.navigation.dispose();
});

test('contornos seguem a ordem entre três linhas, separam grupos vizinhos e recalculam ao redimensionar', () => {
  const f = setup(18);
  const firstGroup = { id: 'first' }, nextGroup = { id: 'next' };
  for (let index = 3; index < 13; index++) f.s.questions[index]._groupData = firstGroup;
  for (let index = 13; index < 16; index++) f.s.questions[index]._groupData = nextGroup;
  f.navigation.openMap();
  const list = f.doc.getElementById('questionMapList');
  const grid = list.querySelector('.question-map-grid');
  const tiles = list.querySelectorAll('.question-map-tile');
  grid.rect = { left: 10, top: 20, width: 372 };
  const arrange = (columns) => tiles.forEach((tile, index) => {
    const left = 17 + index % columns * 62;
    tile.rect = { left, right: left + 48, top: 27 + Math.floor(index / columns) * 64, height: 48 };
  });
  arrange(6); f.navigation.layoutMap();
  let segments = grid.querySelectorAll('.question-map-group');
  assert.equal(segments.length, 4);
  assert.equal(segments[0].classList.contains('continues-before'), false);
  assert.equal(segments[0].classList.contains('continues-after'), true);
  assert.equal(segments[1].classList.contains('continues-before'), true);
  assert.equal(segments[1].classList.contains('continues-after'), true);
  assert.equal(segments[2].classList.contains('continues-before'), true);
  assert.equal(segments[2].classList.contains('continues-after'), false);
  assert.equal(segments[3].classList.contains('continues-before'), false);
  assert.equal(segments[3].classList.contains('continues-after'), false);
  assert.equal(segments[0].style.left, '187px');
  assert.equal(segments[0].style.width, '185px');
  assert.equal(segments[2].style.left, '0px');
  assert.equal(segments[2].style.width, '61px');
  assert.equal(segments[3].style.left, '63px', 'grupo vizinho tem início próprio e espaço entre contornos');
  arrange(4); f.win.emit('resize'); f.flush();
  segments = grid.querySelectorAll('.question-map-group');
  assert.equal(segments.length, 5);
  assert.equal(segments[0].style.left, '187px');
  assert.deepEqual(tiles.map((tile) => tile.dataset.question), Array.from({ length: 18 }, (_, index) => index + 1));
  f.navigation.dispose();
  assert.equal(f.navigation.mapObserver.disconnected, true);
});
