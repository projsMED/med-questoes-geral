import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContent, reshuffleVariants } from '../js/parser.js';
import { writtenMode, writtenStage, writtenCompatibility, submitWritten, fallbackWritten, assessWritten, writtenStats } from '../js/me-written.js';
import { renderWrittenSettings, writtenResultsHtml } from '../js/me-written-ui.js';
import { computeQuestionScore, recordMeAttempt, isAttemptQuestion, meAttemptStats, isObjectiveQuestion } from '../js/scoring.js';
import { questionProgress } from '../js/pagination.js';
import { QuizRenderer } from '../js/renderer.js';
import { matchingFixture, MatchingElement } from './helpers/matching-dom.mjs';
import { loadApp } from './helpers/app.mjs';
const q = (extra = {}) => ({ tipo: 'ME', enunciado: 'Pergunta', alternativas: [
  { texto: 'Errada A', comentario: 'Comentário A' }, { texto: 'Errada B' },
  { texto: 'Errada C' }, { texto: '<b>Resposta correta</b><img src="figura.png">', comentario: 'Comentário certo' }
], gabarito: 'D', comentario_geral: 'Geral secreto', ...extra });
const state = (mode = 'hybrid', attempts = false) => ({ quizJson: {}, questions: [q()], config: { meWritten: mode, meAttempts: attempts },
  mappings: { qOrder: [0], altOrder: { 0: [3, 1, 0, 2] } }, userAnswers: {}, eliminatedAlts: {} });
const clonedParse = (nodes, inherited) => parseContent(structuredClone(nodes), [], () => 0, inherited);

test('herança do arquivo, pasta, subpasta, grupo e questão usa a definição mais próxima', () => {
  const nodes = [q(), { tipo: 'FOLDER', nome: 'P', compativelEscrita: false, conteudo: [q(),
    { tipo: 'FOLDER', nome: 'S', compativelEscrita: true, conteudo: [q(), q({ compativelEscrita: false })] },
    { tipo: 'GRUPO_JUNTAS', compativelEscrita: true, questoes: [q(), q({ compativelEscrita: false })] }] }];
  assert.deepEqual(clonedParse(nodes, true).map(writtenCompatibility), [true, false, true, false, true, false]);
  assert.deepEqual(clonedParse([q(), q({ compativelEscrita: true }), q({ compativelEscrita: false })]).map(writtenCompatibility), [undefined, true, false]);
  assert.equal(writtenCompatibility(clonedParse([q({ compativelEscrita: true })], false)[0]), true);
});
test('variantes preservam herança e exceções após re-sorteio e restauração JSON', () => {
  let questions = clonedParse([{ tipo: 'VARIANTES', questoes: [q(), q({ compativelEscrita: false })] }], true);
  assert.equal(writtenCompatibility(questions[0]), true);
  questions = JSON.parse(JSON.stringify(questions)); reshuffleVariants(questions, () => .99);
  assert.equal(writtenCompatibility(questions[0]), false);
  reshuffleVariants(questions, () => 0); assert.equal(writtenCompatibility(questions[0]), true);
});
test('modo só afeta ME elegíveis e volta a desativado sem configuração', () => {
  const s = state(); assert.equal(writtenStage(s, 0), 'writing');
  s.questions[0].tipo = 'MEM'; assert.equal(writtenMode(s, 0), 'off');
  s.questions[0] = q({ _writtenCompatibility: false }); assert.equal(writtenMode(s, 0), 'off');
  s.questions[0] = q(); delete s.config.meWritten; assert.equal(writtenMode(s, 0), 'off');
});
test('híbrido bloqueia escrita e só libera avaliação ao concluir ME', () => {
  const s = state(); assert.equal(submitWritten(s, 0, ''), false);
  assert.equal(submitWritten(s, 0, 'Minha resposta'), true);
  assert.equal(writtenStage(s, 0), 'me'); assert.equal(s.userAnswers[0].submitted, undefined);
  assert.equal(submitWritten(s, 0, 'Mudança'), false); assert.equal(assessWritten(s, 0, 9), false);
  s.userAnswers[0].selectedOriginalIdx = 3; s.userAnswers[0].submitted = true;
  assert.equal(writtenStage(s, 0), 'evaluation'); assert.equal(assessWritten(s, 0, 8), true);
  assert.equal(s.userAnswers[0].written.text, 'Minha resposta');
  assert.deepEqual(computeQuestionScore(s, 0), { hits: 1, total: 1 });
  const stats = writtenStats(s, computeQuestionScore).hybrid;
  assert.equal(stats.paired, 1); assert.equal(stats.pairedWritten, .8); assert.equal(stats.pairedMe, 1);
});
test('apenas escrita diferencia autoavaliação pendente de zero e normaliza para um ponto', () => {
  const s = state('written', true); submitWritten(s, 0, 'Resposta');
  assert.equal(isAttemptQuestion(s, 0), false); assert.equal(isObjectiveQuestion(s, 0), false);
  assert.deepEqual(computeQuestionScore(s, 0), { hits: 0, total: 0 }); assert.equal(questionProgress(s, 0), 'pending');
  assessWritten(s, 0, 0); assert.deepEqual(computeQuestionScore(s, 0), { hits: 0, total: 1 });
  assessWritten(s, 0, 7); assert.deepEqual(computeQuestionScore(s, 0), { hits: .7, total: 1 });
  assert.equal(assessWritten(s, 0, 11), false); assert.equal(assessWritten(s, 0, 2.5), false);
});
for (const k of [1, 2, 3]) test(`híbrido com tentativas, acerto na ${k}ª, preserva nota escrita`, () => {
  const s = state('hybrid', true); submitWritten(s, 0, 'Resposta'); const a = s.userAnswers[0];
  for (let i = 0; i < k - 1; i++) { a.selectedOriginalIdx = i; recordMeAttempt(s.questions[0], a); }
  a.selectedOriginalIdx = 3; recordMeAttempt(s.questions[0], a); assessWritten(s, 0, 8);
  const points = k === 1 ? 1 : (4 - k) / 4;
  assert.equal(computeQuestionScore(s, 0).hits, points);
  let stats = writtenStats(s, computeQuestionScore).hybrid;
  assert.equal(stats.sum, .8); assert.equal(stats.pairedMe, points); assert.equal(stats.buckets[k], 1);
  a.disregardCorrect = true; stats = writtenStats(s, computeQuestionScore).hybrid;
  assert.equal(stats.meSum, 0); assert.equal(stats.sum, .8); assert.equal(stats.buckets[k], 1);
});
test('esgotamento conclui ME e habilita autoavaliação; consulta não reinicia tentativas', () => {
  const s = state('hybrid', true); submitWritten(s, 0, 'Resposta'); const a = s.userAnswers[0];
  for (let i = 0; i < 3; i++) { a.selectedOriginalIdx = i; recordMeAttempt(s.questions[0], a); }
  assert.equal(writtenStage(s, 0), 'evaluation'); assessWritten(s, 0, 6);
  assert.equal(writtenStats(s, computeQuestionScore).hybrid.exhausted, 1);
  assert.equal(computeQuestionScore(s, 0).hits, 0);
});
test('conversão só em indefinidas antes do envio, preserva rascunho e volta a pontuar como ME', () => {
  const s = state('written', true); s.userAnswers[0] = { written: { text: 'Rascunho' } };
  assert.equal(fallbackWritten(s, 0), true); assert.equal(writtenMode(s, 0), 'off');
  assert.equal(isAttemptQuestion(s, 0), true); s.userAnswers[0].selectedOriginalIdx = 3;
  recordMeAttempt(s.questions[0], s.userAnswers[0]);
  assert.equal(computeQuestionScore(s, 0).hits, 1); assert.equal(writtenStats(s, computeQuestionScore).fallback, 1);
  assert.equal(writtenStats(s, computeQuestionScore).written.count, 0);
  assert.equal(s.userAnswers[0].written.text, 'Rascunho');
  const explicit = state(); explicit.questions[0].compativelEscrita = true; assert.equal(fallbackWritten(explicit, 0), false);
  const sent = state('written'); submitWritten(sent, 0, 'Resposta'); assert.equal(fallbackWritten(sent, 0), false);
});
test('não sei responder atribui zero explícito e pode avançar para ME', () => {
  for (const mode of ['written', 'hybrid']) {
    const s = state(mode); assert.equal(submitWritten(s, 0, '', true), true);
    assert.equal(s.userAnswers[0].written.selfEval, 0);
    if (mode === 'hybrid') s.userAnswers[0].submitted = true;
    assert.equal(assessWritten(s, 0, 10), false);
  }
});
test('estatísticas e comparativo usam somente etapas avaliadas e excluem questões removidas', () => {
  const s = state(); submitWritten(s, 0, 'Resposta'); s.userAnswers[0].submitted = true; s.userAnswers[0].selectedOriginalIdx = 3;
  let stats = writtenStats(s, computeQuestionScore).hybrid;
  assert.equal(stats.meCount, 1); assert.equal(stats.paired, 0); assert.equal(stats.evaluationPending, 1);
  assessWritten(s, 0, 7); s.questions.push(q()); s.mappings.qOrder.push(1);
  submitWritten(s, 1, 'Outra resposta');
  stats = writtenStats(JSON.parse(JSON.stringify(s)), computeQuestionScore).hybrid;
  assert.equal(stats.paired, 1); assert.equal(stats.mePending, 1); assert.equal(stats.sum, .7);
  for (const key of ['disabledIndices', 'deletedIndices', 'forcedIndices']) {
    s[key] = [0]; assert.equal(writtenStats(s, computeQuestionScore).hybrid.paired, 0); s[key] = [];
  }
  const html = writtenResultsHtml(s, computeQuestionScore);
  assert.match(html, /mesmas 1 questões/); assert.doesNotMatch(html, /Sem resposta escrita: 0|Tentativas esgotadas/);
});
function cardFixture(mode = 'hybrid', attempts = false) {
  const f = matchingFixture(), s = state(mode, attempts);
  const r = Object.create(QuizRenderer.prototype);
  Object.assign(r, { container: new MatchingElement(), callbacks: {}, _revealedMetadataQuestions: new Set(),
    highlighter: { createControlsHtml: () => '', setupControls() {}, registerTarget() {} },
    matchingQuestions: { clearQuestion() {} }, _applyWordMarking() {}, _setupMarkingListeners() {} });
  const card = () => r.createQuestionCard(s.questions[0], 0, 0, s);
  return { ...f, s, r, card };
}
test('cartão e cópia não contêm alternativas, comentários ou gabarito antes da escrita', () => {
  const { s, r, card } = cardFixture(); r._state = s;
  let view = card(); assert.equal(view.querySelectorAll('.alt-wrapper').length, 0);
  assert.equal(view.querySelectorAll('textarea').length, 1);
  assert.doesNotMatch(view.textContent, /Resposta correta|Geral secreto|Comentário certo|Errada A/);
  assert.doesNotMatch(r._formatQuestionText(0, 0), /Resposta correta|Errada A|Geral secreto/);
  submitWritten(s, 0, 'Minha resposta'); view = card();
  assert.equal(view.querySelectorAll('.alt-wrapper').length, 4);
  assert.equal(view.querySelector('textarea').readOnly, true);
  assert.equal(view.querySelector('textarea').value, 'Minha resposta');
  assert.equal(view.querySelectorAll('.self-eval-section').length, 0);
});
test('apenas escrita revela transcrição e comentário correto, original completo só ao abrir', () => {
  const { s, r, card } = cardFixture('written'); submitWritten(s, 0, 'Resposta');
  let view = card(); assert.match(view.querySelector('.escrita-gabarito').innerHTML, /<b>Resposta correta<\/b><img/);
  assert.match(view.querySelector('.written-correct-comment').textContent, /Comentário certo/);
  assert.equal(view.querySelectorAll('.alt-wrapper').length, 0);
  assert.doesNotMatch(view.textContent, /Geral secreto|Errada A/);
  assert.equal(view.querySelectorAll('.self-eval-section').length, 1);
  const original = view.querySelector('.written-original'); original.open = true; original.emit('toggle');
  assert.match(original.textContent, /Errada A|Geral secreto/); assert.equal(original.querySelectorAll('.written-original-alternative').length, 4);
  original.emit('toggle'); assert.equal(original.querySelectorAll('.written-original-alternative').length, 4);
  r._state = s; assert.doesNotMatch(r._formatQuestionText(0, 0), /Geral secreto|Errada A/);
});
test('híbrido concluído exibe escrita readonly, avaliação e resultado ME', () => {
  const { s, card } = cardFixture('hybrid', true); submitWritten(s, 0, 'Texto');
  s.userAnswers[0].selectedOriginalIdx = 3; recordMeAttempt(s.questions[0], s.userAnswers[0]);
  const view = card(); assert.equal(view.querySelectorAll('.self-eval-section').length, 1);
  assert.equal(view.querySelector('textarea').readOnly, true); assert.match(view.querySelector('.attempt-message').textContent, /1ª tentativa/);
});
test('configuração oculta sem ME, desabilita incompatíveis e informa indefinidas', () => {
  matchingFixture(); const root = new MatchingElement(), s = state();
  renderWrittenSettings(root, s, [0], () => {}); assert.match(root.textContent, /1 questões não possuem/);
  s.questions[0].compativelEscrita = false; renderWrittenSettings(root, s, [0], () => {});
  assert.equal(root.querySelector('select').disabled, true);
  s.questions[0].tipo = 'MEM'; renderWrittenSettings(root, s, [0], () => {}); assert.equal(root.classList.contains('hidden'), true);
});
function appFixture(mode = 'hybrid', attempts = false) {
  const app = loadApp(); app.state = state(mode, attempts);
  app.refreshAttemptSettings = app.save = app.applyCommentCollapseMode = () => {};
  app.renderer = { render() {} }; return app;
}
test('lote avança só escrita na primeira ação e nunca responde ME automaticamente', () => {
  const app = appFixture(); app.state.userAnswers[0] = { written: { text: 'Texto' } };
  app.submitAll(); assert.equal(writtenStage(app.state, 0), 'me');
  app.submitAll(); assert.equal(app.state.userAnswers[0].submitted, undefined);
  app.state.userAnswers[0].selectedOriginalIdx = 3; app.submitAll(); assert.equal(writtenStage(app.state, 0), 'evaluation');
});
test('encerramento preserva escrita e deixa avaliação pendente, sem inventar nota', () => {
  const app = appFixture('hybrid', true); app.state.userAnswers[0] = { written: { text: 'Texto' } };
  app.submitAll(true); assert.equal(app.state.userAnswers[0].attemptOutcome, 'blank');
  assert.equal(app.state.userAnswers[0].written.text, 'Texto'); assert.equal(app.state.userAnswers[0].written.selfEval, undefined);
  assert.equal(writtenStats(app.state, computeQuestionScore).hybrid.evaluationPending, 1);
});
test('controlador impede editar texto enviado e mudar seleção durante escrita', () => {
  const app = appFixture(); app.refreshWrittenCard = () => {};
  app.handleSelection(0, 3); assert.equal(app.state.userAnswers[0], undefined);
  app.handleWrittenSubmit(0, 'Original'); app.handleWrittenText(0, 'Mudança');
  app.handleWrittenSubmit(0, 'Mudança'); assert.equal(app.state.userAnswers[0].written.text, 'Original');
  assert.equal(app.attemptSettingsLocked(), true);
});

test('rodapé não considera autoavaliação ausente como zero e atualiza denominador ao avaliar', () => {
  const { s, r } = cardFixture('written'); submitWritten(s, 0, 'Texto');
  let captured;
  r.btnSubmitAll = new MatchingElement('button'); r.scoreDisplay = new MatchingElement();
  r._renderResultCard = (...args) => { captured = args; };
  r.updateFooter(s); assert.equal(captured[3], 0); assert.equal(captured[4], 0);
  assessWritten(s, 0, 7); r.updateFooter(s); assert.equal(captured[3], .7); assert.equal(captured[4], 1);
  s.disabledIndices = [0]; captured = undefined; r.updateFooter(s); assert.equal(captured, undefined);
});
test('avanço para próxima pendente inclui híbrida com ME pronta mas sem autoavaliação', () => {
  const app = appFixture(); submitWritten(app.state, 0, 'Texto'); app.state.userAnswers[0].submitted = true;
  assert.equal(app.isQuestionPending(0), true);
  assessWritten(app.state, 0, 10); assert.equal(app.isQuestionPending(0), false);
});

test('preferência libera botão e conversão de compatíveis explícitas ou herdadas nos dois modos', () => {
  for (const mode of ['hybrid', 'written']) for (const property of ['compativelEscrita', '_writtenCompatibility']) {
    const { s, card } = cardFixture(mode, true); s.questions[0][property] = true;
    assert.equal(card().querySelectorAll('.btn-written-link').length, 0);
    assert.equal(fallbackWritten(s, 0), false);
    s.config.allowWrittenFallback = true;
    assert.equal(card().querySelectorAll('.btn-written-link').length, 1);
    s.userAnswers[0] = { written: { text: 'Rascunho preservado' } };
    assert.equal(fallbackWritten(s, 0), true);
    s.config.allowWrittenFallback = false;
    assert.equal(writtenMode(s, 0), 'off');
    assert.equal(s.userAnswers[0].written.text, 'Rascunho preservado');
    assert.equal(isAttemptQuestion(s, 0), true);
  }
});
test('preferência não libera conversão após enviar escrita nem adapta questões incompatíveis', () => {
  const { s, card } = cardFixture('written'); s.config.allowWrittenFallback = true;
  s.questions[0].compativelEscrita = true; submitWritten(s, 0, 'Resposta enviada');
  assert.equal(fallbackWritten(s, 0), false);
  assert.equal(card().querySelectorAll('.btn-written-link').length, 0);
  s.questions[0].compativelEscrita = false; s.userAnswers = {};
  assert.equal(writtenMode(s, 0), 'off'); assert.equal(fallbackWritten(s, 0), false);
});
