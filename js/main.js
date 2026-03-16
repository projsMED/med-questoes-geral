/* ===== JS: js\main.js ===== */
import { saveState, loadState, clearState, exportState, importState } from './store.js';
import { parseContent } from './parser.js';
import { shuffleArray, difficultyMap } from './utils.js';
import { QuizRenderer } from './renderer.js';

const App = {
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
    closeInfo: document.querySelector('.close-info')
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

    const saved = await loadState();
    if (saved && saved.quizJson) {
      this.state = saved;
      this.ensureStateIntegrity();
      this.restoreUI();

      if (this.state.mappings.qOrder && this.state.mappings.qOrder.length > 0) {
        // Se estava em retry mode, garante integridade dos mappings
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
        'Deseja carregar outro arquivo? O progresso atual será perdido.'
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

    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  },

  async exportBackup() {
    const blob = await exportState();
    if (!blob) {
      alert('Nenhum dado para exportar.');
      return;
    }
    const title = (this.state.quizJson && this.state.quizJson.titulo) || '';
    const fileName = title ? `Backup - ${title}.json` : 'Backup.json';
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
        if (!data.quizJson) {
          alert('Arquivo de backup inválido: não contém dados de quiz.');
          return;
        }
        if (!confirm('Importar este backup? O progresso atual será substituído.')) return;
        await importState(data);
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

  save() {
    saveState(this.state);
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
    if (!confirm(`Carregar quiz: ${path}? O progresso atual será perdido.`))
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