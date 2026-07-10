/* ===== JS: js\main.js ===== */
import {
  saveState, loadState, clearState, exportState, importState,
  saveSession, loadSession, deleteSession, getAllSessions,
  exportAllSessions, importAllSessions, migrateLegacyState, generateId,
  saveSessionFolders, loadSessionFolders, updateSessionFolder
} from './store.js?v=20260704-1';
import { parseContent, reshuffleVariants, reshuffleChVariants } from './parser.js?v=20260704-1';
import {
  shuffleArray,
  difficultyMap,
  questionTypeMap,
  questionTypes,
  computeMeChScore
} from './utils.js?v=20260704-1';
import { QuizRenderer } from './renderer.js?v=20260704-1';

const App = {
  activeSessionId: null,
  _sessionTitle: null,
  _sourceFileName: null,
  _manuallyOpenedComments: new Set(),
  _scrollTimer: null,
  _tripleTapState: { count: 0, timer: null },
  _sessionFolders: [],
  _folderViewActive: true,
  _currentViewFolderId: null, // null = raiz
  _editingFolderId: null,
  _movingSessionId: null,
  _sessionFolderId: '',

  // Firebase (carregado dinamicamente)
  firebaseConfig: null,
  firebaseSync: null,
  firebaseState: {
    connected: false,
    autoSync: false,
    pendingChanges: false,
    syncing: false,
    lastSyncTime: null,
    debounceTimer: null
  },

  state: {
    quizJson: null,
    questions: [],
    mappings: { qOrder: [], altOrder: {} },
    userAnswers: {},
    forcedIndices: [],
    eliminatedAlts: {},

    // NOVOS ESTADOS (modo retry)
    retryMode: false,
    retryIndices: [], // índices originais das questões erradas

    config: {
      shuffleQ: false,
      shuffleA: false,
      showTags: true,
      showDiff: false,
      showFilterSummary: true,
      showDisregardCorrect: true,
      applyDisregardedCorrect: true
    },
    filters: {
      tags: [],
      excludedTags: [],
      diffs: [],
      types: [...questionTypes],
      folders: [],
      allTags: [],
      allDiffs: [],
      allTypes: [...questionTypes],
      allFolders: [],
      counts: { tags: {}, diffs: {}, types: {}, folders: {} },
      folderDescriptions: {},
      step: 1
    }
  },

  elements: {
    // Upload / layout principal
    fileInput: document.getElementById('fileInput'),
    uploadSection: document.getElementById('uploadSection'),
    filterSection: document.getElementById('filterSection'),
    filterDescription: document.getElementById('filterDescription'),

    // Filtros UI
    filterStep1: document.getElementById('filterStep1'),
    filterStep2: document.getElementById('filterStep2'),
    folderTree: document.getElementById('folderTree'),
    tagList: document.getElementById('tagList'),
    excludedTagList: document.getElementById('excludedTagList'),
    diffList: document.getElementById('diffList'),
    typeList: document.getElementById('typeList'),
    btnToggleAllIncludedTags: document.getElementById('btnToggleAllIncludedTags'),
    btnToggleAllExcludedTags: document.getElementById('btnToggleAllExcludedTags'),
    btnExcludeNotIncludedTags: document.getElementById('btnExcludeNotIncludedTags'),

    btnGoToStep2: document.getElementById('btnGoToStep2'),
    btnBackToStep1: document.getElementById('btnBackToStep1'),
    btnGenerate: document.getElementById('btnGenerate'),
    btnDeleteFilter: document.getElementById('btnDeleteFilter'),

    // Barra de configs + footer
    configBar: document.getElementById('configBar'),
    footerBar: document.getElementById('footerBar'),

    chkShuffleQ: document.getElementById('chkShuffleQuestions'),
    chkShuffleA: document.getElementById('chkShuffleAlternatives'),
    chkShowTags: document.getElementById('chkShowTags'),
    chkShowDiff: document.getElementById('chkShowDiff'),
    chkShowFilterSummary: document.getElementById('chkShowFilterSummary'),

    btnResetQuiz: document.getElementById('btnResetQuiz'),
    btnChooseOther: document.getElementById('btnChooseOther'),
    btnSubmitAll: document.getElementById('btnSubmitAll'),
    btnDeleteQuiz: document.getElementById('btnDeleteQuiz'),

    // Export/Import
    btnExport: document.getElementById('btnExport'),
    btnImport: document.getElementById('btnImport'),
    btnImportStart: document.getElementById('btnImportStart'),
    importInput: document.getElementById('importInput'),

    // Nuvem
    btnCloudStart: document.getElementById('btnCloudStart'),
    btnCloudConfig: document.getElementById('btnCloudConfig'),
    cloudModal: document.getElementById('cloudModal'),
    closeCloud: document.querySelector('.close-cloud'),
    cloudTree: document.getElementById('cloudTree'),
    btnExpandAll: document.getElementById('btnExpandAll'),
    btnCollapseAll: document.getElementById('btnCollapseAll'),

    // Modal de zoom de imagem
    imgModal: document.getElementById('imgModal'),
    imgModalContent: document.getElementById('imgModalContent'),
    closeModalBtn: document.querySelector('.close-modal'),

    // Modal de info das pastas
    infoModal: document.getElementById('infoModal'),
    infoModalTitle: document.getElementById('infoModalTitle'),
    infoModalBody: document.getElementById('infoModalBody'),
    btnInfoOk: document.getElementById('btnInfoOk'),
    closeInfo: document.querySelector('.close-info'),

    // Firebase / Sync
    btnSyncConfig: document.getElementById('btnSyncConfig'),
    syncIndicator: document.getElementById('syncIndicator'),
    btnFirebaseSettings: document.getElementById('btnFirebaseSettings'),
    firebaseModal: document.getElementById('firebaseModal'),
    closeFirebase: document.querySelector('.close-firebase'),
    firebaseLogin: document.getElementById('firebaseLogin'),
    firebaseConnected: document.getElementById('firebaseConnected'),
    firebaseCode: document.getElementById('firebaseCode'),
    btnFirebaseConnect: document.getElementById('btnFirebaseConnect'),
    firebaseLoginError: document.getElementById('firebaseLoginError'),
    firebaseLastSync: document.getElementById('firebaseLastSync'),
    firebaseSyncStatusText: document.getElementById('firebaseSyncStatusText'),
    btnFirebaseSyncNow: document.getElementById('btnFirebaseSyncNow'),
    chkFirebaseAutoSync: document.getElementById('chkFirebaseAutoSync'),
    btnFirebaseDisconnect: document.getElementById('btnFirebaseDisconnect'),

    // Lista de sessões
    btnSessionListStart: document.getElementById('btnSessionListStart'),
    btnSessionListConfig: document.getElementById('btnSessionListConfig'),
    sessionListModal: document.getElementById('sessionListModal'),
    closeSessions: document.querySelector('.close-sessions'),
    sessionSortBy: document.getElementById('sessionSortBy'),
    sessionListContainer: document.getElementById('sessionListContainer'),
    btnExportAllSessions: document.getElementById('btnExportAllSessions'),
    btnImportAllSessions: document.getElementById('btnImportAllSessions'),
    importSessionsInput: document.getElementById('importSessionsInput'),

    // Configurações Visuais
    btnVisualSettings: document.getElementById('btnVisualSettings'),
    visualSettingsPanel: document.getElementById('visualSettingsPanel'),
    chkFooterFixed: document.getElementById('chkFooterFixed'),
    commentModeAll: document.getElementById('commentModeAll'),
    commentModeCurrent: document.getElementById('commentModeCurrent'),
    commentSubOptions: document.getElementById('commentSubOptions'),
    chkPersistManualOpen: document.getElementById('chkPersistManualOpen'),
    chkVfStacked: document.getElementById('chkVfStacked'),
    chkShowPartialScore: document.getElementById('chkShowPartialScore'),
    chkDarkMode: document.getElementById('chkDarkMode'),
    darkModeIcon: document.getElementById('darkModeIcon'),
    rangeFontSize: document.getElementById('rangeFontSize'),
    fontSizeValue: document.getElementById('fontSizeValue'),
    btnGeneralSettings: document.getElementById('btnGeneralSettings'),
    generalSettingsPanel: document.getElementById('generalSettingsPanel'),
    chkShowDisregardCorrect: document.getElementById('chkShowDisregardCorrect'),

    // Próxima não respondida
    btnNextUnanswered: document.getElementById('btnNextUnanswered'),

    // Editar sessão
    editSessionModal: document.getElementById('editSessionModal'),
    closeEditSession: document.querySelector('.close-edit-session'),
    editSessionTitle: document.getElementById('editSessionTitle'),
    editQuizTitle: document.getElementById('editQuizTitle'),
    editQuizDescription: document.getElementById('editQuizDescription'),
    btnEditSave: document.getElementById('btnEditSave'),
    btnEditCancel: document.getElementById('btnEditCancel'),

    // Pastas de sessões
    btnToggleFolderView: document.getElementById('btnToggleFolderView'),
    btnNewFolder: document.getElementById('btnNewFolder'),

    // Mover sessão
    moveSessionModal: document.getElementById('moveSessionModal'),
    closeMoveSession: document.querySelector('.close-move-session'),
    moveSessionInfo: document.getElementById('moveSessionInfo'),
    moveFolderSelect: document.getElementById('moveFolderSelect'),
    btnMoveConfirm: document.getElementById('btnMoveConfirm'),
    btnMoveCancel: document.getElementById('btnMoveCancel'),

    // Nome de pasta
    folderNameModal: document.getElementById('folderNameModal'),
    folderNameModalTitle: document.getElementById('folderNameModalTitle'),
    closeFolderName: document.querySelector('.close-folder-name'),
    folderNameInput: document.getElementById('folderNameInput'),
    folderParentField: document.getElementById('folderParentField'),
    folderParentSelect: document.getElementById('folderParentSelect'),
    folderDescInput: document.getElementById('folderDescInput'),
    btnFolderNameSave: document.getElementById('btnFolderNameSave'),
    btnFolderNameCancel: document.getElementById('btnFolderNameCancel')
  },

  renderer: null,
  _escritaTextSaveTimer: null,

  async init() {
    this.renderer = new QuizRenderer('quizContainer', 'footerBar', {
      onSelect: (qIdx, altIdx, isCheckbox, checked) =>
        this.handleSelection(qIdx, altIdx, isCheckbox, checked),
      onSubmit: (qIdx) => this.submitQuestion(qIdx),
      onEliminate: (qIdx, altIdx) => this.handleElimination(qIdx, altIdx),
      onRetry: () => this.retryIncorrect(),
      onToggleComments: (qIdx, isOpen) => this.handleToggleComments(qIdx, isOpen),
      onEscritaTextChange: (qIdx, text, itemIdx) =>
        this.handleEscritaTextChange(qIdx, text, itemIdx),
      onEscritaItemSubmit: (qIdx, itemIdx, text) =>
        this.handleEscritaItemSubmit(qIdx, itemIdx, text),
      onSelfEval: (qIdx, score, itemIdx) =>
        this.handleSelfEval(qIdx, score, itemIdx),
      onMarkWords: (qIdx, markKey, wordIndices) =>
        this.handleMarkWords(qIdx, markKey, wordIndices),
      onToggleDisregardCorrect: (qIdx, checked) =>
        this.handleToggleDisregardCorrect(qIdx, checked),
      onToggleApplyDisregardedCorrect: (checked) =>
        this.handleToggleApplyDisregardedCorrect(checked)
    });

    this.bindEvents();
    this.setupImageZoom();
    this.initVisualSettings();
    this.setupNextUnansweredButton();
    this.setupCommentShortcuts();
    this.initFolderSystem();

    // Migração do estado legado (v1 → v2)
    const migrated = await migrateLegacyState();
    if (migrated) {
      this.activeSessionId = migrated.sessionId;
      localStorage.setItem('activeSessionId', migrated.sessionId);
    }

    // Tentar restaurar sessão ativa
    const savedSessionId = this.activeSessionId || localStorage.getItem('activeSessionId');
    if (savedSessionId) {
      const session = await loadSession(savedSessionId);
      if (session && session.state && session.state.quizJson) {
        this.activeSessionId = session.sessionId;
        this._sessionCreatedAt = session.createdAt;
        this._lastAccessedAt = session.lastAccessedAt || session.createdAt;
        this._sessionTitle = session.title;
        this._sourceFileName = session.sourceFileName || null;
        this._sessionFolderId = session.folderId || '';
        this._sessionDerivedFromErrors = !!(session.derivedFromErrors || session.state.retryDerivedFromErrors);
        this.state = session.state;
        this.ensureStateIntegrity();
        this.restoreUI();

        if (this.state.mappings.qOrder && this.state.mappings.qOrder.length > 0) {
          if (this.state.retryMode) {
            this.generateMappings();
          }
          this.showQuizInterface();
          this.renderer.render(this.state);
          this.applyCommentCollapseMode();
        } else {
          this.renderFilterDescription();
          if (this.state.filters.step === 2) {
            this.prepareStep1();
            this.prepareStep2();
          } else {
            this.prepareStep1();
          }
          this.elements.uploadSection.classList.add('hidden');
          this.elements.filterSection.classList.remove('hidden');
        }
        // Salva sem atualizar lastAccessedAt (apenas abriu)
        this.save();

        // Carregar Firebase (opcional, não bloqueia o app)
        this.initFirebaseAsync();
        return;
      }
    }

    // Fallback: sem sessão ativa, tenta estado legado
    const saved = await loadState();
    if (saved && saved.quizJson) {
      this.state = saved;
      this.ensureStateIntegrity();
      this.restoreUI();

      if (this.state.mappings.qOrder && this.state.mappings.qOrder.length > 0) {
        if (this.state.retryMode) {
          this.generateMappings();
        }
        this.showQuizInterface();
        this.renderer.render(this.state);
      } else {
        this.renderFilterDescription();
        if (this.state.filters.step === 2) {
          this.prepareStep1();
          this.prepareStep2();
        } else {
          this.prepareStep1();
        }
        this.elements.uploadSection.classList.add('hidden');
        this.elements.filterSection.classList.remove('hidden');
      }
    }

    // Carregar Firebase (opcional, não bloqueia o app)
    this.initFirebaseAsync();
  },

  async initFirebaseAsync() {
    try {
      this.firebaseConfig = await import('./firebase-config.js?v=20260704-1');
      this.firebaseSync = await import('./firebase-sync.js?v=20260704-1');

      this.firebaseState.autoSync = localStorage.getItem('firebaseAutoSync') === 'true';
      this.firebaseState.lastSyncTime = localStorage.getItem('lastSyncTime') || null;
      this.elements.chkFirebaseAutoSync.checked = this.firebaseState.autoSync;

      this.firebaseConfig.onAuthChange((user) => {
        this.firebaseState.connected = !!user;
        this.updateFirebaseUI();
        if (user && this.firebaseState.autoSync) {
          this.syncNow();
        }
      });
    } catch (e) {
      console.warn('Firebase não disponível:', e);
      this.firebaseConfig = null;
      this.firebaseSync = null;
    }
  },

  bindEvents() {
    // Upload local
    this.elements.fileInput.addEventListener('change', (e) =>
      this.handleFileUpload(e)
    );

    // Botões principais
    this.elements.btnResetQuiz.addEventListener('click', () =>
      this.resetQuiz()
    );
    this.elements.btnChooseOther.addEventListener('click', () =>
      this.chooseOther()
    );
    this.elements.btnSubmitAll.addEventListener('click', () =>
      this.submitAll()
    );
    this.elements.btnDeleteQuiz.addEventListener('click', () =>
      this.deleteCurrentQuiz()
    );
    if (this.elements.btnDeleteFilter) {
      this.elements.btnDeleteFilter.addEventListener('click', () =>
        this.deleteCurrentQuiz()
      );
    }

    // Export/Import
    this.elements.btnExport.addEventListener('click', () => this.exportBackup());
    this.elements.btnImport.addEventListener('click', () => this.elements.importInput.click());
    this.elements.btnImportStart.addEventListener('click', () => this.elements.importInput.click());
    this.elements.importInput.addEventListener('change', (e) => this.handleImport(e));

    // Filtro em etapas
    this.elements.btnGoToStep2.addEventListener('click', () => {
      this.state.filters.step = 2;
      this.prepareStep2();
      this.save();
    });

    this.elements.btnBackToStep1.addEventListener('click', () => {
      this.state.filters.step = 1;
      this.showStep1();
      this.save();
    });

    this.elements.btnToggleAllIncludedTags.addEventListener('click', () =>
      this.toggleAllIncludedTags()
    );
    this.elements.btnToggleAllExcludedTags.addEventListener('click', () =>
      this.toggleAllExcludedTags()
    );
    this.elements.btnExcludeNotIncludedTags.addEventListener('click', () =>
      this.excludeAllTagsNotIncluded()
    );

    // IMPORTANTE: ao gerar pelo filtro, sai do modo retry
    this.elements.btnGenerate.addEventListener('click', () => {
      this.state.retryMode = false;
      this.generateAndRender();
    });

    // Info Modal
    this.elements.closeInfo.addEventListener('click', () =>
      this.elements.infoModal.classList.add('hidden')
    );
    this.elements.btnInfoOk.addEventListener('click', () =>
      this.elements.infoModal.classList.add('hidden')
    );
    this.elements.infoModal.addEventListener('click', (e) => {
      if (e.target === this.elements.infoModal) {
        this.elements.infoModal.classList.add('hidden');
      }
    });

    // Nuvem
    this.elements.btnCloudStart.addEventListener('click', () =>
      this.openCloudModal()
    );
    this.elements.btnCloudConfig.addEventListener('click', () =>
      this.openCloudModal()
    );
    this.elements.closeCloud.addEventListener('click', () =>
      this.elements.cloudModal.classList.add('hidden')
    );
    this.elements.btnExpandAll.addEventListener('click', () =>
      this.toggleTree(true)
    );
    this.elements.btnCollapseAll.addEventListener('click', () =>
      this.toggleTree(false)
    );

    // Lista de sessões
    this.elements.btnSessionListStart.addEventListener('click', () =>
      this.openSessionListModal()
    );
    this.elements.btnSessionListConfig.addEventListener('click', () =>
      this.openSessionListModal()
    );
    this.elements.closeSessions.addEventListener('click', () =>
      this.elements.sessionListModal.classList.add('hidden')
    );
    this.elements.sessionListModal.addEventListener('click', (e) => {
      if (e.target === this.elements.sessionListModal) {
        this.elements.sessionListModal.classList.add('hidden');
      }
    });
    this.elements.sessionSortBy.addEventListener('change', () =>
      this.renderSessionList()
    );
    this.elements.btnExportAllSessions.addEventListener('click', () =>
      this.exportSessionList()
    );
    this.elements.btnImportAllSessions.addEventListener('click', () =>
      this.elements.importSessionsInput.click()
    );
    this.elements.importSessionsInput.addEventListener('change', (e) =>
      this.handleImportSessionList(e)
    );

    // Firebase / Sync
    this.elements.btnSyncConfig.addEventListener('click', () => {
      if (this.firebaseState.connected) {
        this.syncNow();
      } else {
        this.openFirebaseModal();
      }
    });
    this.elements.btnFirebaseSettings.addEventListener('click', () =>
      this.openFirebaseModal()
    );
    this.elements.closeFirebase.addEventListener('click', () =>
      this.elements.firebaseModal.classList.add('hidden')
    );
    this.elements.firebaseModal.addEventListener('click', (e) => {
      if (e.target === this.elements.firebaseModal) {
        this.elements.firebaseModal.classList.add('hidden');
      }
    });
    this.elements.btnFirebaseConnect.addEventListener('click', () =>
      this.handleFirebaseLogin()
    );
    this.elements.firebaseCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleFirebaseLogin();
    });
    this.elements.btnFirebaseSyncNow.addEventListener('click', () =>
      this.syncNow()
    );
    this.elements.chkFirebaseAutoSync.addEventListener('change', (e) => {
      this.firebaseState.autoSync = e.target.checked;
      localStorage.setItem('firebaseAutoSync', e.target.checked ? 'true' : 'false');
    });
    this.elements.btnFirebaseDisconnect.addEventListener('click', () =>
      this.handleFirebaseLogout()
    );

    // Configurações
    this.elements.chkShuffleQ.addEventListener('change', (e) => {
      this.state.config.shuffleQ = e.target.checked;
      if (this.state.mappings.qOrder.length > 0) this.generateAndRender();
    });

    this.elements.chkShuffleA.addEventListener('change', (e) => {
      this.state.config.shuffleA = e.target.checked;
      if (this.state.mappings.qOrder.length > 0) this.generateAndRender();
    });

    this.elements.chkShowTags.addEventListener('change', (e) => {
      this.state.config.showTags = e.target.checked;
      this.renderer.render(this.state);
      this.save();
    });

    this.elements.chkShowDiff.addEventListener('change', (e) => {
      this.state.config.showDiff = e.target.checked;
      this.renderer.render(this.state);
      this.save();
    });

    this.elements.chkShowFilterSummary.addEventListener('change', (e) => {
      this.state.config.showFilterSummary = e.target.checked;
      this.renderer.render(this.state);
      this.save();
    });

    if (this.elements.chkShowDisregardCorrect) {
      this.elements.chkShowDisregardCorrect.addEventListener('change', (e) => {
        localStorage.setItem('gs_showDisregardCorrect', e.target.checked ? 'true' : 'false');
        this.state.config.showDisregardCorrect = e.target.checked;
        this.state.config.applyDisregardedCorrect = e.target.checked;
        this.renderer.render(this.state);
        this.applyCommentCollapseMode();
        this.save();
      });
    }
  },

  ensureStateIntegrity() {
    if (!this.state.filters) {
      this.state.filters = {
        tags: [],
        excludedTags: [],
        diffs: [],
        types: [...questionTypes],
        folders: [],
        allTags: [],
        allDiffs: [],
        allTypes: [...questionTypes],
        allFolders: [],
        counts: { tags: {}, diffs: {}, types: {}, folders: {} },
        folderDescriptions: {},
        step: 1
      };
    }

    if (!Array.isArray(this.state.filters.tags)) this.state.filters.tags = [];
    if (!Array.isArray(this.state.filters.excludedTags)) {
      this.state.filters.excludedTags = [];
    }
    const excludedTagSet = new Set(this.state.filters.excludedTags);
    this.state.filters.tags = this.state.filters.tags.filter(
      (tag) => !excludedTagSet.has(tag)
    );
    if (!Array.isArray(this.state.filters.diffs)) this.state.filters.diffs = [];
    if (!Array.isArray(this.state.filters.types)) {
      this.state.filters.types = [...questionTypes];
    }
    this.state.filters.types = this.state.filters.types.filter((type) =>
      questionTypes.includes(type)
    );
    this.state.filters.allTypes = [...questionTypes];

    if (!this.state.filters.counts) this.state.filters.counts = {};
    if (!this.state.filters.counts.tags) this.state.filters.counts.tags = {};
    if (!this.state.filters.counts.diffs) this.state.filters.counts.diffs = {};
    if (!this.state.filters.counts.types) this.state.filters.counts.types = {};
    if (!this.state.filters.counts.folders) this.state.filters.counts.folders = {};

    if (!this.state.filters.folderDescriptions) {
      this.state.filters.folderDescriptions = {};
    }

    if (!this.state.forcedIndices) this.state.forcedIndices = [];
    if (!this.state.eliminatedAlts) this.state.eliminatedAlts = {};

    if (typeof this.state.retryMode !== 'boolean') this.state.retryMode = false;
    if (!Array.isArray(this.state.retryIndices)) this.state.retryIndices = [];

    if (this.state.config.showTags === undefined) this.state.config.showTags = true;
    if (this.state.config.showDiff === undefined) this.state.config.showDiff = false;
    if (this.state.config.showFilterSummary === undefined) {
      this.state.config.showFilterSummary = true;
    }
    if (this.state.config.showDisregardCorrect === undefined) {
      this.state.config.showDisregardCorrect =
        localStorage.getItem('gs_showDisregardCorrect') !== 'false';
    }
    if (this.state.config.applyDisregardedCorrect === undefined) {
      this.state.config.applyDisregardedCorrect = this.state.config.showDisregardCorrect !== false;
    }
  },

  // === UPLOAD LOCAL (que você tinha apagado) ===
  handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        this.loadQuizJSON(json, fileName);
      } catch (err) {
        alert('Erro no JSON: ' + err.message);
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  },

  loadQuizJSON(json, sourceFileName = null) {
    this.state.quizJson = json;
    this.state.config.shuffleQ = this.elements.chkShuffleQ.checked;
    this.state.config.shuffleA = this.elements.chkShuffleA.checked;
    this.state.config.showTags = this.elements.chkShowTags.checked;
    this.state.config.showDiff = this.elements.chkShowDiff.checked;
    this.state.config.showFilterSummary = this.elements.chkShowFilterSummary.checked;
    this.state.config.showDisregardCorrect =
      localStorage.getItem('gs_showDisregardCorrect') !== 'false';
    this.state.config.applyDisregardedCorrect = this.state.config.showDisregardCorrect !== false;

    this.state.filters = {
      tags: [],
      excludedTags: [],
      diffs: [],
      types: [...questionTypes],
      folders: [],
      allTags: [],
      allDiffs: [],
      allTypes: [...questionTypes],
      allFolders: [],
      counts: { tags: {}, diffs: {}, types: {}, folders: {} },
      folderDescriptions: {},
      step: 1
    };
    this.state.forcedIndices = [];
    this.state.eliminatedAlts = {};
    this.state.mappings = { qOrder: [], altOrder: {} };

    // Reset Retry
    this.state.retryMode = false;
    this.state.retryIndices = [];
    this.state.retryDerivedFromErrors = false;
    this._sessionDerivedFromErrors = false;

    this.state.questions = parseContent(this.state.quizJson.conteudo);
    this.state.userAnswers = {};

    // Criar nova sessão
    this.activeSessionId = generateId();
    this._sessionTitle = (json.titulo) || 'Quiz sem título';
    this._sourceFileName = sourceFileName;
    const now = new Date().toISOString();
    this._sessionCreatedAt = now;
    this._lastAccessedAt = now;
    this._sessionDerivedFromErrors = false;
    this._manuallyOpenedComments = new Set();
    localStorage.setItem('activeSessionId', this.activeSessionId);

    this.extractFiltersData();
    this.renderFilterDescription();
    this.prepareStep1();

    this.elements.uploadSection.classList.add('hidden');
    this.elements.filterSection.classList.remove('hidden');
    this.elements.configBar.classList.add('hidden');
    this.elements.footerBar.classList.add('hidden');
    this.renderer.container.innerHTML = '';

    this.save();
  },

  // --- Lógica de checagem de acerto e pontuação (ME / VF / CH / ESCRITA) ---
  isObjectiveQuestion(originalQIdx) {
    const qData = this.state.questions[originalQIdx];
    return ((qData && qData.tipo) || '').toUpperCase() !== 'ESCRITA';
  },

  applyDisregardedCorrectToScore(originalQIdx, score, options = {}) {
    if (options.ignoreDisregard) return score;
    const ans = this.state.userAnswers[originalQIdx];
    const featureOn = this.state.config.showDisregardCorrect !== false;
    const applyOn = this.state.config.applyDisregardedCorrect !== false;
    if (
      featureOn &&
      applyOn &&
      ans &&
      ans.disregardCorrect &&
      this.isObjectiveQuestion(originalQIdx) &&
      score.total > 0 &&
      score.hits > 0
    ) {
      return { hits: 0, total: score.total };
    }
    return score;
  },

  isDisregardedCorrectForRetry(originalQIdx) {
    const ans = this.state.userAnswers[originalQIdx];
    if (!ans || !ans.disregardCorrect || !this.isObjectiveQuestion(originalQIdx)) return false;
    const raw = this.computeQuestionScore(originalQIdx, { ignoreDisregard: true });
    return raw.total > 0 && raw.hits > 0;
  },

  /**
   * Retorna { hits, total } para a questão originalQIdx.
   * - ME / VF: total = 1, hits = 1 ou 0
   * - ME-CH: total = 1, hits = pontuação proporcional entre 0 e 1
   * - CH: total = número de assertivas, hits = quantas julgadas corretamente
   * - ESCRITA simples: total = 10, hits = selfEval (0–10)
   * - ESCRITA itens: total = numItens × 10, hits = soma dos selfEvals
   */
  computeQuestionScore(originalQIdx, options = {}) {
    const qData = this.state.questions[originalQIdx];
    const ans = this.state.userAnswers[originalQIdx];
    if (!ans || !ans.submitted) return { hits: 0, total: 0 };

    const tipo = (qData.tipo || '').toUpperCase();

    if (tipo === 'ESCRITA') {
      const isItemsType = qData.subtipo === 'itens' ||
        (Array.isArray(qData.itens) && qData.itens.length > 0);

      if (!isItemsType) {
        const selfEval = typeof ans.selfEval === 'number' ? ans.selfEval : 0;
        return { hits: selfEval, total: 10 };
      } else {
        const numItems = (qData.itens || []).length;
        if (numItems === 0) return { hits: 0, total: 0 };
        const items = Array.isArray(ans.items) ? ans.items : [];
        let sumEvals = 0;
        for (let i = 0; i < numItems; i++) {
          const item = items[i] || {};
          sumEvals += typeof item.selfEval === 'number' ? item.selfEval : 0;
        }
        return { hits: sumEvals, total: numItems * 10 };
      }
    }

    if (tipo === 'CH') {
      const assertivas = Array.isArray(qData.assertivas) ? qData.assertivas : [];
      const total = assertivas.length;
      if (total === 0) return { hits: 0, total: 0 };

      const answers = ans.assertivaAnswers || {};

      let hits = 0;
      assertivas.forEach((ass, idx) => {
        const isCorrect = !!ass.is_correct;
        const userSaidTrue = answers[idx];
        if (userSaidTrue !== undefined && userSaidTrue === isCorrect) hits++;
      });

      return this.applyDisregardedCorrectToScore(originalQIdx, { hits, total }, options);
    }

    if (tipo === 'ME-CH') {
      const score = computeMeChScore(qData, ans.selectedOriginalIndices || []);
      return this.applyDisregardedCorrectToScore(originalQIdx, { hits: score, total: 1 }, options);
    }

    // ME / VF – um único gabarito por letra
    const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
    if (!gabaritoLetra) return { hits: 0, total: 0 };
    const gabaritoIdx = gabaritoLetra.charCodeAt(0) - 65;
    const isCorrect = ans.selectedOriginalIdx === gabaritoIdx;
    return this.applyDisregardedCorrectToScore(
      originalQIdx,
      { hits: isCorrect ? 1 : 0, total: 1 },
      options
    );
  },

// --- NOVA LÓGICA DE RETRY ---
  retryIncorrect() {
    const wrongIndices = [];

    this.state.mappings.qOrder.forEach((idx) => {
      if (this.state.forcedIndices.includes(idx)) return;

      const ans = this.state.userAnswers[idx];
      const { hits, total } = this.computeQuestionScore(idx);

      // Considera "errada" para retry se não tiver pontuação máxima
      if (!ans || !ans.submitted || total === 0 || hits < total || this.isDisregardedCorrectForRetry(idx)) {
        wrongIndices.push(idx);
      }
    });

    if (wrongIndices.length === 0) {
      alert('Parabéns! Você acertou tudo, não há o que repetir.');
      return;
    }

    if (
      !confirm(
        `Deseja iniciar um novo quiz com as ${wrongIndices.length} questões que você errou?`
      )
    )
      return;

    this.save(false);

    const sourceSessionId = this.activeSessionId || null;
    const sourceState = JSON.parse(JSON.stringify(this.state));
    const now = new Date().toISOString();
    this.activeSessionId = generateId();
    localStorage.setItem('activeSessionId', this.activeSessionId);
    this._sessionCreatedAt = now;
    this._lastAccessedAt = now;
    this._sessionDerivedFromErrors = true;

    this.state = sourceState;
    this.state.retryMode = true;
    this.state.retryIndices = wrongIndices;
    this.state.retryDerivedFromErrors = true;
    this.state.retrySourceSessionId = sourceSessionId;
    this.state.userAnswers = {};
    this.state.eliminatedAlts = {};
    this.state.mappings = { qOrder: [], altOrder: {} };
    this.state.sessionQuestionCount = wrongIndices.length;

    this.generateAndRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // --- GERADOR DE MAPAS (com suporte a retryMode, VF, CH/no_random) ---
  generateMappings() {
    let strictPassIndices = new Set();
    const activeGroupIds = new Set();

    if (this.state.retryMode) {
      // No modo retry, só as questões salvas em retryIndices entram como "estritas"
      this.state.retryIndices.forEach((idx) => {
        strictPassIndices.add(idx);
        const q = this.state.questions[idx];
        if (q._groupData) {
          activeGroupIds.add(q._groupData.id);
        }
      });
    } else {
      // Modo normal: aplica filtros de pasta, tags, dificuldade e tipo.
      const includedTags = new Set(this.state.filters.tags);
      const excludedTags = new Set(this.state.filters.excludedTags || []);
      const selDiffs = new Set(this.state.filters.diffs);
      const selTypes = new Set(this.state.filters.types || questionTypes);
      const selFolders = new Set(this.state.filters.folders);

      this.state.questions.forEach((q, idx) => {
        const qPathStr = q._path.join(' > ');
        if (!selFolders.has(qPathStr)) return;

        const qTags = q.tags && q.tags.length > 0 ? q.tags : ['__NO_TAG__'];
        const hasIncludedTag = qTags.some((tag) => includedTags.has(tag));
        const hasExcludedTag = qTags.some((tag) => excludedTags.has(tag));

        let hasDiff = false;
        const qDiff =
          q.dificuldade !== undefined && q.dificuldade !== null
            ? q.dificuldade
            : '__NO_DIFF__';
        hasDiff = selDiffs.has(qDiff);

        const type = (q.tipo || '').toUpperCase();
        const hasType = selTypes.has(type);

        if (hasIncludedTag && !hasExcludedTag && hasDiff && hasType) {
          strictPassIndices.add(idx);
          if (q._groupData) {
            activeGroupIds.add(q._groupData.id);
          }
        }
      });
    }

    let finalIndices = [];
    this.state.forcedIndices = [];
    let processedIndices = new Set();
    const selectedFolders = new Set(this.state.filters.folders);

    this.state.questions.forEach((q, idx) => {
      if (processedIndices.has(idx)) return;

      // No modo normal, respeita filtro de pasta aqui também
      if (!this.state.retryMode) {
        const qPathStr = q._path.join(' > ');
        if (!selectedFolders.has(qPathStr)) return;
      }

      if (q._groupData) {
        const groupId = q._groupData.id;
        if (activeGroupIds.has(groupId)) {
          const groupIndices = [];

          this.state.questions.forEach((innerQ, innerIdx) => {
            if (innerQ._groupData && innerQ._groupData.id === groupId) {
              let allowedByFolder = true;
              if (!this.state.retryMode) {
                allowedByFolder = selectedFolders.has(innerQ._path.join(' > '));
              }

              if (allowedByFolder) {
                groupIndices.push(innerIdx);
                processedIndices.add(innerIdx);

                // Se não está na lista estrita, é questão "forçada" (contexto)
                if (!strictPassIndices.has(innerIdx)) {
                  this.state.forcedIndices.push(innerIdx);
                }
              }
            }
          });

          if (groupIndices.length > 0) {
            finalIndices.push(groupIndices);
          }
        }
      } else {
        if (strictPassIndices.has(idx)) {
          finalIndices.push([idx]);
          processedIndices.add(idx);
        }
      }
    });

    if (this.state.config.shuffleQ) {
      finalIndices = shuffleArray(finalIndices);
    }

    this.state.mappings.qOrder = finalIndices.flat();
    this.state.mappings.altOrder = {};

    this.state.questions.forEach((q, originalIdx) => {
      const tipo = (q.tipo || '').toUpperCase();

      // Para ME/VF usamos alternativas; para CH usamos assertivas
      let totalAlt = 0;
      if (tipo === 'CH') {
        totalAlt = Array.isArray(q.assertivas) ? q.assertivas.length : 0;
      } else {
        totalAlt = Array.isArray(q.alternativas) ? q.alternativas.length : 0;
      }

      let altIndices = Array.from({ length: totalAlt }, (_, i) => i);

      const isVF = tipo === 'VF';
      const isCH = tipo === 'CH';
      const noRandom = isCH && q.no_random === true;

      if (this.state.config.shuffleA) {
        // VF nunca embaralha alternativas
        if (isVF) {
          // mantém ordem
        }
        // CH com no_random:true também não embaralha
        else if (isCH && noRandom) {
          // mantém ordem
        } else {
          altIndices = shuffleArray(altIndices);
        }
      }

      this.state.mappings.altOrder[originalIdx] = altIndices;
    });
  },

  async deleteCurrentQuiz() {
    if (
      !confirm(
        'Tem certeza? Isso apagará o quiz atual e voltará para a tela inicial.'
      )
    )
      return;

    // Deletar sessão do IndexedDB
    if (this.activeSessionId) {
      const deletedId = this.activeSessionId;
      await deleteSession(deletedId);
      await this._markSessionDeleted(deletedId);
    }
    this.activeSessionId = null;
    localStorage.removeItem('activeSessionId');

    this.state.quizJson = null;
    this.state.questions = [];
    this.state.mappings = { qOrder: [], altOrder: {} };
    this.state.userAnswers = {};
    this.state.filters = {
      tags: [],
      excludedTags: [],
      diffs: [],
      types: [...questionTypes],
      folders: [],
      allTags: [],
      allDiffs: [],
      allTypes: [...questionTypes],
      allFolders: [],
      counts: { tags: {}, diffs: {}, types: {}, folders: {} },
      folderDescriptions: {},
      step: 1
    };

    // Reset Retry
    this.state.retryMode = false;
    this.state.retryIndices = [];

    clearState();
    this.renderer.container.innerHTML = '';
    this.elements.configBar.classList.add('hidden');
    this.elements.footerBar.classList.add('hidden');
    this.elements.filterSection.classList.add('hidden');
    this.elements.uploadSection.classList.remove('hidden');
    this.elements.fileInput.value = '';
  },

  renderFilterDescription() {
    if (!this.state.quizJson) return;
    const desc = this.state.quizJson.descricao || '';
    const el = this.elements.filterDescription;
    if (desc.trim()) {
      el.innerHTML = `<strong>Sobre este Quiz:</strong><br>${desc.replace(
        /\n/g,
        '<br>'
      )}`;
      el.style.display = 'block';
    } else {
      el.innerHTML = '';
      el.style.display = 'none';
    }
  },

  setupImageZoom() {
    const quizContainer = document.getElementById('quizContainer');
    const modal = this.elements.imgModal;
    const modalImg = this.elements.imgModalContent;
    const closeBtn = this.elements.closeModalBtn;

    quizContainer.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') {
        modal.style.display = 'flex';
        modalImg.src = e.target.src;
      }
    });

    closeBtn.addEventListener('click', () => (modal.style.display = 'none'));

    modal.addEventListener('click', (e) => {
      if (e.target !== modalImg) modal.style.display = 'none';
    });
  },

  resetQuiz() {
    if (!confirm('Deseja reiniciar este quiz? Suas respostas serão apagadas.'))
      return;

    this.state.userAnswers = {};
    this.state.eliminatedAlts = {};
    reshuffleVariants(this.state.questions);
    reshuffleChVariants(this.state.questions);
    this.generateMappings();
    this.renderer.render(this.state);
    this.save();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  chooseOther() {
    if (
      !confirm(
        'Deseja carregar outro arquivo? O progresso atual ficará salvo na lista de sessões.'
      )
    )
      return;
    this.elements.fileInput.click();
  },

  extractFiltersData() {
    if (!this.state.filters) {
      this.state.filters = {
        tags: [],
        excludedTags: [],
        diffs: [],
        types: [...questionTypes],
        folders: [],
        allTags: [],
        allDiffs: [],
        allTypes: [...questionTypes],
        allFolders: [],
        counts: { tags: {}, diffs: {}, types: {}, folders: {} },
        folderDescriptions: {},
        step: 1
      };
    }

    this.state.filters.counts = { tags: {}, diffs: {}, types: {}, folders: {} };

    const tagsSet = new Set();
    const diffsSet = new Set();

    this.state.questions.forEach((q) => {
      // tags
      if (q.tags && q.tags.length > 0) {
        q.tags.forEach((t) => {
          tagsSet.add(t);
          this.state.filters.counts.tags[t] =
            (this.state.filters.counts.tags[t] || 0) + 1;
        });
      } else {
        const noTagLabel = '__NO_TAG__';
        tagsSet.add(noTagLabel);
        this.state.filters.counts.tags[noTagLabel] =
          (this.state.filters.counts.tags[noTagLabel] || 0) + 1;
      }

      // diffs
      if (q.dificuldade !== undefined && q.dificuldade !== null) {
        const d = q.dificuldade;
        diffsSet.add(d);
        this.state.filters.counts.diffs[d] =
          (this.state.filters.counts.diffs[d] || 0) + 1;
      } else {
        const noDiffLabel = '__NO_DIFF__';
        diffsSet.add(noDiffLabel);
        this.state.filters.counts.diffs[noDiffLabel] =
          (this.state.filters.counts.diffs[noDiffLabel] || 0) + 1;
      }

      const type = (q.tipo || '').toUpperCase();
      if (questionTypes.includes(type)) {
        this.state.filters.counts.types[type] =
          (this.state.filters.counts.types[type] || 0) + 1;
      }
    });

    this.state.filters.allTags = Array.from(tagsSet).sort();
    this.state.filters.allDiffs = Array.from(diffsSet).sort();
    this.state.filters.allTypes = [...questionTypes];

    if (!this.state.filters.tags || this.state.filters.tags.length === 0) {
      this.state.filters.tags = [...this.state.filters.allTags];
    }
    if (!Array.isArray(this.state.filters.excludedTags)) {
      this.state.filters.excludedTags = [];
    }
    if (!this.state.filters.diffs || this.state.filters.diffs.length === 0) {
      this.state.filters.diffs = [...this.state.filters.allDiffs];
    }
    if (!Array.isArray(this.state.filters.types)) {
      this.state.filters.types = [...this.state.filters.allTypes];
    }
  },

  renderFilterUI() {
    const createCheckbox = (
      value,
      labelBase,
      container,
      selectedList,
      countDict,
      onChange = null
    ) => {
      const item = document.createElement('label');
      item.className = 'filter-item';

      const count = countDict[value] || 0;
      const labelText = `${labelBase} (${count})`;

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = value;
      chk.checked = selectedList.includes(value);

      chk.addEventListener('change', () => {
        if (onChange) {
          onChange(chk.checked);
        } else {
          if (chk.checked) {
            if (!selectedList.includes(value)) selectedList.push(value);
          } else {
            const idx = selectedList.indexOf(value);
            if (idx > -1) selectedList.splice(idx, 1);
          }
          this.updateGenerateButton();
          this.save();
        }
      });

      item.appendChild(chk);
      item.appendChild(document.createTextNode(labelText));
      container.appendChild(item);
    };

    this.elements.tagList.innerHTML = '';
    this.state.filters.allTags.forEach((tag) => {
      const label = tag === '__NO_TAG__' ? 'Sem tag' : tag;
      createCheckbox(
        tag,
        label,
        this.elements.tagList,
        this.state.filters.tags,
        this.state.filters.counts.tags,
        (checked) => {
          this.setTagFilterValue('tags', tag, checked);
          if (checked) this.setTagFilterValue('excludedTags', tag, false);
          this.renderFilterUI();
          this.save();
        }
      );
    });

    this.elements.excludedTagList.innerHTML = '';
    this.state.filters.allTags.forEach((tag) => {
      const label = tag === '__NO_TAG__' ? 'Sem tag' : tag;
      createCheckbox(
        tag,
        label,
        this.elements.excludedTagList,
        this.state.filters.excludedTags,
        this.state.filters.counts.tags,
        (checked) => {
          this.setTagFilterValue('excludedTags', tag, checked);
          if (checked) this.setTagFilterValue('tags', tag, false);
          this.renderFilterUI();
          this.save();
        }
      );
    });

    this.elements.diffList.innerHTML = '';
    this.state.filters.allDiffs.forEach((diff) => {
      const label =
        diff === '__NO_DIFF__'
          ? 'Sem dificuldade'
          : difficultyMap[diff] || `Nível ${diff}`;
      createCheckbox(
        diff,
        label,
        this.elements.diffList,
        this.state.filters.diffs,
        this.state.filters.counts.diffs
      );
    });

    this.elements.typeList.innerHTML = '';
    this.state.filters.allTypes.forEach((type) => {
      createCheckbox(
        type,
        questionTypeMap[type] || type,
        this.elements.typeList,
        this.state.filters.types,
        this.state.filters.counts.types
      );
    });

    const allIncluded =
      this.state.filters.allTags.length > 0 &&
      this.state.filters.allTags.every((tag) => this.state.filters.tags.includes(tag));
    const allExcluded =
      this.state.filters.allTags.length > 0 &&
      this.state.filters.allTags.every((tag) =>
        this.state.filters.excludedTags.includes(tag)
      );
    this.elements.btnToggleAllIncludedTags.textContent = allIncluded
      ? 'Desselecionar todas'
      : 'Selecionar todas';
    this.elements.btnToggleAllExcludedTags.textContent = allExcluded
      ? 'Desselecionar todas'
      : 'Selecionar todas';
    const noTags = this.state.filters.allTags.length === 0;
    this.elements.btnToggleAllIncludedTags.disabled = noTags;
    this.elements.btnToggleAllExcludedTags.disabled = noTags;
    this.elements.btnExcludeNotIncludedTags.disabled = noTags;

    this.updateGenerateButton();
  },

  setTagFilterValue(filterKey, tag, selected) {
    const list = this.state.filters[filterKey];
    const index = list.indexOf(tag);
    if (selected && index === -1) list.push(tag);
    if (!selected && index !== -1) list.splice(index, 1);
  },

  toggleAllIncludedTags() {
    const allTags = this.state.filters.allTags;
    const allSelected =
      allTags.length > 0 && allTags.every((tag) => this.state.filters.tags.includes(tag));
    this.state.filters.tags = allSelected ? [] : [...allTags];
    if (!allSelected) this.state.filters.excludedTags = [];
    this.renderFilterUI();
    this.save();
  },

  toggleAllExcludedTags() {
    const allTags = this.state.filters.allTags;
    const allSelected =
      allTags.length > 0 &&
      allTags.every((tag) => this.state.filters.excludedTags.includes(tag));
    this.state.filters.excludedTags = allSelected ? [] : [...allTags];
    if (!allSelected) this.state.filters.tags = [];
    this.renderFilterUI();
    this.save();
  },

  excludeAllTagsNotIncluded() {
    const included = new Set(this.state.filters.tags);
    this.state.filters.excludedTags = this.state.filters.allTags.filter(
      (tag) => !included.has(tag)
    );
    this.renderFilterUI();
    this.save();
  },

  updateGenerateButton() {
    if (!this.state.filters || !this.state.filters.allTags) return;

    const allTagsSel =
      this.state.filters.tags.length === this.state.filters.allTags.length;
    const allDiffsSel =
      this.state.filters.diffs.length === this.state.filters.allDiffs.length;
    const allTypesSel =
      this.state.filters.types.length === this.state.filters.allTypes.length;

    this.elements.btnGenerate.textContent =
      !allTagsSel ||
      this.state.filters.excludedTags.length > 0 ||
      !allDiffsSel ||
      !allTypesSel
        ? 'Gerar quiz filtrado'
        : 'Gerar quiz';
  },

  generateAndRender() {
    this.generateMappings();
    this.showQuizInterface();
    this.renderer.render(this.state);
    this.applyCommentCollapseMode();
    this.save();
  },

  showQuizInterface() {
    this.elements.uploadSection.classList.add('hidden');
    this.elements.filterSection.classList.add('hidden');
    this.elements.configBar.classList.remove('hidden');
    this.elements.footerBar.classList.remove('hidden');
    this.applyFooterMode(this.getVisualSettings().footerFixed);
  },

  handleSelection(originalQIdx, originalAltIdx, isCheckbox = false, checked = true) {
    if (this.state.forcedIndices.includes(originalQIdx)) return;

    const qData = this.state.questions[originalQIdx];
    const tipo = (qData.tipo || '').toUpperCase();

    if (!this.state.userAnswers[originalQIdx]) {
      this.state.userAnswers[originalQIdx] = {};
    }
    const ans = this.state.userAnswers[originalQIdx];
    if (ans.submitted) return;

    if (tipo === 'CH' && isCheckbox) {
      if (!ans.assertivaAnswers) {
        ans.assertivaAnswers = {};
      }
      ans.assertivaAnswers[originalAltIdx] = checked; // true = V, false = F
    } else if (tipo === 'ME-CH' && isCheckbox) {
      const selected = new Set((ans.selectedOriginalIndices || []).map((idx) => Number(idx)));
      if (checked) {
        selected.add(originalAltIdx);
      } else {
        selected.delete(originalAltIdx);
      }
      ans.selectedOriginalIndices = Array.from(selected).sort((a, b) => a - b);
    } else {
      // ME / VF – uma única alternativa
      ans.selectedOriginalIdx = originalAltIdx;
    }

    const card = document.querySelector(
      `.question-card[data-original-idx="${originalQIdx}"]`
    );
    if (card) {
      if (tipo === 'CH') {
        const answers = ans.assertivaAnswers || {};
        // Atualiza visual dos botões V/F e do label da assertiva
        card.querySelectorAll('.ch-vf-wrapper').forEach((wrapper) => {
          const radioV = wrapper.querySelector('input[value="V"]');
          if (!radioV) return;
          const assIdx = parseInt(radioV.name.split('_ass')[1], 10);
          const choice = answers[assIdx];

          const btnV = wrapper.querySelector('.ch-vf-v');
          const btnF = wrapper.querySelector('.ch-vf-f');
          const label = wrapper.querySelector('.ch-assertiva-label');

          if (btnV) btnV.classList.toggle('selected', choice === true);
          if (btnF) btnF.classList.toggle('selected', choice === false);
          if (label) label.classList.toggle('selected', choice !== undefined);
        });
      } else if (tipo === 'ME-CH') {
        const selected = new Set((ans.selectedOriginalIndices || []).map((idx) => Number(idx)));
        card.querySelectorAll('.alt-label').forEach((label) => {
          const input = label.querySelector('.alt-input');
          if (!input) return;
          label.classList.toggle('selected', selected.has(Number(input.value)));
        });
      } else {
        card.querySelectorAll('.alt-label').forEach((l) =>
          l.classList.remove('selected')
        );
        const input = card.querySelector(`input[value="${originalAltIdx}"]`);
        if (input) input.closest('.alt-label').classList.add('selected');
      }

      const btn = card.querySelector('.btn-submit');
      if (btn) {
        if (tipo === 'CH' || tipo === 'ME-CH') {
          // CH e ME-CH permitem responder mesmo sem marcar nada
          btn.disabled = false;
        } else {
          btn.disabled = ans.selectedOriginalIdx === undefined;
        }
      }
    }

    this.save(true);
  },

  handleElimination(originalQIdx, originalAltIdx) {
    if (!this.state.eliminatedAlts[originalQIdx]) {
      this.state.eliminatedAlts[originalQIdx] = [];
    }

    const list = this.state.eliminatedAlts[originalQIdx];
    const index = list.indexOf(originalAltIdx);

    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push(originalAltIdx);
    }

    this.save(true);

    const card = document.querySelector(
      `.question-card[data-original-idx="${originalQIdx}"]`
    );
    if (card) {
      const qData = this.state.questions[originalQIdx];
      const wrapper = this.findAlternativeWrapper(card, qData, originalAltIdx);
      if (wrapper) {
        wrapper.classList.toggle('eliminated', index === -1);
      }
    }
  },

  findAlternativeWrapper(card, qData, originalAltIdx) {
    const tipo = ((qData && qData.tipo) || '').toUpperCase();
    if (tipo === 'CH') {
      return card.querySelector(`input[name="q${card.dataset.originalIdx}_ass${originalAltIdx}"]`)?.closest('.alt-wrapper');
    }
    return card.querySelector(`.alt-input[value="${originalAltIdx}"]`)?.closest('.alt-wrapper');
  },

  handleMarkWords(qIdx, markKey, wordIndices) {
    if (!this.state.userAnswers[qIdx]) {
      this.state.userAnswers[qIdx] = {};
    }
    const ans = this.state.userAnswers[qIdx];
    const tipo = (this.state.questions[qIdx].tipo || '').toUpperCase();

    if (tipo === 'VF') {
      // VF: markedWords é um array simples (só enunciado)
      if (wordIndices.length > 0) {
        ans.markedWords = wordIndices;
      } else {
        delete ans.markedWords;
      }
    } else {
      // CH: markedWords é objeto { assIdx: [...] }
      if (!ans.markedWords) ans.markedWords = {};
      if (wordIndices.length > 0) {
        ans.markedWords[markKey] = wordIndices;
      } else {
        delete ans.markedWords[markKey];
      }
      if (Object.keys(ans.markedWords).length === 0) delete ans.markedWords;
    }

    this.save(true);
  },

  submitQuestion(originalQIdx) {
    if (this.state.forcedIndices.includes(originalQIdx)) return;

    if (!this.state.userAnswers[originalQIdx]) {
      this.state.userAnswers[originalQIdx] = {};
    }

    this.state.userAnswers[originalQIdx].submitted = true;
    this.save(true);

    const visualIdx = this.state.mappings.qOrder.indexOf(originalQIdx);
    const card = document.querySelector(
      `.question-card[data-original-idx="${originalQIdx}"]`
    );
    const newCard = this.renderer.createQuestionCard(
      this.state.questions[originalQIdx],
      originalQIdx,
      visualIdx,
      this.state
    );
    card.replaceWith(newCard);
    this.renderer.updateFooter(this.state);

    // Aplicar modo de colapso de comentários após submissão
    this.applyCommentCollapseModeAfterSubmit(originalQIdx);

    // Reenquadrar a questão depois que alternativas, correções e comentários
    // específicos assumirem suas dimensões finais.
    this.scrollSubmittedQuestionIntoView(originalQIdx);
  },

  handleToggleDisregardCorrect(originalQIdx, checked) {
    if (!this.state.userAnswers[originalQIdx]) return;
    const ans = this.state.userAnswers[originalQIdx];
    const raw = this.computeQuestionScore(originalQIdx, { ignoreDisregard: true });
    if (!ans.submitted || !this.isObjectiveQuestion(originalQIdx) || raw.total === 0 || raw.hits <= 0) {
      return;
    }

    ans.disregardCorrect = !!checked;
    if (checked && this.state.config.showDisregardCorrect !== false) {
      this.state.config.applyDisregardedCorrect = true;
    }

    this.save(true);

    const card = document.querySelector(
      `.question-card[data-original-idx="${originalQIdx}"]`
    );
    if (card) {
      this.updateQuestionScoreDisplay(originalQIdx, card);
    }
    this.renderer.updateFooter(this.state);
  },

  updateQuestionScoreDisplay(originalQIdx, card) {
    const scoreDiv = card.querySelector('.me-ch-score');
    if (!scoreDiv) return;
    const { hits, total } = this.computeQuestionScore(originalQIdx);
    const score = total > 0 ? hits / total : 0;
    const fmt = (n, maxDec = 2) =>
      (+n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: maxDec });
    scoreDiv.innerHTML =
      `<strong>Pontuação nesta questão:</strong> ${fmt(score)}/1 ponto (${fmt(score * 100, 1)}%)`;
  },

  handleToggleApplyDisregardedCorrect(checked) {
    this.state.config.applyDisregardedCorrect = !!checked;
    this.save(false);
    this.updateVisibleQuestionScoreDisplays();
    this.renderer.updateFooter(this.state);
  },

  updateVisibleQuestionScoreDisplays() {
    document.querySelectorAll('.question-card[data-original-idx]').forEach((card) => {
      const idx = Number(card.dataset.originalIdx);
      if (!Number.isNaN(idx)) this.updateQuestionScoreDisplay(idx, card);
    });
  },

  scrollSubmittedQuestionIntoView(originalQIdx) {
    // Dois frames evitam disputar a rolagem com a ancoragem automática que o
    // navegador aplica quando o card é substituído por uma versão mais alta.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = document.querySelector(
          `.question-card[data-original-idx="${originalQIdx}"]`
        );
        const alternatives = card && card.querySelector('.alternatives-list');
        if (!alternatives) return;

        const statement = card.querySelector('.q-enunciado');
        const alternativesRect = alternatives.getBoundingClientRect();
        const statementRect = statement && statement.getBoundingClientRect();

        const margin = 16;
        const footerStyle = window.getComputedStyle(this.elements.footerBar);
        const footerHeight =
          footerStyle.position === 'fixed' && footerStyle.display !== 'none'
            ? this.elements.footerBar.getBoundingClientRect().height
            : 0;
        const viewportTop = margin;
        const viewportBottom = window.innerHeight - footerHeight - margin;
        const availableHeight = Math.max(0, viewportBottom - viewportTop);

        const alternativesTop = window.scrollY + alternativesRect.top;
        const alternativesBottom = window.scrollY + alternativesRect.bottom;
        const alternativesHeight = alternativesRect.height;
        let targetScroll;

        const combinedTop = statementRect
          ? window.scrollY + statementRect.top
          : alternativesTop;
        const combinedHeight = alternativesBottom - combinedTop;

        if (combinedHeight <= availableHeight) {
          // Enunciado e lista completa cabem: centralizar o conjunto.
          targetScroll =
            combinedTop - viewportTop - (availableHeight - combinedHeight) / 2;
        } else if (alternativesHeight <= availableHeight) {
          // A lista completa cabe: colocá-la junto à base da área útil para
          // aproveitar todo o espaço restante acima com o enunciado.
          targetScroll = alternativesBottom - viewportBottom;
        } else {
          // A lista é maior que a tela: começar pela primeira alternativa em
          // vez de deixar a ancoragem cair no meio de um comentário extenso.
          targetScroll = alternativesTop - viewportTop;
        }

        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight
        );
        window.scrollTo({
          top: Math.min(Math.max(0, targetScroll), maxScroll),
          behavior: 'smooth'
        });
      });
    });
  },

  submitAll() {
    if (!confirm('Tem certeza que deseja entregar todas as questões?')) return;

    this.state.mappings.qOrder.forEach((idx) => {
      if (this.state.forcedIndices && this.state.forcedIndices.includes(idx)) return;

      const qData = this.state.questions[idx];
      const tipo = (qData.tipo || '').toUpperCase();

      if (!this.state.userAnswers[idx]) {
        this.state.userAnswers[idx] = {};
      }
      const ans = this.state.userAnswers[idx];

      if (tipo === 'ESCRITA' &&
          (qData.subtipo === 'itens' || (Array.isArray(qData.itens) && qData.itens.length > 0))) {
        // ESCRITA com itens: submete cada item individualmente
        const numItems = (qData.itens || []).length;
        if (!Array.isArray(ans.items)) {
          ans.items = Array.from({ length: numItems }, () => ({}));
        }
        while (ans.items.length < numItems) ans.items.push({});
        ans.items.forEach((_, i) => {
          if (!ans.items[i]) ans.items[i] = {};
          ans.items[i].submitted = true;
        });
      }

      ans.submitted = true;
    });

    this.save(true);
    this.renderer.render(this.state);
    this.applyCommentCollapseMode();

    // Sync imediato após submeter todas (ação importante)
    if (this.firebaseState.autoSync && this.firebaseState.connected) {
      clearTimeout(this.firebaseState.debounceTimer);
      this.syncNow();
    }

    setTimeout(() => {
      const resultSection = document.querySelector('.result-section');
      if (resultSection) {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    }, 150);
  },

  // ===================== ESCRITA handlers =====================

  handleEscritaTextChange(qIdx, text, itemIdx) {
    if (!this.state.userAnswers[qIdx]) {
      this.state.userAnswers[qIdx] = {};
    }
    const ans = this.state.userAnswers[qIdx];

    if (itemIdx === null || itemIdx === undefined) {
      ans.text = text;
    } else {
      const qData = this.state.questions[qIdx];
      const numItems = (qData.itens || []).length;
      if (!Array.isArray(ans.items)) {
        ans.items = Array.from({ length: numItems }, () => ({}));
      }
      while (ans.items.length <= itemIdx) ans.items.push({});
      if (!ans.items[itemIdx]) ans.items[itemIdx] = {};
      ans.items[itemIdx].text = text;
    }

    // Salva no IndexedDB com debounce curto para não perder dados em reload rápido
    clearTimeout(this._escritaTextSaveTimer);
    this._escritaTextSaveTimer = setTimeout(() => this.save(false), 400);
  },

  handleEscritaItemSubmit(qIdx, itemIdx, text) {
    if (this.state.forcedIndices && this.state.forcedIndices.includes(qIdx)) return;

    const qData = this.state.questions[qIdx];
    if (!this.state.userAnswers[qIdx]) {
      this.state.userAnswers[qIdx] = {};
    }
    const ans = this.state.userAnswers[qIdx];

    if (itemIdx === null || itemIdx === undefined) {
      // ESCRITA simples
      ans.text = text;
      ans.submitted = true;
    } else {
      // ESCRITA com itens
      const numItems = (qData.itens || []).length;
      if (!Array.isArray(ans.items)) {
        ans.items = Array.from({ length: numItems }, () => ({}));
      }
      while (ans.items.length <= itemIdx) ans.items.push({});
      if (!ans.items[itemIdx]) ans.items[itemIdx] = {};
      ans.items[itemIdx].text = text;
      ans.items[itemIdx].submitted = true;

      // Verifica se todos os itens foram enviados
      const allItemsDone = ans.items.length >= numItems &&
        qData.itens.every((_, i) => ans.items[i] && ans.items[i].submitted);
      if (allItemsDone) ans.submitted = true;
    }

    this.save(true);

    // Re-renderiza o card da questão
    const visualIdx = this.state.mappings.qOrder.indexOf(qIdx);
    const card = document.querySelector(`.question-card[data-original-idx="${qIdx}"]`);
    if (card) {
      const newCard = this.renderer.createQuestionCard(
        this.state.questions[qIdx], qIdx, visualIdx, this.state
      );
      card.replaceWith(newCard);
    }

    this.renderer.updateFooter(this.state);
  },

  handleSelfEval(qIdx, score, itemIdx) {
    if (!this.state.userAnswers[qIdx]) return;
    const ans = this.state.userAnswers[qIdx];

    if (itemIdx === null || itemIdx === undefined) {
      ans.selfEval = score;
    } else {
      if (!Array.isArray(ans.items) || !ans.items[itemIdx]) return;
      ans.items[itemIdx].selfEval = score;
    }

    this.save(false);

    // Re-renderiza o card para atualizar botão selecionado
    const visualIdx = this.state.mappings.qOrder.indexOf(qIdx);
    const card = document.querySelector(`.question-card[data-original-idx="${qIdx}"]`);
    if (card) {
      const newCard = this.renderer.createQuestionCard(
        this.state.questions[qIdx], qIdx, visualIdx, this.state
      );
      card.replaceWith(newCard);
    }

    // Atualiza pontuação em tempo real
    this.renderer.updateFooter(this.state);
  },

  async exportBackup() {
    if (!this.state.quizJson) {
      alert('Nenhum dado para exportar.');
      return;
    }

    // Monta objeto de exportação com metadados
    const now = new Date().toISOString();
    const title = (this.state.quizJson && this.state.quizJson.titulo) || '';
    const answeredCount = this.getAnsweredCount();
    const totalCount = this.getTotalQuestionCount();

    const exportData = {
      sessionId: this.activeSessionId || generateId(),
      title: this._sessionTitle || title || 'Quiz sem título',
      sourceFileName: this._sourceFileName || '',
      folderId: this._sessionFolderId || '',
      derivedFromErrors: !!(this._sessionDerivedFromErrors || this.state.retryDerivedFromErrors),
      createdAt: this._sessionCreatedAt || now,
      lastAccessedAt: this._lastAccessedAt || now,
      updatedAt: now,
      answeredCount,
      totalCount,
      state: JSON.parse(JSON.stringify(this.state))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const fileName = title ? `Sessão - ${title}.json` : 'Sessão.json';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },

  async handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target.result);

        // Suporta formato novo (com sessionId/state) e legado (com quizJson direto)
        const state = data.state || (data.quizJson ? data : null);
        if (!state || !state.quizJson) {
          alert('Arquivo de sessão inválido: não contém dados de quiz.');
          return;
        }
        if (!confirm('Importar esta sessão? Ela será adicionada à lista de sessões e aberta.')) return;

        const now = new Date().toISOString();
        const session = {
          sessionId: generateId(),
          title: data.title || (state.quizJson && state.quizJson.titulo) || 'Quiz sem título',
          sourceFileName: data.sourceFileName || '',
          folderId: data.folderId || '',
          derivedFromErrors: !!(data.derivedFromErrors || state.retryDerivedFromErrors),
          createdAt: now,
          lastAccessedAt: now,
          updatedAt: now,
          answeredCount: data.answeredCount || 0,
          totalCount: state.sessionQuestionCount || data.totalCount || (Array.isArray(state.questions) ? state.questions.length : 0),
          state: data.state || state
        };

        await saveSession(session);
        this.activeSessionId = session.sessionId;
        localStorage.setItem('activeSessionId', session.sessionId);
        location.reload();
      } catch (err) {
        alert('Erro ao importar: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  },

  resetApp() {
    if (!confirm('Deseja apagar todo o progresso?')) return;
    clearState().then(() => location.reload());
  },

  restoreUI() {
    this.elements.chkShuffleQ.checked = this.state.config.shuffleQ;
    this.elements.chkShuffleA.checked = this.state.config.shuffleA;
    this.elements.chkShowTags.checked = this.state.config.showTags;
    this.elements.chkShowDiff.checked = this.state.config.showDiff;
    this.elements.chkShowFilterSummary.checked =
      this.state.config.showFilterSummary;
    if (this.elements.chkShowDisregardCorrect) {
      this.state.config.showDisregardCorrect =
        localStorage.getItem('gs_showDisregardCorrect') !== 'false';
      this.elements.chkShowDisregardCorrect.checked =
        this.state.config.showDisregardCorrect !== false;
    }
  },

  getAnsweredCount() {
    if (!this.state.userAnswers) return 0;
    const active = new Set(this.getActiveQuestionIndices());
    return Object.entries(this.state.userAnswers).filter(([idx, a]) =>
      a && a.submitted && active.has(Number(idx))
    ).length;
  },

  getActiveQuestionIndices() {
    if (this.state.mappings && Array.isArray(this.state.mappings.qOrder) && this.state.mappings.qOrder.length > 0) {
      return this.state.mappings.qOrder.filter(idx =>
        !(this.state.forcedIndices && this.state.forcedIndices.includes(idx))
      );
    }
    if (this.state.retryMode && Array.isArray(this.state.retryIndices)) {
      return this.state.retryIndices;
    }
    if (Array.isArray(this.state.questions)) {
      return this.state.questions.map((_, idx) => idx);
    }
    return [];
  },

  getTotalQuestionCount() {
    if (typeof this.state.sessionQuestionCount === 'number') {
      return this.state.sessionQuestionCount;
    }
    return this.getActiveQuestionIndices().length;
  },

  save(updateAccess = false) {
    if (this.activeSessionId) {
      const now = new Date().toISOString();
      const title = this._sessionTitle || (this.state.quizJson && this.state.quizJson.titulo) || 'Quiz sem título';
      const answeredCount = this.getAnsweredCount();
      const totalCount = this.getTotalQuestionCount();

      // Preservar createdAt original
      if (!this._sessionCreatedAt) {
        this._sessionCreatedAt = now;
      }

      const session = {
        sessionId: this.activeSessionId,
        title,
        sourceFileName: this._sourceFileName || '',
        folderId: this._sessionFolderId || '',
        derivedFromErrors: !!(this._sessionDerivedFromErrors || this.state.retryDerivedFromErrors),
        createdAt: this._sessionCreatedAt,
        lastAccessedAt: updateAccess ? now : (this._lastAccessedAt || this._sessionCreatedAt),
        updatedAt: now,
        answeredCount,
        totalCount,
        state: this.state
      };

      if (updateAccess) {
        this._lastAccessedAt = now;
      }

      saveSession(session);
      this.markSyncPending();
    } else {
      saveState(this.state);
    }
  },

  markSyncPending() {
    if (!this.firebaseConfig || !this.firebaseState.connected) return;
    this.firebaseState.pendingChanges = true;
    this.updateSyncIndicator();

    if (this.firebaseState.autoSync) {
      clearTimeout(this.firebaseState.debounceTimer);
      this.firebaseState.debounceTimer = setTimeout(() => this.syncNow(), 30000);
    }
  },

  // ===== Firebase =====
  openFirebaseModal() {
    if (!this.firebaseConfig) {
      alert('Firebase não está disponível. Verifique sua conexão com a internet.');
      return;
    }
    this.updateFirebaseUI();
    this.elements.firebaseModal.classList.remove('hidden');
  },

  updateFirebaseUI() {
    if (this.firebaseState.connected) {
      this.elements.firebaseLogin.classList.add('hidden');
      this.elements.firebaseConnected.classList.remove('hidden');
      this.elements.btnSyncConfig.classList.remove('hidden');
      this.updateSyncIndicator();

      // Last sync time
      if (this.firebaseState.lastSyncTime) {
        try {
          this.elements.firebaseLastSync.textContent = new Date(this.firebaseState.lastSyncTime)
            .toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { this.elements.firebaseLastSync.textContent = this.firebaseState.lastSyncTime; }
      } else {
        this.elements.firebaseLastSync.textContent = 'Nunca';
      }

      this.elements.firebaseSyncStatusText.textContent = this.firebaseState.syncing
        ? 'Sincronizando...'
        : this.firebaseState.pendingChanges
          ? 'Pendente'
          : 'Sincronizado';
    } else {
      this.elements.firebaseLogin.classList.remove('hidden');
      this.elements.firebaseConnected.classList.add('hidden');
      this.elements.btnSyncConfig.classList.add('hidden');
      this.elements.firebaseLoginError.classList.add('hidden');
    }
  },

  updateSyncIndicator() {
    const ind = this.elements.syncIndicator;
    ind.className = 'sync-indicator';
    if (!this.firebaseState.connected) {
      ind.classList.add('offline');
    } else if (this.firebaseState.syncing) {
      ind.classList.add('syncing');
    } else if (this.firebaseState.pendingChanges) {
      ind.classList.add('pending');
    } else {
      ind.classList.add('synced');
    }
  },

  _getPendingDeleteTombstones() {
    try {
      const raw = JSON.parse(localStorage.getItem('pendingDeletes') || '{}');
      if (Array.isArray(raw)) {
        const now = new Date().toISOString();
        return Object.fromEntries(raw.map(id => [id, now]));
      }
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  },

  _setPendingDeleteTombstones(tombstones) {
    const ids = Object.keys(tombstones || {});
    if (ids.length === 0) {
      localStorage.removeItem('pendingDeletes');
    } else {
      localStorage.setItem('pendingDeletes', JSON.stringify(tombstones));
    }
  },

  async _markSessionDeleted(sessionId, deletedAt = new Date().toISOString()) {
    if (!sessionId) return;

    const pending = this._getPendingDeleteTombstones();
    pending[sessionId] = pending[sessionId] || deletedAt;
    this._setPendingDeleteTombstones(pending);

    if (this.firebaseSync && this.firebaseState.connected) {
      const ok = await this.firebaseSync.recordDeletedSession(sessionId, pending[sessionId]);
      if (ok) {
        delete pending[sessionId];
        this._setPendingDeleteTombstones(pending);
      }
    }
  },

  _clearActiveSessionUI() {
    this.activeSessionId = null;
    localStorage.removeItem('activeSessionId');
    this.state.quizJson = null;
    this.state.questions = [];
    this.state.mappings = { qOrder: [], altOrder: {} };
    this.state.userAnswers = {};
    this.state.retryMode = false;
    this.state.retryIndices = [];
    this.state.retryDerivedFromErrors = false;
    this._sessionDerivedFromErrors = false;
    this.renderer.container.innerHTML = '';
    this.elements.configBar.classList.add('hidden');
    this.elements.footerBar.classList.add('hidden');
    this.elements.filterSection.classList.add('hidden');
    this.elements.uploadSection.classList.remove('hidden');
  },

  async handleFirebaseLogin() {
    if (!this.firebaseConfig) return;
    const code = this.elements.firebaseCode.value.trim();
    if (!code) return;

    this.elements.btnFirebaseConnect.disabled = true;
    this.elements.firebaseLoginError.classList.add('hidden');

    try {
      await this.firebaseConfig.loginWithCode(code);
      this.elements.firebaseCode.value = '';
      // onAuthChange callback will update UI
    } catch (e) {
      const msg = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
        ? 'Codigo incorreto.'
        : (e.code === 'auth/too-many-requests')
          ? 'Muitas tentativas. Tente novamente mais tarde.'
          : 'Erro: ' + e.message;
      this.elements.firebaseLoginError.textContent = msg;
      this.elements.firebaseLoginError.classList.remove('hidden');
    } finally {
      this.elements.btnFirebaseConnect.disabled = false;
    }
  },

  async handleFirebaseLogout() {
    if (!this.firebaseConfig) return;
    if (!confirm('Desconectar do Firebase? A sincronizacao automatica sera desativada.')) return;
    try {
      await this.firebaseConfig.logout();
      this.firebaseState.autoSync = false;
      localStorage.setItem('firebaseAutoSync', 'false');
      this.elements.chkFirebaseAutoSync.checked = false;
      this.elements.firebaseModal.classList.add('hidden');
    } catch (e) {
      alert('Erro ao desconectar: ' + e.message);
    }
  },

  async syncNow() {
    if (!this.firebaseConfig || !this.firebaseSync || !this.firebaseState.connected) return;
    if (this.firebaseState.syncing) return;

    clearTimeout(this.firebaseState.debounceTimer);
    this.firebaseState.syncing = true;
    this.updateSyncIndicator();
    this.updateFirebaseUI();

    try {
      // 1. Sincronizar tombstones de sessões deletadas antes de comparar listas.
      const pendingDeletes = this._getPendingDeleteTombstones();
      const remoteDeletes = await this.firebaseSync.downloadDeletedSessionTombstones();
      const deletedSessions = { ...remoteDeletes, ...pendingDeletes };
      const deletedIds = new Set(Object.keys(deletedSessions));

      if (deletedIds.size > 0) {
        const tombstonesUploaded = await this.firebaseSync.uploadDeletedSessionTombstones(deletedSessions);
        if (!tombstonesUploaded) {
          throw new Error('Falha ao enviar registro de sessões deletadas.');
        }
        this._setPendingDeleteTombstones({});

        const localBeforeDelete = await getAllSessions();
        for (const session of localBeforeDelete) {
          if (deletedIds.has(session.sessionId)) {
            await deleteSession(session.sessionId);
            if (session.sessionId === this.activeSessionId) {
              this._clearActiveSessionUI();
            }
          }
        }

        for (const id of deletedIds) {
          await this.firebaseSync.deleteRemoteSession(id);
        }
      }

      // 2. Obter listas local e remota após aplicar deleções
      const localSessions = await getAllSessions();
      const remoteSessions = await this.firebaseSync.getRemoteSessionList();

      const localMap = new Map(localSessions.map(s => [s.sessionId, s]));
      const remoteMap = new Map(remoteSessions.map(s => [s.sessionId, s]));
      const syncTime = (s) => s.updatedAt || s.lastAccessedAt || s.createdAt || '';

      // 3. Comparar e decidir upload/download
      const toUpload = [];
      const toDownload = [];

      for (const [id, local] of localMap) {
        if (deletedIds.has(id)) continue;
        const remote = remoteMap.get(id);
        if (!remote) {
          toUpload.push(id);
        } else if (syncTime(local) > syncTime(remote)) {
          toUpload.push(id);
        } else if (syncTime(remote) > syncTime(local)) {
          toDownload.push(id);
        }
      }

      for (const [id] of remoteMap) {
        if (!localMap.has(id) && !deletedIds.has(id)) {
          toDownload.push(id);
        }
      }

      // 4. Upload (local → Firebase)
      for (const id of toUpload) {
        const full = await loadSession(id);
        if (full) {
          await this.firebaseSync.uploadSession(full);
        }
      }

      // 5. Download (Firebase → local)
      for (const id of toDownload) {
        const full = await this.firebaseSync.downloadSession(id);
        if (full) {
          await saveSession(full);
        }
      }

      // 6. Sincronizar pastas de sessões
      try {
        const localFolderData = await loadSessionFolders();
        const remoteFolderData = await this.firebaseSync.downloadSessionFolders();

        if (remoteFolderData && localFolderData) {
          const localTime = localFolderData.updatedAt || '';
          const remoteTime = remoteFolderData.updatedAt || '';

          if (remoteTime > localTime) {
            // Remoto é mais recente: baixar
            await saveSessionFolders(remoteFolderData.folders || []);
            this._sessionFolders = remoteFolderData.folders || [];
          } else if (localTime > remoteTime) {
            // Local é mais recente: subir
            await this.firebaseSync.uploadSessionFolders({
              folders: localFolderData.folders || [],
              updatedAt: localFolderData.updatedAt
            });
          }
        } else if (localFolderData && localFolderData.folders && localFolderData.folders.length > 0 && !remoteFolderData) {
          // Só existe local: subir
          await this.firebaseSync.uploadSessionFolders({
            folders: localFolderData.folders,
            updatedAt: localFolderData.updatedAt
          });
        } else if (remoteFolderData && remoteFolderData.folders && remoteFolderData.folders.length > 0) {
          // Só existe remoto: baixar
          await saveSessionFolders(remoteFolderData.folders);
          this._sessionFolders = remoteFolderData.folders;
        }
      } catch (e) {
        console.warn('Erro ao sincronizar pastas:', e);
      }

      this.firebaseState.pendingChanges = false;
      this.firebaseState.lastSyncTime = new Date().toISOString();
      localStorage.setItem('lastSyncTime', this.firebaseState.lastSyncTime);

    } catch (e) {
      console.error('Erro na sincronizacao:', e);
    } finally {
      this.firebaseState.syncing = false;
      this.updateSyncIndicator();
      this.updateFirebaseUI();
    }
  },

  // ===== Lista de Sessões =====
  async openSessionListModal() {
    this.elements.sessionListModal.classList.remove('hidden');
    const data = await loadSessionFolders();
    this._sessionFolders = data.folders || [];
    await this.renderSessionList();
  },

  _sortSessions(sessions) {
    const sortValue = this.elements.sessionSortBy.value;
    const [sortField, sortDir] = sortValue.split('-');
    sessions.sort((a, b) => {
      const va = a[sortField] || '';
      const vb = b[sortField] || '';
      return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
    });
    return sessions;
  },

  _formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  },

  _formatSize(bytes) {
    if (!bytes || bytes === 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  _createSessionItemElement(s) {
    const item = document.createElement('div');
    item.className = 'session-item';
    const isActive = s.sessionId === this.activeSessionId;

    if (isActive) {
      item.classList.add('session-item-active');
    }

    const sourceFileHtml = s.sourceFileName
      ? `<div class="session-item-source">📄 ${this.escapeHtml(s.sourceFileName)}</div>`
      : '';
    const errorsBadgeHtml = s.derivedFromErrors
      ? '<span class="session-errors-badge" title="Sessão criada a partir de questões erradas">⚠</span>'
      : '';

    item.innerHTML = `
      <div class="session-item-info">
        <div class="session-item-title">${errorsBadgeHtml}<span>${this.escapeHtml(s.title)}${isActive ? ' (ativa)' : ''}</span></div>
        ${sourceFileHtml}
        <div class="session-item-meta">
          <span>Criada: ${this._formatDate(s.createdAt)}</span>
          <span>Última interação: ${this._formatDate(s.lastAccessedAt)}</span>
          <span class="session-progress-badge">Respondidas: ${s.answeredCount || 0}/${s.totalCount || 0}</span>
          <span class="session-size">${this._formatSize(s.sizeBytes)}</span>
        </div>
      </div>
      <div class="session-item-actions">
        ${s.description ? '<button class="session-btn btn-session-desc" title="Ver descrição do quiz">📝</button>' : ''}
        <button class="session-btn btn-session-edit" title="Editar título e descrição">✏️</button>
        <button class="session-btn btn-session-move" title="Mover para pasta">📁</button>
        <button class="session-btn btn-session-export" title="Exportar esta sessão">💾</button>
        <button class="session-btn btn-session-delete" title="Deletar esta sessão">🗑️</button>
      </div>
    `;

    item.querySelector('.session-item-info').addEventListener('click', () => {
      this.loadSessionFromList(s.sessionId);
    });

    const descBtn = item.querySelector('.btn-session-desc');
    if (descBtn) {
      descBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showInfoModal(s.title, s.description);
      });
    }

    item.querySelector('.btn-session-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEditSessionModal(s.sessionId, s.title, s.quizTitle, s.description);
    });

    item.querySelector('.btn-session-move').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openMoveSessionModal(s.sessionId, s.title, s.folderId);
    });

    item.querySelector('.btn-session-export').addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportSingleSession(s.sessionId);
    });

    item.querySelector('.btn-session-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteSessionFromList(s.sessionId, s.title);
    });

    return item;
  },

  async renderSessionList() {
    const container = this.elements.sessionListContainer;
    container.innerHTML = '<p style="text-align:center;color:#999;">Carregando...</p>';

    const sessions = await getAllSessions();
    if (sessions.length === 0) {
      container.innerHTML = '<p class="session-list-empty">Nenhuma sessão salva.</p>';
      return;
    }

    this._sortSessions(sessions);
    container.innerHTML = '';

    // Atualizar botão de toggle
    const toggleBtn = this.elements.btnToggleFolderView;
    if (this._folderViewActive) {
      toggleBtn.classList.add('active');
      toggleBtn.textContent = '📁 Pastas';
    } else {
      toggleBtn.classList.remove('active');
      toggleBtn.textContent = '📋 Lista';
    }

    if (!this._folderViewActive) {
      // Visão plana
      sessions.forEach(s => container.appendChild(this._createSessionItemElement(s)));
      return;
    }

    // === Visão de pastas ===

    // 1. Mostrar 3 últimas sessões interagidas
    const recentSessions = [...sessions]
      .sort((a, b) => (b.lastAccessedAt || '').localeCompare(a.lastAccessedAt || ''))
      .slice(0, 3);

    if (recentSessions.length > 0) {
      const recentHeader = document.createElement('div');
      recentHeader.className = 'session-recent-header';
      recentHeader.textContent = '⏱️ Últimas interações';
      container.appendChild(recentHeader);
      recentSessions.forEach(s => container.appendChild(this._createSessionItemElement(s)));
    }

    // 2. Breadcrumb de navegação
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'session-folder-breadcrumb';
    this._renderBreadcrumb(breadcrumb);
    container.appendChild(breadcrumb);

    // 3. Subpastas da pasta atual
    const childFolders = this._sessionFolders.filter(f => (f.parentId || '') === (this._currentViewFolderId || ''));
    childFolders.sort((a, b) => a.name.localeCompare(b.name));

    childFolders.forEach(folder => {
      const sessionsInFolder = this._countSessionsInFolder(folder.folderId, sessions);
      const folderEl = document.createElement('div');
      folderEl.className = 'session-folder-item';
      folderEl.innerHTML = `
        <span class="folder-icon">📁</span>
        <span class="folder-name">${this.escapeHtml(folder.name)}</span>
        <span class="folder-count">${sessionsInFolder}</span>
        <div class="session-folder-actions">
          ${folder.description ? '<button class="session-btn btn-session-desc" title="Ver descrição">📝</button>' : ''}
          <button class="session-btn btn-folder-edit" title="Editar pasta">✏️</button>
          <button class="session-btn btn-folder-delete" title="Deletar pasta">🗑️</button>
        </div>
      `;

      // Navegar para dentro da pasta
      folderEl.querySelector('.folder-name').addEventListener('click', () => {
        this._currentViewFolderId = folder.folderId;
        this.renderSessionList();
      });
      folderEl.querySelector('.folder-icon').addEventListener('click', () => {
        this._currentViewFolderId = folder.folderId;
        this.renderSessionList();
      });

      const descBtn = folderEl.querySelector('.btn-session-desc');
      if (descBtn) {
        descBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showInfoModal(folder.name, folder.description);
        });
      }

      // Editar pasta
      folderEl.querySelector('.btn-folder-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditFolderModal(folder);
      });

      // Deletar pasta
      folderEl.querySelector('.btn-folder-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFolderWithConfirm(folder, sessions);
      });

      container.appendChild(folderEl);
    });

    // 4. Sessões da pasta atual (sem subpasta)
    const currentSessions = sessions.filter(s => (s.folderId || '') === (this._currentViewFolderId || ''));
    if (currentSessions.length > 0) {
      if (childFolders.length > 0 || this._currentViewFolderId) {
        const label = document.createElement('div');
        label.className = 'session-root-label';
        label.textContent = this._currentViewFolderId ? 'Sessões nesta pasta:' : 'Sessões sem pasta:';
        container.appendChild(label);
      }
      currentSessions.forEach(s => container.appendChild(this._createSessionItemElement(s)));
    }

    if (childFolders.length === 0 && currentSessions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'session-list-empty';
      empty.textContent = 'Pasta vazia.';
      container.appendChild(empty);
    }
  },

  _renderBreadcrumb(container) {
    container.innerHTML = '';
    const path = this._getFolderPath(this._currentViewFolderId);

    const rootSpan = document.createElement('span');
    rootSpan.textContent = '🏠 Raiz';
    if (this._currentViewFolderId) {
      rootSpan.addEventListener('click', () => {
        this._currentViewFolderId = null;
        this.renderSessionList();
      });
    } else {
      rootSpan.className = 'bc-current';
    }
    container.appendChild(rootSpan);

    path.forEach((folder, idx) => {
      const sep = document.createElement('span');
      sep.className = 'bc-separator';
      sep.textContent = ' › ';
      container.appendChild(sep);

      const span = document.createElement('span');
      span.textContent = folder.name;
      if (idx === path.length - 1) {
        span.className = 'bc-current';
      } else {
        span.addEventListener('click', () => {
          this._currentViewFolderId = folder.folderId;
          this.renderSessionList();
        });
      }
      container.appendChild(span);
    });
  },

  _getFolderPath(folderId) {
    const path = [];
    let currentId = folderId;
    while (currentId) {
      const folder = this._sessionFolders.find(f => f.folderId === currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parentId || null;
    }
    return path;
  },

  _countSessionsInFolder(folderId, sessions) {
    // Contar sessões nesta pasta e em todas as subpastas recursivamente
    let count = sessions.filter(s => (s.folderId || '') === folderId).length;
    const childFolders = this._sessionFolders.filter(f => f.parentId === folderId);
    childFolders.forEach(child => {
      count += this._countSessionsInFolder(child.folderId, sessions);
    });
    return count;
  },

  _getDescendantFolderIds(folderId) {
    const ids = [folderId];
    const children = this._sessionFolders.filter(f => f.parentId === folderId);
    children.forEach(c => {
      ids.push(...this._getDescendantFolderIds(c.folderId));
    });
    return ids;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async loadSessionFromList(sessionId) {
    const session = await loadSession(sessionId);
    if (!session || !session.state) {
      alert('Erro ao carregar sessão.');
      return;
    }

    this.activeSessionId = session.sessionId;
    this._sessionCreatedAt = session.createdAt;
    this._lastAccessedAt = session.lastAccessedAt || session.createdAt;
    this._sessionTitle = session.title;
    this._sourceFileName = session.sourceFileName || null;
    this._sessionFolderId = session.folderId || '';
    localStorage.setItem('activeSessionId', session.sessionId);
    this.elements.sessionListModal.classList.add('hidden');

    this.state = session.state;
    this.ensureStateIntegrity();
    this.restoreUI();

    if (this.state.mappings.qOrder && this.state.mappings.qOrder.length > 0) {
      if (this.state.retryMode) {
        this.generateMappings();
      }
      this.showQuizInterface();
      this.renderer.render(this.state);
      this.applyCommentCollapseMode();
    } else if (this.state.quizJson) {
      this.renderFilterDescription();
      if (this.state.filters.step === 2) {
        this.prepareStep1();
        this.prepareStep2();
      } else {
        this.prepareStep1();
      }
      this.elements.uploadSection.classList.add('hidden');
      this.elements.filterSection.classList.remove('hidden');
      this.elements.configBar.classList.add('hidden');
      this.elements.footerBar.classList.add('hidden');
      this.renderer.container.innerHTML = '';
    }

    this.save();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async exportSingleSession(sessionId) {
    const session = await loadSession(sessionId);
    if (!session) {
      alert('Sessão não encontrada.');
      return;
    }
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const fileName = session.title ? `Sessão - ${session.title}.json` : 'Sessão.json';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },

  async deleteSessionFromList(sessionId, title) {
    if (!confirm(`Deletar a sessão "${title}"? Esta ação não pode ser desfeita.`)) return;

    await deleteSession(sessionId);
    await this._markSessionDeleted(sessionId);

    // Se era a sessão ativa, limpa tudo
    if (sessionId === this.activeSessionId) {
      this._clearActiveSessionUI();
    }

    await this.renderSessionList();
  },

  async exportSessionList() {
    const blob = await exportAllSessions();
    if (!blob) {
      alert('Nenhuma sessão para exportar.');
      return;
    }
    const fileName = `Lista de Sessões - ${new Date().toLocaleDateString('pt-BR')}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },

  async handleImportSessionList(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!Array.isArray(data)) {
          alert('Arquivo inválido: esperava uma lista de sessões (array).');
          return;
        }

        const valid = data.filter(s => s.sessionId && s.state && s.state.quizJson);
        if (valid.length === 0) {
          alert('Nenhuma sessão válida encontrada no arquivo.');
          return;
        }

        if (!confirm(`Importar ${valid.length} sessão(ões)? Elas serão adicionadas como novas sessões.`)) return;

        const now = new Date().toISOString();
        const imported = valid.map((s) => ({
          ...s,
          sessionId: generateId(),
          createdAt: now,
          lastAccessedAt: now,
          updatedAt: now,
          derivedFromErrors: !!(s.derivedFromErrors || (s.state && s.state.retryDerivedFromErrors))
        }));

        await importAllSessions(imported);
        await this.renderSessionList();
      } catch (err) {
        alert('Erro ao importar lista: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  },

  // ===== Nuvem =====
  async openCloudModal() {
    this.elements.cloudModal.classList.remove('hidden');
    this.elements.cloudTree.innerHTML = 'Carregando índice...';

    try {
      const response = await fetch(
        'quizes-da-nuvem/index.json?t=' + new Date().getTime()
      );
      if (!response.ok) throw new Error('Índice não encontrado');
      const treeData = await response.json();
      this.renderCloudTree(treeData, this.elements.cloudTree);
    } catch (e) {
      this.elements.cloudTree.innerHTML = `
        <p style="color:red">Erro ao carregar índice: ${e.message}</p>
        <p><small>Verifique se 'quizes-da-nuvem/index.json' existe.</small></p>`;
    }
  },

  renderCloudTree(nodes, container) {
    container.innerHTML = '';
    const ul = document.createElement('ul');

    nodes.forEach((node) => {
      const li = document.createElement('li');
      li.className = 'tree-node';

      if (node.type === 'folder') {
        li.className += ' is-folder';
        li.innerHTML = `
          <div class="node-content">
            <span class="icon folder-icon">📁</span> ${node.name}
          </div>
          <div class="folder-children"></div>
        `;

        const contentDiv = li.querySelector('.node-content');
        const childrenDiv = li.querySelector('.folder-children');

        if (node.children) this.renderCloudTree(node.children, childrenDiv);

        contentDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          li.classList.toggle('folder-open');
          const icon = li.querySelector('.folder-icon');
          icon.textContent = li.classList.contains('folder-open') ? '📂' : '📁';
        });
      } else {
        li.className += ' is-file';
        li.innerHTML = `
          <div class="node-content">
            <span class="icon file-icon">📄</span> ${node.name}
          </div>
        `;
        li.querySelector('.node-content').addEventListener('click', () => {
          this.fetchCloudQuiz(node.path);
        });
      }

      ul.appendChild(li);
    });

    container.appendChild(ul);
  },

  async fetchCloudQuiz(path) {
    if (!confirm(`Carregar quiz: ${path}? O progresso atual ficará salvo na lista de sessões.`))
      return;

    this.elements.cloudModal.classList.add('hidden');

    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Arquivo não encontrado');
      const json = await response.json();
      const fileName = path.split('/').pop();
      this.loadQuizJSON(json, fileName);
    } catch (e) {
      alert('Erro ao baixar quiz: ' + e.message);
    }
  },

  toggleTree(expand) {
    const folders = this.elements.cloudTree.querySelectorAll('.is-folder');
    folders.forEach((f) => {
      if (expand) {
        f.classList.add('folder-open');
        f.querySelector('.folder-icon').textContent = '📂';
      } else {
        f.classList.remove('folder-open');
        f.querySelector('.folder-icon').textContent = '📁';
      }
    });
  },

  // ===== Filtro por pasta (Step 1/2) =====
  prepareStep1() {
    this.elements.filterStep1.classList.remove('hidden');
    this.elements.filterStep2.classList.add('hidden');

    const folderSet = new Set();
    this.state.filters.counts.folders = {};

    this.state.questions.forEach((q) => {
      const pathStr = q._path.join(' > ');
      folderSet.add(pathStr);
      this.state.filters.counts.folders[pathStr] =
        (this.state.filters.counts.folders[pathStr] || 0) + 1;
    });

    this.state.filters.allFolders = Array.from(folderSet).sort();

    if (this.state.filters.folders.length === 0) {
      this.state.filters.folders = [...this.state.filters.allFolders];
    }

    if (
      Object.keys(this.state.filters.folderDescriptions).length === 0 &&
      this.state.quizJson
    ) {
      this.extractFolderDescriptions(this.state.quizJson.conteudo);
    }

    this.renderFolderUI();
  },

  showStep1() {
    this.elements.filterStep1.classList.remove('hidden');
    this.elements.filterStep2.classList.add('hidden');
  },

  prepareStep2() {
    this.elements.filterStep1.classList.add('hidden');
    this.elements.filterStep2.classList.remove('hidden');

    const selFolders = new Set(this.state.filters.folders);
    const tagsSet = new Set();
    const diffsSet = new Set();

    this.state.filters.counts.tags = {};
    this.state.filters.counts.diffs = {};
    this.state.filters.counts.types = {};

    this.state.questions.forEach((q) => {
      const pathStr = q._path.join(' > ');
      if (!selFolders.has(pathStr)) return;

      if (q.tags && q.tags.length > 0) {
        q.tags.forEach((t) => {
          tagsSet.add(t);
          this.state.filters.counts.tags[t] =
            (this.state.filters.counts.tags[t] || 0) + 1;
        });
      } else {
        const noTag = '__NO_TAG__';
        tagsSet.add(noTag);
        this.state.filters.counts.tags[noTag] =
          (this.state.filters.counts.tags[noTag] || 0) + 1;
      }

      if (q.dificuldade !== undefined && q.dificuldade !== null) {
        const d = q.dificuldade;
        diffsSet.add(d);
        this.state.filters.counts.diffs[d] =
          (this.state.filters.counts.diffs[d] || 0) + 1;
      } else {
        const noDiff = '__NO_DIFF__';
        diffsSet.add(noDiff);
        this.state.filters.counts.diffs[noDiff] =
          (this.state.filters.counts.diffs[noDiff] || 0) + 1;
      }

      const type = (q.tipo || '').toUpperCase();
      if (questionTypes.includes(type)) {
        this.state.filters.counts.types[type] =
          (this.state.filters.counts.types[type] || 0) + 1;
      }
    });

    this.state.filters.allTags = Array.from(tagsSet).sort();
    this.state.filters.allDiffs = Array.from(diffsSet).sort();
    this.state.filters.allTypes = [...questionTypes];

    this.state.filters.tags = this.state.filters.tags.filter((t) =>
      tagsSet.has(t)
    );
    this.state.filters.excludedTags = this.state.filters.excludedTags.filter((t) =>
      tagsSet.has(t)
    );
    this.state.filters.diffs = this.state.filters.diffs.filter((d) =>
      diffsSet.has(d)
    );
    this.state.filters.types = this.state.filters.types.filter((type) =>
      questionTypes.includes(type)
    );

    if (
      this.state.filters.diffs.length === 0 &&
      this.state.filters.allDiffs.length > 0
    ) {
      this.state.filters.diffs = [...this.state.filters.allDiffs];
    }

    this.renderFilterUI();
  },

  renderFolderUI() {
    const container = this.elements.folderTree;
    container.innerHTML = '';

    const tree = {};

    this.state.filters.allFolders.forEach((pathStr) => {
      const parts = pathStr.split(' > ');
      let current = tree;

      parts.forEach((part, idx) => {
        if (!current[part]) {
          current[part] = {
            name: part,
            fullPath: parts.slice(0, idx + 1).join(' > '),
            children: {},
            count: 0
          };
        }
        if (idx === parts.length - 1) {
          current[part].count =
            this.state.filters.counts.folders[pathStr] || 0;
        }
        current = current[part].children;
      });
    });

    const buildDom = (nodeChildren, parentUl) => {
      Object.keys(nodeChildren)
        .sort()
        .forEach((key) => {
          const node = nodeChildren[key];
          const li = document.createElement('li');
          li.className = 'ft-li';

          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.dataset.path = node.fullPath;

          const relatedPaths = this.state.filters.allFolders.filter((p) =>
            p.startsWith(node.fullPath)
          );
          const allSelected = relatedPaths.every((p) =>
            this.state.filters.folders.includes(p)
          );
          const someSelected = relatedPaths.some((p) =>
            this.state.filters.folders.includes(p)
          );

          chk.checked = allSelected;
          chk.indeterminate = someSelected && !allSelected;

          chk.addEventListener('change', () => {
            const isChecked = chk.checked;
            const pathsToToggle = this.state.filters.allFolders.filter((p) =>
              p.startsWith(node.fullPath)
            );

            pathsToToggle.forEach((p) => {
              if (isChecked) {
                if (!this.state.filters.folders.includes(p)) {
                  this.state.filters.folders.push(p);
                }
              } else {
                const idx = this.state.filters.folders.indexOf(p);
                if (idx > -1) this.state.filters.folders.splice(idx, 1);
              }
            });

            this.renderFolderUI();
            this.save();
          });

          const getTotalCount = (n) => {
            let total = n.count;
            Object.values(n.children).forEach((child) => {
              total += getTotalCount(child);
            });
            return total;
          };

          const totalNodeQuestions = getTotalCount(node);

          const label = document.createElement('label');
          label.className = 'ft-label';
          label.appendChild(chk);
          label.appendChild(document.createTextNode(node.name));

          const spanCount = document.createElement('span');
          spanCount.className = 'ft-count';
          spanCount.textContent = totalNodeQuestions;
          label.appendChild(spanCount);

          const desc = this.state.filters.folderDescriptions[node.fullPath];
          if (desc) {
            const btnDesc = document.createElement('span');
            btnDesc.className = 'btn-desc';
            btnDesc.textContent = '📝 Ver descrição';
            btnDesc.title = 'Clique para ver a descrição';

            btnDesc.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.showInfoModal(node.name, desc);
            });

            label.appendChild(btnDesc);
          }

          li.appendChild(label);

          if (Object.keys(node.children).length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'ft-ul';
            buildDom(node.children, ul);
            li.appendChild(ul);
          }

          parentUl.appendChild(li);
        });
    };

    const rootUl = document.createElement('ul');
    rootUl.className = 'ft-ul root';
    buildDom(tree, rootUl);
    container.appendChild(rootUl);
  },

  showInfoModal(title, text) {
    this.elements.infoModalTitle.textContent = title;
    this.elements.infoModalBody.innerHTML = text.replace(/\n/g, '<br>');
    this.elements.infoModal.classList.remove('hidden');
  },

  extractFolderDescriptions(nodes, currentPath = []) {
    if (!Array.isArray(nodes)) return;

    nodes.forEach((node) => {
      if (node.tipo && node.tipo.toUpperCase() === 'FOLDER') {
        const folderName = node.nome || 'Sem Nome';
        const newPath = [...currentPath, folderName];
        const pathStr = newPath.join(' > ');

        if (node.descricao) {
          this.state.filters.folderDescriptions[pathStr] = node.descricao;
        }

        this.extractFolderDescriptions(node.conteudo, newPath);
      }
    });
  },

  // ===== Editar Sessão =====
  _editingSessionId: null,

  openEditSessionModal(sessionId, sessionTitle, quizTitle, description) {
    this._editingSessionId = sessionId;
    this.elements.editSessionTitle.value = sessionTitle || '';
    this.elements.editQuizTitle.value = quizTitle || '';
    this.elements.editQuizDescription.value = description || '';
    this.elements.editSessionModal.classList.remove('hidden');
  },

  async saveEditSession() {
    const sessionId = this._editingSessionId;
    if (!sessionId) return;

    const session = await loadSession(sessionId);
    if (!session) {
      alert('Sessão não encontrada.');
      return;
    }

    const newSessionTitle = this.elements.editSessionTitle.value.trim() || 'Quiz sem título';
    const newQuizTitle = this.elements.editQuizTitle.value.trim() || '';
    const newDescription = this.elements.editQuizDescription.value;

    session.title = newSessionTitle;
    if (session.state && session.state.quizJson) {
      if (newQuizTitle) session.state.quizJson.titulo = newQuizTitle;
      session.state.quizJson.descricao = newDescription;
    }
    session.updatedAt = new Date().toISOString();

    await saveSession(session);

    // Se a sessão editada é a ativa, atualiza os campos locais
    if (sessionId === this.activeSessionId) {
      this._sessionTitle = newSessionTitle;
      if (this.state.quizJson) {
        if (newQuizTitle) this.state.quizJson.titulo = newQuizTitle;
        this.state.quizJson.descricao = newDescription;
      }
    }

    this.elements.editSessionModal.classList.add('hidden');
    this._editingSessionId = null;
    this.markSyncPending();
    await this.renderSessionList();
  },

  // ===== Configurações Visuais =====
  getVisualSettings() {
    return {
      footerFixed: localStorage.getItem('vs_footerFixed') !== 'false',
      commentMode: localStorage.getItem('vs_commentMode') || 'all',
      persistManualOpen: localStorage.getItem('vs_persistManualOpen') === 'true',
      vfStacked: localStorage.getItem('vs_vfStacked') === 'true',
      showPartialScore: localStorage.getItem('vs_showPartialScore') !== 'false',
      fontSize: parseInt(localStorage.getItem('vs_fontSize')) || 16,
      darkMode: localStorage.getItem('vs_darkMode')
    };
  },

  initVisualSettings() {
    const vs = this.getVisualSettings();

    // Restaurar UI
    this.elements.chkFooterFixed.checked = vs.footerFixed;
    if (vs.commentMode === 'current') {
      this.elements.commentModeCurrent.checked = true;
      this.elements.commentSubOptions.classList.remove('hidden');
    } else {
      this.elements.commentModeAll.checked = true;
    }
    this.elements.chkPersistManualOpen.checked = vs.persistManualOpen;
    this.elements.chkVfStacked.checked = vs.vfStacked;
    if (this.elements.chkShowPartialScore) {
      this.elements.chkShowPartialScore.checked = vs.showPartialScore;
    }
    this.elements.rangeFontSize.value = vs.fontSize;
    this.elements.fontSizeValue.textContent = vs.fontSize + 'px';
    if (this.elements.chkShowDisregardCorrect) {
      this.elements.chkShowDisregardCorrect.checked =
        localStorage.getItem('gs_showDisregardCorrect') !== 'false';
    }

    // Dark mode: null = auto (segue o sistema), 'true'/'false' = manual
    const isDark = vs.darkMode === 'true' ||
      (vs.darkMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.elements.chkDarkMode.checked = isDark;

    // Aplicar footer, VF stacked, font size e dark mode
    this.applyFooterMode(vs.footerFixed);
    this.applyVfStacked(vs.vfStacked);
    this.applyFontSize(vs.fontSize);
    this.applyDarkMode(isDark);

    // Eventos
    this.elements.btnVisualSettings.addEventListener('click', () => {
      this.elements.visualSettingsPanel.classList.toggle('hidden');
    });

    if (this.elements.btnGeneralSettings && this.elements.generalSettingsPanel) {
      this.elements.btnGeneralSettings.addEventListener('click', () => {
        this.elements.generalSettingsPanel.classList.toggle('hidden');
      });
    }

    this.elements.chkFooterFixed.addEventListener('change', (e) => {
      localStorage.setItem('vs_footerFixed', e.target.checked);
      this.applyFooterMode(e.target.checked);
    });

    this.elements.commentModeAll.addEventListener('change', () => {
      localStorage.setItem('vs_commentMode', 'all');
      this.elements.commentSubOptions.classList.add('hidden');
      this.expandAllComments();
    });

    this.elements.commentModeCurrent.addEventListener('change', () => {
      localStorage.setItem('vs_commentMode', 'current');
      this.elements.commentSubOptions.classList.remove('hidden');
    });

    this.elements.chkPersistManualOpen.addEventListener('change', (e) => {
      localStorage.setItem('vs_persistManualOpen', e.target.checked);
    });

    this.elements.chkVfStacked.addEventListener('change', (e) => {
      localStorage.setItem('vs_vfStacked', e.target.checked);
      this.applyVfStacked(e.target.checked);
    });

    if (this.elements.chkShowPartialScore) {
      this.elements.chkShowPartialScore.addEventListener('change', (e) => {
        localStorage.setItem('vs_showPartialScore', e.target.checked ? 'true' : 'false');
        this.renderer.render(this.state);
        this.applyCommentCollapseMode();
      });
    }

    this.elements.chkDarkMode.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('vs_darkMode', enabled);
      this.applyDarkMode(enabled);
    });

    // Ouvir mudanças do tema do sistema (só aplica se o usuário nunca escolheu manualmente)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (localStorage.getItem('vs_darkMode') === null) {
        this.elements.chkDarkMode.checked = e.matches;
        this.applyDarkMode(e.matches);
      }
    });

    this.elements.rangeFontSize.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      localStorage.setItem('vs_fontSize', size);
      this.elements.fontSizeValue.textContent = size + 'px';
      this.applyFontSize(size);
    });

    // Eventos do modal de editar sessão
    this.elements.closeEditSession.addEventListener('click', () => {
      this.elements.editSessionModal.classList.add('hidden');
    });
    this.elements.btnEditCancel.addEventListener('click', () => {
      this.elements.editSessionModal.classList.add('hidden');
    });
    this.elements.btnEditSave.addEventListener('click', () => {
      this.saveEditSession();
    });
    this.elements.editSessionModal.addEventListener('click', (e) => {
      if (e.target === this.elements.editSessionModal) {
        this.elements.editSessionModal.classList.add('hidden');
      }
    });
  },

  applyFooterMode(fixed) {
    if (fixed) {
      this.elements.footerBar.classList.remove('footer-inline');
    } else {
      this.elements.footerBar.classList.add('footer-inline');
    }
  },

  applyVfStacked(stacked) {
    document.getElementById('quizContainer').classList.toggle('ch-vf-stacked', !!stacked);
  },

  applyDarkMode(enabled) {
    document.documentElement.classList.toggle('dark-mode', enabled);
    if (this.elements.darkModeIcon) {
      this.elements.darkModeIcon.textContent = enabled ? '☀️' : '🌙';
    }
  },

  applyFontSize(size) {
    document.body.style.fontSize = size + 'px';
  },

  // ===== Colapso de Comentários =====
  handleToggleComments(qIdx, isOpen) {
    if (isOpen) {
      this._manuallyOpenedComments.add(qIdx);
    } else {
      this._manuallyOpenedComments.delete(qIdx);
    }
  },

  applyCommentCollapseMode() {
    const vs = this.getVisualSettings();
    if (vs.commentMode === 'all') {
      this.expandAllComments();
      return;
    }
    // Modo "current": encontrar a última questão respondida
    this.collapseAllExceptLast();
  },

  applyCommentCollapseModeAfterSubmit(justSubmittedIdx) {
    const vs = this.getVisualSettings();
    if (vs.commentMode !== 'current') return;

    const cards = document.querySelectorAll('.question-card.submitted');
    cards.forEach(card => {
      const idx = parseInt(card.dataset.originalIdx, 10);
      if (idx === justSubmittedIdx) {
        // A questão recém-respondida fica aberta
        card.classList.remove('comments-collapsed');
        this.updateToggleButton(card, false);
      } else {
        // Se persistir abertos manualmente está ativo
        if (vs.persistManualOpen && this._manuallyOpenedComments.has(idx)) {
          return;
        }
        card.classList.add('comments-collapsed');
        this.updateToggleButton(card, true);
      }
    });
  },

  collapseAllExceptLast() {
    const vs = this.getVisualSettings();
    const cards = document.querySelectorAll('.question-card.submitted');
    if (cards.length === 0) return;

    // Encontrar a última questão respondida na ordem visual
    let lastSubmittedCard = null;
    const qOrder = this.state.mappings.qOrder;
    for (let i = qOrder.length - 1; i >= 0; i--) {
      const idx = qOrder[i];
      const ans = this.state.userAnswers[idx];
      if (ans && ans.submitted && !this.state.forcedIndices.includes(idx)) {
        lastSubmittedCard = document.querySelector(`.question-card[data-original-idx="${idx}"]`);
        if (lastSubmittedCard) break;
      }
    }

    cards.forEach(card => {
      const idx = parseInt(card.dataset.originalIdx, 10);
      if (card === lastSubmittedCard) {
        card.classList.remove('comments-collapsed');
        this.updateToggleButton(card, false);
      } else {
        if (vs.persistManualOpen && this._manuallyOpenedComments.has(idx)) {
          return;
        }
        card.classList.add('comments-collapsed');
        this.updateToggleButton(card, true);
      }
    });
  },

  expandAllComments() {
    document.querySelectorAll('.question-card.submitted.comments-collapsed').forEach(card => {
      card.classList.remove('comments-collapsed');
      this.updateToggleButton(card, false);
    });
  },

  collapseAllComments() {
    document.querySelectorAll('.question-card.submitted').forEach(card => {
      card.classList.add('comments-collapsed');
      this.updateToggleButton(card, true);
    });
  },

  getCollapsedCommentIndices() {
    const collapsed = new Set();
    document.querySelectorAll('.question-card.submitted.comments-collapsed').forEach(card => {
      const idx = parseInt(card.dataset.originalIdx, 10);
      if (!Number.isNaN(idx)) collapsed.add(idx);
    });
    return collapsed;
  },

  restoreCollapsedCommentIndices(collapsed) {
    if (!collapsed || collapsed.size === 0) return;
    collapsed.forEach((idx) => {
      const card = document.querySelector(`.question-card[data-original-idx="${idx}"]`);
      if (!card || !card.classList.contains('submitted')) return;
      card.classList.add('comments-collapsed');
      this.updateToggleButton(card, true);
    });
  },

  toggleAllComments() {
    const anyVisible = document.querySelector('.question-card.submitted:not(.comments-collapsed) .general-comment, .question-card.submitted:not(.comments-collapsed) .specific-comment');
    if (anyVisible) {
      this.collapseAllComments();
    } else {
      this.expandAllComments();
    }
  },

  updateToggleButton(card, collapsed) {
    card.querySelectorAll('.btn-toggle-comments').forEach((btn) => {
      if (btn.classList.contains('btn-toggle-comments-end')) {
        btn.textContent = '📕 Ocultar comentários';
      } else {
        btn.textContent = collapsed ? '📖 Exibir comentários' : '📕 Ocultar comentários';
      }
    });
    if (this.renderer && this.renderer.refreshCommentToggleVisibility) {
      requestAnimationFrame(() => this.renderer.refreshCommentToggleVisibility(card));
    }
  },

  // ===== Atalho Ctrl+B e toque triplo com 3 dedos =====
  setupCommentShortcuts() {
    // Ctrl+B
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        this.toggleAllComments();
      }
    });

    // Triple tap com 3 dedos simultâneos
    let tripleTapCount = 0;
    let tripleTapTimer = null;

    document.addEventListener('touchstart', (e) => {
      if (e.touches.length === 3) {
        tripleTapCount++;
        clearTimeout(tripleTapTimer);
        tripleTapTimer = setTimeout(() => {
          tripleTapCount = 0;
        }, 800);

        if (tripleTapCount >= 3) {
          e.preventDefault();
          tripleTapCount = 0;
          clearTimeout(tripleTapTimer);
          this.toggleAllComments();
        }
      } else {
        tripleTapCount = 0;
        clearTimeout(tripleTapTimer);
      }
    }, { passive: false });
  },

  // ===== Botão Próxima Não Respondida =====
  setupNextUnansweredButton() {
    const btn = this.elements.btnNextUnanswered;
    let scrollTimeout = null;

    window.addEventListener('scroll', () => {
      if (!this.state.mappings.qOrder || this.state.mappings.qOrder.length === 0) return;

      const hasUnanswered = this.state.mappings.qOrder.some(idx => {
        if (this.state.forcedIndices.includes(idx)) return false;
        const ans = this.state.userAnswers[idx];
        return !ans || !ans.submitted;
      });

      if (!hasUnanswered) {
        btn.classList.remove('visible');
        btn.classList.add('hidden');
        return;
      }

      btn.classList.remove('hidden');
      btn.classList.add('visible');

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        btn.classList.remove('visible');
        setTimeout(() => {
          if (!btn.classList.contains('visible')) {
            btn.classList.add('hidden');
          }
        }, 300);
      }, 3000);
    });

    btn.addEventListener('click', () => {
      this.scrollToNextUnanswered();
    });
  },

  // ===== Sistema de Pastas de Sessões =====

  initFolderSystem() {
    // Toggle entre visão de pastas e lista plana
    this.elements.btnToggleFolderView.addEventListener('click', () => {
      this._folderViewActive = !this._folderViewActive;
      localStorage.setItem('folderViewActive', this._folderViewActive ? 'true' : 'false');
      this.renderSessionList();
    });

    // Restaurar preferência de visão
    const savedView = localStorage.getItem('folderViewActive');
    if (savedView !== null) {
      this._folderViewActive = savedView !== 'false';
    }

    // Criar nova pasta
    this.elements.btnNewFolder.addEventListener('click', () => {
      this.openCreateFolderModal();
    });

    // Modal de nome de pasta
    this.elements.closeFolderName.addEventListener('click', () => {
      this.elements.folderNameModal.classList.add('hidden');
    });
    this.elements.btnFolderNameCancel.addEventListener('click', () => {
      this.elements.folderNameModal.classList.add('hidden');
    });
    this.elements.btnFolderNameSave.addEventListener('click', () => {
      this._saveFolderChanges();
    });
    this.elements.folderNameModal.addEventListener('click', (e) => {
      if (e.target === this.elements.folderNameModal) {
        this.elements.folderNameModal.classList.add('hidden');
      }
    });

    // Modal de mover sessão
    this.elements.closeMoveSession.addEventListener('click', () => {
      this.elements.moveSessionModal.classList.add('hidden');
    });
    this.elements.btnMoveCancel.addEventListener('click', () => {
      this.elements.moveSessionModal.classList.add('hidden');
    });
    this.elements.btnMoveConfirm.addEventListener('click', () => {
      this.moveSessionToFolder();
    });
    this.elements.moveSessionModal.addEventListener('click', (e) => {
      if (e.target === this.elements.moveSessionModal) {
        this.elements.moveSessionModal.classList.add('hidden');
      }
    });
  },

  openCreateFolderModal() {
    this._editingFolderId = null;
    this.elements.folderNameModalTitle.textContent = 'Nova Pasta';
    this.elements.folderNameInput.value = '';
    this.elements.folderDescInput.value = '';
    this.elements.folderParentField.classList.remove('hidden');

    // Popular select de pasta pai
    this._populateFolderSelect(this.elements.folderParentSelect, this._currentViewFolderId || '', null);

    this.elements.folderNameModal.classList.remove('hidden');
    this.elements.folderNameInput.focus();
  },

  openEditFolderModal(folder) {
    this._editingFolderId = folder.folderId;
    this.elements.folderNameModalTitle.textContent = 'Editar Pasta';
    this.elements.folderNameInput.value = folder.name;
    this.elements.folderDescInput.value = folder.description || '';
    this.elements.folderParentField.classList.remove('hidden');

    // Popular select de pasta pai, excluindo a própria pasta e seus descendentes
    const excludeIds = this._getDescendantFolderIds(folder.folderId);
    this._populateFolderSelect(this.elements.folderParentSelect, folder.parentId || '', excludeIds);

    this.elements.folderNameModal.classList.remove('hidden');
    this.elements.folderNameInput.focus();
  },

  _populateFolderSelect(selectEl, selectedValue, excludeIds) {
    selectEl.innerHTML = '';

    const rootOpt = document.createElement('option');
    rootOpt.value = '';
    rootOpt.textContent = '🏠 Raiz';
    selectEl.appendChild(rootOpt);

    const addOptions = (parentId, depth) => {
      const children = this._sessionFolders
        .filter(f => (f.parentId || '') === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
      children.forEach(f => {
        if (excludeIds && excludeIds.includes(f.folderId)) return;
        const opt = document.createElement('option');
        opt.value = f.folderId;
        opt.textContent = '  '.repeat(depth) + '📁 ' + f.name;
        selectEl.appendChild(opt);
        addOptions(f.folderId, depth + 1);
      });
    };

    addOptions('', 1);

    selectEl.value = selectedValue || '';
  },

  async _saveFolderChanges() {
    const name = this.elements.folderNameInput.value.trim();
    if (!name) {
      alert('O nome da pasta não pode estar vazio.');
      return;
    }

    const parentId = this.elements.folderParentSelect.value || '';
    const description = this.elements.folderDescInput.value.trim();
    const now = new Date().toISOString();

    if (this._editingFolderId) {
      // Editar pasta existente
      const folder = this._sessionFolders.find(f => f.folderId === this._editingFolderId);
      if (folder) {
        folder.name = name;
        folder.parentId = parentId;
        folder.description = description;
        folder.updatedAt = now;
      }
    } else {
      // Criar nova pasta
      const newFolder = {
        folderId: generateId(),
        name,
        parentId,
        description,
        createdAt: now,
        updatedAt: now
      };
      this._sessionFolders.push(newFolder);
    }

    await this._saveFolders();
    this.elements.folderNameModal.classList.add('hidden');
    this._editingFolderId = null;
    await this.renderSessionList();
  },

  async _saveFolders() {
    await saveSessionFolders(this._sessionFolders);
    this.markSyncPending();
  },

  openMoveSessionModal(sessionId, title, currentFolderId) {
    this._movingSessionId = sessionId;
    this.elements.moveSessionInfo.textContent = `Mover "${title}" para:`;

    // Popular select com todas as pastas
    this._populateFolderSelect(this.elements.moveFolderSelect, currentFolderId || '', null);

    this.elements.moveSessionModal.classList.remove('hidden');
  },

  async moveSessionToFolder() {
    if (!this._movingSessionId) return;

    const newFolderId = this.elements.moveFolderSelect.value || '';
    await updateSessionFolder(this._movingSessionId, newFolderId);

    // Se a sessão movida é a ativa, atualiza o campo local
    if (this._movingSessionId === this.activeSessionId) {
      this._sessionFolderId = newFolderId;
    }

    this.markSyncPending();
    this.elements.moveSessionModal.classList.add('hidden');
    this._movingSessionId = null;
    await this.renderSessionList();
  },

  async deleteFolderWithConfirm(folder, sessions) {
    const descendantIds = this._getDescendantFolderIds(folder.folderId);
    const affectedSessions = sessions.filter(s => descendantIds.includes(s.folderId || ''));
    const childFolders = this._sessionFolders.filter(f => descendantIds.includes(f.folderId) && f.folderId !== folder.folderId);

    let msg = `Deletar a pasta "${folder.name}"?`;
    if (childFolders.length > 0) {
      msg += `\n\nInclui ${childFolders.length} subpasta(s).`;
    }

    if (affectedSessions.length > 0) {
      msg += `\n\nExistem ${affectedSessions.length} sessão(ões) nesta pasta e subpastas.`;
      msg += `\n\nClique OK para escolher o que fazer com as sessões.`;
    } else {
      msg += `\n\nA pasta está vazia de sessões.`;
    }

    if (!confirm(msg)) return;

    if (affectedSessions.length > 0) {
      const moveToParent = confirm(
        `O que fazer com as ${affectedSessions.length} sessão(ões)?\n\n` +
        `OK = Mover sessões para a pasta pai ("${folder.parentId ? this._sessionFolders.find(f => f.folderId === folder.parentId)?.name || 'Raiz' : 'Raiz'}")\n` +
        `Cancelar = Deletar as sessões permanentemente`
      );

      if (moveToParent) {
        // Mover sessões para a pasta pai
        for (const s of affectedSessions) {
          await updateSessionFolder(s.sessionId, folder.parentId || '');
          if (s.sessionId === this.activeSessionId) {
            this._sessionFolderId = folder.parentId || '';
          }
        }
      } else {
        // Confirmação dupla antes de deletar
        if (!confirm(`⚠️ ATENÇÃO: Tem certeza que deseja DELETAR permanentemente ${affectedSessions.length} sessão(ões)? Esta ação NÃO pode ser desfeita!`)) {
          return;
        }
        for (const s of affectedSessions) {
          await deleteSession(s.sessionId);
          await this._markSessionDeleted(s.sessionId);
          if (s.sessionId === this.activeSessionId) {
            this._clearActiveSessionUI();
          }
        }
      }
    }

    // Remover a pasta e todas as subpastas
    this._sessionFolders = this._sessionFolders.filter(f => !descendantIds.includes(f.folderId));

    // Se estávamos navegando dentro da pasta deletada, voltar ao pai
    if (descendantIds.includes(this._currentViewFolderId)) {
      this._currentViewFolderId = folder.parentId || null;
    }

    await this._saveFolders();
    await this.renderSessionList();
  },

  scrollToNextUnanswered() {
    const scrollY = window.scrollY + window.innerHeight / 3;
    const qOrder = this.state.mappings.qOrder;
    let targetCard = null;

    // Procurar a próxima não respondida a partir da posição do scroll
    for (const idx of qOrder) {
      if (this.state.forcedIndices.includes(idx)) continue;
      const ans = this.state.userAnswers[idx];
      if (ans && ans.submitted) continue;

      const card = document.querySelector(`.question-card[data-original-idx="${idx}"]`);
      if (card && card.getBoundingClientRect().top + window.scrollY > scrollY) {
        targetCard = card;
        break;
      }
    }

    // Se não achou à frente, voltar ao início (cíclico)
    if (!targetCard) {
      for (const idx of qOrder) {
        if (this.state.forcedIndices.includes(idx)) continue;
        const ans = this.state.userAnswers[idx];
        if (ans && ans.submitted) continue;

        const card = document.querySelector(`.question-card[data-original-idx="${idx}"]`);
        if (card) {
          targetCard = card;
          break;
        }
      }
    }

    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      // Flash visual para indicar a questão
      targetCard.style.transition = 'box-shadow 0.3s';
      targetCard.style.boxShadow = '0 0 0 3px var(--primary)';
      setTimeout(() => {
        targetCard.style.boxShadow = '';
      }, 1500);
    }
  }
};

App.init();
