# Roteiro de Refatoração: Modularização do `main.js`

Este documento serve como guia para a futura quebra do arquivo `main.js` em módulos menores.

> **⚠️ AVISO IMPORTANTE:**
> **Refatoração ≠ Reescrever Funcionalidades.**
> O objetivo é alterar a *estrutura* interna do código sem alterar **nenhum** comportamento externo.
>
> **REGRA DE OURO DA INTEGRAÇÃO:**
> Os arquivos `renderer.js`, `parser.js`, `store.js` e `utils.js` **NÃO** devem ser modificados. Os novos módulos devem se adaptar a eles, e não o contrário.

---

## 1. Estratégia de Segurança e Estado

### O Dilema da Persistência (IndexedDB)
Atualmente, o `store.js` salva e carrega um único objeto gigante: `state`.
*   **Risco:** Se cada novo módulo (ex: `FilterManager`) mantiver seu próprio estado isolado (`this.filters`), o `saveState(state)` no `main.js` deixará de salvar esses dados.
*   **Solução Obrigatória:** O `main.js` deve continuar sendo o **dono do objeto `state`**.
    *   Os módulos devem receber o `state` (ou partes dele) como referência ou callbacks para leitura/escrita.
    *   *Exemplo:* O `FilterManager` não deve ter `this.selectedTags`. Ele deve ler e escrever em `state.filters.tags` que foi passado para ele.

### Gerenciamento de Elementos DOM
O `main.js` atual cacheia tudo em `App.elements`.
*   **Recomendação:** Passe os elementos DOM contêineres para os construtores dos módulos.
*   *Exemplo:* `new FilterManager({ container: document.getElementById('filterSection'), ... })`. O módulo só deve mexer dentro do seu contêiner.

---

## 2. Pontos de Atenção Críticos (Interações com Módulos Existentes)

### A. O Contrato com `renderer.js` (RISCO MÁXIMO)
O `renderer.js` espera receber o objeto `state` **inteiro** e com uma estrutura específica (`questions`, `userAnswers`, `mappings`).
*   **O Perigo:** Se o `QuizLogic` alterar a forma como os dados são guardados (ex: mudar `userAnswers` de objeto para Map), o `renderer.js` quebrará.
*   **Atenção às Atualizações Parciais:**
    *   Atualmente, o `main.js` chama `this.renderer.createQuestionCard(...)` dentro de `handleSelection` e `submitQuestion`.
    *   Isso serve para atualizar **apenas um card** sem redesenhar o quiz todo (o que perderia scroll e foco).
    *   **Diretriz:** A lógica de *decidir* redesenhar um card deve ficar no `main.js` (ou `UIManager`), pois o `QuizLogic` deve ser puramente lógico e não saber sobre HTML.

### B. Dependências de `utils.js`
Várias funções utilitárias (`shuffleArray`, `difficultyMap`) são usadas diretamente no `main.js`.
*   **Ação:** Ao mover a lógica de filtros para `filter-manager.js`, lembre-se de importar `difficultyMap` lá. Ao mover a geração de quiz para `quiz-logic.js`, importe `shuffleArray` lá.
*   **Cuidado:** Não duplique código. Mantenha o `utils.js` como a fonte única dessas funções.

### C. A Armadilha dos Índices (Original vs. Visual)
O sistema usa dois tipos de índices:
1.  **`originalIdx`**: O índice imutável da questão no array `state.questions`.
2.  **`visualIdx`**: A posição onde a questão aparece na tela.

*   **Risco:** O `renderer.js` devolve `originalIdx` nos callbacks (`onSelect`). O novo `QuizLogic` deve receber estritamente `originalIdx`. Não tente passar índices visuais para a lógica de negócio.

---

## 3. Ordem de Migração Sugerida

Siga esta ordem exata para minimizar o tempo de "código quebrado".

### Etapa 1: `js/cloud-client.js` (Baixo Risco)
*   **Por que:** É quase independente.
*   **O que mover:** `openCloudModal`, `renderCloudTree`, `fetchCloudQuiz`.
*   **Teste:** Verifique se consegue abrir a nuvem e carregar um quiz.

### Etapa 2: `js/ui-utils.js` (Baixo Risco)
*   **Por que:** Funções puramente visuais.
*   **O que mover:** `setupImageZoom`, `showInfoModal`.
*   **Teste:** Clique nas imagens e nos ícones de descrição de pasta.

### Etapa 3: `js/filter-manager.js` (Médio Risco)
*   **O que mover:** Toda a UI de checkboxes e árvore de pastas (`step1`, `step2`).
*   **Requisito:** Precisa importar `difficultyMap` de `utils.js`.
*   **Integração:** O método `init(state)` deve popular os checkboxes baseados no estado salvo.
*   **Teste:** Filtre por uma pasta e gere. Recarregue a página e veja se os filtros persistem.

### Etapa 4: `js/quiz-logic.js` (Alto Risco - Core)
*   **O que mover:** `generateMappings`, `computeQuestionScore`, `retryIncorrect`, `extractFiltersData` (lógica de contagem).
*   **Requisito:** Precisa importar `shuffleArray` de `utils.js`.
*   **Atenção:** Esta classe não deve manipular DOM. Ela recebe dados e retorna dados.
*   **Teste:** Responda uma questão certa, uma errada e uma Checkbox. Verifique a nota final. Teste o botão "Repetir Erros".

---

## 4. Protótipo da Nova Estrutura (`main.js`)

```javascript
import { CloudClient } from './cloud-client.js';
import { FilterManager } from './filter-manager.js';
import { QuizLogic } from './quiz-logic.js';
import { QuizRenderer } from './renderer.js'; // Intacto
import { saveState, loadState } from './store.js'; // Intacto

const App = {
  state: null, // O Main continua sendo o dono do Estado para garantir o store.js

  async init() {
    // 1. Inicializa Subsistemas
    this.logic = new QuizLogic(); 
    this.cloud = new CloudClient();
    
    // 2. UI Managers
    this.filterManager = new FilterManager({
        containerStep1: document.getElementById('filterStep1'),
        containerStep2: document.getElementById('filterStep2'),
        // Callback vital: quando filtro muda, salva estado mas não gera quiz ainda
        onChange: () => this.save() 
    });

    // 3. Renderer (Callbacks vitais para manter a UI reativa)
    this.renderer = new QuizRenderer('quizContainer', 'footerBar', {
        onSelect: (qIdx, altIdx, isChk, checked) => {
            // 1. Lógica atualiza o estado
            this.logic.handleSelection(this.state, qIdx, altIdx, isChk, checked);
            
            // 2. Renderer faz atualização cirúrgica (Partial Update)
            // IMPORTANTE: Mantém a lógica de substituir apenas UM card
            const visualIdx = this.state.mappings.qOrder.indexOf(qIdx);
            const newCard = this.renderer.createQuestionCard(
                this.state.questions[qIdx], qIdx, visualIdx, this.state
            );
            // ...código para substituir o card no DOM...
            
            // 3. Persistência
            this.save();
        },
        // ... outros callbacks (onSubmit, onEliminate) seguindo o mesmo padrão
    });

    // 4. Load & Hydrate
    this.state = await loadState() || this.createEmptyState();
    this.filterManager.syncUI(this.state); // Atualiza checkboxes baseados no JSON carregado
  },
  
  save() {
    saveState(this.state);
  }
};
```

## 5. Checklist Final (Antes do Merge)

1.  [ ] **State Structure:** A estrutura do objeto `state` permaneceu IDÊNTICA? (Se mudar uma chave, o `store.js` carrega lixo).
2.  [ ] **Renderer Contract:** O `renderer.render()` continua recebendo o objeto `state` completo?
3.  [ ] **Partial Updates:** Ao clicar em uma alternativa, a tela pisca (render total) ou atualiza suavemente (render parcial)? Deve ser parcial.
4.  [ ] **Features Críticas:**
    *   O modo "Repetir erros" (Retry) continua funcionando?
    *   As imagens abrem no modal de zoom?
    *   A nuvem carrega os arquivos?
