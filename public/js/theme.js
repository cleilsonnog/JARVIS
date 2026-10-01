// ===== Temas =====
const themeBtn = document.getElementById("theme-btn");

const themes = [
  { name: "Jarvis", accent: "#00b4d8", bg: "#04040d", surface: "#0e0e1f" },
  { name: "Iron Man", accent: "#ef4444", bg: "#0a0000", surface: "#1a0505" },
  { name: "Hulk", accent: "#22c55e", bg: "#000a04", surface: "#051a0e" },
  { name: "Thor", accent: "#a78bfa", bg: "#05000a", surface: "#0e051a" },
  { name: "Gold", accent: "#f59e0b", bg: "#0a0800", surface: "#1a1005" },
];

let currentTheme = parseInt(localStorage.getItem("jarvis-theme") || "0");

// Convert hex to RGB for rgba usage
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function applyTheme(index) {
  const t = themes[index];
  const rgb = hexToRgb(t.accent);
  document.documentElement.style.setProperty("--tw-jarvis", t.accent);
  let style = document.getElementById("theme-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "theme-style";
    document.head.appendChild(style);
  }
  style.textContent = `
    :root {
      --theme-accent: ${t.accent};
      --theme-accent-rgb: ${rgb};
      --theme-bg: ${t.bg};
      --theme-surface: ${t.surface};
    }
    body { background: ${t.bg} !important; }
    .bg-dark-600 { background: ${t.bg} !important; }
    .bg-dark-600\\/80 { background: ${t.bg}cc !important; }
    .bg-dark-700 { background: ${t.surface} !important; }
    .bg-dark-300\\/80 { background: ${t.surface}cc !important; }
    .text-jarvis-400, .text-jarvis-500 { color: ${t.accent} !important; }
    .border-jarvis-500, .border-jarvis-500\\/20, .border-jarvis-500\\/30, .border-jarvis-500\\/40, .border-jarvis-500\\/60 { border-color: ${t.accent}40 !important; }
    .bg-jarvis-500 { background: ${t.accent} !important; }
    .bg-jarvis-500\\/5, .bg-jarvis-500\\/10, .bg-jarvis-500\\/20, .bg-jarvis-500\\/30 { background: ${t.accent}15 !important; }
    .animate-pulse-glow { box-shadow: 0 0 12px ${t.accent}80, inset 0 0 8px ${t.accent}50 !important; }
    .bg-jarvis-400 { background: ${t.accent} !important; }
    .bg-jarvis-500\\/80 { background: ${t.accent}cc !important; }

    /* Background effects */
    .bg-grid {
      background-image:
        linear-gradient(rgba(${rgb},0.15) 1px, transparent 1px),
        linear-gradient(90deg, rgba(${rgb},0.15) 1px, transparent 1px) !important;
    }
    .scan-line {
      background: linear-gradient(to right, transparent, rgba(${rgb},0.2), transparent) !important;
    }
    .particle {
      background: rgba(${rgb},0.4) !important;
      box-shadow: 0 0 6px rgba(${rgb},0.3) !important;
    }
    .voice-orb {
      box-shadow: 0 0 30px rgba(${rgb},0.3), inset 0 0 20px rgba(${rgb},0.15) !important;
    }
    .voice-bar {
      background: ${t.accent}cc !important;
    }
    .prose-jarvis strong { color: ${t.accent} !important; }
    .prose-jarvis a { color: ${t.accent} !important; }
    .prose-jarvis blockquote { border-left-color: ${t.accent} !important; }
    .reminder-card { border-color: ${t.accent}50 !important; box-shadow: 0 4px 24px rgba(${rgb},0.1) !important; }
  `;
  localStorage.setItem("jarvis-theme", index);
}

applyTheme(currentTheme);

// Pop-out widget windows have no theme button
themeBtn?.addEventListener("click", () => {
  currentTheme = (currentTheme + 1) % themes.length;
  applyTheme(currentTheme);
});

// Follow theme changes made in other JARVIS windows
window.addEventListener("storage", (e) => {
  if (e.key !== "jarvis-theme") return;
  currentTheme = parseInt(e.newValue || "0");
  applyTheme(currentTheme);
});
