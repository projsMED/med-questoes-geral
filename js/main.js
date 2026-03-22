/* ===== JS: js\main.js ===== */
import {
  saveState, loadState, clearState, exportState, importState,
  saveSession, loadSession, deleteSession, getAllSessions,
  exportAllSessions, importAllSessions, migrateLegacyState, generateId
} from './store.js';
import { parseContent } from './parser.js';
import { shuffleArray, difficultyMap } from './utils.js';
import { QuizRenderer } from './renderer.js';

const App = {
  activeSessionId: null,

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
      showFilterSummary: true
    },
    filters: {
      tags: [],
      diffs: [],
      folders: [],
      allTags: [],
      allDiffs: [],
      allFolders: [],
      counts: { tags: {}, diffs: {}, folders: {} },
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
    diffList: document.getElementById('diffList'),

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
    importSessionsInput: document.getElementById('importSessionsInput')
  },

  renderer: null,

  async init() {
    this.renderer = new QuizRenderer('quizContainer', 'footerBar', {
      onSelect: (qIdx, altIdx, isCheckbox, checked) =>
        this.handleSelection(qIdx, altIdx, isCheckbox, checked),
      onSubmit: (qIdx) => this.submitQuestion(qIdx),
      onEliminate: (qIdx, altIdx) => this.handleElimination(qIdx, altIdx),
      // Callback do botão "Repetir apenas questões que errou"
      onRetry: () => this.retryIncorrect()
    });

    this.bindEvents();
    this.setupImageZoom();

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
        this.state = session.state;
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
        // Atualiza lastAccessedAt
        this.save();
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
      this.firebaseConfig = await import('./firebase-config.js');
      this.firebaseSync = await import('./firebase-sync.js');

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
  },

  ensureStateIntegrity() {
    if (!this.state.filters) {
      this.state.filters = {
        tags: [],
        diffs: [],
        folders: [],
        allTags: [],
        allDiffs: [],
        allFolders: [],
        counts: { tags: {}, diffs: {}, folders: {} },
        folderDescriptions: {},
        step: 1
      };
    }

    if (!this.state.filters.counts) {
      this.state.filters.counts = { tags: {}, diffs: {}, folders: {} };
    }

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
  },

  // === UPLOAD LOCAL (que você tinha apagado) ===
  handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        this.loadQuizJSON(json);
      } catch (err) {
        alert('Erro no JSON: ' + err.message);
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  },

  loadQuizJSON(json) {
    this.state.quizJson = json;
    this.state.config.shuffleQ = this.elements.chkShuffleQ.checked;
    this.state.config.shuffleA = this.elements.chkShuffleA.checked;
    this.state.config.showTags = this.elements.chkShowTags.checked;
    this.state.config.showDiff = this.elements.chkShowDiff.checked;
    this.state.config.showFilterSummary = this.elements.chkShowFilterSummary.checked;

    this.state.filters = {
      tags: [],
      diffs: [],
      folders: [],
      allTags: [],
      allDiffs: [],
      allFolders: [],
      counts: { tags: {}, diffs: {}, folders: {} },
      folderDescriptions: {},
      step: 1
    };
    this.state.forcedIndices = [];
    this.state.eliminatedAlts = {};
    this.state.mappings = { qOrder: [], altOrder: {} };

    // Reset Retry
    this.state.retryMode = false;
    this.state.retryIndices = [];

    this.state.questions = parseContent(this.state.quizJson.conteudo);
    this.state.userAnswers = {};

    // Criar nova sessão
    this.activeSessionId = generateId();
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

  // --- Lógica de checagem de acerto e pontuação (ME / VF / CH) ---
  /**
   * Retorna { hits, total } para a questão originalQIdx.
   * - ME / VF: total = 1, hits = 1 ou 0
   * - CH: total = número de assertivas exibidas, hits = quantas foram julgadas corretamente
   */
  computeQuestionScore(originalQIdx) {
    const qData = this.state.questions[originalQIdx];
    const ans = this.state.userAnswers[originalQIdx];
    if (!ans || !ans.submitted) return { hits: 0, total: 0 };

    const tipo = (qData.tipo || '').toUpperCase();

    if (tipo === 'CH') {
      const assertivas = Array.isArray(qData.assertivas) ? qData.assertivas : [];
      const total = assertivas.length;
      if (total === 0) return { hits: 0, total: 0 };

      const selected = Array.isArray(ans.selectedOriginalIdxs)
        ? ans.selectedOriginalIdxs
        : [];

      let hits = 0;
      assertivas.forEach((ass, idx) => {
        const shouldCheck = !!ass.is_correct;
        const isChecked = selected.includes(idx);
        if (shouldCheck === isChecked) hits++;
      });

      return { hits, total };
    }

    // ME / VF – um único gabarito por letra
    const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
    if (!gabaritoLetra) return { hits: 0, total: 0 };
    const gabaritoIdx = gabaritoLetra.charCodeAt(0) - 65;
    const isCorrect = ans.selectedOriginalIdx === gabaritoIdx;
    return { hits: isCorrect ? 1 : 0, total: 1 };
  },

// --- NOVA LÓGICA DE RETRY ---
  retryIncorrect() {
    const wrongIndices = [];

    this.state.mappings.qOrder.forEach((idx) => {
      if (this.state.forcedIndices.includes(idx)) return;

      const ans = this.state.userAnswers[idx];
      const { hits, total } = this.computeQuestionScore(idx);

      // Considera "errada" para retry se não tiver pontuação máxima
      if (!ans || !ans.submitted || total === 0 || hits < total) {
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

    this.state.retryMode = true;
    this.state.retryIndices = wrongIndices;

    this.state.userAnswers = {};
    this.state.eliminatedAlts = {};

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
      // Modo normal: aplica filtros de pasta / tag / dificuldade
      const selTags = new Set(this.state.filters.tags);
      const selDiffs = new Set(this.state.filters.diffs);
      const selFolders = new Set(this.state.filters.folders);

      this.state.questions.forEach((q, idx) => {
        const qPathStr = q._path.join(' > ');
        if (!selFolders.has(qPathStr)) return;

        let hasTag = false;
        if (q.tags && q.tags.length > 0) {
          hasTag = q.tags.some((t) => selTags.has(t));
        } else {
          hasTag = selTags.has('__NO_TAG__');
        }

        let hasDiff = false;
        const qDiff =
          q.dificuldade !== undefined && q.dificuldade !== null
            ? q.dificuldade
            : '__NO_DIFF__';
        hasDiff = selDiffs.has(qDiff);

        if (hasTag && hasDiff) {
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

    this.state.questions.forEach((q, idx) => {
      if (processedIndices.has(idx)) return;

      // No modo normal, respeita filtro de pasta aqui também
      if (!this.state.retryMode) {
        const qPathStr = q._path.join(' > ');
        const selFolders = new Set(this.state.filters.folders);
        if (!selFolders.has(qPathStr)) return;
      }

      if (q._groupData) {
        const groupId = q._groupData.id;
        if (this.state.retryMode || activeGroupIds.has(groupId)) {
          const groupIndices = [];

          this.state.questions.forEach((innerQ, innerIdx) => {
            if (innerQ._groupData && innerQ._groupData.id === groupId) {
              let allowedByFolder = true;
              if (!this.state.retryMode) {
                allowedByFolder = new Set(this.state.filters.folders).has(
                  innerQ._path.join(' > ')
                );
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

  deleteCurrentQuiz() {
    if (
      !confirm(
        'Tem certeza? Isso apagará o quiz atual e voltará para a tela inicial.'
      )
    )
      return;

    // Deletar sessão do IndexedDB
    if (this.activeSessionId) {
      deleteSession(this.activeSessionId);
    }
    this.activeSessionId = null;
    localStorage.removeItem('activeSessionId');

    this.state.quizJson = null;
    this.state.questions = [];
    this.state.mappings = { qOrder: [], altOrder: {} };
    this.state.userAnswers = {};
    this.state.filters = {
      tags: [],
      diffs: [],
      folders: [],
      allTags: [],
      allDiffs: [],
      allFolders: [],
      counts: { tags: {}, diffs: {}, folders: {} },
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
        diffs: [],
        allTags: [],
        allDiffs: [],
        counts: { tags: {}, diffs: {}, folders: {} }
      };
    }

    this.state.filters.counts = { tags: {}, diffs: {}, folders: {} };

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
    });

    this.state.filters.allTags = Array.from(tagsSet).sort();
    this.state.filters.allDiffs = Array.from(diffsSet).sort();

    if (!this.state.filters.tags || this.state.filters.tags.length === 0) {
      this.state.filters.tags = [...this.state.filters.allTags];
      this.state.filters.diffs = [...this.state.filters.allDiffs];
    }
  },

  renderFilterUI() {
    const createCheckbox = (
      value,
      labelBase,
      container,
      selectedList,
      countDict
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
        if (chk.checked) {
          selectedList.push(value);
        } else {
          const idx = selectedList.indexOf(value);
          if (idx > -1) selectedList.splice(idx, 1);
        }
        this.updateGenerateButton();
        this.save();
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
        this.state.filters.counts.tags
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

    this.updateGenerateButton();
  },

  updateGenerateButton() {
    if (!this.state.filters || !this.state.filters.allTags) return;

    const allTagsSel =
      this.state.filters.tags.length === this.state.filters.allTags.length;
    const allDiffsSel =
      this.state.filters.diffs.length === this.state.filters.allDiffs.length;

    this.elements.btnGenerate.textContent =
      !allTagsSel || !allDiffsSel ? 'Gerar quiz filtrado' : 'Gerar quiz';
  },

  generateAndRender() {
    this.generateMappings();
    this.showQuizInterface();
    this.renderer.render(this.state);
    this.save();
  },

  showQuizInterface() {
    this.elements.uploadSection.classList.add('hidden');
    this.elements.filterSection.classList.add('hidden');
    this.elements.configBar.classList.remove('hidden');
    this.elements.footerBar.classList.remove('hidden');
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
      if (!Array.isArray(ans.selectedOriginalIdxs)) {
        ans.selectedOriginalIdxs = [];
      }
      const arr = ans.selectedOriginalIdxs;
      const pos = arr.indexOf(originalAltIdx);

      if (checked) {
        if (pos === -1) arr.push(originalAltIdx);
      } else if (pos > -1) {
        arr.splice(pos, 1);
      }
    } else {
      // ME / VF – uma única alternativa
      ans.selectedOriginalIdx = originalAltIdx;
    }

    const card = document.querySelector(
      `.question-card[data-original-idx="${originalQIdx}"]`
    );
    if (card) {
      if (tipo === 'CH') {
        const selectedArr = Array.isArray(ans.selectedOriginalIdxs)
          ? ans.selectedOriginalIdxs
          : [];
        card.querySelectorAll('.alt-label').forEach((label) => {
          const input = label.querySelector('input');
          if (!input) return;
          const val = parseInt(input.value, 10);
          if (selectedArr.includes(val)) {
            label.classList.add('selected');
          } else {
            label.classList.remove('selected');
          }
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
        if (tipo === 'CH') {
          // CH: permite responder mesmo sem marcar nada
          btn.disabled = false;
        } else {
          btn.disabled = ans.selectedOriginalIdx === undefined;
        }
      }
    }

    this.save();
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

    this.save();

    const visualIdx = this.state.mappings.qOrder.indexOf(originalQIdx);
    const card = document.querySelector(
      `.question-card[data-original-idx="${originalQIdx}"]`
    );

    if (card) {
      const newCard = this.renderer.createQuestionCard(
        this.state.questions[originalQIdx],
        originalQIdx,
        visualIdx,
        this.state
      );
      card.replaceWith(newCard);
    }
  },

  submitQuestion(originalQIdx) {
    if (this.state.forcedIndices.includes(originalQIdx)) return;

    if (!this.state.userAnswers[originalQIdx]) {
      this.state.userAnswers[originalQIdx] = {};
    }

    this.state.userAnswers[originalQIdx].submitted = true;
    this.save();

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
  },

  submitAll() {
    if (!confirm('Tem certeza que deseja entregar todas as questões?')) return;

    this.state.mappings.qOrder.forEach((idx) => {
      if (this.state.forcedIndices.includes(idx)) return;

      if (!this.state.userAnswers[idx]) {
        this.state.userAnswers[idx] = {
          submitted: true
        };
      } else {
        this.state.userAnswers[idx].submitted = true;
      }
    });

    this.save();
    this.renderer.render(this.state);

    // Sync imediato após submeter todas (ação importante)
    if (this.firebaseState.autoSync && this.firebaseState.connected) {
      clearTimeout(this.firebaseState.debounceTimer);
      this.syncNow();
    }

    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
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
    const totalCount = Array.isArray(this.state.questions) ? this.state.questions.length : 0;

    const exportData = {
      sessionId: this.activeSessionId || generateId(),
      title: title || 'Quiz sem título',
      createdAt: this._sessionCreatedAt || now,
      lastAccessedAt: now,
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
          sessionId: data.sessionId || generateId(),
          title: data.title || (state.quizJson && state.quizJson.titulo) || 'Quiz sem título',
          createdAt: data.createdAt || now,
          lastAccessedAt: now,
          answeredCount: data.answeredCount || 0,
          totalCount: data.totalCount || (Array.isArray(state.questions) ? state.questions.length : 0),
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
  },

  getAnsweredCount() {
    if (!this.state.userAnswers) return 0;
    return Object.values(this.state.userAnswers).filter(a => a && a.submitted).length;
  },

  save() {
    if (this.activeSessionId) {
      const now = new Date().toISOString();
      const title = (this.state.quizJson && this.state.quizJson.titulo) || 'Quiz sem título';
      const answeredCount = this.getAnsweredCount();
      const totalCount = Array.isArray(this.state.questions) ? this.state.questions.length : 0;

      // Preservar createdAt original
      if (!this._sessionCreatedAt) {
        this._sessionCreatedAt = now;
      }

      const session = {
        sessionId: this.activeSessionId,
        title,
        createdAt: this._sessionCreatedAt,
        lastAccessedAt: now,
        answeredCount,
        totalCount,
        state: this.state
      };
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
      // 1. Processar deletes pendentes
      const pendingDeletes = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
      for (const id of pendingDeletes) {
        await this.firebaseSync.deleteRemoteSession(id);
      }
      localStorage.removeItem('pendingDeletes');

      // 2. Obter listas local e remota
      const localSessions = await getAllSessions();
      const remoteSessions = await this.firebaseSync.getRemoteSessionList();

      const localMap = new Map(localSessions.map(s => [s.sessionId, s]));
      const remoteMap = new Map(remoteSessions.map(s => [s.sessionId, s]));

      // 3. Comparar e decidir upload/download
      const toUpload = [];
      const toDownload = [];

      for (const [id, local] of localMap) {
        const remote = remoteMap.get(id);
        if (!remote) {
          toUpload.push(id);
        } else if ((local.lastAccessedAt || '') > (remote.lastAccessedAt || '')) {
          toUpload.push(id);
        } else if ((remote.lastAccessedAt || '') > (local.lastAccessedAt || '')) {
          toDownload.push(id);
        }
      }

      for (const [id] of remoteMap) {
        if (!localMap.has(id)) {
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
    await this.renderSessionList();
  },

  async renderSessionList() {
    const container = this.elements.sessionListContainer;
    container.innerHTML = '<p style="text-align:center;color:#999;">Carregando...</p>';

    const sessions = await getAllSessions();
    if (sessions.length === 0) {
      container.innerHTML = '<p class="session-list-empty">Nenhuma sessão salva.</p>';
      return;
    }

    // Ordenação
    const sortValue = this.elements.sessionSortBy.value;
    const [sortField, sortDir] = sortValue.split('-');
    sessions.sort((a, b) => {
      const va = a[sortField] || '';
      const vb = b[sortField] || '';
      return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
    });

    container.innerHTML = '';

    sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'session-item';
      const isActive = s.sessionId === this.activeSessionId;

      if (isActive) {
        item.style.borderColor = '#007bff';
        item.style.borderWidth = '2px';
      }

      const formatDate = (iso) => {
        if (!iso) return '—';
        try {
          return new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
        } catch { return iso; }
      };

      const formatSize = (bytes) => {
        if (!bytes || bytes === 0) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      };

      item.innerHTML = `
        <div class="session-item-info">
          <div class="session-item-title">${this.escapeHtml(s.title)}${isActive ? ' (ativa)' : ''}</div>
          <div class="session-item-meta">
            <span>Criada: ${formatDate(s.createdAt)}</span>
            <span>Último acesso: ${formatDate(s.lastAccessedAt)}</span>
            <span class="session-progress-badge">Respondidas: ${s.answeredCount || 0}/${s.totalCount || 0}</span>
            <span class="session-size">${formatSize(s.sizeBytes)}</span>
          </div>
        </div>
        <div class="session-item-actions">
          <button class="session-btn btn-session-export" title="Exportar esta sessão">💾</button>
          <button class="session-btn btn-session-delete" title="Deletar esta sessão">🗑️</button>
        </div>
      `;

      // Clique no item → carregar sessão
      item.querySelector('.session-item-info').addEventListener('click', () => {
        this.loadSessionFromList(s.sessionId);
      });

      // Exportar sessão individual
      item.querySelector('.btn-session-export').addEventListener('click', (e) => {
        e.stopPropagation();
        this.exportSingleSession(s.sessionId);
      });

      // Deletar sessão
      item.querySelector('.btn-session-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSessionFromList(s.sessionId, s.title);
      });

      container.appendChild(item);
    });
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

    // Deletar do Firebase (ou marcar para deletar depois)
    if (this.firebaseSync && this.firebaseState.connected) {
      try { await this.firebaseSync.deleteRemoteSession(sessionId); } catch (e) { console.warn('Erro ao deletar remoto:', e); }
    } else if (this.firebaseConfig) {
      const pending = JSON.parse(localStorage.getItem('pendingDeletes') || '[]');
      pending.push(sessionId);
      localStorage.setItem('pendingDeletes', JSON.stringify(pending));
    }

    // Se era a sessão ativa, limpa tudo
    if (sessionId === this.activeSessionId) {
      this.activeSessionId = null;
      localStorage.removeItem('activeSessionId');
      this.state.quizJson = null;
      this.state.questions = [];
      this.state.mappings = { qOrder: [], altOrder: {} };
      this.state.userAnswers = {};
      this.state.retryMode = false;
      this.state.retryIndices = [];
      this.renderer.container.innerHTML = '';
      this.elements.configBar.classList.add('hidden');
      this.elements.footerBar.classList.add('hidden');
      this.elements.filterSection.classList.add('hidden');
      this.elements.uploadSection.classList.remove('hidden');
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

        if (!confirm(`Importar ${valid.length} sessão(ões)? Sessões com IDs iguais serão substituídas.`)) return;

        await importAllSessions(valid);
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
      this.loadQuizJSON(json);
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
    });

    this.state.filters.allTags = Array.from(tagsSet).sort();
    this.state.filters.allDiffs = Array.from(diffsSet).sort();

    this.state.filters.tags = this.state.filters.tags.filter((t) =>
      tagsSet.has(t)
    );
    this.state.filters.diffs = this.state.filters.diffs.filter((d) =>
      diffsSet.has(d)
    );

    if (
      this.state.filters.tags.length === 0 &&
      this.state.filters.allTags.length > 0
    ) {
      this.state.filters.tags = [...this.state.filters.allTags];
    }

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
  }
};

App.init();