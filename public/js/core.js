// ===== JARVIS core: animated reactor drawn as the dashboard background =====
// The grid only holds an invisible, frameless slot ("core-slot") that keeps space free and shows
// the status. The reactor itself is a layer *behind* the grid, centered on that slot and bigger
// than it, so its glow and particles pass behind the neighbouring (glass) cards.
//
// It reflects the assistant state, read from <body data-*> flags set by tts.js / stt.js / app.js:
//   speaking > thinking > listening (active) > waiting for wake word > idle

const STATES = {
  idle:      { label: "Online",              speed: 1,   glow: 0.55 },
  wake:      { label: "Aguardando “JARVIS”", speed: 1.3, glow: 0.7 },
  listening: { label: "Ouvindo",             speed: 2.2, glow: 0.95 },
  thinking:  { label: "Processando",         speed: 3.2, glow: 0.85 },
  speaking:  { label: "Falando",             speed: 1.8, glow: 1 },
};

const LAYER_SCALE = 1.45; // reactor layer size relative to the slot's larger side
const LAYER_MAX = 760;
const FIT_RESERVE = 110;  // px kept free under the centered reactor    // px, so a very wide slot doesn't produce a giant reactor
const STAGE_RATIO = 0.62; // rings diameter relative to the layer

function currentState() {
  const d = document.body.dataset;
  if (d.speaking) return "speaking";
  if (d.thinking) return "thinking";
  if (d.listen === "active") return "listening";
  if (d.listen === "wake") return "wake";
  return "idle";
}

// Grid item: no frame, no header. Drag it anywhere to move the reactor; the corner resizes it.
export function coreSlot(colClasses) {
  return `
    <section class="core-slot ${colClasses}" data-widget="core" data-rows="2" title="Toque para falar · arraste para mover o núcleo">
      <div class="core-status"><span class="core-dot"></span><span class="core-label">Online</span></div>
      <button type="button" class="hud-btn core-pop" data-action="popout" title="Destacar o reator em janela (outro monitor)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
      </button>
      <span class="hud-resize" title="Arraste para redimensionar · duplo clique restaura"></span>
    </section>`;
}

function layerMarkup() {
  return `
    <canvas class="core-particles"></canvas>
    <div class="core-stage">
      <svg viewBox="0 0 200 200" class="core-svg" aria-hidden="true">
        <defs>
          <radialGradient id="core-heart-grad">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
            <stop offset="35%" stop-color="var(--theme-accent)" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="var(--theme-accent)" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="core-halo-grad">
            <stop offset="0%" stop-color="var(--theme-accent)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--theme-accent)" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="99" fill="url(#core-halo-grad)" class="core-halo"/>
        <circle cx="100" cy="100" r="96" class="ring ring-faint"/>
        <g class="spin spin-a"><circle cx="100" cy="100" r="90" class="ring ring-arcs"/></g>
        <g class="spin spin-b"><circle cx="100" cy="100" r="81" class="ring ring-ticks"/></g>
        <g class="spin spin-c"><circle cx="100" cy="100" r="72" class="ring ring-sweep"/></g>
        <circle cx="100" cy="100" r="62" class="ring ring-thin"/>
        <g class="spin spin-d"><circle cx="100" cy="100" r="54" class="ring ring-dots"/></g>
        <circle cx="100" cy="100" r="34" fill="url(#core-heart-grad)" class="core-heart"/>
        <circle cx="100" cy="100" r="7" class="core-center"/>
      </svg>
    </div>`;
}

// Reactor layer inside `host`.
//  - anchor: element to center on (dashboard slot); the layer follows it when cards move
//  - otherwise the layer is centered in the host and fits it (chat background / voice view)
//  - labelEl: status text element; if omitted, the layer gets its own under the rings
function createReactor(host, { anchor = null, labelEl = null, stateTargets = [], reserve = FIT_RESERVE } = {}) {
  const layer = document.createElement("div");
  layer.className = "core-layer";
  layer.innerHTML = layerMarkup() + (labelEl ? "" : `<div class="core-status core-status-inner"><span class="core-dot"></span><span class="core-label">Online</span></div>`);
  host.prepend(layer);

  const canvas = layer.querySelector(".core-particles");
  const label = labelEl || layer.querySelector(".core-label");
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let size = 0, dpr = 1, particles = [];
  let state = null;
  const maxSize = anchor ? LAYER_MAX : (reserve < FIT_RESERVE ? 2000 : LAYER_MAX); // pop-out may fill a big monitor
  let speed = 1;
  let last = { x: NaN, y: NaN, s: NaN, hidden: null };

  function accentRgb() {
    return getComputedStyle(document.documentElement).getPropertyValue("--theme-accent-rgb").trim() || "0,180,216";
  }

  function buildParticles() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const stage = size * STAGE_RATIO;
    const count = Math.round(Math.min(260, Math.max(80, size * 0.35)));
    particles = Array.from({ length: count }, () => {
      const orbit = Math.random() < 0.75;
      return {
        orbit,
        r: orbit ? stage * (0.5 + Math.random() * 0.32) : size * (0.12 + Math.random() * 0.38),
        a: Math.random() * Math.PI * 2,
        v: (orbit ? 0.0015 + Math.random() * 0.004 : 0.0004 + Math.random() * 0.001) * (Math.random() < 0.5 ? -1 : 1),
        size: Math.random() * 1.6 + 0.3,
        tw: Math.random() * Math.PI * 2,
        wobble: Math.random() * 8,
      };
    });
  }

  function place() {
    const ref = anchor || host;
    const hidden = (anchor && anchor.classList.contains("is-min")) || ref.offsetParent === null;
    if (hidden !== last.hidden) {
      layer.style.display = hidden ? "none" : "";
      last.hidden = hidden;
    }
    if (hidden) return;

    const h = host.getBoundingClientRect();
    const r = ref.getBoundingClientRect();
    // Centered mode keeps FIT_RESERVE px free at the bottom for the voice view's bars / "Ver texto"
    const s = anchor
      ? Math.round(Math.min(LAYER_MAX, Math.max(r.width, r.height) * LAYER_SCALE))
      : Math.round(Math.min(maxSize, r.width, r.height - reserve));
    const x = Math.round(r.left - h.left + r.width / 2 - s / 2);
    const y = Math.round(r.top - h.top + (anchor ? r.height / 2 - s / 2 - 12 : (r.height - reserve) / 2 - s / 2 + 8));
    if (x !== last.x || y !== last.y) {
      layer.style.transform = `translate(${x}px, ${y}px)`;
      last.x = x; last.y = y;
    }
    if (s !== last.s && s > 0) {
      layer.style.width = layer.style.height = `${s}px`;
      size = s; last.s = s;
      buildParticles();
    }
  }

  function frame(t) {
    if (!host.isConnected || (anchor && !anchor.isConnected)) { layer.remove(); return; } // re-rendered: stop

    place();
    const st = currentState();
    if (st !== state) {
      state = st;
      [layer, ...stateTargets].forEach((el) => { el.dataset.state = st; });
      label.textContent = STATES[st].label;
    }
    speed += (STATES[st].speed - speed) * 0.05; // ease between states

    if (!last.hidden && size > 0) {
      const rgb = accentRgb();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      for (const p of particles) {
        if (!reduceMotion) p.a += p.v * speed;
        const wob = Math.sin(t / 900 + p.tw) * p.wobble;
        const x = c + Math.cos(p.a) * (p.r + wob);
        const y = c + Math.sin(p.a) * (p.r + wob) * (p.orbit ? 0.92 : 1);
        const alpha = (0.35 + 0.65 * Math.abs(Math.sin(t / 700 + p.tw))) * STATES[st].glow * (p.orbit ? 0.9 : 0.45);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return layer;
}

// Dashboard: reactor behind the frameless slot
export function mountCore(slot) {
  const host = slot.parentElement?.parentElement; // the dashboard container (#welcome)
  if (!host) return;
  host.querySelector(":scope > .core-layer")?.remove();
  createReactor(host, { anchor: slot, labelEl: slot.querySelector(".core-label"), stateTargets: [slot] });

  // Tap the core to talk (a drag doesn't produce a click)
  slot.addEventListener("click", (e) => {
    if (e.target.closest(".hud-resize, [data-action]")) return;
    document.getElementById("mic-btn")?.click();
  });
}

// Conversation: the same reactor as a dim background, fully lit in the voice view (see style.css)
const chatReactorHost = document.getElementById("chat-reactor");
if (chatReactorHost) createReactor(chatReactorHost);

// ----- Pop-out window (widget.html?id=core): reactor only, synced with the main window -----
// The main window broadcasts its <body> state flags; pop-outs mirror them and can ask for the mic.
const channel = "BroadcastChannel" in window ? new BroadcastChannel("jarvis-state") : null;
const STATE_KEYS = ["speaking", "thinking", "listen"];
const isMainWindow = !!document.getElementById("input-form");

function snapshot() {
  return Object.fromEntries(STATE_KEYS.map((k) => [k, document.body.dataset[k] || ""]));
}

if (channel && isMainWindow) {
  new MutationObserver(() => channel.postMessage({ type: "state", state: snapshot() }))
    .observe(document.body, { attributes: true, attributeFilter: STATE_KEYS.map((k) => `data-${k}`) });
  channel.addEventListener("message", (e) => {
    if (e.data?.type === "hello") channel.postMessage({ type: "state", state: snapshot() });
    if (e.data?.type === "mic") document.getElementById("mic-btn")?.click();
  });
}

export function mountStandaloneReactor(host) {
  createReactor(host, { reserve: 40 });

  channel?.addEventListener("message", (e) => {
    if (e.data?.type !== "state") return;
    for (const k of STATE_KEYS) {
      if (e.data.state[k]) document.body.dataset[k] = e.data.state[k];
      else delete document.body.dataset[k];
    }
  });
  channel?.postMessage({ type: "hello" });

  // Tap: talk (mic of the main window). Double-click: real fullscreen on this monitor.
  let clickTimer = null;
  host.addEventListener("click", () => {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => channel?.postMessage({ type: "mic" }), 250);
  });
  host.addEventListener("dblclick", () => {
    clearTimeout(clickTimer);
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
}
