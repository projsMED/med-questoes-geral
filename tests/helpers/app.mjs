import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as scoring from '../../js/scoring.js';
import * as utils from '../../js/utils.js';
import { appStorage, ALLOW_AUTOMATIC_SYNC } from '../../js/release-config.js';

// Carrega o controlador sem iniciar a página ou acessar Firebase real.
export function loadApp(overrides = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, checked: false, disabled: false,
      classList: { add() {}, remove() {} },
      listeners: new Map(),
      addEventListener(type, callback) { this.listeners.set(type, callback); }
    });
    return elements.get(id);
  };
  const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replace(/import\('\.\/firebase-config\.js\?v=[^']+'\)/g, 'Promise.resolve(firebaseConfigModule)')
    .replace(/import\('\.\/firebase-sync\.js\?v=[^']+'\)/g, 'Promise.resolve(firebaseSyncModule)')
    .replace(/App\.init\(\);\s*$/, 'App;');
  return vm.runInNewContext(source, {
    ...utils, ...scoring, appStorage, ALLOW_AUTOMATIC_SYNC,
    document: { getElementById: element, querySelector: element },
    window: { scrollTo() {} }, console,
    confirm: () => true, alert() {},
    setTimeout: () => 1, clearTimeout() {},
    ...overrides
  });
}

export function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
