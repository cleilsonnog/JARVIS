// ===== Pop-out window: renders one dashboard card =====
import { WIDGETS, refreshWidgets, startWidgetTimers, mountWidgets } from "./widgets.js";
import { mountStandaloneReactor } from "./core.js";
import "./theme.js";

const root = document.getElementById("widget-root");
const id = new URLSearchParams(location.search).get("id");
const widget = WIDGETS[id];

if (!widget) {
  root.innerHTML = `<p class="m-auto text-sm text-gray-500">Widget não encontrado.</p>`;
} else {
  document.title = `JARVIS · ${widget.title}`;
  if (id === "core") {
    // Reactor only, filling the window (made to be maximized on another monitor)
    root.className = "reactor-window";
    root.innerHTML = `<p class="reactor-hint">Toque: falar · Duplo clique: tela cheia</p>`;
    mountStandaloneReactor(root);
  } else {
    root.innerHTML = widget.render();
    mountWidgets(root);
  }
  startWidgetTimers();
  refreshWidgets();
}

// Prompts (actions card, reminder hint) run in the main JARVIS window
root.addEventListener("click", (e) => {
  const prompt = e.target.closest(".dash-prompt");
  if (!prompt || !window.opener || window.opener.closed) return;
  window.opener.postMessage(
    { type: "jarvis-prompt", prompt: prompt.dataset.prompt, fill: prompt.dataset.fill !== undefined },
    location.origin,
  );
});
