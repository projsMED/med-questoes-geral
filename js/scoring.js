// Regras de gabarito e pontuação compartilhadas. Sem DOM ou efeitos colaterais.

/** Cada assertiva incorreta ou não respondida anula um acerto no modo padrão. */
export function computeMvfScore(assertivas, answers = {}, simpleCorrection = false) {
  const total = Array.isArray(assertivas) ? assertivas.length : 0;
  if (total === 0) return { hits: 0, total: 0 };

  const correct = assertivas.reduce((count, ass, idx) => {
    const choice = answers[idx];
    return count + (typeof choice === 'boolean' && choice === !!ass.is_correct ? 1 : 0);
  }, 0);
  return { hits: simpleCorrection ? correct : Math.max(0, correct - (total - correct)), total };
}

export const parseMemGabarito = parseMeChGabarito;
export const computeMemScore = computeMeChScore;

export function parseMeChGabarito(qData) {
  const alternativas = Array.isArray(qData.alternativas) ? qData.alternativas : [];
  const total = alternativas.length;
  const raw = qData.gabarito;

  if (Array.isArray(raw)) {
    return new Set(
      raw
        .map((item) => {
          if (typeof item === 'number') return item;
          const text = String(item || '').trim().toUpperCase();
          return text.length === 1 ? text.charCodeAt(0) - 65 : Number.NaN;
        })
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < total)
    );
  }

  const text = String(raw || '').trim().toUpperCase();
  if (!text || text === 'NONE') return new Set();
  if (text === 'ALL') return new Set(Array.from({ length: total }, (_, i) => i));

  const indices = text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.length === 1 ? part.charCodeAt(0) - 65 : Number.NaN)
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < total);

  return new Set(indices);
}

export function computeMeChScore(qData, selectedIndices) {
  const alternativas = Array.isArray(qData.alternativas) ? qData.alternativas : [];
  const total = alternativas.length;
  if (total === 0) return 0;

  const correctSet = parseMeChGabarito(qData);
  const selectedSet = new Set(
    (selectedIndices || [])
      .map((idx) => Number(idx))
      .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < total)
  );

  let correctMarked = 0;
  let incorrectMarked = 0;

  selectedSet.forEach((idx) => {
    if (correctSet.has(idx)) {
      correctMarked++;
    } else {
      incorrectMarked++;
    }
  });

  const totalCorrect = correctSet.size;
  const totalIncorrect = total - totalCorrect;
  let score = 0;

  if (totalCorrect === 0) {
    const incorrectNotMarked = totalIncorrect - incorrectMarked;
    score = (incorrectNotMarked / totalIncorrect) - (incorrectMarked / totalIncorrect);
  } else if (totalIncorrect === 0) {
    const correctNotMarked = totalCorrect - correctMarked;
    score = (correctMarked / totalCorrect) - (correctNotMarked / totalCorrect);
  } else {
    score = (correctMarked / totalCorrect) - (incorrectMarked / totalIncorrect);
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Normaliza e analisa o gabarito de uma questão MQ.
 * Retorna Map<number, Set<number>> mapeando leftOrigIdx -> Set(rightOrigIdx)
 */
export function parseMqGabarito(qData) {
  const leftItens = (qData.coluna_esquerda && qData.coluna_esquerda.itens) || [];
  const rightItens = (qData.coluna_direita && qData.coluna_direita.itens) || [];
  const leftTotal = leftItens.length;
  const rightTotal = rightItens.length;

  const result = new Map();
  for (let i = 0; i < leftTotal; i++) {
    result.set(i, new Set());
  }

  const raw = qData.gabarito;
  if (!raw) return result;

  // Helper para converter identificador da direita em índice original
  const getRightIdx = (val) => {
    if (typeof val === 'number') {
      return val >= 0 && val < rightTotal ? val : -1;
    }
    const str = String(val || '').trim().toUpperCase();
    if (!str) return -1;
    if (str.length === 1 && str >= 'A' && str <= 'Z') {
      const idx = str.charCodeAt(0) - 65;
      return idx >= 0 && idx < rightTotal ? idx : -1;
    }
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < rightTotal) return parsed;
    const foundById = rightItens.findIndex((item) => String(item.id).toUpperCase() === str);
    return foundById;
  };

  // Helper para converter identificador da esquerda em índice original
  const getLeftIdx = (val) => {
    if (typeof val === 'number') {
      if (val >= 1 && val <= leftTotal) return val - 1;
      if (val >= 0 && val < leftTotal) return val;
      return -1;
    }
    const str = String(val || '').trim().toUpperCase();
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed)) {
      if (parsed >= 1 && parsed <= leftTotal) return parsed - 1;
      if (parsed >= 0 && parsed < leftTotal) return parsed;
    }
    const foundById = leftItens.findIndex((item) => String(item.id).toUpperCase() === str);
    return foundById;
  };

  // Se for string: "1(C), 2(D, F), 3(nulo), 4(A)"
  if (typeof raw === 'string') {
    const regex = /(\w+)\s*\(([^)]*)\)/g;
    let match;
    let foundAny = false;
    while ((match = regex.exec(raw)) !== null) {
      foundAny = true;
      const leftKey = match[1];
      const rightContent = match[2].trim();
      const leftIdx = getLeftIdx(leftKey);
      if (leftIdx === -1) continue;

      const lower = rightContent.toLowerCase();
      if (lower === 'nulo' || lower === 'nenhum' || lower === 'nenhuma' || lower === 'none' || lower === 'null' || lower === '' || lower === '-') {
        result.set(leftIdx, new Set());
      } else {
        const parts = rightContent.split(/[\s,;]+/).filter(Boolean);
        const rightSet = result.get(leftIdx) || new Set();
        parts.forEach((p) => {
          const rIdx = getRightIdx(p);
          if (rIdx !== -1) rightSet.add(rIdx);
        });
        result.set(leftIdx, rightSet);
      }
    }
    if (foundAny) return result;
  }

  // Se for objeto: { "1": ["C"], "2": ["D", "F"], "3": [] } ou { "1": "C" }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    Object.entries(raw).forEach(([k, v]) => {
      const leftIdx = getLeftIdx(k);
      if (leftIdx === -1) return;
      const rightSet = result.get(leftIdx) || new Set();
      if (Array.isArray(v)) {
        v.forEach((item) => {
          const rIdx = getRightIdx(item);
          if (rIdx !== -1) rightSet.add(rIdx);
        });
      } else if (v !== null && v !== undefined) {
        const str = String(v).toLowerCase();
        if (str !== 'nulo' && str !== 'nenhum' && str !== 'nenhuma' && str !== 'none' && str !== 'null' && str !== '') {
          const rIdx = getRightIdx(v);
          if (rIdx !== -1) rightSet.add(rIdx);
        }
      }
      result.set(leftIdx, rightSet);
    });
    return result;
  }

  // Se for array: [{ left: 1, right: ["C"] }, ...]
  if (Array.isArray(raw)) {
    raw.forEach((conn) => {
      if (!conn) return;
      const leftKey = conn.left !== undefined ? conn.left : conn.leftOrigIdx;
      const rightKey = conn.right !== undefined ? conn.right : conn.rightOrigIdx;
      const leftIdx = getLeftIdx(leftKey);
      if (leftIdx === -1) return;
      const rightSet = result.get(leftIdx) || new Set();
      if (Array.isArray(rightKey)) {
        rightKey.forEach((rk) => {
          const rIdx = getRightIdx(rk);
          if (rIdx !== -1) rightSet.add(rIdx);
        });
      } else {
        const rIdx = getRightIdx(rightKey);
        if (rIdx !== -1) rightSet.add(rIdx);
      }
      result.set(leftIdx, rightSet);
    });
  }

  return result;
}

/**
 * Calcula a pontuação da questão MQ.
 * - Pontuação de cada item da coluna esquerda:
 *   - Se gabarito for nulo: 1 ponto se não marcou nada, 0 se marcou algo.
 *   - Caso geral: max(0, (corretas - erradas) / total_corretas)
 * - Pontuação final da questão: média dos pontos de cada item da coluna esquerda (0 a 1).
 */
export function computeMqScore(qData, userConnections = []) {
  const leftItens = (qData.coluna_esquerda && qData.coluna_esquerda.itens) || [];
  const leftTotal = leftItens.length;
  if (leftTotal === 0) return { hits: 0, total: 1, itemScores: [] };

  const gabaritoMap = parseMqGabarito(qData);

  const userMap = new Map();
  for (let i = 0; i < leftTotal; i++) {
    userMap.set(i, new Set());
  }

  (userConnections || []).forEach((conn) => {
    if (!conn) return;
    const lIdx = conn.leftOrigIdx !== undefined ? Number(conn.leftOrigIdx) : Number(conn.left);
    const rIdx = conn.rightOrigIdx !== undefined ? Number(conn.rightOrigIdx) : Number(conn.right);
    if (Number.isInteger(lIdx) && lIdx >= 0 && lIdx < leftTotal &&
        Number.isInteger(rIdx) && rIdx >= 0) {
      userMap.get(lIdx).add(rIdx);
    }
  });

  const itemScores = [];
  let sumScore = 0;

  for (let lIdx = 0; lIdx < leftTotal; lIdx++) {
    const targetSet = gabaritoMap.get(lIdx) || new Set();
    const markedSet = userMap.get(lIdx) || new Set();
    let score = 0;

    if (targetSet.size === 0) {
      score = markedSet.size === 0 ? 1.0 : 0.0;
    } else {
      let correctMarked = 0;
      let incorrectMarked = 0;
      markedSet.forEach((rIdx) => {
        if (targetSet.has(rIdx)) {
          correctMarked++;
        } else {
          incorrectMarked++;
        }
      });
      score = Math.max(0, (correctMarked - incorrectMarked) / targetSet.size);
    }

    itemScores.push(score);
    sumScore += score;
  }

  const finalHits = sumScore / leftTotal;
  return {
    hits: Math.max(0, Math.min(1, finalHits)),
    total: 1,
    itemScores,
    leftTotal
  };
}

export function isObjectiveQuestion(state, originalQIdx) {
  const qData = state.questions[originalQIdx];
  return ((qData && qData.tipo) || '').toUpperCase() !== 'ESCRITA';
}

export function applyDisregardedCorrectToScore(state, originalQIdx, score, options = {}) {
  if (options.ignoreDisregard) return score;
  const ans = state.userAnswers[originalQIdx];
  const featureOn = state.config.showDisregardCorrect !== false;
  const applyOn = state.config.applyDisregardedCorrect !== false;
  if (
    featureOn &&
    applyOn &&
    ans &&
    ans.disregardCorrect &&
    isObjectiveQuestion(state, originalQIdx) &&
    score.total > 0 &&
    score.hits > 0
  ) {
    return { hits: 0, total: score.total };
  }
  return score;
}

export function isDisregardedCorrectMarked(state, originalQIdx) {
  const ans = state.userAnswers[originalQIdx];
  if (!ans || !ans.disregardCorrect || !isObjectiveQuestion(state, originalQIdx)) return false;
  const raw = computeQuestionScore(state, originalQIdx, { ignoreDisregard: true });
  return raw.total > 0 && raw.hits > 0;
}

/**
 * Retorna { hits, total } para a questão originalQIdx.
 * - ME / VF: total = 1, hits = 1 ou 0
 * - MEM (ME-CH): total = 1, hits = pontuação proporcional entre 0 e 1
 * - MVF (CH): total = número de assertivas, hits = acertos menos erros (mínimo 0), ou apenas acertos no modo simples
 * - ESCRITA simples: total = 10, hits = selfEval (0–10)
 * - ESCRITA itens: total = numItens × 10, hits = soma dos selfEvals
 */
export function computeQuestionScore(state, originalQIdx, options = {}) {
  const qData = state.questions[originalQIdx];
  const ans = state.userAnswers[originalQIdx];
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
    const score = computeMvfScore(
      assertivas, ans.assertivaAnswers || {}, state.config.simpleMvfCorrection === true
    );
    return applyDisregardedCorrectToScore(state, originalQIdx, score, options);
  }

  if (tipo === 'ME-CH' || tipo === 'MEM') {
    const score = computeMeChScore(qData, ans.selectedOriginalIndices || []);
    return applyDisregardedCorrectToScore(state, originalQIdx, { hits: score, total: 1 }, options);
  }

  if (tipo === 'MQ') {
    const scoreData = computeMqScore(qData, ans.connections || []);
    return applyDisregardedCorrectToScore(state, originalQIdx, { hits: scoreData.hits, total: 1 }, options);
  }

  // ME / VF – um único gabarito por letra
  const gabaritoLetra = (qData.gabarito || '').trim().toUpperCase();
  if (!gabaritoLetra) return { hits: 0, total: 0 };
  const gabaritoIdx = gabaritoLetra.charCodeAt(0) - 65;
  const isCorrect = ans.selectedOriginalIdx === gabaritoIdx;
  return applyDisregardedCorrectToScore(
    state, originalQIdx,
    { hits: isCorrect ? 1 : 0, total: 1 },
    options
  );
}
