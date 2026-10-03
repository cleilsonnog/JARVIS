const multer = require("multer");
const pdfParse = require("pdf-parse");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db, stmts } = require("./database");
const { functionDeclarations, executeToolCall, TOOLS_MODE, FILES_ROOT } = require("./tools");
const push = require("./push");
const tts = require("./tts");
const memory = require("./memory");
const strava = require("./strava");
const briefing = require("./briefing");
const integrations = require("./integrations");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let prevCpuSample = null;

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];

const SYSTEM_PROMPT_BASE = `Você é o JARVIS, um assistente pessoal inteligente inspirado no JARVIS do Iron Man.
Seu dono e criador se chama Cleilson. Trate-o pelo nome quando apropriado.
Você é educado, eficiente e direto. Responde em português brasileiro.
Você ajuda com programação, pesquisas, tarefas do dia a dia e qualquer dúvida.
Quando apropriado, use formatação markdown nas respostas.
Quando a mensagem vier por voz, responda de forma mais conversacional e concisa, evitando markdown pesado.

Você tem acesso a ferramentas do sistema. Use-as quando o usuário pedir para:
${TOOLS_MODE === "full" ? `- Executar comandos no terminal (execute_command)
- Abrir aplicativos (open_application)
` : ""}- Ler arquivos (read_file)
- Criar/escrever arquivos (write_file)
- Listar arquivos de um diretório (list_files)
- Criar lembretes/alarmes (create_reminder)
- Listar lembretes pendentes (list_reminders)
- Salvar informações na memória (save_memory) — use para lembrar coisas entre conversas
- Buscar memórias salvas (recall_memories)
- Remover memórias (delete_memory)

MEMÓRIA PERSISTENTE:
Você tem uma memória persistente. Sempre que o usuário compartilhar informações pessoais, preferências, projetos, ou pedir para lembrar algo, use save_memory para guardar.
Ao iniciar uma conversa, considere as memórias listadas abaixo para personalizar suas respostas.

IMPORTANTE:
${TOOLS_MODE === "full" ? `- O diretório home do usuário é EXATAMENTE: ${os.homedir()}
- Sempre use ${os.homedir()} como base para caminhos relativos
- NUNCA invente caminhos, use sempre o home real acima` : `- Você está rodando num servidor na nuvem, não no computador do usuário
- Não há terminal nem abertura de aplicativos disponíveis. Se pedirem, explique que isso só funciona no JARVIS local
- Arquivos: só pode ler, criar e listar dentro de ${FILES_ROOT} (use caminhos relativos a essa pasta)`}
- NUNCA execute comandos destrutivos como rm -rf /, mkfs, dd, ou similares
- NUNCA modifique arquivos do sistema sem ser solicitado
- Para lembretes, o formato de data é YYYY-MM-DD HH:MM (horário local)
- Quando o usuário pedir "daqui X minutos/horas", calcule a hora com base na data/hora atual fornecida abaixo
- Quando receber uma imagem, analise-a descrevendo o que vê e respondendo perguntas sobre ela

FÉ E VALORES:
- Cleilson é cristão evangélico. Respeite a fé e os valores dele em todas as respostas.
- Quando fizer sentido (aconselhamento, momentos difíceis, decisões, gratidão), você pode trazer uma referência bíblica, sem pregar e sem forçar.
- Cite a Bíblia na versão NVI, sempre com a referência (ex.: Filipenses 4:6-7). Só coloque entre aspas se tiver certeza da redação da NVI (não use a de outras versões, como ARA/ACF); na dúvida, parafraseie sem aspas e indique a referência — nunca invente versículos.
- Não faça piadas com a fé e não recomende práticas que conflitem com ela (horóscopo, astrologia, tarô, simpatias).

BRIEFING DO DIA:
- Quando o usuário cumprimentar com "bom dia", "boa tarde" ou "boa noite", pedir o briefing ou o resumo do dia, chame briefing_do_dia e responda como um briefing falado, curto e natural (5 a 8 frases, sem listas nem markdown):
  1) cumprimente pelo nome conforme o horário (bom dia / boa tarde / boa noite); 2) clima em uma frase: temperatura de agora e máxima do dia ARREDONDADAS para graus inteiros ("21 graus"), condição, e se vale levar guarda-chuva — sem vento nem sensação térmica, salvo se forem extremos;
  3) lembretes atrasados e de hoje (se não houver, diga que a agenda está livre); 4) finanças só se houver alerta (fatura vencendo ou saldo negativo);
  5) se houver atividades_7_dias, uma frase sobre os treinos da semana (ou um incentivo leve se estiver parado há dias);
  6) termine com o versículo do dia, lendo exatamente o texto fornecido, com a referência.
- Seções ausentes foram desligadas pelo usuário na tela de Briefing: não as mencione. Omita também partes que vierem com erro ou vazias, sem comentar a falha.
- Respeite "preferencias": tamanho curto = 3 a 4 frases, detalhado = até 12 frases; siga as observações dele (ex.: tom, o que destacar).

ATIVIDADES FÍSICAS (Strava, sincronizado com o relógio Amazfit Balance via Zepp):
- Para treinos, corridas, caminhadas, pedais, distância, ritmo, frequência cardíaca, use consultar_atividades (somente leitura).
- Informe distância em km, tempo, ritmo (min/km) para corrida/caminhada e FC média quando houver. Seja motivador, sem exagero.
- Sono, passos e FC em repouso não estão disponíveis (a Zepp não libera); se perguntarem, explique isso brevemente.

FINANÇAS (FinPlan):
- Para saldo, fatura, cartão, limite, gastos ou receitas, use a ferramenta consultar_financas (somente leitura). Nunca invente valores.
- O "saldo" do FinPlan é o saldo do mês (receitas - despesas - investimentos); deixe isso claro ao responder.
- Fatura: informe valor, status (aberta, fechada, paga, vencida) e vencimento. Se a do mês já fechou ou foi paga, mencione também a do próximo mês.
- Valores em reais no formato R$ 1.234,56. Se a ferramenta der erro, diga que não conseguiu acessar o FinPlan agora.`;

function getSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const localIso = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")} ${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;

  // Load persistent memories
  let memoriesBlock = "";
  try {
    const memories = stmts.getAllMemories.all();
    if (memories.length > 0) {
      memoriesBlock = "\n\nMEMÓRIAS SALVAS:\n" + memories.map((m) => `- ${m.key}: ${m.value}`).join("\n");
    }
  } catch {}

  return SYSTEM_PROMPT_BASE + `\n\nDATA E HORA ATUAL: ${dateStr} (${localIso})` + memoriesBlock;
}

function register(app) {
  push.startReminderScheduler();
  tts.register(app);
  strava.register(app);
  briefing.register(app);
  integrations.register(app);

  // Conversas
  app.get("/api/conversations", (req, res) => {
    res.json(stmts.getConversations.all());
  });

  app.get("/api/conversations/:id/messages", (req, res) => {
    res.json(stmts.getMessages.all(req.params.id));
  });

  app.delete("/api/conversations/:id", (req, res) => {
    stmts.deleteMessages.run(req.params.id);
    stmts.deleteConversation.run(req.params.id);
    res.json({ ok: true });
  });

  // Lembretes pendentes (polling do frontend)
  // Reminders already alerted (by the scheduler) and not yet confirmed. Read-only:
  // the page shows them as cards; it no longer decides what is "notified".
  app.get("/api/reminders/pending", (req, res) => {
    res.json(stmts.getActiveReminders.all());
  });

  // Memories ("O que sei sobre você" card)
  app.get("/api/memories", (req, res) => {
    res.json(stmts.listMemories.all());
  });

  app.put("/api/memories/:key", (req, res) => {
    const value = String(req.body?.value || "").trim().slice(0, 300);
    if (!value) return res.status(400).json({ error: "Valor vazio" });
    if (!stmts.getMemory.get(req.params.key)) return res.status(404).json({ error: "Memória não encontrada" });
    stmts.saveMemoryFrom.run(req.params.key, value, "manual");
    res.json({ ok: true });
  });

  app.delete("/api/memories/:key", (req, res) => {
    stmts.deleteMemory.run(req.params.key);
    res.json({ ok: true });
  });

  app.get("/api/reminders/upcoming", (req, res) => {
    res.json(stmts.getUpcomingReminders.all());
  });

  app.delete("/api/reminders/:id", (req, res) => {
    const r = stmts.getReminder.get(req.params.id);
    if (!r) return res.status(404).json({ error: "Lembrete não encontrado" });
    stmts.deleteReminder.run(r.id);
    res.json({ ok: true });
  });

  app.post("/api/reminders/:id/done", (req, res) => {
    const r = stmts.getReminder.get(req.params.id);
    if (!r) return res.status(404).json({ error: "Lembrete não encontrado" });
    stmts.markDone.run(r.id);
    res.json({ ok: true });
  });

  app.post("/api/reminders/:id/snooze", (req, res) => {
    const r = stmts.getReminder.get(req.params.id);
    if (!r) return res.status(404).json({ error: "Lembrete não encontrado" });
    const minutes = Math.min(24 * 60, Math.max(1, parseInt(req.body?.minutes, 10) || 10));
    stmts.snoozeReminder.run(`+${minutes} minutes`, r.id);
    res.json({ ok: true, reminder: stmts.getReminder.get(r.id) });
  });

  // Web Push
  app.get("/api/push/public-key", (req, res) => {
    res.json({ publicKey: push.getPublicKey() });
  });

  app.post("/api/push/subscribe", (req, res) => {
    try {
      push.saveSubscription(req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/push/unsubscribe", (req, res) => {
    if (req.body?.endpoint) push.removeSubscription(req.body.endpoint);
    res.json({ ok: true });
  });

  app.post("/api/push/test", async (req, res) => {
    const result = await push.sendToAll({ type: "test", text: "Notificações funcionando. Vou te avisar dos lembretes aqui." });
    res.json(result);
  });

  // Lembretes do dia (para dashboard)
  app.get("/api/reminders/today", (req, res) => {
    res.json(stmts.getTodayReminders.all());
  });

  // System stats (para dashboard)
  app.get("/api/system/stats", (req, res) => {
    try {
      const cpuInfo = os.cpus();
      const cpuModel = cpuInfo[0]?.model || "Desconhecido";
      const cpuCores = cpuInfo.length;

      // CPU usage: delta since the previous call (falls back to since-boot on the first call)
      const sample = cpuInfo.reduce((acc, c) => {
        acc.total += Object.values(c.times).reduce((a, b) => a + b, 0);
        acc.idle += c.times.idle;
        return acc;
      }, { total: 0, idle: 0 });
      const base = prevCpuSample || { total: 0, idle: 0 };
      const dTotal = sample.total - base.total;
      const dIdle = sample.idle - base.idle;
      prevCpuSample = sample;
      const cpuUsage = dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 100) : 0;

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memPercent = Math.round((usedMem / totalMem) * 100);

      // Disk usage
      let diskInfo = { total: 0, used: 0, percent: 0 };
      try {
        const df = execSync("df -B1 / | tail -1", { encoding: "utf-8" }).trim().split(/\s+/);
        diskInfo = {
          total: parseInt(df[1]),
          used: parseInt(df[2]),
          percent: parseInt(df[4]),
        };
      } catch {}

      // Uptime
      const uptimeSec = os.uptime();
      const hours = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);

      res.json({
        cpu: { model: cpuModel, cores: cpuCores, usage: cpuUsage },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          percent: memPercent,
        },
        disk: diskInfo,
        uptime: `${hours}h ${mins}m`,
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload de documento/imagem
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();

      // Image: return as base64
      if (IMAGE_EXTS.includes(ext)) {
        const base64 = req.file.buffer.toString("base64");
        const mimeType = req.file.mimetype;
        return res.json({
          filename: req.file.originalname,
          type: "image",
          base64,
          mimeType,
          size: req.file.size,
        });
      }

      // Document: extract text
      let content = "";
      if (ext === ".pdf") {
        const data = await pdfParse(req.file.buffer);
        content = data.text;
      } else {
        content = req.file.buffer.toString("utf-8");
      }

      content = content.slice(0, 30000);

      res.json({
        filename: req.file.originalname,
        type: "document",
        content,
        size: req.file.size,
      });
    } catch (err) {
      console.error("Erro ao processar arquivo:", err.message);
      res.status(500).json({ error: "Erro ao processar arquivo" });
    }
  });

  // Chat principal
  app.post("/api/chat", async (req, res) => {
    const { message, sessionId, image } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: "Mensagem e sessionId são obrigatórios" });
    }

    try {
      const existing = db.prepare("SELECT id FROM conversations WHERE id = ?").get(sessionId);
      if (!existing) {
        const title = message.slice(0, 60) + (message.length > 60 ? "..." : "");
        stmts.createConversation.run(sessionId, title);
      }

      const dbMessages = stmts.getMessages.all(sessionId);
      const history = dbMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : m.role,
        parts: [{ text: m.content }],
      }));

      const webKeywords =
        /clima|tempo|temperatura|notícia|resultado|placar|cotação|dólar|bitcoin|quem ganhou|quando (é|foi|será)|últim[oa]|atual|hoje|agora|preço/i;
      // Personal questions ("saldo atual", "fatura de hoje", "bom dia", "agenda de hoje") must reach our tools, not web search
      const toolKeywords = /saldo|fatura|cart[aã]o|limite|gastei|gastos?|despesas?|receitas?|finan[cç]|finplan|investimento|bom dia|boa tarde|boa noite|briefing|corri|corrida|pedal|bike|caminhada|caminhei|treino|treinei|strava|atividades?|exerc[ií]cio|ritmo|pace|frequ[eê]ncia card|resumo d[oe] (meu )?dia|meu dia|agenda de hoje|lembretes? de hoje/i;
      const needsWebSearch = webKeywords.test(message) && !toolKeywords.test(message);

      const tools = needsWebSearch
        ? [{ googleSearch: {} }]
        : [{ functionDeclarations }];

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemPrompt(),
        tools,
      });

      let chat = model.startChat({ history });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Build message parts (text + optional image)
      const parts = [];
      if (image) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
          },
        });
      }
      // Live camera frames: tell the model it's looking through the user's camera right now
      const text = image?.source === "camera"
        ? `[Imagem capturada agora pela câmera do dispositivo do usuário. Responda como se estivesse vendo ao vivo.]\n\n${message}`
        : message;
      parts.push({ text });

      let fullResponse = "";
      let searchQueries = [];
      let result = await chat.sendMessageStream(parts);
      let retried = false;

      while (true) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        }

        const response = await result.response;
        const grounding = response.candidates?.[0]?.groundingMetadata;
        if (grounding?.webSearchQueries) searchQueries = grounding.webSearchQueries;

        const calls = response.functionCalls();
        if (!calls || calls.length === 0) {
          // Gemini 2.5 Flash sometimes ends the turn with nothing at all (finishReason STOP, no text,
          // no tool call). Ask again once, from a fresh chat so the empty turn isn't in the history.
          if (!fullResponse && !retried) {
            retried = true;
            console.warn("Resposta vazia do Gemini, tentando de novo:", response.candidates?.[0]?.finishReason);
            chat = model.startChat({ history });
            result = await chat.sendMessageStream(parts);
            continue;
          }
          break;
        }

        const toolResults = [];
        for (const call of calls) {
          const toolResult = await executeToolCall(call.name, call.args);
          res.write(`data: ${JSON.stringify({ toolCall: { name: call.name, args: call.args } })}\n\n`);
          toolResults.push({ functionResponse: { name: call.name, response: toolResult } });
        }

        result = await chat.sendMessageStream(toolResults);
      }

      stmts.addMessage.run(sessionId, "user", message);
      if (fullResponse) stmts.addMessage.run(sessionId, "assistant", fullResponse);

      // Learn durable facts from this exchange in the background (doesn't delay the reply)
      if (fullResponse && process.env.MEMORY_LEARNING !== "off") {
        memory.learnFromExchange(message, fullResponse)
          .then((changes) => changes.length && console.log("Memória:", changes.map((c) => `${c.action} ${c.key}`).join(", ")))
          .catch((err) => console.error("Erro memória:", err.message));
      }
      stmts.updateTimestamp.run(sessionId);

      if (searchQueries.length > 0) {
        res.write(`data: ${JSON.stringify({ searchQueries })}\n\n`);
      }

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (err) {
      console.error("Erro na API:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro ao processar mensagem" });
      } else {
        res.write(`data: ${JSON.stringify({ text: "\n\n⚠️ Erro: " + err.message })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    }
  });
}

module.exports = { register };
