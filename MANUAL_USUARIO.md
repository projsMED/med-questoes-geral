# Manual do Usuário - Sistema de Quizes Med Questões

Este manual descreve como utilizar o sistema de quizes, desde a criação das questões em formato de texto simples até a utilização da interface de estudo.

## 1. Visão Geral
O sistema é composto por duas partes principais:
1.  **Conversor (`Conversor.html`):** Uma ferramenta que transforma suas questões escritas em texto simples (.txt) para o formato que o site entende (.json).
2.  **O Quiz (`index.html`):** O aplicativo onde você carrega o arquivo .json, filtra as questões e estuda.

---

## 2. Como Criar Questões (Formato de Texto)

Você não precisa saber programação. As questões são escritas em um bloco de notas (Notepad, VS Code, etc.) seguindo uma estrutura simples.

### Estrutura Básica de Pastas
Você pode organizar seus quizes em pastas.
```text
Pasta: Cardiologia
Descrição: Questões sobre coração [

    (Suas questões aqui...)

]
```
*Nota: O uso de colchetes `[` e `]` define onde começa e termina a pasta.*

### Tipos de Questão

#### A. Múltipla Escolha (ME)
É o formato padrão.
*   **Q:** Enunciado.
*   **A), B), C)...:** Alternativas.
*   **G:** Gabarito (Letra correta).
*   **C:** Comentário específico da alternativa (opcional).
*   **CG:** Comentário Geral da questão (opcional).

```text
Tag: Anatomia
Dificuldade: Fácil
Q: Qual o maior osso do corpo humano?
A) Fêmur
C: Correto. Localizado na coxa.
B) Úmero
C: Incorreto. Fica no braço.
G: A
CG: O fêmur é o osso mais longo e resistente.
```

#### B. Verdadeiro ou Falso (VF)
Não possui alternativas A/B/C. Você afirma algo no enunciado e o gabarito é V ou F.
*   **Q:** Enunciado (Afirmação).
*   **G:** V ou F.

```text
Q: A mitocôndria é responsável pela respiração celular.
G: V
CG: Ela produz ATP através da respiração aeróbica.
```

#### C. Checkbox / Múltipla Seleção (CH)
Permite marcar várias opções. As alternativas são numeradas (A1, A2...) e cada uma tem seu próprio julgamento (V ou F).
*   **CH:** Enunciado.
*   **A1:, A2:...:** Assertivas.
*   **G:** V ou F (para a assertiva imediatamente acima).

```text
CH: Assinale as alternativas corretas sobre a Dengue.
A1: É transmitida pelo Aedes aegypti.
G: V
A2: É uma doença bacteriana.
G: F
C: É uma doença viral (arbovirose).
CG: A prevenção foca no combate ao vetor.
```

### Funcionalidades Avançadas

#### Grupos de Questões (`juntas`)
Use para questões que compartilham um texto base ou caso clínico.
```text
juntas [
    Texto Base: Um paciente de 45 anos chega com dor precordial...
    
    Q: Qual o diagnóstico provável?
    A) Infarto
    B) Gastrite
    G: A
    
    Q: Qual o exame inicial?
    A) ECG
    B) Endoscopia
    G: A
]
```

#### Variantes (`variantes`)
O sistema escolherá **aleatoriamente apenas uma** questão deste grupo para exibir ao aluno. Útil para evitar decoreba, criando várias perguntas sobre o mesmo conceito.
```text
variantes [
    Q: Capital da França?
    A) Paris
    G: A
    
    Q: Capital da Inglaterra?
    A) Londres
    G: A
]
```

#### Imagens e Formatação
*   **Negrito:** Use `**texto**` para deixar em negrito.
*   **Imagens:** Basta escrever o nome do arquivo.
    *   Ex: `figura1.png`
    *   O conversor vai procurar essa imagem na pasta `images/`.
    *   Você pode configurar um "Atalho de imagens" no Conversor para não precisar digitar o caminho completo (ex: `cardiologia/*` fará `figura.png` virar `images/cardiologia/figura.png`).

#### Tags e Dificuldade
Coloque antes da questão:
*   `Tag: Assunto1, Assunto2`
*   `Dificuldade: Fácil` (ou Médio, Difícil, Muito Difícil).

### Referências em Comentários
Se você quiser citar uma alternativa no comentário, use chaves `{}`.
Ex: `C: A alternativa {A} está incorreta pois...`
*Isso ajuda se o sistema embaralhar as alternativas, mantendo a referência correta.*

---

## 3. Usando o Conversor

1.  Abra o arquivo `Conversor.html` no seu navegador.
2.  Cole o texto que você escreveu no painel da esquerda (**Entrada · TXT**).
3.  Preencha o **Título** e a **Descrição** (opcional).
4.  Clique em **Converter TXT → JSON**.
5.  Se tudo estiver certo, o JSON aparecerá na direita. Clique em **Copiar JSON** e salve em um arquivo `.json` (ex: `meu-quiz.json`) ou use o botão de copiar para colar em um arquivo novo.

---

## 4. Estudando no Site (`index.html`)

1.  Abra `index.html`.
2.  Clique em **Carregar Arquivo Local** e selecione seu `.json`.
3.  **Filtragem:**
    *   **Passo 1:** Escolha as pastas (assuntos) que deseja estudar.
    *   **Passo 2:** Filtre por Tags ou Dificuldade, se quiser.
4.  **Respondendo:**
    *   Clique na alternativa para selecionar.
    *   Use o ícone de tesoura (✂️) para "cortar" (riscar) alternativas que você sabe que estão erradas.
    *   Clique em "Responder" para confirmar.
5.  **Configurações (ícone de engrenagem ou menu):**
    *   **Embaralhar Questões:** Muda a ordem das perguntas.
    *   **Embaralhar Alternativas:** Muda a ordem (A vira B, etc).
    *   **Modo Retry:** Ao final, se houver erros, aparecerá um botão para refazer apenas as erradas.
