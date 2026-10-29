# J.A.R.V.I.S.
### Just A Rather Very Intelligent System

Assistente pessoal com IA inspirado no JARVIS do Homem de Ferro, com voz, visão, lembretes e integrações. Funciona no navegador e como PWA no celular.

**Live:** [cleilsonagente.duckdns.org](https://cleilsonagente.duckdns.org)

## Funcionalidades

- **Configuração guiada** na primeira abertura: chave do Gemini e perfil (obrigatórios), o resto opcional
- **Chat com IA** em streaming, com pesquisa na web (Google Search) e function calling
- **Voz**: wake word "JARVIS", fala natural com pausas e resposta falada (Gemini TTS em streaming, com a voz do navegador como reserva)
- **Visão**: análise de imagens enviadas e câmera ao vivo
- **Lembretes** com notificação push (mesmo com o app fechado), edição e exclusão por chat, voz ou agenda
- **Briefing do dia**: clima, agenda, finanças, treinos, e-mails, notícias e versículo, falado e em cards
- **Memória persistente** que aprende fatos sobre o usuário automaticamente
- **Integrações** somente leitura: FinPlan (finanças), Treino.IA (academia), Strava (treinos), e-mail via IMAP, Open-Meteo (clima)
- **Dashboard HUD** com cards arrastáveis, monitor de sistema, reator animado e 5 temas
- **Ferramentas do sistema** (comandos, apps, arquivos) com modo seguro para servidor
- **Upload de documentos** (PDF, texto, código, CSV) e imagens

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Frontend | HTML + Tailwind CSS v3 + JS (ES Modules) |
| LLM | Google Gemini Flash (`gemini-3.6-flash`, configurável por `GEMINI_MODEL`; texto, visão, function calling) |
| Voz | Gemini TTS + Web Speech API |
| Banco | SQLite (better-sqlite3) |
| Notificações | Web Push (VAPID) |
| Deploy | VPS + PM2 + Nginx + Let's Encrypt |

## Como rodar

Requisitos: Node.js 20+ e uma conta Google (para a chave gratuita do Gemini).

```bash
git clone <url-do-repositorio> && cd JARVIS
npm install
npm run dev     # compila o CSS em modo watch e reinicia o servidor ao mudar o backend
```

Abra **http://localhost:3000** no Chrome. Na primeira vez, a tela de **Configuração** guia você:

1. **Chave do Gemini** (obrigatória): crie em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e cole na tela. Ela é testada e guardada criptografada.
2. **Seu perfil** (obrigatório): como o JARVIS deve te chamar e, se quiser, um texto sobre você e como prefere as respostas.
3. **Extras** (opcionais): voz, notificações, briefing, e-mail, integrações, senha.

Não é preciso criar `.env` para rodar no seu computador. A configuração pode ser reaberta pelo menu lateral, em **Configuração**. Em produção: `npm start`.

## Variáveis de ambiente (`.env`, todas opcionais)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `GEMINI_API_KEY` | não | Chave do Gemini; se definida, tem prioridade sobre a salva na tela de Configuração |
| `PORT` | não | Porta (padrão 3000) |
| `JARVIS_PASSWORD` | produção | Ativa o login; sem ela o acesso é livre |
| `TOOLS_MODE` | não | `full` (PC local: comandos, apps, arquivos) ou `safe` (padrão: sem terminal, arquivos só em `JARVIS_FILES_DIR`) |
| `JARVIS_FILES_DIR` | não | Pasta acessível no modo `safe` (padrão `~/jarvis-files`) |
| `JARVIS_SECRET` | não | Chave que criptografa os segredos salvos pela tela (chave do Gemini, senhas de e-mail); sem ela é criado `.jarvis-secret` (faça backup junto com o banco) |
| `JARVIS_CITY` | não | Cidade inicial do clima |
| `FINPLAN_URL` / `FINPLAN_API_TOKEN` | não | Ativam a integração com o FinPlan |
| `TREINOIA_URL` / `TREINOIA_API_TOKEN` | não | Ativam a integração com o Treino.IA |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | não | Ativam a integração com o Strava |
| `MEMORY_LEARNING` | não | `off` desliga o aprendizado automático de memórias |
| `TTS_PROVIDER` | não | `browser` desliga a voz do Gemini |
| `TTS_VOICE` / `TTS_MODEL` | não | Voz (padrão `Algenib`) e modelo de TTS |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | não | Chaves do push; geradas automaticamente se ausentes |
| `JARVIS_DB` | não | Caminho de outro banco SQLite (testes) |

## Estrutura

```
server.js        # Entry point + autenticação
src/             # Backend: rotas, Gemini, ferramentas, banco, push, TTS, integrações, briefing, memória
public/          # Frontend: index.html, app.js, service worker, PWA
public/js/       # Módulos do frontend: chat, voz, reator, dashboard, agenda, telas, temas
scripts/         # deploy.sh
styles/          # Entrada do Tailwind (gera public/tailwind.css)
```

## Deploy

```bash
git push
./scripts/deploy.sh   # pull na VPS, instala dependências, compila o CSS, reinicia e faz health check
```

Detalhes em [DEPLOY.md](DEPLOY.md).

## Segurança

- Login por senha, sessões guardadas como hash e limite de tentativas por IP
- Modo `safe` por padrão: um servidor mal configurado nunca expõe terminal ou arquivos
- Comandos destrutivos bloqueados; app roda sem root na VPS
- Integrações somente leitura; chave do Gemini e senhas de e-mail criptografadas (AES-256-GCM)

---

Criado por **Cleilson**.
