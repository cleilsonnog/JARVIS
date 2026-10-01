// ===== Polling de lembretes com cards visuais =====
import { speak } from "./tts.js";

const container = document.getElementById("reminder-cards");

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

function createReminderCard(reminder) {
  const card = document.createElement("div");
  card.className = "reminder-card w-80 rounded-2xl border border-jarvis-500/30 bg-dark-300/90 shadow-lg shadow-jarvis-500/10 overflow-hidden";
  card.id = `reminder-${reminder.id}`;

  card.innerHTML = `
    <div class="flex items-center justify-between px-4 py-2.5 bg-jarvis-500/10 border-b border-jarvis-500/20">
      <div class="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-jarvis-400">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <span class="text-xs font-semibold text-jarvis-400 tracking-wider uppercase">Lembrete</span>
      </div>
      <div class="flex items-center gap-1">
        <button class="reminder-minimize p-1 rounded hover:bg-white/10 text-gray-400 hover:text-jarvis-400 transition-colors" title="Minimizar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
        </button>
        <button class="reminder-close p-1 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors" title="Fechar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="reminder-body px-4 py-3">
      <p class="text-sm text-gray-200 leading-relaxed">${reminder.text}</p>
      <p class="text-[10px] text-gray-500 mt-2">${formatReminderTime(reminder.remind_at)}</p>
    </div>`;

  // Minimize
  card.querySelector(".reminder-minimize").addEventListener("click", () => {
    card.classList.toggle("minimized");
  });

  // Close
  card.querySelector(".reminder-close").addEventListener("click", () => {
    card.style.animation = "reminderFadeOut 0.3s ease-in forwards";
    setTimeout(() => card.remove(), 300);
  });

  // Click to expand if minimized
  card.querySelector(".reminder-body")?.parentElement.addEventListener("click", (e) => {
    if (card.classList.contains("minimized") && !e.target.closest("button")) {
      card.classList.remove("minimized");
    }
  });

  container.appendChild(card);

  // Auto-remove after 60s
  setTimeout(() => {
    if (card.parentElement) {
      card.style.animation = "reminderFadeOut 0.3s ease-in forwards";
      setTimeout(() => card.remove(), 300);
    }
  }, 60000);
}

function formatReminderTime(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return dateStr;
  }
}

setInterval(async () => {
  try {
    const res = await fetch("/api/reminders/pending");
    const reminders = await res.json();
    reminders.forEach((r) => {
      // Browser notification
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("JARVIS - Lembrete", { body: r.text, icon: "/favicon.ico" });
      }
      // Visual card
      createReminderCard(r);
      // Voice
      speak(`Lembrete: ${r.text}`);
    });
  } catch {}
}, 30000);
