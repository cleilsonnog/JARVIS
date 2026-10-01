// ===== Dashboard widgets: markup + live data =====
// Shared by the main dashboard (dashboard.js) and pop-out windows (widget-page.js).
import { fetchAgenda, renderAgenda } from "./agenda.js";
import { coreSlot, mountCore } from "./core.js";
import { verseOfTheDay } from "./verses.js";

// Large screens: core in the middle spanning two rows, cards around it
export const DEFAULT_ORDER = ["clock", "core", "reminders", "cpu", "ram", "verse", "actions", "disk", "system"];

const HISTORY_SIZE = 30;
const GAUGE_C = 2 * Math.PI * 34; // gauge circumference (r=34)
const history = { cpu: [], ram: [] };

// ----- Markup -----
const ICONS = {
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  bell: `<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>`,
  cpu: `<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>`,
  ram: `<path d="M6 19v-8a2 2 0 012-2h8a2 2 0 012 2v8"/><path d="M6 19h12"/><path d="M9 9V6M12 9V4M15 9V6"/>`,
  disk: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>`,
  bolt: `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`,
  server: `<rect x="2" y="3" width="20" height="7" rx="1"/><rect x="2" y="14" width="20" height="7" rx="1"/><path d="M6 6.5h.01M6 17.5h.01"/>`,
  minimize: `<path d="M6 9l6 6 6-6"/>`,
  book: `<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><path d="M12 6v6M9 9h6"/>`,
  speaker: `<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/>`,
  popout: `<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>`,
};

function icon(name, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function card(id, code, title, iconName, body) {
  const { md, rows = 1 } = WIDGETS[id];
  return `
    <section class="hud-card col-span-12 ${md === 12 ? "" : "md:col-span-6"}" data-widget="${id}" data-rows="${rows}">
      <span class="hud-corner tl"></span><span class="hud-corner tr"></span>
      <span class="hud-corner bl"></span><span class="hud-corner br"></span>
      <header class="hud-handle" title="Arraste para reorganizar">
        <span class="text-jarvis-400">${icon(iconName)}</span>
        <span class="hud-code">${code}</span>
        <span class="hud-title">${title}</span>
        <span class="hud-rule"></span>
        <button type="button" class="hud-btn" data-action="min" title="Minimizar / expandir">${icon("minimize", 13)}</button>
        <button type="button" class="hud-btn" data-action="popout" title="Destacar em janela">${icon("popout", 13)}</button>
        <svg class="hud-grip" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/>
          <circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
        </svg>
      </header>
      <div class="hud-body">${body}</div>
      <div class="hud-popped-note">
        <span>${icon("popout", 13)} Em janela externa</span>
        <button type="button" class="hud-btn-text" data-action="dock">Trazer de volta</button>
      </div>
      <span class="hud-resize" title="Arraste para redimensionar · duplo clique restaura"></span>
    </section>`;
}

function gaugeBody(key, withSpark) {
  return `
    <div class="flex items-center gap-4">
      <div class="relative w-20 h-20 flex-shrink-0">
        <svg viewBox="0 0 80 80" class="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="38" class="gauge-ticks"/>
          <circle cx="40" cy="40" r="34" class="gauge-track"/>
          <circle cx="40" cy="40" r="34" class="gauge-fill" id="dash-${key}-gauge"
            stroke-dasharray="${GAUGE_C}" stroke-dashoffset="${GAUGE_C}"/>
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span id="dash-${key}" class="text-lg font-semibold font-mono text-gray-100">--</span><span class="text-[10px] text-gray-500 font-mono">%</span>
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <div id="dash-${key}-detail" class="text-xs text-gray-400 font-mono truncate">--</div>
        <div id="dash-${key}-sub" class="text-[10px] text-gray-600 uppercase tracking-wider mt-1 truncate"></div>
        ${withSpark ? `<svg class="sparkline mt-2 w-full h-8" viewBox="0 0 100 30" preserveAspectRatio="none">
          <polyline id="dash-${key}-spark" points="" />
        </svg>` : ""}
      </div>
    </div>`;
}

const PROMPTS = [
  { tag: "Programação", text: "Me ajude com código" },
  { tag: "Pesquisa", text: "Explique um conceito" },
  { tag: "Escrita", text: "Redija um texto" },
  { tag: "Ideias", text: "Faça um brainstorm" },
];
const QUICK_COMMANDS = ["/camera", "/sistema", "/monitor", "/clima", "/lembretes", "/ip", "/memorias"];

// w: default width in grid columns (of 12) on large screens; md: width on tablets;
// rows: grid rows spanned on large screens; mount: optional setup after the card is in the DOM
export const WIDGETS = {
  // Frameless slot; the reactor is drawn behind the grid, centered on it (core.js)
  core: { title: "Núcleo", w: 4, md: 12, rows: 2, render: () => coreSlot("col-span-12"), mount: mountCore },

  clock: { title: "Tempo", w: 4, md: 6, render: () => card("clock", "T-00", "Tempo", "clock", `
    <div class="flex items-baseline gap-2 font-mono">
      <span id="dash-clock" class="text-5xl font-light text-gray-100 tracking-wider">--:--</span>
      <span id="dash-seconds" class="text-xl text-jarvis-400">--</span>
    </div>
    <div id="dash-date" class="text-sm text-gray-400 mt-1"></div>
    <div class="mt-4 h-[2px] bg-white/5 overflow-hidden"><div id="dash-sec-bar" class="h-full bg-jarvis-500"></div></div>
    <div class="mt-2 flex justify-between text-[10px] text-gray-600 font-mono uppercase tracking-wider">
      <span id="dash-tz"></span><span id="dash-uptime-clock"></span>
    </div>`) },

  reminders: { title: "Lembretes", w: 4, md: 6, render: () => card("reminders", "R-01", "Lembretes", "bell", `
    <div id="dash-reminders-list" class="agenda space-y-3"></div>`) },

  cpu: { title: "Processador", w: 4, md: 6, render: () => card("cpu", "SYS.01", "Processador", "cpu", gaugeBody("cpu", true)) },
  ram: { title: "Memória", w: 4, md: 6, render: () => card("ram", "SYS.02", "Memória", "ram", gaugeBody("ram", true)) },
  verse: { title: "Versículo do dia", w: 6, md: 12, render: () => {
    const v = verseOfTheDay();
    return card("verse", "NVI", "Versículo do dia", "book", `
      <blockquote class="verse-text">“${v.text}”</blockquote>
      <div class="mt-3 flex items-center justify-between gap-3">
        <span class="text-xs font-mono text-jarvis-400">${v.ref} · NVI</span>
        <button type="button" class="hud-btn-text verse-speak flex items-center gap-1.5" data-speak="${v.ref.replace(/"/g, "")}. ${v.text.replace(/"/g, "")}" title="Ouvir">
          ${icon("speaker", 12)} Ouvir
        </button>
      </div>`);
  } },

  disk: { title: "Armazenamento", w: 6, md: 6, render: () => card("disk", "SYS.03", "Armazenamento", "disk", gaugeBody("disk", false)) },

  actions: { title: "Ações rápidas", w: 6, md: 12, render: () => card("actions", "CMD", "Ações rápidas", "bolt", `
    <div class="grid grid-cols-2 gap-2">
      ${PROMPTS.map((p) => `
        <button type="button" class="dash-prompt group text-left p-3 border border-white/5 bg-white/[0.02] hover:border-jarvis-500/40 hover:bg-jarvis-500/5 transition-colors" data-prompt="${p.text}">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 group-hover:text-jarvis-400 transition-colors">${p.tag}</p>
          <p class="text-sm text-gray-300 mt-1">${p.text}</p>
        </button>`).join("")}
    </div>
    <div class="mt-3 flex flex-wrap gap-1.5">
      ${QUICK_COMMANDS.map((c) => `
        <button type="button" class="dash-prompt px-2.5 py-1 text-[11px] font-mono text-gray-400 border border-white/10 hover:text-jarvis-400 hover:border-jarvis-500/40 transition-colors" data-prompt="${c}">${c}</button>`).join("")}
    </div>`) },

  system: { title: "Sistema", w: 6, md: 6, render: () => card("system", "NET", "Sistema", "server", `
    <dl class="hud-kv">
      <dt>Host</dt><dd id="dash-hostname">--</dd>
      <dt>SO</dt><dd id="dash-platform">--</dd>
      <dt>CPU</dt><dd id="dash-cpu-model">--</dd>
      <dt>Uptime</dt><dd id="dash-uptime">--</dd>
      <dt>Latência</dt><dd id="dash-ping">--</dd>
    </dl>`) },
};

// ----- Data -----
function updateClock() {
  const clockEl = document.getElementById("dash-clock");
  if (!clockEl) return;

  const now = new Date();
  const s = now.getSeconds();
  clockEl.textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("dash-seconds").textContent = String(s).padStart(2, "0");
  const bar = document.getElementById("dash-sec-bar");
  bar.style.transition = s === 0 ? "none" : ""; // don't animate backwards on minute wrap
  bar.style.width = `${((s + 1) / 60) * 100}%`;
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  document.getElementById("dash-date").textContent = date.charAt(0).toUpperCase() + date.slice(1);
  document.getElementById("dash-tz").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setGauge(key, percent, detail, sub) {
  const valueEl = document.getElementById(`dash-${key}`);
  if (!valueEl) return;
  valueEl.textContent = percent;
  const gauge = document.getElementById(`dash-${key}-gauge`);
  gauge.style.strokeDashoffset = GAUGE_C * (1 - Math.min(percent, 100) / 100);
  gauge.classList.toggle("is-warn", percent >= 70 && percent < 85);
  gauge.classList.toggle("is-crit", percent >= 85);
  setText(`dash-${key}-detail`, detail);
  setText(`dash-${key}-sub`, sub);
}

function setSpark(key, value) {
  const h = history[key];
  h.push(value);
  if (h.length > HISTORY_SIZE) h.shift();
  const el = document.getElementById(`dash-${key}-spark`);
  if (!el) return;
  const step = 100 / (HISTORY_SIZE - 1);
  const offset = HISTORY_SIZE - h.length;
  el.setAttribute("points", h.map((v, i) => `${((i + offset) * step).toFixed(1)},${(30 - (v / 100) * 28 - 1).toFixed(1)}`).join(" "));
}

async function loadStats() {
  try {
    const t0 = performance.now();
    const res = await fetch("/api/system/stats");
    const ping = Math.round(performance.now() - t0);
    const data = await res.json();

    // Record history even while widgets are hidden so sparklines are warm on return
    setSpark("cpu", data.cpu.usage);
    setSpark("ram", data.memory.percent);

    setGauge("cpu", data.cpu.usage, `${data.cpu.cores} núcleos`, "Carga atual");
    setGauge("ram", data.memory.percent, `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`, `${formatBytes(data.memory.free)} livres`);
    setGauge("disk", data.disk.percent, `${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)}`, `${formatBytes(data.disk.total - data.disk.used)} livres`);

    setText("dash-hostname", data.hostname);
    setText("dash-platform", data.platform);
    setText("dash-cpu-model", data.cpu.model);
    setText("dash-uptime", data.uptime);
    setText("dash-uptime-clock", `Uptime ${data.uptime}`);
    setText("dash-ping", `${ping} ms`);
  } catch {}
}

async function loadTodayReminders() {
  const list = document.getElementById("dash-reminders-list");
  if (!list) return;
  try {
    renderAgenda(list, await fetchAgenda());
  } catch {}
}

export function refreshWidgets() {
  updateClock();
  loadStats();
  loadTodayReminders();
}

// One set of timers per window; each update is a no-op while its widget isn't on screen
export function startWidgetTimers() {
  setInterval(updateClock, 1000);
  setInterval(loadStats, 5000);
  setInterval(loadTodayReminders, 60000);
  // Refresh right away when a reminder is alerted, confirmed or snoozed (reminders.js)
  window.addEventListener("jarvis:reminders-changed", loadTodayReminders);
}

// Run per-widget setup (e.g. the core's canvas) for cards rendered inside `root`
export function mountWidgets(root) {
  root.querySelectorAll("[data-widget]").forEach((card) => WIDGETS[card.dataset.widget]?.mount?.(card));
}
