import { QUESTION_PROGRESS, questionProgress, visiblePageNumbers } from './pagination.js?v=20261004-461';

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
    this.jump = document.getElementById('paginationJumpDialog');
    this.jumpInput = document.getElementById('paginationJumpInput');
    this.cleanups = [];
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
    this.listen(window, 'resize', () => { this.updatePageNumbers(); this.measureDock(); });
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      this.updatePageNumbers(); this.measureDock();
    }) : null;
    for (const element of [this.dock, this.footer, this.pageRow]) if (element) this.resizeObserver?.observe(element);
    this.footerObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => this.measureDock()) : null;
    if (this.footer) this.footerObserver?.observe(this.footer, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  listen(element, type, listener) {
    element?.addEventListener(type, listener);
    this.cleanups.push(() => element?.removeEventListener(type, listener));
  }

  update(state, pages, current, visible) {
    if (this.state !== state || !visible) this.close();
    this.state = state;
    this.pages = pages;
    this.current = current;
    this.visible = visible;
    this.dock?.classList.toggle('hidden', !visible);
    if (!visible) { this.measureDock(); return; }
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
    const width = this.pageRow?.clientWidth || Math.max(220, Math.min(720, window.innerWidth - 32));
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
    const height = this.visible && this.dock ? this.dock.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--pagination-footer-offset', `${offset}px`);
    document.documentElement.style.setProperty('--pagination-dock-height', `${height}px`);
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
    if (!this.visible) return;
    this.renderMap();
    this.map.showModal();
    const first = document.getElementById('questionMapList').querySelector('.question-map-current');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: 'nearest' });
  }

  renderMap() {
    const list = document.getElementById('questionMapList');
    list.innerHTML = '';
    const order = this.state.mappings.qOrder;
    const page = this.pages[this.current];
    const counts = {};
    document.getElementById('questionMapSummary').textContent = `${order.length} questões · ${this.pages.length} páginas`;
    for (let position = 0; position < order.length;) {
      const start = position;
      const group = this.state.questions[order[position]]?._groupData;
      while (++position < order.length) {
        const next = this.state.questions[order[position]]?._groupData;
        if (group ? !next || next.id !== group.id : next) break;
      }
      const section = document.createElement('section');
      section.className = group ? 'question-map-group' : 'question-map-run';
      if (group) {
        const title = document.createElement('div');
        title.className = 'question-map-group-title';
        title.textContent = `Grupo · ${start + 1}${position - start > 1 ? `–${position}` : ''}`;
        section.appendChild(title);
        section.setAttribute('aria-label', title.textContent);
      }
      const grid = document.createElement('div');
      grid.className = 'question-map-grid';
      for (let index = start; index < position; index++) {
        const original = order[index];
        const status = questionProgress(this.state, original);
        const { label, symbol } = QUESTION_PROGRESS[status];
        counts[status] = (counts[status] || 0) + 1;
        const current = index >= page.start && index < page.end;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `question-map-tile progress-${status}${current ? ' question-map-current' : ''}`;
        button.dataset.question = index + 1;
        button.title = `Questão ${index + 1} · ${label}${current ? ' · Página atual' : ''}`;
        button.setAttribute('aria-label', button.title);
        if (current) button.setAttribute('aria-current', 'location');
        button.innerHTML = `<span class="question-map-number">${index + 1}</span><span class="question-map-symbol" aria-hidden="true">${symbol}</span>`;
        grid.appendChild(button);
      }
      section.appendChild(grid);
      list.appendChild(section);
    }
    const legend = document.getElementById('questionMapLegend');
    legend.innerHTML = Object.entries(QUESTION_PROGRESS).filter(([status]) => counts[status] || ['empty', 'draft', 'correct', 'wrong'].includes(status))
      .map(([status, { label, symbol }]) => `<span class="question-map-legend-item"><span class="progress-${status} legend-symbol" aria-hidden="true">${symbol}</span>${label}<small>${counts[status] || 0}</small></span>`).join('');
  }

  close() { for (const dialog of [this.map, this.jump]) if (dialog?.open) dialog.close(); }
  dispose() { this.close(); this.cleanups.forEach((cleanup) => cleanup()); this.resizeObserver?.disconnect(); this.footerObserver?.disconnect(); }
}
