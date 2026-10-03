import test from 'node:test';
import assert from 'node:assert/strict';
import * as scoring from '../js/scoring.js';
import * as legacyUtils from '../js/utils.js';
import { QuizRenderer } from '../js/renderer.js';
import { loadApp, memoryStorage } from './helpers/app.mjs';

const mvf = [{ is_correct: true }, { is_correct: false }, { is_correct: true }];
const mq = {
  tipo: 'MQ', coluna_esquerda: { itens: [{}, {}] },
  coluna_direita: { itens: [{}, {}, {}] }, gabarito: '1(A, B), 2(nulo)'
};
const cases = [
  ['ME correta', { tipo: 'ME', gabarito: 'B' }, { selectedOriginalIdx: 1 }, {}, { hits: 1, total: 1 }],
  ['ME errada', { tipo: 'ME', gabarito: 'B' }, { selectedOriginalIdx: 0 }, {}, { hits: 0, total: 1 }],
  ['VF normalizada', { tipo: 'VF', gabarito: 'A' }, { selectedOriginalIdx: 0 }, {}, { hits: 1, total: 1 }],
  ['sem gabarito', { tipo: 'ME' }, {}, {}, { hits: 0, total: 0 }],
  ['MVF penalizada', { tipo: 'MVF', assertivas: mvf }, { assertivaAnswers: { 0: true, 1: false } }, {}, { hits: 1, total: 3 }],
  ['CH simples', { tipo: 'CH', assertivas: mvf }, { assertivaAnswers: { 0: true, 1: false } }, { simpleMvfCorrection: true }, { hits: 2, total: 3 }],
  ['MVF sem pontuação negativa', { tipo: 'MVF', assertivas: mvf }, { assertivaAnswers: {} }, {}, { hits: 0, total: 3 }],
  ['MEM proporcional', { tipo: 'MEM', alternativas: [{}, {}, {}, {}], gabarito: 'A B' }, { selectedOriginalIndices: [0] }, {}, { hits: 0.5, total: 1 }],
  ['ME-CH penaliza marcação incorreta', { tipo: 'ME-CH', alternativas: [{}, {}, {}, {}], gabarito: 'A B' }, { selectedOriginalIndices: [0, 2] }, {}, { hits: 0, total: 1 }],
  ['MEM NONE', { tipo: 'MEM', alternativas: [{}, {}], gabarito: 'NONE' }, { selectedOriginalIndices: [] }, {}, { hits: 1, total: 1 }],
  ['MEM ALL', { tipo: 'MEM', alternativas: [{}, {}], gabarito: 'ALL' }, { selectedOriginalIndices: [0, 1] }, {}, { hits: 1, total: 1 }],
  ['MQ parcial com nulo', mq, { connections: [{ leftOrigIdx: 0, rightOrigIdx: 0 }] }, {}, { hits: 0.75, total: 1 }],
  ['MQ penaliza ligação incorreta', mq, { connections: [{ leftOrigIdx: 0, rightOrigIdx: 0 }, { leftOrigIdx: 0, rightOrigIdx: 2 }, { leftOrigIdx: 1, rightOrigIdx: 0 }] }, {}, { hits: 0, total: 1 }],
  ['escrita simples', { tipo: 'ESCRITA' }, { selfEval: 7 }, {}, { hits: 7, total: 10 }],
  ['escrita com itens e avaliação ausente', { tipo: 'ESCRITA', itens: [{}, {}, {}] }, { items: [{ selfEval: 8 }, {}, { selfEval: 5 }] }, {}, { hits: 13, total: 30 }],
  ['escrita sem itens', { tipo: 'ESCRITA', subtipo: 'itens', itens: [] }, {}, {}, { hits: 0, total: 0 }]
];

for (const [name, question, answer, config, expected] of cases) {
  test(`pontuação compartilhada: ${name}`, () => {
    const state = {
      questions: [question], userAnswers: { 0: { submitted: true, ...answer } }, config,
      mappings: { qOrder: [0], altOrder: { 0: [3, 2, 1, 0] } }
    };
    const before = JSON.stringify(state);
    const app = loadApp(); app.state = state;
    assert.deepEqual(scoring.computeQuestionScore(state, 0), expected);
    assert.deepEqual(app.computeQuestionScore(0), expected);
    assert.deepEqual(QuizRenderer.prototype.computeQuestionScore(state, 0), expected);
    assert.equal(JSON.stringify(state), before, 'a correção não altera os dados');
    state.userAnswers[0].submitted = false;
    assert.deepEqual(scoring.computeQuestionScore(state, 0), { hits: 0, total: 0 });
    delete state.userAnswers[0];
    assert.deepEqual(scoring.computeQuestionScore(state, 0), { hits: 0, total: 0 });
  });
}

test('desconsiderar acertos respeita opções, preserva nota bruta e não afeta escrita', () => {
  const state = {
    questions: [{ tipo: 'ME', gabarito: 'A' }, { tipo: 'ESCRITA' }], config: {},
    userAnswers: { 0: { submitted: true, selectedOriginalIdx: 0, disregardCorrect: true }, 1: { submitted: true, selfEval: 8, disregardCorrect: true } }
  };
  assert.deepEqual(scoring.computeQuestionScore(state, 0), { hits: 0, total: 1 });
  assert.deepEqual(scoring.computeQuestionScore(state, 0, { ignoreDisregard: true }), { hits: 1, total: 1 });
  assert.equal(scoring.isDisregardedCorrectMarked(state, 0), true);
  assert.equal(scoring.isDisregardedCorrectMarked(state, 1), false);
  assert.deepEqual(scoring.computeQuestionScore(state, 1), { hits: 8, total: 10 });
  for (const key of ['showDisregardCorrect', 'applyDisregardedCorrect']) {
    state.config = { [key]: false };
    assert.deepEqual(scoring.computeQuestionScore(state, 0), { hits: 1, total: 1 });
  }
});

test('retry e resumo selecionam os mesmos erros, parciais e acertos desconsiderados', () => {
  globalThis.localStorage = memoryStorage();
  const app = loadApp({ generateId: () => 'retry-beta' });
  Object.assign(app.state, {
    questions: [{ tipo: 'ME', gabarito: 'A' }, { tipo: 'ME', gabarito: 'A' }, { tipo: 'ESCRITA' }, { tipo: 'ME', gabarito: 'A' }, { tipo: 'ME', gabarito: 'A' }],
    userAnswers: {
      0: { submitted: true, selectedOriginalIdx: 0 },
      1: { submitted: true, selectedOriginalIdx: 1 },
      2: { submitted: true, selfEval: 5 },
      3: { submitted: true, selectedOriginalIdx: 0, disregardCorrect: true },
      4: { submitted: true, selectedOriginalIdx: 1 }
    }, mappings: { qOrder: [4, 3, 2, 1, 0], altOrder: {} }, disabledIndices: [4]
  });
  const renderer = Object.create(QuizRenderer.prototype);
  renderer.btnSubmitAll = { style: {} }; renderer.scoreDisplay = { style: {} };
  let summary;
  renderer._renderResultCard = (...args) => { summary = args; };
  renderer.updateFooter(app.state);
  assert.deepEqual(summary[5], [3, 2, 1]);
  assert.equal(summary[3], 1.5); assert.equal(summary[4], 4);
  app.save = () => {}; app.generateAndRender = () => {};
  app.retryIncorrect();
  assert.deepEqual(Array.from(app.state.retryIndices), summary[5]);
  assert.equal(app.activeSessionId, 'retry-beta');
});

test('importações anteriores de utils continuam compatíveis', () => {
  const mem = { alternativas: [{}, {}], gabarito: 'A' };
  const calls = {
    computeMvfScore: [mvf, { 0: true }],
    computeMeChScore: [mem, [0]], computeMemScore: [mem, [0]],
    parseMeChGabarito: [mem], parseMemGabarito: [mem],
    parseMqGabarito: [mq], computeMqScore: [mq, []]
  };
  for (const [key, args] of Object.entries(calls)) {
    assert.deepEqual(legacyUtils[key](...args), scoring[key](...args));
  }
});
