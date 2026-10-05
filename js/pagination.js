import { appStorage } from './release-config.js?v=20261004-470';
import { computeQuestionScore } from './scoring.js?v=20261004-470';

export const QUESTION_PROGRESS = {
  empty: { label: 'Não respondida', symbol: '○' },
  draft: { label: 'Resposta não enviada', symbol: '●' },
  correct: { label: 'Correta', symbol: '✓' },
  wrong: { label: 'Errada', symbol: '×' },
  partial: { label: 'Acerto parcial', symbol: '◐' },
  pending: { label: 'Aguardando avaliação', symbol: '…' },
  excluded: { label: 'Contexto ou desativada', symbol: '–' }
};

export function questionProgress(state, originalIdx) {
  if (state.forcedIndices?.includes(originalIdx) || state.disabledIndices?.includes(originalIdx)) return 'excluded';
  const question = state.questions[originalIdx];
  const answer = state.userAnswers?.[originalIdx] || {};
  if (!answer.submitted) {
    const started = Number.isInteger(answer.selectedOriginalIdx)
      || answer.selectedOriginalIndices?.length > 0 || answer.connections?.length > 0
      || Object.values(answer.assertivaAnswers || {}).some((choice) => typeof choice === 'boolean')
      || String(answer.text || '').trim().length > 0
      || answer.items?.some((item) => item && (item.submitted || String(item.text || '').trim().length > 0));
    return started ? 'draft' : 'empty';
  }
  if (question?.tipo?.toUpperCase() === 'ESCRITA') {
    const items = question.itens || [];
    const pending = items.length || question.subtipo === 'itens'
      ? !items.length || items.some((_, index) => !Number.isFinite(answer.items?.[index]?.selfEval))
      : !Number.isFinite(answer.selfEval);
    if (pending) return 'pending';
  }
  const { hits, total } = computeQuestionScore(state, originalIdx);
  if (total <= 0) return 'pending';
  if (hits >= total - 1e-9) return 'correct';
  return hits > 0 ? 'partial' : 'wrong';
}

// Números de páginas próximos da atual, com extremos e lacunas explícitas.
export function visiblePageNumbers(total, current, capacity) {
  if (total <= capacity) return Array.from({ length: total }, (_, index) => index + 1);
  const chosen = new Set([1, current, total]);
  const tokens = () => [...chosen].sort((a, b) => a - b).flatMap((page, index, values) =>
    index && page - values[index - 1] > 1 ? [null, page] : [page]);
  if (capacity < 5) return [...chosen].sort((a, b) => a - b);
  for (let distance = 1; distance < capacity; distance++) {
    for (const candidate of [current - distance, current + distance]) {
      if (candidate < 1 || candidate > total || chosen.has(candidate)) continue;
      chosen.add(candidate);
      if (tokens().length > capacity) chosen.delete(candidate);
    }
  }
  return tokens();
}

export function normalizePagination(value = {}) {
  const count = Number(value?.pageSize);
  return {
    enabled: value?.enabled === true,
    pageSize: Number.isSafeInteger(count) && count > 0 ? count : 1,
    exclusiveGroups: value?.exclusiveGroups === true
  };
}

export function readGlobalPagination() {
  try { return normalizePagination(JSON.parse(appStorage.getItem('gs_pagination') || '{}')); }
  catch { return normalizePagination(); }
}

export function effectivePagination(state) {
  return state?.config?.pagination == null
    ? readGlobalPagination() : normalizePagination(state.config.pagination);
}

// Limites na ordem visual completa: os índices originais e a numeração não mudam.
export function buildQuestionPages(questions, order, settings) {
  if (!order.length) return [];
  const { enabled, pageSize, exclusiveGroups } = normalizePagination(settings);
  if (!enabled) return [{ start: 0, end: order.length }];
  const pages = [];
  let start = 0;
  let end = 0;
  const flush = () => {
    if (end > start) pages.push({ start, end });
    start = end;
  };
  while (end < order.length) {
    const group = questions[order[end]]?._groupData;
    let blockEnd = end + 1;
    if (group) {
      while (blockEnd < order.length && questions[order[blockEnd]]?._groupData?.id === group.id) blockEnd++;
    }
    const size = blockEnd - end;
    if ((group && exclusiveGroups) || end - start + size > pageSize) flush();
    end = blockEnd;
    if ((group && exclusiveGroups) || end - start >= pageSize) flush();
  }
  flush();
  return pages;
}

export function pageForQuestion(pages, order, originalIdx) {
  const position = order.indexOf(originalIdx);
  return Math.max(0, pages.findIndex(({ start, end }) => position >= start && position < end));
}

// Os controles são os mesmos no painel do topo e no popup de configurações.
export class PaginationSettings {
  constructor({ root, getState, hasSession, onBeforeChange, onChange }) {
    this.root = root;
    this.getState = getState;
    this.hasSession = hasSession;
    this.onBeforeChange = onBeforeChange;
    this.onChange = onChange;
    if (!root) return;
    const fields = (scope) => `
      <div class="pagination-fields">
        <label>Exibição
          <select data-paging="enabled" data-scope="${scope}" aria-label="Exibição ${scope === 'global' ? 'global' : 'desta sessão'}">
            <option value="false">Lista contínua</option><option value="true">Por páginas</option>
          </select>
        </label>
        <label>Questões por página
          <input type="number" min="1" step="1" inputmode="numeric" data-paging="pageSize" data-scope="${scope}" aria-label="Questões por página ${scope === 'global' ? 'global' : 'desta sessão'}">
        </label>
      </div>
      <label class="toggle-label"><input type="checkbox" data-paging="exclusiveGroups" data-scope="${scope}"> Cada grupo em uma página exclusiva</label>`;
    root.innerHTML = `
      <div class="pagination-settings-card">
        <strong>Exibição das questões · Padrão global</strong>
        <p>Aplicado às sessões que usam o padrão deste navegador.</p>
        ${fields('global')}
      </div>
      <div class="pagination-settings-card pagination-session" data-paging-session="true">
        <strong>Sessão atual</strong>
        <label class="toggle-label"><input type="checkbox" data-paging="custom"> Usar configuração própria nesta sessão</label>
        <p data-paging-status="true"></p>
        <div data-paging-custom="true">${fields('session')}</div>
      </div>
      <p class="pagination-settings-note">Grupos nunca são divididos. Se um grupo ultrapassar o limite, ele aparece inteiro na mesma página.</p>`;
    this.listener = (event) => {
      const input = event.target;
      const key = input.dataset.paging;
      if (!key) return;
      const state = getState();
      const sessionChange = key === 'custom' || input.dataset.scope === 'session';
      if (sessionChange && !hasSession()) return;
      if (key === 'pageSize' && (!Number.isSafeInteger(Number(input.value)) || Number(input.value) < 1)) {
        this.refresh();
        return;
      }
      onBeforeChange?.();
      if (key === 'custom') {
        if (input.checked) state.config.pagination = { ...effectivePagination(state) };
        else delete state.config.pagination;
      } else {
        const values = sessionChange ? effectivePagination(state) : readGlobalPagination();
        values[key] = key === 'pageSize' ? Number(input.value)
          : key === 'enabled' ? input.value === 'true' : input.checked;
        if (sessionChange) state.config.pagination = normalizePagination(values);
        else appStorage.setItem('gs_pagination', JSON.stringify(normalizePagination(values)));
      }
      this.refresh();
      onChange?.(sessionChange);
    };
    root.addEventListener('change', this.listener);
    this.refresh();
  }

  refresh() {
    if (!this.root) return;
    const state = this.getState();
    const custom = state?.config?.pagination != null;
    this.root.querySelector('[data-paging-session="true"]').classList.toggle('hidden', !this.hasSession());
    this.root.querySelector('[data-paging="custom"]').checked = custom;
    this.root.querySelector('[data-paging-custom="true"]').classList.toggle('hidden', !custom);
    this.root.querySelector('[data-paging-status="true"]').textContent = custom
      ? 'Salva com a sessão e incluída na sincronização.' : 'Esta sessão acompanha o padrão global.';
    for (const scope of ['global', 'session']) {
      const settings = scope === 'global' ? readGlobalPagination() : effectivePagination(state);
      this.root.querySelectorAll(`[data-scope="${scope}"]`).forEach((input) => {
        const key = input.dataset.paging;
        if (key === 'exclusiveGroups') input.checked = settings[key];
        else input.value = String(settings[key]);
        input.disabled = key !== 'enabled' && !settings.enabled;
      });
    }
  }

  dispose() { this.root?.removeEventListener('change', this.listener); }
}
