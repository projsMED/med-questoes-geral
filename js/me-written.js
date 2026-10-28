// Estado da resolução escrita de ME. A questão original e seus índices são preservados.
export function writtenCompatibility(q) {
  return typeof q?.compativelEscrita === 'boolean' ? q.compativelEscrita : q?._writtenCompatibility;
}
export function writtenMode(state, idx) {
  const q = state.questions[idx];
  if (q?.tipo?.toUpperCase() !== 'ME' || writtenCompatibility(q) === false ||
      state.userAnswers[idx]?.writtenFallback) return 'off';
  return ['hybrid', 'written'].includes(state.config.meWritten) ? state.config.meWritten : 'off';
}
export function writtenStage(state, idx) {
  const mode = writtenMode(state, idx), a = state.userAnswers[idx] || {};
  if (mode === 'off') return 'off';
  if (!a.written?.submitted) return 'writing';
  if (mode === 'hybrid' && !a.submitted) return 'me';
  return 'evaluation';
}
export function writtenEvaluated(answer) {
  return answer?.written?.submitted === true && Number.isFinite(answer.written.selfEval);
}
export function submitWritten(state, idx, text, skipped = false) {
  if (writtenStage(state, idx) !== 'writing' || (!skipped && !String(text).trim())) return false;
  const a = state.userAnswers[idx] ||= {};
  a.written = { text: String(text || ''), submitted: true, skipped };
  if (skipped) a.written.selfEval = 0;
  if (writtenMode(state, idx) === 'written') a.submitted = true;
  return true;
}
export function canFallbackWritten(state, idx) {
  return writtenStage(state, idx) === 'writing' &&
    (typeof writtenCompatibility(state.questions[idx]) !== 'boolean' || state.config.allowWrittenFallback === true);
}
export function fallbackWritten(state, idx) {
  if (!canFallbackWritten(state, idx)) return false;
  (state.userAnswers[idx] ||= {}).writtenFallback = true;
  return true;
}
export function assessWritten(state, idx, score) {
  if (writtenStage(state, idx) !== 'evaluation' || !Number.isInteger(score) || score < 0 || score > 10 ||
      state.userAnswers[idx]?.written?.skipped) return false;
  state.userAnswers[idx].written.selfEval = score;
  return true;
}
export function writtenStats(state, scoreQuestion) {
  const empty = () => ({ count: 0, meCount: 0, meSum: 0, evaluated: 0, sum: 0,
    writing: 0, mePending: 0, evaluationPending: 0, skipped: 0, paired: 0, pairedMe: 0, pairedWritten: 0,
    buckets: {}, exhausted: 0, closed: 0, blank: 0 });
  const stats = { hybrid: empty(), written: empty(), fallback: 0 };
  for (const idx of state.mappings.qOrder) {
    if (['forcedIndices', 'disabledIndices', 'deletedIndices'].some(key => state[key]?.includes(idx))) continue;
    const a = state.userAnswers[idx] || {}, mode = writtenMode(state, idx);
    if (a.writtenFallback) { stats.fallback++; continue; }
    if (mode === 'off') continue;
    const s = stats[mode], stage = writtenStage(state, idx); s.count++;
    if (stage === 'writing') s.writing++;
    else if (stage === 'me') s.mePending++;
    else if (!writtenEvaluated(a)) s.evaluationPending++;
    if (a.written?.skipped) s.skipped++;
    if (writtenEvaluated(a)) { s.evaluated++; s.sum += a.written.selfEval / 10; }
    if (mode === 'hybrid' && a.submitted) {
      const score = scoreQuestion(state, idx).hits;
      s.meCount++; s.meSum += score;
      if (writtenEvaluated(a)) { s.paired++; s.pairedMe += score; s.pairedWritten += a.written.selfEval / 10; }
      if (state.config.meAttempts) {
        if (a.attemptOutcome === 'correct') s.buckets[a.attempts.length] = (s.buckets[a.attempts.length] || 0) + 1;
        else if (a.attemptOutcome === 'exhausted') s.exhausted++;
        else if (a.attempts?.length) s.closed++;
        else s.blank++;
      }
    }
  }
  return stats;
}
