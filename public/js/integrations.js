// ===== Integrations (sidebar): Strava connect / disconnect =====
import { createMessageEl, hideWelcome } from "./chat.js";

const statusEl = document.getElementById("strava-status");
const actionBtn = document.getElementById("strava-action");

async function refresh() {
  try {
    const s = await (await fetch("/api/strava/status")).json();
    actionBtn.classList.toggle("hidden", !s.configured);
    if (!s.configured) {
      statusEl.textContent = "não configurado";
    } else if (s.connected) {
      statusEl.innerHTML = `<span class="text-emerald-400">●</span> ${s.athlete?.nome || "conectado"}`;
      actionBtn.textContent = "Desconectar";
      actionBtn.dataset.action = "disconnect";
    } else {
      statusEl.textContent = "desconectado";
      actionBtn.textContent = "Conectar";
      actionBtn.dataset.action = "connect";
    }
  } catch {
    statusEl.textContent = "indisponível";
  }
}

actionBtn.addEventListener("click", async () => {
  if (actionBtn.dataset.action === "connect") {
    location.href = "/api/strava/connect"; // Strava consent page, then back to /?strava=...
    return;
  }
  if (!confirm("Desconectar o Strava? O JARVIS deixa de ver seus treinos.")) return;
  await fetch("/api/strava/disconnect", { method: "POST" });
  refresh();
});

// Result of the OAuth round trip (/api/strava/callback redirects to /?strava=<result>)
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

refresh();
