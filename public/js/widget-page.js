// ===== Pop-out window: renders one dashboard card =====
import { WIDGETS, refreshWidgets, startWidgetTimers } from "./widgets.js";
import "./theme.js";

const root = document.getElementById("widget-root");
const id = new URLSearchParams(location.search).get("id");
const widget = WIDGETS[id];

if (!widget) {
  root.innerHTML = `<p class="m-auto text-sm text-gray-500">Widget não encontrado.</p>`;
} else {
  document.title = `JARVIS · ${widget.title}`;
  root.innerHTML = widget.render();
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
