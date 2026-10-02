// Regressões de interação sem dependências: node --test tests/interactions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Element, fixture } from './helpers/interactions-dom.mjs';
import { QuizRenderer } from '../js/renderer.js';
import { appStorage } from '../js/release-config.js';
import { questionTypes } from '../js/utils.js';

function addCard(fixture, index, top, bottom, parent = fixture.quizContainer) {
  const card = new Element('question-card'); card.dataset.originalIdx = String(index);
  card.getBoundingClientRect = () => ({ left: 100, right: 700, top: top - fixture.win.scrollY, bottom: bottom - fixture.win.scrollY });
  parent.appendChild(card);
  return card;
}

test('espaço entre cartões abre com dois toques e clique direito, sem mudar o espaçamento', () => {
  const f = fixture(); addCard(f, 9, 1520, 1900);
  f.settings.scheduleGutters(true); f.flush();
  const gap = f.settings.gapElements.get('gap:8:9');
  assert.ok(gap);
  assert.equal(gap.style.height, '20px');
  assert.equal(gap.style.width, '600px');
  assert.equal(gap.getAttribute?.('aria-hidden') || gap.attributes['aria-hidden'], 'true');
  f.tap(300, 510, { target: gap }); f.tap(300, 510, { target: gap });
  assert.equal(f.settings.dialog.open, true);
  f.settings.dialog.close(); f.flush();
  const event = f.doc.emit('contextmenu', f.pointer(300, 510, {
    target: f.settings.gapElements.get('gap:8:9'), pointerType: 'mouse', button: 2
  }));
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.settings.dialog.open, true);
});

test('gesto no espaço vazio preserva rolagem; toques em intervalos diferentes não se combinam', () => {
  const f = fixture(); addCard(f, 9, 1520, 1525); addCard(f, 10, 1540, 1900);
  f.settings.scheduleGutters(true); f.flush();
  const gap = f.settings.gapElements.get('gap:8:9');
  f.tap(300, 510, { target: gap });
  f.tap(300, 532, { target: f.settings.gapElements.get('gap:9:10') });
  assert.equal(f.settings.dialog.open, undefined);
  const down = f.doc.emit('pointerdown', f.pointer(300, 510, { target: gap }));
  const move = f.doc.emit('pointermove', f.pointer(300, 530, { target: gap }));
  f.doc.emit('pointerup', f.pointer(300, 530, { target: gap }));
  f.tap(300, 510, { target: gap });
  assert.equal(down.defaultPrevented, undefined);
  assert.equal(move.defaultPrevented, undefined);
  assert.equal(f.settings.dialog.open, undefined);
  f.win.emit('scroll'); f.tap(300, 510, { target: gap });
  assert.equal(f.settings.dialog.open, undefined);
});

test('intervalos em grupos funcionam, textos-base e áreas internas não viram atalhos', () => {
  const f = fixture();
  const group = new Element('question-group'); f.quizContainer.appendChild(group);
  group.appendChild(f.card); addCard(f, 9, 1520, 1900, group);
  f.settings.scheduleGutters(true); f.flush();
  f.tap(300, 510, { target: group }); f.tap(300, 510, { target: group });
  assert.equal(f.settings.dialog.open, true);
  f.settings.dialog.close(); f.flush();
  f.tap(300, 490, { target: f.card }); f.tap(300, 490, { target: f.card });
  assert.equal(f.settings.dialog.open, false);
  const header = new Element('group-container');
  header.getBoundingClientRect = () => ({ left: 100, right: 700, top: 500, bottom: 518 });
  group.children.splice(1, 0, header); header.parentNode = group;
  f.settings.scheduleGutters(true); f.flush();
  assert.equal(f.settings.gapElements.size, 0);
  f.tap(300, 510, { target: header }); f.tap(300, 510, { target: header });
  assert.equal(f.settings.dialog.open, false);
});

test('áreas transparentes são atualizadas após mudanças de layout e removidas com os cartões', () => {
  const f = fixture(); const second = addCard(f, 9, 1520, 1900);
  f.settings.scheduleGutters(true); f.flush();
  const oldGap = f.settings.gapElements.get('gap:8:9');
  second.getBoundingClientRect = () => ({ left: 100, right: 700, top: 540, bottom: 900 });
  f.settings.scheduleGutters(true); f.flush();
  assert.equal(f.settings.gapElements.get('gap:8:9'), oldGap);
  assert.equal(oldGap.style.height, '40px');
  second.remove(); f.settings.scheduleGutters(true); f.flush();
  assert.equal(f.settings.gapElements.size, 0);
  assert.equal(oldGap.parentNode, null);
});

test('dois toques abrem em ambas as margens; conteúdo, arrasto e rolagem não abrem', () => {
  const f = fixture();
  f.tap(); f.tap(); assert.equal(f.settings.dialog.open, true);
  f.settings.dialog.close(); f.flush();
  f.tap(760, 250); f.tap(760, 250); assert.equal(f.settings.dialog.open, true);
  f.settings.dialog.close(); f.flush();
  f.tap(200, 250, { target: f.card }); f.tap(200, 250, { target: f.card });
  assert.equal(f.settings.dialog.open, false);
  f.tap();
  f.doc.emit('pointerdown', f.pointer());
  f.doc.emit('pointermove', f.pointer(60));
  f.doc.emit('pointerup', f.pointer(60)); f.tap();
  assert.equal(f.settings.dialog.open, false);
  f.win.emit('scroll'); f.tap(); f.win.emit('scroll'); f.tap();
  assert.equal(f.settings.dialog.open, false);
});

test('pinça e toques em lados diferentes não formam atalho; clique direito funciona com mouse no tablet', () => {
  const f = fixture();
  f.tap();
  f.doc.emit('pointerdown', f.pointer());
  f.doc.emit('pointerdown', f.pointer(60, 250, { pointerId: 2, isPrimary: false }));
  f.doc.emit('pointerup', f.pointer(60, 250, { pointerId: 2, isPrimary: false }));
  f.doc.emit('pointerup', f.pointer());
  assert.equal(f.settings.dialog.open, undefined);
  f.tap(); f.tap(760); assert.equal(f.settings.dialog.open, undefined);
  const event = f.doc.emit('contextmenu', f.pointer(40, 250, { pointerType: 'mouse', button: 2 }));
  assert.equal(event.defaultPrevented, true); assert.equal(f.settings.dialog.open, true);
});

test('popup reutiliza e devolve os controles, preserva a questão após reconstrução da lista', () => {
  const f = fixture(); f.settings.open();
  f.settings.showSection('visual');
  assert.equal(f.visualPanel.parentNode, f.settings.host);
  assert.equal(f.visualPanel.classList.contains('hidden'), false);
  f.settings.showSection('general');
  assert.equal(f.visualPanel.parentNode, f.top);
  assert.equal(f.visualPanel.classList.contains('hidden'), true);
  assert.equal(f.generalPanel.parentNode, f.settings.host);
  const rebuilt = new Element('question-card'); rebuilt.dataset.originalIdx = '8';
  rebuilt.getBoundingClientRect = () => ({ top: 1300 - f.win.scrollY, bottom: 1700 - f.win.scrollY });
  f.card.replaceWith(rebuilt);
  f.settings.dialog.emit('change'); f.flush();
  assert.equal(rebuilt.getBoundingClientRect().top, 20);
  f.settings.dialog.close(); f.flush();
  assert.equal(f.generalPanel.parentNode, f.top);
  assert.equal(rebuilt.getBoundingClientRect().top, 20);
  assert.equal(f.settings.anchor, null);
});

test('tela cheia entra/sai pelo botão, atualiza estado e trata ausência de suporte e rejeição', async () => {
  const f = fixture(); let calls = 0;
  f.doc.documentElement.requestFullscreen = () => {
    calls++; f.doc.fullscreenElement = f.doc.documentElement;
    f.doc.emit('fullscreenchange'); return Promise.resolve();
  };
  f.doc.exitFullscreen = () => {
    f.doc.fullscreenElement = null; f.doc.emit('fullscreenchange'); return Promise.resolve();
  };
  const entry = f.settings.toggleFullscreen();
  assert.equal(calls, 1, 'solicita diretamente, sem adiar a ativação do usuário');
  await entry;
  assert.equal(f.settings.fullscreenButton.attributes['aria-pressed'], 'true');
  await f.settings.toggleFullscreen();
  assert.equal(f.settings.fullscreenButton.attributes['aria-pressed'], 'false');
  f.doc.documentElement.requestFullscreen = () => Promise.reject(new Error('denied'));
  await f.settings.toggleFullscreen();
  assert.match(f.settings.fullscreenStatus.textContent, /Não foi possível/);
  delete f.doc.documentElement.requestFullscreen; f.settings.updateFullscreen();
  assert.equal(f.settings.fullscreenButton.disabled, true);
  assert.match(f.settings.fullscreenStatus.textContent, /indisponível/);
});

test('atalho de tela cheia executa diretamente e sincroniza os dois botões e mensagens', async () => {
  const f = fixture(); const quick = f.element('btnQuickFullscreen');
  const quickStatus = f.element('quickFullscreenStatus');
  f.doc.documentElement.requestFullscreen = () => {
    f.doc.fullscreenElement = f.doc.documentElement;
    f.doc.emit('fullscreenchange'); return Promise.resolve();
  };
  f.doc.exitFullscreen = () => {
    f.doc.fullscreenElement = null; f.doc.emit('fullscreenchange'); return Promise.resolve();
  };
  f.settings.updateFullscreen(); f.settings.open();
  quick.emit('click');
  assert.equal(f.doc.fullscreenElement, f.doc.documentElement);
  await Promise.resolve();
  for (const button of f.settings.fullscreenButtons) {
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.match(button.textContent, /Sair/);
  }
  assert.equal(f.settings.mountedPanel, null, 'não precisa abrir configurações gerais');
  f.settings.fullscreenButton.emit('click'); await Promise.resolve();
  assert.equal(quick.attributes['aria-pressed'], 'false');
  f.doc.documentElement.requestFullscreen = () => Promise.reject(new Error('denied'));
  quick.emit('click'); await Promise.resolve();
  assert.match(quickStatus.textContent, /Não foi possível/);
  assert.equal(quickStatus.textContent, f.settings.fullscreenStatus.textContent);
  delete f.doc.documentElement.requestFullscreen; f.settings.updateFullscreen();
  assert.equal(quick.disabled, true);
  assert.match(quickStatus.textContent, /indisponível/);
});

test('alças distinguem duplo toque, arrasto horizontal e vertical sem gravar largura em um toque', () => {
  const f = fixture();
  const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replace(/App\.init\(\);\s*$/, 'globalThis.testApp = App;');
  globalThis.questionTypes = questionTypes;
  globalThis.appStorage = appStorage;
  vm.runInThisContext(source);
  const app = globalThis.testApp; app._quizWidth = 600;
  app.initQuizWidthControls();
  const handle = f.handles[0];
  const down = () => {
    const e = f.pointer(96, 250, { target: handle });
    f.doc.emit('pointerdown', e); handle.emit('pointerdown', e);
  };
  const up = () => {
    const e = f.pointer(96, 250, { target: handle });
    f.doc.emit('pointerup', e); handle.emit('pointerup', e);
  };
  down(); up(); down(); up();
  assert.equal(f.settings.dialog.open, true);
  assert.equal(appStorage.getItem('vs_quizWidth'), null);
  f.settings.dialog.close();
  down(); handle.emit('pointermove', f.pointer(76, 250, { target: handle }));
  assert.equal(app._quizWidth, 640);
  handle.emit('pointerup', f.pointer(76, 250, { target: handle }));
  assert.equal(appStorage.getItem('vs_quizWidth'), '640');
  down(); handle.emit('pointermove', f.pointer(96, 280, { target: handle }));
  handle.emit('pointerup', f.pointer(96, 280, { target: handle }));
  assert.equal(app._quizWidth, 640);
  assert.equal(f.doc.body.classList.contains('quiz-width-resizing'), false);
});

test('marca-texto alterna touch/caneta e mouse por interação; mouse salva seleção mesmo soltando fora', async () => {
  const f = fixture();
  const renderer = new QuizRenderer('quizContainer', 'footerBar', {});
  const highlighter = renderer.highlighter;
  highlighter._renderTextHighlights = () => {};
  const root = new Element('highlightable-text');
  root.textContent = 'Primeira palavra segunda palavra';
  const node = new Element(); node.nodeType = 3; node.textContent = root.textContent; root.appendChild(node);
  globalThis.Node = { TEXT_NODE: 3 };
  let selection = { isCollapsed: true, rangeCount: 0, removeAllRanges() { this.isCollapsed = true; } };
  f.win.getSelection = () => selection;
  const commits = [];
  highlighter._commitTextHighlight = (entry, start, end) => commits.push([start, end]);
  highlighter._getTextOffsetFromPoint = (element, x) => x;
  highlighter._scheduleTouchHighlightPreview = () => {};
  highlighter._updateTouchHighlightAutoScroll = () => {};
  const target = { type: 'question', id: '1' };
  highlighter._activeHighlightTargetKey = highlighter._highlightTargetKey(target);
  highlighter.registerTarget(root, target);
  for (const pointerType of ['touch', 'pen']) {
    root.emit('pointerdown', f.pointer(1, 10, { target: root, pointerType }));
    root.emit('pointermove', f.pointer(18, 10, { target: root, pointerType }));
    root.emit('pointerup', f.pointer(18, 10, { target: root, pointerType }));
    assert.equal(root.classList.contains('touch-highlighting'), false);
  }
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0], [0, 24], 'touch expande a seleção para palavras inteiras');
  root.emit('pointerdown', f.pointer(1, 10, { target: root, pointerType: 'mouse' }));
  assert.equal(highlighter._touchHighlightGesture, null);
  root.emit('mousedown', { button: 0 });
  selection = {
    isCollapsed: false, rangeCount: 1,
    getRangeAt: () => ({ startContainer: node, endContainer: node, startOffset: 1, endOffset: 5 }),
    removeAllRanges() { this.isCollapsed = true; }
  };
  f.doc.emit('mouseup', { button: 0, target: f.doc.body });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(commits.at(-1), [1, 5], 'mouse mantém precisão por caractere');
  assert.equal(selection.isCollapsed, true);
  // A classificação coarse do tablet não transforma cliques de mouse em touch.
  f.win.matchMedia = () => ({ matches: true });
  const mark = new Element('text-highlight'); mark.dataset.highlightId = 'mark-1'; root.appendChild(mark);
  let menus = 0; highlighter._showHighlightContextMenu = () => { menus++; };
  root.emit('click', { target: mark, pointerType: 'mouse' });
  assert.equal(menus, 0);
  root.emit('contextmenu', { target: mark, pointerType: 'mouse' });
  assert.equal(menus, 1);
  highlighter._suppressHighlightTapUntil = 0;
  root.emit('click', { target: mark, pointerType: 'touch' });
  assert.equal(menus, 2);
});
