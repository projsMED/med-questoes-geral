/* ===== JS: js\utils.js ===== */
export const difficultyMap = {
  1: 'Muito fácil',
  2: 'Fácil',
  3: 'Médio',
  4: 'Difícil',
  5: 'Muito difícil'
};

/**
 * Embaralha um array usando o algoritmo Fisher-Yates
 */
export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Substitui referências como {A}, {B} pelas letras visuais corretas
 * baseado no embaralhamento atual.
 * @param {string} text - Texto original
 * @param {number} originalQIdx - Índice original da questão
 * @param {object} altMappings - Objeto com os mapas de ordem das alternativas
 */
export function formatText(text, originalQIdx, altMappings) {
  if (!text) return '';
  return text.replace(/\{([A-Z])\}/g, (match, letter) => {
    const originalAltIdx = letter.charCodeAt(0) - 65;
    const visualMapping = altMappings[originalQIdx];
    if (!visualMapping) return match;
    const visualIdx = visualMapping.indexOf(originalAltIdx);
    if (visualIdx === -1) return match;
    return String.fromCharCode(65 + visualIdx);
  });
}

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
