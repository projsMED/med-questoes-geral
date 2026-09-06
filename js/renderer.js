/* ===== JS: js\renderer.js ===== */
import {
  formatText,
  difficultyMap,
  questionTypeMap,
  parseMeChGabarito,
  computeMeChScore,
  parseMqGabarito,
  computeMqScore
} from './utils.js?v=20260906-8';

const HIGHLIGHT_COLORS = [
  { key: 'yellow', label: 'Amarelo' },
  { key: 'orange', label: 'Laranja' },
  { key: 'red', label: 'Vermelho' },
  { key: 'pink', label: 'Rosa' },
  { key: 'purple', label: 'Roxo' },
  { key: 'violet', label: 'Violeta' },
  { key: 'blue', label: 'Azul' },
  { key: 'cyan', label: 'Ciano' },
  { key: 'green', label: 'Verde' },
  { key: 'lime', label: 'Lima' },
  { key: 'brown', label: 'Marrom' },
  { key: 'gray', label: 'Cinza' }
];

const HIGHLIGHT_COLOR_KEYS = new Set(HIGHLIGHT_COLORS.map((item) => item.key));

export class QuizRenderer {
  constructor(containerId, footerId, callbacks) {
    this.container = document.getElementById(containerId);
    this.btnSubmitAll = document.getElementById('btnSubmitAll');
    this.scoreDisplay = document.getElementById('scoreDisplay');
    this.callbacks = callbacks;

    // Word marking state
    this._activeMarking = null;
    this._copyMenu = null;
    this._highlightPopover = null;
    this._activeHighlightTargetKey = null;
    this._highlightTargets = new Map();
    this._hiddenHighlightTargets = new Set();
    this._revealedMetadataQuestions = new Set();
    this._metadataQuizRef = null;
    this._touchHighlightGesture = null;
    this._touchHighlightPreviewLayer = null;
    this._touchHighlightPreviewFrame = null;
    this._touchHighlightAutoScrollFrame = null;
    this._suppressHighlightTapUntil = 0;
    this._supportsDirectTouchHighlight =
      'PointerEvent' in window &&
      !!(document.caretPositionFromPoint || document.caretRangeFromPoint);
    this._groupConnectorFrame = null;
    this._groupResizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => this._scheduleGroupConnectorUpdate())
      : null;
    this._state = null;
    document.addEventListener('mouseup', () => {
      if (this._activeMarking) {
        this._saveMarkedWords(this._activeMarking.element, this._activeMarking.qIdx, this._activeMarking.markKey);
        this._activeMarking = null;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._hideHighlightPopover();
    });
    window.addEventListener('resize', () => this._scheduleGroupConnectorUpdate(), { passive: true });
  }

  render(state) {
    this._state = state;
    this._cancelTouchHighlightGesture();
    if (this._metadataQuizRef !== state.quizJson) {
      this._metadataQuizRef = state.quizJson;
      this._revealedMetadataQuestions.clear();
    }
    if (state.config.showTags !== false && state.config.showFolders !== false) {
      this._revealedMetadataQuestions.clear();
    }
    this._hideHighlightPopover();
    this._highlightTargets.clear();
    if (this._groupResizeObserver) this._groupResizeObserver.disconnect();
    this.container.innerHTML = '';
    if (!state.quizJson) return;

    const title = state.quizJson.titulo || 'Quiz';
    const desc = state.quizJson.descricao || '';
    const metaDiv = document.createElement('div');
    metaDiv.className = 'quiz-meta';
    metaDiv.innerHTML = `<h2>${title}</h2><p>${desc.replace(/\n/g, '<br>')}</p>`;
    this.container.appendChild(metaDiv);

    if (state.config.showFilterSummary) {
      this.renderFilterSummary(state);
    }

    // Aviso de Modo Retry
    if (state.retryMode) {
      const retryBanner = document.createElement('div');
      retryBanner.className = 'retry-banner';
      retryBanner.innerHTML = `<strong>Modo de Repetição:</strong> Exibindo apenas as questões que você errou anteriormente.`;
      this.container.appendChild(retryBanner);
    }

    for (let visualIdx = 0; visualIdx < state.mappings.qOrder.length;) {
      const originalIdx = state.mappings.qOrder[visualIdx];
      const qData = state.questions[originalIdx];

      if (!qData._groupData) {
        this.container.appendChild(
          this.createQuestionCard(qData, originalIdx, visualIdx, state)
        );
        visualIdx++;
        continue;
      }

      const currentGroupId = qData._groupData.id;
      const groupIndices = [];
      let nextVisualIdx = visualIdx;
      while (nextVisualIdx < state.mappings.qOrder.length) {
        const nextOriginalIdx = state.mappings.qOrder[nextVisualIdx];
        const nextQuestion = state.questions[nextOriginalIdx];
        if (!nextQuestion._groupData || nextQuestion._groupData.id !== currentGroupId) break;
        groupIndices.push(nextOriginalIdx);
        nextVisualIdx++;
      }

      const groupWrapper = document.createElement('section');
      groupWrapper.className = 'question-group';
      groupWrapper.dataset.groupId = String(currentGroupId);
      groupWrapper.dataset.groupDepth = '1';

      const startNum = visualIdx + 1;
      const endNum = visualIdx + groupIndices.length;
      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-container';
      groupHeader.innerHTML = `
        <div class="group-header-row">
          <div class="group-notice">
            Responda as questões <span>${startNum} a ${endNum}</span>
          </div>
          <div class="group-highlight-actions">
            ${this._createHighlighterControlsHtml('group', currentGroupId)}
          </div>
        </div>
        <div class="group-text-body highlightable-text">
          ${qData._groupData.text}
        </div>
      `;
      const groupTarget = { type: 'group', id: String(currentGroupId) };
      this._setupHighlighterControls(groupHeader, groupTarget);
      this._registerHighlightTarget(
        groupHeader.querySelector('.group-text-body'),
        groupTarget,
        qData._groupData.text
      );
      groupWrapper.appendChild(groupHeader);

      groupIndices.forEach((groupOriginalIdx, offset) => {
        const card = this.createQuestionCard(
          state.questions[groupOriginalIdx],
          groupOriginalIdx,
          visualIdx + offset,
          state
        );
        card.classList.add('grouped-question');
        if (offset === 0) card.classList.add('grouped-question-first');
        if (offset === groupIndices.length - 1) card.classList.add('grouped-question-last');
        groupWrapper.appendChild(card);
      });

      this.container.appendChild(groupWrapper);
      visualIdx = nextVisualIdx;
    }

    if (this._groupResizeObserver) {
      this.container.querySelectorAll('.question-group').forEach((group) => {
        this._groupResizeObserver.observe(group);
      });
    } else {
      this.container.querySelectorAll('.question-group img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', () => this._scheduleGroupConnectorUpdate(), { once: true });
      });
    }

    if (this._activeHighlightTargetKey && !this._highlightTargets.has(this._activeHighlightTargetKey)) {
      this._activeHighlightTargetKey = null;
    }

    this.updateFooter(state);
    requestAnimationFrame(() => {
      this.container.querySelectorAll('.question-card.submitted').forEach((card) => {
        this.refreshCommentToggleVisibility(card);
      });
      this._updateHighlighterControls();
      this._updateGroupConnectors();
    });
  }

  _scheduleGroupConnectorUpdate() {
    if (this._groupConnectorFrame !== null) {
      cancelAnimationFrame(this._groupConnectorFrame);
    }
    this._groupConnectorFrame = requestAnimationFrame(() => {
      this._groupConnectorFrame = null;
      this._updateGroupConnectors();
    });
  }

  _updateGroupConnectors() {
    this.container.querySelectorAll('.question-group').forEach((group) => {
      const stems = group.querySelectorAll('.grouped-question .q-enunciado');
      const lastStem = stems[stems.length - 1];
      if (!lastStem) return;
      const groupRect = group.getBoundingClientRect();
      const stemRect = lastStem.getBoundingClientRect();
      const stemFontSize = Number.parseFloat(getComputedStyle(lastStem).fontSize) || 16;
      const railHeight = Math.max(0, stemRect.top + (stemFontSize * 0.68) - groupRect.top + 1);
      group.style.setProperty('--group-rail-height', `${railHeight}px`);
    });
  }

  renderFilterSummary(state) {
    const selTags = state.filters.tags || [];
    const excludedTags = state.filters.excludedTags || [];
    const allTags = state.filters.allTags || [];
    const selDiffs = state.filters.diffs || [];
    const allDiffs = state.filters.allDiffs || [];
    const selTypes = state.filters.types || [];
    const allTypes = state.filters.allTypes || Object.keys(questionTypeMap);
    const selFolders = state.filters.folders || [];
    const allFolders = state.filters.allFolders || [];

    const isFiltered =
      selTags.length < allTags.length ||
      excludedTags.length > 0 ||
      selDiffs.length < allDiffs.length ||
      selTypes.length < allTypes.length ||
      selFolders.length < allFolders.length;

    if (!isFiltered) return;

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'active-filters-bar';

    let html = `<div class="filters-title">Filtros Ativos</div><div class="filters-container">`;

    if (selFolders.length < allFolders.length) {
      html += `<span class="filter-pill tag-pill">Pastas filtradas (${selFolders.length}/${allFolders.length})</span>`;
    }

    if (selTags.length < allTags.length) {
      if (selTags.length === 0) {
        html += `<span class="filter-pill tag-pill">Nenhuma tag incluída</span>`;
      } else {
        selTags.forEach((t) => {
          const label = t === '__NO_TAG__' ? 'Sem tag' : t;
          html += `<span class="filter-pill tag-pill">Inclui: ${label}</span>`;
        });
      }
    }

    excludedTags.forEach((t) => {
      const label = t === '__NO_TAG__' ? 'Sem tag' : t;
      html += `<span class="filter-pill exclude-pill">Exclui: ${label}</span>`;
    });

    if (selTypes.length < allTypes.length) {
      if (selTypes.length === 0) {
        html += `<span class="filter-pill diff-pill">Nenhum tipo selecionado</span>`;
      } else {
        selTypes.forEach((type) => {
          html += `<span class="filter-pill diff-pill">Tipo: ${questionTypeMap[type] || type}</span>`;
        });
      }
    }

    if (selDiffs.length < allDiffs.length) {
      selDiffs.forEach((d) => {
        const label =
          d === '__NO_DIFF__'
            ? 'Sem dificuldade'
            : difficultyMap[d] || `Nível ${d}`;
        html += `<span class="filter-pill diff-pill">${label}</span>`;
      });
    }

    html += `</div>`;
    summaryDiv.innerHTML = html;
    this.container.appendChild(summaryDiv);
  }

  createQuestionCard(qData, originalIdx, visualIdx, state) {
    const wrapper = document.createElement('div');
    wrapper.className = 'question-card';

    const tipo = (qData.tipo || '').toUpperCase();
    const isCH = tipo === 'CH' || tipo === 'MVF';
    const isMECH = tipo === 'ME-CH' || tipo === 'MEM';
    const isEscrita = tipo === 'ESCRITA';

    if (tipo === 'VF') wrapper.classList.add('type-vf');
    if (isCH) wrapper.classList.add('type-ch', 'type-mvf');
    if (isMECH) wrapper.classList.add('type-me-ch', 'type-mem');
    if (tipo === 'ESCRITA') wrapper.classList.add('type-escrita');
    if (tipo === 'MQ') wrapper.classList.add('type-mq');
    wrapper.dataset.originalIdx = originalIdx;

    const userAnswer = state.userAnswers[originalIdx];
    const isForced =
      state.forcedIndices && state.forcedIndices.includes(originalIdx);
    const isDisabledQ =
      !!(state.disabledIndices && state.disabledIndices.includes(originalIdx));
    const isLocked = isForced || isDisabledQ;
    const isSubmitted = !!(userAnswer && userAnswer.submitted) && !isForced;
    const eliminatedList = state.eliminatedAlts[originalIdx] || [];

    if (isForced) {
      wrapper.classList.add('question-forced');
    } else if (isSubmitted) {
      wrapper.classList.add('submitted');
    }
    if (isDisabledQ) {
      wrapper.classList.add('question-disabled');
    }

    let diffHtml = '';
    if (state.config.showDiff) {
      const diffLabel =
        difficultyMap[qData.dificuldade] ||
        (qData.dificuldade ? `Nível ${qData.dificuldade}` : '');
      if (diffLabel) {
        diffHtml = `<span class="diff-badge">${diffLabel}</span>`;
      }
    }

    const hasFolders = !!(qData._path && qData._path.length > 0);
    const hasTags = !!(qData.tags && qData.tags.length > 0);
    const showFolders = state.config.showFolders !== false;
    const showTags = state.config.showTags !== false;
    const metadataRevealed = this._revealedMetadataQuestions.has(originalIdx);
    const metadataToggleNeeded =
      (hasFolders && !showFolders) || (hasTags && !showTags);

    let foldersHtml = '';
    if (hasFolders) {
      foldersHtml = `<div class="q-breadcrumbs${showFolders || metadataRevealed ? '' : ' hidden'}" data-metadata-kind="folders">📂 <span>${qData._path.join(
        ' > '
      )}</span></div>`;
    }

    let tagsHtml = '';
    if (hasTags) {
      const tagsSpans = qData.tags
        .map((t) => `<span>${t}</span>`)
        .join('');
      tagsHtml = `<div class="tags${showTags || metadataRevealed ? '' : ' hidden'}" data-metadata-kind="tags">${tagsSpans}</div>`;
    }

    const metadataToggleHtml = metadataToggleNeeded
      ? `<button class="btn-metadata-visibility${metadataRevealed ? ' active' : ''}" type="button"
          aria-pressed="${metadataRevealed ? 'true' : 'false'}"
          title="${metadataRevealed ? 'Voltar à exibição global de tags e pastas' : 'Mostrar tags e pastas nesta questão'}">
          ${metadataRevealed ? '🙈' : '👁️'}
        </button>`
      : '';
    const metadataHtml = (foldersHtml || tagsHtml || metadataToggleHtml)
      ? `<div class="q-metadata">${foldersHtml}${tagsHtml}${metadataToggleHtml}</div>`
      : '';

    let forcedBadge = '';
    if (isForced) {
      forcedBadge = `<div class="forced-badge">Exibida apenas como contexto (fora dos filtros) — não respondível e não vale nota</div>`;
    } else if (isDisabledQ) {
      forcedBadge = `<div class="forced-badge disabled-question-badge">🚫 Questão desativada — não é possível respondê-la e ela não conta na nota. Pode ser reativada a qualquer momento.</div>`;
    }

    const enunciadoTxt = formatText(
      qData.enunciado,
      originalIdx,
      state.mappings.altOrder
    );
    const supportsHighlighter = tipo !== 'VF';
    const enunciadoClass = tipo === 'VF'
      ? 'question-stem-text markable-text'
      : 'question-stem-text highlightable-text';
    const hasMarking = tipo === 'VF' || isCH || tipo === 'ME' || isMECH || tipo === 'MQ';
    const selModeBtn = hasMarking
      ? `<button class="btn-selection-mode" type="button" title="Alternar modo seleção de texto">📋 Selecionar</button>`
      : '';
    const highlighterControls = supportsHighlighter
      ? this._createHighlighterControlsHtml('question', originalIdx)
      : '';
    const manageBtn = `<button class="btn-question-manage" type="button" title="${
      isDisabledQ ? 'Questão desativada — clique para gerenciar' : 'Deletar ou desativar esta questão'
    }">${isDisabledQ ? '↩️ Reativar' : '🗑️'}</button>`;

    wrapper.innerHTML = `
      ${forcedBadge}
      <div class="q-header-container">
        ${metadataHtml}
        <div class="q-card-actions">${highlighterControls}${selModeBtn}${manageBtn}${diffHtml}</div>
      </div>
      <div class="q-enunciado">
        <span class="q-number">${visualIdx + 1}.</span>
        <div class="${enunciadoClass}">${enunciadoTxt}</div>
      </div>
    `;

    if (supportsHighlighter) {
      const questionTarget = { type: 'question', id: String(originalIdx) };
      this._setupHighlighterControls(wrapper, questionTarget);
      this._registerHighlightTarget(
        wrapper.querySelector('.question-stem-text'),
        questionTarget,
        qData.enunciado
      );
    }

    const metadataToggle = wrapper.querySelector('.btn-metadata-visibility');
    if (metadataToggle) {
      metadataToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const revealAll = !this._revealedMetadataQuestions.has(originalIdx);
        if (revealAll) {
          this._revealedMetadataQuestions.add(originalIdx);
        } else {
          this._revealedMetadataQuestions.delete(originalIdx);
        }

        const folders = wrapper.querySelector('[data-metadata-kind="folders"]');
        const tags = wrapper.querySelector('[data-metadata-kind="tags"]');
        if (folders) folders.classList.toggle('hidden', !showFolders && !revealAll);
        if (tags) tags.classList.toggle('hidden', !showTags && !revealAll);
        metadataToggle.classList.toggle('active', revealAll);
        metadataToggle.setAttribute('aria-pressed', revealAll ? 'true' : 'false');
        metadataToggle.title = revealAll
          ? 'Voltar à exibição global de tags e pastas'
          : 'Mostrar tags e pastas nesta questão';
        metadataToggle.textContent = revealAll ? '🙈' : '👁️';
        this._scheduleGroupConnectorUpdate();
      });
    }

    // Gerenciar questão (deletar / desativar / ativar)
    const manageBtnEl = wrapper.querySelector('.btn-question-manage');
    if (manageBtnEl) {
      manageBtnEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.callbacks.onManageQuestion) {
          this.callbacks.onManageQuestion(originalIdx);
        }
      });
    }

    // Toggle modo seleção (global)
    const selBtn = wrapper.querySelector('.btn-selection-mode');
    if (selBtn) {
      if (this.container.classList.contains('selection-mode')) {
        selBtn.classList.add('active');
      }
      selBtn.addEventListener('click', () => {
        this._deactivateHighlighter();
        const active = this.container.classList.toggle('selection-mode');
        this.container.querySelectorAll('.btn-selection-mode').forEach(b => {
          b.classList.toggle('active', active);
        });
      });
    }

    // Word marking for VF enunciado
    if (tipo === 'VF') {
      const markEl = wrapper.querySelector('.markable-text');
      if (markEl) {
        const marks = (userAnswer && userAnswer.markedWords) || [];
        this._applyWordMarking(markEl, marks);
        this._setupMarkingListeners(markEl, originalIdx, 'enunciado');
      }
    }

    // ===================== ESCRITA =====================
    if (isEscrita) {
      const escritaContent = this._createEscritaContent(
        qData, originalIdx, state, isLocked, isSubmitted, userAnswer
      );
      wrapper.appendChild(escritaContent);

      if (isSubmitted && !isForced && this._hasQuestionComments(qData, tipo)) {
        wrapper.appendChild(this._createToggleCommentsButton(wrapper, originalIdx, 'main'));
      }

      // Comentário geral após envio de todas as partes
      if (isSubmitted) {
        const genCommentTxt = formatText(
          qData.comentario_geral,
          originalIdx,
          state.mappings.altOrder
        );
        if (genCommentTxt) {
          const genDiv = document.createElement('div');
          genDiv.className = 'general-comment';
          genDiv.innerHTML = `<strong>Comentário Geral:</strong><br>${genCommentTxt}`;
          wrapper.appendChild(genDiv);

          if (!isForced) {
            wrapper.appendChild(this._createToggleCommentsButton(wrapper, originalIdx, 'end'));
          }
        }
      }

      if (!isLocked) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'action-bar';
        const btnAnswer = document.createElement('button');
        btnAnswer.className = 'btn btn-submit';
        btnAnswer.innerText = 'Responder';

        if (isSubmitted) {
          btnAnswer.style.display = 'none';
        } else {
          btnAnswer.disabled = false;
        }

        btnAnswer.addEventListener('click', () => {
          this.callbacks.onSubmit(originalIdx);
        });

        actionsDiv.appendChild(btnAnswer);

        if (isSubmitted && state.config.showDisregardCorrect !== false) {
          const rawScore = this.computeQuestionScore(state, originalIdx, { ignoreDisregard: true });
          if (rawScore.total > 0 && rawScore.hits > 0) {
            const disregardLabel = document.createElement('label');
            disregardLabel.className = 'disregard-correct-control';
            disregardLabel.innerHTML = `
              <input type="checkbox" ${userAnswer && userAnswer.disregardCorrect ? 'checked' : ''}>
              <span>Desconsiderar acerto</span>
            `;
            const disregardInput = disregardLabel.querySelector('input');
            disregardInput.addEventListener('change', (e) => {
              if (this.callbacks.onToggleDisregardCorrect) {
                this.callbacks.onToggleDisregardCorrect(originalIdx, e.target.checked);
              }
            });
            actionsDiv.appendChild(disregardLabel);
          }
        }

        wrapper.appendChild(actionsDiv);
      }

      return wrapper;
    }

    // ===================== MQ (Matching Question / Associação) =====================
    if (tipo === 'MQ') {
      const mqContent = this._createMqContent(
        qData, originalIdx, state, isLocked, isSubmitted, userAnswer
      );
      wrapper.appendChild(mqContent);

      if (!isLocked) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'action-bar';
        const btnAnswer = document.createElement('button');
        btnAnswer.className = 'btn btn-submit';
        btnAnswer.innerText = 'Responder';

        if (isSubmitted) {
          btnAnswer.style.display = 'none';
        } else {
          btnAnswer.disabled = false;
        }

        btnAnswer.addEventListener('click', () => {
          this.callbacks.onSubmit(originalIdx);
        });

        actionsDiv.appendChild(btnAnswer);

        if (isSubmitted && state.config.showDisregardCorrect !== false) {
          const rawScore = this.computeQuestionScore(state, originalIdx, { ignoreDisregard: true });
          if (rawScore.total > 0 && rawScore.hits > 0) {
            const disregardLabel = document.createElement('label');
            disregardLabel.className = 'disregard-correct-control';
            disregardLabel.innerHTML = `
              <input type="checkbox" ${userAnswer && userAnswer.disregardCorrect ? 'checked' : ''}>
              <span>Desconsiderar acerto</span>
            `;
            const disregardInput = disregardLabel.querySelector('input');
            disregardInput.addEventListener('change', (e) => {
              if (this.callbacks.onToggleDisregardCorrect) {
                this.callbacks.onToggleDisregardCorrect(originalIdx, e.target.checked);
              }
            });
            actionsDiv.appendChild(disregardLabel);
          }
        }

        wrapper.appendChild(actionsDiv);
      }

      if (isSubmitted && !isForced && this._hasQuestionComments(qData, tipo)) {
        wrapper.appendChild(this._createToggleCommentsButton(wrapper, originalIdx, 'main'));
      }

      if (isSubmitted && !isForced) {
        const { hits, total } = this.computeQuestionScore(state, originalIdx);
        const score = total > 0 ? hits / total : 0;
        const fmt = (n, maxDec = 2) =>
          (+n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: maxDec });

        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'me-ch-score mq-score';
        scoreDiv.innerHTML =
          `<strong>Pontuação nesta questão:</strong> ${fmt(score)}/1 ponto (${fmt(score * 100, 1)}%)`;
        wrapper.appendChild(scoreDiv);

        const gabDiv = document.createElement('div');
        gabDiv.className = 'mq-textual-gabarito';
        gabDiv.innerHTML = this._renderMqTextualGabarito(qData, originalIdx, state);
        wrapper.appendChild(gabDiv);
      }

      if (isSubmitted) {
        const genCommentTxt = formatText(
          qData.comentario_geral || qData.comentario,
          originalIdx,
          state.mappings.altOrder
        );
        if (genCommentTxt) {
          const genDiv = document.createElement('div');
          genDiv.className = 'general-comment';
          genDiv.innerHTML = `<strong>Comentário Geral:</strong><br>${genCommentTxt}`;
          wrapper.appendChild(genDiv);

          if (!isForced) {
            wrapper.appendChild(this._createToggleCommentsButton(wrapper, originalIdx, 'end'));
          }
        }
      }

      return wrapper;
    }

    // ===================== ME / VF / CH =====================
    const altList = document.createElement('div');
    altList.className = 'alternatives-list';
    const altMapping = state.mappings.altOrder[originalIdx] || [];

    if (isCH) {
      const assAnswers =
        userAnswer && userAnswer.assertivaAnswers
          ? userAnswer.assertivaAnswers
          : {};

      const toRoman = (n) => {
        const numerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
        return numerals[n] || String(n + 1);
      };

      altMapping.forEach((originalAssIdx, visualIdxAss) => {
        const assData = qData.assertivas[originalAssIdx];
        const visualLetter = toRoman(visualIdxAss);
        const altItem = document.createElement('div');
        altItem.className = 'alt-item';

        const isCorrectAss = !!assData.is_correct;
        const userChoice = assAnswers[originalAssIdx]; // true=V, false=F, undefined=não respondeu
        const hasAnswered = userChoice !== undefined;
        const isEliminated = eliminatedList.includes(originalAssIdx);

        const altWrapper = document.createElement('div');
        altWrapper.className = 'alt-wrapper ch-vf-wrapper';
        if (isEliminated) altWrapper.classList.add('eliminated');

        if (isSubmitted) {
          const stateMatches = hasAnswered && (userChoice === isCorrectAss);
          if (stateMatches) {
            altWrapper.classList.add('correct');
          } else {
            altWrapper.classList.add('wrong');
          }
        }

        const altText = formatText(
          assData.texto,
          originalIdx,
          state.mappings.altOrder
        );
        const specificCommentTxt = formatText(
          assData.comentario,
          originalIdx,
          state.mappings.altOrder
        );
        let specificCommentHtml = '';
        if (specificCommentTxt) {
          specificCommentHtml = `<div class="specific-comment">${specificCommentTxt}</div>`;
        }

        const scissorBtn =
          !isLocked
            ? `<button class="btn-cut" type="button" title="Cortar alternativa">✂️</button>`
            : '';

        const radioNameV = `q${originalIdx}_ass${originalAssIdx}`;
        const checkedV = hasAnswered && userChoice === true ? 'checked' : '';
        const checkedF = hasAnswered && userChoice === false ? 'checked' : '';
        const disabledAttr = isSubmitted || isLocked ? 'disabled' : '';

        // Determinar classes visuais para os botões V/F após submissão
        let vBtnClass = 'ch-vf-btn ch-vf-v';
        let fBtnClass = 'ch-vf-btn ch-vf-f';
        if (!isSubmitted) {
          if (checkedV) vBtnClass += ' selected';
          if (checkedF) fBtnClass += ' selected';
        } else {
          // Após submissão: destacar a resposta correta e o erro do usuário
          if (isCorrectAss) {
            vBtnClass += ' ch-vf-correct-answer';
            if (hasAnswered && !userChoice) fBtnClass += ' ch-vf-wrong-pick';
          } else {
            fBtnClass += ' ch-vf-correct-answer';
            if (hasAnswered && userChoice) vBtnClass += ' ch-vf-wrong-pick';
          }
        }

        const vfControlsHtml = `
          <div class="ch-vf-controls">
            <label class="${vBtnClass}">
              <input type="radio" name="${radioNameV}" value="V" ${checkedV} ${disabledAttr}> V
            </label>
            <label class="${fBtnClass}">
              <input type="radio" name="${radioNameV}" value="F" ${checkedF} ${disabledAttr}> F
            </label>
          </div>
        `;

        const labelHtml = `
          <div class="alt-label ch-assertiva-label ${hasAnswered ? 'selected' : ''}">
            <span class="alt-letter ch-roman">${visualLetter}.</span>
            <span class="alt-text markable-text">${altText}</span>
          </div>
        `;

        altWrapper.innerHTML = vfControlsHtml + labelHtml + scissorBtn;

        // Word marking for CH assertiva
        const markTextEl = altWrapper.querySelector('.markable-text');
        if (markTextEl) {
          const mw = userAnswer && userAnswer.markedWords;
          const marks = (mw && mw[String(originalAssIdx)]) || [];
          this._applyWordMarking(markTextEl, marks);
          this._setupMarkingListeners(markTextEl, originalIdx, String(originalAssIdx));
        }

        altItem.appendChild(altWrapper);

        if (specificCommentHtml) {
          const commentDiv = document.createElement('div');
          commentDiv.innerHTML = specificCommentHtml;
          altItem.appendChild(commentDiv);
        }

        if (!isLocked) {
          const radios = altWrapper.querySelectorAll(`input[name="${radioNameV}"]`);
          if (!isSubmitted) {
            radios.forEach((radio) => {
              radio.addEventListener('change', (e) => {
                if (eliminatedList.includes(originalAssIdx)) {
                  e.preventDefault();
                  radio.checked = false;
                  return;
                }
                const markedTrue = radio.value === 'V';
                this.callbacks.onSelect(
                  originalIdx,
                  originalAssIdx,
                  true,
                  markedTrue
                );
              });
            });
          }

          const cutBtn = altWrapper.querySelector('.btn-cut');
          if (cutBtn) {
            cutBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.callbacks.onEliminate(originalIdx, originalAssIdx);
            });
          }
        }

        altList.appendChild(altItem);
      });

    } else {
      // ME / VF / ME-CH
      const selectedMeCh = new Set(
        userAnswer && Array.isArray(userAnswer.selectedOriginalIndices)
          ? userAnswer.selectedOriginalIndices.map((idx) => Number(idx))
          : []
      );
      const meChCorrectSet = isMECH ? parseMeChGabarito(qData) : null;

      altMapping.forEach((originalAltIdx, visualAltIdx) => {
        const altData = qData.alternativas[originalAltIdx];
        const visualLetter = String.fromCharCode(65 + visualAltIdx);
        const altItem = document.createElement('div');
        altItem.className = 'alt-item';

        const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
        const gabaritoOriginalIdx = gabaritoLetra.charCodeAt(0) - 65;
        const isCorrectAlt = isMECH
          ? meChCorrectSet.has(originalAltIdx)
          : originalAltIdx === gabaritoOriginalIdx;
        const isSelected = isMECH
          ? selectedMeCh.has(originalAltIdx)
          : userAnswer && userAnswer.selectedOriginalIdx === originalAltIdx;
        const isEliminated = eliminatedList.includes(originalAltIdx);

        const altWrapper = document.createElement('div');
        altWrapper.className = 'alt-wrapper';
        if (isEliminated) altWrapper.classList.add('eliminated');
        if (isSubmitted) {
          if (isMECH) {
            if (isSelected && isCorrectAlt) altWrapper.classList.add('correct');
            if (isSelected && !isCorrectAlt) altWrapper.classList.add('wrong');
            if (!isSelected && isCorrectAlt) altWrapper.classList.add('missed-correct');
          } else {
            if (isCorrectAlt) altWrapper.classList.add('correct');
            if (isSelected && !isCorrectAlt) altWrapper.classList.add('wrong');
          }
        }

        const inputId = `q${originalIdx}_alt${visualAltIdx}`;
        const checked = isSelected ? 'checked' : '';
        const altText = formatText(
          altData.texto,
          originalIdx,
          state.mappings.altOrder
        );
        const specificCommentTxt = formatText(
          altData.comentario,
          originalIdx,
          state.mappings.altOrder
        );
        let specificCommentHtml = '';
        if (specificCommentTxt) {
          specificCommentHtml = `<div class="specific-comment">${specificCommentTxt}</div>`;
        }

        const scissorBtn =
          !isLocked
            ? `<button class="btn-cut" type="button" title="Cortar alternativa">✂️</button>`
            : '';

        const isME = tipo === 'ME';
        const inputType = isMECH ? 'checkbox' : 'radio';
        const labelHtml = `
          <label class="alt-label ${isSelected ? 'selected' : ''}" for="${inputId}">
            <input type="${inputType}" name="q_${originalIdx}" id="${inputId}"
              class="alt-input" value="${originalAltIdx}" ${checked}
              ${isSubmitted || isLocked ? 'disabled' : ''}>
            <span class="alt-letter">${visualLetter})</span>
            <span class="alt-text${isME || isMECH ? ' markable-text' : ''}">${altText}</span>
          </label>
        `;
        altWrapper.innerHTML = labelHtml + scissorBtn;

        // Word marking for ME / ME-CH alternativas
        if (isME || isMECH) {
          const markEl = altWrapper.querySelector('.markable-text');
          if (markEl) {
            const mw = userAnswer && userAnswer.markedWords;
            const marks = (mw && mw[String(originalAltIdx)]) || [];
            this._applyWordMarking(markEl, marks);
            this._setupMarkingListeners(markEl, originalIdx, String(originalAltIdx));
          }
        }

        altItem.appendChild(altWrapper);

        if (specificCommentHtml) {
          const commentDiv = document.createElement('div');
          commentDiv.innerHTML = specificCommentHtml;
          altItem.appendChild(commentDiv);
        }

        if (!isLocked) {
          const lbl = altWrapper.querySelector('.alt-label');
          if (!isSubmitted) {
            lbl.addEventListener('click', (e) => {
              if (eliminatedList.includes(originalAltIdx)) {
                e.preventDefault();
                return;
              }
              if (e.target.tagName === 'INPUT') {
                this.callbacks.onSelect(
                  originalIdx,
                  originalAltIdx,
                  isMECH,
                  isMECH ? e.target.checked : true
                );
              }
            });
          }

          const cutBtn = altWrapper.querySelector('.btn-cut');
          if (cutBtn) {
            cutBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.callbacks.onEliminate(originalIdx, originalAltIdx);
            });
          }
        }

        altList.appendChild(altItem);
      });
    }

    wrapper.appendChild(altList);

    if (!isLocked) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'action-bar';
      const btnAnswer = document.createElement('button');
      btnAnswer.className = 'btn btn-submit';
      btnAnswer.innerText = 'Responder';

      if (isSubmitted) {
        btnAnswer.style.display = 'none';
      } else if (isCH || isMECH) {
        // CH e ME-CH podem responder mesmo sem marcar nada
        btnAnswer.disabled = false;
      } else {
        btnAnswer.disabled =
          userAnswer?.selectedOriginalIdx === undefined || isSubmitted;
      }

      btnAnswer.addEventListener('click', () => {
        this.callbacks.onSubmit(originalIdx);
      });

      actionsDiv.appendChild(btnAnswer);

      if (isSubmitted && !isEscrita && state.config.showDisregardCorrect !== false) {
        const rawScore = this.computeQuestionScore(state, originalIdx, { ignoreDisregard: true });
        if (rawScore.total > 0 && rawScore.hits > 0) {
          const disregardLabel = document.createElement('label');
          disregardLabel.className = 'disregard-correct-control';
          disregardLabel.innerHTML = `
            <input type="checkbox" ${userAnswer && userAnswer.disregardCorrect ? 'checked' : ''}>
            <span>Desconsiderar acerto</span>
          `;
          const disregardInput = disregardLabel.querySelector('input');
          disregardInput.addEventListener('change', (e) => {
            if (this.callbacks.onToggleDisregardCorrect) {
              this.callbacks.onToggleDisregardCorrect(originalIdx, e.target.checked);
            }
          });
          actionsDiv.appendChild(disregardLabel);
        }
      }
      wrapper.appendChild(actionsDiv);
    }

    if (isSubmitted && !isForced && this._hasQuestionComments(qData, tipo)) {
      wrapper.appendChild(this._createToggleCommentsButton(wrapper, originalIdx, 'main'));
    }

    if (isSubmitted && isMECH && !isForced) {
      const { hits, total } = this.computeQuestionScore(state, originalIdx);
      const score = total > 0 ? hits / total : 0;
      const fmt = (n, maxDec = 2) =>
        (+n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: maxDec });

      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'me-ch-score';
      scoreDiv.innerHTML =
        `<strong>Pontuação nesta questão:</strong> ${fmt(score)}/1 ponto (${fmt(score * 100, 1)}%)`;
      wrapper.appendChild(scoreDiv);
    }

    if (isSubmitted) {
      const genCommentTxt = formatText(
        qData.comentario_geral,
        originalIdx,
        state.mappings.altOrder
      );
      if (genCommentTxt) {
        const genDiv = document.createElement('div');
        genDiv.className = 'general-comment';
        genDiv.innerHTML = `<strong>Comentário Geral:</strong><br>${genCommentTxt}`;
        wrapper.appendChild(genDiv);
        if (!isForced) {
          wrapper.appendChild(this._createToggleCommentsButton(wrapper, originalIdx, 'end'));
        }
      }

    }

    return wrapper;
  }

  // ===================== MQ (Matching Question / Associação) Helpers =====================

  _createMqContent(qData, originalIdx, state, isLocked, isSubmitted, userAnswer) {
    const renderMode = localStorage.getItem('vs_mqRenderMode') || 'arrows';
    if (renderMode === 'table') {
      return this._renderMqTable(qData, originalIdx, state, isLocked, isSubmitted, userAnswer);
    }
    return this._renderMqArrows(qData, originalIdx, state, isLocked, isSubmitted, userAnswer);
  }

  _renderMqArrows(qData, originalIdx, state, isLocked, isSubmitted, userAnswer) {
    const container = document.createElement('div');
    container.className = 'mq-container mq-mode-arrows';
    container.dataset.originalIdx = originalIdx;

    const leftColName = (qData.coluna_esquerda && qData.coluna_esquerda.nome) || 'Coluna I';
    const rightColName = (qData.coluna_direita && qData.coluna_direita.nome) || 'Coluna II';

    const leftItens = (qData.coluna_esquerda && qData.coluna_esquerda.itens) || [];
    const rightItens = (qData.coluna_direita && qData.coluna_direita.itens) || [];

    const mqMap = state.mappings.altOrder[originalIdx] || {};
    const leftIndices = Array.isArray(mqMap.left) ? mqMap.left : Array.from({ length: leftItens.length }, (_, i) => i);
    const rightIndices = Array.isArray(mqMap.right) ? mqMap.right : Array.from({ length: rightItens.length }, (_, i) => i);

    let userConns = (userAnswer && Array.isArray(userAnswer.connections)) ? [...userAnswer.connections] : [];

    const layout = document.createElement('div');
    layout.className = 'mq-arrows-layout';

    // Coluna Esquerda
    const leftCol = document.createElement('div');
    leftCol.className = 'mq-column mq-column-left';
    leftCol.innerHTML = `<div class="mq-column-header"><strong>${leftColName}</strong></div>`;
    const leftList = document.createElement('div');
    leftList.className = 'mq-items-list';

    leftIndices.forEach((origIdx, visIdx) => {
      const item = leftItens[origIdx] || {};
      const itemEl = document.createElement('div');
      itemEl.className = 'mq-item mq-left-item' + (isLocked || isSubmitted ? ' mq-item-disabled' : '');
      itemEl.dataset.origIdx = origIdx;
      itemEl.dataset.visIdx = visIdx;
      itemEl.dataset.side = 'left';

      const formattedTxt = formatText(item.texto, originalIdx, state.mappings.altOrder);
      itemEl.innerHTML = `
        <span class="mq-item-num">${visIdx + 1}.</span>
        <span class="mq-item-text">${formattedTxt}</span>
        <span class="mq-anchor mq-anchor-right"></span>
      `;
      leftList.appendChild(itemEl);
    });
    leftCol.appendChild(leftList);

    // Calha Central
    const gutter = document.createElement('div');
    gutter.className = 'mq-gutter';

    // Coluna Direita
    const rightCol = document.createElement('div');
    rightCol.className = 'mq-column mq-column-right';
    rightCol.innerHTML = `<div class="mq-column-header"><strong>${rightColName}</strong></div>`;
    const rightList = document.createElement('div');
    rightList.className = 'mq-items-list';

    rightIndices.forEach((origIdx, visIdx) => {
      const item = rightItens[origIdx] || {};
      const letter = String.fromCharCode(65 + visIdx);
      const itemEl = document.createElement('div');
      itemEl.className = 'mq-item mq-right-item' + (isLocked || isSubmitted ? ' mq-item-disabled' : '');
      itemEl.dataset.origIdx = origIdx;
      itemEl.dataset.visIdx = visIdx;
      itemEl.dataset.side = 'right';

      const formattedTxt = formatText(item.texto, originalIdx, state.mappings.altOrder);
      itemEl.innerHTML = `
        <span class="mq-anchor mq-anchor-left"></span>
        <span class="mq-item-letter">${letter}.</span>
        <span class="mq-item-text">${formattedTxt}</span>
      `;
      rightList.appendChild(itemEl);
    });
    rightCol.appendChild(rightList);

    layout.appendChild(leftCol);
    layout.appendChild(gutter);
    layout.appendChild(rightCol);
    container.appendChild(layout);

    // Canvas SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'mq-svg-canvas');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const createMarker = (id, colorClass, defaultColor = null) => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('orient', 'auto-start-reverse');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
      if (colorClass) {
        p.setAttribute('class', colorClass);
      }
      if (defaultColor) {
        p.setAttribute('fill', defaultColor);
      }
      marker.appendChild(p);
      return marker;
    };

    // Marcador padrão com classe reativa ao modo escuro
    defs.appendChild(createMarker(`mq-arr-def-${originalIdx}`, 'mq-marker-path-default'));
    defs.appendChild(createMarker(`mq-arr-cor-${originalIdx}`, '', '#16a34a'));
    defs.appendChild(createMarker(`mq-arr-wro-${originalIdx}`, '', '#dc2626'));
    defs.appendChild(createMarker(`mq-arr-mis-${originalIdx}`, '', '#ea580c'));
    defs.appendChild(createMarker(`mq-arr-sol-${originalIdx}`, '', '#86efac'));
    svg.appendChild(defs);

    const pathsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(pathsGroup);
    container.appendChild(svg);

    const gabMap = parseMqGabarito(qData);

    const drawArrows = () => {
      pathsGroup.innerHTML = '';
      const cRect = container.getBoundingClientRect();
      if (cRect.width === 0 || cRect.height === 0) return;

      const linesToDraw = [];

      if (!isSubmitted) {
        userConns.forEach((c) => {
          linesToDraw.push({
            leftOrigIdx: c.leftOrigIdx !== undefined ? c.leftOrigIdx : c.left,
            rightOrigIdx: c.rightOrigIdx !== undefined ? c.rightOrigIdx : c.right,
            color: '', // controlada de forma 100% reativa via classe .mq-arrow-default
            markerId: `mq-arr-def-${originalIdx}`,
            width: 2.5,
            statusClass: 'mq-arrow-default',
            interactive: true
          });
        });
      } else {
        const userSet = new Set(userConns.map((c) => {
          const l = c.leftOrigIdx !== undefined ? c.leftOrigIdx : c.left;
          const r = c.rightOrigIdx !== undefined ? c.rightOrigIdx : c.right;
          return `${l}_${r}`;
        }));

        const wrongLefts = new Set();

        userConns.forEach((c) => {
          const l = c.leftOrigIdx !== undefined ? c.leftOrigIdx : c.left;
          const r = c.rightOrigIdx !== undefined ? c.rightOrigIdx : c.right;
          const targetSet = gabMap.get(l) || new Set();
          const isCorrect = targetSet.has(r);

          if (isCorrect) {
            linesToDraw.push({
              leftOrigIdx: l,
              rightOrigIdx: r,
              color: '#16a34a',
              markerId: `mq-arr-cor-${originalIdx}`,
              width: 2.5,
              statusClass: 'mq-arrow-correct',
              interactive: false
            });
          } else {
            wrongLefts.add(l);
            linesToDraw.push({
              leftOrigIdx: l,
              rightOrigIdx: r,
              color: '#dc2626',
              markerId: `mq-arr-wro-${originalIdx}`,
              width: 2.5,
              statusClass: 'mq-arrow-wrong',
              interactive: false
            });
          }
        });

        // Omissões / esquecidas
        gabMap.forEach((targetSet, lIdx) => {
          targetSet.forEach((rIdx) => {
            const key = `${lIdx}_${rIdx}`;
            if (!userSet.has(key)) {
              linesToDraw.push({
                leftOrigIdx: lIdx,
                rightOrigIdx: rIdx,
                color: '#ea580c',
                markerId: `mq-arr-mis-${originalIdx}`,
                width: 2.2,
                statusClass: 'mq-arrow-missed',
                interactive: false
              });
            }
          });
        });

        // Solução para erros
        wrongLefts.forEach((lIdx) => {
          const targetSet = gabMap.get(lIdx) || new Set();
          targetSet.forEach((rIdx) => {
            linesToDraw.push({
              leftOrigIdx: lIdx,
              rightOrigIdx: rIdx,
              color: '#86efac',
              markerId: `mq-arr-sol-${originalIdx}`,
              width: 1.5,
              statusClass: 'mq-arrow-solution',
              interactive: false
            });
          });
        });
      }

      linesToDraw.forEach((ld) => {
        const leftEl = leftList.querySelector(`.mq-left-item[data-orig-idx="${ld.leftOrigIdx}"]`);
        const rightEl = rightList.querySelector(`.mq-right-item[data-orig-idx="${ld.rightOrigIdx}"]`);
        if (!leftEl || !rightEl) return;

        const leftAnchor = leftEl.querySelector('.mq-anchor-right') || leftEl;
        const rightAnchor = rightEl.querySelector('.mq-anchor-left') || rightEl;

        const laRect = leftAnchor.getBoundingClientRect();
        const raRect = rightAnchor.getBoundingClientRect();

        const x1 = laRect.left + laRect.width / 2 - cRect.left;
        const y1 = laRect.top + laRect.height / 2 - cRect.top;
        const x2 = raRect.left + raRect.width / 2 - cRect.left;
        const y2 = raRect.top + raRect.height / 2 - cRect.top;

        const dx = Math.max(30, (x2 - x1) * 0.5);
        const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('fill', 'none');
        if (ld.color) {
          path.setAttribute('stroke', ld.color);
        }
        path.setAttribute('stroke-width', ld.width);
        path.setAttribute('marker-end', `url(#${ld.markerId})`);
        path.setAttribute('class', `mq-arrow-line ${ld.statusClass}`);
        pathsGroup.appendChild(path);

        if (ld.interactive && !isLocked && !isSubmitted) {
          const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          hitbox.setAttribute('d', pathD);
          hitbox.setAttribute('fill', 'none');
          hitbox.setAttribute('stroke', 'transparent');
          hitbox.setAttribute('stroke-width', '18');
          hitbox.setAttribute('class', 'mq-arrow-hitbox');

          const removeConnection = () => {
            userConns = userConns.filter((c) => {
              const l = c.leftOrigIdx !== undefined ? c.leftOrigIdx : c.left;
              const r = c.rightOrigIdx !== undefined ? c.rightOrigIdx : c.right;
              return !(l === ld.leftOrigIdx && r === ld.rightOrigIdx);
            });
            if (this.callbacks.onMqChange) {
              this.callbacks.onMqChange(originalIdx, userConns);
            }
            drawArrows();
          };

          hitbox.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showMqContextMenu(e.clientX, e.clientY, () => removeConnection());
          });

          let tapCount = 0;
          let tapTimer = null;
          hitbox.addEventListener('click', (e) => {
            tapCount++;
            if (tapCount === 1) {
              path.classList.add('mq-arrow-selected');
              tapTimer = setTimeout(() => {
                tapCount = 0;
                path.classList.remove('mq-arrow-selected');
              }, 400);
            } else if (tapCount === 2) {
              clearTimeout(tapTimer);
              tapCount = 0;
              path.classList.remove('mq-arrow-selected');
              this._showMqContextMenu(e.clientX, e.clientY, () => removeConnection());
            }
          });

          pathsGroup.appendChild(hitbox);
        }
      });
    };

    let activeItem = null;

    if (!isLocked && !isSubmitted) {
      const handleItemClick = (side, origIdx, el) => {
        if (this.container.classList.contains('selection-mode')) return;

        if (!activeItem) {
          activeItem = { side, origIdx, element: el };
          el.classList.add('mq-item-active');
          return;
        }

        if (activeItem.side === side && activeItem.origIdx === origIdx) {
          activeItem.element.classList.remove('mq-item-active');
          activeItem = null;
          return;
        }

        if (activeItem.side === side) {
          activeItem.element.classList.remove('mq-item-active');
          activeItem = { side, origIdx, element: el };
          el.classList.add('mq-item-active');
          return;
        }

        const lIdx = side === 'left' ? origIdx : activeItem.origIdx;
        const rIdx = side === 'right' ? origIdx : activeItem.origIdx;

        activeItem.element.classList.remove('mq-item-active');
        activeItem = null;

        const existingIdx = userConns.findIndex((c) => {
          const l = c.leftOrigIdx !== undefined ? c.leftOrigIdx : c.left;
          const r = c.rightOrigIdx !== undefined ? c.rightOrigIdx : c.right;
          return l === lIdx && r === rIdx;
        });

        if (existingIdx !== -1) {
          // Desfaz a conexão se já existir (toggle off)
          userConns.splice(existingIdx, 1);
        } else {
          // Cria nova conexão se não existir
          userConns.push({ leftOrigIdx: lIdx, rightOrigIdx: rIdx });
        }

        if (this.callbacks.onMqChange) {
          this.callbacks.onMqChange(originalIdx, userConns);
        }
        drawArrows();
      };

      leftList.querySelectorAll('.mq-left-item').forEach((el) => {
        el.addEventListener('click', () => {
          handleItemClick('left', Number(el.dataset.origIdx), el);
        });
      });

      rightList.querySelectorAll('.mq-right-item').forEach((el) => {
        el.addEventListener('click', () => {
          handleItemClick('right', Number(el.dataset.origIdx), el);
        });
      });
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        requestAnimationFrame(() => drawArrows());
      });
      ro.observe(container);
    }

    requestAnimationFrame(() => drawArrows());
    setTimeout(() => drawArrows(), 50);

    return container;
  }

  _showMqContextMenu(clientX, clientY, onDelete) {
    const existing = document.querySelector('.mq-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'mq-context-menu';
    menu.style.left = `${clientX + 5}px`;
    menu.style.top = `${clientY + 5}px`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mq-context-menu-item';
    btn.innerHTML = '🗑️ Deletar associação';
    btn.addEventListener('click', () => {
      onDelete();
      menu.remove();
    });

    menu.appendChild(btn);
    document.body.appendChild(menu);

    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
        document.removeEventListener('contextmenu', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
      document.addEventListener('contextmenu', closeHandler);
    }, 10);
  }

  _renderMqTable(qData, originalIdx, state, isLocked, isSubmitted, userAnswer) {
    const container = document.createElement('div');
    container.className = 'mq-container mq-mode-table';
    container.dataset.originalIdx = originalIdx;

    const card = document.createElement('div');
    card.className = 'mq-table-card';

    const topBar = document.createElement('div');
    topBar.className = 'mq-table-topbar';

    const zoomGroup = document.createElement('div');
    zoomGroup.className = 'mq-topbar-group';

    let currentFontSize = 14;
    const minFontSize = 10;
    const maxFontSize = 18;

    const btnZoomOut = document.createElement('button');
    btnZoomOut.type = 'button';
    btnZoomOut.className = 'btn-mq-tool btn-mq-zoom';
    btnZoomOut.title = 'Diminuir fonte da tabela (A−)';
    btnZoomOut.textContent = 'A−';
    btnZoomOut.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentFontSize > minFontSize) {
        currentFontSize--;
        container.style.setProperty('--mq-table-font-size', `${currentFontSize}px`);
      }
    });

    const btnZoomIn = document.createElement('button');
    btnZoomIn.type = 'button';
    btnZoomIn.className = 'btn-mq-tool btn-mq-zoom';
    btnZoomIn.title = 'Aumentar fonte da tabela (A+)';
    btnZoomIn.textContent = 'A+';
    btnZoomIn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentFontSize < maxFontSize) {
        currentFontSize++;
        container.style.setProperty('--mq-table-font-size', `${currentFontSize}px`);
      }
    });

    zoomGroup.appendChild(btnZoomOut);
    zoomGroup.appendChild(btnZoomIn);

    const btnExpand = document.createElement('button');
    btnExpand.type = 'button';
    btnExpand.className = 'btn-mq-tool btn-mq-expand';
    btnExpand.title = 'Expandir tabela';
    btnExpand.innerHTML = '⛶ Expandir';

    const closeExpand = () => {
      container.classList.remove('mq-is-expanded');
      btnExpand.innerHTML = '⛶ Expandir';
      btnExpand.classList.remove('active');
      document.body.classList.remove('mq-has-expanded');
    };

    const toggleExpand = () => {
      const isExp = container.classList.toggle('mq-is-expanded');
      btnExpand.innerHTML = isExp ? '✕ Fechar expansão' : '⛶ Expandir';
      btnExpand.classList.toggle('active', isExp);
      document.body.classList.toggle('mq-has-expanded', isExp);
    };

    btnExpand.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleExpand();
    });

    container.addEventListener('click', (e) => {
      if (container.classList.contains('mq-is-expanded') && e.target === container) {
        closeExpand();
      }
    });

    const escHandler = (e) => {
      if (!container.isConnected) {
        window.removeEventListener('keydown', escHandler);
        return;
      }
      if (e.key === 'Escape' && container.classList.contains('mq-is-expanded')) {
        closeExpand();
      }
    };
    window.addEventListener('keydown', escHandler);

    topBar.appendChild(zoomGroup);
    topBar.appendChild(btnExpand);
    card.appendChild(topBar);

    const wrapper = document.createElement('div');
    wrapper.className = 'mq-table-wrapper';

    const leftColName = (qData.coluna_esquerda && qData.coluna_esquerda.nome) || 'Coluna I';
    const rightColName = (qData.coluna_direita && qData.coluna_direita.nome) || 'Coluna II';

    const leftItens = (qData.coluna_esquerda && qData.coluna_esquerda.itens) || [];
    const rightItens = (qData.coluna_direita && qData.coluna_direita.itens) || [];

    const mqMap = state.mappings.altOrder[originalIdx] || {};
    const leftIndices = Array.isArray(mqMap.left) ? mqMap.left : Array.from({ length: leftItens.length }, (_, i) => i);
    const rightIndices = Array.isArray(mqMap.right) ? mqMap.right : Array.from({ length: rightItens.length }, (_, i) => i);

    let userConns = (userAnswer && Array.isArray(userAnswer.connections)) ? [...userAnswer.connections] : [];
    const gabMap = parseMqGabarito(qData);

    const userMap = new Map();
    userConns.forEach((c) => {
      const l = c.leftOrigIdx !== undefined ? c.leftOrigIdx : c.left;
      const r = c.rightOrigIdx !== undefined ? c.rightOrigIdx : c.right;
      if (!userMap.has(l)) userMap.set(l, new Set());
      userMap.get(l).add(r);
    });

    const table = document.createElement('table');
    table.className = 'matching-table';

    const thead = document.createElement('thead');

    const tr1 = document.createElement('tr');
    const thLeftGroup = document.createElement('th');
    thLeftGroup.setAttribute('colspan', '2');
    thLeftGroup.setAttribute('rowspan', '3');
    thLeftGroup.className = 'group-header';
    thLeftGroup.textContent = leftColName;

    // Divisor arrastável (estilo Excel) para redimensionar a Coluna I
    const resizerCol1 = document.createElement('div');
    resizerCol1.className = 'mq-col-resizer mq-resizer-col1';
    resizerCol1.title = 'Arrastar para redimensionar Coluna I (duplo clique para restaurar)';
    thLeftGroup.appendChild(resizerCol1);

    let startX = 0;
    let startW = 0;

    resizerCol1.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      startX = e.clientX;
      const drugEl = wrapper.querySelector('.drug-name');
      startW = drugEl ? drugEl.getBoundingClientRect().width : 160;
      resizerCol1.classList.add('is-resizing');
      resizerCol1.setPointerCapture(e.pointerId);

      const onPointerMove = (pe) => {
        const dx = pe.clientX - startX;
        const newW = Math.max(80, Math.min(420, startW + dx));
        container.style.setProperty('--mq-col1-width', `${newW}px`);
      };

      const onPointerUp = (pe) => {
        resizerCol1.classList.remove('is-resizing');
        resizerCol1.removeEventListener('pointermove', onPointerMove);
        resizerCol1.removeEventListener('pointerup', onPointerUp);
        resizerCol1.removeEventListener('pointercancel', onPointerUp);
      };

      resizerCol1.addEventListener('pointermove', onPointerMove);
      resizerCol1.addEventListener('pointerup', onPointerUp);
      resizerCol1.addEventListener('pointercancel', onPointerUp);
    });

    resizerCol1.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      container.style.removeProperty('--mq-col1-width');
    });

    tr1.appendChild(thLeftGroup);

    const thRightGroup = document.createElement('th');
    thRightGroup.setAttribute('colspan', String(rightIndices.length));
    thRightGroup.className = 'group-header';
    thRightGroup.textContent = rightColName;
    tr1.appendChild(thRightGroup);
    thead.appendChild(tr1);

    // Helper para conectar redimensionador da Coluna II com sincronização global
    const attachCol2Resizer = (resizerEl, visIdx) => {
      resizerEl.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startX = e.clientX;
        const thTextEl = wrapper.querySelectorAll('.effect-text')[visIdx] || resizerEl.parentElement;
        startW = thTextEl.getBoundingClientRect().width;
        resizerEl.classList.add('is-resizing');
        resizerEl.setPointerCapture(e.pointerId);

        const onPointerMove = (pe) => {
          const dx = pe.clientX - startX;
          const newW = Math.max(70, Math.min(420, startW + dx));
          container.style.setProperty('--mq-col2-width', `${newW}px`);
        };

        const onPointerUp = (pe) => {
          resizerEl.classList.remove('is-resizing');
          resizerEl.removeEventListener('pointermove', onPointerMove);
          resizerEl.removeEventListener('pointerup', onPointerUp);
          resizerEl.removeEventListener('pointercancel', onPointerUp);
        };

        resizerEl.addEventListener('pointermove', onPointerMove);
        resizerEl.addEventListener('pointerup', onPointerUp);
        resizerEl.addEventListener('pointercancel', onPointerUp);
      });

      resizerEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        container.style.removeProperty('--mq-col2-width');
      });
    };

    const tr2 = document.createElement('tr');
    rightIndices.forEach((_, visIdx) => {
      const thCode = document.createElement('th');
      thCode.className = 'effect-code';
      thCode.textContent = String.fromCharCode(65 + visIdx);

      // Divisor estilo Excel entre as letras (visível exceto na última coluna)
      if (visIdx < rightIndices.length - 1) {
        const resizerCode = document.createElement('div');
        resizerCode.className = 'mq-col-resizer mq-resizer-col2';
        resizerCode.title = 'Arrastar para redimensionar Coluna II (duplo clique para restaurar)';
        thCode.appendChild(resizerCode);
        attachCol2Resizer(resizerCode, visIdx);
      }

      tr2.appendChild(thCode);
    });
    thead.appendChild(tr2);

    const tr3 = document.createElement('tr');
    rightIndices.forEach((origIdx, visIdx) => {
      const thText = document.createElement('th');
      thText.className = 'effect-text';
      const item = rightItens[origIdx] || {};
      thText.innerHTML = formatText(item.texto, originalIdx, state.mappings.altOrder);

      // Divisor estilo Excel entre os itens de texto (visível exceto na última coluna)
      if (visIdx < rightIndices.length - 1) {
        const resizerText = document.createElement('div');
        resizerText.className = 'mq-col-resizer mq-resizer-col2';
        resizerText.title = 'Arrastar para redimensionar Coluna II (duplo clique para restaurar)';
        thText.appendChild(resizerText);
        attachCol2Resizer(resizerText, visIdx);
      }

      tr3.appendChild(thText);
    });
    thead.appendChild(tr3);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    leftIndices.forEach((lOrigIdx, lVisIdx) => {
      const lItem = leftItens[lOrigIdx] || {};
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      tdId.className = 'item-id';
      tdId.textContent = String(lVisIdx + 1);
      tr.appendChild(tdId);

      const tdName = document.createElement('td');
      tdName.className = 'drug-name';
      tdName.innerHTML = formatText(lItem.texto, originalIdx, state.mappings.altOrder);
      tr.appendChild(tdName);

      const targetSet = gabMap.get(lOrigIdx) || new Set();
      const markedSet = userMap.get(lOrigIdx) || new Set();

      let rowHasError = false;
      if (isSubmitted) {
        markedSet.forEach((r) => {
          if (!targetSet.has(r)) rowHasError = true;
        });
      }

      rightIndices.forEach((rOrigIdx) => {
        const tdChoice = document.createElement('td');
        const isMarked = markedSet.has(rOrigIdx);
        const inGabarito = targetSet.has(rOrigIdx);

        let cellClass = 'choice';
        let cellChar = isMarked ? '●' : '○';

        if (!isSubmitted) {
          cellClass += isMarked ? ' selected' : ' empty';
        } else {
          cellClass += ' mq-cell-disabled';
          if (isMarked && inGabarito) {
            cellClass += ' selected mq-cell-correct';
            cellChar = '●';
          } else if (isMarked && !inGabarito) {
            cellClass += ' selected mq-cell-wrong';
            cellChar = '✕';
          } else if (!isMarked && inGabarito) {
            cellClass += ' empty mq-cell-missed';
            cellChar = '○';
          } else if (!isMarked && inGabarito && rowHasError) {
            cellClass += ' empty mq-cell-solution';
            cellChar = '●';
          } else {
            cellClass += ' empty';
            cellChar = '○';
          }
        }

        tdChoice.className = cellClass;
        tdChoice.textContent = cellChar;
        tdChoice.dataset.left = lOrigIdx;
        tdChoice.dataset.right = rOrigIdx;

        if (!isLocked && !isSubmitted) {
          tdChoice.addEventListener('click', () => {
            if (this.container.classList.contains('selection-mode')) return;
            const alreadySelected = tdChoice.classList.contains('selected');
            if (alreadySelected) {
              tdChoice.classList.remove('selected');
              tdChoice.classList.add('empty');
              tdChoice.textContent = '○';
              userConns = userConns.filter((c) => {
                const l = c.leftOrigIdx !== undefined ? c.leftOrigIdx : c.left;
                const r = c.rightOrigIdx !== undefined ? c.rightOrigIdx : c.right;
                return !(l === lOrigIdx && r === rOrigIdx);
              });
            } else {
              tdChoice.classList.add('selected');
              tdChoice.classList.remove('empty');
              tdChoice.textContent = '●';
              userConns.push({ leftOrigIdx: lOrigIdx, rightOrigIdx: rOrigIdx });
            }
            if (this.callbacks.onMqChange) {
              this.callbacks.onMqChange(originalIdx, userConns);
            }
          });
        }

        tr.appendChild(tdChoice);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    card.appendChild(wrapper);
    container.appendChild(card);

    return container;
  }

  _renderMqTextualGabarito(qData, originalIdx, state) {
    const leftItens = (qData.coluna_esquerda && qData.coluna_esquerda.itens) || [];
    const rightItens = (qData.coluna_direita && qData.coluna_direita.itens) || [];
    const mqMap = state.mappings.altOrder[originalIdx] || {};
    const leftIndices = Array.isArray(mqMap.left) ? mqMap.left : Array.from({ length: leftItens.length }, (_, i) => i);
    const rightIndices = Array.isArray(mqMap.right) ? mqMap.right : Array.from({ length: rightItens.length }, (_, i) => i);

    const gabMap = parseMqGabarito(qData);

    const itemsHtml = leftIndices.map((lOrigIdx, lVisIdx) => {
      const lItem = leftItens[lOrigIdx] || {};
      const targetSet = gabMap.get(lOrigIdx) || new Set();
      const letters = Array.from(targetSet).map((rOrig) => {
        const rVis = rightIndices.indexOf(rOrig);
        return rVis !== -1 ? String.fromCharCode(65 + rVis) : '?';
      }).sort();

      const letterDisplay = letters.length > 0 ? letters.join(', ') : 'nenhum';
      const cleanText = (lItem.texto || '').replace(/<[^>]+>/g, '').trim();
      return `<span class="mq-textual-gabarito-item"><strong>${lVisIdx + 1}</strong> (${cleanText}) ➔ <strong>[ ${letterDisplay} ]</strong></span>`;
    }).join('');

    return `
      <div class="mq-textual-gabarito-title">✔ Gabarito Oficial:</div>
      <div class="mq-textual-gabarito-list">${itemsHtml}</div>
    `;
  }


  // ===================== ESCRITA helpers =====================

  _hasQuestionComments(qData, tipo) {
    if (qData.comentario_geral || qData.comentario) return true;
    if (tipo === 'CH' || tipo === 'MVF') {
      return Array.isArray(qData.assertivas) && qData.assertivas.some((ass) => ass.comentario);
    }
    if (tipo === 'ESCRITA') {
      return Array.isArray(qData.itens) && qData.itens.some((item) => item.comentario || item.gabarito);
    }
    return Array.isArray(qData.alternativas) && qData.alternativas.some((alt) => alt.comentario);
  }

  _createToggleCommentsButton(wrapper, originalIdx, position = 'main') {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `btn-toggle-comments btn-toggle-comments-${position}`;
    toggleBtn.type = 'button';
    const updateText = () => {
      const isCollapsed = wrapper.classList.contains('comments-collapsed');
      if (position === 'main') {
        toggleBtn.textContent = isCollapsed ? '📖 Exibir comentários' : '📕 Ocultar comentários';
      } else {
        toggleBtn.textContent = '📕 Ocultar comentários';
      }
      wrapper.querySelectorAll('.btn-toggle-comments-main').forEach((btn) => {
        btn.textContent = isCollapsed ? '📖 Exibir comentários' : '📕 Ocultar comentários';
      });
      wrapper.querySelectorAll('.btn-toggle-comments-end').forEach((btn) => {
        btn.textContent = '📕 Ocultar comentários';
        btn.classList.toggle('hidden', isCollapsed || !this._shouldShowEndCommentToggle(wrapper));
      });
    };
    updateText();
    toggleBtn.addEventListener('click', () => {
      const wasCollapsed = wrapper.classList.contains('comments-collapsed');
      const shouldRestoreCardPosition = position === 'end' && !wasCollapsed;
      const targetTop = shouldRestoreCardPosition
        ? window.scrollY + wrapper.getBoundingClientRect().top - 16
        : null;

      wrapper.classList.toggle('comments-collapsed');
      updateText();
      if (this.callbacks.onToggleComments) {
        this.callbacks.onToggleComments(originalIdx, !wrapper.classList.contains('comments-collapsed'));
      }
      if (targetTop !== null) {
        requestAnimationFrame(() => {
          window.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'instant'
          });
        });
      }
    });
    return toggleBtn;
  }

  _shouldShowEndCommentToggle(wrapper) {
    if (!wrapper || wrapper.classList.contains('comments-collapsed')) return false;
    const endBtn = wrapper.querySelector('.btn-toggle-comments-end');
    if (!endBtn) return false;

    const comments = Array.from(wrapper.querySelectorAll('.specific-comment, .general-comment, .escrita-submitted-text, .escrita-item-submitted'));
    if (comments.length === 0) return false;

    const first = comments[0];
    const last = comments[comments.length - 1];
    const top = first.getBoundingClientRect().top;
    const bottom = last.getBoundingClientRect().bottom;
    return (bottom - top) > (window.innerHeight - 80);
  }

  refreshCommentToggleVisibility(card) {
    if (!card) return;
    const isCollapsed = card.classList.contains('comments-collapsed');
    card.querySelectorAll('.btn-toggle-comments-main').forEach((btn) => {
      btn.textContent = isCollapsed ? '📖 Exibir comentários' : '📕 Ocultar comentários';
    });
    card.querySelectorAll('.btn-toggle-comments-end').forEach((btn) => {
      btn.textContent = '📕 Ocultar comentários';
      btn.classList.toggle('hidden', isCollapsed || !this._shouldShowEndCommentToggle(card));
    });
  }

  _createEscritaContent(qData, originalIdx, state, isForced, isSubmitted, userAnswer) {
    const isItemsType = qData.subtipo === 'itens' || (Array.isArray(qData.itens) && qData.itens.length > 0);
    const container = document.createElement('div');
    container.className = 'escrita-content';

    if (isForced) {
      // Questão de contexto: apenas indica que é escrita
      const note = document.createElement('div');
      note.className = 'escrita-forced-note';
      note.textContent = isItemsType
        ? `[Questão dissertativa com ${(qData.itens || []).length} itens]`
        : '[Questão dissertativa]';
      container.appendChild(note);
      return container;
    }

    if (!isItemsType) {
      // ---- ESCRITA SIMPLES ----
      const savedText = (userAnswer && userAnswer.text) || '';

      if (!isSubmitted) {
        const textarea = this._createAutoTextarea(savedText, (val) => {
          if (this.callbacks.onEscritaTextChange) {
            this.callbacks.onEscritaTextChange(originalIdx, val, null);
          }
        });
        container.appendChild(textarea);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'action-bar';
        const btn = document.createElement('button');
        btn.className = 'btn btn-submit';
        btn.innerText = 'Enviar Resposta';
        btn.addEventListener('click', () => {
          if (this.callbacks.onEscritaItemSubmit) {
            this.callbacks.onEscritaItemSubmit(originalIdx, null, textarea.value);
          }
        });
        actionsDiv.appendChild(btn);
        container.appendChild(actionsDiv);
      } else {
        // Resposta enviada
        const userTextDiv = document.createElement('div');
        userTextDiv.className = 'escrita-submitted-text';
        userTextDiv.innerHTML = `<strong>Sua resposta:</strong><br>${
          savedText ? this._escapeAndBreak(savedText) : '<em>Sem resposta</em>'
        }`;
        container.appendChild(userTextDiv);

        // Autoavaliação (entre resposta e gabarito)
        const selfEvalVal = userAnswer && typeof userAnswer.selfEval === 'number'
          ? userAnswer.selfEval : null;
        container.appendChild(this._createSelfEvalSection(originalIdx, null, selfEvalVal));

        // Gabarito
        if (qData.gabarito) {
          const gabDiv = document.createElement('div');
          gabDiv.className = 'escrita-gabarito';
          gabDiv.innerHTML = `<strong>Gabarito:</strong><br>${this._htmlWithBreaks(qData.gabarito)}`;
          container.appendChild(gabDiv);
        }
      }
    } else {
      // ---- ESCRITA COM ITENS ----
      const ansItems = (userAnswer && Array.isArray(userAnswer.items)) ? userAnswer.items : [];

      (qData.itens || []).forEach((item, itemIdx) => {
        const letter = String.fromCharCode(65 + itemIdx);
        const itemAns = ansItems[itemIdx] || {};
        const itemSubmitted = itemAns.submitted === true;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'escrita-item' + (itemSubmitted ? ' escrita-item-submitted' : '');

        const itemHeader = document.createElement('div');
        itemHeader.className = 'escrita-item-header';
        itemHeader.innerHTML = `<strong>${letter})</strong> ${item.pergunta || ''}`;
        itemDiv.appendChild(itemHeader);

        if (!itemSubmitted) {
          const savedItemText = itemAns.text || '';
          const textarea = this._createAutoTextarea(savedItemText, (val) => {
            if (this.callbacks.onEscritaTextChange) {
              this.callbacks.onEscritaTextChange(originalIdx, val, itemIdx);
            }
          });
          itemDiv.appendChild(textarea);

          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'action-bar';
          const btn = document.createElement('button');
          btn.className = 'btn btn-submit';
          btn.innerText = 'Enviar Resposta';
          btn.addEventListener('click', () => {
            if (this.callbacks.onEscritaItemSubmit) {
              this.callbacks.onEscritaItemSubmit(originalIdx, itemIdx, textarea.value);
            }
          });
          actionsDiv.appendChild(btn);
          itemDiv.appendChild(actionsDiv);
        } else {
          const savedItemText = itemAns.text || '';
          const userTextDiv = document.createElement('div');
          userTextDiv.className = 'escrita-submitted-text';
          userTextDiv.innerHTML = `<strong>Sua resposta:</strong><br>${
            savedItemText ? this._escapeAndBreak(savedItemText) : '<em>Sem resposta</em>'
          }`;
          itemDiv.appendChild(userTextDiv);

          // Autoavaliação
          const selfEvalVal = typeof itemAns.selfEval === 'number' ? itemAns.selfEval : null;
          itemDiv.appendChild(this._createSelfEvalSection(originalIdx, itemIdx, selfEvalVal));

          // Gabarito do item
          if (item.gabarito) {
            const gabDiv = document.createElement('div');
            gabDiv.className = 'escrita-gabarito';
            gabDiv.innerHTML = `<strong>Gabarito:</strong><br>${this._htmlWithBreaks(item.gabarito)}`;
            itemDiv.appendChild(gabDiv);
          }

          // Comentário específico do item (opcional)
          if (item.comentario) {
            const cmtDiv = document.createElement('div');
            cmtDiv.className = 'escrita-item-comentario';
            cmtDiv.innerHTML = `<strong>Comentário:</strong><br>${item.comentario}`;
            itemDiv.appendChild(cmtDiv);
          }
        }

        container.appendChild(itemDiv);
      });
    }

    return container;
  }

  _createAutoTextarea(initialValue, onChangeCallback) {
    const textarea = document.createElement('textarea');
    textarea.className = 'escrita-textarea';
    textarea.rows = 4;
    textarea.placeholder = 'Digite sua resposta aqui...';
    textarea.value = initialValue;

    const autoResize = () => {
      textarea.style.height = 'auto';
      const minH = parseInt(getComputedStyle(textarea).minHeight, 10) || 96;
      textarea.style.height = Math.max(minH, textarea.scrollHeight) + 'px';
    };

    // Resize após inserção no DOM
    requestAnimationFrame(autoResize);

    textarea.addEventListener('input', () => {
      autoResize();
      if (onChangeCallback) onChangeCallback(textarea.value);
    });

    return textarea;
  }

  _createSelfEvalSection(qIdx, itemIdx, currentScore) {
    const section = document.createElement('div');
    section.className = 'self-eval-section';

    const label = document.createElement('div');
    label.className = 'self-eval-label';
    label.textContent = 'Autoavaliação — compare com o gabarito e avalie de 0 a 10:';
    section.appendChild(label);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'self-eval-buttons';

    for (let i = 0; i <= 10; i++) {
      const btn = document.createElement('button');
      btn.className = 'self-eval-btn' + (i === currentScore ? ' selected' : '');
      btn.type = 'button';
      btn.textContent = i;

      const score = i; // capture
      btn.addEventListener('click', () => {
        if (this.callbacks.onSelfEval) {
          this.callbacks.onSelfEval(qIdx, score, itemIdx);
        }
      });

      buttonsDiv.appendChild(btn);
    }

    section.appendChild(buttonsDiv);
    return section;
  }

  _escapeAndBreak(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  _htmlWithBreaks(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
  }

  // ===================== Marca-texto V3.9 =====================

  _highlightTargetKey(target) {
    return `${target.type}:${String(target.id)}`;
  }

  _getHighlightSettings() {
    const saved = (this._state && this._state.highlightSettings) || {};
    const color = HIGHLIGHT_COLOR_KEYS.has(saved.color) ? saved.color : 'yellow';
    const rawOpacity = Number(saved.opacity);
    const opacity = Number.isFinite(rawOpacity)
      ? Math.min(0.9, Math.max(0.15, rawOpacity))
      : 0.42;
    return { color, opacity };
  }

  _getTextHighlights(target) {
    if (!this._state || !this._state.textHighlights) return [];
    const bucketName = target.type === 'group' ? 'groups' : 'questions';
    const bucket = this._state.textHighlights[bucketName] || {};
    const highlights = bucket[String(target.id)];
    return Array.isArray(highlights) ? highlights : [];
  }

  _setTextHighlights(target, highlights) {
    const clean = Array.isArray(highlights) ? highlights : [];
    if (this.callbacks.onSetTextHighlights) {
      this.callbacks.onSetTextHighlights(target.type, String(target.id), clean);
    }
  }

  _createHighlighterControlsHtml() {
    const settings = this._getHighlightSettings();
    return `
      <button class="btn-highlight-color hidden" type="button" title="Escolher cor e opacidade do marca-texto">
        <span>Cor</span><span class="highlight-color-swatch" data-color="${settings.color}" aria-hidden="true"></span>
      </button>
      <span class="highlighter-button-group">
        <button class="btn-highlighter" type="button" aria-pressed="false" title="Ativar marca-texto neste enunciado">
          🖍️ Marca-texto
        </button>
        <button class="btn-highlighter-settings" type="button" aria-label="Opções do marca-texto" title="Opções do marca-texto">
          ⚙️
        </button>
      </span>
    `;
  }

  _setupHighlighterControls(scope, target) {
    if (!scope) return;
    const targetKey = this._highlightTargetKey(target);
    const highlighterBtn = scope.querySelector('.btn-highlighter');
    const settingsBtn = scope.querySelector('.btn-highlighter-settings');
    const colorBtn = scope.querySelector('.btn-highlight-color');
    if (!highlighterBtn || !settingsBtn || !colorBtn) return;

    highlighterBtn.dataset.highlightTargetKey = targetKey;
    settingsBtn.dataset.highlightTargetKey = targetKey;
    colorBtn.dataset.highlightTargetKey = targetKey;
    const isActive = this._activeHighlightTargetKey === targetKey;
    highlighterBtn.classList.toggle('active', isActive);
    highlighterBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    colorBtn.classList.toggle('hidden', !isActive);

    highlighterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._hideHighlightPopover();
      if (this._activeHighlightTargetKey === targetKey) {
        this._deactivateHighlighter();
        return;
      }
      this._activateHighlighter(target);
    });

    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showHighlighterToolMenu(settingsBtn, target);
    });

    colorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showHighlightColorMenu(colorBtn.getBoundingClientRect(), target, null);
    });
  }

  _activateHighlighter(target) {
    const targetKey = this._highlightTargetKey(target);
    this._cancelTouchHighlightGesture();
    this.container.classList.remove('selection-mode');
    this.container.querySelectorAll('.btn-selection-mode').forEach((btn) => {
      btn.classList.remove('active');
    });
    this._activeHighlightTargetKey = targetKey;
    this._hiddenHighlightTargets.delete(targetKey);
    this._updateHighlighterControls();
    const entry = this._highlightTargets.get(targetKey);
    if (entry) entry.element.classList.remove('highlights-hidden');
  }

  _deactivateHighlighter() {
    this._cancelTouchHighlightGesture();
    this._activeHighlightTargetKey = null;
    this._hideHighlightPopover();
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
    this._updateHighlighterControls();
  }

  _updateHighlighterControls() {
    const settings = this._getHighlightSettings();
    this.container.querySelectorAll('.btn-highlighter').forEach((btn) => {
      const active = btn.dataset.highlightTargetKey === this._activeHighlightTargetKey;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.title = active
        ? 'Desativar marca-texto neste enunciado'
        : 'Ativar marca-texto neste enunciado';
    });
    this.container.querySelectorAll('.btn-highlight-color').forEach((btn) => {
      const active = btn.dataset.highlightTargetKey === this._activeHighlightTargetKey;
      btn.classList.toggle('hidden', !active);
      const swatch = btn.querySelector('.highlight-color-swatch');
      if (swatch) swatch.dataset.color = settings.color;
    });
    this._highlightTargets.forEach((entry, key) => {
      entry.element.classList.toggle('highlighter-active', key === this._activeHighlightTargetKey);
      entry.element.classList.toggle('touch-highlighter-supported', this._supportsDirectTouchHighlight);
      entry.element.classList.toggle('highlights-hidden', this._hiddenHighlightTargets.has(key));
    });
  }

  _registerHighlightTarget(element, target, sourceIdentity = '') {
    if (!element) return;
    const targetKey = this._highlightTargetKey(target);
    const entry = {
      element,
      target: { type: target.type, id: String(target.id) },
      sourceHtml: element.innerHTML,
      sourceHash: this._hashHighlightSource(String(sourceIdentity || ''))
    };
    element.dataset.highlightTargetKey = targetKey;
    this._highlightTargets.set(targetKey, entry);
    this._renderTextHighlights(entry);

    element.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      setTimeout(() => this._captureHighlightSelection(entry), 0);
    });

    if (this._supportsDirectTouchHighlight) {
      this._setupTouchHighlighterListeners(element, entry);
    } else {
      let fallbackTouchTimer = null;
      element.addEventListener('touchend', () => {
        clearTimeout(fallbackTouchTimer);
        fallbackTouchTimer = setTimeout(() => {
          this._captureHighlightSelection(entry);
        }, 280);
      }, { passive: true });
    }

    element.addEventListener('contextmenu', (e) => {
      const fragment = e.target.closest && e.target.closest('.text-highlight');
      if (!fragment || !element.contains(fragment)) {
        const touchModeActive =
          this._supportsDirectTouchHighlight &&
          this._activeHighlightTargetKey === targetKey &&
          window.matchMedia &&
          window.matchMedia('(pointer: coarse)').matches;
        if (touchModeActive) e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this._showHighlightContextMenu(fragment.getBoundingClientRect(), entry, fragment.dataset.highlightId);
    });

    element.addEventListener('click', (e) => {
      const fragment = e.target.closest && e.target.closest('.text-highlight');
      if (!fragment || !element.contains(fragment)) return;
      const touchLikeClick =
        e.pointerType === 'touch' ||
        e.pointerType === 'pen' ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      if (!touchLikeClick) return;
      if (Date.now() < this._suppressHighlightTapUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      this._showHighlightContextMenu(fragment.getBoundingClientRect(), entry, fragment.dataset.highlightId);
    });

    element.addEventListener('keydown', (e) => {
      const fragment = e.target.closest && e.target.closest('.text-highlight');
      if (!fragment || !element.contains(fragment)) return;
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10') && e.key !== 'Enter') return;
      e.preventDefault();
      this._showHighlightContextMenu(fragment.getBoundingClientRect(), entry, fragment.dataset.highlightId);
    });

    this._updateHighlighterControls();
  }

  _setupTouchHighlighterListeners(element, entry) {
    element.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
      if (e.button !== 0) return;
      if (this._activeHighlightTargetKey !== this._highlightTargetKey(entry.target)) return;
      const existingHighlight = e.target.closest && e.target.closest('.text-highlight');
      if (existingHighlight && element.contains(existingHighlight)) return;

      const startOffset = this._getTextOffsetFromPoint(entry.element, e.clientX, e.clientY);
      if (startOffset === null) return;
      const anchorWord = this._getTouchWordBounds(entry.element.textContent || '', startOffset, 0);
      if (!anchorWord) return;

      this._cancelTouchHighlightGesture();
      this._hideHighlightPopover();
      const selection = window.getSelection();
      if (selection) selection.removeAllRanges();

      this._touchHighlightGesture = {
        entry,
        element,
        pointerId: e.pointerId,
        startOffset,
        currentOffset: startOffset,
        anchorWord,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
        autoScrollVelocity: 0,
        settings: this._getHighlightSettings()
      };
      element.classList.add('touch-highlighting');
      try { element.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    element.addEventListener('pointermove', (e) => {
      const gesture = this._touchHighlightGesture;
      if (!gesture || gesture.pointerId !== e.pointerId || gesture.element !== element) return;
      gesture.lastX = e.clientX;
      gesture.lastY = e.clientY;

      if (!gesture.active) {
        const distance = Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY);
        if (distance < 5) {
          e.preventDefault();
          return;
        }
        gesture.active = true;
      }

      const offset = this._getTextOffsetFromPoint(entry.element, e.clientX, e.clientY);
      if (offset !== null) gesture.currentOffset = offset;
      this._updateTouchHighlightAutoScroll(e.clientY);
      this._scheduleTouchHighlightPreview();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    element.addEventListener('pointerup', (e) => {
      this._finishTouchHighlightGesture(e, true);
    }, { passive: false });

    element.addEventListener('pointercancel', (e) => {
      this._finishTouchHighlightGesture(e, false);
    });

    element.addEventListener('lostpointercapture', (e) => {
      const gesture = this._touchHighlightGesture;
      if (gesture && gesture.pointerId === e.pointerId && gesture.element === element) {
        this._finishTouchHighlightGesture(e, false);
      }
    });
  }

  _getTextOffsetFromPoint(root, clientX, clientY) {
    if (!root || !root.isConnected) return null;
    const bounds = root.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;

    const x = Math.max(bounds.left + 1, Math.min(bounds.right - 1, clientX));
    const visibleTop = Math.max(bounds.top + 1, 1);
    const visibleBottom = Math.min(bounds.bottom - 1, window.innerHeight - 1);
    const y = visibleTop <= visibleBottom
      ? Math.max(visibleTop, Math.min(visibleBottom, clientY))
      : Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, clientY));

    let node = null;
    let offset = 0;
    const previewLayer = this._touchHighlightPreviewLayer;
    const previousPreviewVisibility = previewLayer ? previewLayer.style.visibility : '';
    if (previewLayer) previewLayer.style.visibility = 'hidden';
    try {
      if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        if (position) {
          node = position.offsetNode;
          offset = position.offset;
        }
      }
      if (!node && document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range) {
          node = range.startContainer;
          offset = range.startOffset;
        }
      }
    } catch {
      return null;
    } finally {
      if (previewLayer) previewLayer.style.visibility = previousPreviewVisibility;
    }

    if (!node || (node !== root && !root.contains(node))) return null;
    const textLength = (root.textContent || '').length;
    return Math.max(0, Math.min(textLength, this._getTextBoundaryOffset(root, node, offset)));
  }

  _normalizeHighlightOffsets(root, rawStart, rawEnd) {
    const fullText = (root && root.textContent) || '';
    let start = Math.max(0, Math.min(fullText.length, Math.min(rawStart, rawEnd)));
    let end = Math.max(0, Math.min(fullText.length, Math.max(rawStart, rawEnd)));
    while (start < end && /\s/.test(fullText[start])) start++;
    while (end > start && /\s/.test(fullText[end - 1])) end--;
    return end > start ? { start, end } : null;
  }

  _isHighlightWordCoreCharacter(character) {
    return !!character && /[\p{L}\p{N}\p{M}_]/u.test(character);
  }

  _isHighlightWordCharacterAt(text, index) {
    if (!text || index < 0 || index >= text.length) return false;
    if (this._isHighlightWordCoreCharacter(text[index])) return true;
    if (!['-', "'", '’'].includes(text[index])) return false;
    return this._isHighlightWordCoreCharacter(text[index - 1]) &&
      this._isHighlightWordCoreCharacter(text[index + 1]);
  }

  _getTouchWordBounds(text, rawOffset, direction = 0) {
    if (!text) return null;
    const offset = Math.max(0, Math.min(text.length, Number(rawOffset) || 0));
    let index = -1;

    if (offset < text.length && this._isHighlightWordCharacterAt(text, offset)) {
      index = offset;
    } else if (offset > 0 && this._isHighlightWordCharacterAt(text, offset - 1)) {
      index = offset - 1;
    } else if (direction > 0) {
      for (let i = offset; i < text.length; i++) {
        if (this._isHighlightWordCharacterAt(text, i)) {
          index = i;
          break;
        }
      }
    } else if (direction < 0) {
      for (let i = Math.min(text.length - 1, offset - 1); i >= 0; i--) {
        if (this._isHighlightWordCharacterAt(text, i)) {
          index = i;
          break;
        }
      }
    } else {
      let left = offset - 1;
      let right = offset;
      while (left >= 0 || right < text.length) {
        if (left >= 0 && this._isHighlightWordCharacterAt(text, left)) {
          index = left;
          break;
        }
        if (right < text.length && this._isHighlightWordCharacterAt(text, right)) {
          index = right;
          break;
        }
        left--;
        right++;
      }
    }

    if (index < 0) return null;
    let start = index;
    let end = index + 1;
    while (start > 0 && this._isHighlightWordCharacterAt(text, start - 1)) start--;
    while (end < text.length && this._isHighlightWordCharacterAt(text, end)) end++;
    return { start, end };
  }

  _getTouchWordSnappedRange(gesture) {
    if (!gesture || !gesture.entry || !gesture.anchorWord) return null;
    const text = gesture.entry.element.textContent || '';
    let direction = 0;
    if (gesture.currentOffset > gesture.startOffset) {
      direction = 1;
    } else if (gesture.currentOffset < gesture.startOffset) {
      direction = -1;
    } else {
      const dx = gesture.lastX - gesture.startX;
      const dy = gesture.lastY - gesture.startY;
      direction = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? -1 : 1) : (dx < 0 ? -1 : 1);
    }

    const focusWord = this._getTouchWordBounds(text, gesture.currentOffset, direction);
    if (!focusWord) return null;
    return direction < 0
      ? { start: focusWord.start, end: gesture.anchorWord.end, direction }
      : { start: gesture.anchorWord.start, end: focusWord.end, direction };
  }

  _getTouchHighlightRange(gesture) {
    const snapped = this._getTouchWordSnappedRange(gesture);
    if (!snapped) return null;
    const text = gesture.entry.element.textContent || '';
    const current = this._getTextHighlights(gesture.entry.target)
      .map((item) => ({ start: Number(item.start), end: Number(item.end) }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    let { start, end } = snapped;
    if (snapped.direction > 0) {
      for (const item of current) {
        if (item.end <= start || item.start >= end) continue;
        if (item.start <= start) return null;
        const splitsWord = this._isHighlightWordCharacterAt(text, item.start - 1) &&
          this._isHighlightWordCharacterAt(text, item.start);
        const collisionWord = splitsWord
          ? this._getTouchWordBounds(text, item.start, 0)
          : null;
        end = collisionWord ? collisionWord.start : item.start;
        break;
      }
    } else {
      for (let i = current.length - 1; i >= 0; i--) {
        const item = current[i];
        if (item.start >= end || item.end <= start) continue;
        if (item.end >= end) return null;
        const splitsWord = this._isHighlightWordCharacterAt(text, item.end - 1) &&
          this._isHighlightWordCharacterAt(text, item.end);
        const collisionWord = splitsWord
          ? this._getTouchWordBounds(text, item.end, 0)
          : null;
        start = collisionWord ? collisionWord.end : item.end;
        break;
      }
    }
    return this._normalizeHighlightOffsets(gesture.entry.element, start, end);
  }

  _scheduleTouchHighlightPreview() {
    if (this._touchHighlightPreviewFrame !== null) return;
    this._touchHighlightPreviewFrame = requestAnimationFrame(() => {
      this._touchHighlightPreviewFrame = null;
      this._renderTouchHighlightPreview();
    });
  }

  _renderTouchHighlightPreview() {
    const gesture = this._touchHighlightGesture;
    const offsets = this._getTouchHighlightRange(gesture);
    if (!gesture || !gesture.active || !offsets) {
      this._removeTouchHighlightPreview();
      return;
    }
    const range = this._rangeFromHighlightOffsets(gesture.entry.element, offsets.start, offsets.end);
    if (!range) {
      this._removeTouchHighlightPreview();
      return;
    }

    const rawRects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
      .map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      }));
    const rects = [];
    rawRects.forEach((rect) => {
      const previous = rects[rects.length - 1];
      if (
        previous &&
        Math.abs(previous.top - rect.top) <= 2 &&
        Math.abs(previous.bottom - rect.bottom) <= 2 &&
        rect.left <= previous.right + 2
      ) {
        previous.right = Math.max(previous.right, rect.right);
        previous.top = Math.min(previous.top, rect.top);
        previous.bottom = Math.max(previous.bottom, rect.bottom);
      } else {
        rects.push({ ...rect });
      }
    });

    if (!this._touchHighlightPreviewLayer) {
      this._touchHighlightPreviewLayer = document.createElement('div');
      this._touchHighlightPreviewLayer.className = 'touch-highlight-preview-layer';
      document.body.appendChild(this._touchHighlightPreviewLayer);
    }

    const fragment = document.createDocumentFragment();
    rects.forEach((rect) => {
      const segment = document.createElement('div');
      segment.className = 'text-highlight touch-highlight-preview-segment';
      segment.dataset.color = gesture.settings.color;
      segment.style.setProperty('--highlight-opacity', String(gesture.settings.opacity));
      segment.style.left = `${rect.left - 1}px`;
      segment.style.top = `${rect.top + 1}px`;
      segment.style.width = `${Math.max(1, rect.right - rect.left + 2)}px`;
      segment.style.height = `${Math.max(1, rect.bottom - rect.top)}px`;
      fragment.appendChild(segment);
    });
    this._touchHighlightPreviewLayer.replaceChildren(fragment);
  }

  _removeTouchHighlightPreview() {
    if (this._touchHighlightPreviewLayer) {
      this._touchHighlightPreviewLayer.remove();
      this._touchHighlightPreviewLayer = null;
    }
  }

  _updateTouchHighlightAutoScroll(clientY) {
    const gesture = this._touchHighlightGesture;
    if (!gesture || !gesture.active) return;
    const edge = Math.min(80, Math.max(48, window.innerHeight * 0.12));
    let velocity = 0;
    if (clientY < edge) {
      velocity = -Math.ceil(12 * Math.min(1, (edge - clientY) / edge));
    } else if (clientY > window.innerHeight - edge) {
      velocity = Math.ceil(12 * Math.min(1, (clientY - (window.innerHeight - edge)) / edge));
    }
    gesture.autoScrollVelocity = velocity;
    if (velocity !== 0 && this._touchHighlightAutoScrollFrame === null) {
      this._touchHighlightAutoScrollFrame = requestAnimationFrame(() => this._runTouchHighlightAutoScroll());
    }
  }

  _runTouchHighlightAutoScroll() {
    this._touchHighlightAutoScrollFrame = null;
    const gesture = this._touchHighlightGesture;
    if (!gesture || !gesture.active || gesture.autoScrollVelocity === 0) return;
    const before = window.scrollY || window.pageYOffset || 0;
    window.scrollBy(0, gesture.autoScrollVelocity);
    const after = window.scrollY || window.pageYOffset || 0;
    if (after === before) {
      gesture.autoScrollVelocity = 0;
      return;
    }
    const offset = this._getTextOffsetFromPoint(gesture.entry.element, gesture.lastX, gesture.lastY);
    if (offset !== null) gesture.currentOffset = offset;
    this._scheduleTouchHighlightPreview();
    this._touchHighlightAutoScrollFrame = requestAnimationFrame(() => this._runTouchHighlightAutoScroll());
  }

  _finishTouchHighlightGesture(e, shouldCommit) {
    const gesture = this._touchHighlightGesture;
    if (!gesture || (e && gesture.pointerId !== e.pointerId)) return;
    if (e) {
      const offset = this._getTextOffsetFromPoint(gesture.entry.element, e.clientX, e.clientY);
      if (offset !== null) gesture.currentOffset = offset;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const offsets = shouldCommit && gesture.active
      ? this._getTouchHighlightRange(gesture)
      : null;

    this._touchHighlightGesture = null;
    gesture.element.classList.remove('touch-highlighting');
    try {
      if (gesture.element.hasPointerCapture(gesture.pointerId)) {
        gesture.element.releasePointerCapture(gesture.pointerId);
      }
    } catch {}
    if (this._touchHighlightPreviewFrame !== null) {
      cancelAnimationFrame(this._touchHighlightPreviewFrame);
      this._touchHighlightPreviewFrame = null;
    }
    if (this._touchHighlightAutoScrollFrame !== null) {
      cancelAnimationFrame(this._touchHighlightAutoScrollFrame);
      this._touchHighlightAutoScrollFrame = null;
    }
    this._removeTouchHighlightPreview();

    if (gesture.active) this._suppressHighlightTapUntil = Date.now() + 450;
    if (offsets) this._commitTextHighlight(gesture.entry, offsets.start, offsets.end);
  }

  _cancelTouchHighlightGesture() {
    if (this._touchHighlightGesture) {
      this._finishTouchHighlightGesture(null, false);
      return;
    }
    if (this._touchHighlightPreviewFrame !== null) {
      cancelAnimationFrame(this._touchHighlightPreviewFrame);
      this._touchHighlightPreviewFrame = null;
    }
    if (this._touchHighlightAutoScrollFrame !== null) {
      cancelAnimationFrame(this._touchHighlightAutoScrollFrame);
      this._touchHighlightAutoScrollFrame = null;
    }
    this._removeTouchHighlightPreview();
  }

  _captureHighlightSelection(entry) {
    if (!entry || this._activeHighlightTargetKey !== this._highlightTargetKey(entry.target)) return;
    if (!entry.element.isConnected) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!entry.element.contains(range.startContainer) || !entry.element.contains(range.endContainer)) return;

    const start = this._getTextBoundaryOffset(entry.element, range.startContainer, range.startOffset);
    const end = this._getTextBoundaryOffset(entry.element, range.endContainer, range.endOffset);
    this._commitTextHighlight(entry, start, end);
    selection.removeAllRanges();
  }

  _commitTextHighlight(entry, rawStart, rawEnd) {
    if (!entry || !entry.element || !entry.element.isConnected) return false;
    const offsets = this._normalizeHighlightOffsets(entry.element, rawStart, rawEnd);
    if (!offsets) return false;
    const { start, end } = offsets;

    const settings = this._getHighlightSettings();
    const current = this._getTextHighlights(entry.target).map((item) => ({ ...item }));
    const overlaps = current.some((item) => start < Number(item.end) && end > Number(item.start));
    if (overlaps) {
      this._showHighlightToast('Não é possível sobrepor duas marcações.');
      return false;
    }

    const range = this._rangeFromHighlightOffsets(entry.element, start, end);
    const now = new Date().toISOString();
    const highlight = {
      id: this._createHighlightId(),
      start,
      end,
      text: range ? range.toString().trim() : '',
      color: settings.color,
      opacity: settings.opacity,
      sourceHash: entry.sourceHash,
      createdAt: now,
      updatedAt: now
    };
    const merged = this._mergeAdjacentHighlights([...current, highlight], entry);
    this._hiddenHighlightTargets.delete(this._highlightTargetKey(entry.target));
    this._setTextHighlights(entry.target, merged);
    this._refreshHighlightTarget(entry.target);
    return true;
  }

  _getTextBoundaryOffset(root, node, offset) {
    if (!root || !node) return 0;
    let total = 0;

    if (node.nodeType === Node.TEXT_NODE) {
      total = Math.max(0, Math.min(node.textContent.length, offset));
    } else {
      const children = Array.from(node.childNodes || []);
      const limit = Math.max(0, Math.min(children.length, offset));
      for (let i = 0; i < limit; i++) total += this._nodeTextLength(children[i]);
    }

    let current = node;
    while (current && current !== root) {
      let sibling = current.previousSibling;
      while (sibling) {
        total += this._nodeTextLength(sibling);
        sibling = sibling.previousSibling;
      }
      current = current.parentNode;
    }
    return current === root ? total : 0;
  }

  _nodeTextLength(node) {
    return node && node.textContent ? node.textContent.length : 0;
  }

  _collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  _rangeFromHighlightOffsets(root, start, end) {
    const nodes = this._collectTextNodes(root);
    if (nodes.length === 0) return null;
    let cursor = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;

    nodes.forEach((node) => {
      const length = node.textContent.length;
      if (!startNode && start <= cursor + length) {
        startNode = node;
        startOffset = Math.max(0, Math.min(length, start - cursor));
      }
      if (!endNode && end <= cursor + length) {
        endNode = node;
        endOffset = Math.max(0, Math.min(length, end - cursor));
      }
      cursor += length;
    });

    if (!startNode) {
      startNode = nodes[nodes.length - 1];
      startOffset = startNode.textContent.length;
    }
    if (!endNode) {
      endNode = nodes[nodes.length - 1];
      endOffset = endNode.textContent.length;
    }

    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch {
      return null;
    }
  }

  _mergeAdjacentHighlights(highlights, entry, preferredId = null) {
    const sorted = highlights
      .filter((item) => item && Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end)))
      .map((item) => ({ ...item, start: Number(item.start), end: Number(item.end) }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];

    sorted.forEach((item) => {
      const previous = merged[merged.length - 1];
      const sameStyle = previous &&
        previous.color === item.color &&
        Math.abs(Number(previous.opacity) - Number(item.opacity)) < 0.001 &&
        previous.sourceHash === item.sourceHash;
      if (sameStyle && previous.end === item.start) {
        if (preferredId && item.id === preferredId) previous.id = preferredId;
        previous.end = item.end;
        previous.updatedAt = new Date().toISOString();
        const range = this._rangeFromHighlightOffsets(entry.element, previous.start, previous.end);
        previous.text = range ? range.toString().trim() : `${previous.text || ''}${item.text || ''}`;
      } else {
        merged.push(item);
      }
    });
    return merged;
  }

  _renderTextHighlights(entry) {
    if (!entry || !entry.element) return;
    const root = entry.element;
    const rootLength = (root.textContent || '').length;
    const candidateHighlights = this._getTextHighlights(entry.target)
      .filter((item) => {
        const start = Number(item && item.start);
        const end = Number(item && item.end);
        const sourceMatches = !item.sourceHash || item.sourceHash === entry.sourceHash;
        return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= rootLength && sourceMatches;
      })
      .map((item) => ({
        ...item,
        start: Number(item.start),
        end: Number(item.end),
        color: HIGHLIGHT_COLOR_KEYS.has(item.color) ? item.color : 'yellow',
        opacity: Math.min(0.9, Math.max(0.15, Number(item.opacity) || 0.42))
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const highlights = [];
    candidateHighlights.forEach((item) => {
      const previous = highlights[highlights.length - 1];
      if (!previous || item.start >= previous.end) highlights.push(item);
    });

    const textNodes = this._collectTextNodes(root);
    const focusableIds = new Set();
    let globalOffset = 0;

    textNodes.forEach((textNode) => {
      const originalText = textNode.textContent;
      const nodeStart = globalOffset;
      const nodeEnd = nodeStart + originalText.length;
      globalOffset = nodeEnd;
      const intersecting = highlights.filter((item) => item.start < nodeEnd && item.end > nodeStart);
      if (intersecting.length === 0) return;

      const fragment = document.createDocumentFragment();
      let localOffset = 0;
      intersecting.forEach((item) => {
        const markStart = Math.max(0, item.start - nodeStart);
        const markEnd = Math.min(originalText.length, item.end - nodeStart);
        if (markStart > localOffset) {
          fragment.appendChild(document.createTextNode(originalText.slice(localOffset, markStart)));
        }
        if (markEnd > markStart) {
          const span = document.createElement('span');
          span.className = 'text-highlight';
          if (nodeStart + markStart === item.start) {
            span.classList.add('text-highlight-start');
          }
          if (nodeStart + markEnd === item.end) {
            span.classList.add('text-highlight-end');
          }
          span.dataset.highlightId = item.id;
          span.dataset.color = item.color;
          span.style.setProperty('--highlight-opacity', String(item.opacity));
          span.textContent = originalText.slice(markStart, markEnd);
          span.title = 'Botão direito para opções da marcação';
          if (!focusableIds.has(item.id)) {
            span.tabIndex = 0;
            focusableIds.add(item.id);
          }
          fragment.appendChild(span);
        }
        localOffset = Math.max(localOffset, markEnd);
      });
      if (localOffset < originalText.length) {
        fragment.appendChild(document.createTextNode(originalText.slice(localOffset)));
      }
      textNode.parentNode.replaceChild(fragment, textNode);
    });

    const targetKey = this._highlightTargetKey(entry.target);
    root.classList.toggle('highlighter-active', targetKey === this._activeHighlightTargetKey);
    root.classList.toggle('highlights-hidden', this._hiddenHighlightTargets.has(targetKey));
  }

  _refreshHighlightTarget(target) {
    const key = this._highlightTargetKey(target);
    const entry = this._highlightTargets.get(key);
    if (!entry || !entry.element.isConnected) return;
    entry.element.innerHTML = entry.sourceHtml;
    this._renderTextHighlights(entry);
    this._updateHighlighterControls();
  }

  _refreshAllHighlightTargets() {
    this._highlightTargets.forEach((entry) => {
      if (!entry.element.isConnected) return;
      entry.element.innerHTML = entry.sourceHtml;
      this._renderTextHighlights(entry);
    });
    this._updateHighlighterControls();
  }

  _createHighlightId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  _hashHighlightSource(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(36)}`;
  }

  _getHighlightCount() {
    if (!this._state || !this._state.textHighlights) return 0;
    const countBucket = (bucket) => Object.values(bucket || {}).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0
    );
    return countBucket(this._state.textHighlights.questions) +
      countBucket(this._state.textHighlights.groups);
  }

  _showHighlighterToolMenu(anchor, target) {
    const targetKey = this._highlightTargetKey(target);
    const count = this._getTextHighlights(target).length;
    const total = this._getHighlightCount();
    const hidden = this._hiddenHighlightTargets.has(targetKey);
    const targetLabel = target.type === 'group' ? 'deste texto-base' : 'desta questão';
    const menu = document.createElement('div');
    menu.className = 'highlight-popover highlight-tool-menu';
    const active = this._activeHighlightTargetKey === targetKey;
    const directTouchMode =
      this._supportsDirectTouchHighlight &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;
    menu.innerHTML = `
      <div class="highlight-popover-title">Opções do marca-texto</div>
      <button type="button" class="highlight-menu-visibility">
        ${hidden ? '👁️ Mostrar marcações' : '🙈 Ocultar marcações'}
      </button>
      <button type="button" class="highlight-menu-clear-target" ${count === 0 ? 'disabled' : ''}>
        🗑️ Apagar ${targetLabel} (${count})
      </button>
      <button type="button" class="highlight-menu-clear-all danger" ${total === 0 ? 'disabled' : ''}>
        🗑️ Apagar todas da sessão (${total})
      </button>
      <div class="highlight-popover-hint">${active
        ? (directTouchMode
            ? 'Arraste o dedo sobre o texto para marcá-lo.'
            : 'Selecione um trecho do texto para marcá-lo.')
        : 'Ative o marca-texto para criar novas marcações.'}</div>
    `;

    menu.querySelector('.highlight-menu-visibility').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._hiddenHighlightTargets.has(targetKey)) {
        this._hiddenHighlightTargets.delete(targetKey);
      } else {
        this._hiddenHighlightTargets.add(targetKey);
      }
      const entry = this._highlightTargets.get(targetKey);
      if (entry) entry.element.classList.toggle('highlights-hidden', this._hiddenHighlightTargets.has(targetKey));
      this._showHighlighterToolMenu(anchor, target);
    });

    menu.querySelector('.highlight-menu-clear-target').addEventListener('click', (e) => {
      e.stopPropagation();
      if (count === 0) return;
      if (!confirm(`Apagar ${count} marcação(ões) ${targetLabel}?`)) return;
      this._setTextHighlights(target, []);
      this._refreshHighlightTarget(target);
      this._showHighlighterToolMenu(anchor, target);
    });

    menu.querySelector('.highlight-menu-clear-all').addEventListener('click', (e) => {
      e.stopPropagation();
      if (total === 0) return;
      if (!confirm(`Apagar todas as ${total} marcação(ões) desta sessão?`)) return;
      if (this.callbacks.onClearAllTextHighlights) this.callbacks.onClearAllTextHighlights();
      this._refreshAllHighlightTargets();
      this._showHighlighterToolMenu(anchor, target);
    });

    this._mountHighlightPopover(menu, anchor.getBoundingClientRect());
  }

  _showHighlightContextMenu(rect, entry, highlightId) {
    const highlight = this._getTextHighlights(entry.target).find((item) => item.id === highlightId);
    if (!highlight) return;
    const menu = document.createElement('div');
    menu.className = 'highlight-popover highlight-context-menu';
    menu.innerHTML = `
      <button type="button" class="highlight-context-delete danger">🗑️ Deletar</button>
      <button type="button" class="highlight-context-copy">📋 Copiar</button>
      <button type="button" class="highlight-context-color">🎨 Alterar cor</button>
      <button type="button" class="highlight-context-cancel">Cancelar</button>
    `;

    menu.querySelector('.highlight-context-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      const next = this._getTextHighlights(entry.target).filter((item) => item.id !== highlightId);
      this._setTextHighlights(entry.target, next);
      this._hideHighlightPopover();
      this._refreshHighlightTarget(entry.target);
    });
    menu.querySelector('.highlight-context-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      const text = this._getHighlightText(entry, highlight);
      this._copyPlainText(text);
      this._hideHighlightPopover();
    });
    menu.querySelector('.highlight-context-color').addEventListener('click', (e) => {
      e.stopPropagation();
      const menuRect = menu.getBoundingClientRect();
      this._showHighlightColorMenu(menuRect, entry.target, highlightId);
    });
    menu.querySelector('.highlight-context-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideHighlightPopover();
    });

    this._mountHighlightPopover(menu, rect);
  }

  _showHighlightColorMenu(rect, target, highlightId = null) {
    const existing = highlightId
      ? this._getTextHighlights(target).find((item) => item.id === highlightId)
      : null;
    const settings = existing
      ? {
          color: HIGHLIGHT_COLOR_KEYS.has(existing.color) ? existing.color : 'yellow',
          opacity: Math.min(0.9, Math.max(0.15, Number(existing.opacity) || 0.42))
        }
      : this._getHighlightSettings();
    const menu = document.createElement('div');
    menu.className = 'highlight-popover highlight-color-menu';
    menu.innerHTML = `
      <div class="highlight-popover-title">${existing ? 'Alterar marcação' : 'Próximas marcações'}</div>
      <div class="highlight-color-grid" role="group" aria-label="Cores do marca-texto">
        ${HIGHLIGHT_COLORS.map((item) => `
          <button type="button" class="highlight-color-option${item.key === settings.color ? ' selected' : ''}"
            data-color="${item.key}" title="${item.label}" aria-label="${item.label}"></button>
        `).join('')}
      </div>
      <label class="highlight-opacity-control">
        <span>Opacidade: <strong>${Math.round(settings.opacity * 100)}%</strong></span>
        <input type="range" min="15" max="90" step="5" value="${Math.round(settings.opacity * 100)}">
      </label>
      <button type="button" class="highlight-color-close">Fechar</button>
    `;

    let selectedColor = settings.color;
    let selectedOpacity = settings.opacity;
    const apply = () => {
      if (highlightId) {
        this._updateSingleHighlight(target, highlightId, {
          color: selectedColor,
          opacity: selectedOpacity
        });
      } else if (this.callbacks.onHighlightSettingsChange) {
        this.callbacks.onHighlightSettingsChange({
          color: selectedColor,
          opacity: selectedOpacity
        });
        this._updateHighlighterControls();
      }
    };

    menu.querySelectorAll('.highlight-color-option').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedColor = button.dataset.color;
        menu.querySelectorAll('.highlight-color-option').forEach((item) => {
          item.classList.toggle('selected', item === button);
        });
        apply();
      });
    });

    const opacityInput = menu.querySelector('input[type="range"]');
    const opacityLabel = menu.querySelector('.highlight-opacity-control strong');
    opacityInput.addEventListener('input', (e) => {
      selectedOpacity = Number(e.target.value) / 100;
      opacityLabel.textContent = `${e.target.value}%`;
    });
    opacityInput.addEventListener('change', (e) => {
      e.stopPropagation();
      selectedOpacity = Number(e.target.value) / 100;
      apply();
    });
    menu.querySelector('.highlight-color-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideHighlightPopover();
    });

    this._mountHighlightPopover(menu, rect);
  }

  _updateSingleHighlight(target, highlightId, patch) {
    const key = this._highlightTargetKey(target);
    const entry = this._highlightTargets.get(key);
    if (!entry) return;
    const now = new Date().toISOString();
    const next = this._getTextHighlights(target).map((item) => (
      item.id === highlightId ? { ...item, ...patch, updatedAt: now } : { ...item }
    ));
    const merged = this._mergeAdjacentHighlights(next, entry, highlightId);
    this._setTextHighlights(target, merged);
    this._refreshHighlightTarget(target);
  }

  _getHighlightText(entry, highlight) {
    if (highlight.text) return highlight.text;
    const range = this._rangeFromHighlightOffsets(entry.element, Number(highlight.start), Number(highlight.end));
    const fromRange = range ? range.toString().trim() : '';
    return fromRange;
  }

  _copyPlainText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => this._copyPlainTextFallback(text));
      return;
    }
    this._copyPlainTextFallback(text);
  }

  _copyPlainTextFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch {}
    textarea.remove();
  }

  _mountHighlightPopover(menu, anchorRect) {
    this._hideHighlightPopover();
    this._hideCopyMenu();
    document.body.appendChild(menu);
    const margin = 8;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - width - margin));
    let top = anchorRect.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, anchorRect.top - height - 6);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    this._highlightPopover = menu;

    this._highlightPopoverCloser = (e) => {
      if (menu.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.btn-highlighter, .btn-highlighter-settings, .btn-highlight-color')) return;
      this._hideHighlightPopover();
    };
    setTimeout(() => {
      if (this._highlightPopover === menu) {
        document.addEventListener('pointerdown', this._highlightPopoverCloser);
      }
    }, 0);
  }

  _hideHighlightPopover() {
    if (this._highlightPopoverCloser) {
      document.removeEventListener('pointerdown', this._highlightPopoverCloser);
      this._highlightPopoverCloser = null;
    }
    if (this._highlightPopover) {
      this._highlightPopover.remove();
      this._highlightPopover = null;
    }
  }

  _showHighlightToast(message) {
    const previous = document.querySelector('.highlight-toast');
    if (previous) previous.remove();
    const toast = document.createElement('div');
    toast.className = 'highlight-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 180);
    }, 2200);
  }

  // ===================== Marcação de Palavras =====================

  _applyWordMarking(element, markedIndices) {
    const markedSet = new Set(markedIndices || []);
    let wordIdx = 0;

    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (!text.trim()) return;
        const parts = text.split(/(\s+)/);
        const fragment = document.createDocumentFragment();
        parts.forEach(part => {
          if (!part.trim()) {
            fragment.appendChild(document.createTextNode(part));
          } else {
            const span = document.createElement('span');
            span.className = 'markable-word' + (markedSet.has(wordIdx) ? ' word-marked' : '');
            span.dataset.wordIdx = wordIdx;
            span.textContent = part;
            fragment.appendChild(span);
            wordIdx++;
          }
        });
        node.parentNode.replaceChild(fragment, node);
      } else if (node.nodeType === Node.ELEMENT_NODE &&
                 !['IMG', 'BR', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME'].includes(node.tagName)) {
        Array.from(node.childNodes).forEach(child => processNode(child));
      }
    };

    Array.from(element.childNodes).forEach(child => processNode(child));
  }

  _saveMarkedWords(element, qIdx, markKey) {
    const indices = [];
    element.querySelectorAll('.word-marked').forEach(span => {
      indices.push(parseInt(span.dataset.wordIdx, 10));
    });
    if (this.callbacks.onMarkWords) {
      this.callbacks.onMarkWords(qIdx, markKey, indices);
    }
  }

  _setupMarkingListeners(element, qIdx, markKey) {
    const self = this;
    let lastToggledIdx = null;

    const getWord = (target) => {
      if (target && target.classList && target.classList.contains('markable-word')) return target;
      return null;
    };

    // --- Mouse ---
    const isSelMode = () => self.container.classList.contains('selection-mode');

    element.addEventListener('mousedown', (e) => {
      if (isSelMode()) return;
      const span = getWord(e.target);
      if (!span || e.button !== 0 || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      lastToggledIdx = null;
      const action = span.classList.contains('word-marked') ? 'unmark' : 'mark';
      self._activeMarking = { element, qIdx, markKey, action };
      const idx = parseInt(span.dataset.wordIdx, 10);
      lastToggledIdx = idx;
      if (action === 'mark') span.classList.add('word-marked');
      else span.classList.remove('word-marked');
    });

    element.addEventListener('mouseover', (e) => {
      if (!self._activeMarking || self._activeMarking.element !== element) return;
      const span = getWord(e.target);
      if (!span) return;
      const idx = parseInt(span.dataset.wordIdx, 10);
      if (idx === lastToggledIdx) return;
      lastToggledIdx = idx;
      if (self._activeMarking.action === 'mark') span.classList.add('word-marked');
      else span.classList.remove('word-marked');
    });

    // --- Touch ---
    let touchStart = null;
    let touchMode = null; // null | 'marking' | 'scroll'
    let touchAction = null;

    element.addEventListener('touchstart', (e) => {
      if (isSelMode()) return;
      const touch = e.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
      touchMode = null;
      lastToggledIdx = null;
      const span = getWord(e.target);
      if (span) {
        touchAction = span.classList.contains('word-marked') ? 'unmark' : 'mark';
      } else {
        touchAction = null;
      }
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
      if (!touchStart || touchMode === 'scroll') return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStart.x);
      const dy = Math.abs(touch.clientY - touchStart.y);

      if (dy > 15 && touchMode !== 'marking') {
        touchMode = 'scroll';
        return;
      }
      if ((dx > 10 || touchMode === 'marking') && touchAction) {
        touchMode = 'marking';
        e.preventDefault();
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const span = el ? getWord(el) : null;
        if (span) {
          const idx = parseInt(span.dataset.wordIdx, 10);
          if (idx !== lastToggledIdx) {
            lastToggledIdx = idx;
            if (touchAction === 'mark') span.classList.add('word-marked');
            else span.classList.remove('word-marked');
          }
        }
      }
    }, { passive: false });

    element.addEventListener('touchend', (e) => {
      if (touchMode === null && touchStart) {
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const span = el ? getWord(el) : null;
        if (span) {
          span.classList.toggle('word-marked');
          self._saveMarkedWords(element, qIdx, markKey);
        }
      } else if (touchMode === 'marking') {
        self._saveMarkedWords(element, qIdx, markKey);
      }
      touchMode = null;
      touchStart = null;
    });

    // --- Context menu (right-click PC / long-press mobile) ---
    element.addEventListener('contextmenu', (e) => {
      if (isSelMode()) return; // modo seleção: menu nativo do browser
      e.preventDefault();
      self._showCopyMenu(e.clientX, e.clientY, element.textContent);
    });
  }

  _showCopyMenu(x, y, text) {
    this._hideHighlightPopover();
    this._hideCopyMenu();
    const menu = document.createElement('div');
    menu.className = 'copy-context-menu';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '📋 Copiar assertiva';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).catch(() => {});
      this._hideCopyMenu();
    });
    menu.appendChild(btn);
    menu.style.left = Math.min(x, window.innerWidth - 190) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 50) + 'px';
    document.body.appendChild(menu);
    this._copyMenu = menu;
    setTimeout(() => {
      const close = (ev) => {
        if (menu.contains(ev.target)) return;
        this._hideCopyMenu();
        document.removeEventListener('click', close);
        document.removeEventListener('touchstart', close);
      };
      document.addEventListener('click', close);
      document.addEventListener('touchstart', close, { passive: true });
    }, 10);
  }

  _hideCopyMenu() {
    if (this._copyMenu) {
      this._copyMenu.remove();
      this._copyMenu = null;
    }
  }

  // ===================== Clipboard Formatado =====================

  _stripHtml(html) {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent.trim();
  }

  _handleCopy(e) {
    if (!this._state) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const cards = this.container.querySelectorAll('.question-card');
    const selected = [];

    cards.forEach(card => {
      if (range.intersectsNode(card)) {
        const idx = parseInt(card.dataset.originalIdx, 10);
        const vIdx = this._state.mappings.qOrder.indexOf(idx);
        if (vIdx !== -1) selected.push({ originalIdx: idx, visualIdx: vIdx });
      }
    });

    if (selected.length === 0) return;

    selected.sort((a, b) => a.visualIdx - b.visualIdx);

    const parts = [];
    const includedGroups = new Set();

    for (const { originalIdx, visualIdx } of selected) {
      const q = this._state.questions[originalIdx];
      if (q._groupData && !includedGroups.has(q._groupData.id)) {
        includedGroups.add(q._groupData.id);
        parts.push(this._stripHtml(q._groupData.text));
      }
      parts.push(this._formatQuestionText(originalIdx, visualIdx));
    }

    e.preventDefault();
    e.clipboardData.setData('text/plain', parts.join('\n\n'));
  }

  _formatQuestionText(originalIdx, visualIdx) {
    const s = this._state;
    const q = s.questions[originalIdx];
    const ans = s.userAnswers[originalIdx];
    const tipo = (q.tipo || '').toUpperCase();
    const sub = ans && ans.submitted;
    const altMap = s.mappings.altOrder[originalIdx] || [];
    const strip = (h) => this._stripHtml(h);
    const lines = [];

    lines.push(`${visualIdx + 1}. ${strip(q.enunciado)}`);

    if (tipo === 'VF') {
      if (sub) {
        const gab = (q.gabarito || '').trim().toUpperCase();
        lines.push(`Gabarito: ${gab === 'A' ? 'Verdadeiro' : 'Falso'}`);
        if (q.comentario_geral) lines.push(`Comentário Geral:\n${strip(q.comentario_geral)}`);
      }
    } else if (tipo === 'ME' || tipo === 'ME-CH' || tipo === 'MEM') {
      const isMemOrMeCh = tipo === 'ME-CH' || tipo === 'MEM';
      const gabIdx = ((q.gabarito || '').trim().toUpperCase().charCodeAt(0) || 65) - 65;
      const gabSet = isMemOrMeCh ? parseMeChGabarito(q) : null;

      altMap.forEach((origIdx, visIdx) => {
        const alt = q.alternativas[origIdx];
        const letter = String.fromCharCode(65 + visIdx);
        let line = `${letter}) ${strip(alt.texto)}`;
        if (sub && (isMemOrMeCh ? gabSet.has(origIdx) : origIdx === gabIdx)) {
          line += ' ✔ Gabarito';
        }
        lines.push(line);
        if (sub && alt.comentario) lines.push(`Comentário do gabarito: ${strip(alt.comentario)}`);
      });

      if (sub && q.comentario_geral) lines.push(`Comentário Geral:\n${strip(q.comentario_geral)}`);

    } else if (tipo === 'CH' || tipo === 'MVF') {
      altMap.forEach((origIdx, visIdx) => {
        const ass = q.assertivas[origIdx];
        const letter = String.fromCharCode(65 + visIdx);
        let line = `${letter}) ${strip(ass.texto)}`;
        if (sub) line += ` (Gabarito: ${ass.is_correct ? 'V' : 'F'})`;
        lines.push(line);
        if (sub && ass.comentario) lines.push(`Comentário do gabarito: ${strip(ass.comentario)}`);
      });

      if (sub && q.comentario_geral) lines.push(`Comentário Geral:\n${strip(q.comentario_geral)}`);

    } else if (tipo === 'ESCRITA') {
      const isItems = q.subtipo === 'itens' || (Array.isArray(q.itens) && q.itens.length > 0);

      if (sub) {
        if (!isItems) {
          if (ans.text) lines.push(`Sua resposta: ${ans.text}`);
          if (q.gabarito) lines.push(`Gabarito: ${strip(q.gabarito)}`);
        } else {
          (q.itens || []).forEach((item, i) => {
            const letter = String.fromCharCode(65 + i);
            lines.push(`${letter}) ${strip(item.pergunta)}`);
            const ia = (ans.items && ans.items[i]) || {};
            if (ia.text) lines.push(`Sua resposta: ${ia.text}`);
            if (item.gabarito) lines.push(`Gabarito: ${strip(item.gabarito)}`);
            if (item.comentario) lines.push(`Comentário: ${strip(item.comentario)}`);
          });
        }
        if (q.comentario_geral) lines.push(`Comentário Geral:\n${strip(q.comentario_geral)}`);
      }
    } else if (tipo === 'MQ') {
      const leftItens = (q.coluna_esquerda && q.coluna_esquerda.itens) || [];
      const rightItens = (q.coluna_direita && q.coluna_direita.itens) || [];
      const leftMap = (altMap && altMap.left) || Array.from({ length: leftItens.length }, (_, i) => i);
      const rightMap = (altMap && altMap.right) || Array.from({ length: rightItens.length }, (_, i) => i);

      lines.push(`\n[${(q.coluna_esquerda && q.coluna_esquerda.nome) || 'Coluna I'}]`);
      leftMap.forEach((origIdx, visIdx) => {
        lines.push(`  ${visIdx + 1}. ${strip(leftItens[origIdx].texto)}`);
      });

      lines.push(`\n[${(q.coluna_direita && q.coluna_direita.nome) || 'Coluna II'}]`);
      rightMap.forEach((origIdx, visIdx) => {
        lines.push(`  ${String.fromCharCode(65 + visIdx)}. ${strip(rightItens[origIdx].texto)}`);
      });

      if (sub) {
        const gabMap = parseMqGabarito(q);
        lines.push('\nGabarito:');
        leftMap.forEach((lOrigIdx, lVisIdx) => {
          const targetSet = gabMap.get(lOrigIdx) || new Set();
          const letters = Array.from(targetSet).map((rOrig) => {
            const rVis = rightMap.indexOf(rOrig);
            return rVis !== -1 ? String.fromCharCode(65 + rVis) : '?';
          }).sort();
          lines.push(`  ${lVisIdx + 1} ➔ (${letters.join(', ') || 'nenhum'})`);
        });
      }

      if (sub && (q.comentario_geral || q.comentario)) {
        lines.push(`\nComentário Geral:\n${strip(q.comentario_geral || q.comentario)}`);
      }
    }

    return lines.join('\n');
  }

  // ===================== Pontuação =====================

  isObjectiveQuestion(state, idx) {
    const qData = state.questions[idx];
    return ((qData && qData.tipo) || '').toUpperCase() !== 'ESCRITA';
  }

  applyDisregardedCorrectToScore(state, idx, score, options = {}) {
    if (options.ignoreDisregard) return score;
    const ans = state.userAnswers[idx];
    const featureOn = state.config.showDisregardCorrect !== false;
    const applyOn = state.config.applyDisregardedCorrect !== false;
    if (
      featureOn &&
      applyOn &&
      ans &&
      ans.disregardCorrect &&
      this.isObjectiveQuestion(state, idx) &&
      score.total > 0 &&
      score.hits > 0
    ) {
      return { hits: 0, total: score.total };
    }
    return score;
  }

  isDisregardedCorrectMarked(state, idx) {
    const ans = state.userAnswers[idx];
    if (!ans || !ans.disregardCorrect || !this.isObjectiveQuestion(state, idx)) return false;
    const raw = this.computeQuestionScore(state, idx, { ignoreDisregard: true });
    return raw.total > 0 && raw.hits > 0;
  }

  /**
   * Retorna { hits, total } para a questão idx.
   * - ME / VF: total = 1, hits = 1 ou 0
   * - MEM (ME-CH): total = 1, hits = pontuação proporcional entre 0 e 1
   * - MVF (CH): total = número de assertivas, hits = quantas julgadas corretamente
   * - ESCRITA simples: total = 10, hits = selfEval (0–10)
   * - ESCRITA itens: total = numItens × 10, hits = soma dos selfEvals
   */
  computeQuestionScore(state, idx, options = {}) {
    const qData = state.questions[idx];
    const ans = state.userAnswers[idx];
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

    if (tipo === 'CH' || tipo === 'MVF') {
      const assertivas = Array.isArray(qData.assertivas) ? qData.assertivas : [];
      const total = assertivas.length;
      if (total === 0) return { hits: 0, total: 0 };

      const answers = ans.assertivaAnswers || {};

      let hits = 0;
      assertivas.forEach((ass, i) => {
        const isCorrect = !!ass.is_correct;
        const userSaidTrue = answers[i];
        if (userSaidTrue !== undefined && userSaidTrue === isCorrect) hits++;
      });

      return this.applyDisregardedCorrectToScore(state, idx, { hits, total }, options);
    }

    if (tipo === 'ME-CH' || tipo === 'MEM') {
      const score = computeMeChScore(qData, ans.selectedOriginalIndices || []);
      return this.applyDisregardedCorrectToScore(state, idx, { hits: score, total: 1 }, options);
    }

    if (tipo === 'MQ') {
      const scoreData = computeMqScore(qData, ans.connections || []);
      return this.applyDisregardedCorrectToScore(state, idx, { hits: scoreData.hits, total: 1 }, options);
    }

    // ME / VF
    const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
    if (!gabaritoLetra) return { hits: 0, total: 0 };
    const gabaritoIdx = gabaritoLetra.charCodeAt(0) - 65;
    const isCorrect = ans.selectedOriginalIdx === gabaritoIdx;
    return this.applyDisregardedCorrectToScore(
      state,
      idx,
      { hits: isCorrect ? 1 : 0, total: 1 },
      options
    );
  }

  updateFooter(state) {
    let totalQuestions = 0;
    let submittedQuestions = 0;
    let allSubmitted = true;
    let sumHits = 0;
    let incorrectIndices = [];
    let disregardedCorrectCount = 0;

    // Rastreamento por tipo
    const typeOrder = ['ME', 'MEM', 'VF', 'MVF', 'ESCRITA', 'MQ'];
    const typeLabels = {
      ME: 'Múltipla Escolha',
      MEM: 'Múltipla Escolha Múltipla',
      VF: 'Verdadeiro ou Falso (simples)',
      MVF: 'Verdadeiro ou Falso (múltiplo)',
      ESCRITA: 'Escrita',
      MQ: 'Associação'
    };
    const typeStats = {};
    typeOrder.forEach((t) => { typeStats[t] = { sumScore: 0, count: 0 }; });

    state.mappings.qOrder.forEach((idx) => {
      const isExcluded =
        (state.forcedIndices && state.forcedIndices.includes(idx)) ||
        (state.disabledIndices && state.disabledIndices.includes(idx));
      if (isExcluded) return;

      const qData = state.questions[idx];
      let tipo = (qData.tipo || '').toUpperCase();
      if (tipo === 'ME-CH') tipo = 'MEM';
      if (tipo === 'CH') tipo = 'MVF';
      totalQuestions++;

      const ans = state.userAnswers[idx];
      if (!ans || !ans.submitted) {
        allSubmitted = false;
        return;
      }
      submittedQuestions++;

      const { hits, total } = this.computeQuestionScore(state, idx);
      const isDisregarded = this.isDisregardedCorrectMarked(state, idx);
      if (isDisregarded) disregardedCorrectCount++;
      if (total > 0) {
        const questionScore = hits / total;
        sumHits += questionScore;
        if (questionScore < 1 || isDisregarded) incorrectIndices.push(idx);
        if (typeStats[tipo]) {
          typeStats[tipo].sumScore += questionScore;
          typeStats[tipo].count++;
        }
      } else {
        incorrectIndices.push(idx);
        if (typeStats[tipo]) {
          typeStats[tipo].count++;
        }
      }
    });

    if (totalQuestions === 0) {
      this.btnSubmitAll.style.display = 'none';
      this.scoreDisplay.style.display = 'none';
      this._removeResultCard();
      return;
    }

    const showPartialScore = localStorage.getItem('vs_showPartialScore') !== 'false';
    if ((allSubmitted || (showPartialScore && submittedQuestions > 0)) && totalQuestions > 0) {
      this.btnSubmitAll.style.display = allSubmitted ? 'none' : 'block';
      this.scoreDisplay.style.display = 'none';
      this._renderResultCard(
        typeStats,
        typeOrder,
        typeLabels,
        sumHits,
        allSubmitted ? totalQuestions : submittedQuestions,
        allSubmitted ? incorrectIndices : [],
        disregardedCorrectCount,
        state,
        {
          isPartial: !allSubmitted,
          remainingQuestions: Math.max(0, totalQuestions - submittedQuestions)
        }
      );
    } else {
      this.btnSubmitAll.style.display = 'block';
      this.scoreDisplay.style.display = 'none';
      this._removeResultCard();
    }
  }

  _removeResultCard() {
    const existing = this.container.querySelector('.result-section');
    if (existing) existing.remove();
  }

  _renderResultCard(
    typeStats,
    typeOrder,
    typeLabels,
    sumHits,
    totalQuestions,
    incorrectIndices,
    disregardedCorrectCount,
    state,
    options = {}
  ) {
    // Reutiliza card existente para evitar salto de scroll
    let section = this.container.querySelector('.result-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'result-section';
      this.container.appendChild(section);
    }

    const fmt = (n, maxDec = 2) =>
      (+n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: maxDec });
    const fmtPct = (n) => fmt(n, 1);

    const pct = totalQuestions > 0 ? (sumHits / totalQuestions * 100) : 0;
    const title = options.isPartial ? 'Resultado Parcial' : 'Resultado';
    const scoreLabel = options.isPartial ? 'Pontuação parcial' : 'Pontuação geral';

    let html = `<div class="result-title">${title}</div>`;
    html += `<div class="result-row result-general">`;
    html += `<strong>${scoreLabel}:</strong> ${fmt(sumHits)}/${totalQuestions} pontos | ${fmtPct(pct)}% de taxa de acerto`;
    html += `</div>`;
    if (options.isPartial) {
      html += `<div class="result-row result-remaining">`;
      html += `Faltam responder: ${options.remainingQuestions || 0}`;
      html += `</div>`;
    }

    typeOrder.forEach((tipo) => {
      const stat = typeStats[tipo];
      if (!stat || stat.count === 0) return;
      const typePct = stat.count > 0 ? (stat.sumScore / stat.count * 100) : 0;
      html += `<div class="result-row">`;
      html += `${typeLabels[tipo]}: ${fmt(stat.sumScore)}/${stat.count} pontos | ${fmtPct(typePct)}% de taxa de acerto`;
      html += `</div>`;
    });

    if (
      state.config.showDisregardCorrect !== false &&
      disregardedCorrectCount > 0
    ) {
      const checked = state.config.applyDisregardedCorrect !== false ? 'checked' : '';
      html += `<label class="result-disregard-toggle">`;
      html += `<input type="checkbox" id="chkApplyDisregardedCorrect" ${checked}>`;
      html += `<span>Aplicar "Desconsiderar acerto" (${disregardedCorrectCount})</span>`;
      html += `</label>`;
    }

    if (incorrectIndices.length > 0) {
      html += `<div class="result-actions">`;
      html += `<button class="btn btn-sm btn-retry" id="btnRetryErrors">Repetir apenas questões que errou</button>`;
      html += `</div>`;
    }

    section.innerHTML = html;

    const btnRetry = section.querySelector('#btnRetryErrors');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => this.callbacks.onRetry());
    }

    const chkApply = section.querySelector('#chkApplyDisregardedCorrect');
    if (chkApply) {
      chkApply.addEventListener('change', (e) => {
        if (this.callbacks.onToggleApplyDisregardedCorrect) {
          this.callbacks.onToggleApplyDisregardedCorrect(e.target.checked);
        }
      });
    }
  }
}
