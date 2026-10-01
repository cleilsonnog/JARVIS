// ===== Reminder agenda: grouped list (Atrasados / Hoje / Amanhã / dates) =====
// Shared by the dashboard card, the header bell panel and pop-out windows.

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const localDate = (d) => d.toLocaleDateString("sv-SE"); // YYYY-MM-DD in local time

export async function fetchAgenda() {
  const res = await fetch("/api/reminders/upcoming");
  if (!res.ok) throw new Error("agenda");
  return res.json();
}

// Reminders that need attention now: overdue/alerted or due later today
export function attentionCount(reminders) {
  const today = localDate(new Date());
  return reminders.filter((r) => r.notified || r.remind_at.slice(0, 10) <= today).length;
}

function groupLabel(dateStr, today, tomorrow) {
  if (dateStr === today) return "Hoje";
  if (dateStr === tomorrow) return "Amanhã";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const label = `${WEEKDAYS[date.getDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  return y === new Date().getFullYear() ? label : `${label}/${y}`;
}

function row(r, overdue) {
  const time = r.remind_at.slice(11, 16);
  return `
    <div class="agenda-row group flex items-center gap-3 px-3 py-2 border-l-2 ${overdue ? "border-amber-400 bg-amber-400/5" : "border-jarvis-500/60 bg-white/[0.02]"} text-xs" data-id="${r.id}">
      <span class="${overdue ? "text-amber-400" : "text-jarvis-400"} font-mono">${overdue ? escapeHtml(r.remind_at.slice(8, 10) + "/" + r.remind_at.slice(5, 7) + " " + time) : time}</span>
      <span class="text-gray-300 flex-1 truncate" title="${escapeHtml(r.text)}">${escapeHtml(r.text)}</span>
      <span class="agenda-actions flex items-center gap-1">
        <button type="button" data-agenda="done" class="p-1 text-gray-500 hover:text-emerald-400" title="Concluir">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        </button>
        <button type="button" data-agenda="delete" class="p-1 text-gray-500 hover:text-red-400" title="Excluir">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </span>
    </div>`;
}

export function renderAgenda(el, reminders) {
  if (reminders.length === 0) {
    el.innerHTML = `
      <div class="py-6 text-center">
        <p class="text-sm text-gray-500">Nenhum lembrete agendado</p>
        <button type="button" class="dash-prompt mt-2 text-[11px] font-mono text-jarvis-400 hover:underline" data-prompt="/lembrete " data-fill>/lembrete HH:MM texto</button>
      </div>`;
    return;
  }

  const now = new Date();
  const today = localDate(now);
  const tomorrow = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const nowStr = `${today} ${now.toTimeString().slice(0, 5)}`;

  const overdue = reminders.filter((r) => r.notified || r.remind_at < nowStr);
  const upcoming = reminders.filter((r) => !overdue.includes(r));

  const sections = [];
  if (overdue.length) sections.push({ label: "Atrasados", items: overdue, overdue: true });
  for (const r of upcoming) {
    const label = groupLabel(r.remind_at.slice(0, 10), today, tomorrow);
    const last = sections[sections.length - 1];
    if (last && last.label === label) last.items.push(r);
    else sections.push({ label, items: [r] });
  }

  el.innerHTML = sections.map((s) => `
    <div class="agenda-section">
      <p class="text-[10px] font-mono uppercase tracking-wider ${s.overdue ? "text-amber-400" : "text-gray-500"} mb-1.5">${s.label}</p>
      <div class="space-y-1">${s.items.map((r) => row(r, !!s.overdue)).join("")}</div>
    </div>`).join("");
}

// Row actions (event delegation; works for any container that renders the agenda)
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-agenda]");
  if (!btn) return;
  const rowEl = btn.closest(".agenda-row");
  const id = rowEl?.dataset.id;
  if (!id) return;

  const action = btn.dataset.agenda;
  if (action === "delete" && !confirm("Excluir este lembrete?")) return;

  try {
    const res = await fetch(action === "delete" ? `/api/reminders/${id}` : `/api/reminders/${id}/done`, {
      method: action === "delete" ? "DELETE" : "POST",
    });
    if (!res.ok) throw new Error();
    rowEl.style.opacity = "0";
    window.dispatchEvent(new Event("jarvis:reminders-changed"));
  } catch {
    alert("Não consegui atualizar o lembrete.");
  }
});
