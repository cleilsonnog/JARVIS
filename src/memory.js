// ===== Memory that learns by itself =====
// After each reply, a short background call reads the exchange and decides whether it revealed
// a durable fact about the user worth keeping (or a correction / "esquece..."). Results go to
// the same `memories` table the system prompt already injects, marked source = "auto".

const { Type } = require("@google/genai");
const { stmts } = require("./database");
const { genAI, getProfile, GEMINI_MODEL } = require("./setup");

const MODEL = process.env.MEMORY_MODEL || GEMINI_MODEL;
const MIN_CHARS = 12;     // ignore "ok", "obrigado", etc.
const MAX_CHANGES = 3;    // per exchange
const MAX_VALUE = 300;

const schema = {
  type: Type.OBJECT,
  properties: {
    changes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ["save", "delete"] },
          key: { type: Type.STRING, description: "snake_case em português, curto e estável (ex.: esposa, igreja, time_de_futebol)" },
          value: { type: Type.STRING, description: "o fato, em uma frase curta (vazio para delete)" },
        },
        required: ["action", "key"],
      },
    },
  },
  required: ["changes"],
};

const instructions = (nome) => `Você é o módulo de memória de longo prazo do JARVIS, assistente pessoal de ${nome}.
Analise a troca abaixo e decida se ela revela FATOS DURADOUROS sobre ${nome} que valem ser lembrados em conversas futuras.

GUARDE (action "save"): pessoas da vida do usuário e o vínculo (família, amigos), comunidades e grupos que frequenta, preferências e gostos,
rotinas e hábitos, objetivos e projetos (ex.: apps que desenvolve), trabalho, datas importantes (aniversários), como prefere ser tratado.
ATUALIZE um fato existente reutilizando a MESMA key quando a informação mudar ou ficar mais completa.
APAGUE (action "delete") quando o usuário pedir para esquecer algo ou corrigir uma informação que deixou de ser verdade.

NÃO GUARDE: coisas passageiras (clima, saldo, faturas, lembretes — já têm sistema próprio), o que o JARVIS disse por conta própria,
perguntas genéricas, dados sensíveis (saúde, documentos, senhas, endereço, valores financeiros) a menos que o usuário peça explicitamente
para lembrar, nem nada que você esteja deduzindo sem ter sido dito.

Na dúvida, não guarde. A maioria das trocas não gera nenhuma mudança: responda {"changes": []}.
No máximo ${MAX_CHANGES} mudanças.`;

async function learnFromExchange(userMessage, assistantReply) {
  const text = String(userMessage || "").trim();
  if (text.length < MIN_CHARS || text.startsWith("/")) return [];

  const known = stmts.getAllMemories.all().slice(0, 80);
  const knownBlock = known.length ? known.map((m) => `- ${m.key}: ${m.value}`).join("\n") : "(nenhuma ainda)";

  const nome = getProfile().nome || "Usuário";
  const prompt = `${instructions(nome)}

MEMÓRIAS ATUAIS:
${knownBlock}

TROCA:
${nome}: ${text.slice(0, 2000)}
JARVIS: ${String(assistantReply || "").slice(0, 1500)}`;

  const result = await genAI().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 },
  });
  const { changes = [] } = JSON.parse(result.text);

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
