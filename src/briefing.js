// ===== Morning briefing: everything the user needs to start the day, in one tool call =====
// What goes in it is configured on the Briefing screen (settings table, key "briefing_config").
const { stmts } = require("./database");
const { getWeather, findPlace } = require("./weather");
const { verseOfTheDay } = require("./verses");
const finplan = require("./finplan");
const strava = require("./strava");

const TZ = "America/Sao_Paulo";
const DUE_SOON_DAYS = 7;
const CONFIG_KEY = "briefing_config";
const SECTIONS = ["clima", "lembretes", "financas", "treinos", "versiculo"];
const LENGTHS = ["curto", "normal", "detalhado"];
const REFRESH_MIN = [5, 15, 30, 60];

// ----- Settings -----
function defaults() {
  return {
    cidade: process.env.JARVIS_CITY || "",
    secoes: Object.fromEntries(SECTIONS.map((s) => [s, true])),
    tamanho: "normal",
    observacoes: "",
    atualizacao_min: 15,      // Briefing screen refresh interval
    abrir_automatico: false,  // open the Briefing screen on the first visit of the day
  };
}

function getConfig() {
  const base = defaults();
  const row = stmts.getSetting.get(CONFIG_KEY);
  if (!row) return base;
  const saved = JSON.parse(row.value);
  return { ...base, ...saved, secoes: { ...base.secoes, ...saved.secoes } };
}

// Validates and stores; an unknown city is rejected so the briefing never loses the weather silently
async function saveConfig(input = {}) {
  const current = getConfig();
  const next = {
    cidade: String(input.cidade ?? current.cidade).trim().slice(0, 80),
    secoes: Object.fromEntries(SECTIONS.map((s) => [s, input.secoes?.[s] ?? current.secoes[s]]).map(([k, v]) => [k, !!v])),
    tamanho: LENGTHS.includes(input.tamanho) ? input.tamanho : current.tamanho,
    observacoes: String(input.observacoes ?? current.observacoes).trim().slice(0, 300),
    atualizacao_min: REFRESH_MIN.includes(Number(input.atualizacao_min)) ? Number(input.atualizacao_min) : current.atualizacao_min,
    abrir_automatico: !!(input.abrir_automatico ?? current.abrir_automatico),
  };
  if (next.cidade) {
    const place = await findPlace(next.cidade).catch(() => null);
    if (!place) throw new Error(`Não encontrei a cidade "${next.cidade}". Tente "Cidade, UF".`);
  }
  stmts.setSetting.run(CONFIG_KEY, JSON.stringify(next));
  return next;
}

// ----- Blocks -----
// Local "YYYY-MM-DD HH:MM", the same format reminders are stored in
function localStamp(date = new Date()) {
  const d = date.toLocaleDateString("en-CA", { timeZone: TZ });
  const t = date.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${d} ${t}`;
}

function remindersBlock() {
  const now = localStamp();
  const today = now.slice(0, 10);
  const all = stmts.getUpcomingReminders.all(); // not done, soonest first
  const fmt = (r) => ({ texto: r.text, quando: r.remind_at });
  return {
    atrasados: all.filter((r) => r.notified || r.remind_at < now).map(fmt),
    hoje: all.filter((r) => !r.notified && r.remind_at >= now && r.remind_at.startsWith(today)).map(fmt),
    proximos: all.filter((r) => r.remind_at.slice(0, 10) > today).slice(0, 3).map(fmt),
  };
}

async function financesBlock() {
  if (!finplan.isConfigured()) return null;
  const data = await finplan.getFinancialSummary();
  const limit = Date.now() + DUE_SOON_DAYS * 86400000;
  const faturas = data.cards.flatMap((c) =>
    c.bills
      .filter((b) => b.status !== "PAID" && b.total > 0 && new Date(b.dueDate).getTime() <= limit)
      .map((b) => ({ cartao: c.name, valor: b.total, vencimento: b.dueDate.slice(0, 10), status: b.status }))
  );
  return { saldo_do_mes: data.monthSummary.balance, faturas_vencendo_em_7_dias: faturas };
}

async function activitiesBlock() {
  if (!strava.isConfigured() || !strava.isConnected()) return null;
  const a = await strava.getActivities({ dias: 7 });
  return { total: a.total_atividades, por_tipo: a.totais_por_tipo, ultima: a.ultima_atividade_registrada };
}

// Next 7 days (plus anything overdue) for the "Agenda consolidada" card
function agendaWeek() {
  const now = localStamp();
  const limit = localStamp(new Date(Date.now() + 7 * 86400000)).slice(0, 10) + " 23:59";
  return stmts.getUpcomingReminders.all()
    .filter((r) => r.remind_at <= limit)
    .map((r) => ({ id: r.id, texto: r.text, quando: r.remind_at, atrasado: !!r.notified || r.remind_at < now }));
}

const skip = () => Promise.resolve(undefined);

async function getBriefing() {
  const cfg = getConfig();
  const on = cfg.secoes;
  const now = new Date();
  const [weather, finances, activities] = await Promise.allSettled([
    on.clima ? getWeather(cfg.cidade) : skip(),
    on.financas ? financesBlock() : skip(),
    on.treinos ? activitiesBlock() : skip(),
  ]);
  const value = (r, fallback) => (r.status === "fulfilled" ? r.value : fallback);

  // Disabled sections are left out entirely (undefined keys vanish in JSON)
  return {
    agora: now.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "full", timeStyle: "short" }),
    preferencias: { tamanho: cfg.tamanho, observacoes: cfg.observacoes || undefined },
    clima: on.clima ? value(weather, { erro: "clima indisponível" }) : undefined,
    lembretes: on.lembretes ? remindersBlock() : undefined,
    financas: on.financas ? value(finances, { erro: "FinPlan indisponível" }) : undefined,
    atividades_7_dias: on.treinos ? value(activities, null) : undefined,
    versiculo_do_dia: on.versiculo ? { ...verseOfTheDay(now), versao: "NVI" } : undefined,
  };
}

// ----- Routes (Briefing screen) -----
function register(app) {
  app.get("/api/briefing/config", (req, res) => res.json(getConfig()));

  app.put("/api/briefing/config", async (req, res) => {
    try {
      res.json(await saveConfig(req.body));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Raw data the briefing would use right now (preview cards)
  app.get("/api/briefing/preview", async (req, res) => {
    try {
      const data = await getBriefing();
      res.json({ ...data, agenda_7_dias: data.lembretes ? agendaWeek() : undefined, gerado_em: Date.now() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { getBriefing, getConfig, register };
