import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchingQuestions } from '../js/matching-questions.js';
import { QuizRenderer } from '../js/renderer.js';
import { computeQuestionScore } from '../js/scoring.js';
import { appStorage } from '../js/release-config.js';
import { loadApp } from './helpers/app.mjs';
import { matchingFixture } from './helpers/matching-dom.mjs';

const question = () => ({
  tipo: 'MQ', coluna_esquerda: { nome: 'Itens', itens: [{ texto: 'Primeiro {A}' }, { texto: 'Segundo' }] },
  coluna_direita: { nome: 'Opções', itens: [{ texto: 'Alfa' }, { texto: 'Beta' }, { texto: 'Gama' }] },
  gabarito: '1(A, C), 2(nulo)'
});

function setup(mode = 'arrows', answer = {}, submitted = false, locked = false) {
  const f = matchingFixture(); const app = loadApp(); app.save = () => {};
  const q = question();
  Object.assign(app.state, { questions: [q], userAnswers: { 0: answer }, mappings: { qOrder: [0], altOrder: { 0: { left: [1, 0], right: [2, 0, 1] } } } });
  appStorage.setItem('vs_mqRenderMode', mode);
  const mq = new MatchingQuestions({ container: f.shell, onChange: (...args) => app.handleMqChange(...args) });
  const view = mq.render(q, 0, app.state, locked, submitted, answer); f.shell.appendChild(view); f.flush();
  return { ...f, app, q, mq, view };
}

test('setas criam/removem conexões por índices originais mesmo com colunas embaralhadas', () => {
  const f = setup();
  const left = f.view.querySelector('.mq-left-item[data-orig-idx="0"]');
  const right = f.view.querySelector('.mq-right-item[data-orig-idx="2"]');
  left.emit('click'); right.emit('click');
  assert.deepEqual(f.app.state.userAnswers[0].connections, [{ leftOrigIdx: 0, rightOrigIdx: 2 }]);
  assert.equal(f.view.querySelectorAll('.mq-arrow-default').length, 1);
  right.emit('click'); left.emit('click');
  assert.deepEqual(f.app.state.userAnswers[0].connections, []);
  assert.equal(f.view.querySelectorAll('.mq-arrow-default').length, 0);
  f.shell.classList.add('selection-mode'); left.emit('click'); right.emit('click');
  assert.deepEqual(f.app.state.userAnswers[0].connections, []);
  f.mq.dispose();
});

test('tabela mantém conexões ao trocar de modo, permite múltiplas relações e corrige proporcionalmente', () => {
  const f = setup('table', { connections: [{ left: 0, right: 2 }] });
  const cell = (l, r) => f.view.querySelector(`.choice[data-left="${l}"][data-right="${r}"]`);
  assert.equal(cell(0, 2).classList.contains('selected'), true);
  cell(0, 0).emit('click');
  f.app.state.userAnswers[0].submitted = true;
  assert.deepEqual(computeQuestionScore(f.app.state, 0), { hits: 1, total: 1 });
  cell(0, 2).emit('click');
  assert.deepEqual(computeQuestionScore(f.app.state, 0), { hits: 0.75, total: 1 });
  const connections = JSON.parse(JSON.stringify(f.app.state.userAnswers[0].connections));
  appStorage.setItem('vs_mqRenderMode', 'arrows');
  const arrows = f.mq.render(f.q, 0, f.app.state, false, false, { connections }); f.shell.appendChild(arrows); f.flush();
  assert.equal(arrows.querySelectorAll('.mq-arrow-default').length, 1);
  assert.deepEqual(f.app.state.userAnswers[0].connections, connections);
  f.mq.dispose();
});

test('questões bloqueadas ou entregues não aceitam respostas novas em nenhum modo', () => {
  for (const mode of ['arrows', 'table']) for (const [locked, submitted] of [[true, false], [false, true]]) {
    const f = setup(mode, { connections: [] }, submitted, locked);
    if (mode === 'table') f.view.querySelector('.choice').emit('click');
    else {
      f.view.querySelector('.mq-left-item').emit('click'); f.view.querySelector('.mq-right-item').emit('click');
    }
    assert.deepEqual(f.app.state.userAnswers[0].connections, []);
    f.mq.dispose();
  }
});

test('correção visual distingue corretas, erradas e omissões e preserva letras do gabarito embaralhado', () => {
  const answer = { submitted: true, connections: [{ leftOrigIdx: 0, rightOrigIdx: 0 }, { leftOrigIdx: 0, rightOrigIdx: 1 }] };
  const f = setup('table', answer, true);
  assert.equal(f.view.querySelectorAll('.mq-cell-correct').length, 1);
  assert.equal(f.view.querySelectorAll('.mq-cell-wrong').length, 1);
  assert.equal(f.view.querySelectorAll('.mq-cell-missed').length, 1);
  const html = f.mq.renderAnswerHtml(f.q, 0, f.app.state);
  assert.match(html, /<strong>1<\/strong> \(Segundo\).*\[ nenhum \]/);
  assert.match(html, /<strong>2<\/strong> \(Primeiro \{A\}\).*\[ A, B \]/);
  appStorage.setItem('vs_mqRenderMode', 'arrows');
  const arrows = f.mq.render(f.q, 0, f.app.state, false, true, answer); f.shell.appendChild(arrows); f.flush();
  assert.equal(arrows.querySelectorAll('.mq-arrow-correct').length, 1);
  assert.equal(arrows.querySelectorAll('.mq-arrow-wrong').length, 1);
  assert.equal(arrows.querySelectorAll('.mq-omission').length, 1);
  arrows.querySelector('.mq-omission').emit('click');
  assert.equal(arrows.querySelectorAll('.mq-arrow-omission-focus').length, 1);
  f.mq.dispose();
});

test('menu de uma seta exclui a relação e limpa os eventos de fechamento', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = setup('arrows', { connections: [{ leftOrigIdx: 0, rightOrigIdx: 2 }] });
  f.view.querySelector('.mq-arrow-hitbox').emit('contextmenu', { clientX: 30, clientY: 40 });
  t.mock.timers.tick(10); assert.ok(f.doc.querySelector('.mq-context-menu'));
  f.doc.querySelector('.mq-context-menu-item').emit('click');
  assert.deepEqual(f.app.state.userAnswers[0].connections, []);
  assert.equal(f.doc.querySelector('.mq-context-menu'), null);
  assert.equal((f.doc.listeners.get('contextmenu') || []).length, 0);
  f.mq.dispose();
});

test('reconstruir setas cancela desenho, observadores, temporizadores e menu pendente', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = setup('arrows', { connections: [{ leftOrigIdx: 0, rightOrigIdx: 2 }] });
  const hitbox = f.view.querySelector('.mq-arrow-hitbox');
  hitbox.emit('click', { clientX: 30, clientY: 40 });
  hitbox.emit('contextmenu', { clientX: 30, clientY: 40 });
  f.observers[0].callback(); assert.equal(f.frames.size, 1);
  f.mq.clearQuestion(0); t.mock.timers.tick(500);
  assert.equal(f.frames.size, 0); assert.equal(f.observers[0].disconnected, true);
  assert.equal((f.win.listeners.get('resize') || []).length, 0);
  assert.equal((f.doc.listeners.get('contextmenu') || []).length, 0);
  assert.equal(f.doc.querySelector('.mq-context-menu'), null);
  assert.equal(f.mq._questionTimers.size, 0);
});

test('tabela conserva zoom e redimensionamento; limpar desfaz expansão e captura de ponteiro', () => {
  const f = setup('table');
  const [minus, plus] = f.view.querySelectorAll('.btn-mq-zoom');
  plus.emit('click'); assert.equal(f.view.style['--mq-table-font-size'], '15px');
  minus.emit('click'); assert.equal(f.view.style['--mq-table-font-size'], '14px');
  const resizer = f.view.querySelector('.mq-resizer-col1');
  resizer.emit('pointerdown', { clientX: 100, pointerId: 1 });
  resizer.emit('pointermove', { clientX: -1000, pointerId: 1 });
  assert.equal(f.view.style['--mq-col1-width'], '80px');
  resizer.emit('pointerup', { pointerId: 1 }); resizer.emit('dblclick');
  assert.equal(f.view.style['--mq-col1-width'], undefined);
  const second = f.view.querySelector('.mq-resizer-col2');
  second.emit('pointerdown', { clientX: 100, pointerId: 2 });
  second.emit('pointermove', { clientX: 2000, pointerId: 2 });
  assert.equal(f.view.style['--mq-col2-width'], '420px');
  f.view.querySelector('.btn-mq-expand').emit('click');
  assert.equal(f.doc.body.classList.contains('mq-has-expanded'), true);
  f.mq.clear();
  assert.equal(f.view.classList.contains('mq-is-expanded'), false);
  assert.equal(f.doc.body.classList.contains('mq-has-expanded'), false);
  assert.equal(second.hasPointerCapture(2), false);
  assert.equal(second.classList.contains('is-resizing'), false);
  assert.equal((f.win.listeners.get('keydown') || []).length, 0);
});

test('renderer limpa recursos da associação ao sair da sessão', () => {
  const f = matchingFixture(); const renderer = new QuizRenderer('quizContainer', 'footerBar', {});
  appStorage.setItem('vs_mqRenderMode', 'table');
  const state = { mappings: { altOrder: {} } };
  const view = renderer.matchingQuestions.render(question(), 0, state, false, false, {}); f.shell.appendChild(view);
  view.querySelector('.btn-mq-expand').emit('click');
  renderer.clear();
  assert.equal(renderer.matchingQuestions._cleanups.size, 0);
  assert.equal(f.doc.body.classList.contains('mq-has-expanded'), false);
  assert.equal((f.win.listeners.get('keydown') || []).length, 0);
  renderer.highlighter.dispose(); renderer.matchingQuestions.dispose();
});

test('alinha topos com alturas distintas, avisos, cabeçalhos e recalcula após resize', () => {
  const f = setup('arrows', { connections: [{ leftOrigIdx: 0, rightOrigIdx: 2 }] }, true);
  appStorage.setItem('vs_mqAlignColumns', 'true');
  const view = f.mq.render(f.q, 0, f.app.state, false, true, f.app.state.userAnswers[0]);
  f.shell.appendChild(view);
  const lists = view.querySelectorAll('.mq-items-list');
  const headers = view.querySelectorAll('.mq-column-header');
  headers[0].getBoundingClientRect = () => ({ height: 60 });
  headers[1].getBoundingClientRect = () => ({ height: 40 });
  const heights = [[100, 200], [40, 50, 300]];
  lists.forEach((list, side) => list.children.forEach((item, index) => {
    item.getBoundingClientRect = () => ({ height: heights[side][index] });
  }));
  f.flush();
  assert.equal(lists[0].style.rowGap, '10px');
  assert.equal(lists[1].style.rowGap, '10px');
  assert.equal(lists[0].style.paddingTop, '0px');
  assert.equal(lists[1].style.paddingTop, '20px');
  heights[1][0] = 80;
  f.win.emit('resize'); f.flush();
  assert.equal(lists[0].style.rowGap, '50px');
  assert.equal(lists[1].style.rowGap, '10px');
  assert.deepEqual(f.app.state.userAnswers[0].connections, [{ leftOrigIdx: 0, rightOrigIdx: 2 }]);
  appStorage.setItem('vs_mqAlignColumns', 'false');
  const normal = f.mq.render(f.q, 0, f.app.state, false, false, f.app.state.userAnswers[0]);
  f.shell.appendChild(normal); f.flush();
  assert.equal(normal.querySelector('.mq-items-list').style.rowGap, undefined);
  f.mq.dispose();
});

test('distribui três itens contra cinco e mantém item único no topo', () => {
  for (const count of [1, 3]) {
    const f = matchingFixture();
    appStorage.setItem('vs_mqAlignColumns', 'true');
    const q = { tipo: 'MQ', coluna_esquerda: { itens: Array.from({ length: count }, () => ({ texto: 'Item' })) },
      coluna_direita: { itens: Array.from({ length: 5 }, () => ({ texto: 'Item' })) } };
    const mq = new MatchingQuestions({ container: f.shell });
    const view = mq.render(q, 0, { mappings: { altOrder: {} } }, false, false, {});
    f.shell.appendChild(view);
    const lists = view.querySelectorAll('.mq-items-list');
    lists.forEach((list) => list.children.forEach((item) => {
      item.getBoundingClientRect = () => ({ height: 40 });
    }));
    f.flush();
    assert.equal(lists[0].style.rowGap, count === 1 ? '10px' : '60px');
    assert.equal(lists[1].style.rowGap, '10px');
    assert.equal(lists[0].style.paddingTop, '0px');
    mq.dispose();
  }
});
