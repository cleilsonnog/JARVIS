// ===== Screens opened from the sidebar: Briefing (+ its settings) and Integrações =====
// Rendered over the stage (the chat/dashboard is hidden meanwhile); sending a message closes them.
import { briefingPrompt, markBriefingHeard } from "./dashboard.js";

const view = document.getElementById("page-view");
const chat = document.getElementById("chat");
const input = document.getElementById("input");
const form = document.getElementById("input-form");
const CAME_FROM_STRAVA = new URLSearchParams(location.search).has("strava"); // read before integrations.js cleans the URL

let current = null;
let timers = [];
const PAGES = { briefing: renderBriefing, "briefing-config": renderBriefingConfig, integracoes: renderIntegrations };

function clearTimers() {
  timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
  timers = [];
}

export function openPage(name, opts = {}) {
  if (!PAGES[name]) return;
  clearTimers();
  current = name;
  chat.classList.add("hidden");
  view.classList.remove("hidden");
  view.scrollTop = 0;
  PAGES[name](opts);
  window.dispatchEvent(new CustomEvent("jarvis:view", { detail: name.split("-")[0] }));
}

export function closePage() {
  if (!current) return;
  clearTimers();
  current = null;
  view.classList.add("hidden");
  view.innerHTML = "";
  if (!document.body.classList.contains("voice-view")) chat.classList.remove("hidden");
  window.dispatchEvent(new CustomEvent("jarvis:view", { detail: document.getElementById("welcome") ? "painel" : "chat" }));
}

view.addEventListener("click", (e) => {
  if (e.target.closest("[data-page-close]")) return closePage();
  const go = e.target.closest("[data-page-open]");
  if (go) openPage(go.dataset.pageOpen, { focus: go.dataset.focus });
});

// ----- Helpers -----
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const km = (n) => `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const today = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const localDay = (d = new Date()) => d.toLocaleDateString("sv-SE"); // YYYY-MM-DD

// "2026-10-05 18:30" -> "Hoje 18:30" / "Amanhã 18:30" / "seg., 05/10 18:30"
function when(stamp) {
  const [day, time] = stamp.split(" ");
  const tomorrow = localDay(new Date(Date.now() + 86400000));
  if (day === localDay()) return `Hoje ${time}`;
  if (day === tomorrow) return `Amanhã ${time}`;
  const d = new Date(`${day}T12:00:00`);
  return `${d.toLocaleDateString("pt-BR", { weekday: "short" })}, ${day.slice(8, 10)}/${day.slice(5, 7)} ${time}`;
}

// Days from today to a "YYYY-MM-DD ..." stamp
const daysUntil = (stamp) => Math.round((new Date(`${stamp.slice(0, 10)}T12:00:00`) - new Date(`${localDay()}T12:00:00`)) / 86400000);

function ago(ts) {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h`;
}

const ICONS = {
  clima: `<path d="M17.5 19a4.5 4.5 0 100-9h-1.8A7 7 0 104 14.9"/><path d="M8 19h9.5"/>`,
  lembretes: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  financas: `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>`,
  treinos: `<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`,
  versiculo: `<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M12 7v6M9 10h6"/>`,
  sunrise: `<path d="M17 18a5 5 0 00-10 0M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4"/>`,
  clock: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
  refresh: `<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>`,
  gear: `<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>`,
  pin: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>`,
  mic: `<rect x="9" y="1" width="6" height="11" rx="3"/><path d="M19 10v1a7 7 0 01-14 0v-1M12 19v4"/>`,
  back: `<path d="M19 12H5M12 19l-7-7 7-7"/>`,
  emails: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>`,
  trash: `<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  noticias: `<path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>`,
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

const SECTIONS = [
  { id: "clima", label: "Clima" },
  { id: "lembretes", label: "Agenda" },
  { id: "financas", label: "Finanças" },
  { id: "treinos", label: "Treinos" },
  { id: "emails", label: "E-mails" },
  { id: "noticias", label: "Notícias" },
  { id: "versiculo", label: "Versículo" },
];

const TOPIC_SUGGESTIONS = ["Tecnologia", "Inteligência artificial", "Finanças", "Economia", "Saúde", "Ciência", "Esportes", "Brasil", "Mundo"];
const SOURCE_SUGGESTIONS = ["G1", "CNN Brasil", "UOL", "Folha", "Estadão", "BBC Brasil", "InfoMoney", "Tecmundo"];

const backBtn = (attr = "data-page-close") =>
  `<button type="button" class="page-btn" ${attr}>${icon("back", 14)} Voltar</button>`;

function header(kicker, title, sub, actions = backBtn()) {
  return `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <p class="page-kicker">${kicker}</p>
        <h2 class="page-title">${title}</h2>
        <p class="page-sub">${sub}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">${actions}</div>
    </div>`;
}

const skeleton = `<span class="skeleton w-20 h-7 mt-3"></span><span class="skeleton w-32 mt-2"></span>`;

// =====================================================================
// Briefing (dashboard)
// =====================================================================

function renderBriefing() {
  view.innerHTML = `
    <div class="max-w-6xl mx-auto w-full animate-slide-up">
      ${header("Central matinal", "Seu briefing do dia", esc(today()), `
        <span class="refresh-note"><span></span>Atualiza a cada <b id="bf-every">15</b> min</span>
        <button type="button" class="page-btn" id="bf-refresh">${icon("refresh", 14)} Atualizar</button>
        <button type="button" class="page-btn page-btn-primary" data-page-open="briefing-config">${icon("gear", 14)} Configurar</button>
        ${backBtn()}`)}

      <div class="grid gap-4 lg:grid-cols-3">
        <div class="lg:col-span-2 flex flex-col gap-4">
          <div class="grid gap-4 grid-cols-2">
            <div class="panel" id="bf-agenda">${skeleton}</div>
            <div class="panel" id="bf-treinos">${skeleton}</div>
          </div>

          <section class="panel panel-hero flex-1 flex flex-col">
            <div class="flex items-start gap-4">
              <span class="panel-icon panel-icon-lg">${icon("sunrise", 26)}</span>
              <div class="flex-1 min-w-0">
                <p class="page-kicker">Resumo executivo falável</p>
                <h3 class="text-2xl font-bold text-gray-100 mt-1 tracking-tight">Briefing matinal</h3>
                <p class="text-sm text-gray-400 mt-2">Consolida o que está ligado em Configurar num texto curto, lido pela voz do JARVIS. Também dispara quando você diz "bom dia", "boa tarde" ou "boa noite".</p>
                <div id="bf-chips" class="flex flex-wrap gap-2 mt-4"></div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3 mt-auto pt-6">
              <button type="button" id="bf-play" class="page-btn page-btn-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Gerar agora
              </button>
              <span class="inline-flex items-center gap-1.5 text-[11px] text-gray-500">${icon("mic", 12)} ou diga "bom dia, JARVIS"</span>
            </div>
          </section>
        </div>

        <div class="flex flex-col gap-4">
          <div class="panel" id="bf-clima">${skeleton}</div>
          <div class="panel" id="bf-next">${skeleton}</div>
          <div class="panel" id="bf-financas">${skeleton}</div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2 mt-4">
        <section class="panel" id="bf-week">
          <p class="page-kicker">Próximos 7 dias</p>
          <h3 class="text-base font-semibold text-gray-100 mt-1">Agenda consolidada</h3>
          <div class="bf-week-list mt-3">${skeleton}</div>
        </section>
        <section class="panel" id="bf-inbox">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="page-kicker">Últimas 24 horas</p>
              <h3 class="text-base font-semibold text-gray-100 mt-1">Caixa de entrada</h3>
            </div>
            <span class="panel-icon">${icon("emails")}</span>
          </div>
          <div class="bf-inbox-list mt-3">${skeleton}</div>
        </section>
      </div>
      <section class="panel mt-4" id="bf-news">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <span class="panel-icon">${icon("noticias")}</span>
            <div>
              <p class="page-kicker">Radar de notícias</p>
              <h3 class="text-base font-semibold text-gray-100 mt-1" id="bf-news-title">Manchetes do dia</h3>
            </div>
          </div>
          <div class="flex items-center gap-3" id="bf-news-actions"></div>
        </div>
        <div class="bf-news-list mt-4">${skeleton}</div>
      </section>
      <section class="panel mt-4" id="bf-verse">${skeleton}</section>
    </div>`;

  view.querySelector("#bf-play").addEventListener("click", () => {
    markBriefingHeard();
    closePage();
    input.value = briefingPrompt();
    form.dispatchEvent(new Event("submit"));
  });
  view.querySelector("#bf-refresh").addEventListener("click", () => loadPreview(true));

  fetch("/api/briefing/config").then((r) => r.json()).then((cfg) => {
    if (current !== "briefing") return;
    view.querySelector("#bf-every").textContent = cfg.atualizacao_min;
    renderChips(new Set(SECTIONS.map((s) => s.id).filter((id) => cfg.secoes[id])));
    timers.push(setInterval(() => { loadPreview(); loadNews(); }, cfg.atualizacao_min * 60000));
  });
  loadPreview();
  loadNews();
}

// ----- Radar de notícias card (loaded apart: a fresh search takes ~20s) -----
function renderNews(data) {
  const card = view.querySelector("#bf-news");
  if (!card) return;
  const list = card.querySelector(".bf-news-list");
  const actions = card.querySelector("#bf-news-actions");
  card.classList.toggle("is-off", !!data.desligado);
  actions.innerHTML = "";

  if (data.desligado) {
    list.innerHTML = `<p class="text-sm text-gray-500">Radar desligado. Escolha os assuntos e as fontes e ligue quando quiser.</p>
      <button type="button" class="stat-link" data-page-open="briefing-config" data-focus="news_assuntos">Configurar o radar →</button>`;
    return;
  }
  if (data.error) {
    list.innerHTML = `<p class="text-sm text-red-400">${esc(data.error)}</p>`;
    actions.innerHTML = `<button type="button" class="page-btn" data-news-refresh>${icon("refresh", 14)} Tentar de novo</button>`;
    return;
  }
  if (!data.itens) { // radar on, no topics (shouldn't happen: saving requires one)
    list.innerHTML = `<button type="button" class="stat-link" data-page-open="briefing-config" data-focus="news_assuntos">Defina os assuntos do radar →</button>`;
    return;
  }

  view.querySelector("#bf-news-title").textContent = data.assuntos;
  actions.innerHTML = `
    ${data.atualizado_em ? `<span class="stat-stamp !mt-0" data-ts="${data.atualizado_em}">${ago(data.atualizado_em)}</span>` : ""}
    <button type="button" class="page-btn" data-news-refresh>${icon("refresh", 14)} Atualizar notícias</button>`;
  list.innerHTML = data.itens.length
    ? `<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">${data.itens.map((n) => `
        <article class="news-item">
          ${n.assunto ? `<span class="chip">${esc(n.assunto)}</span>` : ""}
          <h4>${esc(n.titulo)}</h4>
          <p>${esc(n.resumo)}</p>
          <span class="news-source">${esc(n.fonte)}</span>
        </article>`).join("")}</div>`
    : `<p class="text-sm text-gray-500">Nada recente sobre esses assuntos nas fontes escolhidas.</p>`;
}

function newsLoading(note) {
  const list = view.querySelector("#bf-news .bf-news-list");
  if (list) list.innerHTML = `<div class="grid gap-3 md:grid-cols-3">${[1, 2, 3].map(() => `<div class="news-item"><span class="skeleton w-16"></span><span class="skeleton w-full mt-3"></span><span class="skeleton w-3/4 mt-2"></span></div>`).join("")}</div>
    <p class="text-[11px] text-gray-500 mt-3">${note}</p>`;
}

async function loadNews(force = false) {
  let slow = null;
  if (force) newsLoading("Pesquisando notícias novas… leva uns 20 segundos.");
  else {
    // Show a hint only if the answer isn't instant (first search of the configuration)
    slow = setTimeout(() => current === "briefing" && newsLoading("Buscando as notícias pela primeira vez… leva uns 20 segundos."), 800);
    timers.push(slow);
  }
  let data;
  try {
    const res = await fetch("/api/briefing/news" + (force ? "/refresh" : ""), { method: force ? "POST" : "GET" });
    data = await res.json();
    if (!res.ok) data = { error: data.error || "Não consegui buscar as notícias agora." };
  } catch {
    data = { error: "Não consegui buscar as notícias agora." };
  }
  clearTimeout(slow); // a fast (cached) answer must not be covered by the "searching" hint afterwards
  if (current === "briefing") renderNews(data);
}

view.addEventListener("click", (e) => {
  if (e.target.closest("[data-news-refresh]")) loadNews(true);
});

function renderChips(on) {
  const el = view.querySelector("#bf-chips");
  if (!el) return;
  const list = SECTIONS.filter((s) => on.has(s.id));
  el.innerHTML = list.length
    ? list.map((s) => `<span class="chip">${s.label}</span>`).join("")
    : `<span class="text-xs text-amber-400">Nenhum módulo ligado: o briefing será só a saudação.</span>`;
}

// Card body: icon + tag on top, label, big value, sub line
function statCard({ iconName, tag = "", label, value, sub = "", off = false, stamp = "" }) {
  return `
    <div class="flex items-center justify-between gap-2">
      <span class="panel-icon">${icon(iconName)}</span>
      <span class="stat-tag">${tag}</span>
    </div>
    <p class="stat-label">${label}</p>
    <p class="stat-value">${value}</p>
    <p class="stat-sub">${sub}</p>
    ${stamp ? `<p class="stat-stamp" data-ts="${stamp}">${ago(stamp)}</p>` : ""}
    ${off ? `<button type="button" class="stat-link" data-page-open="briefing-config">Ligar em Configurar →</button>` : ""}`;
}

async function loadPreview(manual) {
  const btn = view.querySelector("#bf-refresh");
  btn?.classList.add("is-spinning");
  let data;
  try {
    const res = await fetch("/api/briefing/preview");
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
  } catch {
    data = { gerado_em: Date.now() };
  }
  btn?.classList.remove("is-spinning");
  if (current !== "briefing") return;

  const put = (id, html, off = false) => {
    const el = view.querySelector(`#${id}`);
    if (!el) return;
    el.classList.toggle("is-off", off);
    el.innerHTML = html;
  };
  const offCard = (iconName, label) => statCard({ iconName, label, value: "Desligado", sub: "Fora do briefing", off: true });
  const ts = data.gerado_em;

  // Agenda (today)
  const l = data.lembretes;
  if (l === undefined) put("bf-agenda", offCard("lembretes", "Agenda"), true);
  else {
    const n = l.atrasados.length + l.hoje.length;
    put("bf-agenda", statCard({
      iconName: "lembretes", tag: "Hoje", label: "Agenda",
      value: n ? `${n}` : "Livre",
      sub: l.atrasados.length
        ? `<span class="text-amber-400">${l.atrasados.length} atrasado${l.atrasados.length > 1 ? "s" : ""}</span>${l.hoje.length ? ` · ${l.hoje.length} para hoje` : ""}`
        : n ? `compromisso${n > 1 ? "s" : ""} para hoje` : "Nada pendente para hoje",
    }));
  }

  // Treinos
  const t = data.atividades_7_dias;
  if (t === undefined) put("bf-treinos", offCard("treinos", "Treinos"), true);
  else if (!t) put("bf-treinos", statCard({ iconName: "treinos", label: "Treinos", value: "—", sub: `<button type="button" class="stat-link" data-page-open="integracoes">Conectar o Strava →</button>` }));
  else {
    const kinds = Object.entries(t.por_tipo).map(([k, v]) => `${esc(k)} ${km(v.distancia_km)}`).join(" · ");
    put("bf-treinos", statCard({
      iconName: "treinos", tag: "7 dias", label: "Treinos",
      value: `${t.total}`,
      sub: `atividade${t.total === 1 ? "" : "s"}${kinds ? ` · ${kinds}` : ""}` + (kinds ? "" : t.ultima ? ` · último: ${esc(t.ultima.tipo)} em ${esc(t.ultima.data.slice(8, 10))}/${esc(t.ultima.data.slice(5, 7))}` : " · nenhum treino registrado"),
    }));
  }

  // Clima: today's min–max like a forecast card
  const c = data.clima;
  if (c === undefined) put("bf-clima", offCard("clima", "Clima"), true);
  else if (!c || c.erro) put("bf-clima", statCard({ iconName: "clima", label: "Clima", value: "—", sub: c ? "Indisponível agora" : `<button type="button" class="stat-link" data-page-open="briefing-config" data-focus="cidade">Definir a cidade →</button>` }));
  else put("bf-clima", statCard({
    iconName: "clima", tag: esc(c.cidade.split(",")[0]), label: "Previsão de hoje",
    value: `${Math.round(c.hoje.minima)}° – ${Math.round(c.hoje.maxima)}°`,
    sub: `${c.hoje.chance_chuva}% de chance de chuva · agora ${Math.round(c.agora.temperatura)}°, ${esc(c.agora.condicao)}`,
    stamp: ts,
  }));

  // Próximo compromisso
  const week = data.agenda_7_dias;
  if (week === undefined) put("bf-next", offCard("clock", "Próximo compromisso"), true);
  else {
    const next = week.find((r) => !r.atrasado);
    const d = next && daysUntil(next.quando);
    put("bf-next", statCard({
      iconName: "clock", label: "Próximo compromisso",
      tag: next && d > 0 ? `em ${d} dia${d > 1 ? "s" : ""}` : "",
      value: next ? esc(next.texto) : "Nenhum",
      sub: next ? esc(when(next.quando)) : "Sem lembretes nos próximos 7 dias",
    }));
  }

  // Finanças
  const f = data.financas;
  if (f === undefined) put("bf-financas", offCard("financas", "Finanças"), true);
  else if (!f || f.erro) put("bf-financas", statCard({ iconName: "financas", label: "Finanças", value: "—", sub: f ? "FinPlan indisponível agora" : "FinPlan não configurado" }));
  else {
    const due = f.faturas_vencendo_em_7_dias;
    put("bf-financas", statCard({
      iconName: "financas", tag: "Saldo do mês", label: "Finanças",
      value: `<span class="${f.saldo_do_mes < 0 ? "text-red-400" : ""}">${brl(f.saldo_do_mes)}</span>`,
      sub: due.length
        ? `<span class="text-amber-400">${due.map((b) => `${esc(b.cartao)} ${brl(b.valor)} (${b.vencimento.slice(8, 10)}/${b.vencimento.slice(5, 7)})`).join(" · ")}</span>`
        : "Nenhuma fatura vencendo em 7 dias",
    }));
  }

  // Agenda consolidada (next 7 days), grouped by day
  const list = view.querySelector(".bf-week-list");
  view.querySelector("#bf-week").classList.toggle("is-off", week === undefined);
  if (week === undefined) list.innerHTML = `<p class="text-sm text-gray-500">Agenda fora do briefing.</p>`;
  else if (!week.length) list.innerHTML = `<p class="text-sm text-gray-500">Nada nos próximos 7 dias. Diga "JARVIS, me lembra…" para criar um lembrete.</p>`;
  else list.innerHTML = week.map((r) => {
    const day = r.quando.slice(0, 10);
    const d = new Date(`${day}T12:00:00`);
    return `
      <div class="week-row ${r.atrasado ? "is-late" : ""}">
        <div class="date-badge"><b>${day.slice(8, 10)}</b><span>${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span></div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-200 truncate">${esc(r.texto)}</p>
          <p class="text-[11px] text-gray-500">${esc(when(r.quando))}</p>
        </div>
        ${r.atrasado ? `<span class="status-pill status-warn"><span></span>Atrasado</span>` : ""}
      </div>`;
  }).join("");

  // Caixa de entrada
  const em = data.emails;
  const inbox = view.querySelector(".bf-inbox-list");
  view.querySelector("#bf-inbox").classList.toggle("is-off", em === undefined);
  if (em === undefined) inbox.innerHTML = `<p class="text-sm text-gray-500">E-mails fora do briefing.</p><button type="button" class="stat-link" data-page-open="briefing-config">Ligar em Configurar →</button>`;
  else if (!em) inbox.innerHTML = `<p class="text-sm text-gray-500">Nenhuma conta conectada.</p><button type="button" class="stat-link" data-page-open="briefing-config" data-focus="email">Adicionar conta de e-mail →</button>`;
  else inbox.innerHTML = em.map((c) => c.erro
    ? `<div class="mail-account"><p class="text-xs text-gray-300 truncate">${esc(c.conta)}</p><p class="text-xs text-red-400 mt-1">${esc(c.erro)}</p></div>`
    : `<div class="mail-account">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-gray-400 truncate">${esc(c.conta)}</p>
          <span class="status-pill ${c.nao_lidos ? "status-on" : "status-off"}"><span></span>${c.nao_lidos} não lido${c.nao_lidos === 1 ? "" : "s"}</span>
        </div>
        ${c.recentes.slice(0, 4).map((m) => `
          <div class="mail-row">
            <p class="text-xs font-semibold text-gray-200 truncate">${esc(m.de)}</p>
            <p class="text-xs text-gray-400 truncate">${esc(m.assunto)}</p>
          </div>`).join("")}
        ${c.nao_lidos === 0 ? `<p class="text-xs text-gray-500 mt-2">Tudo em dia.</p>` : ""}
      </div>`).join("");

  // Versículo
  const v = data.versiculo_do_dia;
  put("bf-verse", `
    <div class="flex items-center gap-3">
      <span class="panel-icon">${icon("versiculo")}</span>
      <p class="stat-label !mt-0">Versículo do dia</p>
    </div>
    ${v
      ? `<p class="mt-4 text-sm text-gray-200 italic leading-relaxed">“${esc(v.text)}”</p><p class="mt-2 text-xs text-jarvis-400 font-mono">${esc(v.ref)} · NVI</p>`
      : `<p class="mt-4 text-sm text-gray-500">Fora do briefing.</p>`}`, v === undefined);

  if (manual) view.querySelector("#bf-refresh")?.blur();
}

// "há X min" labels stay fresh while the screen is open
setInterval(() => {
  view.querySelectorAll("[data-ts]").forEach((el) => { el.textContent = ago(Number(el.dataset.ts)); });
}, 30000);

// =====================================================================
// Configurar briefing
// =====================================================================
const LENGTHS = [
  { id: "curto", label: "Curto", desc: "3 a 4 frases, direto ao ponto" },
  { id: "normal", label: "Normal", desc: "5 a 8 frases (padrão)" },
  { id: "detalhado", label: "Detalhado", desc: "Até 12 frases, com mais contexto" },
];

function renderBriefingConfig({ focus } = {}) {
  view.innerHTML = `
    <div class="max-w-5xl mx-auto w-full animate-slide-up">
      ${header("Preferências e fontes", "Configurar briefing", "O que o JARVIS usa no seu “bom dia”", backBtn('data-page-open="briefing"'))}

      <section class="panel mb-4" id="mail-panel">
        <div class="panel-head">
          <span class="panel-icon">${icon("emails")}</span>
          <div class="flex-1">
            <h3>Contas de e-mail</h3>
            <p>Leitura dos não lidos para a triagem do briefing. Somente leitura: nada é marcado como lido.</p>
          </div>
        </div>
        <div id="mail-list" class="space-y-2 mt-4"><span class="skeleton w-48"></span></div>
        <button type="button" class="nav-subitem text-jarvis-400 mt-2 !w-auto" id="mail-add-toggle">${icon("plus", 14)} Adicionar conta</button>
        <div id="mail-form" class="hidden mt-3 p-4 rounded-xl border border-white/10 bg-black/20">
          <div class="grid gap-3 md:grid-cols-3">
            <label class="block">
              <span class="field-label">Provedor</span>
              <select class="field" data-mail="provider">
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook / Hotmail</option>
                <option value="yahoo">Yahoo</option>
                <option value="icloud">iCloud</option>
                <option value="outro">Outro (IMAP)</option>
              </select>
            </label>
            <label class="block">
              <span class="field-label">E-mail</span>
              <input class="field" type="email" data-mail="email" placeholder="voce@gmail.com" autocomplete="off">
            </label>
            <label class="block">
              <span class="field-label">Senha de app</span>
              <input class="field" type="password" data-mail="password" placeholder="•••• •••• •••• ••••" autocomplete="new-password">
            </label>
            <label class="md:col-span-3 hidden" data-mail-host>
              <span class="field-label">Servidor IMAP (SSL, porta 993)</span>
              <input class="field" data-mail="host" placeholder="imap.seuprovedor.com">
            </label>
          </div>
          <p class="field-hint" data-mail-hint></p>
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <span id="mail-status" class="text-xs text-gray-500 flex-1"></span>
            <button type="button" class="page-btn" id="mail-cancel">Cancelar</button>
            <button type="button" class="page-btn page-btn-primary" id="mail-save">Testar e salvar</button>
          </div>
        </div>
      </section>

      <form id="bf-form" class="space-y-4" autocomplete="off">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-icon">${icon("pin")}</span>
            <div>
              <h3>Radar e contexto</h3>
              <p>Localidade do clima e frequência de atualização da tela.</p>
            </div>
          </div>
          <div class="grid gap-4 md:grid-cols-2 mt-5">
            <label class="block">
              <span class="field-label">Localidade</span>
              <span class="field-icon">${icon("pin", 15)}<input name="cidade" class="field" placeholder="Cidade, UF (ex.: São Pedro da Aldeia, RJ)" maxlength="80"></span>
              <span class="field-hint">Usada na previsão do tempo (Open-Meteo).</span>
            </label>
            <label class="block">
              <span class="field-label">Atualização automática</span>
              <span class="field-icon">${icon("refresh", 15)}
                <select name="atualizacao_min" class="field">
                  ${[5, 15, 30, 60].map((m) => `<option value="${m}">A cada ${m} minutos</option>`).join("")}
                </select>
              </span>
              <span class="field-hint">Recarrega clima, agenda, finanças e treinos enquanto a tela estiver aberta.</span>
            </label>
          </div>
        </section>

        <section class="panel" id="news-panel">
          <div class="panel-head">
            <span class="panel-icon">${icon("noticias")}</span>
            <div>
              <h3>Radar de notícias</h3>
              <p>Manchetes dos assuntos que você escolher, das fontes que preferir.</p>
            </div>
          </div>

          <label class="option-card mt-5">
            <input type="checkbox" name="secao" value="noticias">
            <span class="option-body"><b>Radar ligado</b><span>Inclui as manchetes no briefing e nesta tela. Cada atualização faz uma pesquisa no Gemini (gasta tokens); o resultado fica guardado por 2 horas.</span></span>
          </label>

          <div class="news-fields">
            <label class="block mt-5">
              <span class="field-label">Assuntos</span>
              <input name="news_assuntos" class="field" maxlength="200" placeholder="Ex.: tecnologia, finanças, saúde">
            </label>
            <div class="flex flex-wrap gap-1.5 mt-2" data-suggest="news_assuntos">
              ${TOPIC_SUGGESTIONS.map((t) => `<button type="button" class="suggest-chip">+ ${t}</button>`).join("")}
            </div>

            <div class="grid gap-5 md:grid-cols-[auto,1fr] mt-5">
              <div>
                <span class="field-label">Quantidade de notícias</span>
                <div class="segmented">
                  ${[1, 3, 6].map((n) => `<label><input type="radio" name="news_qtd" value="${n}"><span>${n}</span></label>`).join("")}
                </div>
              </div>
              <div>
                <label class="block">
                  <span class="field-label">Fontes preferidas</span>
                  <input name="news_fontes" class="field" maxlength="200" placeholder="Ex.: G1, CNN Brasil (vazio = qualquer veículo confiável)">
                </label>
                <div class="flex flex-wrap gap-1.5 mt-2" data-suggest="news_fontes">
                  ${SOURCE_SUGGESTIONS.map((f) => `<button type="button" class="suggest-chip">+ ${f}</button>`).join("")}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-icon">${icon("sunrise")}</span>
            <div>
              <h3>Briefing falado</h3>
              <p>Duração, módulos e comportamento do “bom dia”.</p>
            </div>
          </div>

          <span class="field-label mt-5">Módulos do bom dia</span>
          <div class="flex flex-wrap gap-2">
            ${SECTIONS.filter((s) => s.id !== "noticias").map((s) => `
              <label class="toggle-chip"><input type="checkbox" name="secao" value="${s.id}"><span>${icon(s.id === "lembretes" ? "lembretes" : s.id, 14)} ${s.label}</span></label>`).join("")}
          </div>
          <span class="field-hint">Desligar um módulo tira ele da fala e desta tela.</span>

          <span class="field-label mt-5">Duração</span>
          <div class="grid gap-3 sm:grid-cols-3">
            ${LENGTHS.map((l) => `
              <label class="option-card">
                <input type="radio" name="tamanho" value="${l.id}">
                <span class="option-body"><b>${l.label}</b><span>${l.desc}</span></span>
              </label>`).join("")}
          </div>

          <span class="field-label mt-5">Comportamento</span>
          <label class="option-card">
            <input type="checkbox" name="abrir_automatico">
            <span class="option-body"><b>Abrir o briefing ao iniciar o dia</b><span>Na primeira vez que você abrir o JARVIS no dia, esta tela aparece sozinha.</span></span>
          </label>

          <label class="block mt-5">
            <span class="field-label">Observações para o JARVIS</span>
            <textarea name="observacoes" class="field h-28 resize-none" maxlength="300" placeholder="Ex.: comece pela agenda; se eu não treinei, me dê um incentivo; fale das faturas só se passarem de R$ 500."></textarea>
            <span class="field-hint">Até 300 caracteres. O JARVIS segue isso ao montar a fala.</span>
          </label>
        </section>

        <div class="form-bar">
          <span id="bf-status" class="text-xs text-gray-500 flex-1"></span>
          <button type="button" class="page-btn" data-page-open="briefing">Cancelar</button>
          <button type="submit" class="page-btn page-btn-primary">Salvar alterações</button>
        </div>
      </form>
    </div>`;

  const formEl = view.querySelector("#bf-form");
  formEl.addEventListener("change", () => { view.querySelector("#bf-status").textContent = ""; });

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = view.querySelector("#bf-status");
    const data = new FormData(formEl);
    const on = new Set(data.getAll("secao"));
    const body = {
      cidade: data.get("cidade"),
      secoes: Object.fromEntries(SECTIONS.map((s) => [s.id, on.has(s.id)])),
      tamanho: data.get("tamanho"),
      observacoes: data.get("observacoes"),
      atualizacao_min: Number(data.get("atualizacao_min")),
      abrir_automatico: data.has("abrir_automatico"),
      noticias: { assuntos: data.get("news_assuntos"), quantidade: Number(data.get("news_qtd")), fontes: data.get("news_fontes") },
    };
    status.className = "text-xs text-gray-500 flex-1";
    status.textContent = "Salvando…";
    try {
      const res = await fetch("/api/briefing/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não consegui salvar.");
      status.className = "text-xs text-emerald-400 flex-1";
      status.textContent = "Alterações salvas ✓";
      setTimeout(() => current === "briefing-config" && openPage("briefing"), 700);
    } catch (err) {
      status.className = "text-xs text-red-400 flex-1";
      status.textContent = err.message;
    }
  });

  fetch("/api/briefing/config").then((r) => r.json()).then((cfg) => {
    if (current !== "briefing-config") return;
    const el = formEl.elements;
    el.cidade.value = cfg.cidade || "";
    el.observacoes.value = cfg.observacoes || "";
    el.atualizacao_min.value = String(cfg.atualizacao_min);
    el.abrir_automatico.checked = !!cfg.abrir_automatico;
    el.news_assuntos.value = cfg.noticias.assuntos || "";
    el.news_fontes.value = cfg.noticias.fontes || "";
    formEl.querySelectorAll('[name="news_qtd"]').forEach((r) => { r.checked = Number(r.value) === cfg.noticias.quantidade; });
    formEl.querySelectorAll('[name="secao"]').forEach((cb) => { cb.checked = !!cfg.secoes[cb.value]; });
    formEl.querySelectorAll('[name="tamanho"]').forEach((r) => { r.checked = r.value === cfg.tamanho; });
    syncNewsPanel();
    if (focus && el[focus]) {
      el[focus].focus();
      el[focus].scrollIntoView({ block: "center" });
    }
  });

  // Radar off: fields stay editable but dimmed
  const newsToggle = formEl.querySelector('[name="secao"][value="noticias"]');
  const syncNewsPanel = () => formEl.querySelector(".news-fields").classList.toggle("is-muted", !newsToggle.checked);
  newsToggle.addEventListener("change", syncNewsPanel);

  // Suggestion chips append to the field (comma separated, no duplicates)
  formEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".suggest-chip");
    if (!chip) return;
    const field = formEl.elements[chip.parentElement.dataset.suggest];
    const value = chip.textContent.replace(/^\+\s*/, "");
    const parts = field.value.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.some((p) => p.toLowerCase() === value.toLowerCase())) parts.push(value);
    field.value = parts.join(", ");
    formEl.dispatchEvent(new Event("change"));
  });

  initMailPanel(focus === "email");
}

// ----- Contas de e-mail -----
const MAIL_HINTS = {
  gmail: 'No Gmail use uma <b>senha de app</b> (não a sua senha): ative a verificação em 2 etapas e crie em <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" class="text-jarvis-400 underline">myaccount.google.com/apppasswords</a>. O IMAP já vem ativo.',
  outlook: "No Outlook/Hotmail, crie uma senha de app em Segurança da conta Microsoft (precisa da verificação em 2 etapas).",
  yahoo: "No Yahoo, gere uma senha de app em Segurança da conta.",
  icloud: "No iCloud, gere uma senha específica de app em appleid.apple.com.",
  outro: "Use os dados IMAP do seu provedor (conexão SSL na porta 993).",
};

async function loadMailAccounts() {
  const list = view.querySelector("#mail-list");
  if (!list) return;
  try {
    const { accounts } = await (await fetch("/api/email/accounts")).json();
    if (!view.querySelector("#mail-list")) return;
    list.innerHTML = accounts.length
      ? accounts.map((a) => `
          <div class="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-black/20">
            <span class="status-pill status-on"><span></span>${esc(a.label)}</span>
            <span class="text-sm text-gray-200 truncate flex-1">${esc(a.email)}</span>
            <button type="button" class="page-btn page-btn-danger !px-2" data-mail-remove="${esc(a.id)}" data-mail-email="${esc(a.email)}" title="Remover conta">${icon("trash", 14)}</button>
          </div>`).join("")
      : `<p class="text-sm text-gray-500">Nenhuma conta conectada ainda.</p>`;
  } catch {
    list.innerHTML = `<p class="text-sm text-red-400">Não consegui carregar as contas.</p>`;
  }
}

function initMailPanel(openForm) {
  const panel = view.querySelector("#mail-panel");
  const formBox = panel.querySelector("#mail-form");
  const field = (k) => panel.querySelector(`[data-mail="${k}"]`);
  const status = panel.querySelector("#mail-status");

  const syncProvider = () => {
    const p = field("provider").value;
    panel.querySelector("[data-mail-host]").classList.toggle("hidden", p !== "outro");
    panel.querySelector("[data-mail-hint]").innerHTML = MAIL_HINTS[p];
  };
  const toggleForm = (open) => {
    formBox.classList.toggle("hidden", !open);
    panel.querySelector("#mail-add-toggle").classList.toggle("hidden", open);
    status.textContent = "";
    if (open) { syncProvider(); field("email").focus(); }
    else ["email", "password", "host"].forEach((k) => { field(k).value = ""; });
  };

  field("provider").addEventListener("change", syncProvider);
  panel.querySelector("#mail-add-toggle").addEventListener("click", () => toggleForm(true));
  panel.querySelector("#mail-cancel").addEventListener("click", () => toggleForm(false));
  formBox.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); panel.querySelector("#mail-save").click(); } });

  panel.querySelector("#mail-save").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    status.className = "text-xs text-gray-400 flex-1";
    status.textContent = "Conectando à caixa de entrada…";
    try {
      const res = await fetch("/api/email/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: field("provider").value, email: field("email").value.trim(), password: field("password").value, host: field("host").value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não consegui conectar.");
      toggleForm(false);
      status.className = "text-xs text-emerald-400 flex-1";
      loadMailAccounts();
      window.dispatchEvent(new Event("jarvis:integrations-changed"));
    } catch (err) {
      status.className = "text-xs text-red-400 flex-1";
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  panel.addEventListener("click", async (e) => {
    const rm = e.target.closest("[data-mail-remove]");
    if (!rm) return;
    if (!confirm(`Remover a conta ${rm.dataset.mailEmail}? A senha de app guardada é apagada.`)) return;
    await fetch(`/api/email/accounts/${encodeURIComponent(rm.dataset.mailRemove)}`, { method: "DELETE" });
    loadMailAccounts();
  });

  loadMailAccounts();
  if (openForm) {
    toggleForm(true);
    panel.scrollIntoView({ block: "start" });
  }
}

// "Abrir o briefing ao iniciar o dia": first visit of the day, on the dashboard
(async () => {
  if (CAME_FROM_STRAVA) return;
  try {
    const cfg = await (await fetch("/api/briefing/config")).json();
    const KEY = "jarvis-briefing-autoopen";
    if (!cfg.abrir_automatico || localStorage.getItem(KEY) === localDay()) return;
    localStorage.setItem(KEY, localDay());
    if (document.getElementById("welcome") && !current) openPage("briefing");
  } catch {}
})();

// =====================================================================
// Integrações
// =====================================================================
const STRAVA_LOGO = `<svg width="22" height="22" viewBox="0 0 24 24" fill="#fc4c02" aria-hidden="true"><path d="M15.39 17.94l-2.09-4.12h-3.07l5.16 10.18 5.15-10.18h-3.07M10.34 0L3.37 13.82h4.1l2.87-5.66 2.86 5.66h4.1z"/></svg>`;

function pill(state, text) {
  return `<span class="status-pill status-${state}"><span></span>${text}</span>`;
}

async function renderIntegrations() {
  view.innerHTML = `
    <div class="max-w-6xl mx-auto w-full animate-slide-up">
      ${header("Dados e automação", "Integrações", "Fontes que o JARVIS consulta. Todas são somente leitura.")}
      <div id="int-grid" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        ${[1, 2, 3].map(() => `<div class="panel h-48"><span class="skeleton w-24"></span><span class="skeleton w-full mt-4"></span><span class="skeleton w-2/3 mt-2"></span></div>`).join("")}
      </div>
    </div>`;

  let s;
  try {
    s = await (await fetch("/api/integrations")).json();
  } catch {
    if (current === "integracoes") view.querySelector("#int-grid").innerHTML = `<p class="text-sm text-red-400">Não consegui carregar as integrações.</p>`;
    return;
  }
  if (current !== "integracoes") return;

  const st = s.strava;
  const stravaState = !st.configured ? pill("off", "Não configurado") : st.connected ? pill("on", "Conectado") : pill("warn", "Desconectado");
  const fp = s.finplan;

  view.querySelector("#int-grid").innerHTML = `
    <section class="panel flex flex-col">
      <div class="flex items-center justify-between">
        <span class="panel-icon">${STRAVA_LOGO}</span>
        ${stravaState}
      </div>
      <h3 class="integ-title">Strava</h3>
      <p class="integ-desc">Treinos do Amazfit Balance (Zepp → Strava): corridas, caminhadas, pedais, distância, ritmo e FC.</p>
      ${st.connected ? `<p class="integ-meta">Conta: <span class="text-gray-200">${esc(st.athlete?.nome || "—")}</span></p>` : ""}
      ${!st.configured ? `<p class="integ-meta">Defina STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET no .env do servidor.</p>` : ""}
      <p class="integ-result" data-result="strava"></p>
      <div class="flex flex-wrap gap-2 mt-auto pt-4">
        ${st.configured && !st.connected ? `<button type="button" class="page-btn page-btn-primary" data-int="strava-connect">Conectar</button>` : ""}
        ${st.connected ? `<button type="button" class="page-btn" data-int="strava-test">Testar leitura</button>
          <button type="button" class="page-btn page-btn-danger" data-int="strava-disconnect">Desconectar</button>` : ""}
      </div>
    </section>

    <section class="panel flex flex-col">
      <div class="flex items-center justify-between">
        <span class="panel-icon">${icon("financas", 20)}</span>
        ${fp.configured ? pill("on", "Configurado") : pill("off", "Não configurado")}
      </div>
      <h3 class="integ-title">FinPlan</h3>
      <p class="integ-desc">Saldo do mês, faturas por cartão e vencimentos, lidos do seu app de finanças.</p>
      ${fp.configured ? `<p class="integ-meta">Servidor: <span class="text-gray-200">${esc(fp.host)}</span></p>` : `<p class="integ-meta">Defina FINPLAN_URL e FINPLAN_API_TOKEN no .env do servidor.</p>`}
      <p class="integ-result" data-result="finplan"></p>
      <div class="flex flex-wrap gap-2 mt-auto pt-4">
        ${fp.configured ? `<button type="button" class="page-btn" data-int="finplan-test">Testar conexão</button>` : ""}
      </div>
    </section>

    <section class="panel flex flex-col">
      <div class="flex items-center justify-between">
        <span class="panel-icon">${icon("emails", 20)}</span>
        ${s.email.contas ? pill("on", "Conectado") : pill("off", "Sem contas")}
      </div>
      <h3 class="integ-title">E-mail</h3>
      <p class="integ-desc">Não lidos das últimas 24h (remetente e assunto) para a triagem do briefing. Somente leitura, via IMAP.</p>
      <p class="integ-result" data-result="email"></p>
      <div class="flex flex-wrap gap-2 mt-auto pt-4">
        ${s.email.contas ? `<button type="button" class="page-btn" data-int="email-test">Testar leitura</button>` : ""}
        <button type="button" class="page-btn" data-page-open="briefing-config" data-focus="email">${s.email.contas ? "Gerenciar contas" : "Adicionar conta"}</button>
      </div>
    </section>

    <section class="panel flex flex-col">
      <div class="flex items-center justify-between">
        <span class="panel-icon">${icon("clima", 20)}</span>
        ${s.clima.cidade ? pill("on", "Ativo") : pill("warn", "Sem cidade")}
      </div>
      <h3 class="integ-title">Clima</h3>
      <p class="integ-desc">Previsão do Open-Meteo (gratuito, sem chave) usada no briefing e nas perguntas sobre o tempo.</p>
      <p class="integ-meta">Cidade: <span class="text-gray-200">${esc(s.clima.cidade || "não definida")}</span></p>
      <div class="flex flex-wrap gap-2 mt-auto pt-4">
        <button type="button" class="page-btn" data-page-open="briefing" data-focus="cidade">Alterar cidade</button>
      </div>
    </section>`;
}

view.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-int]");
  if (!btn) return;
  const action = btn.dataset.int;
  const out = (name, html, ok) => {
    const el = view.querySelector(`[data-result="${name}"]`);
    el.className = `integ-result ${ok === undefined ? "text-gray-400" : ok ? "text-emerald-400" : "text-red-400"}`;
    el.innerHTML = html;
  };

  if (action === "strava-connect") {
    location.href = "/api/strava/connect"; // Strava consent page, then back to /?strava=...
  } else if (action === "strava-disconnect") {
    if (!confirm("Desconectar o Strava? O JARVIS deixa de ver seus treinos.")) return;
    await fetch("/api/strava/disconnect", { method: "POST" });
    window.dispatchEvent(new Event("jarvis:integrations-changed"));
    renderIntegrations();
  } else if (action === "strava-test") {
    out("strava", "Consultando…");
    const r = await (await fetch("/api/integrations/strava/test", { method: "POST" })).json();
    out("strava", r.ok
      ? `OK: ${r.atividades} atividade${r.atividades === 1 ? "" : "s"} nos últimos 7 dias${r.ultima ? `. Última: ${esc(r.ultima.tipo)} em ${esc(r.ultima.data.slice(8, 10))}/${esc(r.ultima.data.slice(5, 7))}` : ""}.`
      : esc(r.error), r.ok);
  } else if (action === "email-test") {
    out("email", "Consultando…");
    const r = await (await fetch("/api/email/test", { method: "POST" })).json();
    out("email", r.contas
      ? r.contas.map((c) => c.erro ? `${esc(c.conta)}: ${esc(c.erro)}` : `${esc(c.conta)}: ${c.nao_lidos} não lido${c.nao_lidos === 1 ? "" : "s"} nas últimas 24h`).join("<br>")
      : esc(r.error), r.ok);
  } else if (action === "finplan-test") {
    out("finplan", "Consultando…");
    const r = await (await fetch("/api/integrations/finplan/test", { method: "POST" })).json();
    out("finplan", r.ok ? `OK: ${r.cartoes} cart${r.cartoes === 1 ? "ão encontrado" : "ões encontrados"}.` : esc(r.error), r.ok);
  }
});
