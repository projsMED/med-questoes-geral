// Regressões de interação sem dependências: node --test tests/interactions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SettingsShortcuts } from '../js/settings-shortcuts.js';
import { QuizRenderer } from '../js/renderer.js';
import { questionTypes } from '../js/utils.js';

// Superfície DOM mínima. Eventos e coordenadas vêm dos cenários, sem recriar
// o reconhecimento de gestos ou as regras de configuração da aplicação.
class Element {
  constructor(classes = '') {
    this.classes = new Set(classes.split(' ').filter(Boolean));
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force = !this.classes.has(name)) => {
        if (force) this.classes.add(name); else this.classes.delete(name);
        return force;
      }
    };
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    this.rect = { left: 100, right: 700, top: 0, bottom: 3000, width: 600, height: 3000 };
    this.isConnected = true;
    this.innerHTML = '';
    this.textContent = '';
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  emit(type, event = {}) {
    event.target ||= this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => {};
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  matches(selectors) {
    return selectors.split(',').some((selector) => {
      selector = selector.trim();
      if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
      if (selector === '[data-settings-section]') return !!this.dataset.settingsSection;
      return false;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector); }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    this.children.push(child); child.parentNode = this; return child;
  }
  replaceWith(replacement) {
    const parent = this.parentNode;
    if (replacement.parentNode) replacement.parentNode.children = replacement.parentNode.children.filter((item) => item !== replacement);
    parent.children[parent.children.indexOf(this)] = replacement;
    replacement.parentNode = parent; this.parentNode = null;
  }
  contains(child) { return child === this || this.children.some((element) => element.contains(child)); }
  getBoundingClientRect() { return { ...this.rect }; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}

function fixture() {
  const ids = new Map();
  const element = (id, classes = '') => {
    if (!ids.has(id)) ids.set(id, new Element(classes));
    return ids.get(id);
  };
  const doc = new Element();
  doc.getElementById = (id) => element(id);
  doc.createElement = () => new Element();
  doc.documentElement = new Element(); doc.body = new Element();
  doc.querySelector = () => new Element();
  doc.fullscreenEnabled = true;
  const win = new Element();
  win.innerWidth = 800; win.innerHeight = 600; win.scrollY = 1000;
  win.scrollTo = ({ top }) => { win.scrollY = top; };
  win.PointerEvent = function () {};
  win.getSelection = () => null;
  doc.caretPositionFromPoint = () => {};
  globalThis.window = win; globalThis.document = doc;
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.localStorage = { values: new Map(), setItem(key, value) { this.values.set(key, value); }, getItem(key) { return this.values.get(key) ?? null; } };
  let time = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => time } });
  const shell = element('quizWidthShell');
  const card = new Element('question-card'); card.dataset.originalIdx = '8';
  card.getBoundingClientRect = () => ({ top: 1020 - win.scrollY, bottom: 1500 - win.scrollY });
  shell.appendChild(card);
  const handles = ['left', 'right'].map((side) => {
    const handle = new Element(`quiz-resize-handle quiz-resize-${side}`);
    shell.appendChild(handle); return handle;
  });
  const gutters = ['left', 'right'].map(() => new Element('settings-shortcut-gutter'));
  doc.querySelectorAll = () => gutters;
  const home = element('settingsShortcutHome');
  for (const section of ['general', 'visual']) {
    const button = new Element(); button.dataset.settingsSection = section; home.appendChild(button);
  }
  const top = new Element();
  const visualPanel = element('visualSettingsPanel', 'hidden');
  const generalPanel = element('generalSettingsPanel', 'hidden');
  top.appendChild(visualPanel); top.appendChild(generalPanel);
  const fullscreenButton = element('btnFullscreen');
  const fullscreenStatus = element('fullscreenStatus');
  const settings = new SettingsShortcuts({ shell, visualPanel, generalPanel, fullscreenButton, fullscreenStatus });
  const flush = () => {
    for (let i = 0; frames.length && i < 100; i++) frames.shift()();
  };
  const pointer = (x = 40, y = 250, extra = {}) => ({
    pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    clientX: x, clientY: y, cancelable: true, target: gutters[0], ...extra
  });
  const tap = (x = 40, y = 250, extra = {}) => {
    doc.emit('pointerdown', pointer(x, y, extra)); time += 60;
    doc.emit('pointerup', pointer(x, y, extra)); time += 80;
  };
  flush();
  return { ids, element, doc, win, settings, shell, card, handles, gutters, visualPanel, generalPanel, top, flush, pointer, tap };
}

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

test('alças distinguem duplo toque, arrasto horizontal e vertical sem gravar largura em um toque', () => {
  const f = fixture();
  const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replace(/App\.init\(\);\s*$/, 'globalThis.testApp = App;');
  globalThis.questionTypes = questionTypes;
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
  assert.equal(localStorage.getItem('vs_quizWidth'), null);
  f.settings.dialog.close();
  down(); handle.emit('pointermove', f.pointer(76, 250, { target: handle }));
  assert.equal(app._quizWidth, 640);
  handle.emit('pointerup', f.pointer(76, 250, { target: handle }));
  assert.equal(localStorage.getItem('vs_quizWidth'), '640');
  down(); handle.emit('pointermove', f.pointer(96, 280, { target: handle }));
  handle.emit('pointerup', f.pointer(96, 280, { target: handle }));
  assert.equal(app._quizWidth, 640);
  assert.equal(f.doc.body.classList.contains('quiz-width-resizing'), false);
});

test('marca-texto alterna touch/caneta e mouse por interação; mouse salva seleção mesmo soltando fora', async () => {
  const f = fixture();
  const renderer = new QuizRenderer('quizContainer', 'footerBar', {});
  renderer._renderTextHighlights = () => {};
  const root = new Element('highlightable-text');
  root.textContent = 'Primeira palavra segunda palavra';
  const node = new Element(); node.nodeType = 3; node.textContent = root.textContent; root.appendChild(node);
  globalThis.Node = { TEXT_NODE: 3 };
  let selection = { isCollapsed: true, rangeCount: 0, removeAllRanges() { this.isCollapsed = true; } };
  f.win.getSelection = () => selection;
  const commits = [];
  renderer._commitTextHighlight = (entry, start, end) => commits.push([start, end]);
  renderer._getTextOffsetFromPoint = (element, x) => x;
  renderer._scheduleTouchHighlightPreview = () => {};
  renderer._updateTouchHighlightAutoScroll = () => {};
  const target = { type: 'question', id: '1' };
  renderer._activeHighlightTargetKey = renderer._highlightTargetKey(target);
  renderer._registerHighlightTarget(root, target);
  for (const pointerType of ['touch', 'pen']) {
    root.emit('pointerdown', f.pointer(1, 10, { target: root, pointerType }));
    root.emit('pointermove', f.pointer(18, 10, { target: root, pointerType }));
    root.emit('pointerup', f.pointer(18, 10, { target: root, pointerType }));
    assert.equal(root.classList.contains('touch-highlighting'), false);
  }
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0], [0, 24], 'touch expande a seleção para palavras inteiras');
  root.emit('pointerdown', f.pointer(1, 10, { target: root, pointerType: 'mouse' }));
  assert.equal(renderer._touchHighlightGesture, null);
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
  let menus = 0; renderer._showHighlightContextMenu = () => { menus++; };
  root.emit('click', { target: mark, pointerType: 'mouse' });
  assert.equal(menus, 0);
  root.emit('contextmenu', { target: mark, pointerType: 'mouse' });
  assert.equal(menus, 1);
  renderer._suppressHighlightTapUntil = 0;
  root.emit('click', { target: mark, pointerType: 'touch' });
  assert.equal(menus, 2);
});
