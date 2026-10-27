import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFolderDescriptions, descriptionPreview, FolderDescriptions } from '../js/folder-descriptions.js';
import { matchingFixture, MatchingElement } from './helpers/matching-dom.mjs';

function setup() {
  const f = matchingFixture();
  const create = f.doc.createElement;
  f.doc.createElement = tag => {
    const node = create(tag);
    node.removeAttribute = name => { delete node.attributes[name]; };
    return node;
  };
  const state = { quizJson: { conteudo: [
    { tipo: 'FOLDER', nome: 'A', descricao: '<b>Descrição A</b>', conteudo: [
      { tipo: 'FOLDER', nome: 'Filha', descricao: '<style>p{color:red}</style><p>Descrição filha A</p>' }
    ] },
    { tipo: 'FOLDER', nome: 'B', conteudo: [{ tipo: 'FOLDER', nome: 'Filha', descricao: 'Descrição filha B' }] }
  ] }, filters: {} };
  const info = new FolderDescriptions(), root = new MatchingElement();
  info.populate(root, ['A', 'Filha'], JSON.parse(JSON.stringify(state)));
  return { ...f, info, root, state };
}
test('descrições seguem caminhos completos e são recuperadas do quiz de sessões antigas', () => {
  const f = setup();
  const map = collectFolderDescriptions(f.state.quizJson.conteudo);
  assert.match(map['A > Filha'], /filha A/); assert.equal(map['B > Filha'], 'Descrição filha B');
  assert.equal(f.root.querySelectorAll('button').length, 2);
  const other = new MatchingElement(); f.info.populate(other, ['B', 'Filha'], f.state);
  assert.equal(other.querySelectorAll('button').length, 1);
  other.querySelector('button').emit('click');
  assert.equal(f.info.path.textContent, 'B > Filha');
  assert.match(f.info.frame.srcdoc, /Descrição filha B/);
});
test('hover e foco mostram apenas texto; saída, Escape e limpeza retiram a prévia', () => {
  const { info, root } = setup();
  const button = root.querySelectorAll('button')[1];
  button.emit('pointerenter', { pointerType: 'touch' }); assert.equal(info.tooltip, undefined);
  button.emit('pointerenter', { pointerType: 'mouse' });
  assert.match(info.tooltip.textContent, /Descrição filha A/);
  assert.doesNotMatch(info.tooltip.textContent, /color:red|<p>/);
  assert.equal(info.tooltip.classList.contains('hidden'), false);
  button.emit('pointerleave'); assert.equal(info.tooltip.classList.contains('hidden'), true);
  button.emit('focus'); assert.equal(info.tooltip.classList.contains('hidden'), false);
  button.emit('keydown', { key: 'Escape' }); assert.equal(info.tooltip.classList.contains('hidden'), true);
  button.emit('focus'); info.dismiss(); assert.equal(info.tooltip.classList.contains('hidden'), true);
});
test('clique/toque abre modal com HTML/CSS isolados e permite fechar e reabrir sem acumular modais', () => {
  const { info, root } = setup(); const button = root.querySelectorAll('button')[1];
  button.emit('click');
  assert.equal(info.dialog.open, true); assert.equal(info.heading.textContent, 'Filha');
  assert.match(info.frame.srcdoc, /<style>p\{color:red\}<\/style>/);
  assert.equal(info.frame.attributes.sandbox, '');
  assert.equal(info.frame.title, 'Descrição de Filha');
  const dialog = info.dialog;
  dialog.querySelector('button').emit('click'); assert.equal(dialog.open, false);
  assert.equal(info.frame.srcdoc, '');
  button.emit('click'); assert.equal(info.dialog, dialog);
  info.dialog.emit('click', { target: dialog }); assert.equal(dialog.open, false);
});
test('trocar de sessão substitui as descrições e fechar a resolução descarta conteúdo aberto', () => {
  const { info, root } = setup(); root.querySelector('button').emit('click');
  info.dismiss(); assert.equal(info.dialog.open, false);
  const next = new MatchingElement(); info.populate(next, ['A'], { quizJson: { conteudo: [] }, filters: {} });
  assert.equal(next.querySelectorAll('button').length, 0);
});

import { QuizRenderer } from '../js/renderer.js';
test('breadcrumb real respeita ocultação de pastas e permite revelação e abertura no cartão', () => {
  const { state } = setup();
  const renderer = Object.create(QuizRenderer.prototype);
  Object.assign(renderer, {
    container: new MatchingElement(), callbacks: {}, _revealedMetadataQuestions: new Set(),
    highlighter: { createControlsHtml: () => '', setupControls() {}, registerTarget() {} },
    matchingQuestions: { clearQuestion() {} }, _applyWordMarking() {}, _setupMarkingListeners() {},
    _scheduleGroupConnectorUpdate() {}
  });
  const q = { tipo: 'ME', _path: ['A', 'Filha'], enunciado: 'Questão', alternativas: [{texto:'Sim'}, {texto:'Não'}], gabarito: 'A' };
  Object.assign(state, { config: { showFolders: false }, questions: [q], userAnswers: {},
    eliminatedAlts: {}, mappings: { qOrder: [0], altOrder: { 0: [0, 1] } } });
  const card = renderer.createQuestionCard(q, 0, 0, state);
  const breadcrumb = card.querySelector('.q-breadcrumbs');
  assert.equal(breadcrumb.classList.contains('hidden'), true);
  card.querySelector('.btn-metadata-visibility').emit('click');
  assert.equal(breadcrumb.classList.contains('hidden'), false);
  breadcrumb.querySelectorAll('button')[1].emit('click');
  assert.equal(renderer.folderInfo.dialog.open, true);
  assert.equal(renderer.folderInfo.path.textContent, 'A > Filha');
});
