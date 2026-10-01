// ===== Upload de documentos e imagens =====
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const input = document.getElementById("input");
const form = document.getElementById("input-form");

let pendingFileContent = null;

export function getPendingFile() { return pendingFileContent; }
export function clearPendingFile() { pendingFileContent = null; }

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Erro no upload");
    const data = await res.json();
    pendingFileContent = data;

    const existing = document.getElementById("file-badge");
    if (existing) existing.remove();

    const badge = document.createElement("div");
    badge.id = "file-badge";
    badge.className = "flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg bg-jarvis-500/10 border border-jarvis-500/20 text-xs text-jarvis-400";

    if (data.type === "image") {
      badge.innerHTML = `
        <img src="data:${data.mimeType};base64,${data.base64}" class="w-10 h-10 rounded object-cover border border-white/10"/>
        <span>${data.filename}</span>
        <button id="remove-file" class="ml-1 hover:text-red-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>`;
    } else {
      badge.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        <span>${data.filename}</span>
        <button id="remove-file" class="ml-1 hover:text-red-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>`;
    }

    form.parentElement.insertBefore(badge, form);

    badge.querySelector("#remove-file").addEventListener("click", () => {
      pendingFileContent = null;
      badge.remove();
    });

    input.placeholder = data.type === "image" ? "Pergunte sobre a imagem..." : "Pergunte sobre o documento...";
    input.focus();
  } catch (err) {
    console.error("Erro upload:", err);
    alert("Erro ao enviar arquivo.");
  }

  fileInput.value = "";
});

// Drag and drop on chat area
const chatEl = document.getElementById("chat");

chatEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  chatEl.classList.add("ring-2", "ring-jarvis-500/30");
});

chatEl.addEventListener("dragleave", () => {
  chatEl.classList.remove("ring-2", "ring-jarvis-500/30");
});

chatEl.addEventListener("drop", (e) => {
  e.preventDefault();
  chatEl.classList.remove("ring-2", "ring-jarvis-500/30");
  if (e.dataTransfer.files.length > 0) {
    const dt = new DataTransfer();
    dt.items.add(e.dataTransfer.files[0]);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change"));
  }
});
