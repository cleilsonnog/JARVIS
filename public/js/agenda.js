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
    <div class="agenda-row group flex items-center gap-3 px-3 py-2 border-l-2 ${overdue ? "border-amber-400 bg-amber-400/5" : "border-jarvis-500/60 bg-white/[0.02]"} text-xs" data-id="${r.id}" data-text="${escapeHtml(r.text)}" data-at="${escapeHtml(r.remind_at)}">
      <span class="${overdue ? "text-amber-400" : "text-jarvis-400"} font-mono">${overdue ? escapeHtml(r.remind_at.slice(8, 10) + "/" + r.remind_at.slice(5, 7) + " " + time) : time}</span>
      <span class="text-gray-300 flex-1 truncate" title="${escapeHtml(r.text)}">${escapeHtml(r.text)}</span>
      <span class="agenda-actions flex items-center gap-1">
        <button type="button" data-agenda="done" class="p-1 text-gray-500 hover:text-emerald-400" title="Concluir">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        </button>
        <button type="button" data-agenda="edit" class="p-1 text-gray-500 hover:text-jarvis-400" title="Editar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button type="button" data-agenda="delete" class="p-1 text-gray-500 hover:text-red-400" title="Excluir">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </span>
    </div>`;
}

export function renderAgenda(el, reminders) {
  // Periodic refreshes must not wipe a row that is being edited
  if (el.querySelector(".agenda-row.is-editing")) return;
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
  if (action === "edit") return startEdit(rowEl);
  if (action === "cancel") return cancelEdit(rowEl);
  if (action === "save") return saveEdit(rowEl);
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

// ----- Inline edit (text + date/time) -----
function startEdit(rowEl) {
  rowEl.classList.add("is-editing");
  rowEl.innerHTML = `
    <div class="agenda-edit flex-1 flex flex-wrap items-center gap-2">
      <input type="text" class="agenda-input flex-1 min-w-[10rem]" data-edit="text" maxlength="300" value="${escapeHtml(rowEl.dataset.text)}" aria-label="Texto do lembrete">
      <input type="datetime-local" class="agenda-input" data-edit="at" value="${escapeHtml(rowEl.dataset.at.replace(" ", "T"))}" aria-label="Data e hora">
      <span class="flex items-center gap-1">
        <button type="button" data-agenda="save" class="agenda-btn agenda-btn-primary">Salvar</button>
        <button type="button" data-agenda="cancel" class="agenda-btn">Cancelar</button>
      </span>
      <span class="agenda-edit-error w-full text-[11px] text-red-400 hidden"></span>
    </div>`;
  const textInput = rowEl.querySelector('[data-edit="text"]');
  textInput.focus();
  textInput.select();
  rowEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveEdit(rowEl); }
    if (e.key === "Escape") { e.stopPropagation(); cancelEdit(rowEl); }
  });
}

// Leaving edit mode: re-render from the server
function cancelEdit(rowEl) {
  rowEl.classList.remove("is-editing");
  window.dispatchEvent(new Event("jarvis:reminders-changed"));
}

async function saveEdit(rowEl) {
  const text = rowEl.querySelector('[data-edit="text"]').value.trim();
  const at = rowEl.querySelector('[data-edit="at"]').value; // "YYYY-MM-DDTHH:MM"
  const err = rowEl.querySelector(".agenda-edit-error");
  const fail = (msg) => { err.textContent = msg; err.classList.remove("hidden"); };
  if (!text) return fail("Escreva o texto do lembrete.");
  if (!at) return fail("Escolha a data e a hora.");
  try {
    const res = await fetch(`/api/reminders/${rowEl.dataset.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, remind_at: at.replace("T", " ").slice(0, 16) }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Não consegui salvar.");
    rowEl.classList.remove("is-editing");
    if (json.remind_at !== rowEl.dataset.at) window.dispatchEvent(new CustomEvent("jarvis:reminder-rescheduled", { detail: json.id }));
    window.dispatchEvent(new Event("jarvis:reminders-changed"));
  } catch (e) {
    fail(e.message);
  }
}
