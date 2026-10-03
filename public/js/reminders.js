// ===== Reminders: push notifications + in-app cards =====
// The server decides when a reminder is due and sends a Web Push (works with the app closed).
// Here we (1) subscribe this device to push, (2) show cards for alerted reminders that weren't
// confirmed yet, with "Concluir" / "Adiar", and (3) speak each one once.
import { speak } from "./tts.js";
import { fetchAgenda, renderAgenda, attentionCount } from "./agenda.js";

const container = document.getElementById("reminder-cards");
const POLL_MS = 30000;
const SPOKEN_KEY = "jarvis-spoken-reminders";
const PUSH_DISMISS_KEY = "jarvis-push-prompt-dismissed";

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ----- "Spoken once" bookkeeping (survives reloads; keyed by id + time so a snooze speaks again) -----
function loadSpoken() {
  try { return new Set(JSON.parse(localStorage.getItem(SPOKEN_KEY)) || []); } catch { return new Set(); }
}
const spoken = loadSpoken();
function markSpoken(key) {
  spoken.add(key);
  try { localStorage.setItem(SPOKEN_KEY, JSON.stringify([...spoken].slice(-100))); } catch {}
}

// ----- Cards -----
function formatReminderTime(dateStr) {
  const [date, time] = String(dateStr).split(" ");
  if (!time) return String(dateStr);
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  return date === today ? `Hoje às ${time}` : `${date.split("-").reverse().join("/")} às ${time}`;
}

function isOverdue(dateStr) {
  // remind_at is local "YYYY-MM-DD HH:MM"
  return new Date(dateStr.replace(" ", "T")) < new Date(Date.now() - 2 * 60 * 1000);
}

function removeCard(id) {
  const card = document.getElementById(`reminder-${id}`);
  if (!card) return;
  card.style.animation = "reminderFadeOut 0.3s ease-in forwards";
  setTimeout(() => card.remove(), 300);
}

async function act(id, action) {
  try {
    const res = await fetch(`/api/reminders/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: 10 }),
    });
    if (!res.ok) throw new Error();
    removeCard(id);
    window.dispatchEvent(new Event("jarvis:reminders-changed"));
    // Also clear the system notification for this reminder, if still showing
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications({ tag: `reminder-${id}` }))?.forEach((n) => n.close());
  } catch {
    alert("Não consegui atualizar o lembrete. Verifique a conexão.");
  }
}

function createReminderCard(reminder) {
  if (document.getElementById(`reminder-${reminder.id}`)) return;
  const overdue = isOverdue(reminder.remind_at);

  const card = document.createElement("div");
  card.className = "reminder-card w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-jarvis-500/30 bg-dark-300/90 shadow-lg shadow-jarvis-500/10 overflow-hidden";
  card.id = `reminder-${reminder.id}`;
  card.innerHTML = `
    <div class="flex items-center justify-between px-4 py-2.5 bg-jarvis-500/10 border-b border-jarvis-500/20">
      <div class="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-jarvis-400">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <span class="text-xs font-semibold text-jarvis-400 tracking-wider uppercase">${overdue ? "Lembrete atrasado" : "Lembrete"}</span>
      </div>
      <div class="flex items-center gap-1">
        <button class="reminder-minimize p-1 rounded hover:bg-white/10 text-gray-400 hover:text-jarvis-400 transition-colors" title="Minimizar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
        </button>
        <button class="reminder-close p-1 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors" title="Ocultar (volta ao recarregar)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="reminder-body px-4 py-3">
      <p class="text-sm text-gray-200 leading-relaxed">${escapeHtml(reminder.text)}</p>
      <p class="text-[10px] ${overdue ? "text-amber-400" : "text-gray-500"} mt-2">${formatReminderTime(reminder.remind_at)}</p>
      <div class="flex gap-2 mt-3">
        <button data-act="done" class="flex-1 py-1.5 rounded-lg bg-jarvis-500 text-dark-700 text-xs font-medium hover:bg-jarvis-400 transition-colors">Concluir</button>
        <button data-act="snooze" class="flex-1 py-1.5 rounded-lg border border-white/10 text-gray-300 text-xs hover:border-jarvis-500/40 hover:text-jarvis-400 transition-colors">Adiar 10 min</button>
      </div>
    </div>`;

  card.querySelector(".reminder-minimize").addEventListener("click", () => card.classList.toggle("minimized"));
  card.querySelector(".reminder-close").addEventListener("click", () => removeCard(reminder.id));
  card.querySelectorAll("[data-act]").forEach((btn) =>
    btn.addEventListener("click", () => act(reminder.id, btn.dataset.act))
  );
  container.appendChild(card);
}

function showReminder(r) {
  createReminderCard(r);
  const key = `${r.id}@${r.remind_at}`;
  if (!spoken.has(key)) {
    markSpoken(key);
    speak(`${isOverdue(r.remind_at) ? "Lembrete atrasado" : "Lembrete"}: ${r.text}`);
  }
}

async function poll() {
  try {
    const res = await fetch("/api/reminders/pending");
    if (!res.ok) return;
    const active = await res.json();
    const ids = new Set(active.map((r) => String(r.id)));
    // Cards confirmed elsewhere (other device / notification button) disappear here too
    container.querySelectorAll(".reminder-card").forEach((c) => {
      if (!ids.has(c.id.replace("reminder-", ""))) c.remove();
    });
    active.forEach(showReminder);
  } catch {}
}

// ----- Push subscription -----
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await (await fetch("/api/push/public-key")).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  // Always (re)send: idempotent, and restores the server copy if it was lost
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
}

function showPushPrompt() {
  if (document.getElementById("push-prompt")) return;
  const el = document.createElement("div");
  el.id = "push-prompt";
  el.className = "reminder-card w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-jarvis-500/30 bg-dark-300/90 px-4 py-3";
  el.innerHTML = `
    <p class="text-sm text-gray-200">Ativar avisos de lembretes?</p>
    <p class="text-[11px] text-gray-500 mt-1">Você recebe a notificação na hora, mesmo com o app fechado.</p>
    <div class="flex gap-2 mt-3">
      <button data-push="yes" class="flex-1 py-1.5 rounded-lg bg-jarvis-500 text-dark-700 text-xs font-medium hover:bg-jarvis-400">Ativar</button>
      <button data-push="no" class="flex-1 py-1.5 rounded-lg border border-white/10 text-gray-400 text-xs hover:text-gray-200">Agora não</button>
    </div>`;
  el.addEventListener("click", async (e) => {
    const choice = e.target.closest("[data-push]")?.dataset.push;
    if (!choice) return;
    el.remove();
    if (choice === "no") {
      try { localStorage.setItem(PUSH_DISMISS_KEY, "1"); } catch {}
      return;
    }
    // Must run inside the tap: Android only shows the permission dialog for a user gesture
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await subscribePush().catch((err) => console.error("Erro push:", err));
      fetch("/api/push/test", { method: "POST" }).catch(() => {});
    }
  });
  container.appendChild(el);
}

async function initPush() {
  if (!pushSupported) return;
  if (Notification.permission === "granted") {
    subscribePush().catch((err) => console.error("Erro push:", err));
  } else if (Notification.permission === "default") {
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(PUSH_DISMISS_KEY); } catch {}
    if (!dismissed) showPushPrompt();
  }
}

// ----- Header bell: badge + agenda panel -----
const agendaBtn = document.getElementById("agenda-btn");
const agendaPanel = document.getElementById("agenda-panel");
const agendaList = document.getElementById("agenda-panel-list");
const agendaBadge = document.getElementById("agenda-badge");

async function refreshAgenda() {
  try {
    const reminders = await fetchAgenda();
    // Badge only for what needs attention (overdue / today); future ones don't nag
    const n = attentionCount(reminders);
    agendaBadge.textContent = n > 9 ? "9+" : String(n);
    agendaBadge.classList.toggle("hidden", n === 0);
    if (!agendaPanel.classList.contains("hidden")) renderAgenda(agendaList, reminders);
    return reminders;
  } catch {}
}

agendaBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const opening = agendaPanel.classList.contains("hidden");
  agendaPanel.classList.toggle("hidden");
  if (opening) {
    agendaList.innerHTML = `<p class="text-xs text-gray-500 text-center py-4">Carregando...</p>`;
    const reminders = await refreshAgenda();
    if (reminders) renderAgenda(agendaList, reminders);
  }
});

// Close on outside click / Escape
document.addEventListener("click", (e) => {
  if (!agendaPanel.classList.contains("hidden") && !e.target.closest("#agenda-panel")) agendaPanel.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") agendaPanel.classList.add("hidden");
});

// Empty-state shortcut inside the panel: prefill the reminder command
agendaPanel.addEventListener("click", (e) => {
  const prompt = e.target.closest(".dash-prompt");
  if (!prompt) return;
  const input = document.getElementById("input");
  input.value = prompt.dataset.prompt;
  input.focus();
  agendaPanel.classList.add("hidden");
});

window.addEventListener("jarvis:reminders-changed", refreshAgenda);
// Edited in the agenda with a new time: the old alert card no longer applies
window.addEventListener("jarvis:reminder-rescheduled", (e) => removeCard(e.detail));
// A chat reply may have created a reminder ("JARVIS, me lembra amanhã às 9h...")
window.addEventListener("jarvis:reply-done", () => window.dispatchEvent(new Event("jarvis:reminders-changed")));
setInterval(refreshAgenda, 60000);
refreshAgenda();

// ----- Wiring -----
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (e.data?.type === "jarvis-push" && e.data.data?.type === "reminder") {
    showReminder(e.data.data);
    window.dispatchEvent(new Event("jarvis:reminders-changed"));
  }
  if (e.data?.type === "jarvis-reminder-updated") {
    removeCard(e.data.id);
    window.dispatchEvent(new Event("jarvis:reminders-changed"));
  }
});

// Phones freeze background tabs: check as soon as the app is visible again
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) poll();
});

setInterval(poll, POLL_MS);
poll();
initPush();
