// Ao promover a beta, trocar o canal para 'stable' e atualizar a identificação
// e a chave do tema inicial em index.html. Não migrar dados automaticamente.
export const RELEASE_CHANNEL = 'beta';
export const IS_BETA = RELEASE_CHANNEL === 'beta';
export const DATABASE_NAME = IS_BETA ? 'QuizEngineV3Beta' : 'QuizEngineV3';
export const ALLOW_AUTOMATIC_SYNC = !IS_BETA;

const STORAGE_PREFIX = IS_BETA ? 'beta:' : '';

// Sessão ativa, preferências e exclusões pendentes também pertencem ao canal.
// O acesso é adiado para manter este módulo importável sem DOM ou IndexedDB.
export const appStorage = {
  getItem(key) { return globalThis.localStorage.getItem(STORAGE_PREFIX + key); },
  setItem(key, value) { globalThis.localStorage.setItem(STORAGE_PREFIX + key, value); },
  removeItem(key) { globalThis.localStorage.removeItem(STORAGE_PREFIX + key); }
};
