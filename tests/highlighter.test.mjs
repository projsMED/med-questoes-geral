import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizRenderer } from '../js/renderer.js';
import { TextHighlighter } from '../js/highlighter.js';
import { Element, fixture } from './helpers/interactions-dom.mjs';
import { loadApp } from './helpers/app.mjs';

function textRoot(f, text = 'Primeira palavra segunda palavra') {
  const root = new Element('highlightable-text'); root.textContent = text;
  f.quizContainer.appendChild(root);
  return root;
}

function highlighterFixture(callbacks = {}) {
  const f = fixture();
  const renderer = new QuizRenderer('quizContainer', 'footerBar', callbacks);
  const highlighter = renderer.highlighter;
  // A superfície DOM não calcula ranges de layout. Os testes de persistência
  // verificam o caminho real de commit/callback, isolando apenas a decoração.
  highlighter._renderTextHighlights = () => {};
  highlighter._rangeFromHighlightOffsets = (root, start, end) => ({ toString: () => root.textContent.slice(start, end) });
  return { ...f, renderer, highlighter };
}

test('marca-texto salva questões e grupos nos mesmos campos e lê a sessão restaurada', () => {
  const app = loadApp(); let saves = 0; app.save = () => { saves++; };
  const f = highlighterFixture({ onSetTextHighlights: (...args) => app.handleSetTextHighlights(...args) });
  f.renderer._state = app.state;
  const question = { type: 'question', id: '5' }; const group = { type: 'group', id: '5' };
  const root = textRoot(f, 'abcdefghi'); const groupRoot = textRoot(f, 'abcdefghi');
  f.highlighter.registerTarget(root, question, 'abcdefghi');
  f.highlighter.registerTarget(groupRoot, group, 'abcdefghi');
  const entry = f.highlighter._highlightTargets.get('question:5');
  assert.equal(f.highlighter._commitTextHighlight(entry, 0, 3), true);
  assert.equal(f.highlighter._commitTextHighlight(entry, 3, 6), true);
  const mark = app.state.textHighlights.questions['5'][0];
  assert.equal(app.state.textHighlights.questions['5'].length, 1, 'marcações adjacentes iguais são unidas');
  assert.equal(mark.text, 'abcdef'); assert.equal(mark.start, 0); assert.equal(mark.end, 6);
  assert.equal(mark.color, 'yellow'); assert.equal(mark.opacity, 0.42);
  assert.ok(mark.id && mark.sourceHash && mark.createdAt && mark.updatedAt);
  const groupEntry = f.highlighter._highlightTargets.get('group:5');
  f.highlighter._commitTextHighlight(groupEntry, 6, 9);
  assert.equal(app.state.textHighlights.groups['5'][0].text, 'ghi');
  assert.equal(saves, 3);
  const saved = JSON.parse(JSON.stringify(app.state));
  f.highlighter.beginRender(); f.renderer._state = saved;
  f.highlighter.registerTarget(textRoot(f, 'abcdefghi'), question, 'abcdefghi');
  f.highlighter.finishRender();
  assert.deepEqual(f.highlighter._getTextHighlights(question), saved.textHighlights.questions['5']);
  assert.deepEqual(f.highlighter._getTextHighlights(group), saved.textHighlights.groups['5']);
  assert.deepEqual(saved.userAnswers, {}, 'marcações não viram respostas');
  f.highlighter.dispose();
});

test('sobreposição é rejeitada; cor e opacidade de uma marcação são atualizadas por callback', () => {
  const state = { textHighlights: { questions: {}, groups: {} }, highlightSettings: { color: 'pink', opacity: 0.6 } };
  const f = highlighterFixture({ onSetTextHighlights: (type, id, marks) => { state.textHighlights.questions[id] = marks; } });
  f.renderer._state = state;
  const target = { type: 'question', id: '0' };
  f.highlighter.registerTarget(textRoot(f), target, 'texto-original');
  const entry = f.highlighter._highlightTargets.get('question:0');
  f.highlighter._commitTextHighlight(entry, 0, 8);
  const mark = state.textHighlights.questions['0'][0];
  const before = JSON.stringify(state);
  let notices = 0; f.highlighter._showHighlightToast = () => { notices++; };
  assert.equal(f.highlighter._commitTextHighlight(entry, 4, 10), false);
  assert.equal(JSON.stringify(state), before); assert.equal(notices, 1);
  f.highlighter._updateSingleHighlight(target, mark.id, { color: 'blue', opacity: 0.8 });
  const updated = state.textHighlights.questions['0'][0];
  assert.equal(updated.id, mark.id); assert.equal(updated.sourceHash, mark.sourceHash);
  assert.equal(updated.start, mark.start); assert.equal(updated.end, mark.end);
  assert.equal(updated.color, 'blue'); assert.equal(updated.opacity, 0.8);
  f.highlighter.dispose();
});

test('substituir um cartão remove eventos e cancela seleção pendente do elemento antigo', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = highlighterFixture(); const target = { type: 'question', id: '0' };
  const oldRoot = textRoot(f); f.highlighter.registerTarget(oldRoot, target);
  let captures = 0; f.highlighter._captureHighlightSelection = () => { captures++; };
  const entry = f.highlighter._highlightTargets.get('question:0');
  f.highlighter._scheduleSelectionCapture(entry, 20);
  const newRoot = textRoot(f); f.highlighter.registerTarget(newRoot, target);
  t.mock.timers.tick(30);
  assert.equal(captures, 0);
  assert.equal([...oldRoot.listeners.values()].flat().length, 0);
  assert.equal(f.highlighter._highlightTargets.size, 1);
  const nextEntry = f.highlighter._highlightTargets.get('question:0');
  f.highlighter._scheduleSelectionCapture(nextEntry, 20); t.mock.timers.tick(30);
  assert.equal(captures, 1);
  f.highlighter.dispose();
});

test('limpar a lista cancela gesto, captura do ponteiro, preview e rolagem automática', () => {
  const f = highlighterFixture(); const target = { type: 'question', id: '0' };
  const frames = new Map(); let nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const root = textRoot(f); f.highlighter.registerTarget(root, target);
  f.highlighter._activeHighlightTargetKey = 'question:0';
  f.highlighter._getTextOffsetFromPoint = (element, x) => x;
  let commits = 0; f.highlighter._commitTextHighlight = () => { commits++; };
  root.emit('pointerdown', f.pointer(1, 10, { target: root }));
  root.emit('pointermove', f.pointer(18, 10, { target: root }));
  assert.ok(f.highlighter._touchHighlightGesture?.active);
  assert.ok(frames.size > 0); assert.equal(root.hasPointerCapture(1), true);
  const preview = new Element(); f.doc.body.appendChild(preview);
  f.highlighter._touchHighlightPreviewLayer = preview;
  f.renderer.clear();
  assert.equal(f.highlighter._touchHighlightGesture, null);
  assert.equal(f.highlighter._activeHighlightTargetKey, null);
  assert.equal(f.highlighter._highlightTargets.size, 0);
  assert.equal(preview.parentNode, null); assert.equal(frames.size, 0);
  assert.equal(root.hasPointerCapture(1), false);
  root.emit('pointerup', f.pointer(18, 10, { target: root }));
  assert.equal(commits, 0);
  f.highlighter.dispose();
});

test('menus fecham por Escape e toque externo; reconstruções não acumulam eventos globais', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const count = (type) => (f.doc.listeners.get(type) || []).length;
  const before = { mouseup: count('mouseup'), keydown: count('keydown'), pointerdown: count('pointerdown') };
  let copyMenusClosed = 0;
  const highlighter = new TextHighlighter({ container: f.quizContainer, getState: () => null, onBeforePopover: () => { copyMenusClosed++; } });
  const show = () => {
    const menu = new Element(); menu.offsetWidth = 120; menu.offsetHeight = 100;
    highlighter._mountHighlightPopover(menu, { left: 100, top: 100, bottom: 120 });
    t.mock.timers.tick(0); return menu;
  };
  for (let i = 0; i < 4; i++) {
    show(); assert.equal(count('pointerdown'), before.pointerdown + 1);
    highlighter.beginRender(); highlighter.finishRender();
    assert.equal(count('pointerdown'), before.pointerdown);
  }
  const menu = show();
  f.doc.emit('keydown', { key: 'Escape' });
  assert.equal(menu.parentNode, null); assert.equal(highlighter._highlightPopover, null);
  show(); f.doc.emit('pointerdown', { target: f.doc.body });
  assert.equal(highlighter._highlightPopover, null);
  assert.equal(count('mouseup'), before.mouseup + 1);
  assert.equal(count('keydown'), before.keydown + 1);
  show(); highlighter.dispose(); t.mock.timers.tick(10);
  assert.equal(count('pointerdown'), before.pointerdown);
  assert.equal(count('mouseup'), before.mouseup); assert.equal(count('keydown'), before.keydown);
  assert.equal(highlighter._timers.size, 0); assert.ok(copyMenusClosed > 0);
});

test('fallback touch mantém atraso de seleção e cancela ações ao reconstruir', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); delete f.win.PointerEvent;
  const highlighter = new TextHighlighter({ container: f.quizContainer, getState: () => null });
  highlighter._renderTextHighlights = () => {};
  const target = { type: 'question', id: '0' }; const root = textRoot(f);
  highlighter.registerTarget(root, target);
  assert.equal(highlighter._supportsDirectTouchHighlight, false);
  let captures = 0; highlighter._captureHighlightSelection = () => { captures++; };
  root.emit('touchend'); t.mock.timers.tick(200); root.emit('touchend');
  t.mock.timers.tick(200); assert.equal(captures, 0);
  highlighter.beginRender(); t.mock.timers.tick(100); assert.equal(captures, 0);
  highlighter.registerTarget(root, target); root.emit('touchend');
  t.mock.timers.tick(280); assert.equal(captures, 1);
  highlighter.dispose(); assert.equal([...root.listeners.values()].flat().length, 0);
});
