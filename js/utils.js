/* ===== JS: js\utils.js ===== */
export const difficultyMap = {
  1: 'Muito fácil',
  2: 'Fácil',
  3: 'Médio',
  4: 'Difícil',
  5: 'Muito difícil'
};

export const questionTypeMap = {
  ME: 'Múltipla Escolha Padrão',
  MEM: 'Múltipla Escolha Múltipla',
  MVF: 'Múltiplo Verdadeiro ou Falso',
  VF: 'Verdadeiro ou Falso Simples',
  ESCRITA: 'Dissertativa',
  MQ: 'Associação'
};

// Aliases retrocompatíveis para não quebrar JSONs, filtros ou chamadas legadas
questionTypeMap['ME-CH'] = 'Múltipla Escolha Múltipla';
questionTypeMap['CH'] = 'Múltiplo Verdadeiro ou Falso';

export const questionTypes = ['ME', 'MEM', 'MVF', 'VF', 'ESCRITA', 'MQ'];

/**
 * Normaliza o identificador de tipo (MEM <- ME-CH, MVF <- CH)
 */
export function normalizeQuestionType(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  if (t === 'ME-CH' || t === 'MEM') return 'MEM';
  if (t === 'CH' || t === 'MVF') return 'MVF';
  return t;
}

export function isMemType(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  return t === 'MEM' || t === 'ME-CH';
}

export function isMvfType(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  return t === 'MVF' || t === 'CH';
}

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
 * Substitui referências como {A}, {B} ou {1}, {2} pelas identificações visuais corretas
 * baseado no embaralhamento atual.
 * @param {string} text - Texto original
 * @param {number} originalQIdx - Índice original da questão
 * @param {object} altMappings - Objeto com os mapas de ordem das alternativas
 */
export function formatText(text, originalQIdx, altMappings) {
  if (!text) return '';
  const mapping = altMappings ? altMappings[originalQIdx] : null;
  if (!mapping) return text;

  const isMq = typeof mapping === 'object' && !Array.isArray(mapping) && (mapping.left || mapping.right);
  const rightMapping = isMq ? (mapping.right || []) : mapping;
  const leftMapping = isMq ? (mapping.left || []) : null;

  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, token) => {
    // Referência numérica para itens da coluna esquerda MQ: {1}, {2}, etc.
    if (/^\d+$/.test(token)) {
      if (!leftMapping || !Array.isArray(leftMapping)) return match;
      const originalNum = parseInt(token, 10);
      const originalIdx = originalNum - 1;
      const visualIdx = leftMapping.indexOf(originalIdx);
      if (visualIdx === -1) return match;
      return String(visualIdx + 1);
    }
    // Referência por letra para alternativas ou itens da coluna direita: {A}, {B}, etc.
    if (token.length === 1 && token >= 'A' && token <= 'Z') {
      if (!Array.isArray(rightMapping)) return match;
      const originalAltIdx = token.charCodeAt(0) - 65;
      const visualIdx = rightMapping.indexOf(originalAltIdx);
      if (visualIdx === -1) return match;
      return String.fromCharCode(65 + visualIdx);
    }
    return match;
  });
}

// Compatibilidade das importações antigas; todas as regras vivem em scoring.js.
export {
  computeMvfScore, parseMemGabarito, computeMemScore,
  parseMeChGabarito, computeMeChScore, parseMqGabarito, computeMqScore
} from './scoring.js?v=20261004-451';
