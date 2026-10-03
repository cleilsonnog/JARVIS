// ===== Integrations: result of the Strava OAuth round trip + "needs attention" dot in the sidebar =====
// The screen itself (status, connect, test) is in js/pages.js.
import { createMessageEl, hideWelcome } from "./chat.js";

const dot = document.getElementById("nav-integrations-dot");

// Amber dot on "Integrações" when Strava is set up on the server but not connected
async function refresh() {
  try {
    const s = await (await fetch("/api/integrations")).json();
    dot.classList.toggle("hidden", !(s.strava.configured && !s.strava.connected));
  } catch {}
}

// /api/strava/callback redirects to /?strava=<result>
const result = new URLSearchParams(location.search).get("strava");
if (result) {
  history.replaceState(null, "", "/");
  const messages = {
    conectado: "Strava conectado! Agora posso ver seus treinos do Amazfit. Pergunte, por exemplo: \"quanto corri essa semana?\"",
    cancelado: "Conexão com o Strava cancelada.",
    "sem-permissao": "O Strava foi conectado sem permissão para ver as atividades. Conecte de novo e mantenha a opção de atividades marcada.",
    erro: "Não consegui concluir a conexão com o Strava. Tente novamente.",
  };
  hideWelcome();
  createMessageEl("assistant", messages[result] || messages.erro);
}

window.addEventListener("jarvis:integrations-changed", refresh);
refresh();
