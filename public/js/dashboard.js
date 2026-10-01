// ===== Dashboard: layout, drag, resize, minimize, pop-out =====
import { WIDGETS, DEFAULT_ORDER, refreshWidgets, startWidgetTimers, mountWidgets } from "./widgets.js";
import { speak } from "./tts.js";

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const form = document.getElementById("input-form");

const LAYOUT_KEY = "jarvis-dash-layout";  // card order: "id|id|..."
const SIZES_KEY = "jarvis-dash-sizes";    // { id: { w, h, min } }
const ROW_SNAP = 20;                      // height snaps to multiples of this (px)
const MIN_W = 3;                          // columns
const MIN_H = 100;                        // px
const LG = window.matchMedia("(min-width: 1024px)"); // custom widths apply from here up

let sortable = null;
const popouts = new Map(); // id -> Window

// ----- Persistence -----
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

let sizes = loadJSON(SIZES_KEY, {});
const saveSizes = () => localStorage.setItem(SIZES_KEY, JSON.stringify(sizes));

function getSavedOrder() {
  const order = (localStorage.getItem(LAYOUT_KEY) || "").split("|").filter((id) => WIDGETS[id]);
  if (order.length === 0) return [...DEFAULT_ORDER];
  // Widgets added after the layout was saved go to their default position, not the end
  DEFAULT_ORDER.forEach((id, i) => {
    if (!order.includes(id)) order.splice(Math.min(i, order.length), 0, id);
  });
  return order;
}

// ----- Render -----
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function renderDashboard() {
  chat.innerHTML = `
    <div id="welcome" class="max-w-7xl mx-auto w-full animate-slide-up">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div class="flex items-center gap-4">
          <div>
            <h2 class="text-xl font-light text-gray-200">${greeting()}. Eu sou o <span class="text-jarvis-400 font-semibold tracking-wider">JARVIS</span></h2>
            <p class="flex items-center gap-2 text-[11px] text-gray-500 font-mono uppercase tracking-wider mt-0.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
              Todos os sistemas operacionais
            </p>
          </div>
        </div>
        <button type="button" id="dash-reset" class="flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-gray-500 border border-white/10 hover:text-jarvis-400 hover:border-jarvis-500/40 transition-colors" title="Volta ordem, tamanhos e cards minimizados ao padrão">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Restaurar layout
        </button>
      </div>
      <div id="dash-grid" class="grid grid-cols-12 gap-4 grid-flow-dense">
        ${getSavedOrder().map((id) => WIDGETS[id].render()).join("")}
      </div>
    </div>`;

  document.querySelectorAll("#dash-grid > [data-widget]").forEach((card) => {
    applySize(card);
    applyPopped(card);
    initResize(card);
  });
  initSortable();
  mountWidgets(document.getElementById("dash-grid"));
  refreshWidgets();
}

function applySize(card) {
  const id = card.dataset.widget;
  const s = sizes[id] || {};
  card.style.setProperty("--w", s.w || WIDGETS[id].w);
  card.style.height = s.h && !s.min ? `${s.h}px` : "";
  card.classList.toggle("is-min", !!s.min);
}

function applyPopped(card) {
  const win = popouts.get(card.dataset.widget);
  card.classList.toggle("is-popped", !!win && !win.closed);
}

// ----- Drag to reorder -----
function initSortable() {
  const grid = document.getElementById("dash-grid");
  if (!window.Sortable || !grid) return;
  sortable = Sortable.create(grid, {
    handle: ".hud-handle, .core-slot",  // the core slot has no header: drag it anywhere
    draggable: "[data-widget]",
    filter: ".hud-btn",
    preventOnFilter: false,
    dataIdAttr: "data-widget",
    animation: 200,
    delay: 150,
    delayOnTouchOnly: true,
    ghostClass: "hud-ghost",
    chosenClass: "hud-chosen",
    dragClass: "hud-drag",
    onEnd: () => localStorage.setItem(LAYOUT_KEY, sortable.toArray().join("|")),
  });
}

// ----- Resize from the bottom-right corner (snaps to grid columns / row steps) -----
function initResize(card) {
  const handle = card.querySelector(".hud-resize");
  const id = card.dataset.widget;

  handle.addEventListener("pointerdown", (e) => {
    if (card.classList.contains("is-min")) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);

    const grid = card.parentElement;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const colW = (grid.clientWidth - gap * 11) / 12;
    const start = { x: e.clientX, y: e.clientY, rect: card.getBoundingClientRect() };
    const next = { ...sizes[id] };
    card.classList.add("is-resizing");

    const onMove = (ev) => {
      if (LG.matches) {
        const cols = Math.round((start.rect.width + ev.clientX - start.x + gap) / (colW + gap));
        next.w = Math.min(12, Math.max(MIN_W, cols));
        card.style.setProperty("--w", next.w);
      }
      const h = Math.round((start.rect.height + ev.clientY - start.y) / ROW_SNAP) * ROW_SNAP;
      next.h = Math.max(MIN_H, h);
      card.style.height = `${next.h}px`;
      card.dataset.size = `${LG.matches ? `${next.w}/12 · ` : ""}${next.h}px`;
    };

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      card.classList.remove("is-resizing");
      delete card.dataset.size;
      sizes[id] = next;
      saveSizes();
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp, { once: true });
    handle.addEventListener("pointercancel", onUp, { once: true });
  });

  // Double-click restores this card's default size
  handle.addEventListener("dblclick", () => {
    sizes[id] = { min: sizes[id]?.min };
    saveSizes();
    applySize(card);
  });
}

// ----- Pop-out windows (drag them to another monitor) -----
function popOut(card) {
  const id = card.dataset.widget;
  const r = card.getBoundingClientRect();
  // The reactor opens big (meant to be maximized on another screen); cards open at their size
  const [w, h] = id === "core" ? [960, 720] : [Math.round(r.width), Math.round(Math.max(r.height, 160))];
  const features = `popup,width=${w},height=${h},left=${window.screenX + Math.round(r.left)},top=${window.screenY + Math.round(r.top)}`;
  const win = window.open(`/widget.html?id=${id}`, `jarvis-widget-${id}`, features);
  if (!win) {
    alert("O navegador bloqueou a janela. Permita pop-ups para este site.");
    return;
  }
  popouts.set(id, win);
  applyPopped(card);
}

function dock(card) {
  const id = card.dataset.widget;
  popouts.get(id)?.close();
  popouts.delete(id);
  applyPopped(card);
}

// Bring cards back when their window is closed by the user
setInterval(() => {
  for (const [id, win] of popouts) {
    if (!win.closed) continue;
    popouts.delete(id);
    const card = document.querySelector(`#dash-grid [data-widget="${id}"]`);
    if (card) applyPopped(card);
  }
}, 1000);

// ----- Interactions -----
function submitPrompt(text, fillOnly) {
  input.value = text;
  // fillOnly: just prefill the input so the user can complete the command
  if (fillOnly) input.focus();
  else form.dispatchEvent(new Event("submit"));
}

chat.addEventListener("click", (e) => {
  const prompt = e.target.closest(".dash-prompt");
  if (prompt) {
    submitPrompt(prompt.dataset.prompt, prompt.dataset.fill !== undefined);
    return;
  }

  const speakBtn = e.target.closest("[data-speak]");
  if (speakBtn) {
    speak(speakBtn.dataset.speak);
    return;
  }

  const action = e.target.closest("[data-action]");
  if (action) {
    const card = action.closest("[data-widget]");
    const id = card.dataset.widget;
    if (action.dataset.action === "min") {
      sizes[id] = { ...sizes[id], min: !sizes[id]?.min };
      saveSizes();
      applySize(card);
    } else if (action.dataset.action === "popout") {
      popOut(card);
    } else if (action.dataset.action === "dock") {
      dock(card);
    }
    return;
  }

  if (e.target.closest("#dash-reset")) {
    localStorage.removeItem(LAYOUT_KEY);
    sizes = {};
    saveSizes();
    document.querySelectorAll("#dash-grid > [data-widget]").forEach(applySize);
    sortable?.sort(DEFAULT_ORDER, true);
  }
});

// Prompts clicked inside a pop-out window are sent here
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.type !== "jarvis-prompt") return;
  window.focus();
  submitPrompt(e.data.prompt, e.data.fill);
});

startWidgetTimers();
renderDashboard();
