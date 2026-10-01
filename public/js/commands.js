// ===== Slash Commands =====
import { createMessageEl, hideWelcome, scrollToBottom } from "./chat.js";
import { speak } from "./tts.js";
import { toggleCamera, isCameraOn } from "./camera.js";

const COMMANDS = {
  "/help": {
    description: "Lista todos os comandos disponíveis",
    handler: cmdHelp,
  },
  "/sistema": {
    description: "Mostra informações do sistema",
    handler: cmdSistema,
  },
  "/monitor": {
    description: "Abre o monitor do sistema ao vivo",
    handler: cmdMonitor,
  },
  "/lembretes": {
    description: "Lista lembretes pendentes",
    handler: cmdLembretes,
  },
  "/lembrete": {
    description: "Cria lembrete — /lembrete 18:30 Reunião",
    handler: cmdLembrete,
  },
  "/clima": {
    description: "Mostra o clima atual (via IA)",
    handler: null, // Handled by forwarding to AI
    forward: "Qual o clima atual na minha cidade?",
  },
  "/ip": {
    description: "Mostra seu IP público",
    handler: cmdIp,
  },
  "/camera": {
    description: "Liga/desliga a câmera (visão do JARVIS)",
    handler: cmdCamera,
  },
  "/limpar": {
    description: "Limpa o chat atual",
    handler: cmdLimpar,
  },
  "/memorias": {
    description: "Lista memórias salvas do JARVIS",
    handler: null,
    forward: "Liste todas as suas memórias salvas usando recall_memories",
  },
};

// Check if a message is a slash command, return { handled, forward }
export function handleSlashCommand(message) {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(" ");

  const command = COMMANDS[cmd];
  if (!command) {
    // Show unknown command
    hideWelcome();
    createMessageEl("assistant", `Comando desconhecido: \`${cmd}\`\n\nDigite \`/help\` para ver os comandos disponíveis.`);
    return { handled: true };
  }

  if (command.forward) {
    return { handled: false, forward: command.forward };
  }

  hideWelcome();
  command.handler(args);
  return { handled: true };
}

// Show autocomplete suggestions
export function getCommandSuggestions(text) {
  if (!text.startsWith("/")) return [];
  const lower = text.toLowerCase();
  return Object.entries(COMMANDS)
    .filter(([cmd]) => cmd.startsWith(lower))
    .map(([cmd, info]) => ({ cmd, description: info.description }));
}

// ===== Command handlers =====

function cmdHelp() {
  const lines = Object.entries(COMMANDS)
    .map(([cmd, info]) => `\`${cmd}\` — ${info.description}`)
    .join("\n");
  createMessageEl("assistant", `**Comandos disponíveis:**\n\n${lines}`);
  scrollToBottom();
}

async function cmdSistema() {
  try {
    const res = await fetch("/api/system/stats");
    const s = await res.json();
    const md = `**Sistema**\n\n` +
      `| | |\n|---|---|\n` +
      `| **Host** | ${s.hostname} |\n` +
      `| **OS** | ${s.platform} |\n` +
      `| **CPU** | ${s.cpu.model} (${s.cpu.cores} cores) — ${s.cpu.usage}% |\n` +
      `| **RAM** | ${formatBytes(s.memory.used)} / ${formatBytes(s.memory.total)} (${s.memory.percent}%) |\n` +
      `| **Disco** | ${formatBytes(s.disk.used)} / ${formatBytes(s.disk.total)} (${s.disk.percent}%) |\n` +
      `| **Uptime** | ${s.uptime} |`;
    createMessageEl("assistant", md);
    speak(`Sistema: CPU a ${s.cpu.usage} por cento, RAM a ${s.memory.percent} por cento, disco a ${s.disk.percent} por cento. Uptime: ${s.uptime}.`);
  } catch {
    createMessageEl("assistant", "Erro ao obter informações do sistema.");
  }
  scrollToBottom();
}

let monitorInterval = null;

async function cmdMonitor() {
  // If monitor is already running, stop it
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    createMessageEl("assistant", "Monitor do sistema encerrado.");
    scrollToBottom();
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-start animate-fade-in";

  const bubble = document.createElement("div");
  bubble.className = "max-w-[80%] w-full px-4 py-3 rounded-2xl rounded-bl-md bg-white/[0.03] border border-white/5 text-sm leading-relaxed";
  bubble.id = "system-monitor";

  wrapper.appendChild(bubble);
  const chat = document.getElementById("chat");
  chat.appendChild(wrapper);

  async function updateMonitor() {
    try {
      const res = await fetch("/api/system/stats");
      const s = await res.json();

      bubble.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-xs text-jarvis-400 font-semibold uppercase tracking-wider">System Monitor</span>
          </div>
          <button id="monitor-close" class="text-[10px] text-gray-500 hover:text-red-400 transition-colors">Fechar</button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="text-[10px] text-gray-500 uppercase mb-1">CPU</div>
            <div class="text-lg font-mono text-gray-200">${s.cpu.usage}<span class="text-xs text-gray-500">%</span></div>
            <div class="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700 ${getBarColor(s.cpu.usage)}" style="width:${s.cpu.usage}%"></div>
            </div>
            <div class="text-[10px] text-gray-600 mt-1">${s.cpu.cores} cores</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 uppercase mb-1">RAM</div>
            <div class="text-lg font-mono text-gray-200">${s.memory.percent}<span class="text-xs text-gray-500">%</span></div>
            <div class="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700 ${getBarColor(s.memory.percent)}" style="width:${s.memory.percent}%"></div>
            </div>
            <div class="text-[10px] text-gray-600 mt-1">${formatBytes(s.memory.used)} / ${formatBytes(s.memory.total)}</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 uppercase mb-1">Disco</div>
            <div class="text-lg font-mono text-gray-200">${s.disk.percent}<span class="text-xs text-gray-500">%</span></div>
            <div class="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700 ${getBarColor(s.disk.percent)}" style="width:${s.disk.percent}%"></div>
            </div>
            <div class="text-[10px] text-gray-600 mt-1">${formatBytes(s.disk.used)} / ${formatBytes(s.disk.total)}</div>
          </div>
          <div>
            <div class="text-[10px] text-gray-500 uppercase mb-1">Info</div>
            <div class="text-[11px] text-gray-400 mt-1">${s.hostname}</div>
            <div class="text-[10px] text-gray-600">${s.platform}</div>
            <div class="text-[10px] text-gray-600 mt-1">Uptime: ${s.uptime}</div>
          </div>
        </div>
        <div class="text-[9px] text-gray-600 text-right mt-2">Atualiza a cada 3s · /monitor para fechar</div>`;

      bubble.querySelector("#monitor-close")?.addEventListener("click", () => {
        clearInterval(monitorInterval);
        monitorInterval = null;
        wrapper.remove();
      });
    } catch {}
  }

  await updateMonitor();
  monitorInterval = setInterval(updateMonitor, 3000);
  scrollToBottom();
}

async function cmdLembretes() {
  try {
    const res = await fetch("/api/reminders/today");
    const reminders = await res.json();
    if (reminders.length === 0) {
      createMessageEl("assistant", "Nenhum lembrete pendente para hoje.");
      speak("Nenhum lembrete pendente para hoje.");
    } else {
      const lines = reminders.map((r) => {
        const time = r.remind_at.split(" ")[1] || r.remind_at;
        if (r.done) return `- ~~${time} — ${r.text}~~ (concluído)`;
        if (r.notified) return `- **${time}** — ${r.text} _(avisado, aguardando você)_`;
        return `- **${time}** — ${r.text}`;
      }).join("\n");
      createMessageEl("assistant", `**Lembretes de hoje:**\n\n${lines}`);
      speak(`Você tem ${reminders.length} lembrete${reminders.length > 1 ? "s" : ""} para hoje.`);
    }
  } catch {
    createMessageEl("assistant", "Erro ao carregar lembretes.");
  }
  scrollToBottom();
}

function cmdLembrete(args) {
  if (!args) {
    createMessageEl("assistant", "Uso: `/lembrete HH:MM texto`\n\nExemplo: `/lembrete 18:30 Reunião com equipe`");
    scrollToBottom();
    return;
  }

  const match = args.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
  if (!match) {
    createMessageEl("assistant", "Formato inválido. Use: `/lembrete HH:MM texto`");
    scrollToBottom();
    return;
  }

  const time = match[1];
  const text = match[2];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const remindAt = `${today} ${time.padStart(5, "0")}`;

  // Send to API via chat (so Gemini creates it properly)
  // Actually, let's call the API directly for instant response
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Crie um lembrete para hoje às ${time}: "${text}". Use a ferramenta create_reminder com remind_at="${remindAt}".`,
      sessionId: crypto.randomUUID(),
    }),
  });

  createMessageEl("assistant", `Lembrete criado: **${time}** — ${text}`);
  speak(`Lembrete criado para às ${time}: ${text}`);
  scrollToBottom();
}

async function cmdIp() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    createMessageEl("assistant", `**Seu IP público:** \`${data.ip}\``);
    speak(`Seu IP público é ${data.ip}`);
  } catch {
    createMessageEl("assistant", "Erro ao obter IP público.");
  }
  scrollToBottom();
}

function cmdLimpar() {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";
  createMessageEl("assistant", "Chat limpo.");
  scrollToBottom();
}

// ===== Helpers =====

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
}

function getBarColor(percent) {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-jarvis-500/60";
}

async function cmdCamera() {
  try {
    await toggleCamera();
    const msg = isCameraOn()
      ? "Câmera ligada. Pergunte o que quiser: cada mensagem envia o que estou vendo."
      : "Câmera desligada.";
    createMessageEl("assistant", msg);
    speak(msg);
  } catch (err) {
    createMessageEl("assistant", err.message);
  }
}
