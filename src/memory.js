// ===== Memory that learns by itself =====
// After each reply, a short background call reads the exchange and decides whether it revealed
// a durable fact about the user worth keeping (or a correction / "esquece..."). Results go to
// the same `memories` table the system prompt already injects, marked source = "auto".

const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const { stmts } = require("./database");

const MODEL = process.env.MEMORY_MODEL || "gemini-2.5-flash";
const MIN_CHARS = 12;     // ignore "ok", "obrigado", etc.
const MAX_CHANGES = 3;    // per exchange
const MAX_VALUE = 300;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const schema = {
  type: SchemaType.OBJECT,
  properties: {
    changes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          action: { type: SchemaType.STRING, enum: ["save", "delete"] },
          key: { type: SchemaType.STRING, description: "snake_case em português, curto e estável (ex.: esposa, igreja, time_de_futebol)" },
          value: { type: SchemaType.STRING, description: "o fato, em uma frase curta (vazio para delete)" },
        },
        required: ["action", "key"],
      },
    },
  },
  required: ["changes"],
};

const INSTRUCTIONS = `Você é o módulo de memória de longo prazo do JARVIS, assistente pessoal do Cleilson.
Analise a troca abaixo e decida se ela revela FATOS DURADOUROS sobre o Cleilson que valem ser lembrados em conversas futuras.

GUARDE (action "save"): pessoas da vida dele e o vínculo (família, amigos, pastor), igreja e ministério, preferências e gostos,
rotinas e hábitos, objetivos e projetos (ex.: apps que desenvolve), trabalho, datas importantes (aniversários), como prefere ser tratado.
ATUALIZE um fato existente reutilizando a MESMA key quando a informação mudar ou ficar mais completa.
APAGUE (action "delete") quando ele pedir para esquecer algo ou corrigir uma informação que deixou de ser verdade.

NÃO GUARDE: coisas passageiras (clima, saldo, faturas, lembretes — já têm sistema próprio), o que o JARVIS disse por conta própria,
perguntas genéricas, dados sensíveis (saúde, documentos, senhas, endereço, valores financeiros) a menos que ele peça explicitamente
para lembrar, nem nada que você esteja deduzindo sem ele ter dito.

Na dúvida, não guarde. A maioria das trocas não gera nenhuma mudança: responda {"changes": []}.
No máximo ${MAX_CHANGES} mudanças.`;

async function learnFromExchange(userMessage, assistantReply) {
  const text = String(userMessage || "").trim();
  if (text.length < MIN_CHARS || text.startsWith("/")) return [];

  const known = stmts.getAllMemories.all().slice(0, 80);
  const knownBlock = known.length ? known.map((m) => `- ${m.key}: ${m.value}`).join("\n") : "(nenhuma ainda)";

  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 },
  });
  const prompt = `${INSTRUCTIONS}

MEMÓRIAS ATUAIS:
${knownBlock}

TROCA:
Cleilson: ${text.slice(0, 2000)}
JARVIS: ${String(assistantReply || "").slice(0, 1500)}`;

  const result = await model.generateContent(prompt);
  const { changes = [] } = JSON.parse(result.response.text());

  const applied = [];
  for (const c of changes.slice(0, MAX_CHANGES)) {
    const key = String(c.key || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
    if (!key) continue;
    if (c.action === "delete") {
      if (stmts.getMemory.get(key)) {
        stmts.deleteMemory.run(key);
        applied.push({ action: "delete", key });
      }
    } else if (c.value && c.value.trim()) {
      stmts.saveMemoryFrom.run(key, c.value.trim().slice(0, MAX_VALUE), "auto");
      applied.push({ action: "save", key, value: c.value.trim() });
    }
  }
  return applied;
}

module.exports = { learnFromExchange };
