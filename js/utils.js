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
