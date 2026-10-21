// ===== Integrations screen: status of every data source in one call =====
const finplan = require("./finplan");
const strava = require("./strava");
const treinoia = require("./treinoia");
const { getConfig } = require("./briefing");
const email = require("./email");

function register(app) {
  app.get("/api/integrations", (req, res) => {
    res.json({
      strava: strava.status(),
      finplan: { configured: finplan.isConfigured(), host: finplan.isConfigured() ? new URL(process.env.FINPLAN_URL).host : null },
      treinoia: { configured: treinoia.isConfigured(), host: treinoia.isConfigured() ? new URL(process.env.TREINOIA_URL).host : null },
      clima: { cidade: getConfig().cidade || null },
      email: { contas: email.hasAccounts() },
    });
  });

  // Connection test: a real read, so a wrong token or a sleeping server shows up here
  app.post("/api/integrations/finplan/test", async (req, res) => {
    if (!finplan.isConfigured()) return res.status(501).json({ ok: false, error: "FinPlan não configurado no .env (FINPLAN_URL / FINPLAN_API_TOKEN)." });
    try {
      const data = await finplan.getFinancialSummary();
      res.json({ ok: true, cartoes: data.cards.length });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  app.post("/api/integrations/treinoia/test", async (req, res) => {
    if (!treinoia.isConfigured()) return res.status(501).json({ ok: false, error: "Treino.IA não configurado no .env (TREINOIA_URL / TREINOIA_API_TOKEN)." });
    try {
      const g = await treinoia.getTrainingSummary();
      res.json({ ok: true, plano: g.workoutPlan?.name || null, hoje: g.today?.name || null });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  app.post("/api/integrations/strava/test", async (req, res) => {
    try {
      const a = await strava.getActivities({ dias: 7 });
      res.json({ ok: true, atividades: a.total_atividades, ultima: a.ultima_atividade_registrada });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });
}

module.exports = { register };
