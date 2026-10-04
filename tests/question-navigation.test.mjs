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
  f.navigation.pageRow.clientWidth = 720;
  f.navigation.updatePageNumbers();
  assert.equal(f.navigation.pageJump.classList.contains('hidden'), true);
  assert.equal(f.navigation.numbers.querySelectorAll('button').length, 8);
  f.navigation.pageRow.clientWidth = 280;
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
  assert.equal(list.querySelectorAll('.question-map-group').length, 1);
  assert.equal(list.querySelector('.question-map-group-title').textContent, 'Grupo · 2–3');
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

test('navegação permanece visível e fixa quando responder todas vira inline; observadores são liberados', () => {
  const f = setup();
  const preferences = new Preferences({ elements: { footerBar: f.navigation.footer } });
  assert.equal(f.doc.documentElement.style['--pagination-footer-offset'], '60px');
  preferences.applyFooterMode(false);
  f.navigation.measureDock();
  assert.equal(f.doc.documentElement.style['--pagination-footer-offset'], '0px');
  assert.equal(f.navigation.dock.classList.contains('hidden'), false);
  assert.equal(f.doc.documentElement.style['--pagination-dock-height'], '112px');
  preferences.applyFooterMode(true);
  f.navigation.measureDock();
  assert.equal(f.doc.documentElement.style['--pagination-footer-offset'], '60px');
  const observer = f.navigation.resizeObserver;
  f.navigation.dispose();
  assert.equal(observer.disconnected, true);
});
