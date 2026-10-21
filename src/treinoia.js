// ===== Treino.IA integration (read-only) =====
// Reads the owner's gym plan and workout history from Treino.IA's token-protected endpoint
// (/integrations/jarvis). Enabled only when TREINOIA_URL and TREINOIA_API_TOKEN are set.

const TIMEOUT_MS = 10000;
const TZ = "America/Sao_Paulo";

function isConfigured() {
  return !!(process.env.TREINOIA_URL && process.env.TREINOIA_API_TOKEN);
}

async function getTrainingSummary() {
  const url = new URL("/integrations/jarvis", process.env.TREINOIA_URL);
  url.searchParams.set("timezone", TZ);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.TREINOIA_API_TOKEN}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error("Treino.IA recusou o token de integração.");
  if (res.status === 404) throw new Error("Integração com o Treino.IA não está habilitada no servidor do Treino.IA.");
  if (!res.ok) throw new Error(`Treino.IA respondeu ${res.status}.`);
  return res.json();
}

module.exports = { isConfigured, getTrainingSummary };
