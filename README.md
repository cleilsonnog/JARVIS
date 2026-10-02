# J.A.R.V.I.S.
### Just A Rather Very Intelligent System

Assistente pessoal com IA inspirado no JARVIS do Iron Man. Criado por **Cleilson**.

**Live:** [https://cleilsonagente.duckdns.org](https://cleilsonagente.duckdns.org)

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Frontend | HTML + Tailwind CSS v3 (compilado) + JS (ES Modules) + SortableJS |
| LLM | Google Gemini 2.5 Flash (texto + visão + function calling) |
| Voz | Gemini TTS em streaming (voz masculina **Algenib**) + Web Speech API como reserva; reconhecimento de voz pela Web Speech API |
| Banco | SQLite (better-sqlite3) |
| Notificações | Web Push (VAPID, `web-push`) |
| Upload | multer + pdf-parse |
| Integrações | FinPlan (finanças, somente leitura) |
| Deploy | VPS Contabo + PM2 (usuário sem root) + Nginx + Let's Encrypt |
| Mobile | PWA (instalável no celular) |

## Funcionalidades

### Assistente
- **Chat com IA** — respostas em streaming via Gemini
- **Fé e valores** — o JARVIS sabe que o Cleilson é cristão evangélico: respeita a fé, cita a Bíblia na **NVI** com referência (sem inventar versículos) e não sugere práticas que conflitem com ela
- **Finanças (FinPlan)** — "quanto está a fatura do Nubank?", "qual meu saldo do mês?", "quanto de limite tenho no Santander?" (somente leitura, ver [Integração FinPlan](#integração-finplan))
- **Pesquisa na web** — Google Search integrado (perguntas sobre clima, notícias, cotações…)
- **Visão** — envie fotos ou use a **câmera ao vivo** ("JARVIS, o que você vê?"; `/camera` liga/desliga)
- **Memória persistente** — lembra preferências e fatos entre conversas
- **Ferramentas do sistema** — comandos, apps e arquivos (conforme o [`TOOLS_MODE`](#modos-de-ferramentas-tools_mode))
- **Upload de documentos** — PDF, TXT, MD, JS, PY, JSON, CSV + imagens, com drag & drop

### Voz
- **Wake word "JARVIS"** — fala natural com pausas (funciona no Android, que corta a escuta a cada pausa)
- **Voz masculina (Algenib)** — gerada pelo Gemini e tocada em streaming: começa a falar em ~1,5s
- **Reserva automática** — se a voz do Gemini falhar (limite, rede), usa a voz do navegador
- **Valores falados corretamente** — "zero reais", "um real", "1810 reais e 35 centavos"

### Lembretes
- **Notificações push** — chegam no horário mesmo com o app fechado e a tela bloqueada, com botões **Concluir** e **Adiar 10 min**
- **Estados** — pendente → avisado → concluído (só conclui quando você confirma)
- **Agenda** — card no dashboard e sininho no topo, agrupados em *Atrasados / Hoje / Amanhã / datas*; o número do sininho conta só atrasados e de hoje
- **Lembretes perdidos** — ao abrir o app, aparecem como "Lembrete atrasado" até você agir

### Interface
- **Reator do JARVIS** — núcleo animado (anéis, partículas) que reflete o estado: **Online · Aguardando "JARVIS" · Ouvindo · Processando · Falando**
  - No dashboard, é o fundo atrás dos cards (arrastável e redimensionável; tocar nele liga o microfone)
  - Na conversa, fica apagado ao fundo; na tela de fala, aparece inteiro
  - **Destacável em janela própria** para outro monitor (duplo clique: tela cheia), sincronizado com a janela principal
- **Dashboard HUD** — cards em vidro: relógio, lembretes, CPU/RAM/disco (gauges + sparklines), **versículo do dia (NVI)** com botão "Ouvir", ações rápidas e sistema
  - Arrastar pelo cabeçalho, redimensionar pelo canto, minimizar, destacar em janela; "Restaurar layout" volta ao padrão
- **5 temas** — Jarvis, Iron Man, Hulk, Thor, Gold (o reator segue a cor do tema)
- **PWA** — instale como app no celular (Android/iOS)

### Segurança
- **Login por senha** com sessões persistentes (sobrevivem a deploys), tokens guardados só como hash, cookie `Secure` atrás do HTTPS
- **Limite de tentativas** — 5 senhas erradas por IP a cada 15 min
- **Modo seguro no servidor** — sem terminal nem apps; arquivos só numa pasta isolada
- **App roda sem root** na VPS

## Como rodar

### Local (desenvolvimento)

```bash
npm install
npm run dev     # compila o CSS, recompila ao editar e reinicia o servidor ao mudar o backend
```

Acesse: **http://localhost:3000**. Mudanças no `.env` exigem reiniciar o `npm run dev`.

### Variáveis de ambiente (`.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `GEMINI_API_KEY` | sim | Chave do Gemini (chat, visão e voz) |
| `PORT` | não | Porta (padrão 3000) |
| `JARVIS_PASSWORD` | produção | Ativa o login; sem ela o acesso é livre (uso local) |
| `TOOLS_MODE` | não | `full` (PC local) ou `safe` (padrão) |
| `JARVIS_FILES_DIR` | não | Pasta acessível no modo `safe` (padrão `~/jarvis-files`) |
| `FINPLAN_URL` / `FINPLAN_API_TOKEN` | não | Ativam a consulta de finanças |
| `TTS_PROVIDER` | não | `browser` desliga a voz do Gemini |
| `TTS_VOICE` / `TTS_MODEL` | não | Voz (padrão `Algenib`) e modelo (padrão `gemini-3.1-flash-tts-preview`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | não | Chaves do push; se ausentes, são geradas uma vez e guardadas no banco |
| `JARVIS_DB` | não | Caminho de outro banco SQLite (útil para testes) |

### Modos de ferramentas (`TOOLS_MODE`)

| Modo | Onde usar | O que o JARVIS pode fazer |
|------|-----------|---------------------------|
| `full` | PC local | Executar comandos, abrir apps, ler/escrever qualquer arquivo |
| `safe` (padrão) | Servidor na internet | Sem terminal nem apps; ler/escrever/listar só dentro de `JARVIS_FILES_DIR` |

Se a variável não estiver definida, vale `safe`: um servidor mal configurado nunca fica aberto.

### Deploy

```bash
git push
./scripts/deploy.sh
```

O script confere se tudo foi commitado e enviado; na VPS faz pull, instala dependências (se mudaram), compila o CSS, reinicia e testa se o site respondeu. Detalhes e organização da VPS em [DEPLOY.md](DEPLOY.md).

## Integração FinPlan

O JARVIS consulta o [FinPlan](https://finplanai.nogueiradev.com) (app de finanças do Cleilson) por uma rota **somente leitura**:

- **FinPlan:** `GET /api/integrations/jarvis` — protegida por `Authorization: Bearer <JARVIS_INTEGRATION_TOKEN>` e presa a um usuário (`JARVIS_INTEGRATION_USER_ID`); limite de requisições; responde 404 se não estiver configurada. Não grava nada no banco.
- **JARVIS:** ferramenta `consultar_financas`, ativa quando `FINPLAN_URL` e `FINPLAN_API_TOKEN` estão definidos (o token é o mesmo nos dois apps).
- **Dados:** saldo do mês (receitas − despesas − investimentos), totais do mês, cartões com fatura do mês e do próximo (valor, status, fechamento, vencimento), limite disponível e últimas transações.
- **Privacidade:** os valores consultados passam pelo Gemini para montar a resposta.

## Slash Commands

Digite `/` no chat para ver o autocomplete.

| Comando | Descrição |
|---------|-----------|
| `/help` | Lista todos os comandos |
| `/sistema` | Mostra informações do sistema |
| `/monitor` | Abre/fecha o monitor ao vivo (CPU, RAM, disco) |
| `/lembretes` | Lista lembretes de hoje |
| `/lembrete HH:MM texto` | Cria um lembrete rápido |
| `/clima` | Mostra o clima atual (via IA) |
| `/ip` | Mostra seu IP público |
| `/memorias` | Lista memórias salvas do JARVIS |
| `/camera` | Liga/desliga a câmera (visão ao vivo) |
| `/limpar` | Limpa o chat |

## Comandos por Voz

1. Toque no microfone (ou no reator do dashboard) para ativar a escuta
2. Diga **"JARVIS"** seguido do comando: _"JARVIS, quanto está a fatura do Nubank?"_
3. Ou diga **"JARVIS"** sozinho e fale o comando em seguida
4. Pode fazer pausas: o comando é enviado após ~2s de silêncio
5. Enquanto o JARVIS responde o microfone fica desligado; depois ele volta a ouvir sozinho
6. Toque no microfone novamente para desativar

| Microfone | Reator | Estado |
|-----------|--------|--------|
| Verde pulsando | Aguardando "JARVIS" | Esperando a palavra de ativação |
| Vermelho | Ouvindo | Capturando seu comando |
| — | Processando / Falando | Gerando e lendo a resposta |
| Cinza | Online | Desativado |

## Atalhos

- **Enter** — enviar mensagem · **Shift+Enter** — nova linha · **Escape** — fecha autocomplete/painéis
- **Microfone** — ativar/desativar wake word · **Câmera** — visão ao vivo · **Clip** — enviar documento/imagem
- **Sininho** — agenda de lembretes · **Alto-falante** — ligar/desligar voz · **Sol** — trocar tema
- **Logo JARVIS** — nova conversa (dashboard)

## Estrutura do Projeto

```
JARVIS/
├── server.js                # Entry point + auth middleware
├── src/
│   ├── auth.js              # Login, sessões persistentes (hash), limite de tentativas
│   ├── database.js          # SQLite: tabelas, migrações e prepared statements
│   ├── routes.js            # Rotas da API + Gemini (chat, ferramentas, pesquisa) + system prompt
│   ├── tools.js             # Ferramentas do Gemini (sistema, arquivos, lembretes, memória, finanças)
│   ├── push.js              # Web Push + agendador de lembretes
│   ├── tts.js               # Voz do servidor (Gemini TTS em streaming)
│   └── finplan.js           # Cliente da integração FinPlan
├── scripts/deploy.sh        # Deploy na VPS via git (pull + build + restart + health check)
├── styles/tailwind.css      # Entrada do Tailwind (gera public/tailwind.css)
├── tailwind.config.js       # Config do Tailwind (cores, animações)
├── public/
│   ├── index.html           # Interface principal
│   ├── widget.html          # Card ou reator destacado em janela própria
│   ├── login.html           # Tela de login
│   ├── app.js               # Entry point frontend: envio de mensagens, streaming, autocomplete
│   ├── style.css            # Estilos: HUD, reator, agenda, câmera, markdown, mobile
│   ├── sw.js                # Service Worker (cache offline + push notifications)
│   ├── manifest.json        # PWA manifest
│   ├── icons/               # Ícones PWA (SVG) e das notificações (PNG)
│   └── js/
│       ├── core.js          # Reator do JARVIS (fundo, conversa, janela destacada)
│       ├── tts.js           # Fala: voz do servidor + reserva do navegador
│       ├── stt.js           # Reconhecimento de voz + wake word "JARVIS"
│       ├── chat.js          # UI do chat (mensagens, typing indicator)
│       ├── sidebar.js       # Sidebar e conversas
│       ├── upload.js        # Upload de documentos + imagens + drag & drop
│       ├── camera.js        # Câmera ao vivo e detecção de "o que você vê?"
│       ├── commands.js      # Slash commands
│       ├── dashboard.js     # Layout do dashboard: arrastar, redimensionar, minimizar, destacar
│       ├── widgets.js       # Cards do dashboard (markup + dados ao vivo)
│       ├── widget-page.js   # Página da janela destacada
│       ├── agenda.js        # Agenda de lembretes (card + painel do sininho)
│       ├── reminders.js     # Push, cards de lembrete e sininho
│       ├── verses.js        # Versículos do dia (NVI)
│       └── theme.js         # 5 temas + cores dinâmicas
├── jarvis.db                # Banco SQLite (criado automaticamente, fora do git)
├── .env                     # Chaves e configurações (fora do git)
├── DEPLOY.md                # Guia de deploy e organização da VPS
└── package.json
```

## Como criar um novo módulo

### Frontend (public/js/)

1. Crie o arquivo em `public/js/nome-do-modulo.js`
2. Use `export` para expor funções/variáveis que outros módulos precisam:
   ```js
   // public/js/meu-modulo.js
   export function minhaFuncao() {
     // ...
   }
   ```
3. Importe em `public/app.js` ou em outro módulo que precise:
   ```js
   import { minhaFuncao } from "./js/meu-modulo.js";
   ```
4. Se o módulo não exporta nada (só inicializa listeners), importe sem destructuring:
   ```js
   import "./js/meu-modulo.js";
   ```
5. Adicione o arquivo à lista `STATIC_ASSETS` em `public/sw.js` e incremente `CACHE_NAME`

### Backend (src/)

1. Crie o arquivo em `src/nome-do-modulo.js`
2. Use `module.exports` para exportar:
   ```js
   // src/meu-modulo.js
   function minhaFuncao() {
     // ...
   }
   module.exports = { minhaFuncao };
   ```
3. Importe onde precisar com `require`:
   ```js
   const { minhaFuncao } = require("./meu-modulo");
   ```
4. Para novas rotas, adicione dentro da função `register(app)` em `src/routes.js`, ou crie um módulo com seu próprio `register(app)` (como `src/tts.js`) e chame-o de lá.

### Adicionando um novo card no dashboard

Em `public/js/widgets.js`, adicione ao objeto `WIDGETS` e inclua o id em `DEFAULT_ORDER`:
```js
meucard: { title: "Meu card", w: 4, md: 6, render: () => card("meucard", "X-01", "Meu card", "bolt", `<p>conteúdo</p>`) },
```
`w` é a largura em colunas (de 12) no desktop; `md`, no tablet. Para lógica após renderizar, use `mount: (el) => { ... }`.

### Adicionando um novo slash command

Em `public/js/commands.js`, adicione ao objeto `COMMANDS`:
```js
"/meucomando": {
  description: "Descrição do comando",
  handler: minhaFuncao,       // Execução local
  // ou
  forward: "Texto para a IA",  // Encaminha para o Gemini
},
```
