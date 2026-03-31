/* ===== JS: js\parser.js ===== */
/**
 * Transforma a árvore JSON em uma lista plana.
 * Identifica e processa GRUPO_JUNTAS, VARIANTES, VF, CH e ESCRITA.
 * Adiciona rastreamento de pastas (path).
 */
export function parseContent(nodes, path = []) {
  let list = [];
  if (!Array.isArray(nodes)) return list;

  nodes.forEach((node) => {
    const tipo = (node.tipo || '').toUpperCase();

    if (tipo === 'FOLDER') {
      // Adiciona o nome da pasta atual ao caminho e desce recursivamente
      const currentPath = [...path, node.nome || 'Sem Nome'];
      list = list.concat(parseContent(node.conteudo, currentPath));
    } else if (tipo === 'GRUPO_JUNTAS') {
      // Questões dentro do grupo herdam o caminho atual
      const groupQuestions = parseContent(node.questoes, path);

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

        const idx = Math.floor(Math.random() * node.questoes.length);
        const chosen = node.questoes[idx];

        // Herança de propriedades
        if (!chosen.tags && node.tags) chosen.tags = [...node.tags];
        if (chosen.dificuldade === undefined && node.dificuldade !== undefined) {
          chosen.dificuldade = node.dificuldade;
        }

        // Variantes herdam o caminho
        const parsed = parseContent([chosen], path);

        // Salva nó original para re-sorteio (apenas se produz 1 questão na lista plana)
        if (savedNode && parsed.length === 1) {
          parsed[0]._variantNode = savedNode;
          parsed[0]._variantPath = [...path];
        }

        list = list.concat(parsed);
      }
    }
    // --- NOVO BLOCO CH (Checkbox) ---
    else if (tipo === 'CH') {
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
            const randIdx = Math.floor(Math.random() * variants.length);
            resolved.push(variants[randIdx]);
          }
        });

        node.assertivas = resolved;
      } else {
        node.assertivas = [];
      }

      list.push(node);
    } else if (tipo === 'ME') {
      // Adiciona o caminho à questão
      node._path = path.length > 0 ? path : ['Raiz'];
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
  });
  return list;
}

/**
 * Re-sorteia variantes amplas (nós VARIANTES) a partir de _variantNode.
 * Substitui questões in-place no array.
 */
export function reshuffleVariants(questions) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q._variantNode) continue;

    // Deep copy para não mutar o nó armazenado
    const node = JSON.parse(JSON.stringify(q._variantNode));
    const path = q._variantPath || q._path || ['Raiz'];

    const idx = Math.floor(Math.random() * node.questoes.length);
    const chosen = node.questoes[idx];

    // Herança de propriedades
    if (!chosen.tags && node.tags) chosen.tags = [...node.tags];
    if (chosen.dificuldade === undefined && node.dificuldade !== undefined) {
      chosen.dificuldade = node.dificuldade;
    }

    const parsed = parseContent([chosen], path);

    if (parsed.length === 1) {
      // Preserva metadados de variante na nova questão
      parsed[0]._variantNode = q._variantNode;
      parsed[0]._variantPath = q._variantPath;
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
export function reshuffleChVariants(questions) {
  questions.forEach((q) => {
    if ((q.tipo || '').toUpperCase() !== 'CH') return;
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
        const randIdx = Math.floor(Math.random() * variants.length);
        resolved.push(variants[randIdx]);
      }
    });

    q.assertivas = resolved;
  });
}
