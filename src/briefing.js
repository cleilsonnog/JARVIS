// ===== Morning briefing: everything the user needs to start the day, in one tool call =====
const { stmts } = require("./database");
const { getWeather } = require("./weather");
const { verseOfTheDay } = require("./verses");
const finplan = require("./finplan");

const TZ = "America/Sao_Paulo";
const DUE_SOON_DAYS = 7;

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

async function getBriefing() {
  const now = new Date();
  const [weather, finances] = await Promise.allSettled([getWeather(), financesBlock()]);
  return {
    agora: now.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "full", timeStyle: "short" }),
    clima: weather.status === "fulfilled" ? weather.value : { erro: "clima indisponível" },
    lembretes: remindersBlock(),
    financas: finances.status === "fulfilled" ? finances.value : { erro: "FinPlan indisponível" },
    versiculo_do_dia: { ...verseOfTheDay(now), versao: "NVI" },
  };
}

module.exports = { getBriefing };
