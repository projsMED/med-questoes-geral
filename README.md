# 🩺 Question Engine V3.9.2 (med-questoes-geral)

> Plataforma web interativa para resolução, estudo, autocorreção e organização de bancos de questões médicas e gerais, com arquitetura 100% *client-side*, suporte offline via **IndexedDB**, filtros em etapas, modos avançados de estudo e sincronização em nuvem via **Firebase Firestore**.

---

## 📌 Sumário
1. [Visão Geral & Propósito](#-visão-geral--propósito)
2. [Stack Tecnológico & Filosofia de Design](#-stack-tecnológico--filosofia-de-design)
3. [Estrutura de Pastas e Arquivos](#-estrutura-de-pastas-e-arquivos)
4. [Esquema de Dados e Tipos de Questões (JSON Schema)](#-esquema-de-dados-e-tipos-de-questões-json-schema)
   - [Pastas (`folder`)](#1-pastas-folder)
   - [Grupos de Questões (`grupo_juntas`)](#2-grupos-de-questões-grupo_juntas)
   - [Variantes (`variantes`)](#3-variantes-variantes)
   - [Múltipla Escolha Padrão (`ME`)](#4-múltipla-escolha-padrão-me)
   - [Verdadeiro ou Falso Simples (`VF`)](#5-verdadeiro-ou-falso-simples-vf)
   - [Múltiplo Verdadeiro ou Falso / Checkbox (`CH`)](#6-múltiplo-verdadeiro-ou-falso--checkbox-ch)
   - [Múltipla Escolha Múltipla (`ME-CH`)](#7-múltipla-escolha-múltipla-me-ch)
   - [Dissertativa / Discursiva (`ESCRITA`)](#8-dissertativa--discursiva-escrita)
5. [Fluxos de Funcionamento e Regras de Negócio](#-fluxos-de-funcionamento-e-regras-de-negócio)
   - [Motor de Filtro em 2 Etapas](#motor-de-filtro-em-2-etapas)
   - [Embaralhamento e Mapeamento Dinâmico de Letras](#embaralhamento-e-mapeamento-dinâmico-de-letras)
   - [Modo de Repetição de Erros (Retry Mode)](#modo-de-repetição-de-erros-retry-mode)
   - [Recurso "Desconsiderar Acerto"](#recurso-desconsiderar-acerto)
   - [Gerenciamento Individual de Questões (Deletar / Desativar)](#gerenciamento-individual-de-questões-deletar--desativar)
   - [Marcação de Texto & Eliminação de Alternativas](#marcação-de-texto--eliminação-de-alternativas)
6. [Gerenciamento de Sessões & Persistência Local (IndexedDB)](#-gerenciamento-de-sessões--persistência-local-indexeddb)
7. [Sincronização com Firebase Firestore](#-sincronização-com-firebase-firestore)
8. [Configurações Visuais, Acessibilidade e Atalhos](#-configurações-visuais-acessibilidade-e-atalhos)
9. [Scripts e Ferramentas Auxiliares](#-scripts-e-ferramentas-auxiliares)
10. [Guia de Manutenção para Desenvolvedores e IAs](#-guia-de-manutenção-para-desenvolvedores-e-ias)

---

## 🎯 Visão Geral & Propósito

O **Question Engine** foi concebido como uma ferramenta de alta produtividade para estudantes e médicos (preparatórios para Residência Médica, Revalida, concursos e provas de título). 

O sistema permite carregar simulados e bancos de questões estruturados em árvore hierárquica (JSON), filtrar exatamente o que se deseja estudar, responder de maneira dinâmica com gabarito imediato ou em lote, praticar questões dissertativas com autoavaliação guiada, refazer apenas os erros cometidos e sincronizar o progresso entre múltiplos dispositivos.

---

## ⚡ Stack Tecnológico & Filosofia de Design

- **Zero Build Step / Vanilla Web Standards:** Desenvolvido em HTML5, CSS3 puro e JavaScript moderno (ES Modules). Não requer Node.js, Webpack, Vite ou frameworks pesados em tempo de execução.
- **Execução 100% Client-Side:** Todo o processamento de árvores de questões, sorteio de variantes, correção, cálculo de pontuação e persistência roda diretamente no navegador do usuário.
- **Banco de Dados Local (IndexedDB):** Persistência robusta através do banco `QuizEngineV3` (stores: `sessions` e `quizState`).
- **Nuvem Opcional (Firebase v10 SDK):** Firestore + Auth (código de acesso compartilhado `sync@quiz.app`) com compressão nativa Gzip via `CompressionStream API`.

---

## 📂 Estrutura de Pastas e Arquivos

```text
med-questoes-geral/
├── css/
│   └── styles.css                  # Estilos globais, temas (claro/escuro), responsividade e componentes UI
├── js/
│   ├── main.js                     # Controlador principal (App): eventos, ciclo de vida, filtros, sessões e UI
│   ├── renderer.js                 # QuizRenderer: renderização de cards, gabaritos, avaliação e inputs
│   ├── parser.js                   # Parser: linearização da árvore JSON, resolução de grupos, variantes e tipos
│   ├── store.js                    # Camada de persistência IndexedDB (sessões, pastas e migrações)
│   ├── utils.js                    # Utilitários: Fisher-Yates, mapa de dificuldades/tipos, score ME-CH e formatters
│   ├── firebase-config.js          # Inicialização do Firebase v10 e métodos de autenticação
│   └── firebase-sync.js            # Lógica de sincronização remota, chunking e compressão Gzip
├── quizes-da-nuvem/                # Repositório de questões pré-empacotadas
│   ├── Cirurgia Geral/             # Subpastas por especialidade
│   ├── Fisiologia/
│   ├── Infectologia/
│   ├── Testes/                     # JSONs de teste de cada tipo de questão
│   └── index.json                  # Índice da árvore de arquivos gerado por gerar_index.py
├── Arquivos Diversos/              # Exemplos de referência de estruturas JSON
├── index.html                      # Página principal (SPA) e carregador de módulos com cache-busting
├── gerar_index.py                  # Script Python que varre 'quizes-da-nuvem' e atualiza 'index.json'
├── arquivos.py                     # Script utilitário que concatena CSS e JS em arquivo único para análise de IA
├── iniciar_servidor.bat            # Script batch para rodar servidor local (python -m http.server 8000)
├── firebase.json                   # Configuração de deploy do Firebase Hosting
├── firestore.rules                 # Regras de segurança do Firestore
└── firestore.indexes.json          # Definições de índices compostos do Firestore
```

---

## 🧠 Esquema de Dados e Tipos de Questões (JSON Schema)

O arquivo de entrada é um JSON raiz que contém metadados (`titulo`, `descricao`, `id_quiz`) e uma lista recursiva em `conteudo`.

```json
{
  "titulo": "Título do Simulado",
  "id_quiz": "simulado_exemplo_01",
  "descricao": "Descrição opcional",
  "conteudo": [ /* Nós de folder, grupo_juntas, variantes ou questões diretas */ ]
}
```

### 1. Pastas (`folder`)
Permite estruturar os assuntos hierarquicamente.
```json
{
  "tipo": "folder",
  "nome": "Cardiologia",
  "conteudo": [ /* Questões ou sub-pastas */ ]
}
```

### 2. Grupos de Questões (`grupo_juntas`)
Agrupa questões que compartilham o mesmo enunciado/caso clínico base. Na interface, exibe um cabeçalho único com aviso *"Responda as questões X a Y"*.
```json
{
  "tipo": "grupo_juntas",
  "id": "grp_caso_01",
  "texto": "<b>Caso Clínico:</b> Paciente masculino, 58 anos...",
  "questoes": [ /* Questões ME, VF, CH, etc. */ ]
}
```

### 3. Variantes (`variantes`)
Conjunto de questões equivalentes em que o sistema sorteia aleatoriamente **uma** para compor o quiz. O sistema suporta reembaralhamento posterior (`reshuffleVariants`).
```json
{
  "tipo": "variantes",
  "tags": ["Genética"],
  "dificuldade": 2,
  "questoes": [
    { "tipo": "ME", "enunciado": "Variação 1...", "alternativas": [...], "gabarito": "A" },
    { "tipo": "ME", "enunciado": "Variação 2...", "alternativas": [...], "gabarito": "B" }
  ]
}
```

### 4. Múltipla Escolha Padrão (`ME`)
Questão clássica de escolha única.
```json
{
  "tipo": "ME",
  "id": "q_me_01",
  "tags": ["Clínica Médica", "Hipertensão"],
  "dificuldade": 2,
  "enunciado": "Qual dos seguintes fármacos pertence à classe dos IECAs?",
  "alternativas": [
    { "id": "a", "texto": "Enalapril", "comentario": "Correto. Enalapril é um IECA." },
    { "id": "b", "texto": "Losartana", "comentario": "Incorreto. Losartana é um BRA." }
  ],
  "gabarito": "A",
  "comentario_geral": "Os IECAs inibem a conversão de angiotensina I em angiotensina II."
}
```

### 5. Verdadeiro ou Falso Simples (`VF`)
Item único para julgamento como V ou F.
```json
{
  "tipo": "VF",
  "id": "q_vf_01",
  "tags": ["Fisiologia"],
  "dificuldade": 1,
  "enunciado": "A insulina estimula a translocação de transportadores GLUT4 para a membrana em células musculares.",
  "gabarito": "V",
  "comentario_geral": "A insulina promove a captação de glicose via translocação de GLUT4."
}
```

### 6. Múltiplo Verdadeiro ou Falso / Checkbox (`CH`)
Apresenta múltiplas assertivas (I, II, III...) a serem julgadas individualmente como V ou F. Suporta **variantes internas** de assertivas (assertivas com mesmo `id` são sorteadas randomicamente).
```json
{
  "tipo": "CH",
  "id": "q_ch_01",
  "tags": ["Emergência"],
  "dificuldade": 3,
  "no_random": false,
  "enunciado": "Sobre a abordagem da PCR no adulto em ritmo chocável:",
  "assertivas": [
    {
      "id": "ass_1",
      "texto": "A desfibrilação precoce é a intervenção prioritária.",
      "is_correct": true,
      "comentario": "Em FV/TVSP a prioridade é o choque imediato."
    },
    {
      "id": "ass_2",
      "texto": "A administração de amiodarona deve ocorrer antes do primeiro choque.",
      "is_correct": false,
      "comentario": "A amiodarona é indicada após o 3º choque."
    }
  ],
  "comentario_geral": "Ritmos chocáveis: FV e TV sem pulso."
}
```

### 7. Múltipla Escolha Múltipla (`ME-CH`)
Múltipla escolha com caixas de seleção onde mais de uma alternativa pode estar correta.
```json
{
  "tipo": "ME-CH",
  "id": "q_mech_01",
  "tags": ["Farmacologia"],
  "dificuldade": 2,
  "enunciado": "Assinale os antibióticos que atuam na inibição da síntese da parede celular bacteriana:",
  "alternativas": [
    { "id": "alt_1", "texto": "Amoxicilina" },
    { "id": "alt_2", "texto": "Vancomicina" },
    { "id": "alt_3", "texto": "Gentamicina" }
  ],
  "gabarito": "A, B",
  "comentario_geral": "Amoxicilina e Vancomicina inibem parede. Gentamicina inibe síntese proteica (30S)."
}
```
*Fórmula de pontuação proporcional:* `Score = (Acertos Marcados / Total Corretas) - (Erros Marcados / Total Incorretas)`, limitado ao intervalo `[0, 1]`.

### 8. Dissertativa / Discursiva (`ESCRITA`)
Suporta dois subtipos:
- **`subtipo: "simples"`**: Uma pergunta única com campo de texto e espelho de resposta.
- **`subtipo: "itens"`**: Vários sub-itens (A, B, C...) com campos de resposta e espelhos independentes.

```json
{
  "tipo": "ESCRITA",
  "subtipo": "itens",
  "id": "q_escrita_01",
  "tags": ["Pneumologia"],
  "dificuldade": 3,
  "enunciado": "Sobre a pneumonia adquirida na comunidade (PAC):",
  "itens": [
    {
      "pergunta": "Qual o agente etiológico mais frequente em adultos?",
      "gabarito": "Streptococcus pneumoniae (pneumococo)."
    },
    {
      "pergunta": "Cite dois critérios que pontuam no escore CURB-65.",
      "gabarito": "Confusão mental, Ureia ≥ 50 mg/dL, FR ≥ 30 irpm, PAS < 90 ou PAD ≤ 60 mmHg, Idade ≥ 65 anos."
    }
  ],
  "comentario_geral": "O CURB-65 estratifica gravidade e risco de mortalidade na PAC."
}
```

---

## ⚙️ Fluxos de Funcionamento e Regras de Negócio

### Motor de Filtro em 2 Etapas
1. **Passo 1 (Assuntos/Pastas):** O usuário navega pela árvore de pastas e marca quais galhos deseja incluir. Pastas contam com contadores automáticos e propagação de seleção pai/filho.
2. **Passo 2 (Critérios Finos):** Apenas com base nas questões das pastas selecionadas no Passo 1, o usuário refina por:
   - **Tags a incluir / Tags a excluir** (com botões de ação rápida: *Desselecionar todas*, *Selecionar todas não incluídas*).
   - **Nível de Dificuldade** (1 a 5).
   - **Tipo de Questão** (ME, VF, CH, ME-CH, ESCRITA).
3. **Preservação de Contexto em Grupos (`question-forced`):** Se uma questão de um `grupo_juntas` for selecionada pelos filtros, mas outras questões do mesmo caso clínico não corresponderem aos filtros, as demais podem ser exibidas com um badge cinza especial como contexto de leitura (não valem nota e não são pontuadas).

### Embaralhamento e Mapeamento Dinâmico de Letras
- Questões e alternativas podem ser embaralhadas independentemente via algoritmo Fisher-Yates.
- **Resolução de Placeholders em Gabaritos:** Comentários que citam letras de alternativas (ex.: *"A alternativa {B} está errada porque..."*) utilizam a sintaxe `{A}`, `{B}`, etc. O motor `formatText(text, originalQIdx, altMappings)` substitui automaticamente a letra pelo identificador visual correto da alternativa na posição embaralhada.

### Modo de Repetição de Erros (Retry Mode)
Ao concluir uma sessão, o usuário pode clicar em **Refazer Erros**. O sistema:
1. Filtra todas as questões onde a pontuação obtida foi inferior a 1 (ou que foram marcadas como "Desconsiderar Acerto").
2. Re-sorteia variantes de perguntas e assertivas.
3. Cria uma visão focada apenas nos itens que precisam de reforço de estudo.

### Recurso "Desconsiderar Acerto"
Se o usuário acertar uma questão no "chute" ou sem segurança, pode marcar o checkbox **"Desconsiderar acerto"**. Essa ação:
- Ajusta a pontuação da questão para 0 na nota final.
- Garante que a questão seja incluída na lista de revisão ao acionar o Modo Retry.

### Gerenciamento Individual de Questões (Deletar / Desativar)
*(Novidade V3.8)* Todo `question-card` exibe, ao lado do botão **📋 Selecionar**, um botão de gerenciamento (🗑️) que abre um modal com três opções: **Deletar questão**, **Desativar questão** e **Cancelar**.

- **Deletar questão:** Remove a questão permanentemente da sessão atual (`state.deletedIndices`). Ela deixa de aparecer, e como a numeração visual é sempre recalculada a partir da posição da questão dentro de `mappings.qOrder` (não de um número fixo salvo), as demais questões são renumeradas automaticamente. Deixa de contar tanto no "respondidas X/Y" quanto no cálculo de nota parcial/final. Se pertencia a um `grupo_juntas` e era a última questão restante do grupo, o texto-base do grupo também deixa de ser exibido.
- **Desativar questão:** A questão continua visível na sessão (mantendo sua posição/numeração), porém fica bloqueada: não é mais possível respondê-la e ela é excluída do cálculo de nota (parcial e final) e da contagem de "respondidas". Uma questão desativada exibe um aviso e pode ser reativada a qualquer momento pelo mesmo botão de gerenciamento — o que restaura sua contagem na nota e sua interatividade (incluindo respostas dadas antes da desativação, que são preservadas).
- **Cancelar:** Fecha o modal sem nenhuma alteração.

Ambos os estados (`deletedIndices` e `disabledIndices`) são armazenados por índice original da questão dentro da sessão, persistem através de reembaralhamentos e mudanças de filtro, e são totalmente independentes entre sessões — deletar/desativar uma questão em uma sessão derivada (ex.: Modo Retry) não afeta a sessão de origem, e vice-versa.

### Marcação de Texto & Eliminação de Alternativas
- **Marcação de palavras legada:** Mantida para compatibilidade nos pontos em que já existia, incluindo o sistema próprio do VF simples.
- **Marca-texto V3.9.2:** Enunciados de ME, ME-CH, CH e ESCRITA, além dos textos-base de `grupo_juntas`, podem receber marcações persistentes em 12 cores e opacidade ajustável. VF simples não exibe o novo marca-texto.
  - Cada marcação preserva sua própria cor e opacidade e pode atravessar parágrafos e formatações HTML sem alterar o texto original.
  - Marcações não podem se sobrepor; marcações adjacentes com a mesma aparência são unidas.
  - O menu contextual permite deletar, copiar, alterar cor/opacidade ou cancelar. A engrenagem acoplada ao botão da ferramenta abre as opções para ocultar temporariamente, apagar as marcações do texto atual ou apagar todas da sessão.
  - As marcações são salvas no estado da sessão e acompanham exportação/importação, IndexedDB e Firebase.
  - **Reiniciar quiz** apaga respostas e marcações. Uma sessão de **Refazer erros** começa sem marcações, mantendo intacta a sessão de origem.
- **Exibição de metadados V3.9.2:** Tags e caminhos de pastas podem ser ocultados independentemente. Quando algum metadado disponível estiver oculto, o olhinho da questão permite revelá-lo temporariamente sem gerar salvamento de sessão.
- **Grupos juntos V3.9.2:** O texto-base e as questões visíveis do grupo são ligados por uma linha ramificada. A estrutura é recalculada após filtros, redimensionamentos e exclusões, encerrando-se sempre na última questão ainda exibida.
- **Tesoura de Eliminação (✂️):** Permite riscar visualmente alternativas que o usuário já descartou como incorretas.

---

## 💾 Gerenciamento de Sessões & Persistência Local (IndexedDB)

A aplicação gerencia múltiplos simulados simultaneamente através da biblioteca nativa IndexedDB (`js/store.js`):
- **Store `sessions`:** Armazena objetos completos de sessão indexados por `sessionId` (UUID). Contém:
  - `title`, `sourceFileName`, `createdAt`, `lastAccessedAt`, `updatedAt`
  - `folderId`: ID da pasta do usuário onde a sessão está arquivada
  - `answeredCount`, `totalCount`
  - `state`: snapshot integral (filtros ativos, questões, ordem sorteada, respostas, eliminações, marcações).
- **Sistema de Pastas de Sessões:** Permite criar diretórios virtuais para organizar simulados (ex.: *"Simulados 2026"*, *"Revisão R1"*, *"Erros de Cirurgia"*).
- **Exportação/Importação:** Suporte a backup individual de sessão (`.json`) ou backup completo de todas as sessões e pastas.

---

## ☁️ Sincronização com Firebase Firestore

O sistema possui um módulo opcional de sincronização na nuvem (`js/firebase-sync.js`):
- **Autenticação:** Realizada via código PIN que mapeia para a conta de serviço `sync@quiz.app`.
- **Compressão Gzip Client-Side:** O estado das sessões pode ser extenso. Antes do envio ao Firestore, o JSON é compactado usando `CompressionStream('gzip')` nativo do browser e convertido para Base64.
- **Chunking (Segmentação):** Arquivos que ultrapassam 800 KB são automaticamente divididos em múltiplos documentos (`/sessions/{id}/chunks/{n}`) contornando o limite de 1MB por documento do Firestore.
- **Tombstones:** Registra exclusões de sessões no documento `/meta/deletedSessions` para que a sincronização bidirecional não ressuscite itens deletados em outro aparelho.

---

## 🎨 Configurações Visuais, Acessibilidade e Atalhos

No painel de configurações (⚙️) o usuário pode personalizar:
- **Modo Escuro (Dark Mode):** Tema escuro com persistência imediata em `localStorage`.
- **Tamanho da Fonte:** Slider dinâmico variando de 12px a 22px ajustando a variável `--base-font-size`.
- **Botão "Responder Todas" Fixo:** Barra de rodapé fixa ou no fluxo do documento.
- **Layout V/F Empilhado:** Alterna botões V e F entre horizontal e vertical.
- **Comportamento de Comentários:**
  - *Exibir todos*: Abre todos os gabaritos após submissão.
  - *Exibir apenas da atual*: Fecha automaticamente comentários de outras questões ao focar ou rolar pela página, mantendo a tela limpa.
- **Atalhos e Gestos:**
  - `Ctrl + B`: Alterna (abre/fecha) todos os comentários explicativos.
  - `Mobile (3 dedos, 3 toques rápidos)`: Alterna comentários no celular/tablet.
  - `Botão ⏭️ Próxima`: Botão flutuante que rola suavemente até a próxima questão pendente de resposta.

---

## 🛠️ Scripts e Ferramentas Auxiliares

### `gerar_index.py`
Varre recursivamente a pasta `quizes-da-nuvem/` e gera o arquivo `quizes-da-nuvem/index.json`. Deve ser executado sempre que novos arquivos `.json` forem adicionados ou renomeados no repositório de quizes da nuvem.

```bash
python gerar_index.py
```

### `arquivos.py`
Script útil para pair programming com IA ou auditoria de código. Ele lê e concatena todos os arquivos `.css` e `.js` da aplicação em um único arquivo de texto (`inde.html.txt`).

```bash
python arquivos.py
```

### `iniciar_servidor.bat`
Inicia um servidor local na porta 8000 via Python e abre automaticamente o navegador no endereço `http://localhost:8000`.

---

## 🤖 Guia de Manutenção para Desenvolvedores e IAs

Ao trabalhar neste repositório, observe as seguintes diretrizes arquiteturais:

1. **Versionamento de Assets & Cache Buster (`APP_ASSET_VERSION`):**
   - No arquivo `index.html` e nos `import` relativos dentro de `js/`, há um sufixo de versão (ex.: `?v=20260903-3`).
   - Sempre que alterar a assinatura de funções ou estruturas críticas em arquivos JS, certifique-se de atualizar o `APP_ASSET_VERSION` em `index.html` e nas importações para evitar que navegadores executem módulos em cache antigo.

2. **Imutabilidade e Deep Copy de Variantes:**
   - Em `js/parser.js`, os nós originais de `VARIANTES` e assertivas de `CH` são clonados (`JSON.parse(JSON.stringify(node))`) antes de sofrer mutação, ficando guardados em `_variantNode` e `_originalAssertivas`. Não remova essas referências, pois são vitais para o funcionamento de `reshuffleVariants` e do Modo Retry.

3. **Compatibilidade de Gabaritos V/F:**
   - Para questões do tipo `VF`, o parser normaliza `gabarito: "V"` para `"A"` e `gabarito: "F"` para `"B"` internamente para manter compatibilidade com a engine de correção de escolha única.

4. **Tratamento de Quebra de Linha:**
   - Textos de enunciado e comentários podem conter HTML básico (`<b>`, `<i>`, `<br>`) ou quebras de linha `\n`. O renderer trata adequadamente ambos.

5. **Sem Dependências Externas em Runtime:**
   - Exceto pelos SDKs do Firebase carregados via CDN oficial da Google (`https://www.gstatic.com/firebasejs/10.12.0/`), todo o código é puro e deve continuar livre de dependências para garantir portabilidade e funcionamento offline.
