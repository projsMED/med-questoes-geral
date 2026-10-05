import { SettingsShortcuts } from '../../js/settings-shortcuts.js';

// Superfície DOM mínima. Eventos e coordenadas vêm dos cenários, sem recriar
// o reconhecimento de gestos ou as regras de configuração da aplicação.
export class Element {
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
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((listener) => listener !== callback));
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
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
    this.parentNode = null;
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

export function fixture({ onOpenQuestionMap } = {}) {
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
  const quizContainer = element('quizContainer'); shell.appendChild(quizContainer);
  const card = new Element('question-card'); card.dataset.originalIdx = '8';
  card.getBoundingClientRect = () => ({ left: 100, right: 700, top: 1020 - win.scrollY, bottom: 1500 - win.scrollY });
  quizContainer.appendChild(card);
  const handles = ['left', 'right'].map((side) => {
    const handle = new Element(`quiz-resize-handle quiz-resize-${side}`);
    shell.appendChild(handle); return handle;
  });
  const gutters = ['left', 'right'].map(() => new Element('settings-shortcut-gutter'));
  doc.querySelectorAll = () => gutters;
  const home = element('settingsShortcutHome');
  home.appendChild(element('btnQuickFullscreen'));
  home.appendChild(element('quickFullscreenStatus'));
  home.appendChild(element('btnQuickQuestionMap'));
  for (const section of ['general', 'visual']) {
    const button = new Element(); button.dataset.settingsSection = section; home.appendChild(button);
  }
  const top = new Element();
  const visualPanel = element('visualSettingsPanel', 'hidden');
  const generalPanel = element('generalSettingsPanel', 'hidden');
  top.appendChild(visualPanel); top.appendChild(generalPanel);
  const fullscreenButton = element('btnFullscreen');
  const fullscreenStatus = element('fullscreenStatus');
  const settings = new SettingsShortcuts({ shell, visualPanel, generalPanel, fullscreenButton, fullscreenStatus, onOpenQuestionMap });
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
  return { ids, element, doc, win, settings, shell, quizContainer, card, handles, gutters, visualPanel, generalPanel, top, flush, pointer, tap };
}
