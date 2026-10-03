// Questões de associação: setas, tabela, gabarito visual e recursos de interação.
import { formatText } from './utils.js?v=20261003-450';
import { parseMqGabarito } from './scoring.js?v=20261003-450';
import { readVisualPreferences } from './preferences.js?v=20261003-450';

export class MatchingQuestions {
  constructor({ container, onChange }) {
    this.container = container;
    this.onChange = onChange;
    this._cleanups = new Map();
    this._fontSizes = new WeakMap();
    this._questionTimers = new Map();
    this._contextMenu = null;
    this._contextMenuQuestion = null;
    this._contextMenuCloser = null;
    this._contextMenuTimer = null;
  }

  clearQuestion(originalIdx) {
    if (this._contextMenuQuestion === originalIdx) this._hideContextMenu();
    this._cleanups.get(originalIdx)?.();
    this._cleanups.delete(originalIdx);
    const timers = this._questionTimers.get(originalIdx);
    timers?.forEach((timer) => clearTimeout(timer));
    this._questionTimers.delete(originalIdx);
  }

  clear() {
    this._hideContextMenu();
    const ids = new Set([...this._cleanups.keys(), ...this._questionTimers.keys()]);
    ids.forEach((idx) => this.clearQuestion(idx));
  }

  dispose() {
    this.clear();
    this._fontSizes = new WeakMap();
  }

  _setTimer(originalIdx, callback, delay) {
    if (!this._questionTimers.has(originalIdx)) this._questionTimers.set(originalIdx, new Set());
    const timers = this._questionTimers.get(originalIdx);
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!timers.size) this._questionTimers.delete(originalIdx);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  }

  _clearTimer(originalIdx, timer) {
    clearTimeout(timer);
    const timers = this._questionTimers.get(originalIdx);
    timers?.delete(timer);
    if (timers && !timers.size) this._questionTimers.delete(originalIdx);
  }

  _hideContextMenu() {
    clearTimeout(this._contextMenuTimer);
    this._contextMenuTimer = null;
    if (this._contextMenuCloser) {
      document.removeEventListener('click', this._contextMenuCloser);
      document.removeEventListener('contextmenu', this._contextMenuCloser);
      this._contextMenuCloser = null;
    }
    this._contextMenu?.remove();
    this._contextMenu = null;
    this._contextMenuQuestion = null;
  }

  // ===================== MQ (Matching Question / Associação) Helpers =====================

  render(qData, originalIdx, state, isLocked, isSubmitted, userAnswer) {
    this.clearQuestion(originalIdx);
    const renderMode = readVisualPreferences().mqRenderMode;
    if (renderMode === 'table') {
      return this._renderTable(qData, originalIdx, state, isLocked, isSubmitted, userAnswer);
    }
    return this._renderArrows(qData, originalIdx, state, isLocked, isSubmitted, userAnswer);
  }

  _renderArrows(qData, originalIdx, state, isLocked, isSubmitted, userAnswer) {
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
    const gabMap = parseMqGabarito(qData);
    const userSet = new Set(userConns.map((c) =>
      `${c.leftOrigIdx ?? c.left}_${c.rightOrigIdx ?? c.right}`));

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
      const itemGroup = document.createElement('div');
      itemGroup.className = 'mq-item-group';
      itemGroup.appendChild(itemEl);
      if (isSubmitted) {
        const targets = gabMap.get(origIdx) || new Set();
        const missingLetters = rightIndices.flatMap((rightIdx, visualIdx) =>
          targets.has(rightIdx) && !userSet.has(`${origIdx}_${rightIdx}`)
            ? [String.fromCharCode(65 + visualIdx)] : []);
        if (missingLetters.length) {
          const notice = document.createElement('div');
          notice.className = 'mq-omission';
          notice.append('Faltou: ');
          const letters = document.createElement('strong');
          letters.textContent = missingLetters.join(', ');
          notice.appendChild(letters);
          notice.tabIndex = 0;
          notice.setAttribute('role', 'button');
          notice.setAttribute('aria-label', `Mostrar as associações que faltaram no item ${visIdx + 1}: ${missingLetters.join(', ')}`);
          const selectOmissions = () => {
            if (this.container.classList.contains('selection-mode')) return;
            const isSameSelection = reviewSelection?.kind === 'omissions' &&
              reviewSelection.index === origIdx;
            setReviewSelection(isSameSelection ? null : { kind: 'omissions', index: origIdx });
          };
          notice.addEventListener('click', selectOmissions);
          notice.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectOmissions();
            }
          });
          itemGroup.appendChild(notice);
        }
      }
      leftList.appendChild(itemGroup);
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
    defs.appendChild(createMarker(`mq-arr-omit-${originalIdx}`, '', '#86efac'));
    svg.appendChild(defs);

    const pathsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(pathsGroup);
    container.appendChild(svg);

    let reviewSelection = null;
    const isSelected = (line) => reviewSelection && (
      reviewSelection.kind === 'omissions'
        ? line.statusClass === 'mq-arrow-omission-focus' && line.leftOrigIdx === reviewSelection.index :
      reviewSelection.side === 'left' ? line.leftOrigIdx === reviewSelection.index :
      reviewSelection.side === 'right' ? line.rightOrigIdx === reviewSelection.index :
      line.leftOrigIdx === reviewSelection.left && line.rightOrigIdx === reviewSelection.right
    );

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

        if (reviewSelection?.kind === 'omissions') {
          const missingTargets = gabMap.get(reviewSelection.index) || new Set();
          missingTargets.forEach((rightIdx) => {
            if (userSet.has(`${reviewSelection.index}_${rightIdx}`)) return;
            linesToDraw.push({
              leftOrigIdx: reviewSelection.index,
              rightOrigIdx: rightIdx,
              color: '#86efac',
              markerId: `mq-arr-omit-${originalIdx}`,
              width: 3.5,
              statusClass: 'mq-arrow-omission-focus',
              interactive: false
            });
          });
        }

      }

      linesToDraw.sort((a, b) => Number(!!isSelected(a)) - Number(!!isSelected(b)));

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
        if (isSelected(ld) && ld.statusClass !== 'mq-arrow-omission-focus') {
          path.classList.add('mq-arrow-review-selected');
        }
        pathsGroup.appendChild(path);

        if (isSubmitted && !isLocked) {
          const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          hitbox.setAttribute('d', pathD);
          hitbox.setAttribute('fill', 'none');
          hitbox.setAttribute('stroke', 'transparent');
          hitbox.setAttribute('stroke-width', '18');
          hitbox.setAttribute('class', 'mq-arrow-hitbox');
          hitbox.setAttribute('tabindex', '0');
          hitbox.setAttribute('role', 'button');
          const label = `Destacar associação ${leftIndices.indexOf(ld.leftOrigIdx) + 1} com ${String.fromCharCode(65 + rightIndices.indexOf(ld.rightOrigIdx))}`;
          hitbox.setAttribute('aria-label', label);
          hitbox.setAttribute('aria-pressed', String(!!isSelected(ld)));
          const select = () => {
            if (this.container.classList.contains('selection-mode')) return;
            setReviewSelection({ left: ld.leftOrigIdx, right: ld.rightOrigIdx });
          };
          hitbox.addEventListener('click', (event) => {
            event.stopPropagation();
            select();
          });
          hitbox.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              select();
              pathsGroup.querySelector(`[aria-label="${label}"]`)?.focus();
            }
          });
          pathsGroup.appendChild(hitbox);
        }

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
            if (this.onChange) {
              this.onChange(originalIdx, userConns);
            }
            drawArrows();
          };

          hitbox.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showContextMenu(e.clientX, e.clientY, () => removeConnection(), originalIdx);
          });

          let tapCount = 0;
          let tapTimer = null;
          hitbox.addEventListener('click', (e) => {
            tapCount++;
            if (tapCount === 1) {
              path.classList.add('mq-arrow-selected');
              tapTimer = this._setTimer(originalIdx, () => {
                tapCount = 0;
                path.classList.remove('mq-arrow-selected');
              }, 400);
            } else if (tapCount === 2) {
              this._clearTimer(originalIdx, tapTimer);
              tapCount = 0;
              path.classList.remove('mq-arrow-selected');
              this._showContextMenu(e.clientX, e.clientY, () => removeConnection(), originalIdx);
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

        if (this.onChange) {
          this.onChange(originalIdx, userConns);
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

    let frame = null;
    const scheduleDraw = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (container.isConnected) {
          updateFontControlsLayout();
          drawArrows();
        }
      });
    };
    const setReviewSelection = (selection) => {
      reviewSelection = selection;
      container.querySelectorAll('.mq-item').forEach((item) => {
        const selected = !!selection && item.dataset.side === selection.side &&
          Number(item.dataset.origIdx) === selection.index;
        item.classList.toggle('mq-item-review-selected', selected);
        if (isSubmitted && !isLocked) item.setAttribute('aria-pressed', String(selected));
      });
      drawArrows();
    };
    const clearReviewSelection = (event) => {
      if (reviewSelection && (!container.contains(event.target) ||
          !event.target.closest('.mq-item, .mq-arrow-hitbox, .mq-omission'))) setReviewSelection(null);
    };
    if (isSubmitted && !isLocked) {
      container.querySelectorAll('.mq-item').forEach((item) => {
        item.classList.add('mq-item-review');
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-pressed', 'false');
        const select = () => {
          if (this.container.classList.contains('selection-mode')) return;
          setReviewSelection({ side: item.dataset.side, index: Number(item.dataset.origIdx) });
        };
        item.addEventListener('click', select);
        item.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select();
          }
        });
      });
      document.addEventListener('click', clearReviewSelection, true);
    }

    // Preferências locais à questão, preservadas ao responder ou trocar de modo.
    const fontSizes = this._fontSizes.get(qData) || {};
    this._fontSizes.set(qData, fontSizes);
    const addFontControls = (column, side, label) => {
      const controls = document.createElement('div');
      controls.className = 'mq-column-font-controls';
      const buttons = [];
      const update = () => {
        if (fontSizes[side] !== undefined) {
          column.style.setProperty('--mq-column-font-size', `${fontSizes[side]}px`);
        }
        buttons.forEach(({ button, delta }) => {
          button.disabled = delta < 0 ? fontSizes[side] <= 10 : fontSizes[side] >= 28;
        });
      };
      [-1, 1].forEach((delta) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-mq-tool';
        button.textContent = delta < 0 ? 'A−' : 'A+';
        button.title = `${delta < 0 ? 'Diminuir' : 'Aumentar'} fonte da coluna ${label}`;
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', () => {
          const item = column.querySelector('.mq-item');
          const current = fontSizes[side] ?? (parseFloat(getComputedStyle(item || column).fontSize) || 16);
          fontSizes[side] = Math.max(10, Math.min(28, current + delta));
          update();
          scheduleDraw();
        });
        buttons.push({ button, delta });
        controls.appendChild(button);
      });
      column.querySelector('.mq-column-header').appendChild(controls);
      update();
    };
    addFontControls(leftCol, 'left', 'esquerda');
    addFontControls(rightCol, 'right', 'direita');

    const updateFontControlsLayout = () => {
      const needsStack = [leftCol, rightCol].some((column) => {
        const header = column.querySelector('.mq-column-header');
        const title = header.querySelector('strong');
        const measure = title.cloneNode(true);
        measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;width:max-content;max-width:none;';
        header.appendChild(measure);
        const titleWidth = measure.getBoundingClientRect().width;
        measure.remove();
        const controlsWidth = header.querySelector('.mq-column-font-controls').getBoundingClientRect().width;
        const style = getComputedStyle(header);
        const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return titleWidth + 2 * (controlsWidth + 8) > available;
      });
      layout.classList.toggle('mq-font-controls-stacked', needsStack);
    };

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleDraw) : null;
    [container, leftCol, rightCol, leftList, rightList, ...container.querySelectorAll('.mq-item')]
      .forEach((element) => observer?.observe(element));
    container.addEventListener('load', scheduleDraw, true);
    window.addEventListener('resize', scheduleDraw, { passive: true });
    this._cleanups.set(originalIdx, () => {
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener('click', clearReviewSelection, true);
      container.removeEventListener('load', scheduleDraw, true);
      window.removeEventListener('resize', scheduleDraw);
    });
    scheduleDraw();

    return container;
  }

  _showContextMenu(clientX, clientY, onDelete, originalIdx) {
    this._hideContextMenu();
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
      this._hideContextMenu();
    });
    menu.appendChild(btn);
    document.body.appendChild(menu);
    this._contextMenu = menu;
    this._contextMenuQuestion = originalIdx;
    this._contextMenuCloser = (event) => {
      if (!menu.contains(event.target)) this._hideContextMenu();
    };
    this._contextMenuTimer = setTimeout(() => {
      this._contextMenuTimer = null;
      if (this._contextMenu !== menu) return;
      document.addEventListener('click', this._contextMenuCloser);
      document.addEventListener('contextmenu', this._contextMenuCloser);
    }, 10);
  }

  _renderTable(qData, originalIdx, state, isLocked, isSubmitted, userAnswer) {
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
    const resizeCleanups = new Set();

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
        try {
          if (resizerCol1.hasPointerCapture(e.pointerId)) resizerCol1.releasePointerCapture(e.pointerId);
        } catch {}
        resizeCleanups.delete(onPointerUp);
      };

      resizeCleanups.add(onPointerUp);
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
          try {
            if (resizerEl.hasPointerCapture(e.pointerId)) resizerEl.releasePointerCapture(e.pointerId);
          } catch {}
          resizeCleanups.delete(onPointerUp);
        };

        resizeCleanups.add(onPointerUp);
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
            if (this.onChange) {
              this.onChange(originalIdx, userConns);
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
    this._cleanups.set(originalIdx, () => {
      window.removeEventListener('keydown', escHandler);
      resizeCleanups.forEach((cleanup) => cleanup());
      resizeCleanups.clear();
      if (container.classList.contains('mq-is-expanded')) closeExpand();
    });

    return container;
  }

  renderAnswerHtml(qData, originalIdx, state) {
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

}
