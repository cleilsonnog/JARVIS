// ===== Radar de notícias: headlines on the user's topics, via Gemini + Google Search =====
// Configured on "Configurar briefing" (topics, how many, preferred sources). Each refresh is one
// grounded Gemini call (~20s), so results are cached for CACHE_MS per configuration and served
// stale-while-revalidate: an expired result is returned at once while a new search runs behind.
const { GoogleGenerativeAI } = require("@google/generative-ai");

const CACHE_MS = 2 * 60 * 60 * 1000;
const EMPTY_CACHE_MS = 20 * 60 * 1000; // an empty search is retried sooner
const TZ = "America/Sao_Paulo";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let cache = { key: null, at: 0, data: null };
let inflight = null; // one search at a time, even if the briefing and the screen ask together

function buildPrompt({ assuntos, quantidade, fontes }, { relaxed = false } = {}) {
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: TZ, dateStyle: "full" });
  return `Hoje é ${today}. Pesquise na web as notícias mais recentes (últimas 24 horas; no máximo 48 horas) sobre: ${assuntos}.
${fontes && !relaxed ? `Use preferencialmente estas fontes: ${fontes}. Se não houver nada recente nelas, use outro veículo jornalístico confiável.` : "Use veículos jornalísticos confiáveis."}
Cada notícia precisa ser realmente sobre um dos assuntos (ex.: "finanças" = economia, mercado, juros, dinheiro; política só se o tema central for econômico).
Escolha as ${quantidade} notícia${quantidade > 1 ? "s" : ""} mais relevante${quantidade > 1 ? "s" : ""} para um leitor brasileiro${quantidade > 1 ? ", distribuindo entre os assuntos quando possível" : ""}.
Responda SOMENTE com um array JSON válido, sem markdown e sem texto antes ou depois, no formato:
[{"titulo":"manchete curta em português","fonte":"nome do veículo","resumo":"uma frase em português explicando a notícia","assunto":"qual dos assuntos"}]
Não invente notícias nem datas; se não encontrar nada recente, responda [].`;
}

// The model is asked for bare JSON, but may wrap it in ```json fences or add a sentence
function parseItems(text, max) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Resposta do radar em formato inesperado.");
  const list = JSON.parse(match[0]);
  if (!Array.isArray(list)) throw new Error("Resposta do radar em formato inesperado.");
  return list
    .filter((n) => n && n.titulo)
    .slice(0, max)
    .map((n) => ({
      titulo: String(n.titulo).slice(0, 200),
      fonte: String(n.fonte || "").slice(0, 60),
      resumo: String(n.resumo || "").slice(0, 300),
      assunto: String(n.assunto || "").slice(0, 40),
    }));
}

async function search(cfg) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools: [{ googleSearch: {} }] });
  const ask = async (opts) => parseItems((await model.generateContent(buildPrompt(cfg, opts))).response.text(), cfg.quantidade);
  const items = await ask();
  // The grounded search sometimes comes back empty; one more try without holding to the sources
  return items.length ? items : ask({ relaxed: true });
}

function refresh(key, cfg) {
  if (inflight?.key === key) return inflight.promise;
  const promise = search(cfg)
    .then((itens) => {
      cache = { key, at: Date.now(), data: { assuntos: cfg.assuntos, itens, atualizado_em: Date.now() } };
      return cache.data;
    })
    .finally(() => { inflight = null; });
  inflight = { key, promise };
  return promise;
}

// cfg: { assuntos, quantidade, fontes }
//  force:  new search now ("Atualizar notícias")
//  waitMs: give up waiting after this (the briefing can't hold the reply for a slow search);
//          the search keeps running and fills the cache for next time
async function getNews(cfg, { force = false, waitMs } = {}) {
  if (!cfg.assuntos) return null;
  const key = JSON.stringify([cfg.assuntos, cfg.quantidade, cfg.fontes]);
  const sameConfig = cache.key === key && cache.data;
  const ttl = cache.data?.itens.length ? CACHE_MS : EMPTY_CACHE_MS;
  if (!force && sameConfig && Date.now() - cache.at < ttl) return cache.data;

  const pending = refresh(key, cfg);
  pending.catch((err) => console.error("Erro radar:", err.message)); // background refreshes must not go unhandled
  if (!force && sameConfig) return cache.data; // expired: serve it now, the new search runs behind
  if (!waitMs) return pending;
  return Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve({ assuntos: cfg.assuntos, itens: [], atualizando: true }), waitMs).unref()),
  ]);
}

module.exports = { getNews, CACHE_MS };
