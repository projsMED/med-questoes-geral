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
        const idx = Math.floor(Math.random() * node.questoes.length);
        const chosen = node.questoes[idx];

        // Herança de propriedades
        if (!chosen.tags && node.tags) chosen.tags = [...node.tags];
        if (chosen.dificuldade === undefined && node.dificuldade !== undefined) {
          chosen.dificuldade = node.dificuldade;
        }

        // Variantes herdam o caminho
        list = list.concat(parseContent([chosen], path));
      }
    }
    // --- NOVO BLOCO CH (Checkbox) ---
    else if (tipo === 'CH') {
      // Adiciona o caminho à questão
      node._path = path.length > 0 ? path : ['Raiz'];

      // Resolve variantes internas de assertivas com o mesmo id
      if (Array.isArray(node.assertivas)) {
        const byId = new Map();

        node.assertivas.forEach((ass, idx) => {
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
