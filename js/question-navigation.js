import { QUESTION_PROGRESS, questionProgress, visiblePageNumbers } from './pagination.js?v=20261004-463';
import { readVisualPreferences } from './preferences.js?v=20261004-463';

export class QuestionNavigation {
  constructor({ onPage, onQuestion }) {
    this.onPage = onPage;
    this.onQuestion = onQuestion;
    this.nav = document.getElementById('quizPagination');
    this.dock = document.getElementById('paginationDock');
    this.footer = document.getElementById('footerBar');
    this.range = document.getElementById('paginationQuestionRange');
    this.count = document.getElementById('paginationPageCount');
    this.pageRow = document.getElementById('paginationPageRow');
    this.numbers = document.getElementById('paginationNumbers');
    this.pageJump = document.getElementById('paginationPageJump');
    this.map = document.getElementById('questionMapDialog');
    this.mapShortcut = document.getElementById('btnQuickQuestionMap');
    if (this.mapShortcut) this.mapShortcut.disabled = true;
    this.jump = document.getElementById('paginationJumpDialog');
    this.jumpInput = document.getElementById('paginationJumpInput');
    this.cleanups = [];
    this.mapFrame = null;
    this.listen(document, 'keydown', (event) => {
      if (!this.visible || event.defaultPrevented || event.repeat || event.isComposing ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const target = event.target;
      if (target?.isContentEditable || target?.closest?.('input, textarea, select, [role="slider"], [role="radio"], [role="tab"], [role="listbox"], [role="menu"]') ||
          document.querySelector('dialog[open], .modal-overlay:not(.hidden)') ||
          ['flex', 'block'].includes(document.getElementById('imgModal')?.style.display)) return;
      const next = this.current + (event.key === 'ArrowRight' ? 1 : -1);
      if (next < 0 || next >= this.pages.length) return;
      event.preventDefault();
      this.onPage(next);
    });
    this.listen(this.range, 'click', (event) => {
      if (event.target.closest('[data-open-map="true"]')) this.openMap();
      else if (event.target.closest('[data-jump-question="true"]')) this.openJump('question');
    });
    this.listen(this.numbers, 'click', (event) => {
      const button = event.target.closest('[data-page]');
      if (!button) return;
      this.onPage(Number(button.dataset.page) - 1);
      this.numbers.querySelector(`[data-page="${button.dataset.page}"]`)?.focus({ preventScroll: true });
    });
    this.listen(this.pageJump, 'click', () => this.openJump('page'));
    this.listen(document.getElementById('questionMapClose'), 'click', () => this.map.close());
    this.listen(document.getElementById('paginationJumpCancel'), 'click', () => this.jump.close());
    this.listen(document.getElementById('questionMapList'), 'click', (event) => {
      const button = event.target.closest('[data-question]');
      if (!button) return;
      this.map.close();
      this.onQuestion(Number(button.dataset.question));
    });
    this.listen(document.getElementById('paginationJumpForm'), 'submit', (event) => {
      event.preventDefault();
      const value = Number(this.jumpInput.value);
      const maximum = this.jumpKind === 'page' ? this.pages.length : this.state.mappings.qOrder.length;
      if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
        this.jumpInput.setAttribute('aria-invalid', 'true');
        document.getElementById('paginationJumpError').textContent = `Digite um número de 1 a ${maximum}.`;
        this.jumpInput.focus();
        return;
      }
      this.jump.close();
      if (this.jumpKind === 'page') this.onPage(value - 1);
      else this.onQuestion(value);
    });
    for (const dialog of [this.map, this.jump]) {
      this.listen(dialog, 'click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      });
    }
    this.listen(window, 'resize', () => { this.updatePageNumbers(); this.measureDock(); this.scheduleMapLayout(); });
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      this.updatePageNumbers(); this.measureDock();
    }) : null;
    for (const element of [this.dock, this.footer, this.pageRow, document.getElementById('quizWidthShell')]) if (element) this.resizeObserver?.observe(element);
    this.footerObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => this.measureDock()) : null;
    if (this.footer) this.footerObserver?.observe(this.footer, { attributes: true, attributeFilter: ['class', 'style'] });
    this.mapObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.scheduleMapLayout()) : null;
    this.mapObserver?.observe(document.getElementById('questionMapList'));
  }

  listen(element, type, listener) {
    element?.addEventListener(type, listener);
    this.cleanups.push(() => element?.removeEventListener(type, listener));
  }

  update(state, pages, current, visible) {
    const mapAvailable = !!(state?.quizJson && state?.mappings?.qOrder?.length);
    if (this.state !== state || this.visible !== visible || !mapAvailable) this.close();
    this.state = state;
    this.pages = pages;
    this.current = current;
    this.visible = visible;
    this.mapAvailable = mapAvailable;
    if (this.mapShortcut) this.mapShortcut.disabled = !mapAvailable;
    this.applyPosition();
    this.dock?.classList.toggle('hidden', !visible);
    if (!visible) {
      this.measureDock();
      if (this.map?.open) this.renderMap();
      return;
    }
    const page = pages[current];
    const total = state.mappings.qOrder.length;
    const single = page.end - page.start === 1;
    this.range.innerHTML = `<button type="button" class="pagination-range-label" data-open-map="true"
      aria-haspopup="dialog" aria-controls="questionMapDialog" aria-label="${single ? 'Questão' : 'Questões'}: abrir mapa" title="Abrir mapa das questões">${single ? 'Questão' : 'Questões'}</button> <button
      type="button" class="pagination-range-number" data-jump-question="true" aria-haspopup="dialog"
      aria-label="Ir para uma questão pelo número" title="Ir para uma questão pelo número">${single ? page.start + 1 : `${page.start + 1}–${page.end}`}</button> de ${total}`;
    this.count.textContent = `Página ${current + 1} de ${pages.length}`;
    this.count.classList.toggle('hidden', pages.length === total);
    this.updatePageNumbers();
    this.measureDock();
    if (this.map?.open) this.renderMap();
  }

  updatePageNumbers() {
    if (!this.visible || !this.numbers) return;
    const total = this.pages.length;
    // Medir o espaço disponível evita que a largura compactada limite as próximas medições.
    const shell = document.getElementById('quizWidthShell');
    const available = this.position === 'fixed' ? window.innerWidth : Math.min(window.innerWidth, shell?.clientWidth || window.innerWidth);
    const width = Math.max(180, Math.min(520, available - 56));
    const cell = Math.max(40, String(total).length * 8 + 20);
    const allFit = total * (cell + 4) - 4 <= width;
    const jumpWidth = window.innerWidth <= 600 ? 44 : 100;
    const capacity = Math.max(3, Math.floor((width - (allFit ? 0 : jumpWidth + 8) + 4) / (cell + 4)));
    const tokens = visiblePageNumbers(total, this.current + 1, capacity);
    this.pageJump?.classList.toggle('hidden', allFit);
    this.numbers.style.setProperty('--pagination-cell-width', `${cell}px`);
    const signature = `${this.current}|${tokens.join(',')}`;
    if (signature === this.numberSignature) return;
    this.numberSignature = signature;
    this.numbers.innerHTML = tokens.map((number) => number === null
      ? '<span class="pagination-ellipsis" aria-hidden="true">…</span>'
      : `<button type="button" class="navigation-page" data-page="${number}" aria-label="Página ${number}"
          ${number === this.current + 1 ? 'aria-current="page"' : ''}>${number}</button>`).join('');
  }

  measureDock() {
    if (!document.documentElement) return;
    const footerFixed = this.footer && !this.footer.classList.contains('footer-inline') && !this.footer.classList.contains('hidden');
    const offset = footerFixed ? this.footer.getBoundingClientRect().height : 0;
    const rect = this.visible && this.position === 'fixed' && this.dock ? this.dock.getBoundingClientRect() : null;
    const height = rect ? rect.height + Math.max(8, window.innerHeight - rect.bottom - offset) : 0;
    document.documentElement.style.setProperty('--pagination-footer-offset', `${offset}px`);
    document.documentElement.style.setProperty('--pagination-dock-height', `${height}px`);
  }

  applyPosition() {
    this.position = readVisualPreferences().paginationPosition;
    const parent = this.position === 'fixed' ? document.body
      : document.getElementById(this.position === 'top' ? 'paginationTopSlot' : 'paginationBottomSlot');
    if (parent && this.dock?.parentElement !== parent) parent.appendChild(this.dock);
    this.dock?.classList.toggle('pagination-inline', this.position !== 'fixed');
    document.body.classList.toggle('quiz-pagination-fixed', !!this.visible && this.position === 'fixed');
    this.updatePageNumbers();
    this.measureDock();
  }

  openJump(kind) {
    if (!this.visible) return;
    this.jumpKind = kind;
    const total = kind === 'page' ? this.pages.length : this.state.mappings.qOrder.length;
    document.getElementById('paginationJumpTitle').textContent = kind === 'page' ? 'Ir para página' : 'Ir para questão';
    document.getElementById('paginationJumpHint').textContent = `Escolha um número de 1 a ${total}.`;
    document.getElementById('paginationJumpError').textContent = '';
    this.jumpInput.setAttribute('aria-invalid', 'false');
    this.jumpInput.max = String(total);
    this.jumpInput.value = String(kind === 'page' ? this.current + 1 : this.pages[this.current].start + 1);
    this.jump.showModal();
    this.jumpInput.focus();
    this.jumpInput.select?.();
  }

  openMap() {
    if (!this.mapAvailable || this.map?.open) return;
    this.renderMap();
    this.map.showModal();
    this.layoutMap();
    const list = document.getElementById('questionMapList');
    const first = list.querySelector('.question-map-current') || list.querySelector('.question-map-tile');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: 'nearest' });
  }

  renderMap() {
    const list = document.getElementById('questionMapList');
    list.innerHTML = '';
    const order = this.state.mappings.qOrder;
    const page = this.visible ? this.pages[this.current] : null;
    const counts = {};
    const grid = document.createElement('div');
    grid.className = 'question-map-grid';
    list.appendChild(grid);
    this.mapGroups = [];
    document.getElementById('questionMapSummary').textContent = `${order.length} questões${this.visible ? ` · ${this.pages.length} páginas` : ''}`;
    document.getElementById('questionMapHelp').textContent = `Toque em um número para ir à questão.${this.visible ? ' O contorno destaca a página atual.' : ''}`;
    for (let position = 0; position < order.length;) {
      const start = position;
      const group = this.state.questions[order[position]]?._groupData;
      while (++position < order.length) {
        const next = this.state.questions[order[position]]?._groupData;
        if (group ? !next || next.id !== group.id : next) break;
      }
      const groupButtons = [];
      for (let index = start; index < position; index++) {
        const original = order[index];
        const status = questionProgress(this.state, original);
        const { label, symbol } = QUESTION_PROGRESS[status];
        counts[status] = (counts[status] || 0) + 1;
        const current = !!page && index >= page.start && index < page.end;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `question-map-tile progress-${status}${current ? ' question-map-current' : ''}`;
        button.dataset.question = index + 1;
        button.title = `Questão ${index + 1} · ${label}${group ? ` · Grupo: questões ${start + 1}–${position}` : ''}${current ? ' · Página atual' : ''}`;
        button.setAttribute('aria-label', button.title);
        if (current) button.setAttribute('aria-current', 'location');
        button.innerHTML = `<span class="question-map-number">${index + 1}</span><span class="question-map-symbol" aria-hidden="true">${symbol}</span>`;
        grid.appendChild(button);
        if (group) groupButtons.push(button);
      }
      if (group) this.mapGroups.push(groupButtons);
    }
    const legend = document.getElementById('questionMapLegend');
    legend.innerHTML = Object.entries(QUESTION_PROGRESS).filter(([status]) => counts[status] || ['empty', 'draft', 'correct', 'wrong'].includes(status))
      .map(([status, { label, symbol }]) => `<span class="question-map-legend-item"><span class="progress-${status} legend-symbol" aria-hidden="true">${symbol}</span>${label}<small>${counts[status] || 0}</small></span>`).join('')
      + (this.mapGroups.length ? '<span class="question-map-legend-item"><span class="legend-group" aria-hidden="true"></span>Questões do mesmo grupo · lados abertos indicam continuação</span>' : '')
      + (this.visible ? '<span class="question-map-legend-item"><span class="legend-current" aria-hidden="true"></span>Página atual</span>' : '');
    this.scheduleMapLayout();
  }

  scheduleMapLayout() {
    if (!this.map?.open || this.mapFrame !== null) return;
    this.mapFrame = requestAnimationFrame(() => { this.mapFrame = null; this.layoutMap(); });
  }

  layoutMap() {
    if (!this.map?.open) return;
    const list = document.getElementById('questionMapList');
    const grid = list.querySelector('.question-map-grid');
    if (!grid) return;
    const total = this.state.mappings.qOrder.length;
    const width = Math.max(60, list.clientWidth - 8);
    const columns = Math.max(1, Math.min(Math.ceil(Math.sqrt(total)), Math.floor((width - 12) / 62)));
    grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    grid.style.width = `${Math.min(width, columns * 62 + 12)}px`;
    grid.querySelectorAll('.question-map-group').forEach((segment) => segment.remove());
    const origin = grid.getBoundingClientRect();
    for (const buttons of this.mapGroups) {
      const rows = [];
      buttons.forEach((button) => {
        const rect = button.getBoundingClientRect();
        if (!rows.length || Math.abs(rows.at(-1)[0].top - rect.top) > 2) rows.push([]);
        rows.at(-1).push(rect);
      });
      rows.forEach((row, index) => {
        const before = index > 0;
        const after = index < rows.length - 1;
        const first = row[0], last = row.at(-1);
        const left = before ? 0 : first.left - origin.left - 6;
        const right = after ? origin.width : last.right - origin.left + 6;
        const segment = document.createElement('div');
        segment.className = `question-map-group${before ? ' continues-before' : ''}${after ? ' continues-after' : ''}`;
        segment.setAttribute('aria-hidden', 'true');
        segment.style.left = `${left}px`;
        segment.style.top = `${first.top - origin.top - 6}px`;
        segment.style.width = `${right - left}px`;
        segment.style.height = `${first.height + 12}px`;
        grid.appendChild(segment);
      });
    }
  }

  close() { for (const dialog of [this.map, this.jump]) if (dialog?.open) dialog.close(); }
  dispose() {
    this.close(); this.cleanups.forEach((cleanup) => cleanup());
    this.resizeObserver?.disconnect(); this.footerObserver?.disconnect(); this.mapObserver?.disconnect();
    if (this.mapFrame !== null) cancelAnimationFrame(this.mapFrame);
  }
}
