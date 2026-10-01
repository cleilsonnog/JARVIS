# J.A.R.V.I.S.
### Just A Rather Very Intelligent System

Assistente pessoal com IA inspirado no JARVIS do Iron Man. Criado por **Cleilson**.

**Live:** [https://cleilsonagente.duckdns.org](https://cleilsonagente.duckdns.org)

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Frontend | HTML + Tailwind CSS + JS (ES Modules) |
| LLM | Google Gemini 2.5 Flash (texto + visão) |
| Banco | SQLite (better-sqlite3) |
| Upload | multer + pdf-parse |
| Deploy | VPS Contabo + PM2 + Nginx + Let's Encrypt |
| Mobile | PWA (installável no celular) |

## Funcionalidades

- **Chat com IA** — respostas em streaming via Gemini
- **Visão (imagens)** — envie fotos e pergunte sobre elas (Gemini Vision)
- **Câmera ao vivo** — "JARVIS, o que você vê?" liga a câmera e analisa a cena; com a câmera aberta, toda mensagem leva o quadro atual (`/camera` liga/desliga)
- **Pesquisa na web** — Google Search integrado
- **Wake word "JARVIS"** — diga "JARVIS" para ativar sem tocar na tela
- **Comando por voz** — fale com o JARVIS (STT contínuo)
- **Resposta por voz** — JARVIS fala com animação visual (modo voz-first)
- **Slash commands** — atalhos rápidos: `/sistema`, `/monitor`, `/lembrete`, etc.
- **System monitor** — painel ao vivo com CPU, RAM, disco (atualiza a cada 3s)
- **Dashboard** — relógio, stats do sistema, lembretes do dia na tela inicial
- **Memória persistente** — JARVIS lembra preferências e fatos entre conversas
- **Controle do sistema** — executar comandos, abrir apps
- **Gerenciamento de arquivos** — ler, criar, listar arquivos
- **Histórico persistente** — conversas salvas em SQLite
- **Lembretes visuais** — cards flutuantes com minimizar/fechar + voz
- **Upload de documentos** — PDF, TXT, MD, JS, PY, JSON, CSV + imagens
- **Drag & drop** — arraste arquivos/imagens direto no chat
- **5 Temas** — Jarvis, Iron Man, Hulk, Thor, Gold
- **Background futurista** — grid holográfico, partículas, scan line, cantos HUD
- **PWA** — instale como app no celular (Android/iOS)
- **Autenticação** — protegido por senha (cookie de sessão 30 dias)
- **HTTPS/SSL** — certificado Let's Encrypt com renovação automática

## Como rodar

### Local (desenvolvimento)

```bash
# Instalar dependências
npm install

# Configurar .env
GEMINI_API_KEY=sua_chave_aqui
PORT=3000
TOOLS_MODE=full   # libera terminal, apps e todo o sistema de arquivos (só na sua máquina!)

# Iniciar
npm start

# Ou em modo dev (auto-reload)
npm run dev
```

Acesse: **http://localhost:3000**

### VPS (produção)

```bash
# Configurar .env
GEMINI_API_KEY=sua_chave_aqui
JARVIS_PASSWORD=sua_senha_segura
PORT=3000
NODE_ENV=production
TOOLS_MODE=safe   # padrão: sem terminal/apps, arquivos só em ~/jarvis-files
```

### Modos de ferramentas (`TOOLS_MODE`)

| Modo | Onde usar | O que o JARVIS pode fazer |
|------|-----------|---------------------------|
| `full` | PC local | Executar comandos, abrir apps, ler/escrever qualquer arquivo |
| `safe` (padrão) | Servidor na internet | Sem terminal nem apps; ler/escrever/listar só dentro de `JARVIS_FILES_DIR` (padrão `~/jarvis-files`) |

Se a variável não estiver definida, vale `safe`: um servidor mal configurado nunca fica aberto.

Veja o guia completo em [DEPLOY.md](DEPLOY.md).

## Autenticação

A autenticação é ativada quando `JARVIS_PASSWORD` está definido no `.env`:

- **Com senha:** todas as rotas são protegidas, redireciona para tela de login
- **Sem senha:** acesso livre (ideal para uso local)
- **Sessão:** cookie httpOnly com validade de 30 dias
- **API:** retorna 401 para requisições não autenticadas

## Slash Commands

Digite `/` no chat para ver o autocomplete. Comandos disponíveis:

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

### Wake Word
1. Clique no mic uma vez para ativar a escuta
2. Diga **"JARVIS"** seguido do comando: _"JARVIS, que horas são?"_
3. Ou diga **"JARVIS"** sozinho e fale o comando em seguida
4. Após responder, o JARVIS volta a ouvir automaticamente
5. Clique no mic novamente para desativar

### Indicadores do Microfone
| Cor | Estado |
|-----|--------|
| Verde pulsando | Ouvindo, esperando wake word "JARVIS" |
| Vermelho | Capturando seu comando |
| Cinza | Desativado |

## Interface

- **Logo JARVIS** no header — volta para o dashboard
- **Sidebar** — escondida por padrão, abre pelo menu hamburger
- **Dashboard HUD** — cards arrastáveis pelo cabeçalho (relógio, CPU/RAM/Disco com gauges e sparklines, lembretes, ações rápidas, sistema); redimensionáveis pelo canto inferior direito, minimizáveis e destacáveis em janela própria (pra levar a outro monitor); layout salvo no navegador, "Restaurar layout" volta ao padrão
- **Modo voz-first** — animação visual enquanto fala (botão "Ver texto" para ver a resposta)
- **Cards de lembrete** — cards flutuantes com minimizar/fechar
- **System monitor** — `/monitor` abre painel ao vivo que atualiza a cada 3s
- **Autocomplete** — ao digitar `/`, mostra sugestões de comandos
- **PWA** — instalável como app nativo no celular

## Atalhos

- **Enter** — enviar mensagem
- **Shift+Enter** — nova linha
- **Escape** — fecha autocomplete
- **Microfone** — ativar/desativar wake word
- **Clip** — enviar documento/imagem
- **Drag & drop** — arrastar arquivo na área do chat
- **Alto-falante** — ligar/desligar voz
- **Sol** — trocar tema
- **Logo JARVIS** — nova conversa (dashboard)

## Estrutura do Projeto

```
JARVIS/
├── server.js                # Entry point + auth middleware
├── src/
│   ├── auth.js              # Autenticação (login, sessão, cookie)
│   ├── database.js          # SQLite: tabelas + prepared statements + memories
│   ├── tools.js             # Ferramentas do sistema + memória persistente
│   └── routes.js            # Rotas da API + Gemini + system stats
├── scripts/deploy.sh        # Deploy na VPS via git (pull + build + restart + health check)
├── styles/tailwind.css      # Entrada do Tailwind (gera public/tailwind.css)
├── tailwind.config.js       # Config do Tailwind (cores, animações)
├── public/
│   ├── index.html           # Interface principal (Tailwind + background HUD)
│   ├── widget.html          # Card do dashboard destacado em janela própria
│   ├── login.html           # Tela de login
│   ├── app.js               # Entry point frontend + submit + slash commands
│   ├── style.css            # Estilos: markdown, animações, background, mobile
│   ├── sw.js                # Service Worker (PWA offline cache)
│   ├── manifest.json        # PWA manifest (instalar como app)
│   ├── icons/               # Ícones PWA (SVG)
│   └── js/
│       ├── tts.js           # Text-to-Speech (Web Speech API)
│       ├── stt.js           # Speech-to-Text + wake word "JARVIS"
│       ├── chat.js          # UI do chat (mensagens, typing indicator)
│       ├── sidebar.js       # Sidebar, conversas, welcome screen
│       ├── upload.js        # Upload de documentos + imagens + drag & drop
│       ├── camera.js        # Câmera ao vivo: prévia, captura e detecção de "o que você vê?"
│       ├── commands.js      # Slash commands (/sistema, /monitor, etc.)
│       ├── dashboard.js     # Dashboard: layout, arrastar, redimensionar, minimizar, destacar
│       ├── widgets.js       # Cards do dashboard (markup + dados ao vivo)
│       ├── widget-page.js   # Página da janela destacada
│       ├── theme.js         # Sistema de 5 temas + cores dinâmicas
│       └── reminders.js     # Polling de lembretes + cards visuais
├── jarvis.db                # Banco SQLite (criado automaticamente)
├── .env                     # Chaves de API + senha
├── DEPLOY.md                # Guia de deploy na VPS
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
4. Para novas rotas, adicione dentro da função `register(app)` em `src/routes.js`, ou crie um novo arquivo de rotas e registre em `server.js`.

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
