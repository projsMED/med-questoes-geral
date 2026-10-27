import test from 'node:test';
import assert from 'node:assert/strict';
import { recordMeAttempt, computeQuestionScore, validAttemptQuestion, meAttemptStats } from '../js/scoring.js';
import { loadApp } from './helpers/app.mjs';
const question = n => ({ tipo: 'ME', alternativas: Array.from({ length: n }, () => ({})), gabarito: String.fromCharCode(64 + n) });
const state = n => ({ questions: [question(n)], userAnswers: { 0: {} }, config: { meAttempts: true }, mappings: { qOrder: [0], altOrder: { 0: [3, 2, 1, 0] } } });
for (const n of [2, 3, 4, 5, 6]) {
  test(`ME ${n} alternativas: todos os acertos possíveis e esgotamento`, () => {
    for (let k = 1; k < n; k++) {
      const s = state(n), a = s.userAnswers[0];
      for (let i = 0; i < k - 1; i++) {
        a.selectedOriginalIdx = i;
        assert.equal(recordMeAttempt(s.questions[0], a), true);
        assert.deepEqual(computeQuestionScore(s, 0), { hits: 0, total: 0 });
      }
      a.selectedOriginalIdx = n - 1;
      recordMeAttempt(s.questions[0], a);
      assert.deepEqual(computeQuestionScore(s, 0), { hits: k === 1 ? 1 : (n - k) / n, total: 1 });
      assert.equal(recordMeAttempt(s.questions[0], a), false);
    }
    const s = state(n), a = s.userAnswers[0];
    for (let i = 0; i < n - 1; i++) { a.selectedOriginalIdx = i; recordMeAttempt(s.questions[0], a); }
    assert.equal(a.attemptOutcome, 'exhausted');
    assert.deepEqual(computeQuestionScore(s, 0), { hits: 0, total: 1 });
  });
}
test('seleção, tesoura, envio duplicado e índices inválidos não consomem tentativas', () => {
  const q = question(4), a = {};
  assert.equal(recordMeAttempt(q, a), false);
  a.selectedOriginalIdx = 1; assert.equal(recordMeAttempt(q, a, [1]), false);
  assert.equal(recordMeAttempt(q, a), true);
  assert.equal(recordMeAttempt(q, a), false);
  a.selectedOriginalIdx = 1; assert.equal(recordMeAttempt(q, a), false);
  a.selectedOriginalIdx = -1; assert.equal(recordMeAttempt(q, a), false);
  assert.deepEqual(a.attempts, [1]);
  assert.equal(validAttemptQuestion({ ...q, gabarito: 'Z' }), false);
  assert.equal(validAttemptQuestion(question(1)), false);
});
test('histórico sobrevive a JSON, desconsideração altera pontos e não o desfecho', () => {
  let s = state(4), a = s.userAnswers[0];
  a.selectedOriginalIdx = 0; recordMeAttempt(s.questions[0], a);
  a.selectedOriginalIdx = 3; recordMeAttempt(s.questions[0], a);
  s = JSON.parse(JSON.stringify(s));
  assert.equal(meAttemptStats(s).sum, .5);
  s.userAnswers[0].disregardCorrect = true;
  assert.equal(meAttemptStats(s).sum, 0);
  assert.equal(meAttemptStats(s).buckets[2], 1);
  s.config.applyDisregardedCorrect = false;
  assert.equal(meAttemptStats(s).sum, .5);
  for (const field of ['disabledIndices', 'deletedIndices', 'forcedIndices']) {
    s[field] = [0]; assert.equal(meAttemptStats(s).count, 0); s[field] = [];
  }
});
test('envio em lote não encerra erros intermediários; encerramento não inventa acertos', () => {
  const app = loadApp(); app.state = state(4); app.state.eliminatedAlts = {};
  app.refreshAttemptSettings = app.save = app.applyCommentCollapseMode = () => {};
  app.renderer = { render() {} };
  app.state.userAnswers[0].selectedOriginalIdx = 0;
  app.submitAll(); assert.equal(app.state.userAnswers[0].submitted, undefined);
  app.submitAll(); assert.equal(app.state.userAnswers[0].attempts.length, 1);
  app.submitAll(true);
  assert.equal(app.state.userAnswers[0].attemptOutcome, 'closed');
  assert.equal(computeQuestionScore(app.state, 0).hits, 0);
  assert.equal(meAttemptStats(app.state).closed, 1);
});
test('modo desligado conserva correção convencional e não altera outros tipos', () => {
  const s = state(4); s.config.meAttempts = false;
  s.userAnswers[0] = { submitted: true, selectedOriginalIdx: 3 };
  assert.deepEqual(computeQuestionScore(s, 0), { hits: 1, total: 1 });
  s.config.meAttempts = true; s.questions[0].tipo = 'VF';
  assert.deepEqual(computeQuestionScore(s, 0), { hits: 1, total: 1 });
});

import { QuizRenderer } from '../js/renderer.js';
import { matchingFixture, MatchingElement } from './helpers/matching-dom.mjs';
import { questionProgress } from '../js/pagination.js';
function cardFixture(feedback = 'end') {
  matchingFixture();
  const renderer = Object.create(QuizRenderer.prototype);
  Object.assign(renderer, {
    container: new MatchingElement(), callbacks: {}, _revealedMetadataQuestions: new Set(),
    highlighter: { createControlsHtml: () => '', setupControls() {}, registerTarget() {} },
    matchingQuestions: { clearQuestion() {} }, _applyWordMarking() {}, _setupMarkingListeners() {}
  });
  const s = state(4); s.config.meAttemptFeedback = feedback; s.eliminatedAlts = {};
  s.questions[0].enunciado = 'Enunciado';
  s.questions[0].comentario_geral = 'Geral secreto';
  s.questions[0].alternativas = [{ texto: 'A', comentario: 'Erro A' }, { texto: 'B' },
    { texto: 'C', comentario: 'Erro C' }, { texto: 'D', comentario: 'Certa secreta' }];
  const card = () => renderer.createQuestionCard(s.questions[0], 0, 0, s);
  return { renderer, s, card };
}
test('cartão não antecipa indicador, gabarito ou comentários; feedback libera só erros enviados', () => {
  const { s, card } = cardFixture('each');
  assert.equal(card().querySelectorAll('.attempt-message').length, 0);
  assert.equal(card().querySelectorAll('.specific-comment').length, 0);
  s.userAnswers[0].selectedOriginalIdx = 0; recordMeAttempt(s.questions[0], s.userAnswers[0]);
  let view = card();
  assert.equal(view.querySelectorAll('.specific-comment').length, 1);
  assert.equal(view.querySelector('.specific-comment').textContent, 'Erro A');
  assert.equal(view.querySelectorAll('.correct').length, 0);
  assert.equal(view.querySelectorAll('.attempt-wrong').length, 1);
  assert.equal(view.querySelectorAll('.general-comment').length, 0);
  assert.equal(questionProgress(s, 0), 'attempting');
  s.userAnswers[0].selectedOriginalIdx = 1; recordMeAttempt(s.questions[0], s.userAnswers[0]);
  assert.equal(card().querySelectorAll('.specific-comment').length, 1, 'sem mensagem substituta para comentário ausente');
  s.userAnswers[0].selectedOriginalIdx = 3; recordMeAttempt(s.questions[0], s.userAnswers[0]);
  view = card();
  assert.equal(view.querySelectorAll('.specific-comment').length, 3);
  assert.equal(view.querySelectorAll('.general-comment').length, 1);
  assert.match(view.querySelector('.attempt-message').textContent, /3ª tentativa/);
  assert.match(view.querySelector('.me-attempt-score').textContent, /0,25/);
});
test('feedback ao concluir não monta comentários durante as tentativas', () => {
  const { s, card } = cardFixture('end');
  s.userAnswers[0].selectedOriginalIdx = 0; recordMeAttempt(s.questions[0], s.userAnswers[0]);
  assert.equal(card().querySelectorAll('.specific-comment').length, 0);
});

test('cópia antes da conclusão não inclui gabarito nem comentários bloqueados', () => {
  const { s, renderer } = cardFixture('end');
  renderer._state = s;
  s.userAnswers[0].selectedOriginalIdx = 0; recordMeAttempt(s.questions[0], s.userAnswers[0]);
  const text = renderer._formatQuestionText(0, 0);
  assert.doesNotMatch(text, /Gabarito|Geral secreto|Certa secreta|Erro A/);
});
test('configuração trava no primeiro envio de ME e reset libera sem perder a escolha', () => {
  const app = loadApp(); app.state = state(4);
  assert.equal(app.attemptSettingsLocked(), false);
  app.state.userAnswers[0].selectedOriginalIdx = 0;
  assert.equal(app.attemptSettingsLocked(), false);
  recordMeAttempt(app.state.questions[0], app.state.userAnswers[0]);
  assert.equal(app.attemptSettingsLocked(), true);
  app.state.userAnswers = {};
  assert.equal(app.attemptSettingsLocked(), false);
  assert.equal(app.state.config.meAttempts, true);
});
