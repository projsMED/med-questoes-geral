/* ===== JS: js\renderer.js ===== */
import { formatText, difficultyMap } from './utils.js';

export class QuizRenderer {
  constructor(containerId, footerId, callbacks) {
    this.container = document.getElementById(containerId);
    this.btnSubmitAll = document.getElementById('btnSubmitAll');
    this.scoreDisplay = document.getElementById('scoreDisplay');
    this.callbacks = callbacks;
  }

  render(state) {
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
      retryBanner.style.background = '#fff3cd';
      retryBanner.style.border = '1px solid #ffeeba';
      retryBanner.style.color = '#856404';
      retryBanner.style.padding = '10px';
      retryBanner.style.marginBottom = '20px';
      retryBanner.style.textAlign = 'center';
      retryBanner.style.borderRadius = '6px';
      retryBanner.innerHTML = `<strong>Modo de Repetição:</strong> Exibindo apenas as questões que você errou anteriormente.`;
      this.container.appendChild(retryBanner);
    }

    let lastGroupId = null;

    state.mappings.qOrder.forEach((originalIdx, visualIdx) => {
      const qData = state.questions[originalIdx];

      if (qData._groupData) {
        const currentGroupId = qData._groupData.id;
        if (currentGroupId !== lastGroupId) {
          let groupSize = 0;
          for (let i = visualIdx; i < state.mappings.qOrder.length; i++) {
            const nextQ = state.questions[state.mappings.qOrder[i]];
            if (nextQ._groupData && nextQ._groupData.id === currentGroupId) {
              groupSize++;
            } else {
              break;
            }
          }
          const startNum = visualIdx + 1;
          const endNum = visualIdx + groupSize;
          const groupHeader = document.createElement('div');
          groupHeader.className = 'group-container';
          groupHeader.innerHTML = `
            <div class="group-notice">
              Responda as questões <span>${startNum} a ${endNum}</span>
            </div>
            <div class="group-text-body">
              ${qData._groupData.text}
            </div>
          `;
          this.container.appendChild(groupHeader);
          lastGroupId = currentGroupId;
        }
      } else {
        lastGroupId = null;
      }

      const card = this.createQuestionCard(qData, originalIdx, visualIdx, state);
      this.container.appendChild(card);
    });

    this.updateFooter(state);
  }

  renderFilterSummary(state) {
    const selTags = state.filters.tags || [];
    const allTags = state.filters.allTags || [];
    const selDiffs = state.filters.diffs || [];
    const allDiffs = state.filters.allDiffs || [];
    const selFolders = state.filters.folders || [];
    const allFolders = state.filters.allFolders || [];

    const isFiltered =
      selTags.length < allTags.length ||
      selDiffs.length < allDiffs.length ||
      selFolders.length < allFolders.length;

    if (!isFiltered) return;

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'active-filters-bar';

    let html = `<div class="filters-title">Filtros Ativos</div><div class="filters-container">`;

    if (selFolders.length < allFolders.length) {
      html += `<span class="filter-pill tag-pill">Pastas filtradas (${selFolders.length}/${allFolders.length})</span>`;
    }

    if (selTags.length < allTags.length) {
      selTags.forEach((t) => {
        const label = t === '__NO_TAG__' ? 'Sem tag' : t;
        html += `<span class="filter-pill tag-pill">${label}</span>`;
      });
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
    const isCH = tipo === 'CH';

    if (tipo === 'VF') wrapper.classList.add('type-vf');
    wrapper.dataset.originalIdx = originalIdx;

    const userAnswer = state.userAnswers[originalIdx];
    let isSubmitted = userAnswer && userAnswer.submitted;
    const isForced =
      state.forcedIndices && state.forcedIndices.includes(originalIdx);
    const eliminatedList = state.eliminatedAlts[originalIdx] || [];

    if (isForced) {
      wrapper.classList.add('question-forced');
      isSubmitted = true;
    } else if (isSubmitted) {
      wrapper.classList.add('submitted');
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

    let tagsHtml = '';
    if (state.config.showTags) {
      let content = '';
      if (qData._path && qData._path.length > 0) {
        content += `<div class="q-breadcrumbs">📂 <span>${qData._path.join(
          ' > '
        )}</span></div>`;
      }
      if (qData.tags && qData.tags.length > 0) {
        const tagsSpans = qData.tags
          .map((t) => `<span>${t}</span>`)
          .join('');
        content += `<div class="tags">${tagsSpans}</div>`;
      }
      tagsHtml = content;
    }

    let forcedBadge = '';
    if (isForced) {
      forcedBadge = `<div class="forced-badge">Exibida para contexto (fora do filtro) - Não vale nota</div>`;
    }

    const enunciadoTxt = formatText(
      qData.enunciado,
      originalIdx,
      state.mappings.altOrder
    );

    wrapper.innerHTML = `
      ${forcedBadge}
      <div class="q-header-container">
        ${tagsHtml}
        <div style="margin-left:auto">${diffHtml}</div>
      </div>
      <div class="q-enunciado">
        <span style="color:var(--primary);">${visualIdx + 1}.</span> ${enunciadoTxt}
      </div>
    `;

    const altList = document.createElement('div');
    altList.className = 'alternatives-list';
    const altMapping = state.mappings.altOrder[originalIdx] || [];

    if (isCH) {
      const selectedArr =
        userAnswer && Array.isArray(userAnswer.selectedOriginalIdxs)
          ? userAnswer.selectedOriginalIdxs
          : [];

      altMapping.forEach((originalAssIdx, visualIdxAss) => {
        const assData = qData.assertivas[originalAssIdx];
        const altItem = document.createElement('div');
        altItem.className = 'alt-item';

        const isCorrectAss = !!assData.is_correct;
        const isSelected = selectedArr.includes(originalAssIdx);
        const isEliminated = eliminatedList.includes(originalAssIdx);

        const altWrapper = document.createElement('div');
        altWrapper.className = 'alt-wrapper';
        if (isEliminated) altWrapper.classList.add('eliminated');

        // Correção visual: verde se estado do checkbox == is_correct, vermelho se diferente
        if (isSubmitted) {
          const stateMatches = isSelected === isCorrectAss;
          if (stateMatches) {
            altWrapper.classList.add('correct');
          } else {
            altWrapper.classList.add('wrong');
          }
        }

        const inputId = `q${originalIdx}_ass${visualIdxAss}`;
        const checkedAttr = isSelected ? 'checked' : '';
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
          !isSubmitted && !isForced
            ? `<button class="btn-cut" type="button" title="Cortar alternativa">✂️</button>`
            : '';

        // Sem letras A/B/C – apenas checkbox + texto
        const labelHtml = `
          <label class="alt-label ${isSelected ? 'selected' : ''}" for="${inputId}">
            <input type="checkbox" name="q_${originalIdx}" id="${inputId}"
              class="alt-input" value="${originalAssIdx}" ${checkedAttr}
              ${isSubmitted || isForced ? 'disabled' : ''}>
            <span class="alt-text">${altText}</span>
          </label>
        `;

        altWrapper.innerHTML = labelHtml + scissorBtn;
        altItem.appendChild(altWrapper);

        if (specificCommentHtml) {
          const commentDiv = document.createElement('div');
          commentDiv.innerHTML = specificCommentHtml;
          altItem.appendChild(commentDiv);
        }

        if (!isSubmitted && !isForced) {
          const input = altWrapper.querySelector('input');
          if (input) {
            input.addEventListener('change', (e) => {
              if (eliminatedList.includes(originalAssIdx)) {
                e.preventDefault();
                input.checked = false;
                return;
              }
              this.callbacks.onSelect(
                originalIdx,
                originalAssIdx,
                true,
                input.checked
              );
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
      // ME / VF – comportamento antigo
      altMapping.forEach((originalAltIdx, visualAltIdx) => {
        const altData = qData.alternativas[originalAltIdx];
        const visualLetter = String.fromCharCode(65 + visualAltIdx);
        const altItem = document.createElement('div');
        altItem.className = 'alt-item';

        const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
        const gabaritoOriginalIdx = gabaritoLetra.charCodeAt(0) - 65;
        const isCorrectAlt = originalAltIdx === gabaritoOriginalIdx;
        const isSelected =
          userAnswer && userAnswer.selectedOriginalIdx === originalAltIdx;
        const isEliminated = eliminatedList.includes(originalAltIdx);

        const altWrapper = document.createElement('div');
        altWrapper.className = 'alt-wrapper';
        if (isEliminated) altWrapper.classList.add('eliminated');
        if (isSubmitted) {
          if (isCorrectAlt) altWrapper.classList.add('correct');
          if (isSelected && !isCorrectAlt) altWrapper.classList.add('wrong');
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
          !isSubmitted && !isForced
            ? `<button class="btn-cut" type="button" title="Cortar alternativa">✂️</button>`
            : '';

        const labelHtml = `
          <label class="alt-label ${isSelected ? 'selected' : ''}" for="${inputId}">
            <input type="radio" name="q_${originalIdx}" id="${inputId}"
              class="alt-input" value="${originalAltIdx}" ${checked}
              ${isSubmitted || isForced ? 'disabled' : ''}>
            <span class="alt-letter">${visualLetter})</span>
            <span class="alt-text">${altText}</span>
          </label>
        `;
        altWrapper.innerHTML = labelHtml + scissorBtn;
        altItem.appendChild(altWrapper);

        if (specificCommentHtml) {
          const commentDiv = document.createElement('div');
          commentDiv.innerHTML = specificCommentHtml;
          altItem.appendChild(commentDiv);
        }

        if (!isSubmitted && !isForced) {
          const lbl = altWrapper.querySelector('.alt-label');
          lbl.addEventListener('click', (e) => {
            if (eliminatedList.includes(originalAltIdx)) {
              e.preventDefault();
              return;
            }
            if (e.target.tagName === 'INPUT') {
              this.callbacks.onSelect(originalIdx, originalAltIdx, false, true);
            }
          });

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

    if (!isForced) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'action-bar';
      const btnAnswer = document.createElement('button');
      btnAnswer.className = 'btn btn-submit';
      btnAnswer.innerText = 'Responder';

      if (isSubmitted) {
        btnAnswer.style.display = 'none';
      } else if (isCH) {
        // CH: pode responder mesmo sem marcar nada
        btnAnswer.disabled = false;
      } else {
        btnAnswer.disabled =
          userAnswer?.selectedOriginalIdx === undefined || isSubmitted;
      }

      btnAnswer.addEventListener('click', () => {
        this.callbacks.onSubmit(originalIdx);
      });

      actionsDiv.appendChild(btnAnswer);
      wrapper.appendChild(actionsDiv);
    }

    if (isSubmitted || isForced) {
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
      }

      // Botão para alternar visibilidade dos comentários
      const hasComments = wrapper.querySelector('.specific-comment') || genCommentTxt;
      if (hasComments && !isForced) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn-toggle-comments';
        toggleBtn.type = 'button';
        const isCollapsed = wrapper.classList.contains('comments-collapsed');
        toggleBtn.textContent = isCollapsed ? '📖 Exibir comentários' : '📕 Ocultar comentários';
        toggleBtn.addEventListener('click', () => {
          wrapper.classList.toggle('comments-collapsed');
          const nowCollapsed = wrapper.classList.contains('comments-collapsed');
          toggleBtn.textContent = nowCollapsed ? '📖 Exibir comentários' : '📕 Ocultar comentários';
          if (this.callbacks.onToggleComments) {
            this.callbacks.onToggleComments(originalIdx, !nowCollapsed);
          }
        });
        wrapper.appendChild(toggleBtn);
      }
    }

    return wrapper;
  }

  // Cálculo de pontuação por questão (ME / VF / CH)
  /**
   * Retorna { hits, total } para a questão idx.
   * - ME / VF: total = 1, hits = 1 ou 0
   * - CH: total = número de assertivas exibidas, hits = quantas foram julgadas corretamente
   */
  computeQuestionScore(state, idx) {
    const qData = state.questions[idx];
    const ans = state.userAnswers[idx];
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
      assertivas.forEach((ass, i) => {
        const shouldCheck = !!ass.is_correct;
        const isChecked = selected.includes(i);
        if (shouldCheck === isChecked) hits++;
      });

      return { hits, total };
    }

    const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
    if (!gabaritoLetra) return { hits: 0, total: 0 };
    const gabaritoIdx = gabaritoLetra.charCodeAt(0) - 65;
    const isCorrect = ans.selectedOriginalIdx === gabaritoIdx;
    return { hits: isCorrect ? 1 : 0, total: 1 };
  }

  updateFooter(state) {
    let totalQuestions = 0;      // questões que contam nota (exceto forçadas)
    let allSubmitted = true;
    let sumHits = 0;             // soma dos acertos (por questão, normalizados)
    let incorrectIndices = [];

    state.mappings.qOrder.forEach((idx) => {
      if (state.forcedIndices && state.forcedIndices.includes(idx)) return;

      totalQuestions++;

      const ans = state.userAnswers[idx];
      if (!ans || !ans.submitted) {
        allSubmitted = false;
        return;
      }

      const { hits, total } = this.computeQuestionScore(state, idx);
      if (total > 0) {
        const questionScore = hits / total; // 0..1
        sumHits += questionScore;
        if (questionScore < 1) {
          incorrectIndices.push(idx);
        }
      } else {
        // Se a questão não tiver base de correção, considera como 0
        incorrectIndices.push(idx);
      }
    });

    if (totalQuestions === 0) {
      this.btnSubmitAll.style.display = 'none';
      this.scoreDisplay.style.display = 'none';
      return;
    }

    if (allSubmitted && totalQuestions > 0) {
      this.btnSubmitAll.style.display = 'none';
      this.scoreDisplay.style.display = 'block';

      const avgScore = sumHits / totalQuestions; // 0..1
      const grade = avgScore * 10;

      let html = `
        Resultado: <span>${grade.toFixed(1)}</span> / 10 
        <small style="color:#666; font-weight:normal; font-size:0.8em">
          (média de ${avgScore.toFixed(2)} por questão)
        </small>
      `;

      if (incorrectIndices.length > 0) {
        html += `<button class="btn btn-sm btn-retry" id="btnRetryErrors">Repetir apenas questões que errou</button>`;
      }

      this.scoreDisplay.innerHTML = html;

      const btnRetry = document.getElementById('btnRetryErrors');
      if (btnRetry) {
        btnRetry.addEventListener('click', () => {
          this.callbacks.onRetry();
        });
      }
    } else {
      this.btnSubmitAll.style.display = 'block';
      this.scoreDisplay.style.display = 'none';
    }
  }
}