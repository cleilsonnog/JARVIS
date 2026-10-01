// ===== FinPlan integration (read-only) =====
// Reads the owner's financial summary from FinPlan's token-protected endpoint
// (/api/integrations/jarvis). Enabled only when FINPLAN_URL and FINPLAN_API_TOKEN are set.

const TIMEOUT_MS = 10000;

function isConfigured() {
  return !!(process.env.FINPLAN_URL && process.env.FINPLAN_API_TOKEN);
}

async function getFinancialSummary(month) {
  const url = new URL("/api/integrations/jarvis", process.env.FINPLAN_URL);
  if (month) url.searchParams.set("month", String(month));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.FINPLAN_API_TOKEN}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error("FinPlan recusou o token de integração.");
  if (res.status === 404) throw new Error("Integração com o FinPlan não está habilitada no servidor do FinPlan.");
  if (!res.ok) throw new Error(`FinPlan respondeu ${res.status}.`);
  return res.json();
}

module.exports = { isConfigured, getFinancialSummary };
