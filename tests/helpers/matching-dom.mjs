import { Element } from './interactions-dom.mjs';
import { memoryStorage } from './app.mjs';

// DOM mínimo para a associação. Monta os templates usados pelos componentes;
// medidas são fixas, sem simular o layout SVG/CSS de um navegador real.
export class MatchingElement extends Element {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.clientWidth = 720;
    this.style.removeProperty = (name) => { delete this.style[name]; };
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get parentElement() { return this.parentNode; }
  get textContent() { return (this._text || '') + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get innerHTML() { return this._html || ''; }
  set innerHTML(html) {
    this._html = html; this._text = ''; this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); }
      else if (token.startsWith('<')) {
        const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
        const node = new MatchingElement(tag);
        for (const attribute of token.matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attribute[1], attribute[2]);
        stack.at(-1).appendChild(node);
        if (!['br', 'img', 'input'].includes(tag) && !token.endsWith('/>')) stack.push(node);
      } else stack.at(-1)._text += token;
    }
  }
  setAttribute(name, value) {
    super.setAttribute(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }
  matches(selectors) {
    return selectors.split(',').some((selector) => {
      selector = selector.trim();
      const tag = selector.match(/^[\w-]+/)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!this.classes.has(match[1])) return false;
      for (const match of selector.matchAll(/\[([\w-]+)="([^"]*)"\]/g)) {
        const key = match[1].slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const value = match[1].startsWith('data-') ? this.dataset[key] : this.attributes[match[1]];
        if (String(value) !== match[2]) return false;
      }
      return true;
    });
  }
  append(...nodes) {
    for (const value of nodes) {
      if (typeof value === 'string') { const node = new MatchingElement('span'); node.textContent = value; this.appendChild(node); }
      else this.appendChild(value);
    }
  }
  cloneNode(deep = false) {
    const copy = new MatchingElement(this.tagName); copy.className = this.className; copy._text = this._text;
    if (deep) this.children.forEach((child) => copy.appendChild(child.cloneNode(true)));
    return copy;
  }
}

export function matchingFixture() {
  const ids = new Map();
  const doc = new MatchingElement('document'); const win = new Element();
  doc.body = new MatchingElement('body');
  doc.getElementById = (id) => {
    if (!ids.has(id)) { const node = new MatchingElement(); ids.set(id, node); doc.body.appendChild(node); }
    return ids.get(id);
  };
  doc.createElement = (tag) => new MatchingElement(tag);
  doc.createElementNS = (namespace, tag) => new MatchingElement(tag);
  doc.querySelector = (selector) => doc.body.querySelector(selector);
  win.innerWidth = 800; win.innerHeight = 600;
  globalThis.document = doc; globalThis.window = win;
  globalThis.localStorage = memoryStorage();
  globalThis.getComputedStyle = () => ({ fontSize: '16px', paddingLeft: '0', paddingRight: '0' });
  const frames = new Map(); let nextFrame = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  };
  const flush = () => {
    for (let i = 0; frames.size && i < 30; i++) {
      const [id, callback] = frames.entries().next().value; frames.delete(id); callback();
    }
  };
  const shell = doc.getElementById('quizContainer');
  return { doc, win, shell, frames, observers, flush };
}
