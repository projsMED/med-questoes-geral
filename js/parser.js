/* ===== JS: js\parser.js ===== */
/**
 * Transforma a árvore JSON em uma lista plana.
 * Identifica e processa GRUPO_JUNTAS, VARIANTES, VF, CH, ME-CH e ESCRITA.
 * Adiciona rastreamento de pastas (path).
 */
/**
 * Extrai o peso de chance de um item (padrão 1).
 * Aceita estritamente a propriedade 'chance' (número finito > 0).
 */
export function getItemChance(item) {
  if (!item || typeof item !== 'object') return 1;
  const c = Number(item.chance);
  return Number.isFinite(c) && c > 0 ? c : 1;
}

/**
 * Sorteia um item de uma lista com base na propriedade 'chance' (sorteio ponderado).
 * Se nenhum 'chance' for definido, todos têm chance 1 (sorteio uniforme).
 */
export function pickWeightedVariant(items, randomFn = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (items.length === 1) return items[0];

  let totalChance = 0;
  for (let i = 0; i < items.length; i++) {
    totalChance += getItemChance(items[i]);
  }

  if (totalChance <= 0) {
    const idx = Math.floor(randomFn() * items.length);
    return items[Math.min(items.length - 1, Math.max(0, idx))];
  }

  const threshold = randomFn() * totalChance;
  let running = 0;
  for (let i = 0; i < items.length; i++) {
    running += getItemChance(items[i]);
    if (threshold < running) {
      return items[i];
    }
  }

  return items[items.length - 1];
}

export function parseContent(nodes, path = [], randomFn = Math.random, inheritedWritten) {
  let list = [];
  if (!Array.isArray(nodes)) return list;

  nodes.forEach((node) => {
    const writtenCompatibility = typeof node.compativelEscrita === 'boolean' ? node.compativelEscrita : inheritedWritten;
    let tipo = (node.tipo || '').toUpperCase();
    // Normalização transparente: MEM substitui ME-CH e MVF substitui CH
    if (tipo === 'ME-CH') tipo = 'MEM';
    if (tipo === 'CH') tipo = 'MVF';

    if (tipo === 'FOLDER') {
      // Adiciona o nome da pasta atual ao caminho e desce recursivamente
      const currentPath = [...path, node.nome || 'Sem Nome'];
      list = list.concat(parseContent(node.conteudo, currentPath, randomFn, writtenCompatibility));
    } else if (tipo === 'GRUPO_JUNTAS') {
      // Questões dentro do grupo herdam o caminho atual
      const groupQuestions = parseContent(node.questoes, path, randomFn, writtenCompatibility);

      if (node.texto) {
        const groupId = 'grp_' + Math.random().toString(36).substr(2, 9);
        const groupCount = groupQuestions.length;

        groupQuestions.forEach((q) => {
          q._groupData = {
            id: groupId,
            text: node.texto,
            count: groupCount
          };
        });
      }
      list = list.concat(groupQuestions);
    } else if (tipo === 'VARIANTES') {
      if (node.questoes && node.questoes.length) {
        // Deep copy ANTES de processar, para preservar dados originais (gabarito VF etc.)
        const hasMultiple = node.questoes.length > 1;
        const savedNode = hasMultiple ? JSON.parse(JSON.stringify(node)) : null;

        const chosen = pickWeightedVariant(node.questoes, randomFn);

        // Herança de propriedades
        if (!chosen.tags && node.tags) chosen.tags = [...node.tags];
        if (chosen.dificuldade === undefined && node.dificuldade !== undefined) {
          chosen.dificuldade = node.dificuldade;
        }

        // Variantes herdam o caminho
        const parsed = parseContent([chosen], path, randomFn, writtenCompatibility);

        // Salva nó original para re-sorteio (apenas se produz 1 questão na lista plana)
        if (savedNode && parsed.length === 1) {
          parsed[0]._variantNode = savedNode;
          parsed[0]._variantPath = [...path];
          parsed[0]._variantWrittenCompatibility = writtenCompatibility;
        }

        list = list.concat(parsed);
      }
    }
    // --- BLOCO MVF / CH (Múltiplo Verdadeiro ou Falso) ---
    else if (tipo === 'MVF' || tipo === 'CH') {
      node.tipo = 'MVF';
      // Adiciona o caminho à questão
      node._path = path.length > 0 ? path : ['Raiz'];

      // Resolve variantes internas de assertivas com o mesmo id
      if (Array.isArray(node.assertivas)) {
        const byId = new Map();
        const hasVariants = new Set();

        node.assertivas.forEach((ass, idx) => {
          const key = ass.id || `__idx_${idx}`;
          if (!byId.has(key)) byId.set(key, []);
          byId.get(key).push(ass);
          if (byId.get(key).length > 1) hasVariants.add(key);
        });

        // Salva o array original apenas se existem variantes reais
        if (hasVariants.size > 0) {
          node._originalAssertivas = node.assertivas.map(a => ({ ...a }));
        }

        const resolved = [];
        byId.forEach((variants) => {
          if (variants.length === 1) {
            resolved.push(variants[0]);
          } else {
            resolved.push({ ...pickWeightedVariant(variants, randomFn) });
          }
        });

        node.assertivas = resolved;
      } else {
        node.assertivas = [];
      }

      list.push(node);
    } else if (tipo === 'ME' || tipo === 'MEM' || tipo === 'ME-CH') {
      node._writtenCompatibility = writtenCompatibility;
      if (tipo === 'ME-CH' || tipo === 'MEM') node.tipo = 'MEM';
      // Adiciona o caminho à questão
      node._path = path.length > 0 ? path : ['Raiz'];
      if (!Array.isArray(node.alternativas)) node.alternativas = [];
      list.push(node);
    }
    // --- BLOCO ESCRITA (dissertativa simples ou com itens) ---
    else if (tipo === 'ESCRITA') {
      node._path = path.length > 0 ? path : ['Raiz'];

      // Auto-detecta subtipo se não especificado
      if (!node.subtipo) {
        node.subtipo = Array.isArray(node.itens) && node.itens.length > 0 ? 'itens' : 'simples';
      }

      // Para itens, garante que cada item tenha pelo menos pergunta e gabarito
      if (node.subtipo === 'itens' && Array.isArray(node.itens)) {
        node.itens = node.itens.map((item, i) => ({
          pergunta: item.pergunta || '',
          gabarito: item.gabarito || '',
          ...item
        }));
      }

      list.push(node);
    }
    // --- NOVO BLOCO VF ---
    else if (tipo === 'VF') {
      node._path = path.length > 0 ? path : ['Raiz'];

      // Cria as alternativas fixas (Verdadeiro sempre index 0, Falso sempre index 1)
      node.alternativas = [
        { id: 'vf_v', texto: 'Verdadeiro' },
        { id: 'vf_f', texto: 'Falso' }
      ];

      // Converte gabarito V/F para A/B para manter compatibilidade com a engine de correção
      const gab = (node.gabarito || '').trim().toUpperCase();
      if (gab === 'V' || gab === 'VERDADEIRO') node.gabarito = 'A'; // Index 0
      else if (gab === 'F' || gab === 'FALSO') node.gabarito = 'B'; // Index 1

      list.push(node);
    }
    // --- NOVO BLOCO MQ (Matching Question / Associação) ---
    else if (tipo === 'MQ') {
      node._path = path.length > 0 ? path : ['Raiz'];

      // Normaliza coluna_esquerda
      if (!node.coluna_esquerda || typeof node.coluna_esquerda !== 'object') {
        node.coluna_esquerda = { nome: 'Coluna I', itens: [] };
      } else if (Array.isArray(node.coluna_esquerda)) {
        node.coluna_esquerda = { nome: 'Coluna I', itens: node.coluna_esquerda };
      }
      if (!node.coluna_esquerda.nome || !String(node.coluna_esquerda.nome).trim()) {
        node.coluna_esquerda.nome = 'Coluna I';
      }
      if (!Array.isArray(node.coluna_esquerda.itens)) {
        node.coluna_esquerda.itens = [];
      }
      node.coluna_esquerda.itens = node.coluna_esquerda.itens.slice(0, 26).map((item, idx) => {
        if (typeof item === 'string') return { id: idx + 1, texto: item };
        return { id: item.id !== undefined ? item.id : (idx + 1), texto: item.texto || '' };
      });

      // Normaliza coluna_direita
      if (!node.coluna_direita || typeof node.coluna_direita !== 'object') {
        node.coluna_direita = { nome: 'Coluna II', itens: [] };
      } else if (Array.isArray(node.coluna_direita)) {
        node.coluna_direita = { nome: 'Coluna II', itens: node.coluna_direita };
      }
      if (!node.coluna_direita.nome || !String(node.coluna_direita.nome).trim()) {
        node.coluna_direita.nome = 'Coluna II';
      }
      if (!Array.isArray(node.coluna_direita.itens)) {
        node.coluna_direita.itens = [];
      }
      node.coluna_direita.itens = node.coluna_direita.itens.slice(0, 26).map((item, idx) => {
        const defaultLetter = String.fromCharCode(65 + idx);
        if (typeof item === 'string') return { id: defaultLetter, texto: item };
        return { id: item.id !== undefined ? item.id : defaultLetter, texto: item.texto || '' };
      });

      list.push(node);
    }
  });
  return list;
}

/**
 * Re-sorteia variantes amplas (nós VARIANTES) a partir de _variantNode.
 * Substitui questões in-place no array.
 */
export function reshuffleVariants(questions, randomFn = Math.random) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q._variantNode) continue;

    // Deep copy para não mutar o nó armazenado
    const node = JSON.parse(JSON.stringify(q._variantNode));
    const path = q._variantPath || q._path || ['Raiz'];

    const chosen = pickWeightedVariant(node.questoes, randomFn);

    // Herança de propriedades
    if (!chosen.tags && node.tags) chosen.tags = [...node.tags];
    if (chosen.dificuldade === undefined && node.dificuldade !== undefined) {
      chosen.dificuldade = node.dificuldade;
    }

    const parsed = parseContent([chosen], path, randomFn, q._variantWrittenCompatibility);

    if (parsed.length === 1) {
      // Preserva metadados de variante na nova questão
      parsed[0]._variantNode = q._variantNode;
      parsed[0]._variantPath = q._variantPath;
      parsed[0]._variantWrittenCompatibility = q._variantWrittenCompatibility;
      // Preserva _groupData se existir
      if (q._groupData) parsed[0]._groupData = q._groupData;
      questions[i] = parsed[0];
    }
  }
}

/**
 * Re-sorteia variantes de assertivas CH a partir de _originalAssertivas.
 * Modifica state.questions in-place.
 */
export function reshuffleChVariants(questions, randomFn = Math.random) {
  questions.forEach((q) => {
    const qTipo = (q.tipo || '').toUpperCase(); if (qTipo !== 'CH' && qTipo !== 'MVF') return;
    if (!Array.isArray(q._originalAssertivas)) return;

    const byId = new Map();
    q._originalAssertivas.forEach((ass, idx) => {
      const key = ass.id || `__idx_${idx}`;
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push(ass);
    });

    const resolved = [];
    byId.forEach((variants) => {
      if (variants.length === 1) {
        resolved.push(variants[0]);
      } else {
        resolved.push({ ...pickWeightedVariant(variants, randomFn) });
      }
    });

    q.assertivas = resolved;
  });
}
