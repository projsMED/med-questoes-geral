# 🩺 Question Engine V4.5.0-beta.5 (med-questoes-geral)

> Plataforma web interativa para resolução, estudo, autocorreção e organização de bancos de questões médicas e gerais, com arquitetura 100% *client-side*, suporte offline via **IndexedDB**, filtros em etapas, modos avançados de estudo e sincronização em nuvem via **Firebase Firestore**.

## Beta 4.5.0 — etapa 5 de 5

- `js/filters.js` concentra o esquema dos filtros, normalização de sessões legadas, contagens, árvore de pastas, descrições, tags incluídas/excluídas, dificuldade e tipo nas duas etapas.
- `selectQuestionGroups(state)` seleciona os blocos de questões e identifica o contexto obrigatório dos grupos sem modificar a sessão. O controlador mantém embaralhamento, mapas de alternativas, renderização e salvamento.
- `QuizFilters` recebe elementos do DOM, um leitor do estado atual e callbacks para salvar, gerar o quiz e mostrar informações. A troca de sessão e a reconstrução dos painéis removem eventos dos controles anteriores.
- Os campos e as regras são preservados, incluindo questões sem tag/dificuldade, aliases CH/ME-CH, exclusões de tags, contexto dos grupos, retry e questões apagadas/desativadas. Sessões das betas anteriores usam o mesmo banco.

### Mantido da beta.4

- `js/preferences.js` concentra a leitura das preferências visuais/gerais, a restauração dos controles e a aplicação de tema, fonte, largura, rodapé e disposição V/F.
- O componente `Preferences` recebe elementos do DOM e callbacks para reconstruir questões, aplicar opções gerais e abrir comentários. As ações e o salvamento da sessão continuam no controlador. Renderer e associação usam os mesmos leitores de preferências.
- As chaves e os valores padrão são preservados: configurações salvas nas betas anteriores continuam válidas e isoladas pelo prefixo `beta:`. O tema segue o sistema enquanto não houver escolha manual.
- Reinicializar ou descartar o componente remove seus eventos, incluindo a observação do tema do sistema e os gestos de largura. Um arrasto pendente é cancelado sem salvar sua largura provisória.
- Os mesmos controles continuam funcionando no topo e dentro do popup de atalhos. Tela cheia permanece no módulo de atalhos; os eventos do modal de editar sessão ficam no controlador.

### Mantido da beta.3

- `js/matching-questions.js` concentra as questões de associação (MQ): setas, tabela, conexões, gabarito visual, fonte, expansão, redimensionamento e menu de exclusão.
- `QuizRenderer` delega a associação ao componente `MatchingQuestions`, passando o contêiner e o callback para salvar conexões. O módulo não recebe o controlador inteiro nem grava diretamente no IndexedDB ou Firebase.
- Os índices originais das conexões, a ordem embaralhada, as respostas legadas e as regras de pontuação são preservados. Sessões salvas nas betas anteriores continuam no mesmo banco.
- Ao reconstruir cartões ou sair de uma sessão, o módulo remove observadores, eventos globais, menus e temporizadores. A tabela expandida é fechada e os gestos de redimensionamento pendentes são cancelados.

### Mantido da beta.2

- `js/highlighter.js` agora concentra o marca-texto: entrada por mouse/touch/caneta, seleção por palavras, preview, rolagem durante o gesto, menus, cores, opacidade e cópia de trechos.
- `QuizRenderer` monta as questões e delega o marca-texto ao componente `TextHighlighter`, passando o contêiner, uma função para ler o estado e callbacks para salvar alterações. O módulo não recebe o controlador inteiro nem grava diretamente no IndexedDB ou Firebase.
- A reconstrução da lista e a troca de cartões removem eventos e seleções pendentes dos elementos anteriores. `renderer.clear()` também cancela gestos, preview e menus ao sair de uma sessão. O componente oferece `dispose()` para liberar seus eventos e temporizadores quando for descartado.
- Os campos `textHighlights`, IDs, offsets, hash do texto e configurações são preservados. Sessões salvas na beta.1 continuam usando o mesmo banco local. A marcação legada de palavras e o modo de seleção permanecem no renderer, com a desativação do marca-texto integrada ao botão de seleção.

### Mantido da beta.1

- `js/scoring.js` reúne gabaritos, pontuação e regras de desconsideração de acertos. O controlador e o renderer usam a mesma implementação; as regras e os formatos de dados são preservados. Os exports anteriores de `utils.js` permanecem disponíveis por compatibilidade.
- A beta usa o IndexedDB **QuizEngineV3Beta**, com o mesmo esquema da versão estável. Sessão ativa, preferências e exclusões pendentes usam chaves de localStorage com prefixo `beta:`. A beta não lê nem migra automaticamente o banco estável **QuizEngineV3**.
- Firebase permanece disponível apenas por ação manual nos botões de sincronização. Login, salvamento, entrega de respostas e exclusão de sessões não enviam nem baixam dados automaticamente. Exclusões locais ficam pendentes até a sincronização manual.
- A sincronização manual usa a **mesma nuvem** da versão estável, incluindo sessões, pastas e exclusões. O isolamento local não cria outra conta ou banco Firebase.

Testes: `node --test tests/*.test.mjs` (Node.js 20+). Os 69 testes cobrem interações, pontuação dos tipos e aliases, desconsideração, consistência entre resumo/retry, isolamento do canal e sincronização manual com Firebase simulado. Incluem persistência do marca-texto por callbacks, restauração dos campos, grupos, sobreposição, cor/opacidade e limpeza de recursos. Também cobrem conexões e gabarito embaralhados, respostas legadas, bloqueio após entrega, troca entre setas/tabela, controles da tabela e limpeza de recursos MQ. A beta.4 acrescenta restauração das preferências, isolamento de chaves, tema automático/manual, efeitos dos controles na sessão, uso no popup e descarte de eventos/arrastos. A beta.5 acrescenta combinação de filtros, árvore/contagens, aliases, grupos/contexto, retry, geração, restauração de sessão e limpeza de eventos. São testes com DOM e serviços simulados; geometria das setas, layout, seleção nativa, IndexedDB e Firebase reais devem também ser verificados no navegador.

### Etapas da modularização

1. **beta.1 — concluída:** pontuação compartilhada e preparação do canal beta.
2. **beta.2 — concluída:** extrair marca-texto.
3. **beta.3 — concluída:** extrair associação de colunas.
4. **beta.4 — concluída:** extrair preferências.
5. **beta.5 — concluída:** extrair filtros e avaliar o resultado.

### Avaliação ao concluir as cinco etapas

A divisão agora acompanha cinco responsabilidades claras: pontuação, marca-texto, associação, preferências e filtros. Os componentes usam callbacks pequenos e o estado salvo mantém o mesmo formato. A aplicação continua com ES modules nativos e o mesmo processo de publicação.

Em relação à `main` 4.4.2, `main.js` passou de 152.812 para 116.608 bytes (cerca de 24% menor) e `renderer.js` de 155.965 para 68.025 bytes (cerca de 56% menor). Essas medidas mostram a distribuição do código entre arquivos; a validação de desempenho depende do navegador e da carga de questões.

`main.js` continua coordenando sessões, pastas de sessões, Firebase, ações sobre respostas e geração de mapas. A organização é suficiente para esta rodada de cinco etapas. Uma separação dessas áreas pode ser avaliada em futuras mudanças que realmente as envolvam. Antes da promoção, conferir manualmente os fluxos abaixo e as convenções de canal/banco descritas na seção de promoção.

A branch `main` continua estável. Criar a branch `beta` não configura automaticamente uma URL no GitHub Pages; a publicação de teste é uma configuração separada.

### Teste manual da beta.5

- Abrir um quiz com pastas/subpastas, conferir contagens, seleção parcial e descrições; avançar/voltar entre as duas etapas.
- Combinar tags incluídas/excluídas, dificuldade e tipo. Testar Selecionar/Desselecionar todas e Excluir as não incluídas, além de questões sem tag/dificuldade.
- Gerar o quiz e conferir a seleção, o resumo dos filtros e o contexto dos grupos. Testar embaralhamento de questões/alternativas e associação MQ.
- Refazer erros de um grupo, conferir as questões de contexto, depois gerar pelos filtros e confirmar a saída do retry. Questões apagadas não devem reaparecer; desativadas seguem visíveis e fora da pontuação.
- Reabrir uma sessão da beta.4 com filtros salvos na segunda etapa; conferir escolhas e gerar novamente. Trocar de sessão e verificar que os controles passam a alterar a sessão atual.
- Revisar marca-texto, associação, configurações, atalhos, tela cheia, salvamento e sincronização manual para concluir a avaliação das cinco etapas.

### Teste manual das preferências (beta.4)

- Reabrir uma sessão da beta.3 e conferir tema, fonte, largura, rodapé, disposição V/F, modo MQ, nota parcial e opções gerais já salvas. Recarregar e confirmar que as escolhas persistem.
- Sem escolha manual de tema na beta, mudar o tema do sistema e conferir a atualização; depois escolher claro/escuro no site e confirmar que o sistema deixa de sobrescrever essa escolha.
- Alterar largura pelo slider, alças (mouse e touch), teclado e botão Padrão; confirmar que toque duplo abre o popup e rolagem vertical/pinça não redimensionam.
- No popup, alterar fonte, modo MQ, comentários e opções gerais, fechar e conferir que os mesmos controles funcionam no topo. Testar também os botões de tela cheia.
- Conferir comentários no modo última questão, persistência dos abertos manualmente, nota parcial, desconsideração de acertos e correção simples MVF. Editar nome/descrição de uma sessão.

### Teste manual da associação (beta.3)

- Em questões MQ, criar e remover conexões nos modos setas e tabela, incluindo um item com vários destinos e outro sem associação (`nulo`).
- Embaralhar as colunas e conferir se as respostas, letras/números e pontuação continuam correspondendo aos itens originais. Entregar respostas e verificar acertos, erros, omissões e bloqueio de edição.
- Alternar entre setas e tabela, salvar/reabrir a sessão e conferir as conexões existentes, incluindo uma sessão criada nas betas anteriores.
- Nas setas, testar fonte e exclusão pelo menu do botão direito. Na tabela, testar fonte, largura das colunas, restauração com duplo clique, expansão e Escape; verificar também o arrasto por touch.
- Sair ou trocar de sessão com menu/tabela expandida, abrir outra e confirmar que não ficam menus, expansão ou ações da questão anterior.

### Teste manual do marca-texto (beta.2)

- Marcar com mouse (incluindo mouse Bluetooth em tablet), touch e caneta; soltar o mouse fora do enunciado e alternar a entrada sem recarregar.
- Marcar um enunciado e um texto-base de grupo; alterar cor/opacidade, ocultar/mostrar, copiar e apagar marcações.
- Recarregar uma sessão criada na beta.1 e conferir os destaques existentes. Responder, trocar a ordem das questões e alternar configurações para verificar a reconstrução dos cartões.
- Sair ou apagar uma sessão com um gesto/menu aberto, abrir outra e confirmar que não ficam preview, rolagem ou menus da sessão anterior.

### Promoção para versão estável

Antes do merge, mudar `RELEASE_CHANNEL` para `stable` em `js/release-config.js`, atualizar a versão/título e usar novamente `vs_darkMode` na leitura inicial do tema em `index.html`. Remover o aviso específico da beta e o atributo `disabled` inicial da opção de sincronização automática. Atualizar também a versão dos assets e imports. O código passa a usar o banco **QuizEngineV3** e as chaves locais originais; a preferência estável de sincronização automática volta a ser respeitada. Dados da beta não são copiados automaticamente para o banco estável; eventuais sessões de teste podem ser transferidas pelos exports/imports existentes quando desejado.

## Novidades da versão 4.4.2

- Dois toques rápidos ou botão direito do mouse no espaço vazio entre cartões abrem o mesmo menu rápido das laterais, incluindo intervalos entre questões agrupadas. Textos-base, enunciados, alternativas e espaços internos dos cartões continuam fora da área do atalho.
- As áreas de toque são transparentes, acompanham mudanças de layout e não alteram o espaçamento. Rolagem vertical e zoom por pinça são preservados.
- O menu rápido oferece **Entrar/Sair da tela cheia** antes de Configurações gerais, com estado e mensagens sincronizados com o botão existente nas configurações gerais.

## Novidades da versão 4.4.1

- Marca-texto compatível com mouse Bluetooth em tablets: a seleção por caractere do mouse e o gesto por palavras do touch/caneta seguem a entrada usada em cada interação.
- Dois toques rápidos na mesma margem externa das questões ou botão direito do mouse abrem um popup com configurações gerais e visuais. Os controles são os mesmos do topo; fechar o popup preserva a questão em estudo.
- As alças laterais aguardam movimento horizontal para redimensionar, permitindo distinguir toque duplo, arrasto horizontal e rolagem vertical, com zoom por pinça preservado.
- A opção **Tela cheia** aparece no topo das configurações gerais, com entrada/saída por botão e indicação quando o navegador não oferece suporte.

Os testes de regressão de interação podem ser executados com `node --test tests/interactions.test.mjs` (Node.js 20+). Eles verificam reconhecimento dos gestos, reutilização dos controles, preservação da questão, tela cheia e alternância entre mouse/touch/caneta usando uma superfície DOM simulada. A validação de rolagem, zoom e tela cheia nativos deve também ser feita no navegador/dispositivo de destino.

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
   - [Múltiplo Verdadeiro ou Falso (`MVF` / `CH`)](#6-múltiplo-verdadeiro-ou-falso-mvf)
   - [Múltipla Escolha Múltipla (`MEM` / `ME-CH`)](#7-múltipla-escolha-múltipla-mem)
   - [Dissertativa / Discursiva (`ESCRITA`)](#8-dissertativa--discursiva-escrita)
   - [Questão de Associação / Matching Question (`MQ`)](#9-questão-de-associação--matching-question-mq)
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
│   ├── filters.js                 # QuizFilters: esquema, seleção por grupos, contagens e controles
│   ├── preferences.js             # Preferences: leitura, controles e aplicação das preferências visuais/gerais
│   ├── matching-questions.js       # MatchingQuestions: associação por setas/tabela e limpeza de recursos
│   ├── highlighter.js              # TextHighlighter: seleção, destaques, gestos, menus e limpeza de recursos
│   ├── parser.js                   # Parser: linearização da árvore JSON, resolução de grupos, variantes e tipos
│   ├── store.js                    # Camada de persistência IndexedDB (sessões, pastas e migrações)
│   ├── utils.js                    # Utilitários: Fisher-Yates, mapas, formatters e reexports de compatibilidade
│   ├── scoring.js                  # Gabaritos e pontuação compartilhados, sem dependências de DOM
│   ├── release-config.js           # Canal, armazenamento local e política de sincronização automática
│   ├── settings-shortcuts.js       # Menu de configurações, gestos e tela cheia
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
  "questoes": [ /* Questões ME, MEM, VF, MVF, ESCRITA, MQ */ ]
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

### 6. Múltiplo Verdadeiro ou Falso (`MVF`)
Apresenta múltiplas assertivas (I, II, III...) a serem julgadas individualmente como V ou F. Suporta **variantes internas** de assertivas (assertivas com mesmo `id` são sorteadas randomicamente).

> **Nota de Retrocompatibilidade:** O identificador anterior `"tipo": "CH"` continua 100% suportado e aceito de forma transparente pelo sistema.

```json
{
  "tipo": "MVF",
  "id": "q_mvf_01",
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

### 7. Múltipla Escolha Múltipla (`MEM`)
Múltipla escolha com caixas de seleção onde mais de uma alternativa pode estar correta.

> **Nota de Retrocompatibilidade:** O identificador anterior `"tipo": "ME-CH"` continua 100% suportado e aceito de forma transparente pelo sistema.

```json
{
  "tipo": "MEM",
  "id": "q_mem_01",
  "tags": ["Farmacologia"],
  "dificuldade": 2,
  "enunciado": "Assinale os antibióticos que atuam na inibição da síntese da parede celular bacteriana:",
  "alternativas": [
    { "id": "alt_1", "texto": "Amoxicilina" },
    { "id": "alt_2", "texto": "Gentamicina" },
    { "id": "alt_3", "texto": "Vancomicina" }
  ],
  "gabarito": "A, C",
  "comentario_geral": "Amoxicilina (A) e Vancomicina (C) inibem parede. Gentamicina (B) inibe síntese proteica (30S)."
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

### 9. Questão de Associação / Matching Question (`MQ`) - V4.4
Consiste em duas colunas (Coluna I e Coluna II) com até 26 itens em cada uma. Suporta associações 1:1, 1:N, N:1 ou itens sem associação (nenhum).
- **Coluna Esquerda:** renderizada numericamente (1, 2, 3...). Nome configurável (`nome`, padrão "Coluna I"). Ordenação configurável (`ordenacao`: `"fixa"`, `"alfabetica"` ou ausente/aleatorizável por `shuffleA`).
- **Coluna Direita:** renderizada alfabeticamente (A, B, C...). Nome configurável (`nome`, padrão "Coluna II"). Mesmas opções de ordenação.
- **Dois Modos Visuais:**
  1. *Setas de Ligação (SVG):* traçado dinâmico por clique e remoção facilitada: basta repetir o clique na mesma associação (toggle) ou usar o menu de contexto com botão direito (desktop) e toque duplo (mobile). Setas com alto contraste no modo escuro (`#cbd5e1`) e feedback pós-envio em verde (acerto), vermelho (erro), laranja tracejado (omissão) e verde-claro fino (correção do erro).
  2. *Grade / Tabela (V4.4):* matriz interativa com alternância entre `○` e `●`. A Coluna I tem largura compacta ajustada ao seu conteúdo (*fit-content*), sem sobras vazias. Inclui **divisores arrastáveis estilo Excel (`↔`)** nos cabeçalhos: arrastar na borda da Coluna I ajusta sua largura; arrastar em qualquer coluna da Coluna II redimensiona todas as colunas de opções de forma sincronizada (com duplo clique para restaurar o tamanho padrão). Possui barra superior permanente com botões de zoom `A−` e `A+` (com escala proporcional de textos e larguras) e botão inteligente **`⛶ Expandir`** (modal suspenso adaptativo que fecha via `Esc`, botão `✕ Fechar expansão` ou clique fora). A **Coluna I (número e nome do item) permanece perfeitamente fixada (sticky)** durante rolagens horizontais. Associações esquecidas são sinalizadas com fundo alaranjado e **borda pontilhada verde**.
- **Botão Responder e Ações (V4.4):** barra de ação com *"Responder"* e *"Desconsiderar acerto"* posicionada **antes** dos comentários e pontuações, mantendo o padrão unificado da plataforma. Total compatibilidade com o modo *"📋 Selecionar"*, marca-texto no enunciado, grupos de questões e quebras de linha em enunciados e comentários gerais (`white-space: pre-line`).
- **Fórmula de Pontuação por Item da Esquerda:**
  - Item com gabarito sem associação (`nenhum`): `1.0` se nenhuma marcação for feita; `0.0` se marcar algo.
  - Caso geral: `max(0, (corretas - incorretas) / total_corretas_no_gabarito)`.
- **Pontuação Final da Questão:** média das pontuações dos itens da coluna esquerda (normalizada de 0 a 1 ponto).

```json
{
  "tipo": "MQ",
  "id": "q_mq_01",
  "tags": ["Farmacologia", "Tuberculose"],
  "dificuldade": 2,
  "enunciado": "Associe os fármacos aos seus respectivos efeitos adversos:",
  "coluna_esquerda": {
    "nome": "Fármaco",
    "ordenacao": "alfabetica",
    "itens": [
      { "id": 1, "texto": "Isoniazida" },
      { "id": 2, "texto": "Rifampicina" },
      { "id": 3, "texto": "Pirazinamida" },
      { "id": 4, "texto": "Etambutol" }
    ]
  },
  "coluna_direita": {
    "nome": "Efeito adverso",
    "ordenacao": "fixa",
    "itens": [
      { "id": "A", "texto": "Neurite óptica" },
      { "id": "B", "texto": "Hiperuricemia e artralgia" },
      { "id": "C", "texto": "Neuropatia periférica (vitamina B6)" },
      { "id": "D", "texto": "Coloração alaranjada de secreções" }
    ]
  },
  "gabarito": "1(C), 2(D), 3(B), 4(A)",
  "comentario_geral": "A {1} causa neuropatia ({C}). A {2} causa urina alaranjada ({D})."
}
```

---

## ⚙️ Fluxos de Funcionamento e Regras de Negócio

### Motor de Filtro em 2 Etapas
1. **Passo 1 (Assuntos/Pastas):** O usuário navega pela árvore de pastas e marca quais galhos deseja incluir. Pastas contam com contadores automáticos e propagação de seleção pai/filho.
2. **Passo 2 (Critérios Finos):** Apenas com base nas questões das pastas selecionadas no Passo 1, o usuário refina por:
   - **Tags a incluir / Tags a excluir** (com botões de ação rápida: *Desselecionar todas*, *Selecionar todas não incluídas*).
   - **Nível de Dificuldade** (1 a 5).
   - **Tipo de Questão** (ME, MEM, VF, MVF, ESCRITA, MQ — com suporte retrocompatível a ME-CH e CH).
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
- **Marca-texto V3.9.4:** Enunciados de ME, MEM (ME-CH), MVF (CH) e ESCRITA, além dos textos-base de `grupo_juntas`, podem receber marcações persistentes em 12 cores e opacidade ajustável. No touch, a seleção salta por palavras inteiras; no PC, continua precisa por caractere. VF simples não exibe o novo marca-texto.
  - Cada marcação preserva sua própria cor e opacidade e pode atravessar parágrafos e formatações HTML sem alterar o texto original.
  - Marcações não podem se sobrepor; marcações adjacentes com a mesma aparência são unidas.
  - O menu contextual permite deletar, copiar, alterar cor/opacidade ou cancelar. A engrenagem acoplada ao botão da ferramenta abre as opções para ocultar temporariamente, apagar as marcações do texto atual ou apagar todas da sessão.
  - Em telas touch compatíveis, arrastar sobre o texto mostra a marcação em tempo real e confirma uma única vez ao soltar. O gesto aceita múltiplas linhas, arrasto reverso, rolagem automática nas bordas e preserva o zoom por pinça.
  - As marcações são salvas no estado da sessão e acompanham exportação/importação, IndexedDB e Firebase.
  - **Reiniciar quiz** apaga respostas e marcações. Uma sessão de **Refazer erros** começa sem marcações, mantendo intacta a sessão de origem.
- **Exibição de metadados V3.9.3:** Tags e caminhos de pastas podem ser ocultados independentemente. Quando algum metadado disponível estiver oculto, o olhinho da questão permite revelá-lo temporariamente sem gerar salvamento de sessão.
- **Grupos juntos V3.9.3:** O texto-base e as questões visíveis do grupo são ligados por uma linha ramificada. A estrutura é recalculada após filtros, redimensionamentos e exclusões, encerrando-se sempre na última questão ainda exibida.
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
   - No arquivo `index.html` e nos `import` relativos dentro de `js/`, há um sufixo de versão (ex.: `?v=20260904-2`).
   - Sempre que alterar a assinatura de funções ou estruturas críticas em arquivos JS, certifique-se de atualizar o `APP_ASSET_VERSION` em `index.html` e nas importações para evitar que navegadores executem módulos em cache antigo.

2. **Imutabilidade e Deep Copy de Variantes:**
   - Em `js/parser.js`, os nós originais de `VARIANTES` e assertivas de `MVF` (`CH`) são clonados (`JSON.parse(JSON.stringify(node))`) antes de sofrer mutação, ficando guardados em `_variantNode` e `_originalAssertivas`. Não remova essas referências, pois são vitais para o funcionamento de `reshuffleVariants` e do Modo Retry.

3. **Compatibilidade de Gabaritos V/F:**
   - Para questões do tipo `VF`, o parser normaliza `gabarito: "V"` para `"A"` e `gabarito: "F"` para `"B"` internamente para manter compatibilidade com a engine de correção de escolha única.

4. **Tratamento de Quebra de Linha:**
   - Textos de enunciado e comentários podem conter HTML básico (`<b>`, `<i>`, `<br>`) ou quebras de linha `\n`. O renderer trata adequadamente ambos.

5. **Sem Dependências Externas em Runtime:**
   - Exceto pelos SDKs do Firebase carregados via CDN oficial da Google (`https://www.gstatic.com/firebasejs/10.12.0/`), todo o código é puro e deve continuar livre de dependências para garantir portabilidade e funcionamento offline.
