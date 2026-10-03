import test from 'node:test';
import assert from 'node:assert/strict';
import { Preferences, readVisualPreferences, readGeneralPreferences } from '../js/preferences.js';
import { appStorage } from '../js/release-config.js';
import { loadApp, memoryStorage } from './helpers/app.mjs';
import { Element, fixture } from './helpers/interactions-dom.mjs';

const controlNames = [
  'btnVisualSettings', 'visualSettingsPanel', 'btnGeneralSettings', 'generalSettingsPanel',
  'chkFooterFixed', 'footerBar', 'commentModeCurrent', 'commentModeAll', 'commentSubOptions',
  'chkPersistManualOpen', 'chkVfStacked', 'mqModeTable', 'mqModeArrows', 'chkShowPartialScore',
  'rangeFontSize', 'fontSizeValue', 'chkShowDisregardCorrect', 'chkSimpleMvfCorrection',
  'chkDarkMode', 'darkModeIcon', 'quizWidthShell', 'rangeQuizWidth', 'quizWidthValue', 'btnResetQuizWidth'
];

function setup(saved = {}, systemDark = false) {
  const f = fixture();
  const media = new Element(); media.matches = systemDark;
  f.win.matchMedia = () => media;
  globalThis.localStorage = memoryStorage(saved);
  const elements = Object.fromEntries(controlNames.map((name) => [name, f.element(name)]));
  const app = loadApp({ document: f.doc, window: f.win });
  const effects = { renders: 0, collapses: 0, saves: 0, expands: 0 };
  app.renderer = { render: (state) => { assert.equal(state, app.state); effects.renders++; } };
  app.save = () => effects.saves++;
  app.applyCommentCollapseMode = () => effects.collapses++;
  app.expandAllComments = () => effects.expands++;
  app.initPreferences();
  const change = (name, value, type = 'change') => {
    if (typeof value === 'boolean') elements[name].checked = value;
    else if (value !== undefined) elements[name].value = String(value);
    elements[name].emit(type);
  };
  return { ...f, media, app, preferences: app.preferences, effects, elements, change };
}

const defaults = {
  footerFixed: true, commentMode: 'all', persistManualOpen: false, vfStacked: false,
  mqRenderMode: 'arrows', showPartialScore: true, fontSize: 16, quizWidth: 900, darkMode: null
};

test('preferências estáveis mantêm padrões e preservam chaves de teste da beta', () => {
  const saved = { 'beta:vs_darkMode': 'true', 'beta:vs_fontSize': '22', 'beta:gs_showDisregardCorrect': 'false' };
  const f = setup(saved);
  assert.deepEqual(readVisualPreferences(), defaults);
  assert.deepEqual(readGeneralPreferences(), { showDisregardCorrect: true, simpleMvfCorrection: false });
  assert.equal(f.doc.documentElement.classList.contains('dark-mode'), false);
  assert.equal(f.doc.body.style.fontSize, '16px');
  assert.equal(f.shell.style['--quiz-width'], '900px');
  assert.equal(appStorage.getItem('vs_quizWidth'), null, 'restaurar não grava valores padrão');
  for (const [key, value] of Object.entries(saved)) assert.equal(localStorage.getItem(key), value);
  f.preferences.dispose();
});

test('preferências estáveis salvas restauram controles e aparência sem regravar valores', () => {
  const saved = {
    'vs_footerFixed': 'false', 'vs_commentMode': 'current',
    'vs_persistManualOpen': 'true', 'vs_vfStacked': 'true',
    'vs_mqRenderMode': 'table', 'vs_showPartialScore': 'false',
    'vs_fontSize': '19', 'vs_quizWidth': '1100', 'vs_darkMode': 'false',
    'gs_showDisregardCorrect': 'false', 'gs_simpleMvfCorrection': 'true'
  };
  const f = setup(saved, true);
  assert.equal(f.elements.chkFooterFixed.checked, false);
  assert.equal(f.elements.footerBar.classList.contains('footer-inline'), true);
  assert.equal(f.elements.commentModeCurrent.checked, true);
  assert.equal(f.elements.commentModeAll.checked, false);
  assert.equal(f.elements.commentSubOptions.classList.contains('hidden'), false);
  assert.equal(f.elements.chkPersistManualOpen.checked, true);
  assert.equal(f.quizContainer.classList.contains('ch-vf-stacked'), true);
  assert.equal(f.elements.mqModeTable.checked, true);
  assert.equal(f.elements.mqModeArrows.checked, false);
  assert.equal(f.elements.chkShowPartialScore.checked, false);
  assert.equal(f.elements.chkShowDisregardCorrect.checked, false);
  assert.equal(f.elements.chkSimpleMvfCorrection.checked, true);
  assert.equal(f.doc.body.style.fontSize, '19px');
  assert.equal(f.elements.fontSizeValue.textContent, '19px');
  assert.equal(f.shell.style['--quiz-width'], '1100px');
  assert.equal(f.elements.quizWidthValue.textContent, '1100px');
  for (const handle of f.handles) assert.equal(handle.attributes['aria-valuenow'], '1100');
  assert.equal(f.elements.chkDarkMode.checked, false, 'escolha manual prevalece sobre sistema');
  for (const [key, value] of Object.entries(saved)) assert.equal(localStorage.getItem(key), value);
  f.preferences.dispose();
});

test('tema segue o sistema até uma escolha manual; descarte remove o observador', () => {
  const f = setup({}, true);
  assert.equal(f.doc.documentElement.classList.contains('dark-mode'), true);
  assert.equal(f.elements.darkModeIcon.textContent, '☀️');
  f.media.emit('change', { matches: false });
  assert.equal(f.doc.documentElement.classList.contains('dark-mode'), false);
  assert.equal(appStorage.getItem('vs_darkMode'), null);
  f.change('chkDarkMode', true);
  f.media.emit('change', { matches: false });
  assert.equal(f.doc.documentElement.classList.contains('dark-mode'), true);
  assert.equal(appStorage.getItem('vs_darkMode'), 'true');
  f.preferences.dispose(); appStorage.removeItem('vs_darkMode');
  f.media.emit('change', { matches: false });
  assert.equal(f.doc.documentElement.classList.contains('dark-mode'), true);
  assert.equal(f.media.listeners.get('change').length, 0);
});

test('rodapé, VF, fonte e largura continuam aplicando e persistindo alterações', () => {
  const f = setup();
  f.change('chkFooterFixed', false);
  assert.equal(f.elements.footerBar.classList.contains('footer-inline'), true);
  f.app.showQuizInterface();
  assert.equal(f.elements.footerBar.classList.contains('footer-inline'), true);
  f.change('chkVfStacked', true); f.change('rangeFontSize', 20, 'input');
  assert.equal(f.quizContainer.classList.contains('ch-vf-stacked'), true);
  assert.equal(f.doc.body.style.fontSize, '20px');
  f.change('rangeQuizWidth', 1000, 'input');
  assert.equal(f.shell.style['--quiz-width'], '1000px');
  f.handles[0].emit('keydown', { key: 'ArrowRight' });
  assert.equal(appStorage.getItem('vs_quizWidth'), '1010');
  f.handles[0].emit('keydown', { key: 'Home' });
  assert.equal(appStorage.getItem('vs_quizWidth'), '320');
  f.handles[0].emit('keydown', { key: 'End' });
  assert.equal(appStorage.getItem('vs_quizWidth'), '1800');
  f.elements.btnResetQuizWidth.emit('click');
  assert.equal(appStorage.getItem('vs_quizWidth'), '900');
  assert.equal(readVisualPreferences().footerFixed, false);
  assert.equal(readVisualPreferences().vfStacked, true);
  assert.equal(readVisualPreferences().fontSize, 20);
  assert.deepEqual(f.effects, { renders: 0, collapses: 0, saves: 0, expands: 0 });
  f.preferences.dispose();
});

test('comentários, associação, nota parcial e configurações gerais mantêm seus efeitos na sessão', () => {
  const f = setup();
  f.change('commentModeCurrent'); f.change('chkPersistManualOpen', true);
  assert.equal(readVisualPreferences().commentMode, 'current');
  assert.equal(readVisualPreferences().persistManualOpen, true);
  assert.equal(f.elements.commentSubOptions.classList.contains('hidden'), false);
  f.change('commentModeAll');
  assert.equal(f.effects.expands, 1);
  assert.equal(f.elements.commentSubOptions.classList.contains('hidden'), true);
  f.change('mqModeTable');
  assert.equal(f.effects.renders, 0, 'sem questões não reconstrói a lista');
  f.app.state.questions = [{ tipo: 'MQ' }]; f.change('mqModeArrows'); f.change('mqModeTable');
  assert.equal(readVisualPreferences().mqRenderMode, 'table');
  f.change('chkShowPartialScore', false);
  assert.equal(readVisualPreferences().showPartialScore, false);
  f.change('chkShowDisregardCorrect', false); f.change('chkSimpleMvfCorrection', true);
  assert.equal(f.app.state.config.showDisregardCorrect, false);
  assert.equal(f.app.state.config.applyDisregardedCorrect, false);
  assert.equal(f.app.state.config.simpleMvfCorrection, true);
  assert.deepEqual(f.effects, { renders: 5, collapses: 3, saves: 2, expands: 1 });
  f.app.ensureStateIntegrity(); f.app.restoreUI();
  assert.equal(f.elements.chkSimpleMvfCorrection.checked, true);
  assert.equal(f.elements.chkShowDisregardCorrect.checked, false);
  f.preferences.dispose();
});

test('controles continuam funcionando ao mover os painéis para o popup e devolver ao topo', () => {
  const f = setup();
  f.elements.btnVisualSettings.emit('click');
  assert.equal(f.visualPanel.classList.contains('hidden'), false);
  f.elements.btnVisualSettings.emit('click');
  for (const name of ['rangeFontSize', 'mqModeTable']) f.visualPanel.appendChild(f.elements[name]);
  f.generalPanel.appendChild(f.elements.chkSimpleMvfCorrection);
  f.settings.open(); f.settings.showSection('visual');
  assert.equal(f.visualPanel.parentNode, f.settings.host);
  f.change('rangeFontSize', 18, 'input'); f.change('mqModeTable');
  assert.equal(f.doc.body.style.fontSize, '18px');
  assert.equal(readVisualPreferences().mqRenderMode, 'table');
  f.settings.showSection('general'); f.change('chkSimpleMvfCorrection', true);
  assert.equal(f.app.state.config.simpleMvfCorrection, true);
  f.settings.dialog.close(); f.flush();
  assert.equal(f.generalPanel.parentNode, f.top);
  assert.equal(f.visualPanel.parentNode, f.top);
  f.elements.btnGeneralSettings.emit('click');
  assert.equal(f.generalPanel.classList.contains('hidden'), false);
  f.preferences.dispose();
});

test('reinicializar não duplica eventos e descarte cancela arrasto e captura sem gravar largura provisória', () => {
  const f = setup({ 'vs_quizWidth': '600', 'vs_commentMode': 'current', 'vs_mqRenderMode': 'table' });
  appStorage.setItem('vs_commentMode', 'all'); appStorage.setItem('vs_mqRenderMode', 'arrows');
  f.preferences.init();
  assert.equal(f.elements.commentModeAll.checked, true);
  assert.equal(f.elements.commentModeCurrent.checked, false);
  assert.equal(f.elements.commentSubOptions.classList.contains('hidden'), true);
  assert.equal(f.elements.mqModeArrows.checked, true);
  assert.equal(f.elements.mqModeTable.checked, false);
  assert.equal(f.media.listeners.get('change').length, 1);
  assert.equal(f.elements.rangeQuizWidth.listeners.get('input').length, 1);
  f.change('chkSimpleMvfCorrection', true);
  assert.equal(f.effects.saves, 1);
  const handle = f.handles[0];
  handle.emit('pointerdown', f.pointer(96, 250, { target: handle }));
  handle.emit('pointermove', f.pointer(76, 250, { target: handle }));
  assert.equal(f.shell.style['--quiz-width'], '640px');
  assert.equal(handle.capture, 1);
  f.preferences.dispose();
  assert.equal(f.shell.style['--quiz-width'], '600px');
  assert.equal(appStorage.getItem('vs_quizWidth'), '600');
  assert.equal(handle.capture, null);
  assert.equal(f.doc.body.classList.contains('quiz-width-resizing'), false);
  assert.equal(f.doc.listeners.get('pointerdown').length, 1, 'permanece apenas o listener do atalho');
  f.change('rangeQuizWidth', 1200, 'input');
  f.change('chkSimpleMvfCorrection', false);
  assert.equal(appStorage.getItem('vs_quizWidth'), '600');
  assert.equal(f.effects.saves, 1);
});

test('modal de editar sessão mantém eventos no controlador e fora do módulo de preferências', () => {
  const f = setup(); let saves = 0;
  f.app.saveEditSession = () => saves++;
  f.app.bindEvents();
  const modal = f.element('editSessionModal');
  for (const name of ['closeEditSession', 'btnEditCancel']) {
    modal.classList.remove('hidden'); f.app.elements[name].emit('click');
    assert.equal(modal.classList.contains('hidden'), true);
  }
  f.element('btnEditSave').emit('click'); assert.equal(saves, 1);
  modal.classList.remove('hidden'); modal.emit('click', { target: modal });
  assert.equal(modal.classList.contains('hidden'), true);
  f.preferences.dispose();
});
