# Documentação Técnica Avançada - Quiz Engine V3

Este documento fornece uma análise profunda da arquitetura, lógica de negócios e detalhes de implementação do sistema. Destina-se a desenvolvedores que desejam entender, manter ou estender a funcionalidade.

---

## 1. Arquitetura e Ciclo de Vida

O projeto segue o padrão **MVC (Model-View-Controller)** simplificado, adaptado para Vanilla JS:
-   **Model:** Objeto `state` (em `main.js`) + Persistência (`store.js`).
-   **View:** `renderer.js` (criação dinâmica de DOM).
-   **Controller:** `main.js` (gerenciamento de eventos e regras de negócio).

### Inicialização (`App.init()`)
1.  **Binding de Eventos:** Conecta listeners para upload, filtros e configurações.
2.  **Configuração de Modais:** Inicializa a lógica de zoom de imagem e modais de informação.
3.  **Hidratação de Estado:**
    -   Tenta carregar o estado anterior do IndexedDB (`loadState`).
    -   Se houver um estado salvo (`quizJson`), restaura a interface exatamente onde o usuário parou, inclusive mantendo a ordem embaralhada das questões e alternativas.
    -   Se não, exibe a tela de upload inicial.

---

## 2. Estruturas de Dados Críticas

### O Objeto `state`
O estado global da aplicação é a única fonte de verdade.
```javascript
{
  "quizJson": { ... },       // JSON original carregado (árvore)
  "questions": [ ... ],      // Array plano (flat) de todas as questões processadas
  "mappings": {
    "qOrder": [5, 2, 8...],  // Mapeia índice VISUAL -> índice ORIGINAL no array questions
    "altOrder": {            // Mapeia índice ORIGINAL questão -> Array de índices ORIGINAIS de alternativas
      "5": [1, 0, 2, 3]      // Ex: A alternativa visual A é na verdade a alternativa original B (índice 1)
    }
  },
  "userAnswers": {           // Respostas do usuário
    "5": {                   // Chave é o índice ORIGINAL da questão
      "selectedOriginalIdx": 2, // Para ME/VF
      "selectedOriginalIdxs": [0, 2], // Para Checkbox (CH)
      "submitted": true      // Se o usuário já confirmou a resposta
    }
  },
  "eliminatedAlts": {        // Alternativas cortadas (tesoura)
    "5": [0, 3]              // Índices ORIGINAIS das alternativas eliminadas
  },
  "retryMode": false,        // Flag do modo de repetição de erros
  "retryIndices": []         // Lista de índices para o modo retry
}
```

---

## 3. Lógica de Negócios Detalhada

### 3.1. Parsing e Estruturas Especiais (`parser.js`)

#### Achatamento da Árvore
O JSON de entrada é hierárquico (Pastas contêm Pastas ou Questões). A função `parseContent` percorre essa árvore recursivamente e retorna um array plano (`list`).
-   **Herança de Caminho:** Cada questão recebe a propriedade `_path` (array de strings) contendo a trilha de pastas até ela (ex: `['Cardiologia', 'Valvulopatias']`). Isso é usado posteriormente para filtros e breadcrumbs.

#### Lógica de `juntas` (Grupos de Contexto)
Questões dentro de um bloco `juntas` compartilham um texto base ou caso clínico.
-   **Identificação:** O parser gera um ID único (`groupId`) para o bloco.
-   **Vinculação:** Todas as questões filhas recebem `_groupData: { id: groupId, text: "..." }`.
-   **Renderização:** O `QuizRenderer` detecta quando o `groupId` muda. Ao encontrar uma sequência de questões com o mesmo ID, ele renderiza o cabeçalho do grupo **apenas uma vez** antes da primeira questão do grupo.

#### Lógica de `variantes` (Randomização de Conteúdo)
O bloco `variantes` serve para criar variações de uma mesma pergunta para evitar "decoreba".
-   **Seleção no Parser:** Ao encontrar um nó `VARIANTES`, o parser escolhe aleatoriamente **apenas uma** das questões filhas para adicionar à lista final.
-   **Herança:** A questão escolhida herda Tags e Dificuldade do pai (`VARIANTES`) se não tiver as suas próprias definidas.

### 3.2. Filtros e Geração de Quiz

O sistema utiliza um processo de filtragem em duas etapas para lidar com grandes bancos de questões:

1.  **Passo 1: Seleção de Escopo (Pastas)**
    -   O usuário seleciona quais pastas (assuntos) deseja.
    -   Internamente, verifica-se se o `_path` da questão (stringficado `join(' > ')`) começa com algum dos caminhos selecionados.
    -   Isso define o "universo" de questões disponíveis para o passo 2.

2.  **Passo 2: Refinamento (Tags e Dificuldade)**
    -   Dentro do universo selecionado, o usuário filtra por metadados.
    -   **Tags:** Se a questão tiver *qualquer* uma das tags selecionadas, ela passa.
    -   **Dificuldade:** Correspondência exata.

**Nota:** As questões "forçadas" (Contexto). Se uma questão passa no filtro, mas faz parte de um grupo `juntas`, o sistema automaticamente inclui as outras questões do grupo (mesmo que elas não tenham a tag selecionada) para não quebrar o contexto do caso clínico. Essas questões adicionais são marcadas como `forcedIndices` e exibidas de forma diferenciada (sem valer nota).

### 3.3. Embaralhamento e Referências Cruzadas

O sistema suporta embaralhamento de questões e alternativas sem perder a referência correta nos comentários.

-   **Mapeamento:** O `shuffleArray` cria o array `mappings.altOrder`.
-   **Interpolação de Texto (`utils.js`):** A função `formatText` procura padrões `{A}`, `{B}` no texto.
    -   Se a alternativa original A (índice 0) foi movida para a posição visual C (índice 2), o texto `{A}` será substituído por "C".
    -   Isso garante que comentários como "A alternativa {A} está errada" continuem fazendo sentido visualmente, independentemente da ordem.

---

## 4. Interface e Modais (`index.html` & `main.js`)

A UI é manipulada diretamente via DOM API, sem frameworks.

### 4.1. Modal de Imagem (Zoom)
Permite ampliar qualquer imagem de questão.
-   **Implementação:** Um `div#imgModal` fixo com `display: none`.
-   **Event Delegation:** Em vez de adicionar um listener em cada imagem, adiciona-se um listener único no `quizContainer`.
    -   Ao clicar em qualquer elemento `IMG` dentro do quiz, o `src` é copiado para a imagem do modal e ele é exibido.
-   **Fechamento:** O modal fecha ao clicar no botão "X" ou **fora da imagem** (no overlay escuro). Isso é feito verificando `e.target !== imgModalContent`.

### 4.2. Nuvem (Cloud Quiz)
Permite carregar quizes de um repositório remoto.
-   **Indexação:** O sistema busca um arquivo `quizes-da-nuvem/index.json` que descreve a estrutura de arquivos e pastas disponíveis.
-   **Árvore Dinâmica:** O `main.js` renderiza essa estrutura JSON como uma lista aninhada (`ul/li`) interativa.
-   **Lazy Loading:** O quiz real (`.json`) só é baixado via `fetch` quando o usuário clica no arquivo final.

### 4.3. Modal de Informação (Descrição de Pastas)
No filtro de pastas, se uma pasta tiver descrição, um ícone "📝" aparece.
-   Clicar nele abre um modal genérico (`infoModal`) injetando o título e o texto da descrição.

---

## 5. Tipos de Questão - Detalhes de Implementação

### Checkbox (CH) vs. Múltipla Escolha (ME)
-   **ME/VF:** O estado `userAnswers` armazena um único inteiro `selectedOriginalIdx`. O cálculo de nota é binário (0 ou 1).
-   **CH:** O estado armazena um array `selectedOriginalIdxs`.
    -   **Pontuação Fracionada:** A função `computeQuestionScore` calcula `hits` (acertos) vs `total` (número de assertivas).
    -   Nota da questão = `hits / total`.
    -   **UI:** Renderiza `input[type="checkbox"]` em vez de `radio`. O botão "Responder" fica habilitado sempre, pois "não marcar nada" pode ser uma resposta válida.

### Verdadeiro ou Falso (VF)
-   No JSON, o gabarito é "V" ou "F".
-   No `parser.js`, isso é transformado em uma "ME" artificial com duas alternativas fixas:
    -   Índice 0: "Verdadeiro"
    -   Índice 1: "Falso"
-   O gabarito é convertido: "V" -> 0 (A), "F" -> 1 (B).
-   Isso permite que o `renderer.js` trate VF quase igual a ME, reutilizando lógica de seleção e correção.

---

## 6. Persistência e Recuperação (`store.js`)

Usa **IndexedDB** para salvar o objeto `state` completo.
-   **Vantagem:** Muito mais capacidade que `localStorage` (suporta grandes JSONs de quiz com imagens em base64, se necessário).
-   **Transacional:** Garante que o estado seja salvo de forma atômica.
-   **Trigger:** O salvamento (`saveState`) ocorre a cada interação significativa (seleção de alternativa, corte, mudança de filtro, navegação entre passos).