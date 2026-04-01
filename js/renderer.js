/* ===== JS: js\renderer.js ===== */
import { formatText, difficultyMap } from './utils.js';

export class QuizRenderer {
  constructor(containerId, footerId, callbacks) {
    this.container = document.getElementById(containerId);
    this.btnSubmitAll = document.getElementById('btnSubmitAll');
    this.scoreDisplay = document.getElementById('scoreDisplay');
    this.callbacks = callbacks;

    // Word marking state
    this._activeMarking = null;
    this._copyMenu = null;
    this._state = null;
    document.addEventListener('mouseup', () => {
      if (this._activeMarking) {
        this._saveMarkedWords(this._activeMarking.element, this._activeMarking.qIdx, this._activeMarking.markKey);
        this._activeMarking = null;
      }
    });
    this.container.addEventListener('copy', (e) => this._handleCopy(e));
  }

  render(state) {
    this._state = state;
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
    const isEscrita = tipo === 'ESCRITA';

    if (tipo === 'VF') wrapper.classList.add('type-vf');
    if (tipo === 'CH') wrapper.classList.add('type-ch');
    if (tipo === 'ESCRITA') wrapper.classList.add('type-escrita');
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
    const enunciadoHtml = tipo === 'VF'
      ? `<span class="markable-text">${enunciadoTxt}</span>`
      : enunciadoTxt;
    const hasMarking = tipo === 'VF' || isCH || tipo === 'ME';
    const selModeBtn = hasMarking
      ? `<button class="btn-selection-mode" type="button" title="Alternar modo seleção de texto">📋 Selecionar</button>`
      : '';

    wrapper.innerHTML = `
      ${forcedBadge}
      <div class="q-header-container">
        ${tagsHtml}
        <div style="margin-left:auto">${selModeBtn}${diffHtml}</div>
      </div>
      <div class="q-enunciado">
        <span style="color:var(--primary);">${visualIdx + 1}.</span> ${enunciadoHtml}
      </div>
    `;

    // Toggle modo seleção (global)
    const selBtn = wrapper.querySelector('.btn-selection-mode');
    if (selBtn) {
      if (this.container.classList.contains('selection-mode')) {
        selBtn.classList.add('active');
      }
      selBtn.addEventListener('click', () => {
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
        qData, originalIdx, state, isForced, isSubmitted, userAnswer
      );
      wrapper.appendChild(escritaContent);

      // Comentário geral após envio de todas as partes
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

          if (!isForced) {
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
          !isSubmitted && !isForced
            ? `<button class="btn-cut" type="button" title="Cortar alternativa">✂️</button>`
            : '';

        const radioNameV = `q${originalIdx}_ass${originalAssIdx}`;
        const checkedV = hasAnswered && userChoice === true ? 'checked' : '';
        const checkedF = hasAnswered && userChoice === false ? 'checked' : '';
        const disabledAttr = isSubmitted || isForced ? 'disabled' : '';

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

        if (!isSubmitted && !isForced) {
          const radios = altWrapper.querySelectorAll(`input[name="${radioNameV}"]`);
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

        const isME = tipo === 'ME';
        const labelHtml = `
          <label class="alt-label ${isSelected ? 'selected' : ''}" for="${inputId}">
            <input type="radio" name="q_${originalIdx}" id="${inputId}"
              class="alt-input" value="${originalAltIdx}" ${checked}
              ${isSubmitted || isForced ? 'disabled' : ''}>
            <span class="alt-letter">${visualLetter})</span>
            <span class="alt-text${isME ? ' markable-text' : ''}">${altText}</span>
          </label>
        `;
        altWrapper.innerHTML = labelHtml + scissorBtn;

        // Word marking for ME alternativas
        if (isME) {
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

  // ===================== ESCRITA helpers =====================

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
    } else if (tipo === 'ME') {
      const gabIdx = ((q.gabarito || '').trim().toUpperCase().charCodeAt(0) || 65) - 65;

      altMap.forEach((origIdx, visIdx) => {
        const alt = q.alternativas[origIdx];
        const letter = String.fromCharCode(65 + visIdx);
        let line = `${letter}) ${strip(alt.texto)}`;
        if (sub && origIdx === gabIdx) line += ' ✔ Gabarito';
        lines.push(line);
        if (sub && alt.comentario) lines.push(`Comentário do gabarito: ${strip(alt.comentario)}`);
      });

      if (sub && q.comentario_geral) lines.push(`Comentário Geral:\n${strip(q.comentario_geral)}`);

    } else if (tipo === 'CH') {
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
    }

    return lines.join('\n');
  }

  // ===================== Pontuação =====================

  /**
   * Retorna { hits, total } para a questão idx.
   * - ME / VF: total = 1, hits = 1 ou 0
   * - CH: total = número de assertivas, hits = quantas julgadas corretamente
   * - ESCRITA simples: total = 10, hits = selfEval (0–10)
   * - ESCRITA itens: total = numItens × 10, hits = soma dos selfEvals
   */
  computeQuestionScore(state, idx) {
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

    if (tipo === 'CH') {
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

      return { hits, total };
    }

    // ME / VF
    const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
    if (!gabaritoLetra) return { hits: 0, total: 0 };
    const gabaritoIdx = gabaritoLetra.charCodeAt(0) - 65;
    const isCorrect = ans.selectedOriginalIdx === gabaritoIdx;
    return { hits: isCorrect ? 1 : 0, total: 1 };
  }

  updateFooter(state) {
    let totalQuestions = 0;
    let allSubmitted = true;
    let sumHits = 0;
    let incorrectIndices = [];

    // Rastreamento por tipo
    const typeOrder = ['ME', 'VF', 'CH', 'ESCRITA'];
    const typeLabels = {
      ME: 'Múltipla Escolha',
      VF: 'Verdadeiro ou Falso (simples)',
      CH: 'Verdadeiro ou Falso (múltiplo)',
      ESCRITA: 'Escrita'
    };
    const typeStats = {};
    typeOrder.forEach((t) => { typeStats[t] = { sumScore: 0, count: 0 }; });

    state.mappings.qOrder.forEach((idx) => {
      if (state.forcedIndices && state.forcedIndices.includes(idx)) return;

      const qData = state.questions[idx];
      const tipo = (qData.tipo || '').toUpperCase();
      totalQuestions++;

      const ans = state.userAnswers[idx];
      if (!ans || !ans.submitted) {
        allSubmitted = false;
        return;
      }

      const { hits, total } = this.computeQuestionScore(state, idx);
      if (total > 0) {
        const questionScore = hits / total;
        sumHits += questionScore;
        if (questionScore < 1) incorrectIndices.push(idx);
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

    if (allSubmitted && totalQuestions > 0) {
      this.btnSubmitAll.style.display = 'none';
      this.scoreDisplay.style.display = 'none';
      this._renderResultCard(typeStats, typeOrder, typeLabels, sumHits, totalQuestions, incorrectIndices);
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

  _renderResultCard(typeStats, typeOrder, typeLabels, sumHits, totalQuestions, incorrectIndices) {
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

    let html = '<div class="result-title">Resultado</div>';
    html += `<div class="result-row result-general">`;
    html += `<strong>Pontuação geral:</strong> ${fmt(sumHits)}/${totalQuestions} pontos | ${fmtPct(pct)}% de taxa de acerto`;
    html += `</div>`;

    typeOrder.forEach((tipo) => {
      const stat = typeStats[tipo];
      if (!stat || stat.count === 0) return;
      const typePct = stat.count > 0 ? (stat.sumScore / stat.count * 100) : 0;
      html += `<div class="result-row">`;
      html += `${typeLabels[tipo]}: ${fmt(stat.sumScore)}/${stat.count} pontos | ${fmtPct(typePct)}% de taxa de acerto`;
      html += `</div>`;
    });

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
  }
}
