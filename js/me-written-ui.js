import { writtenMode, writtenStage, writtenCompatibility, writtenStats, canFallbackWritten } from './me-written.js?v=20261028-500';
import { formatText } from './utils.js?v=20261028-500';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, action, className = 'btn btn-sm') => {
  const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b;
};

export function renderWrittenSettings(container, state, indices, onChange, locked = false) {
  if (!container) return;
  const questions = indices.filter(idx => !state.forcedIndices?.includes(idx) && !state.deletedIndices?.includes(idx))
    .map(idx => state.questions[idx]).filter(q => q.tipo?.toUpperCase() === 'ME');
  container.innerHTML = '';
  container.classList.toggle('hidden', !questions.length);
  if (!questions.length) return;
  const compatible = questions.filter(q => writtenCompatibility(q) !== false);
  const unknown = compatible.filter(q => typeof writtenCompatibility(q) !== 'boolean').length;
  const label = el('label', 'written-setting-label', 'Responder ME por escrito: ');
  const select = el('select'); select.setAttribute('aria-label', 'Responder ME por escrito');
  for (const [value, text] of [['off', 'Desativado'], ['hybrid', 'Híbrido: escrita + alternativas'], ['written', 'Apenas escrita']]) {
    const option = el('option', '', text); option.value = value; select.appendChild(option);
  }
  select.value = state.config.meWritten || 'off'; select.disabled = locked || !compatible.length;
  select.addEventListener('change', () => onChange(select.value)); label.appendChild(select); container.appendChild(label);
  const text = !compatible.length ? 'Todas as questões ME deste conjunto estão marcadas como incompatíveis com escrita.' :
    locked ? 'Configuração definida para esta resolução. Reinicie o quiz para alterá-la.' :
    state.config.meWritten && state.config.meWritten !== 'off' ? `${compatible.length} questões serão apresentadas por escrito.` :
    'Configuração exclusiva desta sessão.';
  container.appendChild(el('small', '', text));
  if (unknown && state.config.meWritten && state.config.meWritten !== 'off') container.appendChild(el('small', 'written-unknown-notice',
    `${unknown} questões não possuem compatibilidade informada e podem depender das alternativas. Nessas questões, use “Responder com alternativas” se necessário.`));
}

export function createWrittenContent(renderer, q, idx, state, locked = false) {
  const box = el('div', 'me-written-content');
  if (locked) { box.appendChild(el('p', '', 'Questão apresentada por escrito.')); return box; }
  const stage = writtenStage(state, idx), mode = writtenMode(state, idx), a = state.userAnswers[idx] || {};
  const w = a.written || {};
  if (stage === 'writing') {
    const textarea = renderer._createAutoTextarea(w.text || '', value => renderer.callbacks.onWrittenText?.(idx, value));
    textarea.setAttribute('aria-label', 'Sua resposta escrita'); box.appendChild(textarea);
    const actions = el('div', 'action-bar written-actions');
    const submit = button(mode === 'hybrid' ? 'Enviar escrita e ver alternativas' : 'Enviar resposta',
      () => renderer.callbacks.onWrittenSubmit?.(idx, textarea.value, false), 'btn btn-submit');
    submit.disabled = !textarea.value.trim();
    textarea.addEventListener('input', () => { submit.disabled = !textarea.value.trim(); });
    actions.appendChild(submit);
    actions.appendChild(button('Não sei responder', () => renderer.callbacks.onWrittenSubmit?.(idx, textarea.value, true)));
    if (canFallbackWritten(state, idx)) actions.appendChild(button('Responder com alternativas',
      () => renderer.callbacks.onWrittenFallback?.(idx), 'btn-written-link'));
    box.appendChild(actions); return box;
  }
  const review = el('details', 'written-review'); review.open = stage === 'evaluation';
  review.appendChild(el('summary', '', stage === 'evaluation' ? 'Sua resposta escrita' : 'Ver minha resposta escrita'));
  const textarea = el('textarea', 'escrita-textarea written-readonly'); textarea.readOnly = true;
  textarea.value = w.text || ''; textarea.rows = 4; textarea.setAttribute('aria-label', 'Resposta escrita enviada, somente leitura');
  review.appendChild(textarea);
  if (w.skipped) review.appendChild(el('small', '', 'Sem resposta escrita — 0/10.'));
  box.appendChild(review);
  if (stage !== 'evaluation') return box;
  const correctIdx = String(q.gabarito || '').trim().toUpperCase().charCodeAt(0) - 65;
  const correct = q.alternativas?.[correctIdx];
  if (mode === 'written') {
    const reference = el('div', 'escrita-gabarito');
    reference.innerHTML = '<strong>Resposta de referência:</strong><br>' + formatText(correct?.texto || '', idx, state.mappings.altOrder);
    box.appendChild(reference);
    if (correct?.comentario) {
      const comment = el('div', 'written-correct-comment');
      comment.innerHTML = '<strong>Comentário:</strong><br>' + formatText(correct.comentario, idx, state.mappings.altOrder);
      box.appendChild(comment);
    }
  }
  if (!w.skipped) box.appendChild(renderer._createSelfEvalSection(idx, null, Number.isFinite(w.selfEval) ? w.selfEval : null));
  if (mode === 'written') {
    // O conteúdo original só é criado ao abrir a consulta, após a resposta enviada.
    const details = el('details', 'written-original'); details.appendChild(el('summary', '', 'Ver questão ME original'));
    let populated = false;
    details.addEventListener('toggle', () => {
      if (!details.open || populated) return;
      populated = true;
      const original = el('div', 'written-original-content');
      (state.mappings.altOrder[idx] || q.alternativas.map((_, i) => i)).forEach((altIdx, visual) => {
        const alt = q.alternativas[altIdx], item = el('div', 'written-original-alternative');
        item.innerHTML = `<strong>${String.fromCharCode(65 + visual)})${altIdx === correctIdx ? ' ✓ Correta' : ''}</strong> ` + formatText(alt.texto, idx, state.mappings.altOrder);
        if (alt.comentario) {
          const comment = el('div', 'specific-comment'); comment.innerHTML = formatText(alt.comentario, idx, state.mappings.altOrder); item.appendChild(comment);
        }
        original.appendChild(item);
      });
      if (q.comentario_geral) {
        const general = el('div', 'general-comment'); general.innerHTML = '<strong>Comentário geral:</strong><br>' + formatText(q.comentario_geral, idx, state.mappings.altOrder); original.appendChild(general);
      }
      details.appendChild(original);
    });
    box.appendChild(details);
  }
  return box;
}

export function writtenResultsHtml(state, scoreQuestion) {
  const stats = writtenStats(state, scoreQuestion), fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  let html = '';
  for (const [mode, title] of [['hybrid', 'ME híbridas — escrita + alternativas'], ['written', 'ME respondidas apenas por escrito']]) {
    const s = stats[mode]; if (!s.count) continue;
    html += `<div class="written-results"><strong>${title}</strong><p>Questões: ${s.count}</p>`;
    if (mode === 'hybrid' && s.meCount) html += `<p>Pontuação ME: ${fmt(s.meSum)}/${s.meCount} pontos (${fmt(s.meSum / s.meCount * 100)}%)<br>Média ME: ${fmt(s.meSum / s.meCount)}/1 ponto</p>`;
    if (s.evaluated) html += `<p>Pontuação escrita: ${fmt(s.sum)}/${s.evaluated} pontos (${fmt(s.sum / s.evaluated * 100)}%)<br>Média da autoavaliação: ${fmt(s.sum / s.evaluated * 10)}/10<br>Etapas escritas avaliadas: ${s.evaluated} de ${s.count}</p>`;
    for (const [label, count] of [['Escrita pendente', s.writing], ['Etapa ME pendente', s.mePending], ['Autoavaliações pendentes', s.evaluationPending], ['Sem resposta escrita', s.skipped]]) {
      if (count) html += `<p>${label}: ${count}</p>`;
    }
    if (s.paired) html += `<p>Comparativo nas mesmas ${s.paired} questões concluídas:<br>Média ME: ${fmt(s.pairedMe / s.paired)}/1 · Média escrita: ${fmt(s.pairedWritten / s.paired)}/1</p>`;
    if (mode === 'hybrid' && state.config.meAttempts && s.meCount) {
      html += '<table><thead><tr><th>Desfecho ME híbrida</th><th>Questões</th><th>Percentual</th></tr></thead><tbody>';
      const rows = Object.entries(s.buckets).map(([k, count]) => [`Acerto na ${k}ª tentativa`, count]);
      rows.push(['Tentativas esgotadas', s.exhausted], ['Encerradas antecipadamente', s.closed], ['Sem resposta ME ao encerrar', s.blank]);
      for (const [label, count] of rows) if (count) html += `<tr><td>${label}</td><td>${count} de ${s.meCount}</td><td>${fmt(count / s.meCount * 100)}%</td></tr>`;
      html += '</tbody></table>';
    }
    html += '</div>';
  }
  if (stats.fallback) html += `<p>Convertidas para ME: ${stats.fallback}</p>`;
  return html;
}
